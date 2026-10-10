/**
 * Story E20261010d6a4bc79:S001 — chat session lock unit suite.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/session-lock.test.ts
 *
 * Drives the in-memory registry with fake processes (scripted exit, recorded signals) and
 * short real timers; the file-backed registry runs on a real temp directory with a fake
 * process table (liveness, start times, group signals). No vscode runtime, no child processes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileSessionLocks,
  createMemorySessionLocks,
  type LockFileRecord,
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

/** A fake process table: liveness and start time per pid, with recorded group signals. */
function procTable(): {
  set(pid: number, start: number, dies?: 'SIGTERM' | 'SIGKILL' | 'never'): void;
  kill(pid: number): void;
  restart(pid: number, start: number): void;
  signals: Array<[number, string]>;
  deps: { isAlive(pid: number): boolean; killGroup(pid: number, s: 'SIGTERM' | 'SIGKILL'): void; processStartTime(pid: number): number | undefined };
} {
  const rows = new Map<number, { start: number; dies: 'SIGTERM' | 'SIGKILL' | 'never' }>();
  const signals: Array<[number, string]> = [];
  return {
    set: (pid, start, dies = 'SIGTERM') => void rows.set(pid, { start, dies }),
    kill: (pid) => void rows.delete(pid),
    restart: (pid, start) => {
      const r = rows.get(pid);
      if (r !== undefined) r.start = start;
    },
    signals,
    deps: {
      isAlive: (pid) => rows.has(pid),
      killGroup: (pid, s) => {
        signals.push([pid, s]);
        const r = rows.get(pid);
        if (r !== undefined && (r.dies === s || (r.dies === 'SIGTERM' && s === 'SIGKILL'))) rows.delete(pid);
      },
      processStartTime: (pid) => rows.get(pid)?.start,
    },
  };
}

const lockDir = (): string => mkdtempSync(join(tmpdir(), 'chat-locks-'));
const readLock = (dir: string, id: string): LockFileRecord | undefined =>
  existsSync(join(dir, `${id}.lock`)) ? (JSON.parse(readFileSync(join(dir, `${id}.lock`), 'utf8')) as LockFileRecord) : undefined;

async function until(cond: () => boolean, ms = 1000): Promise<void> {
  for (let t = 0; !cond(); t += 5) {
    if (t > ms) throw new Error('condition not met in time');
    await tick(5);
  }
}

test('a lock file from another window is honoured while its pid is alive, and a stale file (dead pid or mismatched start time) is replaced', async () => {
  const dir = lockDir();
  const table = procTable();
  table.set(1, 1); // window A's host
  table.set(2, 1); // window B's host
  const windowA = createFileSessionLocks({ fs: fsp, lockDir: dir, hostPid: 1, pollMs: 5, ...table.deps });
  const windowB = createFileSessionLocks({ fs: fsp, lockDir: dir, hostPid: 2, pollMs: 5, ...table.deps });

  // Window A holds the session with a live CLI process.
  const a = await windowA.acquire('s1', { timeoutMs: 60_000 });
  assert.deepEqual(readLock(dir, 's1'), { sessionId: 's1', cliPid: null, hostPid: 1, startedAt: null }, 'created at grant');
  table.set(500, 7);
  const proc = fakeProc(500);
  a.attach(proc);
  await until(() => readLock(dir, 's1')?.cliPid === 500);
  assert.equal(readLock(dir, 's1')?.startedAt, 7, 'records the start time');

  // Window B waits while pid 500 is alive...
  let waited = 0;
  const b = track(windowB.acquire('s1', { timeoutMs: 60_000, onWaiting: () => waited++ }));
  await tick(40);
  assert.equal(b.state(), 'pending', 'honoured while its pid is alive');
  assert.equal(waited, 1);
  // ...and takes over once it dies (window A gone, file left behind).
  table.kill(500);
  await until(() => b.state() === 'granted');
  assert.equal(readLock(dir, 's1')?.hostPid, 2, 'the stale file was replaced');
  assert.deepEqual(table.signals, [], 'nothing was signalled');
  (b.value() as SessionLease).release();
  await until(() => readLock(dir, 's1') === undefined);

  // A reused pid (start time mismatch) is stale: replaced at once, never signalled.
  table.set(600, 2);
  writeFileSync(join(dir, 's2.lock'), JSON.stringify({ sessionId: 's2', cliPid: 600, hostPid: 9, startedAt: 1 }));
  const c = track(windowB.acquire('s2', { timeoutMs: 10 }));
  await until(() => c.state() === 'granted');
  assert.deepEqual(table.signals, [], 'the unrelated pid 600 was never signalled');

  // A host that died before starting its process leaves a stale file too.
  writeFileSync(join(dir, 's3.lock'), JSON.stringify({ sessionId: 's3', cliPid: null, hostPid: 9999, startedAt: null }));
  const d = track(windowB.acquire('s3', { timeoutMs: 60_000 }));
  await until(() => d.state() === 'granted');

  // The holder's exit removes its file.
  const e = await windowA.acquire('s4', { timeoutMs: 60_000 });
  table.set(501, 3);
  const p2 = fakeProc(501);
  e.attach(p2);
  await until(() => readLock(dir, 's4')?.cliPid === 501);
  p2.exitNow();
  await until(() => readLock(dir, 's4') === undefined);
});

test("on timeout a cross-window holder's group is stopped only when its start time matches", async () => {
  const dir = lockDir();
  const table = procTable();
  const l = logs();
  const locks = createFileSessionLocks({ fs: fsp, lockDir: dir, hostPid: 2, pollMs: 5, graceMs: 30, logger: l.logger, ...table.deps });

  // Ignores SIGTERM: SIGTERM, then SIGKILL after the grace; granted once the pid is gone.
  table.set(700, 5, 'SIGKILL');
  writeFileSync(join(dir, 's1.lock'), JSON.stringify({ sessionId: 's1', cliPid: 700, hostPid: 9, startedAt: 5 }));
  const a = track(locks.acquire('s1', { timeoutMs: 20 }));
  await tick(10);
  assert.equal(a.state(), 'pending');
  assert.deepEqual(table.signals, [], 'not signalled before the timeout');
  await until(() => a.state() === 'granted');
  assert.deepEqual(table.signals, [[700, 'SIGTERM'], [700, 'SIGKILL']]);
  assert.equal(readLock(dir, 's1')?.hostPid, 2, 'the lock file is now ours');
  assert.match(l.warn.join('\n'), /pid 700 from another window still running after 20 ms; stopping it/);

  // The pid is reused during the grace: no SIGKILL to the unrelated process.
  table.signals.length = 0;
  table.set(701, 5, 'never');
  writeFileSync(join(dir, 's2.lock'), JSON.stringify({ sessionId: 's2', cliPid: 701, hostPid: 9, startedAt: 5 }));
  const b = track(locks.acquire('s2', { timeoutMs: 10 }));
  await until(() => table.signals.length === 1);
  table.restart(701, 6);
  await until(() => b.state() === 'granted');
  assert.deepEqual(table.signals, [[701, 'SIGTERM']], 'never escalated against a reused pid');
});

test('an unwritable lock directory falls back to memory', async () => {
  const parent = lockDir();
  const blocker = join(parent, 'not-a-dir');
  writeFileSync(blocker, '');
  const l = logs();
  const locks = createFileSessionLocks({ fs: fsp, lockDir: join(blocker, 'chat-locks'), hostPid: 2, logger: l.logger, ...procTable().deps });

  const a = await locks.acquire('s1', { timeoutMs: 60_000 });
  const proc = fakeProc(800);
  a.attach(proc);
  const b = track(locks.acquire('s1', { timeoutMs: 60_000 }));
  await tick(20);
  assert.equal(b.state(), 'pending', 'the in-memory lock still holds');
  proc.exitNow();
  await until(() => b.state() === 'granted');
  (b.value() as SessionLease).release();
  await locks.acquire('s2', { timeoutMs: 60_000 });
  assert.equal(l.error.length, 1, 'one logged error');
  assert.match(l.error[0] ?? '', /unusable \(ENOTDIR\); locking within this window only/);
});
