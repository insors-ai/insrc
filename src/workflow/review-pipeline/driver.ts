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

import { reviewOuterDeadlineAt } from '../../shared/review-execution-time.js';
import type { ReviewExecutionBudget } from '../../shared/review-budget.js';
import { preflightProviderReviewBudget, reviewWireSchemaJson } from '../../agent/providers/review-budget.js';
import { ReviewBudgetError } from './budget.js';
import { requestBudget } from './measurement.js';
import { reviewCallEvent, type ReviewCallEvent, type ReviewCallOutcome, type ReviewCallErrorCode } from './call-events.js';
import { serialiseMessages as sessionPrompt } from '../../agent/providers/cli-wire.js';
import { CliStallError, InputTooLargeError, ReviewSessionTimeoutError } from '../../agent/providers/cli-provider.js';
import { ModelCallFailedError, ModelResponseShapeError } from '../../agent/providers/model-call-error.js';
import { getLogger } from '../../shared/logger.js';
import type { LLMProvider } from '../../shared/types.js';
import { applyFailure, applyOutput, deadlineError, nextCalls, result, runStage } from './job.js';
import type { FailureCause, ReviewAdapter, ReviewCall, ReviewPipelineJob } from './types.js';

const log = getLogger('review-pipeline:driver');

export interface RunReviewJobOpts {
	/** Known remaining outer execution allowance; incompatibility fails explicitly. */
	readonly outerCeilingMs?: number | undefined;
	/** Content-free per-call lifecycle progress; existing onCall remains start-only. */
	readonly onCallEvent?: ((event: ReviewCallEvent) => void) | undefined;
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
	const outerStartedAt = now();
	const outerDeadlineAt = Math.min(opts.outerCeilingMs === undefined ? Infinity : outerStartedAt + opts.outerCeilingMs, reviewOuterDeadlineAt() ?? Infinity);
	while (job.phase !== 'done') {
		throwIfAborted(signal);
		if (job.deadlineAt !== undefined && job.deadlineAt > outerDeadlineAt) {
			throw Object.assign(new Error(`review transport-ceiling-incompatible: job requires ${job.deadlineBudgetMs}ms; outer remaining allowance ${outerDeadlineAt - now()}ms`), { timeoutKind: 'external-review-transport', timing: { requiredMs: job.deadlineBudgetMs, remainingMs: Math.max(0, outerDeadlineAt - now()) } });
		}
		const calls = nextCalls(job, adapter, now());
		if (calls.length === 0) {
			opts.onStage?.(job.stage);
			job = await runStage(job, adapter, { signal, now, outerDeadlineAt });
			continue;
		}
		// Serial: one call at a time, never more than one in flight.
		const call = calls[0]!;
		let admitted = call.budget;
		const emit = (event: ReviewCallOutcome, durationMs: number, errorCode?: ReviewCallErrorCode): void => {
			const metadata = reviewCallEvent(job, call, admitted, event, durationMs, errorCode, now());
			log.info(metadata, 'review pipeline: call lifecycle');
			try { opts.onCallEvent?.(metadata); } catch { log.warn({ errorCode: 'observer-failed' }, 'review progress observer failed'); }
		};
		let budget: ReviewExecutionBudget;
		try {
			if (!provider.getReviewBudgetProfile) throw new ReviewBudgetError('native-budget-unqualified');
			const kind = call.execution.mode === 'reviewer-session' ? 'reviewer-session' : 'structured';
			if (job.budgetPolicy.executionKind !== kind) throw new ReviewBudgetError('budget-profile-mismatch');
			const profile = provider.getReviewBudgetProfile(kind);
			admitted = requestBudget(job.budgetPolicy, call.messages, call.schema, 'dispatch');
			budget = { policy: job.budgetPolicy, admitted, outputAllowanceTokens: job.budgetPolicy.profile.completionReserveTokens,
				reviewId: job.reviewId, callId: call.callId, stage: call.stage, role: call.role, attempt: call.attempt };
			preflightProviderReviewBudget(budget, profile, admitted.promptChars, reviewWireSchemaJson(profile, call.schema));
		} catch (err) {
			if (err instanceof ReviewBudgetError && err.breakdown) admitted = err.breakdown;
			emit('start', 0);
			emit('refused', 0, 'budget-refused');
			throw err instanceof ReviewBudgetError ? err : new ReviewBudgetError('native-budget-unqualified', admitted, { stage: call.stage, callId: call.callId });
		}
		const startedAt = performance.now();
		const attemptStartedAt = now();
		const attemptMs = call.execution.mode === 'reviewer-session' ? call.execution.deadlineMs : call.execution.timeoutMs!;
		const attemptController = new AbortController();
		const attemptSignal = signal === undefined ? attemptController.signal : AbortSignal.any([signal, attemptController.signal]);
		const attemptTimer = setTimeout(() => attemptController.abort(new ReviewSessionTimeoutError(attemptMs)), attemptMs);
		let outcome: ReviewCallOutcome = 'failure';
		let errorCode: ReviewCallErrorCode | undefined = 'call-failed';
		try {
			emit('start', 0);
			opts.onCall?.(call);
			throwIfAborted(signal);
			let raw: unknown;
			try {
				raw = await untilAborted(send(provider, call, budget, attemptSignal), attemptSignal);
			} catch (err) {
				throwIfAborted(signal);
				if (attemptController.signal.aborted) { errorCode = 'timeout'; throw job.deadlineAt !== undefined && now() >= job.deadlineAt ? deadlineError(job, adapter) : attemptTimeout(attemptMs); }
				if (err instanceof ReviewBudgetError) {
					if (err.breakdown) admitted = err.breakdown;
					errorCode = 'budget-refused'; throw err;
				}
				if (isAbortError(err)) throw err;
				if (err instanceof Error && err.name === 'ReviewSessionTimeoutError') { errorCode = 'timeout'; throw job.deadlineAt !== undefined && now() >= job.deadlineAt ? deadlineError(job, adapter) : attemptTimeout(attemptMs); }
				const failure = classify(err);
				errorCode = failure.cause === 'identifier-mismatch' ? 'invalid-answer' : failure.cause;
				// Only stable categories persist. Detailed semantic corrections remain ephemeral prompt input.
				job = applyFailure(job, adapter, call.callId, failure.cause, failure.maxChars, { detail: failure.cause, now: now(), ...(failure.reasons !== undefined ? { reasons: failure.reasons } : {}) });
				continue;
			}
			throwIfAborted(signal);
			if (now() >= attemptStartedAt + attemptMs) { errorCode = 'timeout'; throw job.deadlineAt !== undefined && now() >= job.deadlineAt ? deadlineError(job, adapter) : attemptTimeout(attemptMs); }
			job = applyOutput(job, adapter, call.callId, raw, now());
			const accepted = job.answered.some(answer => answer.callId === call.callId);
			outcome = accepted ? 'success' : 'failure';
			errorCode = accepted ? undefined : 'invalid-answer';
		} catch (err) {
			if (signal?.aborted === true || isAbortError(err)) { outcome = 'cancel'; errorCode = 'cancelled'; }
			if (err instanceof ReviewBudgetError) errorCode = 'budget-refused';
			const timeoutKind = (err as { timeoutKind?: unknown | undefined } | null)?.timeoutKind;
			if (timeoutKind === 'review-attempt') errorCode = 'attempt-timeout';
			if (timeoutKind === 'review-job') errorCode = 'job-timeout';
			throw err;
		} finally {
			clearTimeout(attemptTimer);
			emit(outcome, performance.now() - startedAt, errorCode);
		}
	}
	opts.onDone?.(job);
	return result(job);
}

/** Make one call with its execution mode; the provider makes exactly one attempt. */
async function send(provider: LLMProvider, call: ReviewCall, reviewBudget: ReviewExecutionBudget, signal: AbortSignal | undefined): Promise<unknown> {
	const exec = call.execution;
	if (exec.mode === 'reviewer-session') {
		if (provider.runReviewSession === undefined) {
			throw new Error('This review needs a reviewer session (a claude, codex or Ollama provider); the configured review provider has none.');
		}
		return provider.runReviewSession<unknown>(sessionPrompt(call.messages), call.schema, {
			reviewBudget, cwd: exec.cwd, deadlineMs: exec.deadlineMs, internalRetry: false,
			...(exec.stallMs !== undefined ? { stallMs: exec.stallMs } : {}),
			...(signal !== undefined ? { signal } : {}),
		});
	}
	return provider.completeStructured<unknown>([...call.messages], call.schema, {
		reviewBudget, internalRetry: false,
		...(exec.cwd !== undefined ? { cwd: exec.cwd } : {}),
		...(exec.timeoutMs !== undefined ? { timeoutMs: exec.timeoutMs } : {}),
		...(exec.stallMs !== undefined ? { stallMs: exec.stallMs } : {}),
		...(signal !== undefined ? { signal } : {}),
	});
}

/** Why a call did not complete. Anything not recognised is treated as transient: re-issued once, as today's retries would. */
function classify(err: unknown): { cause: FailureCause; maxChars?: number | undefined; reasons?: readonly string[] | undefined } {
	const detail = err instanceof Error ? err.message : String(err);
	if (err instanceof ModelCallFailedError) return { cause: 'transient' };
	if (err instanceof InputTooLargeError) return { cause: 'size-refusal', maxChars: err.maxChars };
	if (err instanceof CliStallError) return { cause: 'stall' };
	if (err instanceof ModelResponseShapeError) return { cause: 'invalid-answer', ...(err.reasons.length > 0 ? { reasons: err.reasons } : {}) };
	if (/^structured-output: validation failed/.test(detail)) return { cause: 'invalid-answer' };
	return { cause: 'transient' };
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

function attemptTimeout(limitMs: number): Error {
	return Object.assign(new ReviewSessionTimeoutError(limitMs), { timeoutKind: 'review-attempt', limitMs });
}
