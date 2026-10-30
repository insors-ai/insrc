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
import { UnsupportedBoundedInputError } from '../../agent/providers/bounded-input.js';
import { OllamaTargetError } from '../../agent/providers/ollama-target.js';
import { ModelResponseShapeError } from '../../agent/providers/model-call-error.js';
import { getLogger } from '../../shared/logger.js';
import type { LLMMessage, LLMProvider } from '../../shared/types.js';
import { AtomTooLargeError } from './pack-into-batches.js';
import { reviewTimerSlice } from './timing.js';
import { promptChars } from './envelope.js';
import { applyFailure, applyOutput, assertJobDeadline, deadlineError, nextCalls, result, runStage } from './job.js';
import type { FailureCause, ReviewAdapter, ReviewCall, ReviewPipelineJob } from './types.js';

const log = getLogger('review-pipeline:driver');

export interface RunReviewJobOpts {
 /** A size refusal that cannot split existing atoms may replace a derived material view. */
 readonly onMaterialRefusal?: ((job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, call: ReviewCall, maxChars: number | undefined, now: number) => { job: ReviewPipelineJob; adapter: ReviewAdapter<unknown> } | undefined) | undefined;
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
  assertJobDeadline(job, adapter, now());
		const calls = nextCalls(job, adapter, now());
		if (calls.length === 0) {
			opts.onStage?.(job.stage);
			job = job.timing === undefined ? await runStage(job, adapter, { signal, now }) : await ownedTimedWork(job, adapter, s => runStage(job, adapter, { signal: s, now }), signal, now);
   assertJobDeadline(job, adapter, now());
			continue;
		}
		// Serial: one call at a time, never more than one in flight.
		const call = calls[0]!;
		opts.onCall?.(call);
		let raw: unknown;
		try {
			const chars = promptChars(call.messages, call.schema);
			if (chars > job.plan.limitChars) throw new InputTooLargeError(`Review input ${chars} exceeds ${job.plan.limitChars} characters`, '', { actualChars: chars, maxChars: job.plan.limitChars });
			raw = job.timing === undefined ? await untilAborted(send(provider, call, signal, job.plan.limitChars), signal)
    : await ownedTimedWork(job, adapter, s => send(provider, call, s, job.plan.limitChars), signal, now, call.execution.mode === 'structured' ? call.execution.timeoutMs : call.execution.deadlineMs);
		} catch (err) {
			throwIfAborted(signal);
   assertJobDeadline(job, adapter, now());
			// An Ollama server that cannot serve the review fails it with the cause; nothing is judged on it.
			if (isAbortError(err) || err instanceof OllamaTargetError || err instanceof UnsupportedBoundedInputError || (err instanceof Error && 'code' in err && err.code === 'unsupported-bounded-input')) throw err;
			// Matched by name, as today: a session that ran out its time fails the review, never re-issued.
			if (err instanceof Error && err.name === 'ReviewSessionTimeoutError') throw deadlineError(job, adapter);
			const failure = classify(err);
			log.warn({ dimension: job.dimension, stage: call.stage, role: call.role, attempt: call.attempt, cause: failure.cause, detail: failure.detail }, 'review pipeline: a call did not complete');
			try {
    job = applyFailure(job, adapter, call.callId, failure.cause, failure.maxChars, { detail: failure.detail, now: now(), ...(failure.reasons !== undefined ? { reasons: failure.reasons } : {}) });
   } catch (refusal) {
    const replacement = failure.cause === 'size-refusal' && refusal instanceof AtomTooLargeError
     ? opts.onMaterialRefusal?.(job, adapter, call, failure.maxChars, now()) : undefined;
    if (replacement === undefined) throw refusal;
    job = replacement.job; adapter = replacement.adapter;
   }
			continue;
		}
		// An answer that arrives after a cancel is not applied.
		throwIfAborted(signal);
		job = applyOutput(job, adapter, call.callId, raw, now());
	}
	throwIfAborted(signal);
 assertJobDeadline(job, adapter, now());
 opts.onDone?.(job);
	return result(job);
}

/** A shorter per-call limit remains distinct from exhausting the fixed review budget. */
export class ReviewCallTimeoutError extends Error {
 constructor(ms: number) { super(`Review call exceeded its per-call limit of ${ms} ms`); this.name = 'ReviewCallTimeoutError'; }
}

/** Abort owned execution at the deadline, but do not report terminal completion before it settles. */
async function ownedTimedWork<T>(job: ReviewPipelineJob, adapter: ReviewAdapter<unknown>, work: (signal: AbortSignal) => Promise<T>, parent: AbortSignal | undefined, now: () => number, perCallMs?: number): Promise<T> {
 throwIfAborted(parent); assertJobDeadline(job, adapter, now());
 const controller = new AbortController(), start = now();
 const reviewEnd = Math.min(job.timing!.deadlineAt, job.timing!.rootDeadlineAt);
 const end = perCallMs === undefined ? reviewEnd : Math.min(reviewEnd, start + perCallMs);
 let reason: Error | undefined, timer: ReturnType<typeof setTimeout> | undefined;
 const timeout = (): Error => end < reviewEnd ? new ReviewCallTimeoutError(perCallMs!) : deadlineError(job, adapter);
 const abort = (error: Error): void => { reason ??= error; controller.abort(reason); };
 const onAbort = (): void => abort(abortError());
 const arm = (): void => {
  const delay = reviewTimerSlice(end, now());
  if (delay === 0) { abort(timeout()); return; }
  timer = setTimeout(() => { if (now() >= end) abort(timeout()); else arm(); }, delay);
 };
 parent?.addEventListener('abort', onAbort, { once: true });
 arm();
 try {
  if (reason !== undefined) throw reason;
  const output = await work(controller.signal);
  if (reason !== undefined) throw reason;
  assertJobDeadline(job, adapter, now());
  if (now() >= end) throw timeout();
  return output;
 } catch (err) {
  if (reason !== undefined) throw reason;
  assertJobDeadline(job, adapter, now());
  throw err;
 } finally {
  if (timer !== undefined) clearTimeout(timer);
  parent?.removeEventListener('abort', onAbort);
 }
}

/** Make one call with its execution mode; the provider makes exactly one attempt. */
async function send(provider: LLMProvider, call: ReviewCall, signal: AbortSignal | undefined, maxInputChars: number): Promise<unknown> {
	const exec = call.execution;
	if (exec.mode === 'reviewer-session') {
		if (provider.runReviewSession === undefined) {
			throw new Error('This review needs a reviewer session (a claude, codex or Ollama provider); the configured review provider has none.');
		}
		return provider.runReviewSession<unknown>(sessionPrompt(call.messages), call.schema, {
			cwd: exec.cwd, deadlineMs: exec.deadlineMs, internalRetry: false,
			...(exec.stallMs !== undefined ? { stallMs: exec.stallMs } : {}),
			...(signal !== undefined ? { signal } : {}),
		});
	}
	if (exec.inputContext === 'isolated' && provider.capabilities?.boundedStructuredInput !== true) throw new UnsupportedBoundedInputError('Provider does not enforce bounded structured input');
	return provider.completeStructured<unknown>([...call.messages], call.schema, {
		...(exec.inputContext === 'isolated' ? { boundedInput: { maxInputChars, contextMode: 'isolated-structured' as const } } : {}),
		internalRetry: false,
		...(exec.cwd !== undefined ? { cwd: exec.cwd } : {}),
		...(exec.timeoutMs !== undefined ? { timeoutMs: exec.timeoutMs } : {}),
		...(exec.stallMs !== undefined ? { stallMs: exec.stallMs } : {}),
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
function classify(err: unknown): { cause: FailureCause; maxChars?: number | undefined; detail: string; reasons?: readonly string[] | undefined } {
	const detail = err instanceof Error ? err.message : String(err);
	if (err instanceof InputTooLargeError) return { cause: 'size-refusal', maxChars: err.maxChars, detail };
	if (err instanceof CliStallError) return { cause: 'stall', detail };
	if (err instanceof ModelResponseShapeError) return { cause: 'invalid-answer', detail, ...(err.reasons.length > 0 ? { reasons: err.reasons } : {}) };
	if (/^structured-output: validation failed/.test(detail)) return { cause: 'invalid-answer', detail };
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
