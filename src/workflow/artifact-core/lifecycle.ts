/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The lifecycle rules (sc4, owned by s3): the closed transition table, the content hash, the
 * revision and draft fall-back, and the integrity check. Pure: no disk, no clock except where a
 * caller passes none to `transition`.
 */

import { createHash } from 'node:crypto';

import { ArtifactIds, InvalidArtifactKeyError } from '../artifact-ids.js';
import { IllegalTransitionError, ReviewRequiredError, TerminalArtifactError, UnreadableChildError } from './types.js';
import type {
	Actor, Approval, Artifact, ChangeLogEntry, IntegrityReason, Lifecycle, Operation, Reference, Review, Signoff, Staleness, Status,
} from './types.js';

// ---------------------------------------------------------------------------
// The closed table
// ---------------------------------------------------------------------------

export type LifecycleOperation =
	| 'request-review' | 'review' | 'approve' | 'reject' | 'open-signoff' | 'signoff-changes' | 'signed-off'
	| 'complete' | 'reopen' | 'withdraw' | 'supersede' | 'mark-stale' | 'ack-stale';

export interface Step {
	readonly from: readonly Status[];
	/** The status the step lands on; 'same' leaves it where it is. */
	readonly to:   Status | 'same';
}

/** Statuses a unit can still leave by the ordinary operations. */
export const TERMINAL: readonly Status[] = ['completed', 'withdrawn', 'superseded'];
const NON_TERMINAL: readonly Status[] = ['draft', 'pending-review', 'approved', 'in-signoff', 'changes-requested', 'signed-off', 'rejected'];

export const LIFECYCLE_TABLE: Readonly<Record<LifecycleOperation, Step>> = Object.freeze({
	'request-review':  { from: ['draft'], to: 'pending-review' },
	'review':          { from: ['draft', 'pending-review'], to: 'draft' },
	'approve':         { from: ['draft'], to: 'approved' },
	'reject':          { from: ['draft', 'approved', 'in-signoff'], to: 'rejected' },
	'open-signoff':    { from: ['approved'], to: 'in-signoff' },
	'signoff-changes': { from: ['in-signoff'], to: 'changes-requested' },
	'signed-off':      { from: ['in-signoff'], to: 'signed-off' },
	'complete':        { from: ['approved', 'signed-off'], to: 'completed' },
	'reopen':          { from: ['completed'], to: 'draft' },
	'withdraw':        { from: NON_TERMINAL, to: 'withdrawn' },
	'supersede':       { from: NON_TERMINAL, to: 'superseded' },
	'mark-stale':      { from: NON_TERMINAL, to: 'same' },
	'ack-stale':       { from: NON_TERMINAL, to: 'same' },
});

export const LIFECYCLE_OPERATIONS = Object.keys(LIFECYCLE_TABLE) as readonly LifecycleOperation[];

export function isLifecycleOperation(op: string): op is LifecycleOperation {
	return Object.prototype.hasOwnProperty.call(LIFECYCLE_TABLE, op);
}

/**
 * Throws IllegalTransitionError unless `from` to `to` is a step of the closed table. With `op` the step is that
 * operation's; without it any operation that makes the step will do. `cascade` lets `complete` start from any
 * non-terminal status (a unit's completion freezes its dependent records).
 */
export function assertLegalStatusChange(from: Status, to: Status, op?: Operation, cascade = false): void {
	if (op !== undefined) {
		if (!isLifecycleOperation(op)) throw new IllegalTransitionError(`'${op}' is not a lifecycle operation`);
		const step = LIFECYCLE_TABLE[op];
		const fromOk = step.from.includes(from) || (cascade && op === 'complete' && NON_TERMINAL.includes(from));
		const target = step.to === 'same' ? from : step.to;
		if (!fromOk || target !== to) throw new IllegalTransitionError(`${op} cannot take an artifact from ${from} to ${to}`);
		return;
	}
	if (from === to) return;
	const reachable = LIFECYCLE_OPERATIONS.some(o => {
		const step = LIFECYCLE_TABLE[o];
		return step.to === to && (step.from.includes(from) || (cascade && o === 'complete' && NON_TERMINAL.includes(from)));
	});
	if (!reachable) throw new IllegalTransitionError(`no lifecycle operation takes an artifact from ${from} to ${to}`);
}

// ---------------------------------------------------------------------------
// Content hash
// ---------------------------------------------------------------------------

function sortKeys(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(sortKeys);
	if (typeof v === 'object' && v !== null) {
		// fromEntries defines own properties, so a JSON-owned '__proto__' key survives
		return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys((v as Record<string, unknown>)[k])]));
	}
	return v;
}

/** Canonical JSON: the persisted form (so toJSON values count as what they persist as), keys sorted, undefined dropped. */
function canonicalJson(v: unknown): string {
	const persisted = JSON.stringify(v);
	return JSON.stringify(sortKeys(persisted === undefined ? null : JSON.parse(persisted)));
}

/** sha-256 hex of the canonical JSON of {description, body, citations}: what a revision covers. */
export function contentHash(description: string, payload: { readonly body: unknown; readonly citations: unknown }): string {
	return createHash('sha256').update(canonicalJson({ description, body: payload.body, citations: payload.citations })).digest('hex');
}

/** The part of a head the lifecycle rules read. */
export interface ContentView {
	readonly description: string;
	readonly payload:     { readonly body: unknown; readonly citations: unknown };
	readonly lifecycle:   Lifecycle;
}

const hashOf = (v: ContentView): string => contentHash(v.description, v.payload);

// ---------------------------------------------------------------------------
// Integrity
// ---------------------------------------------------------------------------

export type Integrity = { readonly ok: true } | { readonly ok: false; readonly reason: IntegrityReason };

/** The part of the integrity check that needs no history: the stored hash against the head's own content. */
export function checkHeadIntegrity(a: ContentView): Integrity {
	const stored = a.lifecycle.revision.contentHash;
	return stored !== '' && stored !== hashOf(a) ? { ok: false, reason: 'hash-mismatch' } : { ok: true };
}

/**
 * Head against log: `logTail` is the last change log entry that carries a revision. An empty stored hash has
 * nothing to compare; a log with no revision-bearing entry is no history, so it cannot be ahead of the head.
 */
export function checkIntegrity(a: ContentView, logTail: ChangeLogEntry | undefined): Integrity {
	const own = checkHeadIntegrity(a);
	if (!own.ok) return own;
	const head = a.lifecycle.revision;
	if (head.contentHash === '' || logTail?.revision === undefined) return { ok: true };
	if (head.number > logTail.revision.number) return { ok: false, reason: 'head-ahead-of-log' };
	if (head.number < logTail.revision.number) return { ok: false, reason: 'log-ahead-of-head' };
	if (logTail.revision.contentHash !== '' && logTail.revision.contentHash !== head.contentHash) return { ok: false, reason: 'hash-mismatch' };
	return { ok: true };
}

// ---------------------------------------------------------------------------
// Revision and the fall-back to draft
// ---------------------------------------------------------------------------

/**
 * The lifecycle to store for a write. The hash and the number are always computed here, whatever revision the caller
 * supplied. A content change (the hash of the prior head's OWN content against the new content, never the stored
 * hash) returns the artifact to draft and leaves approval, review and signoffs at the revision numbers they were made
 * at. Without one, the number does not move and a status change must be a step of the closed table.
 */
export function reconcileLifecycle(
	prior: ContentView | undefined, next: ContentView, revisionNumber: number, by: Actor, at: string,
): { readonly lifecycle: Lifecycle; readonly contentChanged: boolean } {
	const hash = hashOf(next);
	if (prior === undefined) {
		if (next.lifecycle.status !== 'draft') throw new IllegalTransitionError(`a new artifact starts as draft, not ${next.lifecycle.status}`);
		return { lifecycle: { ...next.lifecycle, revision: { number: revisionNumber, contentHash: hash, at, by } }, contentChanged: true };
	}
	const contentChanged = hashOf(prior) !== hash;
	if (contentChanged) {
		if (TERMINAL.includes(prior.lifecycle.status)) {
			throw new TerminalArtifactError(`the content of a ${prior.lifecycle.status} artifact cannot change; reopen it first`);
		}
		return { lifecycle: { ...next.lifecycle, status: 'draft', revision: { number: revisionNumber, contentHash: hash, at, by } }, contentChanged };
	}
	assertLegalStatusChange(prior.lifecycle.status, next.lifecycle.status);
	const { at: priorAt, by: priorBy } = prior.lifecycle.revision;
	return { lifecycle: { ...next.lifecycle, revision: { number: revisionNumber, contentHash: hash, at: priorAt, by: priorBy } }, contentChanged };
}

// ---------------------------------------------------------------------------
// transition
// ---------------------------------------------------------------------------

export interface TransitionDetail {
	/** For review: who reviewed, as which party, with what verdict. The revision and time are filled in. */
	readonly review?:        { readonly reviewer: Actor; readonly party: Review['party']; readonly verdict: Review['verdict']; readonly counts: Review['counts']; readonly report?: Reference | undefined };
	readonly override?:      { readonly reason: string } | undefined;
	readonly request?:       Reference | undefined;
	readonly signoffActors?: readonly Actor[] | undefined;
	readonly upstream?:      { readonly upstream: Reference; readonly upstreamRevision: number } | undefined;
	readonly supersededBy?:  Reference | undefined;
	readonly reason?:        string | undefined;
	/** A unit's completion freezes a dependent record whatever its status. */
	readonly cascade?:       boolean | undefined;
}

const REVIEW_REQUIRED_KINDS: readonly string[] = ['DEF', 'HLD', 'LLD'];

function need<T>(value: T | undefined, op: string, what: string): T {
	if (value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
		throw new IllegalTransitionError(`${op} needs ${what}`);
	}
	return value;
}

/** The next lifecycle for one operation; pure and synchronous. `transition` is the async form the sc4 sketch names. */
export function nextLifecycle(a: Pick<Artifact<unknown>, 'id' | 'lifecycle'>, op: Operation, by: Actor, at: string, detail: TransitionDetail = {}): Lifecycle {
	if (!isLifecycleOperation(op)) throw new IllegalTransitionError(`'${op}' is a content operation, not a lifecycle operation`);
	const lc = a.lifecycle;
	const step = LIFECYCLE_TABLE[op];
	const cascadeComplete = op === 'complete' && detail.cascade === true && NON_TERMINAL.includes(lc.status);
	if (!step.from.includes(lc.status) && !cascadeComplete) {
		throw new IllegalTransitionError(`${op} is not a step from ${lc.status}`);
	}
	const status = step.to === 'same' ? lc.status : step.to;
	const revision = lc.revision.number;
	switch (op) {
		case 'review': {
			const r = need(detail.review, op, 'a review');
			return { ...lc, status, review: { revision, reviewer: r.reviewer, party: r.party, verdict: r.verdict, counts: r.counts, at, ...(r.report !== undefined ? { report: r.report } : {}) } };
		}
		case 'approve': {
			const override = detail.override?.reason !== undefined && detail.override.reason.trim().length > 0 ? detail.override : undefined;
			const kind = ArtifactIds.parse(a.id)?.kind;
			if (kind !== undefined && REVIEW_REQUIRED_KINDS.includes(kind) && override === undefined) {
				const rv = lc.review;
				if (rv === undefined || rv.revision !== revision) throw new ReviewRequiredError(`${a.id} has no review of revision ${revision}; review it or approve with an override reason`);
				if (rv.verdict === 'block') throw new ReviewRequiredError(`the review of ${a.id} blocks approval; resolve the findings or approve with an override reason`);
			}
			const approval: Approval = { revision, by, at, ...(override !== undefined ? { override: { reason: override.reason } } : {}) };
			return { ...lc, status, approval };
		}
		case 'reject':
			need(detail.reason, op, 'a reason');
			return { ...lc, status };
		case 'withdraw':
			need(detail.reason, op, 'a reason');
			return { ...lc, status };
		case 'supersede':
			need(detail.supersededBy, op, 'the superseding reference');
			return { ...lc, status };
		case 'open-signoff': {
			const request = need(detail.request, op, 'the request reference');
			const signoff: Signoff = { revision, request, state: 'open', actors: [], at };
			return { ...lc, status, signoffs: [...lc.signoffs, signoff] };
		}
		case 'signoff-changes':
		case 'signed-off': {
			const latest = lc.signoffs[lc.signoffs.length - 1];
			if (latest === undefined || latest.state !== 'open') throw new IllegalTransitionError(`${op} needs an open signoff request`);
			const moved: Signoff = { ...latest, state: op === 'signed-off' ? 'completed' : 'changes-requested', actors: detail.signoffActors ?? [by], at };
			return { ...lc, status, signoffs: [...lc.signoffs.slice(0, -1), moved] };
		}
		case 'mark-stale': {
			const u = need(detail.upstream, op, 'the upstream reference and revision');
			const stale: Staleness = { upstream: u.upstream, upstreamRevision: u.upstreamRevision, since: at };
			return { ...lc, stale };
		}
		case 'ack-stale': {
			if (lc.stale === undefined) throw new IllegalTransitionError('ack-stale needs a stale artifact');
			need(detail.reason, op, 'a reason');
			const { stale: _cleared, ...rest } = lc;
			return { ...rest, status };
		}
		default:
			return { ...lc, status };
	}
}

/** The sc4 transition: the next lifecycle for one operation at the current time. Nothing is written. */
export async function transition(a: Pick<Artifact<unknown>, 'id' | 'lifecycle'>, op: Operation, by: Actor, detail?: TransitionDetail): Promise<Lifecycle> {
	return nextLifecycle(a, op, by, new Date().toISOString(), detail);
}

// ---------------------------------------------------------------------------
// Roll-up and unit membership
// ---------------------------------------------------------------------------

/** What roll-up and membership read: the strict child listing and the status of one head. */
export interface ChildStatusReader {
	childrenOfStrict(id: string): Promise<{ readonly children: readonly string[]; readonly unreadable: readonly string[] }>;
	/** The status of a head, or undefined when there is none. */
	statusOf(id: string): Promise<Status | undefined>;
}

/** The state of a Story's code review as completion sees it. Only clean and overridden allow a Story to complete. */
export interface CodeReviewEvidence {
	readonly kind:            'clean' | 'overridden' | 'blocked' | 'missing';
	readonly overrideReason?: string | undefined;
}

/** What completion needs to know that is not in the heads. */
export interface CompletionEvidence {
	taskBuildPassed(taskId: string): Promise<boolean>;
	storyCodeReview(epicHash: string, storyId: string): Promise<CodeReviewEvidence>;
}

const IGNORED_CHILD: readonly Status[] = ['withdrawn', 'superseded'];

/** The children of `id` of one kind that count towards its completion, with their statuses. Throws when any head cannot be read. */
async function countedChildren(id: string, kind: 'TASK' | 'STORY', reader: ChildStatusReader): Promise<Status[]> {
	const { children, unreadable } = await reader.childrenOfStrict(id);
	if (unreadable.length > 0) throw new UnreadableChildError(unreadable);
	const statuses: Status[] = [];
	const vanished: string[] = [];
	for (const child of children) {
		if (ArtifactIds.parse(child)?.kind !== kind) continue;
		const status = await reader.statusOf(child);
		if (status === undefined) vanished.push(child);
		else if (!IGNORED_CHILD.includes(status)) statuses.push(status);
	}
	if (vanished.length > 0) throw new UnreadableChildError(vanished);
	return statuses;
}

/**
 * 'completed' when the unit's completion condition is true now, otherwise undefined. Reads only.
 * A Task: its build passed. A Story: at least one counted Task, every counted Task completed, and a clean or overridden code
 * review. An Epic: at least one counted Story and every counted Story completed. Withdrawn and superseded children are not
 * counted; TASKS and DIAG children are not Tasks. Any other kind answers undefined.
 */
export async function rollUp(id: string, reader: ChildStatusReader, evidence: CompletionEvidence): Promise<Status | undefined> {
	const key = ArtifactIds.parse(id);
	if (key === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
	if (key.kind === 'TASK') return (await evidence.taskBuildPassed(id)) ? 'completed' : undefined;
	if (key.kind === 'STORY') {
		const tasks = await countedChildren(id, 'TASK', reader);
		if (tasks.length === 0 || !tasks.every(s => s === 'completed')) return undefined;
		const review = await evidence.storyCodeReview(key.epicHash, key.story ?? '');
		return review.kind === 'clean' || review.kind === 'overridden' ? 'completed' : undefined;
	}
	if (key.kind === 'EPIC') {
		const stories = await countedChildren(id, 'STORY', reader);
		return stories.length > 0 && stories.every(s => s === 'completed') ? 'completed' : undefined;
	}
	return undefined;
}

const STORY_RECORD_KINDS = ['LLD', 'PLAN', 'BUILD', 'CR', 'TESTS', 'EXT'] as const;

/**
 * The artifacts a unit's completion freezes with it. A Story's: its LLD, PLAN, BUILD, CR, TESTS and EXT heads, its STORY head,
 * and the TASKS and DIAG heads that name it as parent (each DIAG keeps the sequence in its id). An Epic's: EPIC, DEF and HLD.
 * The unit itself is never one of its own members. Some of the ids may have no head; the caller skips those.
 */
export async function unitMembers(id: string, reader: ChildStatusReader): Promise<string[]> {
	const key = ArtifactIds.parse(id);
	if (key === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
	const members: string[] = [];
	if (key.kind === 'STORY' && key.story !== undefined) {
		for (const kind of STORY_RECORD_KINDS) members.push(ArtifactIds.make({ kind, epicHash: key.epicHash, story: key.story }));
		members.push(ArtifactIds.make({ kind: 'STORY', epicHash: key.epicHash, story: key.story }));
		for (const child of (await reader.childrenOfStrict(id)).children) {
			const kind = ArtifactIds.parse(child)?.kind;
			if (kind === 'TASKS' || kind === 'DIAG') members.push(child);
		}
	} else if (key.kind === 'EPIC') {
		for (const kind of ['EPIC', 'DEF', 'HLD'] as const) members.push(ArtifactIds.make({ kind, epicHash: key.epicHash }));
	}
	return [...new Set(members)].filter(m => m !== id);
}
