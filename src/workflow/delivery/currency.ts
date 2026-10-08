/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The currency pass (E1 s4, sc6): whether each recorded review is known to still
 * match its record, and each epic's amendments.
 *
 * A review is current or stale only where a recorded field settles it, never from
 * a file time. A review stamped before its record was created is stale. An LLD
 * that is the only one on its story, is not standalone and whose epic's HLD is in
 * the record set is compared with computeHldEffectiveHash over the HLD's runId and
 * the epic's counted amendments, in the order the existing scanner counts them. A
 * PLAN that is the only one on a story with exactly one LLD is compared with that
 * LLD's runId and hldEffectiveHash. Everything else reads unknown: a code review
 * records no content stamp, and a BUILD's timestamps are rewritten on approval.
 *
 * An amendment counts toward the effective HLD exactly as listApprovedAmendments
 * counts it: a well-formed record (isAmendmentRecord) with status 'approved' and
 * a string approvedAt. Pure: no I/O, never throws, adds or removes no work item.
 */

import { isAmendmentRecord } from '../amendments/types.js';
import { computeHldEffectiveHash } from '../artifacts/lld.js';
import { asObject, asString } from './read.js';
import type {
	ArtifactCurrency,
	ArtifactRecord,
	ArtifactRecordSet,
	CurrencyPassResult,
	DeliveryArtifactKind,
	EffectiveAmendment,
	WorkItemGraph,
	WorkItemNode,
} from './types.js';

const VERDICTS: ReadonlySet<string> = new Set(['pass', 'warn', 'block']);

/** What the pass knows across the whole record set. */
interface PassContext {
	readonly graph:           WorkItemGraph;
	readonly byId:            ReadonlyMap<string, ArtifactRecord>;
	/** Item ids holding each artifact as evidence. */
	readonly itemsByEvidence: ReadonlyMap<string, readonly string[]>;
}

function evidenceOf(item: WorkItemNode, ctx: PassContext, kind: DeliveryArtifactKind): ArtifactRecord[] {
	return item.evidenceArtifactIds
		.map(id => ctx.byId.get(id))
		.filter((r): r is ArtifactRecord => r !== undefined && r.kind === kind);
}

/** The story items holding this record. */
function storiesOf(record: ArtifactRecord, ctx: PassContext): WorkItemNode[] {
	return (ctx.itemsByEvidence.get(record.artifactId) ?? [])
		.map(id => ctx.graph.items.get(id))
		.filter((n): n is WorkItemNode => n !== undefined && n.kind === 'story');
}

/** Whether the record carries a review: a recognised meta.review, or a CR's own verdict. */
function hasReview(record: ArtifactRecord): boolean {
	if (record.kind === 'BUILD' || record.kind === 'AMD') return false;
	if (record.kind === 'CR') return VERDICTS.has(asString(asObject(record.body)?.['verdict']) ?? '');
	return VERDICTS.has(asString(asObject(record.meta['review'])?.['verdict']) ?? '');
}

function time(value: string | null): number | null {
	if (value === null) return null;
	const t = Date.parse(value);
	return Number.isNaN(t) ? null : t;
}

function amendmentSuffix(id: string): number {
	const m = /-(\d+)$/.exec(id);
	return m === null ? 0 : Number(m[1]) || 0;
}

/** Whether an AMD counts toward the effective HLD, as listApprovedAmendments counts it. */
function counts(amd: ArtifactRecord): boolean {
	return isAmendmentRecord({ ...amd.meta, amendment: amd.body })
		&& amd.meta['status'] === 'approved'
		&& typeof amd.meta['approvedAt'] === 'string';
}

/** An epic's counted amendments in the scanner's order: numeric suffix, then a stable sort by approvedAt. */
function countedAmendments(epic: WorkItemNode, ctx: PassContext): ArtifactRecord[] {
	return evidenceOf(epic, ctx, 'AMD')
		.filter(counts)
		.sort((a, b) => amendmentSuffix(a.artifactId) - amendmentSuffix(b.artifactId))
		.sort((a, b) => (asString(a.meta['approvedAt']) ?? '').localeCompare(asString(b.meta['approvedAt']) ?? ''));
}

function amendmentOf(amd: ArtifactRecord): EffectiveAmendment {
	const body = asObject(amd.body);
	return {
		amendmentId:  amd.artifactId,
		status:       amd.approval.state,
		type:         asString(body?.['type']),
		storyId:      asString(body?.['storyId']),
		appliesToHld: counts(amd),
	};
}

type Settled = Pick<ArtifactCurrency, 'reviewCurrency' | 'basis'>;

const UNKNOWN: Settled = { reviewCurrency: 'unknown', basis: null };

/** An LLD against its epic's effective HLD; null when the rule does not apply. */
function lldCurrency(lld: ArtifactRecord, ctx: PassContext): Settled | null {
	if (lld.meta['standalone'] === true) return null;
	const stored = asString(lld.meta['hldEffectiveHash']);
	if (stored === null) return null;
	const stories = storiesOf(lld, ctx);
	const story = stories.length === 1 ? stories[0] : undefined;
	if (story === undefined || evidenceOf(story, ctx, 'LLD').length !== 1) return null;
	const epic = story.parentId === null ? undefined : ctx.graph.items.get(story.parentId);
	if (epic === undefined || epic.kind !== 'epic') return null;
	const hlds = evidenceOf(epic, ctx, 'HLD');
	const runId = hlds.length === 1 ? asString(hlds[0]?.meta['runId'] ?? null) : null;
	if (runId === null) return null;

	const counted = countedAmendments(epic, ctx).map(a => a.artifactId);
	const current = computeHldEffectiveHash(runId, counted);
	if (stored === current) {
		return { reviewCurrency: 'current', basis: `hldEffectiveHash matches HLD run ${runId} with amendments [${counted.join(', ')}]` };
	}
	const applied = Array.isArray(lld.meta['hldAmendmentsApplied'])
		? new Set((lld.meta['hldAmendmentsApplied'] as unknown[]).filter((x): x is string => typeof x === 'string'))
		: new Set<string>();
	const missing = counted.find(id => !applied.has(id));
	let basis = asString(lld.meta['hldBaseRunId']) !== runId
		? `hld-rerun: hldBaseRunId differs from HLD run ${runId}`
		: missing !== undefined
			? `amendment ${missing} is not in hldAmendmentsApplied`
			: 'hldEffectiveHash differs from the recomputed effective HLD hash; no amendment identified';
	const ackedAt = asString(lld.meta['staleAckedAt']);
	if (ackedAt !== null) basis += `; staleness acknowledged at ${ackedAt}`;
	return { reviewCurrency: 'stale', basis };
}

/** A PLAN against its story's one LLD; null when the rule does not apply. */
function planCurrency(plan: ArtifactRecord, ctx: PassContext): Settled | null {
	const stories = storiesOf(plan, ctx);
	const story = stories.length === 1 ? stories[0] : undefined;
	if (story === undefined || evidenceOf(story, ctx, 'PLAN').length !== 1) return null;
	const llds = evidenceOf(story, ctx, 'LLD');
	const lld = llds.length === 1 ? llds[0] : undefined;
	if (lld === undefined) return null;
	const pairs: readonly [string, string | null, string | null][] = [
		['lldRunId', asString(plan.meta['lldRunId']), asString(lld.meta['runId'])],
		['lldEffectiveHash', asString(plan.meta['lldEffectiveHash']), asString(lld.meta['hldEffectiveHash'])],
	];
	if (pairs.some(([, mine, theirs]) => mine === null || theirs === null)) return null;
	const differing = pairs.filter(([, mine, theirs]) => mine !== theirs).map(([field]) => field);
	return differing.length === 0
		? { reviewCurrency: 'current', basis: `lldRunId and lldEffectiveHash match ${lld.artifactId}` }
		: { reviewCurrency: 'stale', basis: `${differing.join(' and ')} differ from ${lld.artifactId}` };
}

function currencyOf(record: ArtifactRecord, ctx: PassContext): ArtifactCurrency {
	const artifactId = record.artifactId;
	if (!hasReview(record)) return { artifactId, reviewCurrency: null, basis: null };

	if (record.kind !== 'CR') {
		const reviewedAt = asString(asObject(record.meta['review'])?.['reviewedAt']);
		const reviewed = time(reviewedAt);
		const created = time(record.createdAt);
		if (reviewed !== null && created !== null && reviewed < created) {
			return { artifactId, reviewCurrency: 'stale', basis: `review reviewedAt ${reviewedAt} precedes createdAt ${record.createdAt}` };
		}
	}
	const settled = record.kind === 'LLD' ? lldCurrency(record, ctx)
		: record.kind === 'PLAN' ? planCurrency(record, ctx)
		: null;
	return { artifactId, ...(settled ?? UNKNOWN) };
}

/** The currency pass over one record set and its graph. */
export function deriveCurrency(graph: WorkItemGraph, recordSet: ArtifactRecordSet): CurrencyPassResult {
	const byId = new Map(recordSet.records.map(r => [r.artifactId, r] as const));
	const itemsByEvidence = new Map<string, string[]>();
	for (const item of graph.items.values()) {
		for (const id of item.evidenceArtifactIds) {
			const list = itemsByEvidence.get(id);
			if (list === undefined) itemsByEvidence.set(id, [item.id]);
			else list.push(item.id);
		}
	}
	const ctx: PassContext = { graph, byId, itemsByEvidence };

	const artifacts = new Map<string, ArtifactCurrency>();
	for (const record of recordSet.records) artifacts.set(record.artifactId, currencyOf(record, ctx));

	const amendments = new Map<string, readonly EffectiveAmendment[]>();
	for (const item of graph.items.values()) {
		if (item.kind !== 'epic') continue;
		const list = evidenceOf(item, ctx, 'AMD').map(amendmentOf).sort((a, b) => a.amendmentId.localeCompare(b.amendmentId));
		if (list.length > 0) amendments.set(item.id, list);
	}

	return { artifacts, amendments, notices: [] };
}
