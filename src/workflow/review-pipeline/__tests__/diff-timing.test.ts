import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LLMProvider } from '../../../shared/types.js';
import type { CodeReviewSubject, ReviewDimension } from '../../code-review/types.js';
import { runCodeReview, DEFAULT_DEPS } from '../../code-review/runner.js';
import { prepareDimensionJob, executeDimensionJob, type PreparedDimensionReview } from '../code-review.js';
import { activateDimensionTiming, assertReviewTime, createReviewTimingPlan, MAX_TIMER_SLICE_MS, reviewChunkBudget, reviewTimerSlice } from '../timing.js';
import { applyFailure, applyOutput } from '../job.js';
import { atom, toyAdapter, toySnapshot } from './toy-adapter.js';
import type { ReviewAdapter } from '../types.js';
import type { DimensionResult } from '../../code-review/types.js';

const subject: CodeReviewSubject = { repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001', changedFiles: [], approvedLld: null, approvedPlan: null, buildRecord: null };
function prepared(n: number, dimension: ReviewDimension = 'quality', start = 1000, gather = false): PreparedDimensionReview {
 const snapshot = toySnapshot(Array.from({ length: n }, (_, i) => atom(i, 2000)), [], gather ? ['parent'] : []);
 return prepareDimensionJob(() => ({ ...toyAdapter(snapshot, gather ? { gatherLimit: 4000 } : {}), dimension, requiresChunking: true }) as unknown as ReviewAdapter<DimensionResult>, subject, { symbols: [] }, { inputBudgetChars: 4000 } as LLMProvider, { groundingMode: 'degraded', snapshot, now: () => start });
}

test('DIFF-TIME-PLAN: real primary plans freeze 1/5/20 chunk budgets and aggregate five model dimensions with deterministic zero counts', () => {
 for (const n of [1, 5, 20]) {
  const p = prepared(n); assert.equal(p.job.plan.chunks.length, n); assert.equal(p.primaryChunkCount, n);
  const plan = createReviewTimingPlan([p], 1000);
  assert.equal(plan.chunkCount, n); assert.equal(plan.budgetMs, 600_000 * n); assert.equal(plan.deadlineAt, 1000 + 600_000 * n);
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.dimensions) && Object.isFrozen(plan.dimensions[0]!.primaryChunkIds));
 }
 const all = (['adherence', 'conventions', 'coverage', 'quality', 'functional-coverage'] as const).map((d, i) => prepared(i + 1, d));
 const zero = (['diagram', 'ux'] as const).map(d => ({ ...prepared(1, d), primaryChunkCount: 0, primaryChunkIds: Object.freeze([]) }));
 const plan = createReviewTimingPlan([...all, ...zero], 1000);
 assert.equal(plan.chunkCount, 15); assert.equal(plan.budgetMs, 9_000_000); assert.deepEqual(plan.dimensions.map(d => d.primaryChunkCount), [1, 2, 3, 4, 5, 0, 0]);
 assert.equal(new Set(plan.dimensions.flatMap(d => d.primaryChunkIds)).size, 15);
 assert.equal(createReviewTimingPlan(zero, 1000).budgetMs, 600_000);
 assert.throws(() => createReviewTimingPlan([all[0]!, all[0]!], 1000), /Duplicate/);
 for (const invalid of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER]) assert.throws(() => reviewChunkBudget(invalid), /Invalid/);
 assert.throws(() => createReviewTimingPlan([prepared(1)], Number.MAX_SAFE_INTEGER - 1), /Invalid/);
 const long = MAX_TIMER_SLICE_MS * 2 + 1000;
 assert.equal(reviewTimerSlice(long, 1000), MAX_TIMER_SLICE_MS); assert.equal(reviewTimerSlice(long, long - 100), 100); assert.equal(reviewTimerSlice(long, long + 1), 0);
});

test('DIFF-TIME-FIXED: serial children activate on execution and retain their original deadlines through corrections, redivision and gather', () => {
 const first = prepared(5, 'conventions'), later = prepared(1, 'quality', 1000, true);
 const plan = createReviewTimingPlan([first, later], 1000);
 const a = activateDimensionTiming(first, plan, 1000);
 assert.equal(a.timing!.deadlineAt, 3_001_000);
 const b = activateDimensionTiming(later, plan, 2_901_000);
 assert.equal(b.timing!.startedAt, 2_901_000); assert.equal(b.timing!.deadlineAt, 3_501_000);
 assert.equal(activateDimensionTiming(later, plan, 3_000_000), b, 're-entry cannot restart the child clock');
 const initialCall = a.pending[0]!;
 const corrected = applyFailure(a, first.adapter, initialCall.callId, 'invalid-answer', undefined, { now: 2000, reasons: ['test correction'] });
 assert.equal(corrected.timing, a.timing); assert.equal(corrected.deadlineAt, a.deadlineAt);
 const refused = applyFailure(a, first.adapter, initialCall.callId, 'input-too-large', 3500, { now: 3000 });
 assert.equal(refused.timing, a.timing); assert.equal(refused.timing!.primaryChunkCount, 5);
 let current = b;
 for (const call of current.pending) current = applyOutput(current, later.adapter, call.callId, { callId: call.callId, answer: { seen: call.carries.atomIds, notes: [{ key: 'parent', text: 'parent evidence' }] } }, 3_000_000);
 assert.equal(current.timing, b.timing);
 assert.equal(current.pending[0]!.role, 'obligation');
 const gathered = current.pending[0]!;
 current = applyOutput(current, later.adapter, gathered.callId, { callId: gathered.callId, answer: { verdict: 'pass' } }, 3_000_001);
 assert.equal(current.phase, 'done'); assert.equal(current.timing, b.timing); assert.equal(current.deadlineAt, b.deadlineAt);
 const capped = activateDimensionTiming(prepared(1, 'coverage'), createReviewTimingPlan([prepared(1, 'coverage')], 1000), 590_000);
 assert.equal(capped.timing!.deadlineAt, 601_000);
 assert.throws(() => assertReviewTime(plan, plan.deadlineAt), /deadline exhausted/);
});

test('DIFF-TIME-PLAN: preparation elapsed time is charged before execution and can exhaust the derived root budget without a model call', async () => {
 let now = 1000, calls = 0, writes = 0;
 const provider = { completeStructured: async () => { calls++; throw new Error('must not dispatch'); } } as unknown as LLMProvider;
 const slots = DEFAULT_DEPS.judges.map(slot => ({ ...slot, prepare: (...args: Parameters<NonNullable<typeof slot.prepare>>) => { const ready = slot.prepare!(...args); now += 700_000; return ready; } }));
 const outcome = await runCodeReview(subject, provider, { runId: 'expired-prepare', modelLabel: 'fake', now: () => now }, { judges: slots, assembleGrounding: async () => ({ symbols: [] }), write: () => { writes++; } });
 assert.equal(outcome.ok, false); if (!outcome.ok) assert.match(outcome.error, /deadline exhausted/);
 assert.equal(calls, 0); assert.equal(writes, 0);
 const p = prepared(1, 'quality', 1000);
 await assert.rejects(executeDimensionJob(p, provider, { groundingMode: 'degraded', now: () => 601_000 }), /deadline exhausted/);
});
