import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInProcessGroup } from '../../../shared/process-group.js';
import type { LLMProvider, ReviewSessionOpts, StructuredCompletionOpts, StructuredSchema } from '../../../shared/types.js';
import { runCodeReview } from '../../code-review/runner.js';
import type { CodeReviewSubject } from '../../code-review/types.js';
import { runReviewJob } from '../driver.js';
import { applyOutput, createReviewJob, nextCalls } from '../job.js';
import type { ExecutionMode, ReviewAdapter, ReviewPipelineJob } from '../types.js';
import { atom, toyAdapter, toySnapshot } from './toy-adapter.js';
import { enveloped } from './enveloped.js';

function fixture(n = 1, execution: ExecutionMode = { mode: 'structured', cwd: '/repo', timeoutMs: 600_000 }) {
 const snapshot = toySnapshot(Array.from({ length: n }, (_, i) => atom(i, 2000)));
 const adapter = { ...toyAdapter(snapshot, { execution }), requiresChunking: true };
 const base = createReviewJob(adapter, 'daemon', snapshot, 4000, { now: 1000 });
 assert.equal(base.plan.chunks.length, n);
 const timing = Object.freeze({ primaryChunkCount: n, budgetMs: n * 600_000, startedAt: 1000, deadlineAt: 1000 + n * 600_000, rootDeadlineAt: 1000 + n * 600_000 });
 return { adapter, job: { ...base, timing, deadlineAt: timing.deadlineAt, deadlineBudgetMs: timing.budgetMs } };
}

test('DIFF-TIME-FIXED: structured and session dispatch use remaining time and reject a late valid answer before completion', async () => {
 for (const mode of ['structured', 'reviewer-session'] as const) {
  const { job, adapter } = fixture(1, mode === 'structured' ? { mode, timeoutMs: 600_000, inputContext: 'isolated' } : { mode, cwd: '/repo', deadlineMs: 600_000 });
  let now = 596_000, seen = 0, done = 0;
  const answer = (schema: StructuredSchema, timeout: number | undefined) => { seen++; assert.equal(timeout, 5000); return enveloped(schema, { seen: ['a0'] }); };
  const provider = { capabilities: { boundedStructuredInput: true }, completeStructured: async (_m: unknown, schema: StructuredSchema, opts?: StructuredCompletionOpts) => { assert.equal(opts!.boundedInput!.maxInputChars, 4000); return answer(schema, opts?.timeoutMs); }, runReviewSession: async (_p: unknown, schema: StructuredSchema, opts: ReviewSessionOpts) => answer(schema, opts.deadlineMs) } as unknown as LLMProvider;
  await runReviewJob(job, adapter, provider, { now: () => now, onDone: () => { done++; } }); assert.equal(seen, 1); assert.equal(done, 1);
  const lateProvider = { capabilities: { boundedStructuredInput: true }, completeStructured: async (_m: unknown, schema: StructuredSchema) => { now = 601_001; return enveloped(schema, { seen: ['a0'] }); }, runReviewSession: async (_p: unknown, schema: StructuredSchema) => { now = 601_001; return enveloped(schema, { seen: ['a0'] }); } } as unknown as LLMProvider;
  now = 596_000; done = 0;
  await assert.rejects(runReviewJob(job, adapter, lateProvider, { now: () => now, onDone: () => { done++; } }), /time limit|deadline/i); assert.equal(done, 0);
  assert.throws(() => nextCalls(job, adapter, 601_000), /time limit|deadline/i);
  const call = job.pending[0]!; assert.throws(() => applyOutput(job, adapter, call.callId, enveloped(call.schema, { seen: ['a0'] }), 601_000), /time limit|deadline/i);
 }
});

test('DIFF-TIME-FIXED: deterministic boundaries reject an output that finishes after the fixed deadline', async () => {
 const { job, adapter: base } = fixture(); let now = 1000, done = 0;
 const adapter: ReviewAdapter<unknown> = { ...base, stagesFor: () => [{ id: 'slow', kind: 'deterministic', after: [], onCallFailure: 'fail-review', singleCalls: () => [], chunkCalls: () => [], run: async () => { now = 601_000; return {}; } }] };
 const deterministic: ReviewPipelineJob = { ...job, stage: 'slow', pending: [] };
 await assert.rejects(runReviewJob(deterministic, adapter, {} as LLMProvider, { now: () => now, onDone: () => { done++; } }), /time limit|deadline/i); assert.equal(done, 0);
});

test('DIFF-TIME-OUTER: healthy serial structured and session jobs can exceed four hours under their derived budget', async () => {
 for (const mode of ['structured', 'reviewer-session'] as const) {
  const { job, adapter } = fixture(30, mode === 'structured' ? { mode, timeoutMs: 600_000 } : { mode, cwd: '/repo', deadlineMs: 600_000 });
  let now = 1000, calls = 0;
  const answer = (schema: StructuredSchema) => { calls++; now += 540_000; return enveloped(schema, { seen: [] }); };
  const provider = { completeStructured: async (_m: unknown, schema: StructuredSchema, opts?: StructuredCompletionOpts) => { assert.equal(opts?.timeoutMs, 600_000); return answer(schema); }, runReviewSession: async (_p: unknown, schema: StructuredSchema, opts: ReviewSessionOpts) => { assert.equal(opts.deadlineMs, 600_000); return answer(schema); } } as unknown as LLMProvider;
  await runReviewJob(job, adapter, provider, { now: () => now });
  assert.equal(calls, 30); assert.ok(now - 1000 > 4 * 60 * 60_000); assert.ok(now < job.timing.deadlineAt);
 }
});

test('DIFF-TIME-FIXED: timeout and explicit cancellation await the owned process close before reporting terminal failure', async () => {
 for (const cancel of [false, true]) {
  const { adapter, job: base } = fixture();
  const end = Date.now() + (cancel ? 60_000 : 250);
  const timing = { ...base.timing, startedAt: end - 600_000, deadlineAt: end, rootDeadlineAt: end };
  const job = { ...base, timing, deadlineAt: end };
  const controller = new AbortController(); let settled = false, started!: () => void, done = 0;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const provider = { completeStructured: async (_m: unknown, _s: unknown, opts?: StructuredCompletionOpts) => {
   const owned = runInProcessGroup(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 60_000, signal: opts!.signal });
   started(); const closed = await owned; assert.equal(closed.aborted, true);
   await new Promise<void>(resolve => setImmediate(resolve)); settled = true;
   const error = new Error('owned process closed'); error.name = 'AbortError'; throw error;
  } } as unknown as LLMProvider;
  const running = runReviewJob(job, adapter, provider, { signal: controller.signal, onDone: () => { done++; } });
  const rejected = assert.rejects(running, cancel ? /abort/i : /time limit|deadline/i);
  await ready; if (cancel) controller.abort(); await rejected;
  assert.equal(settled, true); assert.equal(done, 0);
 }
});


test('DIFF-TIME-FIXED: the final publication boundary refuses an expired root before any CR write', async () => {
 let now = 1000, end = 0, writes = 0;
 const subject: CodeReviewSubject = { repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001', changedFiles: [], approvedLld: { meta: { epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001', epicSlug: 'deadline', createdAt: '2026-10-27T00:00:00Z' }, body: {} } as unknown as CodeReviewSubject['approvedLld'], approvedPlan: null, buildRecord: null };
 const outcome = await runCodeReview(subject, {} as LLMProvider, { runId: 'late-finalize', modelLabel: 'fake', now: () => now, onProgress: frame => { if (frame.timing !== undefined) end = frame.timing.deadlineAt; if (frame.phase === 'finalize') now = end; } }, {
  judges: (['adherence', 'conventions', 'coverage', 'quality'] as const).map(dimension => ({ dimension, judge: async () => ({ dimension, findings: [] }) })),
  assembleGrounding: async () => ({ symbols: [] }), write: () => { writes++; },
 });
 assert.equal(outcome.ok, false); assert.equal(writes, 0); if (!outcome.ok) assert.match(outcome.error, /deadline exhausted/);
});
