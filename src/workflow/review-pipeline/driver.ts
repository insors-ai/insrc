/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The serial daemon driver (Epic 8315a11f s1, sc5): runReviewJob makes a job's
 * calls one at a time, each with its execution mode and internalRetry: false
 * (the pipeline owns every retry), runs its deterministic stages, applies each
 * answer or failure, and returns the adapter's result.
 *
 * Cancellation ends the review at once: the signal goes into the call in flight
 * (the provider kills the CLI's process group or aborts the Ollama request), the
 * wait for that call is raced against it, and it is checked before every call
 * and after every answer. A cancelled review is never re-issued and records
 * nothing: the job is not returned.
 */

import { CliStallError, InputTooLargeError } from '../../agent/providers/cli-provider.js';
import { ModelResponseShapeError } from '../../agent/providers/model-call-error.js';
import { getLogger } from '../../shared/logger.js';
import type { LLMMessage, LLMProvider } from '../../shared/types.js';
import { applyFailure, applyOutput, deadlineError, nextCalls, result, runStage } from './job.js';
import type { FailureCause, ReviewAdapter, ReviewCall, ReviewPipelineJob } from './types.js';

const log = getLogger('review-pipeline:driver');

export interface RunReviewJobOpts {
	/** Cancels the review at once, including the call in flight. */
	readonly signal?: AbortSignal | undefined;
	/** The clock the deadline is read against. Default: Date.now. */
	readonly now?: (() => number) | undefined;
	/** Progress: a deterministic stage is about to run. */
	readonly onStage?: ((stage: string) => void) | undefined;
	/** Progress: a call is about to be made. */
	readonly onCall?: ((call: ReviewCall) => void) | undefined;
	/** The finished job, before its result is returned (its calls per role: pipelineCallsOf). */
	readonly onDone?: ((job: ReviewPipelineJob) => void) | undefined;
}

/** Drive `job` to the end and return the adapter's result. */
export async function runReviewJob(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, provider: LLMProvider, opts: RunReviewJobOpts = {}): Promise<unknown> {
	const now = opts.now ?? Date.now;
	const signal = opts.signal;
	while (job.phase !== 'done') {
		throwIfAborted(signal);
		const calls = nextCalls(job, adapter, now());
		if (calls.length === 0) {
			opts.onStage?.(job.stage);
			job = await runStage(job, adapter, { signal, now });
			continue;
		}
		// Serial: one call at a time, never more than one in flight.
		const call = calls[0]!;
		opts.onCall?.(call);
		let raw: unknown;
		try {
			raw = await untilAborted(send(provider, call, signal), signal);
		} catch (err) {
			throwIfAborted(signal);
			if (isAbortError(err)) throw err;
			// Matched by name, as today: a session that ran out its time fails the review, never re-issued.
			if (err instanceof Error && err.name === 'ReviewSessionTimeoutError') throw deadlineError(job, adapter);
			const failure = classify(err);
			log.warn({ dimension: job.dimension, stage: call.stage, role: call.role, attempt: call.attempt, cause: failure.cause, detail: failure.detail }, 'review pipeline: a call did not complete');
			job = applyFailure(job, adapter, call.callId, failure.cause, failure.maxChars, { detail: failure.detail, now: now() });
			continue;
		}
		// An answer that arrives after a cancel is not applied.
		throwIfAborted(signal);
		job = applyOutput(job, adapter, call.callId, raw, now());
	}
	opts.onDone?.(job);
	return result(job);
}

/** Make one call with its execution mode; the provider makes exactly one attempt. */
async function send(provider: LLMProvider, call: ReviewCall, signal: AbortSignal | undefined): Promise<unknown> {
	const exec = call.execution;
	if (exec.mode === 'reviewer-session') {
		if (provider.runReviewSession === undefined) {
			throw new Error('This review needs a reviewer session (a claude, codex or Ollama provider); the configured review provider has none.');
		}
		return provider.runReviewSession<unknown>(sessionPrompt(call.messages), call.schema, {
			cwd: exec.cwd, deadlineMs: exec.deadlineMs, internalRetry: false, ...(signal !== undefined ? { signal } : {}),
		});
	}
	return provider.completeStructured<unknown>([...call.messages], call.schema, {
		internalRetry: false,
		...(exec.cwd !== undefined ? { cwd: exec.cwd } : {}),
		...(exec.timeoutMs !== undefined ? { timeoutMs: exec.timeoutMs } : {}),
		...(signal !== undefined ? { signal } : {}),
	});
}

/** A reviewer session takes one prompt: the messages as the CLI would serialise them. */
function sessionPrompt(messages: readonly LLMMessage[]): string {
	return messages.map(m => {
		const content = typeof m.content === 'string' ? m.content : m.content.map(b => 'text' in b ? b.text : '').join('');
		return m.role === 'system' ? `## System\n${content}` : m.role === 'assistant' ? `## Assistant\n${content}` : content;
	}).join('\n\n');
}

/** Why a call did not complete. Anything not recognised is treated as transient: re-issued once, as today's retries would. */
function classify(err: unknown): { cause: FailureCause; maxChars?: number | undefined; detail: string } {
	const detail = err instanceof Error ? err.message : String(err);
	if (err instanceof InputTooLargeError) return { cause: 'size-refusal', maxChars: err.maxChars, detail };
	if (err instanceof CliStallError) return { cause: 'stall', detail };
	if (err instanceof ModelResponseShapeError || /^structured-output: validation failed/.test(detail)) return { cause: 'invalid-answer', detail };
	return { cause: 'transient', detail };
}

/** `work`, or AbortError as soon as `signal` fires (a provider that ignores it cannot hold the review). */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
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

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted === true) throw abortError();
}

function isAbortError(err: unknown): boolean {
	return err instanceof Error && err.name === 'AbortError';
}

function abortError(): Error {
	const err = new Error('the review was cancelled');
	err.name = 'AbortError';
	return err;
}
