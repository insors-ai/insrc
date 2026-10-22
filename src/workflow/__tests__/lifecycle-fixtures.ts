/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test fixtures for a head in the state the lifecycle describes (s9). A test that needs an approved, rejected, stale, reviewed or
 * blocked head spreads one of these into the head's `meta`; none of them stamps `meta.approvedAt`, `rejectedAt`, `rejectReason`,
 * `staleAckedAt`, `reviewOverride`, `review` or `reviewResolutions`, which only the conversion reads.
 *
 *   meta: { workflow: 'define', epicHash, createdAt, ...approvedMeta(AT) }
 *
 * `contentHash` is left empty, which the integrity checks accept (there is nothing to compare), so a fixture needs no body to
 * be hashed. `recordReview` appends the review entry that a lifecycle review's report Reference names, for a test that reads the
 * report back.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { convertLegacyFeedback } from '../artifact-core/feedback-convert.js';
import { History } from '../artifact-core/history.js';
import { appendSidecarLine } from '../artifact-core/sidecar.js';
import { flatToHead } from '../convert/amendments.js';
import { backfillHead } from '../convert/backfill.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import { compareEntries } from '../artifact-core/sidecar-store.js';
import type { Actor, ChangeLogEntry, Feedback, Lifecycle, Reference, Review, Status } from '../artifact-core/types.js';
import { reviewEntryOf, reviewReference } from '../review/report-log.js';
import type { ReviewReport } from '../review/types.js';
import { ARTIFACTS_DIR, artifactJsonPath, writeAtomic } from '../storage.js';

export const FIXTURE_ACTOR: Actor = { id: 'github:fixture', kind: 'person', properties: {} };
const SYSTEM: Actor = { id: 'insrc:system', kind: 'system', properties: {} };
const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };

export interface FixtureOptions {
	/** The revision number of the head; also `meta.revision`. Default 1. */
	readonly revision?: number | undefined;
	/** The time of every stamp. Default 2026-01-01T00:00:00.000Z. */
	readonly at?:       string | undefined;
	readonly by?:       Actor | undefined;
	/** For an approval over a blocking review: the reason it was given. */
	readonly override?: string | undefined;
}

const AT = '2026-01-01T00:00:00.000Z';

interface Parts {
	readonly status:    Status;
	readonly approval?: boolean;
	readonly review?:   Pick<Review, 'verdict' | 'counts' | 'party' | 'reviewer'> & { readonly report?: Reference | undefined };
	readonly stale?:    { readonly upstream: Reference; readonly upstreamRevision: number };
}

/** `{ revision, envelope, lifecycle }`: what a head carries instead of the legacy stamps. */
export function lifecycleMeta(parts: Parts, opts: FixtureOptions = {}): Record<string, unknown> {
	const revision = opts.revision ?? 1;
	const at = opts.at ?? AT;
	const by = opts.by ?? FIXTURE_ACTOR;
	const lifecycle: Lifecycle = {
		status: parts.status,
		revision: { number: revision, contentHash: '', at, by: SYSTEM },
		...(parts.approval === true ? { approval: { revision, by, at, ...(opts.override !== undefined ? { override: { reason: opts.override } } : {}) } } : {}),
		...(parts.review !== undefined ? { review: { revision, reviewer: parts.review.reviewer, party: parts.review.party, verdict: parts.review.verdict, counts: parts.review.counts, at, ...(parts.review.report !== undefined ? { report: parts.review.report } : {}) } } : {}),
		signoffs: [],
		...(parts.stale !== undefined ? { stale: { upstream: parts.stale.upstream, upstreamRevision: parts.stale.upstreamRevision, since: at } } : {}),
	};
	return { revision, envelope: { description: '', references: [], attachments: [] }, lifecycle };
}

/** An approved head. */
export const approvedMeta = (opts: FixtureOptions = {}): Record<string, unknown> => lifecycleMeta({ status: 'approved', approval: true }, opts);

/** A rejected head. */
export const rejectedMeta = (opts: FixtureOptions = {}): Record<string, unknown> => lifecycleMeta({ status: 'rejected' }, opts);

/** A head that is not decided yet: a draft. */
export const draftMeta = (opts: FixtureOptions = {}): Record<string, unknown> => lifecycleMeta({ status: 'draft' }, opts);

/** An approved head whose upstream moved on after it was approved. */
export const staleMeta = (upstream: string, opts: FixtureOptions & { readonly upstreamRevision?: number | undefined } = {}): Record<string, unknown> =>
	lifecycleMeta({ status: 'approved', approval: true, stale: { upstream: { entityId: upstream, type: upstream.split('-')[0] ?? 'DEF', relation: 'derived-from' }, upstreamRevision: opts.upstreamRevision ?? 2 } }, opts);

export interface ReviewFixture extends FixtureOptions {
	readonly verdict?: Review['verdict'] | undefined;
	readonly counts?:  Review['counts'] | undefined;
	readonly party?:   Review['party'] | undefined;
	/** The Reference to the review entry (see {@link recordReview}); none by default. */
	readonly report?:  Reference | undefined;
	/** The status of the head. Default draft: a review leaves the head a draft. */
	readonly status?:  Status | undefined;
}

const COUNTS = { pass: { high: 0, med: 0, low: 0 }, warn: { high: 0, med: 1, low: 0 }, block: { high: 1, med: 0, low: 0 } } as const;

/** A head the review has looked at. Pass by default. */
export function reviewedMeta(opts: ReviewFixture = {}): Record<string, unknown> {
	const verdict = opts.verdict ?? 'pass';
	return lifecycleMeta({
		status: opts.status ?? 'draft',
		...(opts.status === 'approved' ? { approval: true } : {}),
		review: { verdict, counts: opts.counts ?? COUNTS[verdict], party: opts.party ?? 'daemon', reviewer: { id: 'insrc:daemon', kind: 'agent', properties: {} }, report: opts.report },
	}, opts);
}

/** A head whose review blocks it: one HIGH finding. */
export const blockedMeta = (opts: ReviewFixture = {}): Record<string, unknown> => reviewedMeta({ ...opts, verdict: 'block' });

/** Write a head into the repository's artifact store. */
export function writeHead(repo: string, artifactId: string, head: { readonly meta: Record<string, unknown>; readonly body?: unknown; readonly citations?: unknown }): void {
	const path = artifactJsonPath(repo, artifactId);
	mkdirSync(dirname(path), { recursive: true });
	writeAtomic(path, JSON.stringify({ meta: head.meta, body: head.body ?? {}, citations: head.citations ?? [] }, null, 2) + '\n');
}

/** {@link recordReview} for a test that cannot wait: appends the entry at once. */
export function recordReviewSync(repo: string, artifactId: string, report: ReviewReport, entryId = `fixture-review-${artifactId}`): Reference {
	const files = new FileSidecarStore(repo).filesOf(artifactId);
	appendSidecarLine(join(repo, files.log), { artifactId, entry: reviewEntryOf({ id: entryId, actor: SYSTEM, timestamp: report.reviewedAt, report }) });
	return reviewReference(artifactId, entryId);
}

/** Append the 'review' log entry that holds `report`, and answer the Reference a lifecycle review names it by. */
export async function recordReview(repo: string, artifactId: string, report: ReviewReport, entryId = `fixture-review-${artifactId}`): Promise<Reference> {
	return recordReviewSync(repo, artifactId, report, entryId);
}

/**
 * Write a head whose lifecycle review names the entry that holds `report`, and answer the head's path. The head is pending review at
 * the report's verdict, or approved when `approved` is set.
 */
export function writeReviewedHead(repo: string, artifactId: string, head: { readonly meta?: Record<string, unknown>; readonly body?: unknown; readonly report: ReviewReport; readonly approved?: boolean | undefined }): string {
	const report = recordReviewSync(repo, artifactId, head.report);
	const state = reviewedMeta({ verdict: head.report.verdict, report, ...(head.approved === true ? { status: 'approved' as const } : {}) });
	writeHead(repo, artifactId, { meta: { ...(head.meta ?? {}), ...state }, body: head.body ?? {} });
	return artifactJsonPath(repo, artifactId);
}

export interface LifecycleFile {
	/** The file as the lifecycle model stores it; the input unchanged when the conversion cannot read it. */
	readonly file:    unknown;
	/** The log entries the conversion records for it (the review entry among them), in the order a reader gives them. */
	readonly entries: readonly ChangeLogEntry[];
}

/**
 * A store file written in the vocabulary of the legacy stamps (`meta.approvedAt`, `rejectedAt`, a flat amendment) as the file
 * the lifecycle model stores for it, mapped by the conversion's own functions, with the log entries that go with it. For a
 * fixture whose captured data predates the model (the delivery tests' real store files). A file that is not a head, or that
 * the conversion cannot read, comes back unchanged with no entries, so a test of a load failure still sees one.
 */
export function lifecycleFileOf(fileName: string, raw: unknown, now = '2026-10-07T00:00:00.000Z'): LifecycleFile {
	const unchanged: LifecycleFile = { file: raw, entries: [] };
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return unchanged;
	const artifactId = fileName.replace(/\.json$/, '');
	let json = raw as Record<string, unknown>;
	if (artifactId.startsWith('AMD-') && (typeof json['meta'] !== 'object' || json['meta'] === null)) {
		const proposedAt = typeof json['proposedAt'] === 'string' ? json['proposedAt'] : undefined;
		const out = flatToHead(json, proposedAt);
		if ('problem' in out) return unchanged;
		json = out.head;
	}
	if (typeof json['meta'] !== 'object' || json['meta'] === null || typeof json['body'] !== 'object' || json['body'] === null) return unchanged;
	try {
		const { converted } = backfillHead({ head: { artifactId, json }, hasLog: false, now, actor: MIGRATION });
		return { file: JSON.parse(converted.bytes), entries: [...converted.entries].sort(compareEntries) };
	} catch { return unchanged; }
}

/** {@link lifecycleFileOf} without the entries. */
export const asLifecycleFile = (fileName: string, raw: unknown, now?: string): unknown => lifecycleFileOf(fileName, raw, now).file;

/** The feedback lines of a store file written before the sidecar, as the conversion maps its `body.feedback`; an entry the conversion cannot use is counted as dropped. */
export function legacyFeedbackLines(raw: unknown): { readonly lines: readonly Feedback[]; readonly dropped: number } {
	const list = (raw as { body?: { feedback?: unknown } } | null)?.body?.feedback;
	if (!Array.isArray(list)) return { lines: [], dropped: 0 };
	const lines: Feedback[] = [];
	for (const e of list as unknown[]) {
		const o = e as { id?: unknown; author?: unknown; timestamp?: unknown; comment?: unknown; target?: { file?: unknown } } | null;
		if (typeof o !== 'object' || o === null || typeof o.id !== 'string' || typeof o.author !== 'string' || typeof o.timestamp !== 'string'
			|| typeof o.comment !== 'string' || typeof o.target?.file !== 'string') continue;
		lines.push(convertLegacyFeedback(o as unknown as Parameters<typeof convertLegacyFeedback>[0]).feedback);
	}
	return { lines, dropped: list.length - lines.length };
}

/**
 * Write a store file written in the vocabulary of the legacy stamps as the lifecycle model stores it: the head, the log entries the
 * conversion records for it and the feedback lines of its `body.feedback`. For a test that loads a temporary store from disk.
 * A file that is not a head is written as it is.
 */
export function writeLifecycleStoreFile(repo: string, fileName: string, raw: unknown): void {
	const { file, entries } = lifecycleFileOf(fileName, raw);
	const path = join(repo, ARTIFACTS_DIR, fileName);
	writeAtomic(path, typeof file === 'string' ? file : JSON.stringify(file, null, 2));
	const artifactId = fileName.replace(/\.json$/, '');
	try {
		const files = new FileSidecarStore(repo).filesOf(artifactId);
		for (const entry of entries) appendSidecarLine(join(repo, files.log), { artifactId, entry });
		for (const entry of legacyFeedbackLines(raw).lines) appendSidecarLine(join(repo, files.feedback), { artifactId, entry });
	} catch { /* an id the model refuses has no sidecar */ }
}
