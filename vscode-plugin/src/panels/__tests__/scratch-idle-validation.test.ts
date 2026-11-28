import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScratchIdleValidation } from '../scratch-idle-validation.js';

const settle = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('Trailing-gap scheduler continuous typing supersession and disposal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 0, disposed = 0, permitted = true;
  let base = { version: 1, digest: 'a', markdown: 'source' };
  const started: number[] = [], completed: number[] = [], failed: number[] = [];
  const jobs: Array<{ resolve: (value: boolean) => void; reject: (error: Error) => void; current: () => boolean }> = [];
  const scheduler = new ScratchIdleValidation<number, boolean>({
    now: () => now, source: () => base, eligible: () => permitted,
    validate: (candidate, _base, current) => { started.push(candidate); return new Promise((resolve, reject) => jobs.push({ resolve, reject, current })); },
    complete: candidate => { completed.push(candidate); }, failed: candidate => { failed.push(candidate); }, dispose: () => { disposed++; },
  });
  const advance = async (ms: number): Promise<void> => { now += ms; t.mock.timers.tick(ms); await settle(); };
  // More than a typical max-wait passes without ever leaving a 300ms gap.
  for (let i = 0; i < 50; i++) { scheduler.stage(i); await advance(200); }
  assert.deepEqual(started, []);
  await advance(99); assert.deepEqual(started, []);
  await advance(1); assert.deepEqual(started, [49]);
  scheduler.stage(50); await advance(150); scheduler.stage(51);
  assert.equal(jobs[0]!.current(), false);
  jobs[0]!.reject(new Error('Stale worker failure')); await settle();
  assert.deepEqual(failed, []); assert.deepEqual(completed, []);
  await advance(299); assert.deepEqual(started, [49]);
  await advance(1); assert.deepEqual(started, [49, 51]);
  base = { version: 2, digest: 'b', markdown: 'new base' };
  assert.equal(jobs[1]!.current(), false);
  jobs[1]!.resolve(true); await settle(); await advance(0);
  assert.deepEqual(started, [49, 51, 51]); assert.deepEqual(completed, []);
  jobs[2]!.resolve(true); await settle(); scheduler.refresh(); await advance(1000);
  assert.deepEqual(completed, [51]); assert.equal(started.length, 3, 'no duplicate validation of an already checked generation/base');
  permitted = false; scheduler.stage(52); await advance(300); assert.equal(started.length, 3);
  permitted = true; scheduler.refresh(); await advance(0); assert.equal(started.at(-1), 52, 'host readiness does not restart the typing deadline');
  scheduler.stage(53); scheduler.dispose(); scheduler.dispose();
  assert.equal(jobs[3]!.current(), false); jobs[3]!.reject(new Error('Disposed')); await settle(); await advance(1000);
  assert.equal(disposed, 1); assert.deepEqual(failed, []); assert.equal(started.length, 4);
});
