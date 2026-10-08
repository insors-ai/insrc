/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The gate pass (E1 s3, sc5): approval and review facts for every record.
 *
 * Approval comes from ArtifactRecord.approval. A design artifact's review is its
 * meta.review: malformed findings are dropped before effectiveReviewVerdict sees
 * them, so a block whose HIGH/MED findings are all resolved is effectively 'pass'
 * and a 'warn' carrying an unresolved MED is effectively 'block', as the approval
 * gate reads it. A CR record is itself a review (body.verdict, body.counts). The
 * reviewer party is read through reviewerPartyOf.
 *
 * A review blocks while its effective verdict is 'block', the gate it guards is
 * unapproved and no override is recorded. A design artifact guards itself; a CR
 * guards its story's BUILD, so its own approval stamp is reported but never lifts
 * its block, and it is reported whatever codeReview.enforce says (no config is
 * read). Pure: no I/O, never throws, never reads or changes a stage.
 */

import { reviewerPartyOf } from '../review/party.js';
import { effectiveReviewVerdict } from '../review/resolve.js';
import type { Finding, ReviewReport } from '../review/types.js';
import type { ReviewResolution } from '../types.js';
import type {
	ArtifactGate,
	ArtifactRecord,
	ArtifactRecordSet,
	GatePassResult,
	ReviewVerdict,
	WorkItemGraph,
} from './types.js';

type Review = NonNullable<ArtifactGate['review']>;

const VERDICTS: ReadonlySet<string> = new Set<ReviewVerdict>(['pass', 'warn', 'block']);
const BLOCKING_SEVERITIES: ReadonlySet<string> = new Set(['HIGH', 'MED']);

function asObject(value: unknown): Readonly<Record<string, unknown>> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asVerdict(value: unknown): ReviewVerdict | null {
	return typeof value === 'string' && VERDICTS.has(value) ? value as ReviewVerdict : null;
}

/** Each of high / med / low, a non-number reading 0. */
function countsOf(value: unknown): Review['counts'] {
	const o = asObject(value);
	const n = (key: string): number => {
		const v = o?.[key];
		return typeof v === 'number' && Number.isFinite(v) ? v : 0;
	};
	return { high: n('high'), med: n('med'), low: n('low') };
}

/** meta.reviewOverride when its reason is a string. */
function overrideOf(meta: Readonly<Record<string, unknown>>): Review['override'] {
	const o = asObject(meta['reviewOverride']);
	if (o === null || typeof o['reason'] !== 'string') return null;
	return { reason: o['reason'], at: typeof o['at'] === 'string' ? o['at'] : null };
}

function partyOf(review: unknown): Review['reviewedBy'] {
	const party = reviewerPartyOf(review);
	return party === 'unknown' ? null : party;
}

/** Findings that are plain objects with a string claimId and severity. */
function wellFormedFindings(value: unknown): Finding[] | null {
	if (!Array.isArray(value)) return null;
	return value.filter((f): f is Finding => {
		const o = asObject(f);
		return o !== null && typeof o['claimId'] === 'string' && typeof o['severity'] === 'string';
	});
}

function approvalOf(record: ArtifactRecord): ArtifactGate['approval'] {
	const { state, approvedAt, rejectedAt } = record.approval;
	return { state, at: state === 'approved' ? approvedAt : state === 'rejected' ? rejectedAt : null };
}

/** A design artifact's review, read from meta.review; blocking is set by the caller. */
function designReview(record: ArtifactRecord): Omit<Review, 'blocking'> | null {
	const review = asObject(record.meta['review']);
	if (review === null) return null;
	const verdict = asVerdict(review['verdict']);
	if (verdict === null) return null;

	const resolutionsRaw = asObject(record.meta['reviewResolutions']);
	const resolutions = resolutionsRaw as Readonly<Record<string, ReviewResolution>> | null;
	const findings = wellFormedFindings(review['findings']);

	let effectiveVerdict = verdict;
	let resolvedFindings = 0;
	if (findings !== null) {
		const report = { ...review, findings } as unknown as ReviewReport;
		const effective = effectiveReviewVerdict(report, resolutions ?? undefined);
		if (effective === 'block') effectiveVerdict = 'block';
		else if (verdict === 'block') effectiveVerdict = 'pass';
		resolvedFindings = findings.filter(f => BLOCKING_SEVERITIES.has(f.severity) && resolutions?.[f.claimId] !== undefined).length;
	}

	return {
		verdict,
		reviewedAt: typeof review['reviewedAt'] === 'string' ? review['reviewedAt'] : record.createdAt ?? '',
		reviewedBy: partyOf(review),
		counts:     countsOf(review['counts']),
		override:   overrideOf(record.meta),
		resolvedFindings,
		effectiveVerdict,
	};
}

/** A CR record's own review (body.verdict / body.counts); blocking is set by the caller. */
function codeReview(record: ArtifactRecord, builds: readonly ArtifactRecord[]): Omit<Review, 'blocking'> | null {
	const body = asObject(record.body);
	const verdict = asVerdict(body?.['verdict']);
	if (verdict === null) return null;
	const override = overrideOf(record.meta) ?? builds.map(b => overrideOf(b.meta)).find(o => o !== null) ?? null;
	return {
		verdict,
		reviewedAt:       record.createdAt ?? '',
		reviewedBy:       partyOf(record.meta),
		counts:           countsOf(body?.['counts']),
		override,
		resolvedFindings: 0,
		effectiveVerdict: verdict,
	};
}

/** BUILD records that are evidence of an item holding this record (its story's builds), sorted by id. */
function storyBuilds(
	artifactId: string,
	itemsByEvidence: ReadonlyMap<string, readonly string[]>,
	graph: WorkItemGraph,
	byId: ReadonlyMap<string, ArtifactRecord>,
): ArtifactRecord[] {
	const ids = new Set<string>();
	for (const itemId of itemsByEvidence.get(artifactId) ?? []) {
		for (const evidenceId of graph.items.get(itemId)?.evidenceArtifactIds ?? []) {
			if (byId.get(evidenceId)?.kind === 'BUILD') ids.add(evidenceId);
		}
	}
	return [...ids].sort().map(id => byId.get(id) as ArtifactRecord);
}

function artifactGate(
	record: ArtifactRecord,
	itemsByEvidence: ReadonlyMap<string, readonly string[]>,
	graph: WorkItemGraph,
	byId: ReadonlyMap<string, ArtifactRecord>,
): ArtifactGate {
	const approval = approvalOf(record);
	if (record.kind === 'BUILD' || record.kind === 'AMD') return { artifactId: record.artifactId, approval, review: null };

	if (record.kind === 'CR') {
		const builds = storyBuilds(record.artifactId, itemsByEvidence, graph, byId);
		const review = codeReview(record, builds);
		if (review === null) return { artifactId: record.artifactId, approval, review: null };
		const guardApproved = builds.some(b => b.approval.state === 'approved');
		const blocking = review.effectiveVerdict === 'block' && !guardApproved && review.override === null;
		return { artifactId: record.artifactId, approval, review: { ...review, blocking } };
	}

	const review = designReview(record);
	if (review === null) return { artifactId: record.artifactId, approval, review: null };
	const blocking = review.effectiveVerdict === 'block' && record.approval.state !== 'approved' && review.override === null;
	return { artifactId: record.artifactId, approval, review: { ...review, blocking } };
}

/** The gate pass over one record set and its graph. */
export function deriveGates(graph: WorkItemGraph, recordSet: ArtifactRecordSet): GatePassResult {
	const byId = new Map(recordSet.records.map(r => [r.artifactId, r] as const));

	const itemsByEvidence = new Map<string, string[]>();
	for (const item of graph.items.values()) {
		for (const id of item.evidenceArtifactIds) {
			const list = itemsByEvidence.get(id);
			if (list === undefined) itemsByEvidence.set(id, [item.id]);
			else list.push(item.id);
		}
	}

	const artifacts = new Map<string, ArtifactGate>();
	for (const record of recordSet.records) {
		artifacts.set(record.artifactId, artifactGate(record, itemsByEvidence, graph, byId));
	}

	return { artifacts, items: new Map(), notices: [] };
}
