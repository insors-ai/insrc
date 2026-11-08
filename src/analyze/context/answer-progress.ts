/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The answer step of the multi-turn step tool, in parts (LLD-b9d5c5c40df5a574-s3, task t13).
 *
 * The step tool has no provider of its own: the client writes each reply. When
 * the request's size or the admission of the rendered input says the answer is
 * not written in one reply, `startAnswerProgress` divides the evidence into
 * parts and the tool asks for one part at a time, then for the combine of the
 * part summaries. The progress is everything the tool keeps between turns, as
 * plain JSON: the plan, the decision, the budgets, the replies so far and what
 * is pending. It is stored in the step state and replaced on every turn.
 * Pure: no model, no files except the answer prompt.
 */

import type { AnalyzeScope, ClassifiedIntent } from '../../shared/analyze-types.js';
import type { StructuredSchema } from '../../shared/types.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';
import type { HandlingBudget, HandlingReport } from '../completeness.js';
import type { ExecutedPlan } from '../explore/types.js';
import { evidenceBlocks, planReference, ruleFacts, selectSharedContext } from './dependency.js';
import type { ReferenceRound } from './dependency.js';
import { reportFromLookups } from '../explore/answer-report.js';
import { HandlingBudgetError } from './answer-step-error.js';
import type { AnswerStepFound } from './driver.js';
import type { PartFailure } from './failure-data.js';
import { causeOf } from './failure-data.js';
import { decideHandling, inputLimitFor, measureInput } from './handling.js';
import type { HandlingTrigger, InputLimit } from './handling.js';
import { messagesSize } from './handling-call.js';
import { assembleBundle } from './handling-adapters.js';
import type { BundleLayers, BundleNarrative } from './handling-adapters.js';
import { packParts, partIdFor, terminalFailure } from './handling-parts.js';
import type { Failure, PartInput } from './handling-parts.js';
import { bundleAdapter, loadSynthesizePrompt, partSchema } from './synthesizer.js';
import type { SynthesizerPromptKey } from './synthesizer.js';
import { validateAgainstSchema } from '../../agent/providers/structured-output.js';
import { SynthesizerSchemaUnrecoverable } from './synthesizer.js';

type Reply = BundleLayers & { summary: string };

/** What is asked of the client next. */
export type PendingTurn =
	| { readonly kind: 'part';    readonly index: number; readonly round: number }
	| { readonly kind: 'combine'; readonly stage: number; readonly group: number };

/** A covered part, kept as plain data. */
export interface CompletedPart { readonly id: string; readonly ordinal: number; readonly reply: Reply }

export interface AnswerProgress {
	readonly mode:    'single' | 'partitioned';
	readonly trigger?: HandlingTrigger | undefined;
	readonly target:  SynthesizerPromptKey;
	readonly budgets: readonly HandlingBudget[];
	/** Partitioned only from here. */
	readonly limit?:      InputLimit | undefined;
	readonly parts:       readonly PartInput[];
	readonly rounds:      readonly ReferenceRound[];
	readonly groupSize:   number;
	readonly sectioned:   boolean;
	/** Blocks that were left out because their envelope leaves no room, with the reason. */
	readonly unadmittable: readonly Failure[];
	readonly completed:   readonly CompletedPart[];
	/** Replies of the part now being asked, one per reference round answered so far. */
	readonly roundReplies: readonly Reply[];
	readonly failures:    readonly Failure[];
	readonly pending?:    PendingTurn | undefined;
	/** The summaries being combined at the current stage, and the narratives the stage has produced so far. */
	readonly stageItems:   readonly { readonly id: string; readonly summary: string }[];
	readonly stageOutputs: readonly BundleNarrative[];
	readonly combineStages: number;
	readonly combineFailed?: string | undefined;
	readonly narrative?:    BundleNarrative | undefined;
	/** Invalid replies to the turn now pending; reset when a turn advances. */
	readonly retries: number;
}

export interface AnswerArgs {
	readonly intent:   ClassifiedIntent;
	readonly executed: ExecutedPlan;
	readonly target:   SynthesizerPromptKey;
}

/** The turn the client is asked for. */
export interface AnswerTurnPrompt {
	readonly kind:      'bundle' | 'part' | 'combine';
	readonly systemPrompt: string;
	readonly userTurn:  string;
	readonly schema:    StructuredSchema;
	/** Part: its id, position and the number of parts; combine: the stage and group. */
	readonly id?:       string;
	readonly ordinal?:  number;
	readonly total?:    number;
	readonly stage?:    number;
	readonly group?:    number;
}

/** What the lookups returned and the report derived from them, so a failure keeps what they found. */
const found = (executed: ExecutedPlan): AnswerStepFound =>
	({ results: executed.results, report: reportFromLookups(executed.results) });

/**
 * The initial progress. The step tool has no provider, so the input limit is the default (60,000 characters). The
 * request is answered in one reply when the table says single pass and the rendered input is admitted; otherwise the
 * evidence is divided here, once, and the plan is kept.
 */
export function startAnswerProgress(args: AnswerArgs, size: AnalyzeScope | undefined, forcePartition = false): AnswerProgress {
	const promptContent = loadSynthesizePrompt(args.target);
	const adapter = bundleAdapter(promptContent, args.intent, args.executed);
	// The probe carries the longest id a part can have, so the room it leaves is the room the real part has.
	const partUnit = inputLimitFor({ kind: 'unknown' }, 'part').unit;
	const longestKey = evidenceBlocks(args.target, args.executed).reduce((longest, b) => (measureInput(b.key, partUnit) > measureInput(longest, partUnit) ? b.key : longest), '');
	const empty: PartInput = { id: partIdFor(9_999, longestKey), sections: [] };
	const emptyRound: ReferenceRound = { sections: [], rendered: '', size: 0, evidenceRoom: 0 };
	const target = { kind: 'unknown' } as const;
	const single = adapter.renderPart({ id: 'single', sections: [] }, emptyRound);
	const input = [...evidenceBlocks(args.target, args.executed), ...selectSharedContext(args.target, args.executed)].map(b => b.text).join('\n');
	const decision = decideHandling({ size, target, input: single.map(m => String(m.content)).join('\n') + input });
	const blocks = evidenceBlocks(args.target, args.executed);
	const reference = selectSharedContext(args.target, args.executed);
	const base = { target: args.target, budgets: [decision.budget], parts: [], rounds: [], groupSize: 2, sectioned: false, unadmittable: [], completed: [], roundReplies: [], failures: [], stageItems: [], stageOutputs: [], combineStages: 0, retries: 0 } as const;
	if (!forcePartition && (decision.method === 'single-pass' || (blocks.length === 0 && reference.length === 0))) return { mode: 'single', ...base };

	const limit = inputLimitFor(target, 'part');
	// With a reference the prompt carries its wrapper, which an empty round leaves out: the probe round is not empty.
	const probeRound: ReferenceRound = reference.length > 0 ? { ...emptyRound, rendered: 'x' } : emptyRound;
	const promptSize = messagesSize(adapter.renderPart(empty, probeRound), limit.unit);
	const refPlan = planReference({ blocks: reference, limit, promptSize, found: found(args.executed) });
	const evidenceRoom = Math.min(...refPlan.rounds.map(r => r.evidenceRoom));
	const packed = packParts(blocks, evidenceRoom, limit.unit);
	const fixed = messagesSize(adapter.renderCombine([], refPlan.rounds[0] ?? emptyRound, refPlan.rounds.length - 1), limit.unit);
	const perSummary = (limit.unit === 'bytes' ? 4 : 1) * 2_000 + 64;
	const progress: AnswerProgress = {
		...base, mode: 'partitioned', trigger: forcePartition ? 'fit' : decision.trigger, limit,
		budgets: [{ ...limit, inputSize: measureInput(input, limit.unit) }],
		parts: packed.parts, rounds: refPlan.rounds, sectioned: packed.sectioned, unadmittable: packed.unadmittable,
		groupSize: Math.max(2, Math.floor((limit.limit - fixed) / perSummary)),
		pending: packed.parts.length > 0 ? { kind: 'part', index: 0, round: 0 } : undefined,
	};
	if (packed.parts.length === 0) throw terminalFailure(progress.unadmittable, { found: found(args.executed) }, handlingOf(progress));
	// One part with one round of reference is the whole input in one reply: dividing it changes nothing but the name of
	// the turn, so the client is asked for the one reply it always was.
	if (!forcePartition && packed.parts.length === 1 && refPlan.rounds.length <= 1 && packed.unadmittable.length === 0) return { mode: 'single', ...base, budgets: progress.budgets };
	return progress;
}

/** The prompt of the pending turn, as it is rendered. */
export function currentTurn(progress: AnswerProgress, args: AnswerArgs): AnswerTurnPrompt {
	return renderTurn(progress, args);
}

/** The turn to ask next, or the finished answer when the turns that did not fit left nothing more to ask. */
export type AdmittedTurn =
	| { readonly kind: 'turn'; readonly progress: AnswerProgress; readonly turn: AnswerTurnPrompt }
	| { readonly kind: 'final'; readonly layers: BundleLayers; readonly handling: HandlingReport };

/**
 * The pending turn, measured as it is rendered (envelopes, reference wrapper, its real id) against the limit it was
 * planned for. A part that does not fit is recorded as not covered and the answer goes on to the next part; a combine
 * that does not fit falls back to the per-part findings with 'combine' not covered. What the completed parts found is
 * kept. Only when no part is covered is it the typed failure.
 */
export function admitTurn(progress: AnswerProgress, args: AnswerArgs): AdmittedTurn {
	const ctx = { executed: args.executed };
	let current = progress;
	// Each pass either returns or moves the answer on by one part or to its end, so the loop is bounded by the parts.
	for (let pass = 0; pass <= progress.parts.length + 1; pass++) {
		const turn = renderTurn(current, args);
		const limit = current.mode === 'single' || current.pending === undefined || current.limit === undefined ? inputLimitFor({ kind: 'unknown' }, 'single') : current.limit;
		const size = measureInput(`${turn.systemPrompt}\n${turn.userTurn}`, limit.unit);
		if (size <= limit.limit) return { kind: 'turn', progress: current, turn };
		const detail = `the ${turn.kind} turn is ${size} ${limit.unit} and the limit is ${limit.limit}`;
		const pending = current.pending;
		if (current.mode === 'single' || pending === undefined) {
			throw new HandlingBudgetError(`no turn of the answer fits: ${detail}`, found(args.executed), { partFailures: [{ part: turn.id ?? turn.kind, kind: 'unadmittable', reason: detail }] });
		}
		const outcome = pending.kind === 'part'
			? afterPart(current, pending.index, undefined, { part: turn.id ?? `part ${pending.index + 1}`, kind: 'unadmittable', reason: detail } as Failure, ctx)
			: finish({ ...current, combineFailed: detail, retries: 0, pending: undefined }, ctx);
		if (outcome.kind === 'final') return outcome;
		if (outcome.kind !== 'next') break;
		current = outcome.progress;
	}
	throw new Error('admitTurn: the answer did not reach a turn that fits or an end');
}

function renderTurn(progress: AnswerProgress, args: AnswerArgs): AnswerTurnPrompt {
	const adapter = bundleAdapter(loadSynthesizePrompt(args.target), args.intent, args.executed);
	const pending = progress.pending;
	if (progress.mode === 'single' || pending === undefined) {
		const messages = adapter.renderPart({ id: 'single', sections: [] }, { sections: [], rendered: '', size: 0, evidenceRoom: 0 });
		return { kind: 'bundle', systemPrompt: String(messages[0]?.content), userTurn: String(messages[1]?.content), schema: partSchema() };
	}
	const round = (i: number): ReferenceRound => progress.rounds[i] ?? { sections: [], rendered: '', size: 0, evidenceRoom: 0 };
	if (pending.kind === 'part') {
		const part = progress.parts[pending.index] as PartInput;
		const messages = adapter.renderPart(part, round(pending.round));
		return {
			kind: 'part', systemPrompt: String(messages[0]?.content), userTurn: String(messages[1]?.content), schema: adapter.partSchema,
			id: part.id, ordinal: pending.index + 1, total: progress.parts.length,
		};
	}
	const first = pending.group * progress.groupSize;
	const items = progress.stageItems.slice(first, first + progress.groupSize);
	const messages = adapter.renderCombine(items, round(0), progress.rounds.length - 1);
	return {
		kind: 'combine', systemPrompt: String(messages[0]?.content), userTurn: String(messages[1]?.content), schema: partSchema(),
		stage: pending.stage + 1, group: pending.group + 1,
	};
}

/** How the answer was handled so far, for the report. */
export function handlingOf(progress: AnswerProgress): HandlingReport {
	if (progress.mode === 'single') return { method: 'single-pass', parts: 1, notCovered: [], budgets: progress.budgets };
	return {
		method: 'partitioned', parts: progress.parts.length + progress.unadmittable.length,
		partitionedBy: progress.sectioned ? 'section' : 'directory',
		notCovered: [
			...progress.unadmittable.map(f => ({ part: f.part, reason: f.reason })),
			...progress.failures.map(f => ({ part: f.part, reason: f.reason })),
			...(progress.combineFailed !== undefined ? [{ part: 'combine', reason: progress.combineFailed }] : []),
		],
		budgets: progress.budgets, ...(progress.trigger !== undefined ? { trigger: progress.trigger } : {}), combineStages: progress.combineStages,
	};
}

export type FinalizedAnswerTurn =
	| { readonly kind: 'final'; readonly layers: BundleLayers; readonly handling: HandlingReport }
	| { readonly kind: 'next';  readonly progress: AnswerProgress };

/** Validates a reply against the pending turn's schema; throws SynthesizerSchemaUnrecoverable. */
function validate<T>(schema: StructuredSchema, raw: unknown, execution?: ConnectionExecutionContext): T {
	const result = validateAgainstSchema<T>(schema, raw, execution);
	if (!result.ok) throw new SynthesizerSchemaUnrecoverable(result.errors);
	return result.value;
}

/** Takes the client's reply to the pending turn and returns the next turn's progress, or the finished answer. */
export function applyReply(progress: AnswerProgress, raw: unknown, ctx: { readonly executed: ExecutedPlan }, execution?: ConnectionExecutionContext): FinalizedAnswerTurn {
	const pending = progress.pending;
	if (progress.mode === 'single' || pending === undefined) throw new Error('applyReply: the answer is not in parts');
	if (pending.kind === 'part') {
		const reply = validate<Reply>(partSchema(), raw, execution);
		const roundReplies = [...progress.roundReplies, reply];
		if (pending.round + 1 < progress.rounds.length) {
			return { kind: 'next', progress: { ...progress, roundReplies, retries: 0, pending: { kind: 'part', index: pending.index, round: pending.round + 1 } } };
		}
		const merged = roundReplies.length === 1 ? roundReplies[0] as Reply : mergeRounds(roundReplies);
		return afterPart(progress, pending.index, { id: (progress.parts[pending.index] as PartInput).id, ordinal: progress.completed.length, reply: merged }, undefined, ctx);
	}
	// The client replies with the registered bundle argument: a combine reply fills system, focus and summary and leaves
	// the four evidence layers empty; only the narrative is read from it.
	const full = validate<Reply>(partSchema(), raw, execution);
	const narrative: BundleNarrative = { system: full.system, focus: full.focus, summary: full.summary };
	const stageOutputs = [...progress.stageOutputs, narrative];
	const groups = Math.ceil(progress.stageItems.length / progress.groupSize);
	if (pending.group + 1 < groups) {
		return { kind: 'next', progress: { ...progress, stageOutputs, retries: 0, pending: { kind: 'combine', stage: pending.stage, group: pending.group + 1 } } };
	}
	// The stage is complete: its outputs are the next stage's items, until one remains.
	if (stageOutputs.length >= progress.stageItems.length) return finish({ ...progress, stageOutputs, combineStages: progress.combineStages + 1, combineFailed: 'a combine stage did not reduce the number of summaries', retries: 0 }, ctx);
	if (stageOutputs.length === 1) return finish({ ...progress, stageOutputs, combineStages: progress.combineStages + 1, narrative, retries: 0, pending: undefined }, ctx);
	return {
		kind: 'next',
		progress: {
			...progress, combineStages: progress.combineStages + 1, retries: 0, stageOutputs: [],
			stageItems: stageOutputs.map((n, i) => ({ id: `combined ${i + 1}`, summary: n.summary })),
			pending: { kind: 'combine', stage: pending.stage + 1, group: 0 },
		},
	};
}

function mergeRounds(rs: readonly Reply[]): Reply {
	return {
		...(rs[0] as Reply), summary: rs.map(r => r.summary).join(' ').slice(0, 2_000),
		structure: rs.map(r => r.structure).join('\n'), surface: rs.map(r => r.surface).join('\n'),
		artefacts: rs.map(r => r.artefacts).join('\n'), upstream: rs.map(r => r.upstream).join('\n'),
	};
}

/** A part is covered, or recorded as not covered; then the next part, the combine, or the end. */
function afterPart(progress: AnswerProgress, index: number, covered: CompletedPart | undefined, failure: Failure | undefined, ctx: { readonly executed: ExecutedPlan }): FinalizedAnswerTurn {
	const completed = covered !== undefined ? [...progress.completed, { ...covered, ordinal: progress.completed.length }] : progress.completed;
	const failures = failure !== undefined ? [...progress.failures, failure] : progress.failures;
	const next: AnswerProgress = { ...progress, completed, failures, roundReplies: [], retries: 0 };
	if (index + 1 < progress.parts.length) return { kind: 'next', progress: { ...next, pending: { kind: 'part', index: index + 1, round: 0 } } };
	if (completed.length === 0) throw terminalFailure([...progress.unadmittable, ...failures], { found: found(ctx.executed) }, handlingOf({ ...next, pending: undefined }));
	if (completed.length === 1) return finish({ ...next, pending: undefined }, ctx);
	return {
		kind: 'next',
		progress: { ...next, stageItems: completed.map(c => ({ id: c.id, summary: c.reply.summary })), stageOutputs: [], pending: { kind: 'combine', stage: 0, group: 0 } },
	};
}

function finish(progress: AnswerProgress, ctx: { readonly executed: ExecutedPlan }): FinalizedAnswerTurn {
	const covered = progress.completed.map(c => ({ id: c.id, ordinal: c.ordinal, reply: c.reply }));
	const layers = assembleBundle(progress.target, covered, progress.narrative, ruleFacts(ctx.executed));
	return { kind: 'final', layers, handling: handlingOf({ ...progress, pending: undefined }) };
}

/**
 * An invalid reply to the pending turn. Up to `bound` replies are asked again; past it the part (or the combine) is
 * recorded as not covered and the answer goes on.
 */
export function recordInvalid(progress: AnswerProgress, reason: string, bound: number, ctx: { readonly executed: ExecutedPlan }): { readonly kind: 'retry'; readonly progress: AnswerProgress } | FinalizedAnswerTurn {
	const pending = progress.pending;
	if (pending === undefined) throw new Error('recordInvalid: nothing is pending');
	if (progress.retries + 1 < bound) return { kind: 'retry', progress: { ...progress, retries: progress.retries + 1 } };
	if (pending.kind === 'part') {
		const part = progress.parts[pending.index] as PartInput;
		return afterPart(progress, pending.index, undefined, { part: part.id, kind: 'invalid-reply', reason, cause: causeOf(new Error(reason)) } as Failure, ctx);
	}
	return finish({ ...progress, combineFailed: reason, retries: 0, pending: undefined }, ctx);
}

export type { PartFailure };
