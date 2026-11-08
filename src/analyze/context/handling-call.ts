/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One answer-writing model call with its schema-repair loop
 * (LLD-b9d5c5c40df5a574-s3, task t6): the single-call layer of the shared
 * handling helper.
 *
 * The helper owns every retry. It calls `completeStructured` with
 * {maxAttempts: 1, internalRetry: false} so no provider retries on its own
 * (maxAttempts alone is ignored by the Vibe path, and the Claude and Codex
 * paths keep transient retries), builds each repair prompt itself with the
 * listed errors capped, and applies the admission rule before every attempt,
 * so no unmeasured repair note enters a call. Calls are made one after another.
 */

import { InputTooLargeError } from '../../agent/providers/cli-provider.js';
import { buildRetryNote } from '../../agent/providers/structured-output.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../shared/types.js';
import { admits, measureInput } from './handling.js';
import type { InputLimit } from './handling.js';
import { isModelCallFailure } from './model-failure.js';

/** How many characters of listed errors a repair note carries; the rest is counted, not sent. */
export const MAX_REPAIR_NOTE_CHARS = 8_000;

/** Why a call produced no answer, by cause. */
export type CallFailureKind = 'call-failed' | 'invalid-reply' | 'unadmittable';

/** The reply, or what stopped it. */
export type CallOutcome<T> =
	| { readonly kind: 'ok'; readonly value: T; readonly attempts: number }
	/** The provider refused the input as too large: divide it, before any classification. */
	| { readonly kind: 'too-large'; readonly error: InputTooLargeError; readonly attempts: number }
	| {
		readonly kind:     'failed';
		readonly failure:  CallFailureKind;
		readonly reason:   string;
		/** The error the last attempt threw; absent when the call was never sent. */
		readonly cause?:   unknown;
		readonly attempts: number;
	};

/** The input-size refusal in `err`'s cause chain, if there is one. */
function sizeRefusal(err: unknown): InputTooLargeError | undefined {
	for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) {
		if (e instanceof InputTooLargeError) return e;
	}
	return undefined;
}

/**
 * Classifies a thrown error by its cause, not by the fact that it was thrown:
 * a size refusal is divided before anything else; a failed call (the CLI or
 * the model server could not be used) is 'call-failed'; everything else the
 * structured call throws is a reply that stayed invalid.
 */
export function classifyCallFailure(err: unknown): 'too-large' | 'call-failed' | 'invalid-reply' {
	if (sizeRefusal(err) !== undefined) return 'too-large';
	return isModelCallFailure(err) ? 'call-failed' : 'invalid-reply';
}

/** The text of a message, as admission counts it. */
function textOf(message: LLMMessage): string {
	return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
}

/** The rendered size of the messages in the limit's unit. */
export function messagesSize(messages: readonly LLMMessage[], unit: InputLimit['unit']): number {
	return measureInput(messages.map(textOf).join('\n'), unit);
}

/** The listed errors of a failed reply, at most MAX_REPAIR_NOTE_CHARS characters, with the rest counted. */
export function cappedErrors(errors: readonly string[]): readonly string[] {
	const joined = errors.join('\n');
	if (joined.length <= MAX_REPAIR_NOTE_CHARS) return errors;
	const omitted = joined.length - MAX_REPAIR_NOTE_CHARS;
	return [`${joined.slice(0, MAX_REPAIR_NOTE_CHARS)} (${omitted} more characters of errors not shown)`];
}

/** What a failed reply got wrong, as the lines a repair note lists. */
function errorLines(err: unknown): readonly string[] {
	const reasons = (err as { reasons?: unknown }).reasons;
	if (Array.isArray(reasons) && reasons.length > 0) return reasons.map(String);
	return [err instanceof Error ? err.message : String(err)];
}

export interface CallArgs {
	readonly provider:   LLMProvider;
	readonly messages:   readonly LLMMessage[];
	readonly schema:     StructuredSchema;
	/** The limit this kind of call is held to (inputLimitFor). */
	readonly limit:      InputLimit;
	/** The output cap, or undefined for none (outputTokensFor). */
	readonly maxTokens?: number | undefined;
	/** Attempts in all, the first included (the structured-output retry setting). */
	readonly maxAttempts: number;
	readonly signal?:    AbortSignal | undefined;
	readonly connectionExecution?: ConnectionExecutionContext | undefined;
}

/**
 * Sends the messages and, when the reply is invalid, re-asks with a repair note
 * built here, up to `maxAttempts` attempts in all. Every attempt is admitted
 * before it is sent. A failed call is not repaired. Never throws for a model
 * failure: the outcome says what happened and the caller divides or records it.
 */
export async function callWithRepair<T>(args: CallArgs): Promise<CallOutcome<T>> {
	const { provider, messages, schema, limit } = args;
	let current: readonly LLMMessage[] = messages;
	let attempts = 0;
	for (let attempt = 1; attempt <= args.maxAttempts; attempt++) {
		const size = messagesSize(current, limit.unit);
		if (!admits(limit, size)) {
			return {
				kind: 'failed', failure: 'unadmittable', attempts,
				reason: attempt === 1
					? `the input takes ${size} ${limit.unit} and the call may hold ${limit.limit}`
					: `the repair prompt takes ${size} ${limit.unit} and the call may hold ${limit.limit}`,
			};
		}
		attempts++;
		try {
			const value = await provider.completeStructured<T>([...current], schema, {
				maxAttempts:     1,
				internalRetry:   false,
				disableThinking: true,
				...(args.maxTokens !== undefined ? { maxTokens: args.maxTokens } : {}),
				...(args.signal !== undefined ? { signal: args.signal } : {}),
				...(args.connectionExecution !== undefined ? { connectionExecution: args.connectionExecution } : {}),
			});
			return { kind: 'ok', value, attempts };
		} catch (err) {
			if (args.signal?.aborted === true) throw err;
			const kind = classifyCallFailure(err);
			if (kind === 'too-large') return { kind: 'too-large', error: sizeRefusal(err) as InputTooLargeError, attempts };
			const reason = err instanceof Error ? err.message : String(err);
			if (kind === 'call-failed') return { kind: 'failed', failure: 'call-failed', reason, cause: err, attempts };
			if (attempt === args.maxAttempts) return { kind: 'failed', failure: 'invalid-reply', reason, cause: err, attempts };
			current = [...messages, { role: 'user', content: buildRetryNote(cappedErrors(errorLines(err))) }];
		}
	}
	return { kind: 'failed', failure: 'invalid-reply', reason: 'no attempt was made', attempts };
}
