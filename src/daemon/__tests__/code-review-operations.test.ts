import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { CodeReviewStreamResult } from '../../shared/review-stream.js';
import type { ReviewInputFingerprint, ReviewTimingPlan } from '../../workflow/code-review/types.js';
import { canonicalReviewJson } from '../../workflow/code-review/input-fingerprint.js';
import { CodeReviewOperationRegistry, CODE_REVIEW_TERMINAL_GRACE_MS } from '../code-review-operations.js';

const target = { repo: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001' };
function fingerprint(source = '0'.repeat(64)): ReviewInputFingerprint {
 const payload = { schemaVersion: 1 as const, repoPath: target.repo, epicHash: target.epicHash, storyId: target.storyId, author: 'controller' as const, sourceDigest: source, contractDigest: '1'.repeat(64), buildDigest: '2'.repeat(64), testsDigest: '3'.repeat(64) };
 return { ...payload, digest: createHash('sha256').update(canonicalReviewJson(payload)).digest('hex') };
}
const result = { runId: 'one-review', artifact: { meta: {}, body: { verdict: 'warn' } } } as unknown as CodeReviewStreamResult;
class Clock {
 now = 1000; private seq = 0; private timers = new Map<number, { at: number; fn: () => void }>();
 setTimer = (fn: () => void, ms: number): number => { const id = ++this.seq; this.timers.set(id, { at: this.now + ms, fn }); return id; };
 clearTimer = (id: unknown): void => { this.timers.delete(id as number); };
 tick(ms: number): void {
  const end = this.now + ms;
  for (;;) { const next = [...this.timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; this.now = next[1].at; this.timers.delete(next[0]); next[1].fn(); }
  this.now = end;
 }
}
const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const registry = (clock: Clock) => new CodeReviewOperationRegistry({ now: () => clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
function timing(count: number, start = 1000): ReviewTimingPlan {
 return { startedAt: start, chunkCount: count, budgetMs: count * 600_000, deadlineAt: start + count * 600_000, dimensions: [{ dimension: 'quality', primaryChunkCount: count, primaryChunkIds: Array.from({ length: count }, (_, i) => `quality:c${i + 1}`), budgetMs: count * 600_000 }] };
}

test('DIFF-WAIT-RESUME: repeated starts and bounded detached waiters share one execution and one immutable cached result', async () => {
 const clock = new Clock(), owner = registry(clock); let executions = 0, finish!: () => void, signal: AbortSignal | undefined;
 const input = { fingerprint: fingerprint(), startedAt: clock.now, execute: async (s: AbortSignal) => { executions++; signal = s; await new Promise<void>(resolve => { finish = resolve; }); return result; } };
 try {
  const handle = owner.start(input); await flush(); assert.equal(executions, 1); assert.equal(owner.start(input), handle);
  const request = new AbortController(); const waiting = owner.wait(handle, target, { signal: request.signal });
  const detached = assert.rejects(waiting, /waiter aborted/); request.abort(); await detached; assert.equal(signal!.aborted, false);
  const bounded = owner.wait(handle, target, { waitMs: 999_999_999 }); clock.tick(200_000); const pending = await bounded;
  assert.equal(pending.status, 'pending'); assert.ok(!('artifact' in pending) && !('result' in pending)); assert.equal(signal!.aborted, false);
  assert.throws(() => owner.start({ ...input, fingerprint: fingerprint('f'.repeat(64)) }), /different inputs/);
  assert.throws(() => owner.status(handle, { ...target, storyId: 'S002' }), /does not belong/);
  finish(); await flush(); const done = owner.status(handle, target); assert.equal(done.status, 'done'); assert.equal(owner.start(input), handle); assert.equal(executions, 1);
  if (done.status === 'done') (done.result as { runId: string }).runId = 'mutated caller copy';
  const cached = owner.status(handle, target); assert.ok(cached.status === 'done' && cached.result.runId === 'one-review');
  clock.tick(CODE_REVIEW_TERMINAL_GRACE_MS); assert.throws(() => owner.status(handle, target), /lost/);
 } finally { finish?.(); await owner.close(); }
});

test('DIFF-WAIT-RESUME: explicit cancel and daemon close abort and await owner settlement; restart never accepts an old handle', async () => {
 const clock = new Clock(), owner = registry(clock); let signal: AbortSignal | undefined, settle!: () => void, closed = false;
 const handle = owner.start({ fingerprint: fingerprint(), startedAt: clock.now, execute: async s => { signal = s; await new Promise<void>(resolve => { settle = resolve; }); closed = true; throw new Error('owned execution settled'); } });
 await flush();
 const pending = await owner.cancel(handle, target, { waitMs: 0 }); assert.equal(pending.status, 'pending'); assert.equal(signal!.aborted, true); assert.equal(closed, false);
 settle(); await flush(); assert.equal(owner.status(handle, target).status, 'cancelled'); assert.equal(closed, true);
 const restarted = registry(clock); assert.throws(() => restarted.status(handle, target), /lost/); await restarted.close(); await owner.close();
 const shutdown = registry(clock); let stopping!: () => void, aborted = false;
 shutdown.start({ fingerprint: fingerprint(), startedAt: clock.now, execute: async s => { await new Promise<void>(resolve => { stopping = resolve; s.addEventListener('abort', () => { aborted = true; resolve(); }); }); return result; } });
 await flush(); await shutdown.close(); assert.equal(aborted, true); stopping();
});

test('DIFF-TIME-OUTER: a healthy operation exceeds four hours, polls add no time, and root/idle deadlines remain terminal', async () => {
 const clock = new Clock(), owner = registry(clock); let emit!: Parameters<Parameters<typeof owner.start>[0]['execute']>[1], finish!: () => void, signal: AbortSignal | undefined;
 const handle = owner.start({ fingerprint: fingerprint(), startedAt: clock.now, execute: async (s, progress) => { signal = s; emit = progress; progress({ phase: 'timing', timing: timing(30) }); await new Promise<void>(resolve => { finish = resolve; }); return result; } });
 try {
  await flush();
  for (let i = 0; i < 30; i++) { clock.tick(540_000); emit({ phase: 'call', dimension: 'quality', detail: `primary ${i + 1}` }); assert.equal(owner.status(handle, target).status, 'pending'); }
  assert.ok(clock.now - 1000 > 4 * 60 * 60_000); assert.equal(signal!.aborted, false); finish(); await flush(); assert.equal(owner.status(handle, target).status, 'done');
 } finally { finish?.(); await owner.close(); }
 for (const root of [true, false]) {
  const c = new Clock(), r = registry(c); let stopped = false;
  const h = r.start({ fingerprint: fingerprint(), startedAt: c.now, execute: async (s, progress) => {
   if (root) progress({ phase: 'timing', timing: timing(1) });
   await new Promise<void>(resolve => s.addEventListener('abort', () => { stopped = true; resolve(); })); return result;
  } });
  await flush(); c.tick(root ? 599_999 : 1_199_999); for (let i = 0; i < 20; i++) assert.equal(r.status(h, target).status, 'pending');
  c.tick(1); await flush(); const failed = r.status(h, target); assert.equal(failed.status, 'failed'); if (failed.status === 'failed') assert.equal(failed.reason, root ? 'review-deadline' : 'review-idle'); assert.equal(stopped, true); await r.close();
 }
});

test('DIFF-WAIT-RESUME: cached completion is not proof of fresh inputs and timing cannot be extended by progress', async () => {
 const clock = new Clock(), owner = registry(clock); let changed = false;
 const h = owner.start({ fingerprint: fingerprint(), startedAt: clock.now, validateDone: () => { if (changed) throw Object.assign(new Error('inputs changed'), { code: 'review-input-changed' }); }, execute: async () => result });
 await flush(); assert.equal(owner.status(h, target).status, 'done'); changed = true; const stale = owner.status(h, target); assert.equal(stale.status, 'failed'); if (stale.status === 'failed') assert.equal(stale.reason, 'review-input-changed'); await owner.close();
 const r = registry(new Clock()); const handle = r.start({ fingerprint: fingerprint(), startedAt: 1000, execute: async (_s, progress) => { progress({ phase: 'timing', timing: timing(1) }); progress({ phase: 'timing', timing: timing(2) }); return result; } });
 await flush(); const failure = r.status(handle, target); assert.equal(failure.status, 'failed'); if (failure.status === 'failed') assert.equal(failure.reason, 'review-protocol'); await r.close();
});
