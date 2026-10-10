/**
 * Story E20261010d6a4bc79:S001 — one CLI process per chat session.
 *
 * A vscode-free, deps-injected module. A chat turn acquires its session's lease before it
 * starts a CLI process and attaches the process to it; the lease is released only when
 * that process's exit settles, never when its event stream ends. A turn that arrives
 * while the lease is held waits. Only when the wait runs past `timeoutMs` is the holder
 * stopped (SIGTERM, then SIGKILL after a grace period), and the waiter is granted once
 * the exit is confirmed.
 *
 * One waiter per session: a newer acquire replaces a waiting one (the latest message
 * wins), and an aborted wait (Stop) is dropped without stopping anything.
 *
 * The in-memory registry orders turns within one window. The file-backed registry layers
 * a lock file per session on top (~/.insrc/chat-locks/<sessionId>.lock) so another
 * window, or this window after a reload, sees a process that is still running.
 */

import { readFileSync } from 'node:fs';
import { abortableSleep, errCode, REAL_TIMERS, type Timers } from './async-util.js';

/** The slice of a started CLI process a lease is tied to. */
export interface LeaseProcess {
  readonly pid: number | undefined;
  /** Settles when the process has exited (either way). */
  readonly exit: Promise<unknown>;
  kill(signal: 'SIGTERM' | 'SIGKILL'): void;
  /** With a session output file (session-output.ts): the turn whose segment the process writes. */
  readonly cursor?: { readonly turnId: string } | undefined;
  /** With a session output file: that file. */
  readonly outPath?: string | undefined;
}

export interface SessionLease {
  /**
   * Ties the lease to the process the turn started; the lease is released when it exits. A lease
   * that was taken over (its turn started no process within a waiter's timeout) is revoked: a
   * process attached to it afterwards is stopped at once, so two never run on one session.
   */
  attach(proc: LeaseProcess): void;
  /** Whether this lease still holds its session (false once released or taken over). */
  held(): boolean;
  /** Releases the lease now (a turn that never started a process). Idempotent. */
  release(): void;
}

export interface AcquireOptions {
  /** How long to wait for the holder before stopping it. */
  readonly timeoutMs: number;
  /** Called once when the acquire has to wait. */
  readonly onWaiting?: (() => void) | undefined;
  /** Aborting it drops the wait (rejects with LockWaitAborted) without stopping anything. */
  readonly signal?: AbortSignal | undefined;
}

export interface SessionLocks {
  acquire(sessionId: string, opts: AcquireOptions): Promise<SessionLease>;
}

/** Minimal logger seam (the vscode-plugin does not pull the daemon's pino logger; never console.log). */
export interface LockLogger {
  warn(msg: string): void;
  error(msg: string): void;
}

export type LockTimers = Timers;

export interface MemorySessionLocksDeps {
  /** Wait after SIGTERM, and again after SIGKILL, for the exit. Default 5000 ms. */
  readonly graceMs?: number | undefined;
  readonly timers?: LockTimers | undefined;
  readonly logger?: LockLogger | undefined;
}

/** The wait was aborted (Stop). */
export class LockWaitAborted extends Error {
  constructor(sessionId: string) {
    super(`wait for chat session ${sessionId} was cancelled`);
    this.name = 'LockWaitAborted';
  }
}

/** A newer turn for the same session replaced this waiting one. */
export class LockWaitSuperseded extends Error {
  constructor(sessionId: string) {
    super(`wait for chat session ${sessionId} was replaced by a newer turn`);
    this.name = 'LockWaitSuperseded';
  }
}

export const DEFAULT_GRACE_MS = 5000;

const NOOP_LOGGER: LockLogger = { warn: () => {}, error: () => {} };

/** Whether `p` settles within `ms`. */
function settlesWithin(p: Promise<unknown>, ms: number, timers: LockTimers): Promise<boolean> {
  return new Promise((resolve) => {
    const handle = timers.setTimeout(() => resolve(false), ms);
    p.then(
      () => {
        timers.clearTimeout(handle);
        resolve(true);
      },
      () => {
        timers.clearTimeout(handle);
        resolve(true);
      },
    );
  });
}

/**
 * Stops a process: SIGTERM, then SIGKILL if it has not exited within `graceMs`. Resolves
 * true once the exit is confirmed, false when it did not settle even after the SIGKILL grace.
 */
export async function stopProcess(proc: LeaseProcess, graceMs: number, timers: LockTimers = REAL_TIMERS): Promise<boolean> {
  return escalateStop({ kill: (s) => proc.kill(s), exitedWithin: (ms) => settlesWithin(proc.exit, ms, timers), graceMs });
}

/**
 * The one stop sequence: SIGTERM, wait `graceMs` for the exit, then SIGKILL (only while
 * `mayKill` still holds) and wait again. True once the exit is confirmed.
 */
async function escalateStop(opts: {
  readonly kill: (signal: 'SIGTERM' | 'SIGKILL') => void;
  readonly exitedWithin: (ms: number) => Promise<boolean>;
  readonly graceMs: number;
  readonly mayKill?: (() => boolean) | undefined;
}): Promise<boolean> {
  opts.kill('SIGTERM');
  if (await opts.exitedWithin(opts.graceMs)) return true;
  if (opts.mayKill !== undefined && !opts.mayKill()) return true;
  opts.kill('SIGKILL');
  return opts.exitedWithin(opts.graceMs);
}

/**
 * Runs a turn under a granted lease and releases it on every path, unless the turn attached a
 * process to it (the process's exit then releases it). `attach` is what the turn hands to the
 * adapter's onSpawn. The single place that guarantees a lease never outlives its turn by accident.
 */
export async function runLeased<T>(lease: SessionLease, body: (attach: (proc: LeaseProcess) => void) => Promise<T>): Promise<T> {
  let attached = false;
  try {
    return await body((proc) => {
      attached = true;
      lease.attach(proc);
    });
  } finally {
    if (!attached) lease.release();
  }
}

interface Holder {
  readonly lease: SessionLease;
  proc: LeaseProcess | undefined;
}

interface Waiter {
  grant(): void;
  reject(err: Error): void;
}

export function createMemorySessionLocks(deps: MemorySessionLocksDeps = {}): SessionLocks {
  const graceMs = deps.graceMs ?? DEFAULT_GRACE_MS;
  const timers = deps.timers ?? REAL_TIMERS;
  const log = deps.logger ?? NOOP_LOGGER;
  const holders = new Map<string, Holder>();
  const waiters = new Map<string, Waiter>();

  const grantTo = (sessionId: string): SessionLease => {
    let released = false;
    const lease: SessionLease = {
      attach(proc: LeaseProcess): void {
        if (released) return;
        const h = holders.get(sessionId);
        if (h === undefined || h.lease !== lease) {
          // Taken over while starting: this process must not run beside the new holder's.
          log.warn(`[chat-lock] session ${sessionId}: pid ${proc.pid ?? '?'} started after its lease was taken over; stopping it`);
          void stopProcess(proc, graceMs, timers);
          return;
        }
        h.proc = proc;
        proc.exit.then(lease.release, lease.release);
      },
      held: () => !released && holders.get(sessionId)?.lease === lease,
      release(): void {
        if (released) return;
        released = true;
        if (holders.get(sessionId)?.lease !== lease) return;
        holders.delete(sessionId);
        waiters.get(sessionId)?.grant();
      },
    };
    holders.set(sessionId, { lease, proc: undefined });
    return lease;
  };

  return {
    acquire(sessionId: string, opts: AcquireOptions): Promise<SessionLease> {
      if (opts.signal?.aborted === true) return Promise.reject(new LockWaitAborted(sessionId));
      if (!holders.has(sessionId)) return Promise.resolve(grantTo(sessionId));

      waiters.get(sessionId)?.reject(new LockWaitSuperseded(sessionId));
      return new Promise<SessionLease>((resolve, reject) => {
        let timer: unknown;
        const finish = (): void => {
          if (waiters.get(sessionId) === waiter) waiters.delete(sessionId);
          timers.clearTimeout(timer);
          opts.signal?.removeEventListener('abort', onAbort);
        };
        const waiter: Waiter = {
          grant: () => {
            finish();
            resolve(grantTo(sessionId));
          },
          reject: (err) => {
            finish();
            reject(err);
          },
        };
        const onAbort = (): void => waiter.reject(new LockWaitAborted(sessionId));
        const onTimeout = (): void => {
          if (waiters.get(sessionId) !== waiter) return;
          const holder = holders.get(sessionId);
          if (holder === undefined) return waiter.grant();
          const takeOver = (): void => {
            if (waiters.get(sessionId) !== waiter) return;
            if (holders.get(sessionId) === holder) holders.delete(sessionId);
            waiter.grant();
          };
          if (holder.proc === undefined) {
            log.error(`[chat-lock] session ${sessionId}: holder started no process within ${opts.timeoutMs} ms; taking the lease (a process it starts later is stopped)`);
            return takeOver();
          }
          const pid = holder.proc.pid;
          log.warn(`[chat-lock] session ${sessionId}: previous turn (pid ${pid ?? '?'}) still running after ${opts.timeoutMs} ms; stopping it`);
          void stopProcess(holder.proc, graceMs, timers).then((exited) => {
            if (!exited) log.error(`[chat-lock] session ${sessionId}: pid ${pid ?? '?'} did not exit after SIGKILL; taking the lease anyway`);
            takeOver();
          });
        };
        waiters.set(sessionId, waiter);
        opts.signal?.addEventListener('abort', onAbort, { once: true });
        timer = timers.setTimeout(onTimeout, opts.timeoutMs);
        opts.onWaiting?.();
      });
    },
  };
}

/** The lock file's content. */
export interface LockFileRecord {
  readonly sessionId: string;
  /** The CLI process holding the session; null until the turn has started it. */
  readonly cliPid: number | null;
  /** The extension host that took the lease. */
  readonly hostPid: number;
  /** cliPid's process start time (processStartTime), when the platform reports one. */
  readonly startedAt: number | null;
  /** Unique per lease: tells two leases of one host apart, so a lease only ever removes its own file. */
  readonly token: string;
  /** The session output file and turn segment the holder's process writes, when it has one. */
  readonly output: { readonly sessionFile: string; readonly turnId: string } | null;
}

/** The slice of node:fs/promises the file-backed registry uses. */
export interface LockFs {
  mkdir(path: string, opts: { recursive: true }): Promise<unknown>;
  writeFile(path: string, data: string, opts?: { flag: 'wx' }): Promise<void>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

export interface FileSessionLocksDeps extends MemorySessionLocksDeps {
  readonly fs: LockFs;
  readonly lockDir: string;
  readonly hostPid: number;
  /** Whether a pid is a live process. */
  readonly isAlive?: ((pid: number) => boolean) | undefined;
  /** Signals a process group (falls back to the pid itself). */
  readonly killGroup?: ((pid: number, signal: 'SIGTERM' | 'SIGKILL') => void) | undefined;
  /** A pid's process start time, or undefined when the platform cannot tell. */
  readonly processStartTime?: ((pid: number) => number | undefined) | undefined;
  /** How often a waiter re-reads another window's lock file. Default 500 ms. */
  readonly pollMs?: number | undefined;
  /** Clock for the cross-window deadline. Default Date.now. */
  readonly now?: (() => number) | undefined;
}

export function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Signals the process group `pid` leads; false when there is no such group (or no groups, on Windows). */
export function signalGroup(pid: number, signal: 'SIGTERM' | 'SIGKILL'): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    return false;
  }
}

/** Signals `pid`'s process group, falling back to the pid itself. */
export function defaultKillGroup(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
  if (signalGroup(pid, signal)) return;
  try {
    process.kill(pid, signal);
  } catch {
    /* already gone */
  }
}

/** Linux: field 22 of /proc/<pid>/stat (start time in clock ticks); undefined elsewhere. */
export function defaultProcessStartTime(pid: number): number | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // The command name (field 2) is parenthesised and may contain spaces; fields after it are plain.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const ticks = Number(fields[19]);
    return Number.isFinite(ticks) ? ticks : undefined;
  } catch {
    return undefined;
  }
}

const lockFileName = (sessionId: string): string => `${sessionId.replace(/[^A-Za-z0-9_-]/g, '_')}.lock`;


function parseRecord(text: string): LockFileRecord | undefined {
  try {
    const r = JSON.parse(text) as Partial<LockFileRecord>;
    if (typeof r.hostPid !== 'number') return undefined;
    return {
      sessionId: String(r.sessionId),
      cliPid: typeof r.cliPid === 'number' ? r.cliPid : null,
      hostPid: r.hostPid,
      startedAt: typeof r.startedAt === 'number' ? r.startedAt : null,
      token: typeof r.token === 'string' ? r.token : '',
      output:
        typeof r.output === 'object' && r.output !== null && typeof r.output.sessionFile === 'string' && typeof r.output.turnId === 'string'
          ? { sessionFile: r.output.sessionFile, turnId: r.output.turnId }
          : null,
    };
  } catch {
    return undefined;
  }
}

let tokenSeq = 0;
const newToken = (hostPid: number): string => `${hostPid}-${Date.now().toString(36)}-${(tokenSeq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The in-memory registry plus one lock file per session. The file is created exclusively when
 * the lease is granted (cliPid null), rewritten with the CLI's pid and start time on attach, and
 * removed (only while it still carries this lease's token) when that process exits or the lease
 * is released. Any fs failure other than "the file exists" falls back to the in-memory lease for
 * that acquire only (logged once), so a transient failure never turns cross-window locking off
 * for later turns.
 */
export function createFileSessionLocks(deps: FileSessionLocksDeps): SessionLocks {
  const memory = createMemorySessionLocks(deps);
  const graceMs = deps.graceMs ?? DEFAULT_GRACE_MS;
  const timers = deps.timers ?? REAL_TIMERS;
  const log = deps.logger ?? NOOP_LOGGER;
  const isAlive = deps.isAlive ?? defaultIsAlive;
  const killGroup = deps.killGroup ?? defaultKillGroup;
  const startTime = deps.processStartTime ?? defaultProcessStartTime;
  const pollMs = deps.pollMs ?? 500;
  const now = deps.now ?? Date.now;
  // Logged once per host; the fallback itself applies to one acquire, so the next one retries the file.
  let fallbackLogged = false;

  const fileOf = (sessionId: string): string => `${deps.lockDir}/${lockFileName(sessionId)}`;
  const recordText = (
    sessionId: string,
    token: string,
    cliPid: number | null,
    startedAt: number | null,
    output: LockFileRecord['output'] = null,
  ): string => JSON.stringify({ sessionId, cliPid, hostPid: deps.hostPid, startedAt, token, output } satisfies LockFileRecord);

  const sleep = (ms: number, signal: AbortSignal | undefined): Promise<void> => abortableSleep(ms, signal, timers);

  /** Whether the recorded process is still the one that took the lock (pid not reused). */
  const sameProcess = (rec: LockFileRecord): boolean =>
    rec.cliPid === null || rec.startedAt === null || startTime(rec.cliPid) === rec.startedAt;

  const holderAlive = (rec: LockFileRecord): boolean =>
    rec.cliPid !== null ? isAlive(rec.cliPid) && sameProcess(rec) : isAlive(rec.hostPid);

  /** Polls until `pid` is gone or `ms` has passed; true when gone. */
  const goneWithin = async (pid: number, ms: number): Promise<boolean> => {
    for (let waited = 0; ; waited += pollMs) {
      if (!isAlive(pid)) return true;
      if (waited >= ms) return false;
      await sleep(Math.min(pollMs, ms - waited), undefined);
    }
  };

  /**
   * Removes the lock file only if it still holds exactly the record this waiter judged stale or
   * stopped. A file another window has since re-created is left alone; the loop then sees it as
   * a live holder and waits for it.
   */
  const unlinkIfUnchanged = async (file: string, judged: string): Promise<void> => {
    try {
      if ((await deps.fs.readFile(file, 'utf8')) === judged) await deps.fs.unlink(file);
    } catch {
      /* already gone */
    }
  };

  /** Stops the recorded holder after the timeout; resolves when its file may be taken. */
  const stopHolder = async (sessionId: string, rec: LockFileRecord, timeoutMs: number): Promise<void> => {
    if (rec.cliPid === null) {
      // Its turn never started a process: its lease is revoked, and a process it starts is stopped
      // (for this window, by the in-memory lease; another window's sees its file gone).
      log.error(`[chat-lock] session ${sessionId}: host ${rec.hostPid} started no process within ${timeoutMs} ms; taking the lock file`);
      return;
    }
    const pid = rec.cliPid;
    log.warn(`[chat-lock] session ${sessionId}: pid ${pid} still running after ${timeoutMs} ms; stopping it`);
    const exited = await escalateStop({
      kill: (signal) => killGroup(pid, signal),
      exitedWithin: (ms) => goneWithin(pid, ms),
      graceMs,
      // Re-check identity before escalating: never SIGKILL a pid that has been reused.
      mayKill: () => sameProcess(rec),
    });
    if (!exited) log.error(`[chat-lock] session ${sessionId}: pid ${pid} did not exit after SIGKILL; taking the lock file anyway`);
  };

  /**
   * Waits until this lease owns the session's lock file: creates it exclusively, replaces a stale
   * one, polls a live holder, and stops that holder once `deadline` has passed.
   */
  const claimFile = async (sessionId: string, token: string, deadline: number, opts: AcquireOptions, onWaiting: () => void): Promise<void> => {
    const file = fileOf(sessionId);
    await deps.fs.mkdir(deps.lockDir, { recursive: true });
    for (;;) {
      if (opts.signal?.aborted === true) throw new LockWaitAborted(sessionId);
      try {
        await deps.fs.writeFile(file, recordText(sessionId, token, null, null), { flag: 'wx' });
        return;
      } catch (e) {
        if (errCode(e) !== 'EEXIST') throw e;
      }
      let text: string;
      try {
        text = await deps.fs.readFile(file, 'utf8');
      } catch (e) {
        if (errCode(e) === 'ENOENT') continue; // removed between the write and the read
        throw e;
      }
      const rec = parseRecord(text);
      if (rec === undefined || !holderAlive(rec)) {
        log.warn(`[chat-lock] session ${sessionId}: replacing a stale lock file`);
        await unlinkIfUnchanged(file, text);
        continue;
      }
      onWaiting();
      if (now() >= deadline) {
        await stopHolder(sessionId, rec, opts.timeoutMs);
        await unlinkIfUnchanged(file, text);
        continue;
      }
      await sleep(Math.min(pollMs, Math.max(0, deadline - now())), opts.signal);
    }
  };

  /** The lease over the in-memory one that also keeps the lock file in step with the process. */
  const fileLease = (sessionId: string, token: string, inner: SessionLease): SessionLease => {
    const file = fileOf(sessionId);
    let removed = false;
    /** Removes the file only while it still carries this lease's token. */
    const removeFile = async (): Promise<void> => {
      if (removed) return;
      removed = true;
      try {
        if (parseRecord(await deps.fs.readFile(file, 'utf8'))?.token === token) await deps.fs.unlink(file);
      } catch {
        /* already gone */
      }
    };
    return {
      attach(proc: LeaseProcess): void {
        inner.attach(proc); // a revoked lease stops the process here
        proc.exit.then(removeFile, removeFile);
        if (!inner.held() || proc.pid === undefined) return;
        const pid = proc.pid;
        const tmp = `${file}.${token}.tmp`;
        void deps.fs
          .writeFile(
            tmp,
            recordText(sessionId, token, pid, startTime(pid) ?? null, proc.outPath !== undefined && proc.cursor !== undefined ? { sessionFile: proc.outPath, turnId: proc.cursor.turnId } : null),
          )
          .then(async () => {
            // Never overwrite a file this lease no longer owns (taken over meanwhile).
            if (parseRecord(await deps.fs.readFile(file, 'utf8'))?.token !== token) throw Object.assign(new Error('lock file taken over'), { code: 'ETAKEN' });
            await deps.fs.rename(tmp, file);
          })
          .catch((e: unknown) => {
            log.error(`[chat-lock] session ${sessionId}: could not record pid ${pid} (${errCode(e) ?? String(e)})`);
            return deps.fs.unlink(tmp).catch(() => {});
          });
      },
      held: () => inner.held(),
      release(): void {
        inner.release();
        void removeFile();
      },
    };
  };

  return {
    async acquire(sessionId: string, opts: AcquireOptions): Promise<SessionLease> {
      let waitedOnce = false;
      const onWaiting = (): void => {
        if (waitedOnce) return;
        waitedOnce = true;
        opts.onWaiting?.();
      };
      const inner = await memory.acquire(sessionId, { ...opts, onWaiting });
      // The cross-window wait has its own budget, counted from the in-window grant.
      const deadline = now() + opts.timeoutMs;
      const token = newToken(deps.hostPid);
      try {
        await claimFile(sessionId, token, deadline, opts, onWaiting);
      } catch (e) {
        if (e instanceof LockWaitAborted) {
          inner.release();
          throw e;
        }
        if (!fallbackLogged) log.error(`[chat-lock] lock directory ${deps.lockDir} unusable (${errCode(e) ?? String(e)}); locking within this window only for this turn`);
        fallbackLogged = true;
        return inner;
      }
      return fileLease(sessionId, token, inner);
    },
  };
}
