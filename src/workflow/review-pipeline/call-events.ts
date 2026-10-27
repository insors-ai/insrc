/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { REVIEW_WORK_UNIT_MS } from '../../shared/review-execution-time.js';
import { createHash } from 'node:crypto';
import type { ReviewBudgetBreakdown } from '../../shared/review-budget.js';
import type { ReviewCall, ReviewPipelineJob } from './types.js';

export type ReviewCallOutcome = 'start' | 'success' | 'failure' | 'cancel' | 'refused';
export type ReviewCallErrorCode = 'budget-refused' | 'invalid-answer' | 'size-refusal' | 'stall' | 'transient' | 'timeout' | 'cancelled' | 'call-failed' | 'attempt-timeout' | 'job-timeout';
export interface ReviewCallEvent {
	readonly event: ReviewCallOutcome;
	readonly reviewId?: string | undefined;
	readonly callId?: string | undefined;
	readonly chunkId?: string | undefined;
	readonly obligationKey?: string | undefined;
	readonly dimension: string;
	readonly stage: string;
	readonly role: string;
	readonly attempt: number;
	readonly transport: string;
	readonly policyVersion: number;
	readonly qualification: ReviewBudgetBreakdown['qualification'];
	readonly budget: ReviewBudgetBreakdown;
	readonly durationMs: number;
	readonly timing: { readonly kind: 'review-execution'; readonly logicalWorkUnits: number; readonly jobBudgetMs: number; readonly totalBudgetMs: number; readonly currentBudgetChunkCount: number; readonly deadlineAt?: number | undefined; readonly attemptLimitMs: number; readonly timeBudgetUnitMs: number; readonly elapsedMs: number; readonly remainingMs: number };
	readonly errorCode?: ReviewCallErrorCode | undefined;
}

export const safeReviewId = (value: string): string | undefined => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : undefined;
const member = (value: string, values: readonly string[]): string => values.includes(value) ? value : 'other';

/** Unknown labels/IDs are never echoed into persistent call events. */
export function reviewCallEvent(job: ReviewPipelineJob, call: ReviewCall, budget: ReviewBudgetBreakdown, event: ReviewCallOutcome, durationMs: number, errorCode?: ReviewCallErrorCode, now: number = Date.now()): ReviewCallEvent {
	return {
		event, reviewId: safeReviewId(job.reviewId), callId: safeReviewId(call.callId),
		...(call.carries.key !== undefined ? { obligationKey: createHash('sha256').update(call.carries.key).digest('hex').slice(0, 24) } : {}),
		chunkId: call.carries.chunkId !== undefined && /^c\d+$/.test(call.carries.chunkId) ? call.carries.chunkId : undefined,
		dimension: member(job.dimension, ['adherence', 'conventions', 'coverage', 'functional-coverage', 'quality', 'diagram', 'ux', 'premise', 'template']),
		stage: member(call.stage, ['judge', 'compare', 'pair', 'extract', 'probe', 'verify', 'template', 'run', 'skip', 'gather', 'reduce']),
		role: member(call.role, ['single', 'chunk', 'reduce', 'obligation', 'relation', 'merge']),
		attempt: Number.isSafeInteger(call.attempt) && call.attempt > 0 ? call.attempt : 0,
		transport: member(job.budgetPolicy.profile.transport, ['claude', 'codex', 'ollama', 'controller']),
		timing: { ...reviewTiming(job, now), attemptLimitMs: call.execution.mode === 'reviewer-session' ? call.execution.deadlineMs : (call.execution.timeoutMs ?? 0) },
		policyVersion: job.budgetPolicy.policyVersion, qualification: budget.qualification, budget,
		durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.floor(durationMs) : 0,
		...(errorCode !== undefined ? { errorCode } : {}),
	};
}

export function reviewTiming(job: ReviewPipelineJob, now: number = Date.now()) {
	return { currentBudgetChunkCount: job.workUnits.filter(unit => !unit.replaced).length, totalBudgetMs: job.deadlineBudgetMs ?? 0, kind: 'review-execution' as const, timeBudgetUnitMs: REVIEW_WORK_UNIT_MS, logicalWorkUnits: job.workUnits.filter(unit => !unit.replaced).length + (job.priorWorkBudgetMs ?? 0) / REVIEW_WORK_UNIT_MS,
		jobBudgetMs: job.deadlineBudgetMs ?? 0, deadlineAt: job.deadlineAt,
		elapsedMs: job.executionStartedAt === undefined ? 0 : Math.max(0, now - job.executionStartedAt),
		remainingMs: job.deadlineAt === undefined ? 0 : Math.max(0, job.deadlineAt - now) };
}

export function reviewFailureCode(error: unknown): ReviewCallErrorCode {
	const value = error as { timeoutKind?: unknown | undefined; code?: unknown | undefined; name?: unknown | undefined } | null;
	if (value?.timeoutKind === 'review-job' || value?.code === 'review-job-timeout') return 'job-timeout';
	if (value?.timeoutKind === 'review-attempt' || value?.code === 'review-attempt-timeout') return 'attempt-timeout';
	if (value?.name === 'AbortError' || value?.name === 'ReviewStateRefused') return 'cancelled';
	if (value?.name === 'ReviewBudgetError' || value?.name === 'AtomTooLargeError') return 'budget-refused';
	return 'call-failed';
}
