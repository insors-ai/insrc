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
 */

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
