import assert from 'node:assert/strict';
import test from 'node:test';
import type { TaskRef } from '../../../shared/task-progress.js';
import { FallbackScheduler } from '../fallback.js';

const task: TaskRef = { projectId: 'project', invocationId: 'invocation', taskId: 'task', attempt: 1 };
const authorize = async () => {};
const fixture = () => {
  let time = 0;
  let wall = 1_000;
  let owner = true;
  let terminal = false;
  let revision = 0;
  let reads = 0;
  let refresh = async (_signal: AbortSignal) => {};
  const timers = new Map<() => void, number>();
  const scheduler = new FallbackScheduler<never>({
    read: target => ({ task: target, cursor: String(revision), state: terminal ? 'completed' : 'running',
      freshness: 'unavailable', measurement: null, lastOwnerActivityAt: null, workerHealth: 'alive', cancellation: 'none' }),
    hasLiveOwner: () => owner,
    isTerminal: () => terminal,
    disposition: (_task, prior, current) => prior === current ? 'unchanged' : 'changed',
    refresh: async (_task, signal) => { reads++; await refresh(signal); },
  }, {
    now: () => wall,
    monotonic: () => time,
    timeout: (ms, callback) => {
      timers.set(callback, time + ms);
      return () => { timers.delete(callback); };
    },
  });
  return {
    scheduler, reads: () => reads,
    at(value: number, wallTime = 1_000 + value) {
      time = value;
      wall = wallTime;
      for (const [callback, deadline] of timers) if (deadline <= time) { timers.delete(callback); callback(); }
    },
    setRefresh: (fn: (signal: AbortSignal) => Promise<void>) => { refresh = fn; },
    owner: (value: boolean) => { owner = value; },
    revision: (value: number) => { revision = value; },
    finish: () => { terminal = true; },
  };
};

test('Verify monotonic 60-second fallback, transfer, suspension and unchanged suppression', async () => {
  const f = fixture();
  f.owner(false);
  assert.throws(() => f.scheduler.claim(task, 'a'), /schedule-suspended/);
  f.owner(true);
  const first = f.scheduler.claim(task, 'a');
  assert.equal(first.observation.nextEligibleAt, new Date(61_000).toISOString());
  assert.equal(f.reads(), 0);
  f.at(59_999, 5);
  await assert.rejects(f.scheduler.poll(task, 'a', first.lease, '0', authorize), /too-early/);
  f.at(60_000, 6);
  const reply = await f.scheduler.poll(task, 'a', first.lease, '0', authorize);
  assert.equal(reply.disposition, 'unchanged');
  assert.equal(f.reads(), 1);
  f.scheduler.detach('a');
  const successor = f.scheduler.claim(task, 'b');
  await assert.rejects(f.scheduler.poll(task, 'b', successor.lease, '0', authorize), /too-early/);
  f.at(120_000);
  f.owner(false);
  await assert.rejects(f.scheduler.poll(task, 'b', successor.lease, '0', authorize), /schedule-suspended/);
  f.owner(true);
  f.revision(1);
  assert.equal((await f.scheduler.poll(task, 'b', successor.lease, '0', authorize)).disposition, 'changed');
  f.at(300_000);
  const later = f.scheduler.claim(task, 'c').lease;
  await f.scheduler.poll(task, 'c', later, '1', authorize);
  await f.scheduler.poll(task, 'c', later, '1', authorize);
  assert.equal(f.reads(), 3, 'a delayed poll admits one current slot with no catch-up burst');
  f.finish();
  assert.equal((await f.scheduler.poll(task, 'c', later, '1', authorize)).schedule, 'stopped');
  await assert.rejects(f.scheduler.poll(task, 'a', first.lease, '1', authorize), /stale-lease/);
  assert.throws(() => f.scheduler.claim(task, 'd'), /schedule-suspended|lease-held/);
});

test('Fence scheduler claim, renew, release, duplicate slots and late replies across transfer with deterministic 60-second cadence and 120-second expiry', async () => {
  const f = fixture();
  const first = f.scheduler.claim(task, 'a').lease;
  assert.throws(() => f.scheduler.claim(task, 'b'), /lease-held/);
  f.at(60_000);
  const renewed = f.scheduler.renew(task, 'a', first);
  assert.equal(renewed.expiresAt, new Date(181_000).toISOString());
  let complete!: () => void;
  let observed!: AbortSignal;
  f.setRefresh(signal => { observed = signal; return new Promise(resolve => { complete = resolve; }); });
  const original = f.scheduler.poll(task, 'a', renewed, undefined, authorize);
  const late = assert.rejects(original, /stale-lease/);
  await assert.rejects(f.scheduler.poll(task, 'a', renewed, undefined, authorize), /slot-in-flight/);
  f.scheduler.release(task, 'a', renewed);
  assert.equal(observed.aborted, true);
  const successor = f.scheduler.claim(task, 'b').lease;
  assert.ok(successor.generation > renewed.generation);
  assert.throws(() => f.scheduler.renew(task, 'b', renewed), /stale-lease/);
  await assert.rejects(f.scheduler.poll(task, 'b', successor, undefined, authorize), /slot-in-flight/);
  f.at(120_000);
  await late;
  f.setRefresh(async () => {});
  assert.equal((await f.scheduler.poll(task, 'b', successor, undefined, authorize)).disposition, 'changed');
  complete();
  assert.equal((await f.scheduler.poll(task, 'b', successor, '0', authorize)).disposition, 'unchanged');
  assert.equal(f.reads(), 2);
  f.at(180_000);
  assert.throws(() => f.scheduler.renew(task, 'b', successor), /stale-lease/);
});
