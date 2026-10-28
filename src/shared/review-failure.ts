import { REVIEW_WORK_UNIT_MS } from './review-execution-time.js';
/** Review diagnostics never retain arbitrary dependency/provider exception text. */
const CATEGORIES = new Set(['review-job', 'review-attempt', 'review-stage', 'external-review-transport', 'external-review-idle', 'review-freshness']);
const FAILURES = new Set(['unknown-method', 'unreachable', 'closed', 'timeout', 'protocol', 'aborted', 'daemon-error']);
export function safeReviewFailure(error: unknown): string {
	if (!error || typeof error !== 'object') return 'review-failed';
	const value = error as { timeoutKind?: unknown | undefined; failure?: unknown | undefined; name?: unknown | undefined };
	if (typeof value.timeoutKind === 'string' && CATEGORIES.has(value.timeoutKind)) return value.timeoutKind;
	if (typeof value.failure === 'string' && FAILURES.has(value.failure)) return value.failure;
	if (value.name === 'SamePartyReviewError') return 'same-party-review';
	if (value.name === 'AbortError') return 'cancelled';
	return 'review-failed';
}
export function reviewTimeoutMessage(error: unknown): string {
	const value = error as { timeoutKind?: unknown | undefined; timing?: { logicalWorkUnits?: unknown | undefined; jobBudgetMs?: unknown | undefined } | undefined };
	const units = value?.timing?.logicalWorkUnits, budget = value?.timing?.jobBudgetMs;
	return value?.timeoutKind === 'review-job' && Number.isSafeInteger(units) && Number.isSafeInteger(budget)
		? `review-job-timeout: ${units} work chunks × ${REVIEW_WORK_UNIT_MS / 60_000} minutes = ${budget}ms total execution budget`
		: safeReviewFailure(error);
}
