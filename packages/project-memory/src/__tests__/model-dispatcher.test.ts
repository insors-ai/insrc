import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
import { ModelDispatcher, MAX_PENDING_MODEL_CALLS } from '../model-dispatcher.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import type { ModelRequest } from '../types.js';
const request = (signal = new AbortController().signal): ModelRequest => ({ role: 'normalize', input: null, schema: {}, signal });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('one-underlying-call-complete-and-embed', async () => {
  const release = deferred<null>(); let active = 0; let maximum = 0; const calls: string[] = [];
  const source = { ...options('/unused').models, async complete() { calls.push('complete'); maximum = Math.max(maximum, ++active); await release.promise; active--; return null; }, async embed() { calls.push('embed'); maximum = Math.max(maximum, ++active); active--; return [1, 0]; } };
  const lane = new ModelDispatcher(source, 1000);
  const first = lane.complete(request()); const second = lane.embed('query', new AbortController().signal);
  await tick(); assert.deepEqual(calls, ['complete']);
  release.resolve(null); await first; await second; await lane.waitIdle();
  assert.deepEqual(calls, ['complete', 'embed']); assert.equal(maximum, 1); assert.equal(lane.pending, 0);
});

test('cancel-timeout-rejection-and-bounded-backpressure', async () => {
  const release = deferred<null>(); let count = 0;
  const source = { ...options('/unused').models, async complete() { count++; await release.promise; return null; } };
  const lane = new ModelDispatcher(source, 10_000);
  const active = lane.complete(request()); const observed = active.catch(error => error);
  await tick();
  const pending: Promise<unknown>[] = [];
  for (let i = 0; i < MAX_PENDING_MODEL_CALLS; i++) pending.push(lane.complete(request()).catch(error => error));
  await assert.rejects(lane.complete(request()), (error: unknown) => error instanceof MemoryError && error.code === 'BACKPRESSURE');
  lane.stop(); await observed;
  for (const promise of pending) assert.ok(await promise instanceof MemoryError);
  assert.equal(count, 1); assert.equal(lane.pending, 1, 'abort must not release an uncooperative underlying call');
  release.resolve(null); await lane.waitIdle(); assert.equal(lane.pending, 0);

  const timeoutRelease = deferred<null>(); let started = 0;
  const timed = new ModelDispatcher({ ...options('/unused').models, async complete() { started++; await timeoutRelease.promise; return null; } }, 20);
  await assert.rejects(timed.complete(request()), (error: unknown) => error instanceof MemoryError && error.code === 'DEADLINE_EXCEEDED');
  assert.equal(timed.pending, 1); assert.equal(started, 1);
  timeoutRelease.resolve(null); await timed.waitIdle();

  const rejected = new ModelDispatcher({ ...options('/unused').models, async complete() { throw new Error('private provider content'); } }, 1000);
  await assert.rejects(rejected.complete(request()), (error: unknown) => error instanceof MemoryError && !error.message.includes('private'));
  await rejected.embed('still usable', new AbortController().signal); await rejected.waitIdle();
});

test('queued-cancellation-never-invokes-provider', async () => {
  const release = deferred<null>(); let calls = 0;
  const lane = new ModelDispatcher({ ...options('/unused').models, async complete() { calls++; await release.promise; return null; } }, 1000);
  const first = lane.complete(request()); const cancel = new AbortController();
  const queued = lane.complete(request(cancel.signal)); const failed = assert.rejects(queued, MemoryError);
  cancel.abort(); await failed; release.resolve(null); await first; await lane.waitIdle();
  assert.equal(calls, 1);
});
