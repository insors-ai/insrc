/* Copyright (c) Procix Software India. Licensed under the MIT License. */

// One process-local lane for investigation reviews AND operator probes across
// repositories. These callers are pinned to the owning main daemon.
let providerTail: Promise<void> = Promise.resolve();

/** The owner must release only after its actual provider/bridge teardown. Abort
 * cancels a queued place; it never releases a place already owned by a caller. */
export async function acquireInvestigationProvider(signal: AbortSignal): Promise<() => void> {
  let release!: () => void;
  const prior = providerTail;
  const owned = new Promise<void>(resolve => { release = resolve; });
  // An aborted waiter releases its own place but cannot let later waiters pass
  // the provider that still owns the earlier place in this process-wide lane.
  providerTail = prior.then(() => owned);
  let onAbort!: () => void;
  try {
    await Promise.race([prior, new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason ?? new Error('Investigation admission cancelled'));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    })]);
    signal.throwIfAborted();
    return release;
  } catch (cause) {
    release();
    throw cause;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
