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
import { dirname } from 'node:path';

import { History } from '../artifact-core/history.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import type { Actor, Lifecycle, Reference, Review, Status } from '../artifact-core/types.js';
import { reviewEntryOf, reviewReference } from '../review/report-log.js';
import type { ReviewReport } from '../review/types.js';
import { artifactJsonPath, writeAtomic } from '../storage.js';

export const FIXTURE_ACTOR: Actor = { id: 'github:fixture', kind: 'person', properties: {} };
const SYSTEM: Actor = { id: 'insrc:system', kind: 'system', properties: {} };

export interface FixtureOptions {
	/** The revision number of the head; also `meta.revision`. Default 1. */
	readonly revision?: number | undefined;
	/** The time of every stamp. Default 2026-01-01T00:00:00.000Z. */
	readonly at?:       string | undefined;
	readonly by?:       Actor | undefined;
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
		...(parts.approval === true ? { approval: { revision, by, at } } : {}),
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
	/** The status of the head. Default pending-review. */
	readonly status?:  Status | undefined;
}

const COUNTS = { pass: { high: 0, med: 0, low: 0 }, warn: { high: 0, med: 1, low: 0 }, block: { high: 1, med: 0, low: 0 } } as const;

/** A head the review has looked at. Pass by default. */
export function reviewedMeta(opts: ReviewFixture = {}): Record<string, unknown> {
	const verdict = opts.verdict ?? 'pass';
	return lifecycleMeta({
		status: opts.status ?? 'pending-review',
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

/** Append the 'review' log entry that holds `report`, and answer the Reference a lifecycle review names it by. */
export async function recordReview(repo: string, artifactId: string, report: ReviewReport, entryId = `fixture-review-${artifactId}`): Promise<Reference> {
	await new History(new FileSidecarStore(repo)).appendLog(artifactId, reviewEntryOf({ id: entryId, actor: SYSTEM, timestamp: report.reviewedAt, report }));
	return reviewReference(artifactId, entryId);
}
