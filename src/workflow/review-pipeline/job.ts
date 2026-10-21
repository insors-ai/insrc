/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review pipeline's job (Epic 8315a11f s1, sc5): one review unit (a
 * code-review dimension, or a design review) run as pre-processor -> review ->
 * post-processor, whether or not it is divided.
 *
 * Prepare measures the adapter's rendered calls against the limit: when today's
 * single call fits, the review is that call; otherwise the material is planned
 * into coherent chunks (prepare.ts) and each model stage asks one chunk at a
 * time. Every call is enveloped under a fresh callId (envelope.ts) and every
 * retry is the pipeline's own: a call that fails is re-issued once under a new
 * callId (two attempts in all), then its stage's failure policy applies. A size
 * refusal re-divides exactly what the call carried and is never resent.
 *
 * The job is plain data, so the controller path can keep it in its step state;
 * the adapter is rebuilt from the review's subject and the job's frozen
 * snapshot on every turn, and must give the same material it gave at prepare.
 * These step functions are pure except runStage, which runs a deterministic
 * stage; runReviewJob (driver.ts) is the serial daemon driver.
 */

import { createHash, randomUUID } from 'node:crypto';

import { ReviewSessionTimeoutError } from '../../agent/providers/cli-provider.js';
import { validateAgainstSchema } from '../../agent/providers/structured-output.js';
import { getLogger } from '../../shared/logger.js';
import { HARD_REVIEW_DEADLINE_MS } from '../review/template.js';
import { envelopeMessages, envelopeSchema, openEnvelope, promptChars, promptHash } from './envelope.js';
import { AtomTooLargeError, packIntoBatches } from './pack-into-batches.js';
import { planChunks } from './prepare.js';
import type {
	AdapterStage, CallCarries, CallRole, ChunkPrompt, EnvelopedAnswer, EvidenceNote, FailureCause, GatherPlan, NeighbourSummary, PipelineCalls, ReviewAtom,
	ReviewAdapter, ReviewCall, ReviewChunk, ReviewMaterial, ReviewMaterialSnapshot, ReviewPath, ReviewPipelineJob, StageAnswer,
} from './types.js';

const log = getLogger('review-pipeline:job');

/** Room kept in every planned chunk call for the correction note a re-issue may carry. */
export const RETRY_NOTE_RESERVE_CHARS = 8_000;

/** The pipeline's attempts per call: the first, and one re-issue under a new callId. */
export const MAX_CALL_ATTEMPTS = 2;

/** A call failed both attempts in a stage whose policy fails the review. Nothing is recorded. */
export class ReviewCallFailedError extends Error {
	constructor(readonly stage: string, readonly cause: FailureCause | 'stage-error', readonly detail: string | undefined, readonly reasons: readonly string[] = []) {
		super(`review stage ${stage}: the call failed twice (${cause})${detail !== undefined ? `: ${detail}` : ''}. No review was recorded.`);
		this.name = 'ReviewCallFailedError';
	}
}

/** The adapter rebuilt for a later turn gave material other than the snapshot's. */
export class MaterialChangedError extends Error {
	constructor(readonly dimension: string) {
		super(`review ${dimension}: the adapter's material differs from the material taken at prepare; a review reads only its snapshot`);
		this.name = 'MaterialChangedError';
	}
}

export interface CreateJobOpts {
	/** Epoch ms at prepare. Default: now. */
	readonly now?:      number | undefined;
	readonly reviewId?: string | undefined;
}

// -- prepare -----------------------------------------------------------------

/**
 * Prepare: the job for one review unit, its first stage's calls pending. The
 * snapshot is copied and frozen; the adapter must be built from it.
 */
export function createReviewJob(
	adapter: ReviewAdapter<unknown>, path: ReviewPath, snapshot: ReviewMaterialSnapshot, limitChars: number, opts: CreateJobOpts = {},
): ReviewPipelineJob {
	const stages = adapter.stagesFor(path);
	if (stages.length === 0) throw new Error(`review ${adapter.dimension}: the adapter has no stages for the ${path} path`);
	stages.forEach((s, i) => {
		for (const dep of s.after) {
			if (!stages.slice(0, i).some(p => p.id === dep)) throw new Error(`review ${adapter.dimension}: stage ${s.id} runs after ${dep}, which is not an earlier stage`);
		}
	});
	const job: ReviewPipelineJob = {
		reviewId: opts.reviewId ?? randomUUID(), path, snapshot: freeze(structuredClone(snapshot)),
		kind: adapter.kind, dimension: adapter.dimension, phase: 'review',
		plan: { limitChars, single: true, chunks: [], crossRelations: [] },
		stage: stages[0]!.id, outputs: {}, pending: [], answered: [], stageAnswers: [], gathered: [], relationPlan: {}, gatherLevels: {}, contextReduced: {}, notes: [], noteProvenance: {}, notJudged: [],
		issuedHashes: [], counts: { single: 0, chunk: 0, reduce: 0, obligation: 0, relation: 0, merge: 0 },
		materialHash: materialHash(adapter.material()), seq: 0,
	};
	return enterStage(job, adapter, 0, opts.now ?? Date.now());
}

/** Enter stage `index`: issue a model stage's calls (single, or one per chunk); a deterministic stage waits for runStage. */
function enterStage(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, index: number, now: number): ReviewPipelineJob {
	const stage = adapter.stagesFor(job.path)[index]!;
	let next: ReviewPipelineJob = { ...job, stage: stage.id, stageAnswers: [], pending: [] };
	if (stage.kind === 'deterministic') return next;

	if (next.plan.single) {
		const singles = stage.singleCalls(next.outputs, next.snapshot);
		if (singles.every(p => sentChars(p) <= next.plan.limitChars)) {
			next = issue(next, singles.map(prompt => ({ prompt, role: 'single' as const, carries: { atomIds: [], noteIds: [], key: prompt.key } })));
		} else {
			// Today's call does not fit: the review is divided, even with no atoms (its obligations go to gather).
			const b = budgets(next.plan.limitChars);
			const planned = planWithin(next, adapter, stage, readMaterial(next, adapter), b.soft, b.hard, undefined, undefined);
			next = { ...planned.job, plan: { ...next.plan, single: false, chunks: planned.chunks, crossRelations: planned.crossRelations } };
			log.info({ dimension: job.dimension, stage: stage.id, chunks: planned.chunks.length }, 'review pipeline: the single call is over the limit; the review is divided');
			next = issueChunkCalls(next, stage, next.plan.chunks, undefined);
		}
	} else {
		next = issueChunkCalls(next, stage, next.plan.chunks, undefined);
	}
	next = withDeadline(next, now);
	// A stage with nothing to ask (a divided review with no atoms) completes at once.
	return next.pending.length === 0 ? completeStage(next, adapter, now) : next;
}

/** Plan `atomIds` (default all) into chunks within soft/hard, measured on the stage's rendered chunk calls. */
function planWithin(
	job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, stage: AdapterStage, material: ReviewMaterial,
	soft: number, hard: number, atomIds: readonly string[] | undefined, heldElsewhere: ReadonlyMap<string, string> | undefined,
): { job: ReviewPipelineJob; chunks: readonly ReviewChunk[]; crossRelations: ReviewPipelineJob['plan']['crossRelations'] } {
	let seq = job.seq;
	const measure = (ids: readonly string[], neighbours: readonly NeighbourSummary[]): number =>
		Math.max(0, ...stage.chunkCalls({ id: 'c0000', atomIds: ids, neighbours, chars: 0 }, job.outputs, job.snapshot).map(sentChars));
	const planned = planChunks({
		material, atomIds, measure, soft, hard, heldElsewhere,
		summaryOf: atom => adapter.neighbourSummary?.(atom, material) ?? atom.label,
		nextChunkId: () => `c${++seq}`,
	});
	return { job: { ...job, seq }, chunks: planned.chunks, crossRelations: planned.crossRelations };
}

/** Issue the stage's calls for `chunks`; with `key` set, only the calls under that key (a re-division). */
function issueChunkCalls(job: ReviewPipelineJob, stage: AdapterStage, chunks: readonly ReviewChunk[], only: { readonly key: string | undefined } | undefined): ReviewPipelineJob {
	const calls: NewCall[] = [];
	for (const chunk of chunks) {
		for (const prompt of stage.chunkCalls(chunk, job.outputs, job.snapshot)) {
			if (only !== undefined && prompt.key !== only.key) continue;
			calls.push({ prompt, role: 'chunk', countAs: stage.countAs, carries: { chunkId: chunk.id, atomIds: prompt.carries?.atomIds ?? chunk.atomIds, noteIds: [], key: prompt.key } });
		}
	}
	return issue(job, calls);
}

// -- issue -------------------------------------------------------------------

interface NewCall {
	readonly prompt:   ChunkPrompt;
	readonly role:     CallRole;
	readonly carries:  CallCarries;
	readonly attempt?: number | undefined;
	/** The pipelineCalls role the call is counted under; default its role. */
	readonly countAs?: CallRole | undefined;
}

/** A call's size as sent, under an id of a real id's length. */
function sentChars(prompt: ChunkPrompt): number {
	return promptChars(envelopeMessages('00000000-0000-0000-0000-000000000000', prompt.messages));
}

/** Envelope and record new calls under fresh ids. No sent prompt may repeat. */
function issue(job: ReviewPipelineJob, calls: readonly NewCall[]): ReviewPipelineJob {
	const issuedHashes = [...job.issuedHashes];
	const counts = { ...job.counts };
	const made: ReviewCall[] = [];
	for (const c of calls) {
		const callId = randomUUID();
		const messages = envelopeMessages(callId, c.prompt.messages);
		const schema = envelopeSchema(callId, c.prompt.schema);
		const hash = promptHash(messages, schema);
		if (issuedHashes.includes(hash)) throw new Error(`review ${job.dimension}: a planned ${job.stage} call repeats a prompt already sent`);
		issuedHashes.push(hash);
		counts[c.countAs ?? c.role]++;
		made.push({
			callId, attempt: c.attempt ?? 1, stage: job.stage, role: c.role, messages, schema,
			execution: c.prompt.execution, chars: promptChars(messages), carries: c.carries, prompt: c.prompt,
		});
	}
	return { ...job, issuedHashes, counts, pending: [...job.pending, ...made] };
}

// -- deadline ----------------------------------------------------------------

/**
 * The review's deadline, set once, when its first reviewer-session calls are
 * planned: the per-session limit (capped at 30 minutes) times the sessions
 * planned. A re-issue or a re-division never extends it.
 */
function withDeadline(job: ReviewPipelineJob, now: number): ReviewPipelineJob {
	if (job.deadlineAt !== undefined) return job;
	const sessions = job.pending.filter(c => c.execution.mode === 'reviewer-session');
	if (sessions.length === 0) return job;
	const first = sessions[0]!.execution as { readonly deadlineMs: number };
	const sessionLimitMs = Math.min(first.deadlineMs, HARD_REVIEW_DEADLINE_MS);
	const deadlineBudgetMs = sessionLimitMs * sessions.length;
	return { ...job, sessionLimitMs, deadlineBudgetMs, deadlineAt: now + deadlineBudgetMs };
}

// -- driver steps --------------------------------------------------------------

/**
 * The calls to make now. A reviewer-session call is given only the time that
 * remains to the job's deadline (never more than one session's limit); past the
 * deadline no call is returned: the adapter's time-limit error is thrown.
 */
export function nextCalls(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, now: number = Date.now()): readonly ReviewCall[] {
	if (job.phase === 'done') return [];
	if (job.deadlineAt === undefined || !job.pending.some(c => c.execution.mode === 'reviewer-session')) return job.pending;
	const remaining = job.deadlineAt - now;
	if (remaining <= 0) throw deadlineError(job, adapter);
	return job.pending.map(c => c.execution.mode !== 'reviewer-session' ? c : {
		...c, execution: { ...c.execution, deadlineMs: Math.min(remaining, job.sessionLimitMs ?? remaining) },
	});
}

/** The adapter's (today's) time-limit error, else ReviewSessionTimeoutError. */
export function deadlineError(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>): Error {
	const budget = job.deadlineBudgetMs ?? 0;
	return adapter.deadlineError?.(budget) ?? new ReviewSessionTimeoutError(budget);
}

/**
 * A raw model output for `callId`: its envelope must carry that id, else the call
 * failed with 'identifier-mismatch'. Then as {@link applyAnswer}.
 */
export function applyOutput(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, callId: string, raw: unknown, now: number = Date.now()): ReviewPipelineJob {
	const opened = openEnvelope(raw, callId);
	if (opened === undefined) return applyFailure(job, adapter, callId, 'identifier-mismatch', undefined, { detail: 'the answer did not carry its call\'s id', now });
	return applyAnswer(job, adapter, { callId, answer: opened.answer }, now);
}

/**
 * Record a call's answer: checked against the stage's schema, then the stage's
 * validate (an invalid answer is the 'invalid-answer' failure). Completes the
 * stage when it was its last call.
 */
export function applyAnswer(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, answer: EnvelopedAnswer, now: number = Date.now()): ReviewPipelineJob {
	const call = pendingCall(job, answer.callId);
	if (isGatherRole(call.role)) return applyGatherAnswer(job, adapter, call, answer.answer, now);
	const stage = currentStage(job, adapter);
	const checked = validateAgainstSchema<unknown>(call.prompt.schema, answer.answer);
	const reasons = checked.ok ? (stage.validate?.(answer.answer, call) ?? []) : checked.errors;
	if (reasons.length > 0) return applyFailure(job, adapter, call.callId, 'invalid-answer', undefined, { reasons, now });
	const recorded: StageAnswer = { key: call.carries.key, chunkId: call.carries.chunkId, atomIds: call.carries.atomIds, answer: answer.answer };
	const next: ReviewPipelineJob = {
		...job,
		pending: job.pending.filter(c => c.callId !== call.callId),
		answered: [...job.answered, { callId: call.callId, stage: call.stage, answer: answer.answer }],
		stageAnswers: [...job.stageAnswers, recorded],
	};
	return stageDone(next) ? completeStage(next, adapter, now) : next;
}

export interface FailureDetail {
	/** For 'invalid-answer': the problems, which become the re-issue's correction. */
	readonly reasons?: readonly string[] | undefined;
	readonly detail?:  string | undefined;
	readonly now?:     number | undefined;
}

/**
 * A call did not complete. A size refusal re-divides exactly the atoms the call
 * carried, within the size the refusal reported (less the retry reserve), else
 * half the refused prompt; the refused prompt is never sent again. Any other
 * cause re-issues the call once under a new callId (an invalid answer with its
 * reasons as the correction); a second failure applies the stage's policy.
 */
export function applyFailure(
	job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, callId: string, cause: FailureCause, maxChars?: number | undefined, more: FailureDetail = {},
): ReviewPipelineJob {
	const call = pendingCall(job, callId);
	const now = more.now ?? Date.now();
	const rest: ReviewPipelineJob = { ...job, pending: job.pending.filter(c => c.callId !== callId) };
	// A gather call fails the review when it fails twice; it re-divides its notes when refused.
	const stage: Pick<AdapterStage, 'id' | 'onCallFailure' | 'withCorrection'> = isGatherRole(call.role) ? { id: call.stage, onCallFailure: 'fail-review' } : currentStage(job, adapter);
	if (cause === 'size-refusal') {
		if (call.role === 'relation') return redivideRelation(rest, adapter, call, maxChars);
		if (call.role === 'merge') throw new AtomTooLargeError(`the merge call ${call.carries.key ?? call.callId}`, call.chars, maxChars ?? call.chars - 1);
		if (isGatherRole(call.role)) return redivideNotes(rest, adapter, call, maxChars);
		const own = currentStage(job, adapter);
		return call.role === 'chunk' && own.redivide !== undefined ? redivideByStage(rest, own, call, maxChars) : redivide(rest, adapter, own, call, maxChars);
	}

	if (call.attempt < MAX_CALL_ATTEMPTS) {
		let prompt = call.prompt;
		if (cause === 'invalid-answer' && more.reasons !== undefined && more.reasons.length > 0) {
			const corrected = (stage.withCorrection ?? withCorrectionNote)(call.prompt, more.reasons);
			// A correction that would not fit the limit is left out (never cut down): the call is
			// re-issued once as planned, and the omission is logged with the reasons.
			if (sentChars(corrected) <= job.plan.limitChars) prompt = corrected;
			else log.warn({ dimension: job.dimension, stage: stage.id, callId, reasons: more.reasons }, 'review pipeline: the correction does not fit beside the call; re-issuing it as planned, without the correction');
		}
		log.warn({ dimension: job.dimension, stage: stage.id, cause, callId }, 'review pipeline: re-issuing a call once under a new callId');
		return issue(rest, [{ prompt, role: call.role, countAs: call.role === 'chunk' ? currentStage(job, adapter).countAs : undefined, carries: call.carries, attempt: call.attempt + 1 }]);
	}

	const detail = more.detail ?? (more.reasons !== undefined ? more.reasons.join('; ') : undefined);
	if (stage.onCallFailure === 'fail-review') throw new ReviewCallFailedError(stage.id, cause, detail, more.reasons ?? []);
	const key = call.carries.key ?? call.carries.chunkId ?? call.callId;
	log.warn({ dimension: job.dimension, stage: stage.id, key, cause }, 'review pipeline: a call failed twice; recorded and the review goes on');
	const next: ReviewPipelineJob = { ...rest, notJudged: [...rest.notJudged, { stage: stage.id, key, cause, ...(detail !== undefined ? { detail } : {}), policy: stage.onCallFailure }] };
	return stageDone(next) ? completeStage(next, adapter, now) : next;
}

/** Re-plan a refused call's atoms smaller and issue the stage's calls for them. */
/** A refused chunk-stage call whose stage re-divides its own calls: the stage's replacements, each within
 *  the refused size (never the refused prompt again); one that does not fit names the material. */
function redivideByStage(job: ReviewPipelineJob, stage: AdapterStage, call: ReviewCall, maxChars: number | undefined): ReviewPipelineJob {
	const budget = Math.min(maxChars ?? Math.floor(call.chars / 2), call.chars - 1, job.plan.limitChars);
	log.warn({ dimension: job.dimension, stage: stage.id, chars: call.chars, budget }, 'review pipeline: a call was refused for its size; the stage re-divides it');
	const prompts = stage.redivide!(call, budget, job.outputs, job.snapshot);
	const what = `the ${stage.id} call ${call.carries.key ?? call.carries.atomIds.join(', ')}`;
	if (prompts.length === 0) throw new AtomTooLargeError(what, call.chars, budget);
	for (const p of prompts) {
		const chars = sentChars(p);
		if (chars > budget) throw new AtomTooLargeError(what, chars, budget);
	}
	return issue(job, prompts.map(prompt => ({
		prompt, role: 'chunk' as const, countAs: stage.countAs,
		carries: { chunkId: call.carries.chunkId, atomIds: prompt.carries?.atomIds ?? call.carries.atomIds, noteIds: [], key: prompt.key },
	})));
}

function redivide(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, stage: AdapterStage, call: ReviewCall, maxChars: number | undefined): ReviewPipelineJob {
	// Both always below the refused prompt's size, so the re-plan splits it, and a
	// refused unit that cannot be split is named rather than sent again.
	const hard = Math.min(maxChars ?? call.chars - 1, call.chars - 1, job.plan.limitChars);
	const reserve = reserveFor(maxChars ?? job.plan.limitChars);
	const soft = Math.max(1, Math.min(maxChars !== undefined ? maxChars - reserve : Math.floor(call.chars / 2), hard));
	log.warn({ dimension: job.dimension, stage: stage.id, chars: call.chars, soft, hard }, 'review pipeline: a call was refused for its size; re-dividing what it carried');

	const material = readMaterial(job, adapter);
	if (call.role === 'single') {
		if (material.atoms.length === 0) throw new AtomTooLargeError(`the ${stage.id} call`, call.chars, hard);
		const planned = planWithin(job, adapter, stage, material, soft, hard, undefined, undefined);
		const next: ReviewPipelineJob = { ...planned.job, plan: { ...job.plan, single: false, chunks: planned.chunks, crossRelations: planned.crossRelations } };
		return issueChunkCalls(next, stage, planned.chunks, { key: call.carries.key });
	}
	const refused = job.plan.chunks.find(c => c.id === call.carries.chunkId);
	// One atom is re-planned too: without the neighbour lines that no longer fit. It is
	// named only when the atom alone, neighbour-free, exceeds the reported size (prepare).
	if (call.carries.atomIds.length === 0) throw new AtomTooLargeError(`the ${stage.id} call`, call.chars, hard);
	const heldElsewhere = new Map<string, string>();
	for (const c of job.plan.chunks) if (c.id !== refused?.id) for (const id of c.atomIds) heldElsewhere.set(id, c.id);
	const planned = planWithin(job, adapter, stage, material, soft, hard, call.carries.atomIds, heldElsewhere);
	const chunks = job.plan.chunks.flatMap(c => c.id === refused?.id ? planned.chunks : [c]);
	const crossRelations = material.relations.filter(r => {
		const holder = (id: string): string | undefined => chunks.find(c => c.atomIds.includes(id))?.id;
		const a = holder(r.from), b = holder(r.to);
		return a !== undefined && b !== undefined && a !== b;
	});
	const next: ReviewPipelineJob = { ...planned.job, plan: { ...job.plan, single: false, chunks, crossRelations } };
	return issueChunkCalls(next, stage, planned.chunks, { key: call.carries.key });
}

/**
 * Run the current deterministic stage and commit its output. A stage that throws
 * applies its policy: 'fail-review' fails the review; otherwise it is recorded
 * (a diagram handler's LOW observation) and the review goes on.
 */
export async function runStage(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, opts: { readonly signal?: AbortSignal | undefined; readonly now?: (() => number) | undefined } = {}): Promise<ReviewPipelineJob> {
	if (job.phase === 'done') throw new Error(`review ${job.dimension}: the job is finished`);
	const stage = currentStage(job, adapter);
	if (stage.kind !== 'deterministic' || stage.run === undefined) throw new Error(`review ${job.dimension}: stage ${stage.id} is a model stage; its calls are made, not run`);
	throwIfAborted(opts.signal);
	let output: unknown;
	let next = job;
	try {
		// Raced against the signal: a stage that ignores it cannot hold the review past a cancel.
		output = await untilAborted(stage.run(job.outputs, job.snapshot, opts.signal), opts.signal);
	} catch (err) {
		throwIfAborted(opts.signal);
		if (err instanceof Error && err.name === 'AbortError') throw err;
		const detail = err instanceof Error ? err.message : String(err);
		if (stage.onCallFailure === 'fail-review') throw new ReviewCallFailedError(stage.id, 'stage-error', detail);
		next = { ...job, notJudged: [...job.notJudged, { stage: stage.id, key: stage.id, cause: 'stage-error', detail, policy: stage.onCallFailure }] };
		output = undefined;
	}
	throwIfAborted(opts.signal);
	return commit(next, adapter, stage, output, opts.now?.() ?? Date.now());
}

/** The adapter's finished result. */
export function result<R>(job: ReviewPipelineJob): R {
	if (job.phase !== 'done') throw new Error(`review ${job.dimension}: not complete (stage ${job.stage})`);
	return job.result as R;
}

// -- note calls (gather) ------------------------------------------------------

const GATHER_ROLES: ReadonlySet<CallRole> = new Set<CallRole>(['reduce', 'obligation', 'relation', 'merge']);
const isGatherRole = (role: CallRole): boolean => GATHER_ROLES.has(role);

/** The model stage's own calls are all answered (gather calls may still be pending). */
function stageDone(job: ReviewPipelineJob): boolean {
	return job.phase === 'review' && !job.pending.some(c => !isGatherRole(c.role));
}

/**
 * Ask for an obligation's adjudication (or one reduction) over evidence notes
 * the job holds. A call that would not fit the limit is never planned: the notes
 * are reduced instead, in batches that fit, each answered with one note under
 * the same key.
 */
export function requestNoteCall(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, role: 'obligation' | 'reduce', key: string, noteIds: readonly string[]): ReviewPipelineJob {
	const gather = gatherOf(job, adapter);
	let notes = notesOf(job, noteIds);
	let next: ReviewPipelineJob = { ...job, phase: job.phase === 'done' ? 'done' : 'gather' };
	const context = role === 'obligation' && next.contextReduced[key] === undefined ? obligationContext(next, adapter, key) : [];
	const prompt = role === 'obligation' ? gather.obligationCall(key, notes, context) : gather.reduceCall(key, notes);
	if (sentChars(prompt) <= job.plan.limitChars) {
		const carries = noteCarries(key, notes);
		return issue(next, [{ prompt, role, carries: { ...carries, atomIds: [...new Set([...carries.atomIds, ...context.map(a => a.id)])] } }]);
	}
	const converted = contextToNotes(next, key, context);
	next = converted.job;
	notes = [...notes, ...converted.notes];
	const b = budgets(job.plan.limitChars);
	const batches = reduceBatches(gather, key, notes, b.soft, b.hard, converted.labels);
	// A level that reduces each note alone, when every note is already within the cap, cannot shrink the evidence.
	if (batches.every(c => c.carries.noteIds.length === 1) && notes.every(n => n.text.length <= gather.noteCapChars)) {
		throw new Error(`review ${job.dimension}: the evidence for ${key} cannot be reduced to fit one call (${notes.length} notes)`);
	}
	const level = (next.gatherLevels[key] ?? 0) + 1;
	if (level > MAX_GATHER_LEVELS) throw new Error(`review ${job.dimension}: the evidence for ${key} did not fit one call after ${MAX_GATHER_LEVELS} reduction levels`);
	log.info({ dimension: job.dimension, key, level, notes: notes.length, calls: batches.length }, 'review pipeline: an obligation\'s evidence is over the limit; reducing it');
	return issue({ ...next, gatherLevels: { ...next.gatherLevels, [key]: level } }, batches);
}

/** Reduction levels an obligation's evidence may go through before the review fails. */
export const MAX_GATHER_LEVELS = 16;

/** The key of a cross-chunk relation; never an obligation key. */
const relationKey = (r: { readonly from: string; readonly to: string; readonly kind: string }): string => `relation:${r.kind}:${r.from}->${r.to}`;

/**
 * Gather a divided review: the keyed notes every chunk answer carries become
 * evidence; every obligation is adjudicated on all of its evidence (reduced level
 * by level when it does not fit one call); every relation the plan cut is judged
 * by the calls relationCall returns. Each gather call fits the limit.
 */
function startGather(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>): ReviewPipelineJob {
	const gather = gatherOf(job, adapter);
	const material = readMaterial(job, adapter);
	let seq = job.seq;
	const notes: EvidenceNote[] = [...job.notes];
	for (const out of Object.values(job.outputs)) {
		if (!Array.isArray(out)) continue;
		for (const a of out as StageAnswer[]) {
			if (a.chunkId === undefined) continue;
			for (const n of gather.notesFrom?.(a) ?? []) {
				notes.push({ noteId: `n${++seq}`, key: n.key, text: n.text, atomIds: n.atomIds ?? a.atomIds });
			}
		}
	}
	let next: ReviewPipelineJob = { ...job, phase: 'gather', seq, notes };
	for (const o of material.obligations) next = requestNoteCall(next, adapter, 'obligation', o.key, activeNotes(next, o.key).map(n => n.noteId));

	// Each cut relation is offered to relationCall once.
	const byId = new Map(material.atoms.map(a => [a.id, a] as const));
	const relationPlan: Record<string, number> = {};
	const calls: NewCall[] = [];
	for (const r of next.plan.crossRelations) {
		const key = relationKey(r);
		if (relationPlan[key] !== undefined || gather.relationCall === undefined) continue;
		const prompts = gather.relationCall([byId.get(r.from)!, byId.get(r.to)!]);
		relationPlan[key] = prompts.length;
		for (const prompt of prompts) {
			const chars = sentChars(prompt);
			if (chars > next.plan.limitChars) throw new AtomTooLargeError(`the relation ${r.from} ${r.kind} ${r.to}`, chars, next.plan.limitChars);
			calls.push({ prompt, role: 'relation', carries: { key, atomIds: [r.from, r.to], noteIds: [] } });
		}
	}
	next = issue({ ...next, relationPlan }, calls);
	return next.pending.length === 0 ? finishJob(next, adapter) : next;
}

/** After a gather answer: an obligation whose reductions are all in is asked again on its reduced evidence; the job finishes when nothing is left. */
function advanceGather(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>): ReviewPipelineJob {
	if (job.phase !== 'gather') return job;
	let next = job;
	for (const o of readMaterial(job, adapter).obligations) {
		const waiting = next.pending.some(c => c.carries.key === o.key);
		const judged = next.gathered.some(g => g.role === 'obligation' && g.key === o.key);
		if (!waiting && !judged) next = requestNoteCall(next, adapter, 'obligation', o.key, activeNotes(next, o.key).map(n => n.noteId));
	}
	if (next.pending.length > 0) return next;
	// Nothing pending: every obligation and every relation must be judged, all of its calls answered.
	const unjudged = Object.keys(next.relationPlan).filter(k => !relationJudged(next, k));
	if (unjudged.length > 0) throw new Error(`review ${job.dimension}: the gather ended with relations not judged: ${unjudged.join(', ')}`);
	return finishJob(next, adapter);
}

/** A key's evidence: its notes not yet reduced into another. */
function activeNotes(job: ReviewPipelineJob, key: string): EvidenceNote[] {
	const reduced = new Set(Object.values(job.noteProvenance).flat());
	return job.notes.filter(n => n.key === key && !reduced.has(n.noteId));
}

/** A relation is judged once every call relationCall returned for it is answered. */
export function relationJudged(job: ReviewPipelineJob, key: string): boolean {
	const planned = job.relationPlan[key];
	return planned !== undefined && job.gathered.filter(g => g.role === 'relation' && g.key === key).length === planned;
}

/** A refused note call: its notes re-packed into smaller reduce calls; never resent. */
function redivideNotes(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, call: ReviewCall, maxChars: number | undefined): ReviewPipelineJob {
	const gather = gatherOf(job, adapter);
	const key = call.carries.key ?? '';
	let notes = notesOf(job, call.carries.noteIds);
	// A refused obligation call that carried its raw context: the context becomes notes too, as at
	// sizing, so nothing it carried is lost and later planning does not reattach it.
	let labels: ReadonlyMap<string, string> = new Map();
	if (call.role === 'obligation' && job.contextReduced[key] === undefined) {
		const context = obligationContext(job, adapter, key).filter(a => call.carries.atomIds.includes(a.id));
		const converted = contextToNotes(job, key, context);
		job = converted.job;
		notes = [...notes, ...converted.notes];
		labels = converted.labels;
	}
	const hard = Math.min(maxChars ?? call.chars - 1, call.chars - 1, job.plan.limitChars);
	const soft = Math.max(1, Math.min(maxChars !== undefined ? maxChars - reserveFor(maxChars) : Math.floor(call.chars / 2), hard));
	log.warn({ dimension: job.dimension, role: call.role, key, notes: notes.length, soft, hard }, 'review pipeline: a note call was refused for its size; reducing its notes in smaller batches');
	if (notes.length <= 1 && call.role === 'reduce') throw new AtomTooLargeError(`evidence note ${notes[0]?.noteId ?? '?'} (${key})`, call.chars, hard);
	if (notes.length === 0) throw new AtomTooLargeError(`the obligation call for ${key}`, call.chars, hard);
	return issue(job, reduceBatches(gather, key, notes, soft, hard, labels));
}

/** Reduce calls over `notes`, packed within `soft`; one note may use `hard`; one over it is named. */
function reduceBatches(gather: GatherPlan<unknown>, key: string, notes: readonly EvidenceNote[], soft: number, hard: number, labels: ReadonlyMap<string, string> = new Map()): NewCall[] {
	const size = (batch: readonly EvidenceNote[]): number => sentChars(gather.reduceCall(key, batch));
	for (const n of notes) {
		const alone = size([n]);
		if (alone > hard) throw new AtomTooLargeError(`${labels.get(n.noteId) ?? `evidence note ${n.noteId}`} (${key})`, alone, hard);
	}
	const batches = packIntoBatches(notes, x => (x.length === 1 ? Math.min(size(x), soft) : size(x)), soft, n => n.noteId);
	return batches.map(batch => ({ prompt: gather.reduceCall(key, batch), role: 'reduce' as const, carries: noteCarries(key, batch) }));
}

/** A gather call's answer: a reduction becomes one note (with what it stands for); the rest are recorded. */
function applyGatherAnswer(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, call: ReviewCall, answer: unknown, now: number): ReviewPipelineJob {
	const checked = validateAgainstSchema<unknown>(call.prompt.schema, answer);
	let reasons = checked.ok ? [] : checked.errors;
	const gather = gatherOf(job, adapter);
	const text = (answer as { text?: unknown } | null)?.text;
	if (reasons.length === 0 && call.role === 'reduce') {
		if (typeof text !== 'string') reasons = ['a reduction answers with one note: { "text": "..." }'];
		else if (text.length > gather.noteCapChars) reasons = [`the note is ${text.length} characters; it must be at most ${gather.noteCapChars}`];
	}
	if (reasons.length === 0) reasons = [...(gather.validate?.(answer, call) ?? [])];
	if (reasons.length > 0) return applyFailure(job, adapter, call.callId, 'invalid-answer', undefined, { reasons, now });
	const base: ReviewPipelineJob = {
		...job,
		pending: job.pending.filter(c => c.callId !== call.callId),
		answered: [...job.answered, { callId: call.callId, stage: call.stage, answer }],
	};
	if (call.role === 'obligation' || call.role === 'relation') {
		return advanceGather({ ...base, gathered: [...base.gathered, { role: call.role, key: call.carries.key ?? '', atomIds: call.carries.atomIds, answer }] }, adapter);
	}
	const noteId = `n${base.seq + 1}`;
	const note: EvidenceNote = { noteId, key: call.carries.key ?? '', text: text as string, atomIds: call.carries.atomIds };
	return advanceGather({ ...base, seq: base.seq + 1, notes: [...base.notes, note], noteProvenance: { ...base.noteProvenance, [noteId]: call.carries.noteIds } }, adapter);
}

/**
 * A refused relation call: the adapter is asked again for the relation's calls within the reported
 * size (else half the refused prompt). They replace the refused call; the relation is judged when
 * all its calls are answered. Calls that still do not fit name the relation; the refused prompt is
 * never resent.
 */
function redivideRelation(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, call: ReviewCall, maxChars: number | undefined): ReviewPipelineJob {
	const gather = gatherOf(job, adapter);
	const key = call.carries.key ?? '';
	const budget = Math.min(maxChars ?? Math.floor(call.chars / 2), call.chars - 1, job.plan.limitChars);
	const [fromId, toId] = call.carries.atomIds;
	const byId = new Map(readMaterial(job, adapter).atoms.map(a => [a.id, a] as const));
	const from = fromId !== undefined ? byId.get(fromId) : undefined;
	const to = toId !== undefined ? byId.get(toId) : undefined;
	if (gather.relationCall === undefined || from === undefined || to === undefined) {
		throw new AtomTooLargeError(`the relation call ${key}`, call.chars, budget);
	}
	const prompts = gather.relationCall([from, to], budget);
	for (const prompt of prompts) {
		const chars = sentChars(prompt);
		if (chars > budget) throw new AtomTooLargeError(`the relation ${from.id} -> ${to.id} (${key})`, chars, budget);
	}
	log.warn({ dimension: job.dimension, key, refused: call.chars, budget, calls: prompts.length }, 'review pipeline: a relation call was refused for its size; asked again within the reported size');
	const relationPlan = { ...job.relationPlan, [key]: (job.relationPlan[key] ?? 1) - 1 + prompts.length };
	return issue({ ...job, relationPlan }, prompts.map(prompt => ({ prompt, role: 'relation' as const, carries: call.carries })));
}

/** Context atoms as evidence notes under the key, once (job.contextReduced), named for errors.
 *  Nothing is dropped; each note stands for its atom. */
function contextToNotes(job: ReviewPipelineJob, key: string, context: readonly ReviewAtom[]): { job: ReviewPipelineJob; notes: EvidenceNote[]; labels: ReadonlyMap<string, string> } {
	if (context.length === 0) return { job, notes: [], labels: new Map() };
	const notes: EvidenceNote[] = context.map((a, i) => ({ noteId: `n${job.seq + i + 1}`, key, text: a.text, atomIds: [a.id] }));
	const labels = new Map(context.map((a, i) => [notes[i]!.noteId, `context atom ${a.label}`] as const));
	log.info({ dimension: job.dimension, key, contextAtoms: context.length }, 'review pipeline: an obligation\'s context is over the limit; reducing it with its evidence');
	return { job: { ...job, seq: job.seq + context.length, notes: [...job.notes, ...notes], contextReduced: { ...job.contextReduced, [key]: true } }, notes, labels };
}

/** An obligation's own context: the material.context atoms its atomIds name. */
function obligationContext(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, key: string): ReviewAtom[] {
	const material = readMaterial(job, adapter);
	const obligation = material.obligations.find(o => o.key === key);
	if (obligation?.atomIds === undefined) return [];
	const byId = new Map((material.context ?? []).map(a => [a.id, a] as const));
	return obligation.atomIds.map(id => byId.get(id)).filter((a): a is ReviewAtom => a !== undefined);
}

function gatherOf(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>): GatherPlan<unknown> {
	if (adapter.gather === undefined) throw new Error(`review ${job.dimension}: the adapter has no gather plan`);
	return adapter.gather;
}

function notesOf(job: ReviewPipelineJob, noteIds: readonly string[]): EvidenceNote[] {
	return noteIds.map(id => {
		const note = job.notes.find(n => n.noteId === id);
		if (note === undefined) throw new Error(`review ${job.dimension}: no evidence note ${id}`);
		return note;
	});
}

function noteCarries(key: string, notes: readonly EvidenceNote[]): CallCarries {
	return { key, noteIds: notes.map(n => n.noteId), atomIds: [...new Set(notes.flatMap(n => n.atomIds))] };
}

// -- stage completion --------------------------------------------------------

function completeStage(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, now: number): ReviewPipelineJob {
	return commit(job, adapter, currentStage(job, adapter), job.stageAnswers, now);
}

/** Commit a stage's output (completing the snapshot once, when the stage does) and move on. */
function commit(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, stage: AdapterStage, output: unknown, now: number): ReviewPipelineJob {
	let snapshot = job.snapshot;
	if (stage.snapshotField !== undefined) {
		if (snapshot[stage.snapshotField] !== undefined) throw new Error(`review ${job.dimension}: snapshot.${stage.snapshotField} is written once`);
		const value = stage.toSnapshot?.(output) ?? (Array.isArray(output) ? output : [output]);
		snapshot = freeze({ ...structuredClone(snapshot), [stage.snapshotField]: structuredClone(value) });
	}
	const next: ReviewPipelineJob = { ...job, snapshot, outputs: { ...job.outputs, [stage.id]: output }, stageAnswers: [], pending: [] };
	const stages = adapter.stagesFor(job.path);
	const index = stages.findIndex(s => s.id === stage.id);
	if (index + 1 < stages.length) return enterStage(next, adapter, index + 1, now);

	// A divided review is gathered; one chunk passes straight through.
	if (!next.plan.single && adapter.gather !== undefined) return startGather({ ...next, stage: '' }, adapter);
	return finishJob(next, adapter);
}

/** The adapter's result: one chunk's `finish` as is; a divided review's parts merged. */
function finishJob(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>): ReviewPipelineJob {
	const divided = !job.plan.single;
	let finished = adapter.finish(job.outputs, { notJudged: job.notJudged, divided });
	if (divided && adapter.gather !== undefined) {
		const gather = adapter.gather;
		const obligations = adapter.material().obligations.flatMap(o => job.gathered.filter(g => g.role === 'obligation' && g.key === o.key));
		const relations = Object.keys(job.relationPlan).flatMap(k => job.gathered.filter(g => g.role === 'relation' && g.key === k));
		finished = gather.merge([finished, ...[...obligations, ...relations].map(g => gather.partOf(g))]);
	}
	const done: ReviewPipelineJob = { ...job, phase: 'done', stage: '', pending: [] };
	// An object result (a DimensionResult) carries its calls per role; an array result (a design
	// review's findings) is left as it is, and its entry point reads pipelineCallsOf(job).
	const calls = pipelineCallsOf(done);
	if (calls !== undefined && finished !== null && typeof finished === 'object' && !Array.isArray(finished)) {
		finished = { ...(finished as Record<string, unknown>), pipelineCalls: calls };
	}
	return { ...done, result: finished };
}

/** The calls a divided review made per role; undefined for a single-chunk review. */
export function pipelineCallsOf(job: ReviewPipelineJob): PipelineCalls | undefined {
	if (job.plan.single) return undefined;
	return { chunk: job.counts.chunk, obligation: job.counts.obligation, relation: job.counts.relation, merge: job.counts.merge };
}

// -- helpers -----------------------------------------------------------------

function pendingCall(job: ReviewPipelineJob, callId: string): ReviewCall {
	if (job.phase === 'done') throw new Error(`review ${job.dimension}: the job is finished`);
	const call = job.pending.find(c => c.callId === callId);
	if (call === undefined) throw new Error(`review ${job.dimension}: no pending call ${callId}`);
	return call;
}

function currentStage(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>): AdapterStage {
	const stage = adapter.stagesFor(job.path).find(s => s.id === job.stage);
	if (stage === undefined) throw new Error(`review ${job.dimension}: the adapter has no stage ${job.stage}`);
	return stage;
}

/** The rebuilt adapter's material, checked against the snapshot's fingerprint. */
function readMaterial(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>): ReviewMaterial {
	const material = adapter.material();
	if (materialHash(material) !== job.materialHash) throw new MaterialChangedError(job.dimension);
	return material;
}

function materialHash(material: ReviewMaterial): string {
	return createHash('sha256').update(JSON.stringify([material.atoms, material.relations, material.obligations, material.context ?? []])).digest('hex');
}

/** Chunk budgets for a limit: pack within the limit less the retry reserve; one unit may use the whole limit. */
function budgets(limitChars: number): { soft: number; hard: number } {
	return { soft: limitChars - reserveFor(limitChars), hard: limitChars };
}

/** The retry reserve, never more than an eighth of the limit. */
function reserveFor(limitChars: number): number {
	return Math.min(RETRY_NOTE_RESERVE_CHARS, Math.floor(limitChars / 8));
}

/** The default correction: the reasons appended to the first system message, or a system message of their own. */
/** The default correction: the reasons appended to the call's first system message (or prepended as one). */
export function withCorrectionNote(prompt: ChunkPrompt, reasons: readonly string[]): ChunkPrompt {
	const note = ['Your previous answer was REJECTED:', ...reasons.map(r => `- ${r}`), 'Answer again, correcting every point above.'].join('\n');
	const first = prompt.messages[0];
	const messages = first !== undefined && first.role === 'system' && typeof first.content === 'string'
		? [{ ...first, content: `${first.content}\n\n${note}` }, ...prompt.messages.slice(1)]
		: [{ role: 'system' as const, content: note }, ...prompt.messages];
	return { ...prompt, messages };
}

/** `work`, or AbortError as soon as `signal` fires. The work itself is left to finish on its own. */
export function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
	if (signal === undefined) return work;
	if (signal.aborted) return Promise.reject(abortError());
	return new Promise<T>((resolve, reject) => {
		const onAbort = (): void => reject(abortError());
		signal.addEventListener('abort', onAbort, { once: true });
		work.then(
			v => { signal.removeEventListener('abort', onAbort); resolve(v); },
			(e: unknown) => { signal.removeEventListener('abort', onAbort); reject(e); },
		);
	});
}

function abortError(): Error {
	const err = new Error('the review was cancelled');
	err.name = 'AbortError';
	return err;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted === true) throw abortError();
}

function freeze<T>(value: T): T {
	if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const v of Object.values(value as Record<string, unknown>)) freeze(v);
	}
	return value;
}
