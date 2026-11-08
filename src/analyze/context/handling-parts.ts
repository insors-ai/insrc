/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Dividing an answer-writing call into parts (LLD-b9d5c5c40df5a574-s3, task t7):
 * the division layer of the shared handling helper, on top of the single-call
 * layer (handling-call.ts).
 *
 * The evidence blocks are packed, in order, into parts that fit the call; a
 * block larger than the room is cut into sections first. Parts are answered
 * one after another, each against every round of the reference context. A part
 * the provider refuses, whose repair is not admitted, or whose reply stays
 * invalid is divided into smaller parts, up to three times, and then recorded
 * as not covered; a part that succeeded is never discarded. The covered parts'
 * summaries are combined in stages. A failed combine returns the per-part
 * results with 'combine' in notCovered. When no part is covered the failure is
 * typed by the terminal precedence rule. Calls are made serially.
 */

import type { HandlingBudget, HandlingReport } from '../completeness.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../shared/types.js';
import { planReference, pairPartsWithReference } from './dependency.js';
import type { ReferencePlan, ReferenceRound } from './dependency.js';
import { HandlingBudgetError, ShaperAnswerStepFailedError } from './driver.js';
import type { AnswerStepFound } from './driver.js';
import { causeOf } from './failure-data.js';
import type { AggregateInputRecord, PartFailure } from './failure-data.js';
import { inputLimitFor, measureInput, outputTokensFor } from './handling.js';
import type { AdmissionTarget, HandlingTrigger, InputLimit } from './handling.js';
import { callWithRepair, messagesSize, terminalReasonOf } from './handling-call.js';
import type { CallFailureKind, CallOutcome } from './handling-call.js';
import { renderSection, sectionBlock } from './sections.js';
import type { BlockSection, EvidenceBlock } from './sections.js';

/** How many times a part is divided before it is recorded as not covered. */
export const MAX_DIVISIONS = 3;

/** A part: an id (its ordinal and heading) and the sections of evidence it holds. */
export interface PartInput {
	readonly id:       string;
	readonly sections: readonly BlockSection[];
}

/** How a caller turns parts into prompts and replies into an answer. */
export interface PartAdapter<R, C> {
	readonly partSchema:    StructuredSchema;
	readonly combineSchema: StructuredSchema;
	/** The prompt of one part against one round of the reference context. */
	renderPart(part: PartInput, round: ReferenceRound): LLMMessage[];
	/** The prompt that combines summaries (of parts, or of an earlier combine stage). */
	renderCombine(summaries: readonly { readonly id: string; readonly summary: string }[], round: ReferenceRound): LLMMessage[];
	summaryOf(reply: R): string;
	summaryOfCombine(reply: C): string;
	/** One reply from the replies of one part against several rounds of reference, in round order. */
	mergeRounds?(replies: readonly R[]): R;
}

export interface CoveredPart<R> {
	readonly id:      string;
	readonly ordinal: number;
	readonly reply:   R;
}

export interface DividedResult<R, C> {
	readonly covered:   readonly CoveredPart<R>[];
	/** The last combine reply; absent with a single covered part, or when the combine failed. */
	readonly combine?:  C | undefined;
	readonly handling:  HandlingReport;
}

export interface DivideArgs<R, C> {
	readonly provider:    LLMProvider;
	readonly target:      AdmissionTarget;
	readonly adapter:     PartAdapter<R, C>;
	/** The evidence to divide, in order, without the reference outputs. */
	readonly blocks:      readonly EvidenceBlock[];
	/** The reference context blocks, repeated in every part and combine call. */
	readonly reference:   readonly EvidenceBlock[];
	readonly found:       AnswerStepFound;
	/** The upstream inputs an aggregate call was given, kept on a typed failure. */
	readonly upstream?:   readonly AggregateInputRecord[] | undefined;
	readonly trigger?:    HandlingTrigger | undefined;
	/** Attempts per call, the first included (the structured-output retry setting). */
	readonly maxAttempts: number;
	readonly signal?:     AbortSignal | undefined;
	readonly connectionExecution?: ConnectionExecutionContext | undefined;
}

/** The most characters a part summary has (the schema caps it). */
const SUMMARY_CAP = 2_000;

interface Failure {
	readonly part:   string;
	readonly kind:   CallFailureKind;
	readonly reason: string;
	readonly cause?: unknown;
}

const EMPTY_ROUND: ReferenceRound = { sections: [], rendered: '', size: 0, evidenceRoom: 0 };

/** The sections as one part's text, as the adapter renders them. */
function sectionsSize(sections: readonly BlockSection[], unit: InputLimit['unit']): number {
	return measureInput(sections.map(renderSection).join('\n\n'), unit);
}

/** Splits sections into two halves of about equal size, cutting a lone section's text in two when it is the only one. */
function halve(part: PartInput, unit: InputLimit['unit']): [PartInput, PartInput] | undefined {
	if (part.sections.length >= 2) {
		const mid = Math.ceil(part.sections.length / 2);
		return [
			{ id: `${part.id}.1`, sections: part.sections.slice(0, mid) },
			{ id: `${part.id}.2`, sections: part.sections.slice(mid) },
		];
	}
	const only = part.sections[0];
	if (only === undefined) return undefined;
	const size = measureInput(only.text, unit);
	if (size < 2 * 4_000) return undefined;
	const cut = sectionBlock({ key: only.blockKey, envelope: only.envelope, text: only.text }, Math.ceil(size / 2) + 4_000, unit);
	if (!cut.admissible || cut.sections.length < 2) return undefined;
	const at = Math.ceil(cut.sections.length / 2);
	return [
		{ id: `${part.id}.1`, sections: cut.sections.slice(0, at) },
		{ id: `${part.id}.2`, sections: cut.sections.slice(at) },
	];
}

/**
 * Answers the evidence in parts and combines them. Never throws for a model
 * failure of some parts; throws the typed terminal failure when no part is covered.
 */
export async function runDivided<R, C>(args: DivideArgs<R, C>): Promise<DividedResult<R, C>> {
	const { provider, target, adapter, found } = args;
	const limit = inputLimitFor(target, 'part');
	const unit = limit.unit;
	const maxTokens = outputTokensFor(target, 'part');
	const probe: PartInput = { id: 'probe', sections: [] };

	// The reference context, in rounds when one record is larger than the room.
	const promptSize = messagesSize(adapter.renderPart(probe, EMPTY_ROUND), unit);
	const reference: ReferencePlan = planReference({ blocks: args.reference, limit, promptSize, found });
	const evidenceRoom = Math.min(...reference.rounds.map(r => r.evidenceRoom));

	// Pack the blocks, in order, into parts; a block larger than the room is cut into sections.
	const failures: Failure[] = [];
	const unadmittableBlocks: string[] = [];
	let sectioned = false;
	const parts: PartInput[] = [];
	let open: BlockSection[] = [];
	const flush = (): void => {
		if (open.length > 0) parts.push({ id: `part ${parts.length + 1}: ${open[0]?.blockKey ?? ''}`, sections: open });
		open = [];
	};
	for (const block of args.blocks) {
		const cut = sectionBlock(block, evidenceRoom, unit);
		if (!cut.admissible) {
			unadmittableBlocks.push(block.key);
			failures.push({ part: `block ${block.key}`, kind: 'unadmittable', reason: cut.reason });
			continue;
		}
		if (cut.sections.length > 1) sectioned = true;
		for (const section of cut.sections) {
			if (open.length > 0 && sectionsSize([...open, section], unit) > evidenceRoom) flush();
			open.push(section);
		}
	}
	flush();

	const covered: CoveredPart<R>[] = [];
	let ordinal = 0;
	const answer = async (part: PartInput, depth: number): Promise<void> => {
		// Each round of the reference, in sequence; the part is covered when every round answered.
		const replies: R[] = [];
		let failed: { kind: CallFailureKind | 'too-large'; reason: string; cause?: unknown } | undefined;
		for (const call of pairPartsWithReference([part.id], reference)) {
			const outcome: CallOutcome<R> = await callWithRepair<R>({
				provider, messages: adapter.renderPart(part, call.round), schema: adapter.partSchema, limit, maxTokens,
				maxAttempts: args.maxAttempts, signal: args.signal, connectionExecution: args.connectionExecution,
			});
			if (outcome.kind === 'ok') { replies.push(outcome.value); continue; }
			failed = outcome.kind === 'too-large'
				? { kind: 'too-large', reason: outcome.error.message, cause: outcome.error }
				: { kind: outcome.failure, reason: outcome.reason, cause: outcome.cause };
			break;
		}
		if (failed === undefined) {
			const reply = replies.length === 1 ? (replies[0] as R) : (adapter.mergeRounds?.(replies) as R | undefined);
			if (reply === undefined) throw new Error('a reference in several rounds needs the adapter\'s mergeRounds');
			covered.push({ id: part.id, ordinal: ordinal++, reply });
			return;
		}
		// A refused, unadmitted or stuck-invalid part is divided; a failed call is not.
		if (failed.kind !== 'call-failed' && depth < MAX_DIVISIONS) {
			const halves = halve(part, unit);
			if (halves !== undefined) {
				for (const half of halves) await answer(half, depth + 1);
				return;
			}
		}
		failures.push({
			part: part.id,
			kind: failed.kind === 'too-large' ? 'unadmittable' : failed.kind,
			reason: failed.reason,
			...(failed.cause !== undefined ? { cause: failed.cause } : {}),
		});
	};
	for (const part of parts) await answer(part, 0);

	const handling = (combineStages: number, extra: readonly { part: string; reason: string }[]): HandlingReport => {
		const inputSize = [...args.blocks, ...args.reference].reduce((n, b) => n + measureInput(b.text, unit), 0);
		const budget: HandlingBudget = { ...limit, inputSize };
		return {
			method: 'partitioned',
			parts: parts.length + unadmittableBlocks.length,
			partitionedBy: sectioned ? 'section' : args.blocks.some(b => b.envelope['file'] !== undefined) ? 'file' : 'directory',
			notCovered: [...failures.map(f => ({ part: f.part, reason: f.reason })), ...extra],
			budgets: [budget],
			...(args.trigger !== undefined ? { trigger: args.trigger } : {}),
			combineStages,
		};
	};

	if (covered.length === 0) throw terminalFailure(failures, args, handling(0, []));

	covered.sort((a, b) => a.ordinal - b.ordinal);
	if (covered.length === 1) return { covered, handling: handling(0, []) };

	// Combine the summaries in stages: N become ceil(N / g), so the count falls every stage.
	const combined = await combine(args, limit, maxTokens, reference, covered);
	return combined.ok
		? { covered, combine: combined.reply, handling: handling(combined.stages, []) }
		: { covered, handling: handling(combined.stages, [{ part: 'combine', reason: combined.reason }]) };
}

async function combine<R, C>(
	args: DivideArgs<R, C>, limit: InputLimit, maxTokens: number | undefined, reference: ReferencePlan, covered: readonly CoveredPart<R>[],
): Promise<{ ok: true; reply: C; stages: number } | { ok: false; reason: string; stages: number }> {
	const { adapter, provider } = args;
	const round = reference.rounds[0] ?? EMPTY_ROUND;
	const fixed = messagesSize(adapter.renderCombine([], round), limit.unit);
	// A summary has at most SUMMARY_CAP characters; in bytes that is up to four bytes each.
	const perSummary = (limit.unit === 'bytes' ? 4 : 1) * SUMMARY_CAP + 64;
	const group = Math.max(2, Math.floor((limit.limit - fixed) / perSummary));
	let items = covered.map(c => ({ id: c.id, summary: adapter.summaryOf(c.reply) }));
	let stages = 0;
	let last: C | undefined;
	while (items.length > 1) {
		const next: { id: string; summary: string }[] = [];
		for (let i = 0; i < items.length; i += group) {
			const chunk = items.slice(i, i + group);
			const outcome = await callWithRepair<C>({
				provider, messages: adapter.renderCombine(chunk, round), schema: adapter.combineSchema, limit, maxTokens,
				maxAttempts: args.maxAttempts, signal: args.signal, connectionExecution: args.connectionExecution,
			});
			if (outcome.kind !== 'ok') {
				return { ok: false, stages, reason: outcome.kind === 'too-large' ? outcome.error.message : outcome.reason };
			}
			last = outcome.value;
			next.push({ id: `combined ${next.length + 1}`, summary: adapter.summaryOfCombine(outcome.value) });
		}
		stages++;
		if (next.length >= items.length) return { ok: false, stages, reason: 'a combine stage did not reduce the number of summaries' };
		items = next;
	}
	return last === undefined ? { ok: false, stages, reason: 'no combine call was made' } : { ok: true, reply: last, stages };
}

/** The typed failure of a divided call in which no part is covered. */
function terminalFailure<R, C>(failures: readonly Failure[], args: DivideArgs<R, C>, handling: HandlingReport): ShaperAnswerStepFailedError {
	const partFailures: PartFailure[] = failures.map(f => ({
		part: f.part, kind: f.kind, reason: f.reason,
		...(f.cause !== undefined ? { cause: causeOf(f.cause) } : {}),
	}));
	const found: AnswerStepFound = { results: args.found.results, report: { ...args.found.report, handling } };
	const extra = { upstream: args.upstream, partFailures };
	const allUnadmittable = failures.length > 0 && failures.every(f => f.kind === 'unadmittable');
	if (failures.length === 0 || allUnadmittable) {
		return new HandlingBudgetError(
			`no part of the input fits a call: ${failures.map(f => `${f.part}: ${f.reason}`).join('; ') || 'there is nothing to answer from'}; `
			+ 'raise the model\'s context window or lower PART_MAX_OUTPUT_TOKENS',
			found, extra,
		);
	}
	const kind: CallFailureKind = failures.some(f => f.kind === 'call-failed') ? 'call-failed' : 'invalid-reply';
	const reason = terminalReasonOf(kind) as 'model-failed' | 'invalid-answer';
	return new ShaperAnswerStepFailedError(
		reason, `${failures.length} part(s) were not covered: ${failures.map(f => `${f.part}: ${f.reason}`).join('; ')}`, found, extra,
	);
}
