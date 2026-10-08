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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { ARTIFACTS_DIR } from '../storage.js';
import { asObject, asString, storyOrdinalOf } from './read.js';
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

const KINDS: readonly DeliveryArtifactKind[] = ['SPEC', 'DEF', 'HLD', 'LLD', 'PLAN', 'BUILD', 'CR', 'ISSUE', 'EXT', 'AMD'];

/** The node:fs implementation of the read-only store port. */
export const nodeStoreFs: ReadonlyStoreFs = {
	exists:   (path) => existsSync(path),
	listDir:  (path) => readdirSync(path),
	readFile: (path) => readFileSync(path, 'utf8'),
};

/** The kind named by a store file name's prefix, or null for an unknown prefix. */
export function kindOfFile(fileName: string): DeliveryArtifactKind | null {
	const prefix = fileName.split('-')[0] ?? '';
	return (KINDS as readonly string[]).includes(prefix) ? prefix as DeliveryArtifactKind : null;
}

function approvalOf(fields: Readonly<Record<string, unknown>>): ArtifactRecord['approval'] {
	const approvedAt = asString(fields['approvedAt']);
	const rejectedAt = asString(fields['rejectedAt']);
	const status = asString(fields['status']);
	const state: ApprovalState = approvedAt !== null || status === 'approved' ? 'approved'
		: rejectedAt !== null || status === 'rejected' ? 'rejected'
		: 'pending';
	return { state, approvedAt, rejectedAt };
}

/**
 * Lift one parsed store file into an ArtifactRecord: an AMD from its flat
 * shape, every other kind from { meta, body }. Returns a RecordLoadFailure
 * for an unknown prefix or a record without the shape its kind needs.
 */
export function liftStoreFile(fileName: string, parsed: unknown): ArtifactRecord | RecordLoadFailure {
	const kind = kindOfFile(fileName);
	if (kind === null) {
		return { fileName, reason: 'unknown-kind', detail: `no artifact kind for prefix '${fileName.split('-')[0] ?? ''}'` };
	}
	const artifactId = fileName.replace(/\.json$/, '');
	const top = asObject(parsed);
	if (kind === 'AMD') {
		if (top === null) return { fileName, reason: 'missing-meta', detail: 'amendment record is not an object' };
		const { amendment, ...meta } = top;
		return {
			artifactId, kind,
			workItemHash:  asString(top['epicHash']),
			storyIdRaw:    null,
			storyOrdinal:  null,
			approval:      approvalOf(top),
			createdAt:     asString(top['proposedAt']),
			epicCreatedAt: null,
			meta,
			body:          amendment,
		};
	}
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

function isFailure(r: ArtifactRecord | RecordLoadFailure): r is RecordLoadFailure {
	return 'reason' in r;
}

function errorText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
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
		else records.push(lifted);
	}

	records.sort((a, b) => a.artifactId.localeCompare(b.artifactId));
	failures.sort((a, b) => a.fileName.localeCompare(b.fileName));
	if (failures.length > 0) log.debug({ repo: repoPath, failures: failures.length }, 'delivery: store files that could not be loaded');
	return { repo: repoPath, readAt, records, failures };
}
