/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The gate pass (E1 s3, sc5): approval and review facts for every record, and
 * task validation, the approved-but-failed conflict and the attention reasons
 * for every epic, story and issue.
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
 * read).
 *
 * A story's task results come from its BUILD records' body.tasks: a task fails
 * when any entry for it failed, passes when any passed, and is otherwise
 * unrecorded; an entry under the story's own id is the story-level result, and an
 * entry that parses as neither is ignored. A pending record stops counting toward
 * Needs attention once a later gate on its item's chain is approved (epic:
 * SPEC < DEF < HLD; story: SPEC < LLD < PLAN < BUILD); a superseded record raises
 * no reason at all, though its own gate still reports it. ISSUE, EXT and AMD
 * records are on no chain and a CR never raises pending-decision. Pure: no I/O,
 * never throws, never reads or changes a stage.
 */

import { reviewerPartyOf } from '../review/party.js';
import { BLOCKING, effectiveReviewVerdict } from '../review/resolve.js';
import type { Finding, ReviewReport } from '../review/types.js';
import type { ReviewResolution } from '../types.js';
import { makeNotice, sortNotices } from './notice.js';
import { asObject, storyOrdinalOf, taskOrdinalOf } from './read.js';
import type {
	ArtifactGate,
	ArtifactRecord,
	ArtifactRecordSet,
	AttentionReason,
	DeliveryArtifactKind,
	DeliveryNotice,
	GatePassResult,
	ItemGates,
	ReviewVerdict,
	TaskResult,
	TaskValidation,
	WorkItemGraph,
	WorkItemNode,
} from './types.js';

type Review = NonNullable<ArtifactGate['review']>;

const VERDICTS: ReadonlySet<string> = new Set<ReviewVerdict>(['pass', 'warn', 'block']);

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
		resolvedFindings = findings.filter(f => BLOCKING.has(f.severity) && resolutions?.[f.claimId] !== undefined).length;
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

// ---------------------------------------------------------------------------
// Item gates
// ---------------------------------------------------------------------------

/** Each item kind's gate chain, earliest first; kinds off the chain are never superseded. */
const CHAINS: Readonly<Partial<Record<WorkItemNode['kind'], readonly DeliveryArtifactKind[]>>> = {
	epic:  ['SPEC', 'DEF', 'HLD'],
	story: ['SPEC', 'LLD', 'PLAN', 'BUILD'],
};

const REASON_ORDER: readonly AttentionReason[] = ['pending-decision', 'rejected', 'review-blocked', 'validation-failed', 'validation-conflict'];

const ATTENTION_RULE = 'A pending record stops counting toward Needs attention once a later gate on the same item is approved '
	+ '(epic: SPEC < DEF < HLD; story: SPEC < LLD < PLAN < BUILD); ISSUE, EXT and AMD records are never superseded.';

/** The first of the ids that parses with the given ordinal reader. */
function firstOrdinal(ids: readonly string[], read: (id: string) => number | null): number | null {
	for (const id of ids) {
		const n = read(id);
		if (n !== null) return n;
	}
	return null;
}

/** A BUILD's body.tasks entries with a string id and a boolean passed. */
function buildEntries(build: ArtifactRecord): { id: string; passed: boolean }[] {
	const tasks = asObject(build.body)?.['tasks'];
	if (!Array.isArray(tasks)) return [];
	const out: { id: string; passed: boolean }[] = [];
	for (const entry of tasks) {
		const o = asObject(entry);
		if (o !== null && typeof o['id'] === 'string' && typeof o['passed'] === 'boolean') out.push({ id: o['id'], passed: o['passed'] });
	}
	return out;
}

/** failed beats passed; no entry is unrecorded. */
function resultOf(passes: readonly boolean[]): TaskResult {
	return passes.includes(false) ? 'failed' : passes.includes(true) ? 'passed' : 'unrecorded';
}

/** Pending evidence records a later approved gate on the item's chain supersedes, sorted. */
function supersededIds(item: WorkItemNode, evidence: readonly ArtifactRecord[]): string[] {
	const chain = CHAINS[item.kind];
	if (chain === undefined) return [];
	const approvedRanks = evidence
		.filter(r => r.approval.state === 'approved' && chain.includes(r.kind))
		.map(r => chain.indexOf(r.kind));
	const latest = Math.max(-1, ...approvedRanks);
	return evidence
		.filter(r => r.approval.state === 'pending' && chain.includes(r.kind) && chain.indexOf(r.kind) < latest)
		.map(r => r.artifactId)
		.sort();
}

interface StoryValidation {
	readonly tasks:            TaskValidation[];
	readonly storyLevelResult: TaskResult | null;
	readonly conflict:         ItemGates['conflict'];
	readonly notices:          DeliveryNotice[];
}

/**
 * Without a PLAN (`hasPlan` false) no task is planned, but none is reported as
 * missing from a plan that does not exist; a route that needs a plan is reported
 * once by the snapshot's incomplete-evidence check (s5).
 */
function storyValidation(
	story: WorkItemNode,
	builds: readonly ArtifactRecord[],
	hasPlan: boolean,
	graph: WorkItemGraph,
): StoryValidation {
	const storyOrdinal = firstOrdinal(story.sourceIds, storyOrdinalOf);
	const planned = new Set(story.plannedTaskIds.map(taskOrdinalOf).filter((n): n is number => n !== null));

	const byTask = new Map<number, { passes: boolean[]; buildIds: Set<string> }>();
	const storyLevel: boolean[] = [];
	for (const build of builds) {
		for (const entry of buildEntries(build)) {
			const taskOrdinal = taskOrdinalOf(entry.id);
			if (taskOrdinal !== null) {
				const slot = byTask.get(taskOrdinal) ?? { passes: [], buildIds: new Set<string>() };
				slot.passes.push(entry.passed);
				slot.buildIds.add(build.artifactId);
				byTask.set(taskOrdinal, slot);
			} else if (storyOrdinal !== null && storyOrdinalOf(entry.id) === storyOrdinal) {
				storyLevel.push(entry.passed);
			}
		}
	}

	const tasks: TaskValidation[] = [];
	const notices: DeliveryNotice[] = [];
	for (const childId of story.childIds) {
		const child = graph.items.get(childId);
		if (child === undefined || child.kind !== 'task') continue;
		const taskOrdinal = firstOrdinal(child.sourceIds, taskOrdinalOf);
		const slot = taskOrdinal === null ? undefined : byTask.get(taskOrdinal);
		const isPlanned = taskOrdinal !== null && planned.has(taskOrdinal);
		tasks.push({ taskItemId: child.id, result: resultOf(slot?.passes ?? []), planned: isPlanned });
		if (!isPlanned && hasPlan) {
			notices.push(makeNotice('unplanned-task',
				`Task ${child.id} has a build result but no planned task in ${story.id}'s plan.`,
				{ itemIds: [child.id, story.id], artifactIds: [...(slot?.buildIds ?? [])] }));
		}
	}
	tasks.sort((a, b) => a.taskItemId.localeCompare(b.taskItemId));

	const storyLevelResult = storyLevel.length === 0 ? null : resultOf(storyLevel);
	const failedTaskItemIds = tasks.filter(t => t.result === 'failed').map(t => t.taskItemId);
	const storyLevelFailed = storyLevelResult === 'failed';
	const approvedBuilds = builds.filter(b => b.approval.state === 'approved').map(b => b.artifactId);
	const conflict = approvedBuilds.length > 0 && (failedTaskItemIds.length > 0 || storyLevelFailed)
		? { failedTaskItemIds, storyLevelFailed }
		: null;
	if (conflict !== null) {
		const failed = [...failedTaskItemIds, ...(storyLevelFailed ? [`${story.id} (story-level result)`] : [])];
		notices.push(makeNotice('validation-conflict',
			`${story.id} has an approved build while ${failed.join(', ')} failed validation.`,
			{ itemIds: [story.id, ...failedTaskItemIds], artifactIds: approvedBuilds }));
	}
	return { tasks, storyLevelResult, conflict, notices };
}

function itemGates(
	item: WorkItemNode,
	graph: WorkItemGraph,
	byId: ReadonlyMap<string, ArtifactRecord>,
	artifacts: ReadonlyMap<string, ArtifactGate>,
): { gates: ItemGates; notices: DeliveryNotice[] } {
	const evidence = item.evidenceArtifactIds
		.map(id => byId.get(id))
		.filter((r): r is ArtifactRecord => r !== undefined);
	const superseded = supersededIds(item, evidence);
	const counted = evidence.filter(r => !superseded.includes(r.artifactId));

	const validation = item.kind === 'story'
		? storyValidation(item, evidence.filter(r => r.kind === 'BUILD').sort((a, b) => a.artifactId.localeCompare(b.artifactId)), evidence.some(r => r.kind === 'PLAN'), graph)
		: { tasks: [], storyLevelResult: null, conflict: null, notices: [] };

	const reasons = new Set<AttentionReason>();
	for (const r of counted) {
		if (r.approval.state === 'pending' && r.kind !== 'CR') reasons.add('pending-decision');
		if (r.approval.state === 'rejected') reasons.add('rejected');
		if (artifacts.get(r.artifactId)?.review?.blocking === true) reasons.add('review-blocked');
	}
	if (validation.tasks.some(t => t.result === 'failed') || validation.storyLevelResult === 'failed') reasons.add('validation-failed');
	if (validation.conflict !== null) reasons.add('validation-conflict');

	const gates: ItemGates = {
		itemId:           item.id,
		tasks:            validation.tasks,
		validation: {
			passed:     validation.tasks.filter(t => t.result === 'passed').length,
			failed:     validation.tasks.filter(t => t.result === 'failed').length,
			unrecorded: validation.tasks.filter(t => t.result === 'unrecorded').length,
			unplanned:  validation.tasks.filter(t => !t.planned).length,
		},
		storyLevelResult: validation.storyLevelResult,
		conflict:         validation.conflict,
		attentionReasons: REASON_ORDER.filter(r => reasons.has(r)),
		attentionRule:    `${ATTENTION_RULE} Excluded here: ${superseded.length === 0 ? 'none' : superseded.join(', ')}.`,
	};
	return { gates, notices: validation.notices };
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

	const items = new Map<string, ItemGates>();
	const notices: DeliveryNotice[] = [];
	for (const item of graph.items.values()) {
		if (item.kind === 'task') continue;
		const out = itemGates(item, graph, byId, artifacts);
		items.set(item.id, out.gates);
		notices.push(...out.notices);
	}

	return { artifacts, items, notices: sortNotices(notices) };
}
