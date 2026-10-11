/**
 * Small helpers shared by the chat's file-backed modules (session-lock.ts, session-output.ts).
 * vscode-free.
 */

/** A timer seam, so callers can inject fake timers in tests. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const REAL_TIMERS: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Resolves after `ms`, or at once when `signal` is (or becomes) aborted. Never rejects. */
export function abortableSleep(ms: number, signal: AbortSignal | undefined, timers: Timers = REAL_TIMERS): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) return resolve();
    const handle = timers.setTimeout(done, ms);
    function done(): void {
      timers.clearTimeout(handle);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** The errno code of an fs error (ENOENT, EEXIST, ...), if any. */
export const errCode = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | undefined)?.code;
