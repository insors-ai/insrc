/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How an answer-writing call is sized (LLD-b9d5c5c40df5a574-s3, task t3): the
 * table from a request's size to the method, the admission rule that decides
 * whether a rendered input may be sent, and the output caps of part and
 * combine calls. Pure: no provider, no model, no files.
 *
 * The admission rule has two units that are never mixed. A CLI provider is
 * measured in characters against its declared budget. A local model is
 * measured in UTF-8 bytes against its window less the call's output tokens
 * and a template reserve: every token covers at least one byte, so the byte
 * length bounds the token count and an admitted input cannot be truncated.
 */

import type { AnalyzeScope } from '../../shared/analyze-types.js';
import type { HandlingBudget, HandlingReport } from '../completeness.js';
import { HandlingBudgetError } from './driver.js';
import type { AnswerStepFound } from './driver.js';

export type HandlingMethod = HandlingReport['method'];

/** XS and S are answered at once; M, L and XL in parts. A request whose size was not determined is XL. */
export const HANDLING_TABLE: Readonly<Record<AnalyzeScope, HandlingMethod>> = Object.freeze({
	XS: 'single-pass',
	S:  'single-pass',
	M:  'partitioned',
	L:  'partitioned',
	XL: 'partitioned',
});

/** The method the table gives a size; an undetermined size is XL. */
export function methodForSize(size: AnalyzeScope | undefined): HandlingMethod {
	return HANDLING_TABLE[size ?? 'XL'];
}

/** Output tokens of a part or combine call on a local model: a seven-layer reply with a summary capped at 2,000 characters. */
export const PART_MAX_OUTPUT_TOKENS = 8_192;
/** Tokens a local model's template and special tokens take from its window. */
export const TEMPLATE_RESERVE_TOKENS = 2_048;
/** Characters kept free of a CLI provider's declared input budget. */
export const CLI_RESERVE_CHARS = 16_000;
/** The input limit, in characters, when the provider declares none. */
export const DEFAULT_INPUT_BUDGET_CHARS = 60_000;
/** The least room, in the call's unit, a section of a long block must have. */
export const MIN_SECTION_ROOM = 4_000;

/** The kind of call: the one call of a single pass, or a part or combine call of a divided one. */
export type CallKind = 'single' | 'part' | 'combine';

/** What the provider of an answer-writing call is, as far as admission is concerned. */
export type AdmissionTarget =
	| { readonly kind: 'cli'; readonly inputBudgetChars?: number | undefined }
	| { readonly kind: 'local'; readonly windowTokens: number; readonly singlePassOutputTokens: number }
	| { readonly kind: 'unknown' };

/** One input limit, in its own unit. */
export type InputLimit = Omit<HandlingBudget, 'inputSize'>;

/** The input limit a call is held to. */
export function inputLimitFor(target: AdmissionTarget, call: CallKind): InputLimit {
	if (target.kind === 'cli' && target.inputBudgetChars !== undefined) {
		return {
			unit: 'chars', limit: Math.max(0, target.inputBudgetChars - CLI_RESERVE_CHARS), source: 'provider', basis: 'declared',
		};
	}
	if (target.kind === 'local' && target.windowTokens > 0) {
		const output = call === 'single' ? target.singlePassOutputTokens : PART_MAX_OUTPUT_TOKENS;
		return {
			unit: 'bytes', limit: Math.max(0, target.windowTokens - output - TEMPLATE_RESERVE_TOKENS), source: 'context-window', basis: 'bytes-bound',
		};
	}
	return { unit: 'chars', limit: DEFAULT_INPUT_BUDGET_CHARS, source: 'default', basis: 'default' };
}

/**
 * The output cap a call is given, or undefined for none. Only a local model
 * has one: a single pass keeps the configured tokens, a part or combine call
 * the part cap. A CLI provider enforces no output cap and needs none.
 */
export function outputTokensFor(target: AdmissionTarget, call: CallKind): number | undefined {
	if (target.kind !== 'local') return undefined;
	return call === 'single' ? target.singlePassOutputTokens : PART_MAX_OUTPUT_TOKENS;
}

/** The size of `text` in the limit's unit: UTF-8 bytes or characters. */
export function measureInput(text: string, unit: InputLimit['unit']): number {
	return unit === 'bytes' ? Buffer.byteLength(text, 'utf8') : text.length;
}

/** True when an input of `size` units may be sent under `limit`. */
export function admits(limit: InputLimit, size: number): boolean {
	return size <= limit.limit;
}

export type HandlingTrigger = NonNullable<HandlingReport['trigger']>;

export interface HandlingDecision {
	readonly method:  HandlingMethod;
	/** Why the input is divided; absent for a single pass. */
	readonly trigger?: HandlingTrigger | undefined;
	/** The limit the single pass was held to, with the input's size in the same unit. */
	readonly budget:  HandlingBudget;
}

/**
 * Whether a rendered input is answered at once or in parts. It is divided
 * when the table says so (trigger 'size'), when the admission rule does not
 * admit it (trigger 'fit'), or both.
 */
export function decideHandling(args: {
	readonly size:   AnalyzeScope | undefined;
	readonly target: AdmissionTarget;
	/** The rendered input of the single call. */
	readonly input:  string;
}): HandlingDecision {
	const limit = inputLimitFor(args.target, 'single');
	const inputSize = measureInput(args.input, limit.unit);
	const bySize = methodForSize(args.size) === 'partitioned';
	const byFit = !admits(limit, inputSize);
	const trigger: HandlingTrigger | undefined = bySize && byFit ? 'both' : bySize ? 'size' : byFit ? 'fit' : undefined;
	return {
		method: trigger === undefined ? 'single-pass' : 'partitioned',
		...(trigger !== undefined ? { trigger } : {}),
		budget: { ...limit, inputSize },
	};
}

/** Names the setting to change for a limit that cannot hold a call. */
function configurationHint(limit: InputLimit): string {
	return limit.source === 'context-window'
		? 'raise the model\'s context window (its inputLimit in the model definitions) or lower PART_MAX_OUTPUT_TOKENS'
		: limit.source === 'provider'
			? 'raise the model\'s declared input budget (its chars inputLimit in the model definitions)'
			: 'declare an input limit for the model in the model definitions';
}

/**
 * A part or combine call needs its fixed context (prompt, reference context,
 * envelope) plus the minimum room for a section within the limit. When the
 * limit cannot hold that, no division helps: the configuration has to change.
 *
 * @param what what the fixed context is made of, for the message ('the prompt', 'the reference context', 'the envelope of a block')
 */
export function assertPartRoom(limit: InputLimit, fixedSize: number, found: AnswerStepFound, what = 'the prompt'): void {
	if (fixedSize + MIN_SECTION_ROOM <= limit.limit) return;
	throw new HandlingBudgetError(
		`${what} takes ${fixedSize} ${limit.unit} of the ${limit.limit} ${limit.unit} a part call may hold, leaving less than the `
		+ `${MIN_SECTION_ROOM} ${limit.unit} a section needs; ${configurationHint(limit)}`,
		found,
	);
}
