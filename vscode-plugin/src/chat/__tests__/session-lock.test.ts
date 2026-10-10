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
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileSessionLocks,
  defaultIsAlive,
  defaultProcessStartTime,
  createMemorySessionLocks,
  type LockFileRecord,
  LockWaitAborted,
  LockWaitSuperseded,
  runLeased,
  stopProcess,
  type LockFs,
  type SessionLease,
} from '../session-lock.js';
import { fakeLiveProc, tick, waitFor } from './fixtures.js';


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
  const proc = fakeLiveProc(101);
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
  const polite = fakeLiveProc(201, 'SIGTERM');
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
  const stubborn = fakeLiveProc(202, 'SIGKILL');
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
  const stuck = fakeLiveProc(203, 'never');
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
  const proc = fakeLiveProc(301);
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
  const proc = fakeLiveProc(401);
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
  assert.equal(await stopProcess(fakeLiveProc(1, 'SIGTERM'), 10), true);
  assert.equal(await stopProcess(fakeLiveProc(2, 'SIGKILL'), 10), true);
  assert.equal(await stopProcess(fakeLiveProc(3, 'never'), 10), false);
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
/** The lock record as a reader sees it: the lock file merged with its holder's sidecar, if any. */
const readLock = (dir: string, id: string): LockFileRecord | undefined => {
  const file = join(dir, `${id}.lock`);
  if (!existsSync(file)) return undefined;
  const rec = JSON.parse(readFileSync(file, 'utf8')) as LockFileRecord;
  const sidecar = `${file}.${rec.token}.holder`;
  if (rec.cliPid !== null || !existsSync(sidecar)) return rec;
  const h = JSON.parse(readFileSync(sidecar, 'utf8')) as Pick<LockFileRecord, 'cliPid' | 'startedAt' | 'output'>;
  return { ...rec, cliPid: h.cliPid, startedAt: h.startedAt, output: h.output };
};

test('a lock file from another window is honoured while its pid is alive, and a stale file (dead pid or mismatched start time) is replaced', async () => {
  const dir = lockDir();
  const table = procTable();
  table.set(1, 1); // window A's host
  table.set(2, 1); // window B's host
  const windowA = createFileSessionLocks({ fs: fsp, lockDir: dir, hostPid: 1, pollMs: 5, ...table.deps });
  const windowB = createFileSessionLocks({ fs: fsp, lockDir: dir, hostPid: 2, pollMs: 5, ...table.deps });

  // Window A holds the session with a live CLI process.
  const a = await windowA.acquire('s1', { timeoutMs: 60_000 });
  const created = readLock(dir, 's1');
  assert.deepEqual({ ...created, token: undefined }, { sessionId: 's1', cliPid: null, hostPid: 1, startedAt: null, token: undefined, output: null }, 'created at grant');
  assert.equal(typeof created?.token, 'string', 'carries its lease token');
  table.set(500, 7);
  const proc = fakeLiveProc(500);
  a.attach(proc);
  await waitFor(() => readLock(dir, 's1')?.cliPid === 500);
  assert.equal(readLock(dir, 's1')?.startedAt, 7, 'records the start time');

  // Window B waits while pid 500 is alive...
  let waited = 0;
  const b = track(windowB.acquire('s1', { timeoutMs: 60_000, onWaiting: () => waited++ }));
  await tick(40);
  assert.equal(b.state(), 'pending', 'honoured while its pid is alive');
  assert.equal(waited, 1);
  // ...and takes over once it dies (window A gone, file left behind).
  table.kill(500);
  await waitFor(() => b.state() === 'granted');
  assert.equal(readLock(dir, 's1')?.hostPid, 2, 'the stale file was replaced');
  assert.deepEqual(table.signals, [], 'nothing was signalled');
  (b.value() as SessionLease).release();
  await waitFor(() => readLock(dir, 's1') === undefined);

  // A reused pid (start time mismatch) is stale: replaced at once, never signalled.
  table.set(600, 2);
  writeFileSync(join(dir, 's2.lock'), JSON.stringify({ sessionId: 's2', cliPid: 600, hostPid: 9, startedAt: 1 }));
  const c = track(windowB.acquire('s2', { timeoutMs: 10 }));
  await waitFor(() => c.state() === 'granted');
  assert.deepEqual(table.signals, [], 'the unrelated pid 600 was never signalled');

  // A host that died before starting its process leaves a stale file too.
  writeFileSync(join(dir, 's3.lock'), JSON.stringify({ sessionId: 's3', cliPid: null, hostPid: 9999, startedAt: null }));
  const d = track(windowB.acquire('s3', { timeoutMs: 60_000 }));
  await waitFor(() => d.state() === 'granted');

  // The holder's exit removes its file.
  const e = await windowA.acquire('s4', { timeoutMs: 60_000 });
  table.set(501, 3);
  const p2 = fakeLiveProc(501);
  e.attach(p2);
  await waitFor(() => readLock(dir, 's4')?.cliPid === 501);
  p2.exitNow();
  await waitFor(() => readLock(dir, 's4') === undefined);
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
  await waitFor(() => a.state() === 'granted');
  assert.deepEqual(table.signals, [[700, 'SIGTERM'], [700, 'SIGKILL']]);
  assert.equal(readLock(dir, 's1')?.hostPid, 2, 'the lock file is now ours');
  assert.match(l.warn.join('\n'), /pid 700 still running after 20 ms; stopping it/);

  // The pid is reused during the grace: no SIGKILL to the unrelated process.
  table.signals.length = 0;
  table.set(701, 5, 'never');
  writeFileSync(join(dir, 's2.lock'), JSON.stringify({ sessionId: 's2', cliPid: 701, hostPid: 9, startedAt: 5 }));
  const b = track(locks.acquire('s2', { timeoutMs: 10 }));
  await waitFor(() => table.signals.length === 1);
  table.restart(701, 6);
  await waitFor(() => b.state() === 'granted');
  assert.deepEqual(table.signals, [[701, 'SIGTERM']], 'never escalated against a reused pid');
});

test('an unwritable lock directory falls back to memory', async () => {
  const parent = lockDir();
  const blocker = join(parent, 'not-a-dir');
  writeFileSync(blocker, '');
  const l = logs();
  const locks = createFileSessionLocks({ fs: fsp, lockDir: join(blocker, 'chat-locks'), hostPid: 2, logger: l.logger, ...procTable().deps });

  const a = await locks.acquire('s1', { timeoutMs: 60_000 });
  const proc = fakeLiveProc(800);
  a.attach(proc);
  const b = track(locks.acquire('s1', { timeoutMs: 60_000 }));
  await tick(20);
  assert.equal(b.state(), 'pending', 'the in-memory lock still holds');
  proc.exitNow();
  await waitFor(() => b.state() === 'granted');
  (b.value() as SessionLease).release();
  await locks.acquire('s2', { timeoutMs: 60_000 });
  assert.equal(l.error.length, 1, 'one logged error');
  assert.match(l.error[0] ?? '', /unusable \(ENOTDIR\); locking within this window only/);

  // The failure is not sticky: once the directory is usable, the next turn uses its lock file.
  await fsp.rm(blocker);
  await locks.acquire('s3', { timeoutMs: 60_000 });
  assert.equal(readLock(join(blocker, 'chat-locks'), 's3')?.hostPid, 2, 'cross-window locking resumed');
  assert.equal(l.error.length, 1, 'still logged only once');
});

test('the file-backed lock works with the real default seams (pid liveness, start time, fs)', async (t) => {
  if (process.platform !== 'linux') return t.diagnostic('the start-time seam reads /proc (Linux)');
  // The defaults the extension relies on: this process is alive, a pid that is not is not, and
  // the start time is stable for a live pid.
  assert.equal(defaultIsAlive(process.pid), true);
  assert.equal(defaultIsAlive(2 ** 22 + 12345), false, 'a pid above pid_max is never alive');
  const start = defaultProcessStartTime(process.pid);
  assert.equal(typeof start, 'number');
  assert.equal(defaultProcessStartTime(process.pid), start, 'stable for the same process');

  const dir = lockDir();
  const locks = createFileSessionLocks({ fs: fsp, lockDir: join(dir, 'chat-locks'), hostPid: process.pid, pollMs: 5 });
  const a = await locks.acquire('s1', { timeoutMs: 60_000 });
  const proc = fakeLiveProc(process.pid); // a live pid, so the default liveness check honours it
  a.attach(proc);
  await waitFor(() => readLock(join(dir, 'chat-locks'), 's1')?.cliPid === process.pid);
  assert.equal(readLock(join(dir, 'chat-locks'), 's1')?.startedAt, start, 'records the real start time');
  proc.exitNow();
  await waitFor(() => readLock(join(dir, 'chat-locks'), 's1') === undefined);
});

test('runLeased releases the lease on every path unless a process was attached', async () => {
  const locks = createMemorySessionLocks();
  // A throw before any process starts: released.
  const a = await locks.acquire('s1', { timeoutMs: 60_000 });
  await assert.rejects(runLeased(a, async () => { throw new Error('spawn blew up'); }), /spawn blew up/);
  const b = track(locks.acquire('s1', { timeoutMs: 60_000 }));
  await tick();
  assert.equal(b.state(), 'granted', 'the throwing turn did not keep the lease');

  // Finishing without a process: released.
  await runLeased(b.value() as SessionLease, async () => 'no process');
  const c = track(locks.acquire('s1', { timeoutMs: 60_000 }));
  await tick();
  assert.equal(c.state(), 'granted');

  // A process attached: kept after the body ends, released by the exit.
  const proc = fakeLiveProc(901);
  await runLeased(c.value() as SessionLease, async (attach) => attach(proc));
  const d = track(locks.acquire('s1', { timeoutMs: 60_000 }));
  await tick();
  assert.equal(d.state(), 'pending', 'held while the process runs');
  proc.exitNow();
  await waitFor(() => d.state() === 'granted');
});

test('a take-over never deletes a lock file another window has re-created meanwhile', async () => {
  const dir = lockDir();
  const table = procTable();
  table.set(950, 4); // window C's live CLI
  const file = join(dir, 's1.lock');
  writeFileSync(file, JSON.stringify({ sessionId: 's1', cliPid: 940, hostPid: 9, startedAt: 1 })); // pid 940 is dead: stale
  const liveC = JSON.stringify({ sessionId: 's1', cliPid: 950, hostPid: 3, startedAt: 4 });
  // Window C replaces the stale file right after this waiter has read it.
  let raced = false;
  const racingFs: LockFs = {
    ...fsp,
    mkdir: (path, opts) => fsp.mkdir(path, opts),
    writeFile: (path, data, opts) => fsp.writeFile(path, data, opts),
    rename: (from, to) => fsp.rename(from, to),
    unlink: (path) => fsp.unlink(path),
    readFile: async (path, enc) => {
      const text = await fsp.readFile(path, enc);
      if (!raced && path === file) {
        raced = true;
        await fsp.writeFile(file, liveC);
      }
      return text;
    },
  };
  const locks = createFileSessionLocks({ fs: racingFs, lockDir: dir, hostPid: 2, pollMs: 5, ...table.deps });
  const ctl = new AbortController();
  const a = track(locks.acquire('s1', { timeoutMs: 60_000, signal: ctl.signal }));
  await tick(40);
  assert.equal(readFileSync(file, 'utf8'), liveC, "window C's live lock file was not deleted");
  assert.equal(a.state(), 'pending', "the waiter now waits for window C's process");
  ctl.abort();
  await waitFor(() => a.state() === 'rejected');
});

test("the cross-window wait starts after the in-window grant, and a taken-over starting lease cannot start a second process", async () => {
  // (1) The file deadline is counted from the in-window grant. The in-window wait here "takes"
  // 2 minutes on the injected clock, longer than the 60 s timeout, yet the cross-window holder
  // is polled, not stopped at once.
  const dir = lockDir();
  const table = procTable();
  table.set(960, 6); // window C's live CLI
  let clock = 1_000_000;
  const liveC = JSON.stringify({ sessionId: 's1', cliPid: 960, hostPid: 3, startedAt: 6 });
  // Window C takes the session just before B's first exclusive create.
  let armed = false;
  const cTakesFirst: LockFs = {
    mkdir: (path, opts) => fsp.mkdir(path, opts),
    readFile: (path, enc) => fsp.readFile(path, enc),
    rename: (from, to) => fsp.rename(from, to),
    unlink: (path) => fsp.unlink(path),
    writeFile: async (path, data, opts) => {
      if (armed && opts?.flag === 'wx') {
        // Window C's own exclusive create wins the race once A's file is gone.
        armed = false;
        for (;;) {
          try {
            await fsp.writeFile(path, liveC, { flag: 'wx' });
            break;
          } catch {
            await tick(1);
          }
        }
      }
      return fsp.writeFile(path, data, opts);
    },
  };
  const locks = createFileSessionLocks({ fs: cTakesFirst, lockDir: dir, hostPid: 2, pollMs: 5, now: () => clock, ...table.deps });
  const a = await locks.acquire('s1', { timeoutMs: 60_000 });
  const aProc = fakeLiveProc(959);
  a.attach(aProc);
  await waitFor(() => readLock(dir, 's1')?.cliPid === 959);
  const ctl = new AbortController();
  const b = track(locks.acquire('s1', { timeoutMs: 60_000, signal: ctl.signal }));
  await tick();
  clock += 120_000; // the in-window wait outlasts the timeout on the clock
  armed = true;
  aProc.exitNow();
  await waitFor(() => readLock(dir, 's1')?.cliPid === 960);
  await tick(40);
  assert.equal(b.state(), 'pending', 'B polls window C');
  assert.deepEqual(table.signals, [], 'not stopped at once: the deadline started at the in-window grant');
  clock += 60_001; // B's own budget runs out
  await waitFor(() => b.state() === 'granted');
  assert.deepEqual(table.signals, [[960, 'SIGTERM']], 'then stopped');

  // (2) Two acquires in one window: the first holds the file but has not started its process.
  // After the timeout the second takes over, and when the first later starts its process, that
  // process is stopped at once and the second's file is left alone.
  const dir2 = lockDir();
  const table2 = procTable();
  table2.set(2, 1); // this host
  const l2 = logs();
  const locks2 = createFileSessionLocks({ fs: fsp, lockDir: dir2, hostPid: 2, pollMs: 5, graceMs: 20, logger: l2.logger, ...table2.deps });
  const first = await locks2.acquire('s1', { timeoutMs: 60_000 });
  const second = track(locks2.acquire('s1', { timeoutMs: 20 }));
  await tick(10);
  assert.equal(second.state(), 'pending', 'waits first');
  await waitFor(() => second.state() === 'granted');
  const secondFile = readFileSync(join(dir2, 's1.lock'), 'utf8');
  assert.equal(first.held(), false, 'the first lease was revoked');
  assert.equal((second.value() as SessionLease).held(), true);
  const late = fakeLiveProc(980);
  first.attach(late);
  await waitFor(() => late.exited());
  assert.deepEqual(late.signals, ['SIGTERM'], "the revoked turn's process was stopped at once");
  assert.match(l2.warn.join('\n'), /pid 980 started after its lease was taken over; stopping it/);
  await tick(20);
  assert.equal(readFileSync(join(dir2, 's1.lock'), 'utf8'), secondFile, "the second's lock file is untouched");
});

test('a lease whose process has no pid still removes its lock file on exit', async () => {
  const dir = lockDir();
  const locks = createFileSessionLocks({ fs: fsp, lockDir: dir, hostPid: 2, pollMs: 5, ...procTable().deps });
  const lease = await locks.acquire('s1', { timeoutMs: 60_000 });
  let end!: () => void;
  const exit = new Promise<{ code: number | null; signal: string | null }>((r) => (end = () => r({ code: 0, signal: null })));
  lease.attach({ pid: undefined, exit, kill: () => {} });
  assert.ok(readLock(dir, 's1'), 'held while running');
  end();
  await waitFor(() => readLock(dir, 's1') === undefined);
  await locks.acquire('s1', { timeoutMs: 20 }); // granted at once, no stale own-host file in the way
});

test('a failed pid update removes its temp file', async () => {
  const dir = lockDir();
  const table = procTable();
  table.set(990, 9);
  const l = logs();
  const failingRename: LockFs = {
    mkdir: (path, opts) => fsp.mkdir(path, opts),
    writeFile: (path, data, opts) => fsp.writeFile(path, data, opts),
    readFile: (path, enc) => fsp.readFile(path, enc),
    unlink: (path) => fsp.unlink(path),
    rename: async () => {
      throw Object.assign(new Error('EXDEV'), { code: 'EXDEV' });
    },
  };
  const locks = createFileSessionLocks({ fs: failingRename, lockDir: dir, hostPid: 2, logger: l.logger, ...table.deps });
  const lease = await locks.acquire('s1', { timeoutMs: 60_000 });
  const proc = fakeLiveProc(990);
  lease.attach(proc);
  await waitFor(() => l.error.length === 1);
  await tick(10);
  assert.match(l.error[0] ?? '', /could not record pid 990 \(EXDEV\)/);
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp')), [], 'no orphaned temp file');
  proc.exitNow();
});

test("the lock record carries the holder's session file and turn after attach", async () => {
  const dir = lockDir();
  const table = procTable();
  table.set(2, 1);
  table.set(810, 3);
  const locks = createFileSessionLocks({ fs: fsp, lockDir: dir, hostPid: 2, pollMs: 5, ...table.deps });
  const lease = await locks.acquire('s1', { timeoutMs: 60_000 });
  const proc = { ...fakeLiveProc(810), cursor: { turnId: 'claude-123' }, outPath: '/home/u/.insrc/chat-output/s1.ndjson' };
  lease.attach(proc);
  await waitFor(() => readLock(dir, 's1')?.cliPid === 810);
  assert.deepEqual(readLock(dir, 's1')?.output, { sessionFile: '/home/u/.insrc/chat-output/s1.ndjson', turnId: 'claude-123' });
  proc.exitNow();
  await waitFor(() => readLock(dir, 's1') === undefined);

  // A process without a session file (pipe turn) records none.
  const plain = await locks.acquire('s2', { timeoutMs: 60_000 });
  table.set(811, 4);
  const p2 = fakeLiveProc(811);
  plain.attach(p2);
  await waitFor(() => readLock(dir, 's2')?.cliPid === 811);
  assert.equal(readLock(dir, 's2')?.output, null);
  p2.exitNow();
});

test('the lock file is never rewritten after it is created; holder details live in a sidecar that goes with the lease', async () => {
  const dir = lockDir();
  const table = procTable();
  table.set(2, 1);
  table.set(820, 6);
  const locks = createFileSessionLocks({ fs: fsp, lockDir: dir, hostPid: 2, pollMs: 5, ...table.deps });
  const lease = await locks.acquire('s1', { timeoutMs: 60_000 });
  const lockText = readFileSync(join(dir, 's1.lock'), 'utf8');
  const proc = fakeLiveProc(820);
  lease.attach(proc);
  await waitFor(() => readLock(dir, 's1')?.cliPid === 820);
  assert.equal(readFileSync(join(dir, 's1.lock'), 'utf8'), lockText, 'the lock file itself is unchanged');
  assert.equal(readdirSync(dir).filter((f) => f.endsWith('.holder')).length, 1, 'one sidecar for the lease');
  proc.exitNow();
  await waitFor(() => readdirSync(dir).length === 0);

  // A process that exits before its details are recorded leaves nothing behind and logs no error.
  const l = logs();
  const quick = createFileSessionLocks({ fs: fsp, lockDir: dir, hostPid: 2, pollMs: 5, logger: l.logger, ...table.deps });
  const lease2 = await quick.acquire('s2', { timeoutMs: 60_000 });
  table.set(821, 7);
  const fast = fakeLiveProc(821);
  fast.exitNow();
  lease2.attach(fast);
  await tick(30);
  assert.deepEqual(readdirSync(dir), [], 'no lock file or sidecar left');
  assert.deepEqual(l.error, [], 'no false error');
});
