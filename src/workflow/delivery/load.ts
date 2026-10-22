/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Delivery read model — loader (E1 / S001, HLD-2ff0dfda sc1).
 *
 * Reads the artifact store once into an immutable ArtifactRecordSet. Every
 * *.json file becomes exactly one ArtifactRecord or one RecordLoadFailure;
 * a bad file never aborts the load. The only filesystem surface is the
 * read-only ReadonlyStoreFs port, so nothing under the repository is written.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import type { ChangeLogEntry, Feedback } from '../artifact-core/types.js';
import { reviewRecordOf } from '../review/report-log.js';
import { ARTIFACTS_DIR, TESTS_ID_PREFIX } from '../storage.js';
import { asObject, asString, errorText, storyOrdinalOf } from './read.js';
import {
	DeliveryStoreUnreadableError,
	type ApprovalState,
	type ArtifactRecord,
	type ArtifactRecordSet,
	type DeliveryArtifactKind,
	type ReadonlyStoreFs,
	type RecordLoadFailure,
} from './types.js';

const log = getLogger('delivery-load');

/** Every store-file prefix the delivery read model knows. */
export const DELIVERY_ARTIFACT_KINDS: readonly DeliveryArtifactKind[] = ['SPEC', 'DEF', 'HLD', 'LLD', 'PLAN', 'BUILD', 'CR', 'ISSUE', 'EXT', 'AMD'];

/** The node:fs implementation of the read-only store port. */
export const nodeStoreFs: ReadonlyStoreFs = {
	exists:   (path) => existsSync(path),
	realpath: (path) => realpathSync(path),
	listDir:  (path) => readdirSync(path),
	readFile: (path) => readFileSync(path, 'utf8'),
};

/** The kind named by a store file name's prefix, or null for an unknown prefix. */
export function kindOfFile(fileName: string): DeliveryArtifactKind | null {
	const prefix = fileName.split('-')[0] ?? '';
	return (DELIVERY_ARTIFACT_KINDS as readonly string[]).includes(prefix) ? prefix as DeliveryArtifactKind : null;
}

/** The statuses of an artifact that was approved and has moved on or is still approved. */
const APPROVED_STATUSES: readonly string[] = ['approved', 'in-signoff', 'changes-requested', 'signed-off', 'completed'];

/** Approval as the lifecycle records it: the status decides, and the time is that of the approval. A rejection has no time on the head. */
function approvalOf(meta: Readonly<Record<string, unknown>>): ArtifactRecord['approval'] {
	const lifecycle = asObject(meta['lifecycle']);
	const status = lifecycle === null ? null : asString(lifecycle['status']);
	const state: ApprovalState = status !== null && APPROVED_STATUSES.includes(status) ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';
	const approval = lifecycle === null ? null : asObject(lifecycle['approval']);
	return { state, at: state === 'approved' && approval !== null ? asString(approval['at']) : null };
}

/**
 * Lift one parsed store file into an ArtifactRecord from its { meta, body }.
 * Returns a RecordLoadFailure for an unknown prefix or a record without the
 * shape its kind needs.
 */
export function liftStoreFile(fileName: string, parsed: unknown): ArtifactRecord | RecordLoadFailure {
	const kind = kindOfFile(fileName);
	if (kind === null) {
		return { fileName, reason: 'unknown-kind', detail: `no artifact kind for prefix '${fileName.split('-')[0] ?? ''}'` };
	}
	const artifactId = fileName.replace(/\.json$/, '');
	const top = asObject(parsed);
	const meta = top === null ? null : asObject(top['meta']);
	if (top === null || meta === null) return { fileName, reason: 'missing-meta', detail: 'record has no meta object' };
	const storyIdRaw = asString(meta['storyId']);
	const hashKey = kind === 'ISSUE' ? 'issueHash' : kind === 'SPEC' ? 'specHash' : 'epicHash';
	return {
		artifactId, kind,
		workItemHash:  asString(meta[hashKey]),
		storyIdRaw,
		storyOrdinal:  storyIdRaw === null ? null : storyOrdinalOf(storyIdRaw),
		approval:      approvalOf(meta),
		createdAt:     asString(meta['createdAt']),
		epicCreatedAt: asString(meta['epicCreatedAt']),
		meta,
		body:          top['body'],
	};
}

/** The time of the latest 'ack-stale' entry of a log, or undefined. */
export function staleAckedAtOf(entries: readonly ChangeLogEntry[]): string | undefined {
	return [...entries].reverse().find(e => e.operation === 'ack-stale')?.timestamp;
}

/** The report of the review a lifecycle names and the log's latest stale acknowledgement, as a record carries them. */
export function logFactsOf(entries: readonly ChangeLogEntry[], record: ArtifactRecord): Pick<ArtifactRecord, 'reviewReport' | 'staleAckedAt'> {
	const report = asObject(asObject(asObject(record.meta['lifecycle'])?.['review'])?.['report']);
	const loaded = report === null ? undefined : reviewRecordOf(entries, record.artifactId, { report: report as unknown as NonNullable<Parameters<typeof reviewRecordOf>[2]['report']> });
	const ackedAt = staleAckedAtOf(entries);
	return { ...(loaded !== undefined ? { reviewReport: loaded } : {}), ...(ackedAt !== undefined ? { staleAckedAt: ackedAt } : {}) };
}

const FEEDBACK_RECORD_KINDS: ReadonlySet<DeliveryArtifactKind> = new Set(['DEF', 'HLD', 'LLD', 'PLAN']);

/** A line of a feedback file the reader can show: text, an actor, a time, a kind. */
function isReadableFeedback(f: unknown): f is Feedback {
	const o = asObject(f);
	return o !== null && typeof o['id'] === 'string' && typeof o['text'] === 'string' && typeof o['timestamp'] === 'string'
		&& typeof o['kind'] === 'string' && asObject(o['actor']) !== null && typeof asObject(o['actor'])?.['id'] === 'string';
}

/** The readable feedback lines of a feedback file and the number that were not. */
export function feedbackFactsOf(lines: readonly unknown[]): NonNullable<ArtifactRecord['feedback']> {
	const readable = lines.filter(isReadableFeedback);
	return { lines: readable, dropped: lines.length - readable.length };
}

/** The record with what its sidecar adds: the full report of its review, its stale acknowledgement and its feedback. A file that cannot be read leaves the record as it is. */
function withLogFacts(repoPath: string, record: ArtifactRecord): ArtifactRecord {
	const store = new FileSidecarStore(repoPath);
	let out = record;
	// only a record with a review to read, or an LLD (whose staleness can be acknowledged), has a log the snapshot looks at
	if (record.kind === 'LLD' || asObject(asObject(asObject(record.meta['lifecycle'])?.['review'])?.['report']) !== null) {
		try {
			out = { ...out, ...logFactsOf(store.readRecordsSync<ChangeLogEntry>('log', record.artifactId), record) };
		} catch (err) {
			log.debug({ artifactId: record.artifactId, err: errorText(err) }, 'delivery: the log of a record could not be read');
		}
	}
	// feedback is shown for the design records of an item only
	if (FEEDBACK_RECORD_KINDS.has(record.kind)) {
		try {
			const lines = store.readRecordsSync<unknown>('feedback', record.artifactId);
			if (lines.length > 0) out = { ...out, feedback: feedbackFactsOf(lines) };
		} catch (err) {
			log.debug({ artifactId: record.artifactId, err: errorText(err) }, 'delivery: the feedback of a record could not be read');
		}
	}
	return out;
}

function isFailure(r: ArtifactRecord | RecordLoadFailure): r is RecordLoadFailure {
	return 'reason' in r;
}

/** Read the repository's artifact store once into a sorted, immutable record set. */
export function loadArtifactRecordSet(
	repoPath: string,
	fs: ReadonlyStoreFs = nodeStoreFs,
	now: () => string = () => new Date().toISOString(),
): ArtifactRecordSet {
	const dir = join(repoPath, ARTIFACTS_DIR);
	const readAt = now();
	if (!fs.exists(dir)) return { repo: repoPath, readAt, records: [], failures: [] };

	let names: readonly string[];
	try {
		names = fs.listDir(dir);
	} catch (err) {
		throw new DeliveryStoreUnreadableError(dir, errorText(err));
	}

	const records: ArtifactRecord[] = [];
	const failures: RecordLoadFailure[] = [];
	for (const fileName of names) {
		if (!fileName.endsWith('.json')) continue;
		// A Story's test record is the gate's own record of a run, not a delivery
		// artifact: it is neither a record of this model nor a file it failed to load.
		if (fileName.startsWith(TESTS_ID_PREFIX)) continue;
		if (kindOfFile(fileName) === null) {
			failures.push({ fileName, reason: 'unknown-kind', detail: `no artifact kind for prefix '${fileName.split('-')[0] ?? ''}'` });
			continue;
		}
		let text: string;
		try {
			text = fs.readFile(join(dir, fileName));
		} catch (err) {
			failures.push({ fileName, reason: 'unreadable', detail: errorText(err) });
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch (err) {
			failures.push({ fileName, reason: 'invalid-json', detail: errorText(err) });
			continue;
		}
		const lifted = liftStoreFile(fileName, parsed);
		if (isFailure(lifted)) failures.push(lifted);
		else records.push(withLogFacts(repoPath, lifted));
	}

	records.sort((a, b) => a.artifactId.localeCompare(b.artifactId));
	failures.sort((a, b) => a.fileName.localeCompare(b.fileName));
	if (failures.length > 0) log.debug({ repo: repoPath, failures: failures.length }, 'delivery: store files that could not be loaded');
	return { repo: repoPath, readAt, records, failures };
}
