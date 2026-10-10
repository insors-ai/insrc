/**
 * Story E20261010d6a4bc79:S001 — chat session lock unit suite.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/session-lock.test.ts
 *
 * Drives the in-memory registry with fake processes (scripted exit, recorded signals) and
 * short real timers. No vscode runtime, no child processes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemorySessionLocks,
  LockWaitAborted,
  LockWaitSuperseded,
  stopProcess,
  type LeaseProcess,
  type SessionLease,
} from '../session-lock.js';

interface FakeProc extends LeaseProcess {
  readonly signals: string[];
  exitNow(): void;
}

/** A fake process. `exitsOn` names the signal it dies of; 'never' ignores both. */
function fakeProc(pid: number, exitsOn: 'SIGTERM' | 'SIGKILL' | 'never' = 'SIGTERM'): FakeProc {
  let resolveExit!: () => void;
  const exit = new Promise<void>((r) => (resolveExit = r));
  const signals: string[] = [];
  return {
    pid,
    exit,
    signals,
    kill(signal) {
      signals.push(signal);
      if (exitsOn === signal || (exitsOn === 'SIGTERM' && signal === 'SIGKILL')) resolveExit();
    },
    exitNow: () => resolveExit(),
  };
}

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

function logs(): { warn: string[]; error: string[]; logger: { warn(m: string): void; error(m: string): void } } {
  const warn: string[] = [];
  const error: string[] = [];
  return { warn, error, logger: { warn: (m) => warn.push(m), error: (m) => error.push(m) } };
}

/** Tracks whether a promise has settled, and how. */
function track<T>(p: Promise<T>): { state: () => 'pending' | 'granted' | 'rejected'; value: () => T | undefined; error: () => unknown } {
  let state: 'pending' | 'granted' | 'rejected' = 'pending';
  let value: T | undefined;
  let error: unknown;
  p.then(
    (v) => {
      state = 'granted';
      value = v;
    },
    (e) => {
      state = 'rejected';
      error = e;
    },
  );
  return { state: () => state, value: () => value, error: () => error };
}

test("one lease per session; a second acquire waits until the holder's process exits, then is granted", async () => {
  const locks = createMemorySessionLocks();
  const first = await locks.acquire('s1', { timeoutMs: 60_000 });
  const proc = fakeProc(101);
  first.attach(proc);

  let waited = 0;
  const second = track(locks.acquire('s1', { timeoutMs: 60_000, onWaiting: () => waited++ }));
  const other = track(locks.acquire('s2', { timeoutMs: 60_000 }));
  await tick();
  assert.equal(second.state(), 'pending', 'same session waits while the holder is alive');
  assert.equal(waited, 1, 'onWaiting fired once');
  assert.equal(other.state(), 'granted', 'a different session is not blocked');

  proc.exitNow();
  await tick();
  assert.equal(second.state(), 'granted', 'granted once the holder exits');
  assert.deepEqual(proc.signals, [], 'nothing was stopped');
});

test('a lease released without a process grants the waiter; release is idempotent', async () => {
  const locks = createMemorySessionLocks();
  const first = await locks.acquire('s1', { timeoutMs: 60_000 });
  const second = track(locks.acquire('s1', { timeoutMs: 60_000 }));
  first.release();
  first.release();
  await tick();
  assert.equal(second.state(), 'granted');
  const done = new AbortController();
  const third = track(locks.acquire('s1', { timeoutMs: 60_000, signal: done.signal }));
  first.release(); // a stale lease must not free the new holder
  await tick();
  assert.equal(third.state(), 'pending');
  done.abort();
});

test('past the timeout the holder is stopped (SIGTERM, then SIGKILL after the grace period), its exit is awaited, then the lease is granted', async () => {
  const l = logs();
  const locks = createMemorySessionLocks({ graceMs: 30, logger: l.logger });

  // Dies on SIGTERM: one signal, then granted.
  const a = await locks.acquire('s1', { timeoutMs: 60_000 });
  const polite = fakeProc(201, 'SIGTERM');
  a.attach(polite);
  const b = track(locks.acquire('s1', { timeoutMs: 20 }));
  await tick(10);
  assert.equal(b.state(), 'pending', 'still waiting before the timeout');
  assert.deepEqual(polite.signals, [], 'not stopped before the timeout');
  await tick(40);
  assert.deepEqual(polite.signals, ['SIGTERM']);
  assert.equal(b.state(), 'granted');
  assert.match(l.warn.join('\n'), /\(pid 201\) still running after 20 ms; stopping it/);

  // Ignores SIGTERM: SIGKILL after the grace, granted only after the exit.
  const lease = b.value() as SessionLease;
  const stubborn = fakeProc(202, 'SIGKILL');
  lease.attach(stubborn);
  const c = track(locks.acquire('s1', { timeoutMs: 10 }));
  await tick(25);
  assert.deepEqual(stubborn.signals, ['SIGTERM'], 'SIGTERM first');
  assert.equal(c.state(), 'pending', 'not granted while the holder is alive');
  await tick(40);
  assert.deepEqual(stubborn.signals, ['SIGTERM', 'SIGKILL'], 'SIGKILL after the grace');
  assert.equal(c.state(), 'granted', 'granted after the exit');

  // Never exits: granted after the second grace, with an error logged.
  const lease2 = c.value() as SessionLease;
  const stuck = fakeProc(203, 'never');
  lease2.attach(stuck);
  const d = track(locks.acquire('s1', { timeoutMs: 10 }));
  await tick(55);
  assert.equal(d.state(), 'pending', 'still pending inside the SIGKILL grace');
  await tick(40);
  assert.equal(d.state(), 'granted');
  assert.match(l.error.join('\n'), /pid 203 did not exit after SIGKILL; taking the lease anyway/);
  // The stuck holder's late exit must not free the new holder.
  const done = new AbortController();
  const e = track(locks.acquire('s1', { timeoutMs: 60_000, signal: done.signal }));
  stuck.exitNow();
  await tick();
  assert.equal(e.state(), 'pending');
  done.abort();
});

test('a process that exits by itself grants the waiter at once, without any stop', async () => {
  const locks = createMemorySessionLocks({ graceMs: 30 });
  const a = await locks.acquire('s1', { timeoutMs: 60_000 });
  const proc = fakeProc(301);
  a.attach(proc);
  const b = track(locks.acquire('s1', { timeoutMs: 40 }));
  await tick(10);
  proc.exitNow();
  await tick(60);
  assert.equal(b.state(), 'granted');
  assert.deepEqual(proc.signals, [], 'the timeout never fired a stop');
});

test('an aborted wait is cancelled without stopping anything, and a newer waiter replaces an older one', async () => {
  const locks = createMemorySessionLocks({ graceMs: 10 });
  const a = await locks.acquire('s1', { timeoutMs: 60_000 });
  const proc = fakeProc(401);
  a.attach(proc);

  // Abort: rejects, nothing signalled, even past its timeout.
  const ctl = new AbortController();
  const aborted = track(locks.acquire('s1', { timeoutMs: 20, signal: ctl.signal }));
  ctl.abort();
  await tick(40);
  assert.equal(aborted.state(), 'rejected');
  assert.ok(aborted.error() instanceof LockWaitAborted);
  assert.deepEqual(proc.signals, [], 'an aborted wait stops nothing');

  // An already-aborted signal rejects at once.
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(locks.acquire('s1', { timeoutMs: 60_000, signal: pre.signal }), LockWaitAborted);

  // Supersede: the older waiter rejects, the newer one gets the lease.
  const older = track(locks.acquire('s1', { timeoutMs: 60_000 }));
  const newer = track(locks.acquire('s1', { timeoutMs: 60_000 }));
  await tick();
  assert.equal(older.state(), 'rejected');
  assert.ok(older.error() instanceof LockWaitSuperseded);
  assert.equal(newer.state(), 'pending');
  proc.exitNow();
  await tick();
  assert.equal(newer.state(), 'granted');
});

test('stopProcess reports whether the exit was confirmed', async () => {
  assert.equal(await stopProcess(fakeProc(1, 'SIGTERM'), 10), true);
  assert.equal(await stopProcess(fakeProc(2, 'SIGKILL'), 10), true);
  assert.equal(await stopProcess(fakeProc(3, 'never'), 10), false);
});
