import type { ReviewDimension, ReviewTimingPlan } from '../code-review/types.js';
import type { PreparedDimensionReview } from './code-review.js';
import type { ReviewJobTiming, ReviewPipelineJob } from './types.js';

export const REVIEW_MS_PER_PRIMARY_CHUNK = 600_000;
export const MAX_TIMER_SLICE_MS = 2_147_483_647;

function safe(value: number, label: string): number {
 if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid review timing ${label}`);
 return value;
}
export function reviewChunkBudget(count: number): number {
 safe(count, 'chunk count');
 return safe(count * REVIEW_MS_PER_PRIMARY_CHUNK, 'budget');
}
function deadline(start: number, budget: number): number {
 return safe(safe(start, 'start') + safe(budget, 'budget'), 'deadline');
}

/** Initial primary IDs/counts alone determine time; later planning never contributes. */
export function createReviewTimingPlan(prepared: readonly PreparedDimensionReview[], startedAt: number): ReviewTimingPlan {
 const dimensions = new Set<ReviewDimension>(), ids = new Set<string>();
 let total = 0;
 const breakdown = prepared.map(p => {
  if (dimensions.has(p.dimension) || ids.has(p.job.reviewId)) throw new Error('Duplicate dimension or job in review timing plan');
  dimensions.add(p.dimension); ids.add(p.job.reviewId);
  const n = safe(p.primaryChunkCount, 'primary chunk count');
  if (n !== p.primaryChunkIds.length) throw new Error('Review timing primary IDs/count disagree');
  if (new Set(p.primaryChunkIds).size !== n) throw new Error('Duplicate primary chunk ID');
  total = safe(total + n, 'aggregate chunk count');
  return Object.freeze({ dimension: p.dimension, primaryChunkCount: n, primaryChunkIds: p.primaryChunkIds, budgetMs: reviewChunkBudget(n) });
 });
 const chunkCount = Math.max(1, total), budgetMs = reviewChunkBudget(chunkCount);
 return Object.freeze({ startedAt: safe(startedAt, 'start'), budgetMs, deadlineAt: deadline(startedAt, budgetMs), chunkCount, dimensions: Object.freeze(breakdown) });
}

export function assertReviewTime(plan: Pick<ReviewTimingPlan, 'deadlineAt'>, now: number): void {
 safe(now, 'current time');
 if (now >= plan.deadlineAt) throw new Error('Code review chunk-derived deadline exhausted');
}

const activations = new WeakMap<PreparedDimensionReview, { root: ReviewTimingPlan; job: ReviewPipelineJob }>();

/** Activate a serial child now, rather than spending its budget during earlier dimensions. */
export function activateDimensionTiming(prepared: PreparedDimensionReview, root: ReviewTimingPlan, now: number): ReviewPipelineJob {
 const existing = activations.get(prepared);
 if (existing !== undefined) { if (existing.root !== root) throw new Error('Cannot reset a dimension timing plan'); return existing.job; }
 if (prepared.job.timing !== undefined) { if (prepared.job.timing.rootDeadlineAt !== root.deadlineAt) throw new Error('Cannot reset a dimension timing plan'); return prepared.job; }
 assertReviewTime(root, now);
 const item = root.dimensions.find(d => d.dimension === prepared.dimension);
 if (item === undefined || item.primaryChunkCount !== prepared.primaryChunkCount || item.primaryChunkIds.length !== prepared.primaryChunkIds.length || item.primaryChunkIds.some((id, i) => id !== prepared.primaryChunkIds[i])) throw new Error('Prepared dimension does not match frozen timing plan');
 const timing: ReviewJobTiming = Object.freeze({ primaryChunkCount: item.primaryChunkCount, budgetMs: item.budgetMs, startedAt: now,
  deadlineAt: item.primaryChunkCount === 0 ? root.deadlineAt : Math.min(root.deadlineAt, deadline(now, item.budgetMs)), rootDeadlineAt: root.deadlineAt });
 const job = { ...prepared.job, timing, deadlineAt: timing.deadlineAt, deadlineBudgetMs: item.budgetMs };
 activations.set(prepared, { root, job });
 return job;
}

/** Long derived budgets use bounded timer slices, never Node's overflowing timeout value. */
export function reviewTimerSlice(deadlineAt: number, now: number): number {
 safe(deadlineAt, 'deadline'); safe(now, 'current time');
 return Math.max(0, Math.min(MAX_TIMER_SLICE_MS, deadlineAt - now));
}
