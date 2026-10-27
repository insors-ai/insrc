/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ReviewBudgetBreakdown } from '../../shared/review-budget.js';
import type { ReviewCall, ReviewPipelineJob } from './types.js';

export type ReviewCallOutcome = 'start' | 'success' | 'failure' | 'cancel' | 'refused';
export type ReviewCallErrorCode = 'budget-refused' | 'invalid-answer' | 'size-refusal' | 'stall' | 'transient' | 'timeout' | 'cancelled' | 'call-failed';
export interface ReviewCallEvent {
	readonly event: ReviewCallOutcome;
	readonly reviewId?: string | undefined;
	readonly callId?: string | undefined;
	readonly chunkId?: string | undefined;
	readonly dimension: string;
	readonly stage: string;
	readonly role: string;
	readonly attempt: number;
	readonly transport: string;
	readonly policyVersion: number;
	readonly qualification: ReviewBudgetBreakdown['qualification'];
	readonly budget: ReviewBudgetBreakdown;
	readonly durationMs: number;
	readonly errorCode?: ReviewCallErrorCode | undefined;
}

const uuid = (value: string): string | undefined => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : undefined;
const member = (value: string, values: readonly string[]): string => values.includes(value) ? value : 'other';

/** Unknown labels/IDs are never echoed into persistent call events. */
export function reviewCallEvent(job: ReviewPipelineJob, call: ReviewCall, budget: ReviewBudgetBreakdown, event: ReviewCallOutcome, durationMs: number, errorCode?: ReviewCallErrorCode): ReviewCallEvent {
	return {
		event, reviewId: uuid(job.reviewId), callId: uuid(call.callId),
		chunkId: call.carries.chunkId !== undefined && /^c\d+$/.test(call.carries.chunkId) ? call.carries.chunkId : undefined,
		dimension: member(job.dimension, ['adherence', 'conventions', 'coverage', 'functional-coverage', 'quality', 'diagram', 'ux', 'premise', 'template']),
		stage: member(call.stage, ['judge', 'compare', 'pair', 'extract', 'probe', 'verify', 'template', 'run', 'skip', 'gather', 'reduce']),
		role: member(call.role, ['single', 'chunk', 'reduce', 'obligation', 'relation', 'merge']),
		attempt: Number.isSafeInteger(call.attempt) && call.attempt > 0 ? call.attempt : 0,
		transport: member(job.budgetPolicy.profile.transport, ['claude', 'codex', 'ollama', 'controller']),
		policyVersion: job.budgetPolicy.policyVersion, qualification: budget.qualification, budget,
		durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.floor(durationMs) : 0,
		...(errorCode !== undefined ? { errorCode } : {}),
	};
}
