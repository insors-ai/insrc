/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-aef82b03 — the bounded review job of one code-review dimension.
 *
 * A dimension whose whole prompt fits the reviewing model's input (or whose
 * budget is not known) is ONE call with today's prompt and schema. Otherwise it
 * runs as a job whose every call fits:
 *
 *   MAP — the cross product of the context atoms' batches (the approved design's
 *         clauses, ...) and the changed symbols' batches; each call reports
 *         local findings and keyed notes, never absence findings.
 *
 * Every original atom is read whole by some call; nothing is cut to fit. A call
 * the model refuses for its size is re-planned smaller (with the size it
 * reported, else in halves) and never sent again.
 *
 * The job is plain data, so the controller path can keep it in its step state;
 * the strategy (prompt builders and output mappers) is supplied again on every
 * step. `runReviewJob` is the daemon driver: it runs the calls serially.
 */

import { createHash } from 'node:crypto';

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../shared/types.js';
import { getLogger } from '../../shared/logger.js';
import { validateAgainstSchema, withStructuredRetry } from '../../agent/providers/structured-output.js';
import { AtomTooLargeError, packIntoBatches } from './pack-into-batches.js';
import type { DimensionFinding, DimensionResult, ReviewDimension } from './types.js';

const log = getLogger('code-review:review-job');

/** Room kept in every planned call for the correction note a structured retry appends. */
export const RETRY_NOTE_RESERVE_CHARS = 8_000;

/** One indivisible input of a dimension: a symbol summary, an approved clause, ... */
export interface Atom {
	readonly id:    string;
	/** How an error names it: file#name for a symbol, the clause path for a clause. */
	readonly label: string;
	readonly data:  unknown;
}

/** A keyed note a MAP call reports for a later stage (requirement evidence, idiom examples). */
export interface JobNote {
	readonly key:       string;
	readonly symbolIds: readonly string[];
	readonly note:      string;
}

/** What one MAP call's answer gives the job. */
export interface MapOutput {
	readonly findings: readonly DimensionFinding[];
	readonly notes?:   readonly JobNote[] | undefined;
}

/** A dimension's prompts and output mappers for each stage. Supplied on every step; never stored. */
export interface DimensionStrategy {
	readonly dimension: ReviewDimension;
	/** Today's single call, unchanged: its prompt (with the retry note when given), schema and mapping. */
	readonly whole: {
		readonly messages:   (note: string | undefined) => LLMMessage[];
		readonly schema:     StructuredSchema;
		readonly toFindings: (output: unknown) => DimensionFinding[];
	};
	/** The changed symbols this dimension judges, as atoms. */
	readonly symbols: readonly Atom[];
	/** Context atoms every MAP call carries a batch of (e.g. the approved design's clauses). */
	readonly context?: readonly Atom[] | undefined;
	readonly map: {
		readonly messages: (symbols: readonly Atom[], context: readonly Atom[], note: string | undefined) => LLMMessage[];
		readonly schema:   StructuredSchema;
		readonly toOutput: (output: unknown) => MapOutput;
	};
}

export type JobStage = 'whole' | 'map';

/** One call the job asks to be made. Plain data. */
export interface JobCall {
	readonly callId:    string;
	readonly stage:     JobStage;
	readonly messages:  readonly LLMMessage[];
	readonly schema:    StructuredSchema;
	/** The atoms the call carries, so a refused call can be re-planned. */
	readonly symbolIds:  readonly string[];
	readonly contextIds: readonly string[];
	/** Its prompt's size in characters, as the CLI receives it. */
	readonly chars:     number;
}

export interface ReviewJob {
	readonly dimension: ReviewDimension;
	/** The provider's whole input budget; undefined = unknown. The whole call is judged against it, as today. */
	readonly providerBudget: number | undefined;
	/** Usable characters per call (the provider's budget less the retry reserve); undefined = unknown. */
	readonly budget:    number | undefined;
	readonly phase:     JobStage | 'done';
	readonly pending:   readonly JobCall[];
	readonly findings:  readonly DimensionFinding[];
	readonly notes:     readonly JobNote[];
	/** Calls issued per stage. */
	readonly counts:    Readonly<Record<JobStage, number>>;
	/** Hashes of every prompt issued, so none is issued twice. */
	readonly issued:    readonly string[];
	readonly seq:       number;
}

/** The prompt's size as the CLI receives it (cli-provider's serialiseMessages: system parts headed, joined by blank lines). */
export function promptChars(messages: readonly LLMMessage[]): number {
	let n = 0;
	for (const [i, m] of messages.entries()) {
		const content = typeof m.content === 'string' ? m.content : m.content.map(b => 'text' in b ? b.text : '').join('');
		n += content.length + (m.role === 'system' ? '## System\n'.length : m.role === 'assistant' ? '## Assistant\n'.length : 0) + (i > 0 ? 2 : 0);
	}
	return n;
}

const hashOf = (messages: readonly LLMMessage[]): string => createHash('sha256').update(JSON.stringify(messages)).digest('hex');

function issue(job: ReviewJob, calls: readonly Omit<JobCall, 'callId'>[]): ReviewJob {
	let seq = job.seq;
	const counts = { ...job.counts };
	const issued = [...job.issued];
	const made: JobCall[] = [];
	for (const c of calls) {
		const hash = hashOf(c.messages);
		if (issued.includes(hash)) throw new Error(`review job ${job.dimension}: a planned ${c.stage} call repeats a prompt already issued`);
		issued.push(hash);
		counts[c.stage]++;
		made.push({ ...c, callId: `${job.dimension}:${c.stage}:${++seq}` });
	}
	return { ...job, seq, counts, issued, pending: [...job.pending, ...made] };
}

/**
 * MAP calls over `symbols` x `context` within `budget` (see the module comment).
 * Context batches leave room for the smallest symbol; a symbol that does not fit
 * beside a batch is paired with that batch re-split around it, so every symbol
 * meets every context atom while each fits beside the other.
 */
function planMap(strategy: DimensionStrategy, symbols: readonly Atom[], context: readonly Atom[], budget: number, hardBudget: number = budget): Omit<JobCall, 'callId'>[] {
	if (symbols.length === 0) return [];
	const size = (syms: readonly Atom[], ctx: readonly Atom[]): number => promptChars(strategy.map.messages(syms, ctx, undefined));
	const call = (syms: readonly Atom[], ctx: readonly Atom[]): Omit<JobCall, 'callId'> => {
		const messages = strategy.map.messages(syms, ctx, undefined);
		return { stage: 'map', messages, schema: strategy.map.schema, symbolIds: syms.map(a => a.id), contextIds: ctx.map(a => a.id), chars: promptChars(messages) };
	};
	const bare = size([], []);
	const smallest = Math.min(...symbols.map(s => size([s], []) - bare));
	const contextBatches = context.length === 0
		? [[] as Atom[]]
		: packIntoBatches(context, b => size([], b) + smallest, budget, a => a.label);
	const calls: Omit<JobCall, 'callId'>[] = [];
	for (const ctx of contextBatches) {
		const fit = symbols.filter(s => size([s], ctx) <= budget);
		for (const syms of packIntoBatches(fit, b => size(b, ctx), budget, a => a.label)) calls.push(call(syms, ctx));
		for (const s of symbols.filter(x => !fit.includes(x))) {
			// Never dropped. A symbol on its own may use the provider's whole budget,
			// as today's single call does; one larger than that cannot be read whole.
			if (ctx.length === 0) {
				if (size([s], []) > hardBudget) throw new AtomTooLargeError(s.label, size([s], []), hardBudget);
				calls.push(call([s], []));
				continue;
			}
			// It does not fit beside the whole batch: meet the batch's atoms in smaller groups.
			// (A context atom it cannot fit beside at all is the joint-fit case, S001/t6.)
			for (const sub of packIntoBatches(ctx, b => size([s], b), hardBudget, a => `${a.label} beside ${s.label}`)) calls.push(call([s], sub));
		}
	}
	return calls;
}

/**
 * A new job. `providerBudget` is the provider's input budget in characters
 * (LLMProvider.inputBudgetChars); undefined means unknown, which starts with the
 * whole call as today.
 */
export function createReviewJob(strategy: DimensionStrategy, providerBudget: number | undefined): ReviewJob {
	const budget = providerBudget !== undefined ? providerBudget - RETRY_NOTE_RESERVE_CHARS : undefined;
	const empty: ReviewJob = {
		dimension: strategy.dimension, providerBudget, budget, phase: 'whole', pending: [], findings: [], notes: [],
		counts: { whole: 0, map: 0 }, issued: [], seq: 0,
	};
	const whole = strategy.whole.messages(undefined);
	const chars = promptChars(whole);
	// The whole call is today's call: it fits when it fits the provider's whole budget, as it always has.
	if (providerBudget === undefined || budget === undefined || chars <= providerBudget) {
		return issue(empty, [{ stage: 'whole', messages: whole, schema: strategy.whole.schema, symbolIds: strategy.symbols.map(a => a.id), contextIds: (strategy.context ?? []).map(a => a.id), chars }]);
	}
	return startMap({ ...empty, phase: 'map' }, strategy, budget);
}

function startMap(job: ReviewJob, strategy: DimensionStrategy, budget: number): ReviewJob {
	const planned = issue({ ...job, phase: 'map', budget }, planMap(strategy, strategy.symbols, strategy.context ?? [], budget, Math.max(budget, Math.min(job.providerBudget ?? budget, budget + RETRY_NOTE_RESERVE_CHARS))));
	return planned.pending.length > 0 ? planned : { ...planned, phase: 'done' };
}

/** The calls still to be made. */
export function nextCalls(job: ReviewJob): readonly JobCall[] {
	return job.pending;
}

/** Record a call's validated answer; advances the job when its stage is complete. */
export function applyAnswer(job: ReviewJob, strategy: DimensionStrategy, callId: string, output: unknown): ReviewJob {
	const call = job.pending.find(c => c.callId === callId);
	if (call === undefined) throw new Error(`review job ${job.dimension}: no pending call ${callId}`);
	const pending = job.pending.filter(c => c.callId !== callId);
	let next: ReviewJob;
	if (call.stage === 'whole') {
		next = { ...job, pending, findings: [...job.findings, ...strategy.whole.toFindings(output)] };
	} else {
		const out = strategy.map.toOutput(output);
		next = { ...job, pending, findings: [...job.findings, ...out.findings], notes: [...job.notes, ...(out.notes ?? [])] };
	}
	return pending.length === 0 ? { ...next, phase: 'done' } : next;
}

/**
 * The model refused `callId` for its size. The call is re-planned with the
 * size the model reported (`maxChars`, less the retry reserve), else with half
 * the refused prompt; it is never issued again. A whole call becomes a MAP plan.
 */
export function applyRefusal(job: ReviewJob, strategy: DimensionStrategy, callId: string, maxChars: number | undefined): ReviewJob {
	const call = job.pending.find(c => c.callId === callId);
	if (call === undefined) throw new Error(`review job ${job.dimension}: no pending call ${callId}`);
	const reported = maxChars !== undefined ? maxChars - RETRY_NOTE_RESERVE_CHARS : undefined;
	// Always below the refused prompt's size, so the re-plan splits it.
	const budget = Math.min(reported ?? Math.floor(call.chars / 2), call.chars - 1, job.budget ?? Number.POSITIVE_INFINITY);
	const rest = { ...job, pending: job.pending.filter(c => c.callId !== callId), budget };
	log.warn({ dimension: job.dimension, callId, chars: call.chars, budget }, 'review job: a call was refused for its size; re-planning it smaller');
	if (call.stage === 'whole') return startMap(rest, strategy, budget);
	// Re-plan the refused call's symbols AND context under the smaller budget.
	const byId = new Map([...strategy.symbols, ...(strategy.context ?? [])].map(a => [a.id, a] as const));
	const symbols = call.symbolIds.map(id => byId.get(id)!);
	const context = call.contextIds.map(id => byId.get(id)!);
	return issue(rest, planMap(strategy, symbols, context, budget));
}

/** A finding's identity: every field, in a fixed key order. */
function findingKey(f: DimensionFinding): string {
	return JSON.stringify(Object.keys(f).sort().map(k => [k, (f as unknown as Record<string, unknown>)[k]]));
}

/** The dimension's one result: every finding of every call, identical ones once; parts when it took more than one call. */
export function jobResult(job: ReviewJob): DimensionResult {
	if (job.phase !== 'done') throw new Error(`review job ${job.dimension}: not complete (${job.phase})`);
	const seen = new Set<string>();
	const findings = job.findings.filter(f => { const k = findingKey(f); if (seen.has(k)) return false; seen.add(k); return true; });
	const calls = job.counts.whole + job.counts.map;
	return {
		dimension: job.dimension, findings,
		...(calls > 1 ? { parts: { map: job.counts.map, reduce: 0, compare: 0 } } : {}),
	};
}

/** The retry-note form of a call's prompt: the planned messages with the correction appended to the system part. */
function withNote(messages: readonly LLMMessage[], note: string | undefined): LLMMessage[] {
	if (note === undefined) return [...messages];
	return messages.map((m, i) => i === 0 && m.role === 'system' && typeof m.content === 'string'
		? { ...m, content: `${m.content}\n\nCorrection from a previous attempt:\n${note}` }
		: m);
}

const MAX_ATTEMPTS = 3;

/**
 * The daemon driver: runs the dimension's job against `provider`, one call at a
 * time, and returns its one result. A whole call keeps today's retry prompt
 * (the strategy's own note handling); a refused call is re-planned.
 */
export async function runReviewJob(strategy: DimensionStrategy, provider: LLMProvider, opts: { readonly cwd?: string | undefined } = {}): Promise<DimensionResult> {
	let job = createReviewJob(strategy, provider.inputBudgetChars);
	while (job.phase !== 'done') {
		const call = nextCalls(job)[0];
		if (call === undefined) break;
		try {
			const output = await withStructuredRetry(
				note => provider.completeStructured<unknown>(
					call.stage === 'whole' ? strategy.whole.messages(note) : withNote(call.messages, note),
					call.schema, { cwd: opts.cwd }),
				raw => validateAgainstSchema<unknown>(call.schema, raw),
				MAX_ATTEMPTS,
			);
			job = applyAnswer(job, strategy, call.callId, output);
		} catch (err) {
			if (err instanceof Error && err.name === 'InputTooLargeError') {
				job = applyRefusal(job, strategy, call.callId, (err as { maxChars?: number }).maxChars);
				continue;
			}
			throw err;
		}
	}
	return jobResult(job);
}
