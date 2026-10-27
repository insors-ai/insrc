import { AsyncLocalStorage } from 'node:async_hooks';

/** A transport allowance can only restrict a review; it never grants work or time. */
const executionCeiling = new AsyncLocalStorage<number>();
export function reviewOuterDeadlineAt(): number | undefined { return executionCeiling.getStore(); }
export function withReviewExecutionCeiling<T>(params: unknown, run: () => T): T {
	const ms = params !== null && typeof params === 'object' ? (params as Record<string, unknown>)['executionCeilingMs'] : undefined;
	if (ms === undefined) return run();
	if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) throw new Error('review: invalid outer execution ceiling');
	const deadline = Math.min(Date.now() + ms, reviewOuterDeadlineAt() ?? Infinity);
	return executionCeiling.run(deadline, run);
}
