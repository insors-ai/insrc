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

/** The slice of a started CLI process a lease is tied to. */
export interface LeaseProcess {
  readonly pid: number | undefined;
  /** Settles when the process has exited (either way). */
  readonly exit: Promise<unknown>;
  kill(signal: 'SIGTERM' | 'SIGKILL'): void;
}

export interface SessionLease {
  /** Ties the lease to the process the turn started; the lease is released when it exits. */
  attach(proc: LeaseProcess): void;
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

export interface LockTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

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
const REAL_TIMERS: LockTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

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
  proc.kill('SIGTERM');
  if (await settlesWithin(proc.exit, graceMs, timers)) return true;
  proc.kill('SIGKILL');
  return settlesWithin(proc.exit, graceMs, timers);
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
        const h = holders.get(sessionId);
        if (released || h === undefined || h.lease !== lease) return;
        h.proc = proc;
        proc.exit.then(lease.release, lease.release);
      },
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
            log.error(`[chat-lock] session ${sessionId}: holder started no process within ${opts.timeoutMs} ms; taking the lease`);
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
}

export function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function defaultKillGroup(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      /* already gone */
    }
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

const errCode = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | undefined)?.code;

function parseRecord(text: string): LockFileRecord | undefined {
  try {
    const r = JSON.parse(text) as Partial<LockFileRecord>;
    if (typeof r.hostPid !== 'number') return undefined;
    return {
      sessionId: String(r.sessionId),
      cliPid: typeof r.cliPid === 'number' ? r.cliPid : null,
      hostPid: r.hostPid,
      startedAt: typeof r.startedAt === 'number' ? r.startedAt : null,
    };
  } catch {
    return undefined;
  }
}

/**
 * The in-memory registry plus one lock file per session. The file is created exclusively
 * when the lease is granted (cliPid null), rewritten with the CLI's pid and start time on
 * attach, and removed when that process exits or the lease is released. Any fs failure
 * other than "the file exists" falls back to the in-memory lease, logged once.
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
  let fellBack = false;

  const sleep = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
    new Promise((resolve) => {
      const handle = timers.setTimeout(done, ms);
      function done(): void {
        timers.clearTimeout(handle);
        signal?.removeEventListener('abort', done);
        resolve();
      }
      signal?.addEventListener('abort', done, { once: true });
    });

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

  /** Stops another window's holder after the timeout; resolves when the file may be taken. */
  const stopRemote = async (sessionId: string, rec: LockFileRecord, timeoutMs: number): Promise<void> => {
    if (rec.cliPid === null) {
      log.error(`[chat-lock] session ${sessionId}: host ${rec.hostPid} started no process within ${timeoutMs} ms; taking the lock file`);
      return;
    }
    const pid = rec.cliPid;
    log.warn(`[chat-lock] session ${sessionId}: pid ${pid} from another window still running after ${timeoutMs} ms; stopping it`);
    killGroup(pid, 'SIGTERM');
    if (await goneWithin(pid, graceMs)) return;
    // Re-check identity before escalating: never SIGKILL a pid that has been reused.
    if (!sameProcess(rec)) return;
    killGroup(pid, 'SIGKILL');
    if (!(await goneWithin(pid, graceMs))) {
      log.error(`[chat-lock] session ${sessionId}: pid ${pid} did not exit after SIGKILL; taking the lock file anyway`);
    }
  };

  return {
    async acquire(sessionId: string, opts: AcquireOptions): Promise<SessionLease> {
      const deadline = Date.now() + opts.timeoutMs;
      let waitedOnce = false;
      const onWaiting = (): void => {
        if (waitedOnce) return;
        waitedOnce = true;
        opts.onWaiting?.();
      };
      const inner = await memory.acquire(sessionId, { ...opts, onWaiting });
      if (fellBack) return inner;
      const file = `${deps.lockDir}/${lockFileName(sessionId)}`;
      const record = (cliPid: number | null, startedAt: number | null): string =>
        JSON.stringify({ sessionId, cliPid, hostPid: deps.hostPid, startedAt } satisfies LockFileRecord);
      const fallBack = (e: unknown): SessionLease => {
        if (!fellBack) log.error(`[chat-lock] lock directory ${deps.lockDir} unusable (${errCode(e) ?? String(e)}); locking within this window only`);
        fellBack = true;
        return inner;
      };

      try {
        await deps.fs.mkdir(deps.lockDir, { recursive: true });
        for (;;) {
          if (opts.signal?.aborted === true) {
            inner.release();
            throw new LockWaitAborted(sessionId);
          }
          try {
            await deps.fs.writeFile(file, record(null, null), { flag: 'wx' });
            break;
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
            await deps.fs.unlink(file).catch(() => {});
            continue;
          }
          onWaiting();
          if (Date.now() >= deadline) {
            await stopRemote(sessionId, rec, opts.timeoutMs);
            await deps.fs.unlink(file).catch(() => {});
            continue;
          }
          await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())), opts.signal);
        }
      } catch (e) {
        if (e instanceof LockWaitAborted) throw e;
        return fallBack(e);
      }

      let attachedPid: number | null = null;
      let removed = false;
      /** Removes the file only while it is still this lease's. */
      const removeFile = async (): Promise<void> => {
        if (removed) return;
        removed = true;
        try {
          const rec = parseRecord(await deps.fs.readFile(file, 'utf8'));
          if (rec !== undefined && rec.hostPid === deps.hostPid && rec.cliPid === attachedPid) await deps.fs.unlink(file);
        } catch {
          /* already gone */
        }
      };
      return {
        attach(proc: LeaseProcess): void {
          inner.attach(proc);
          if (removed || proc.pid === undefined) return;
          const pid = proc.pid;
          const tmp = `${file}.${deps.hostPid}.tmp`;
          void deps.fs
            .writeFile(tmp, record(pid, startTime(pid) ?? null))
            .then(() => deps.fs.rename(tmp, file))
            .then(() => {
              attachedPid = pid;
            })
            .catch((e: unknown) => log.error(`[chat-lock] session ${sessionId}: could not record pid ${pid} (${errCode(e) ?? String(e)})`))
            .finally(() => {
              proc.exit.then(removeFile, removeFile);
            });
        },
        release(): void {
          inner.release();
          void removeFile();
        },
      };
    },
  };
}
