/**
 * Story E202610108ca7382b:S001 — the chat turn lifecycle, out of the panel host.
 *
 * A vscode-free, deps-injected module. It runs a chat turn for a session: it waits for the
 * session's lease (one CLI process per session), applies the newest-message-wins rule (a
 * generation counter: only the current turn reports), keeps the running CLI process, and records
 * where the turn's output is in the session file (ChatSession.liveTurn) so a reloaded window can
 * follow it. The panel hands it a TurnSink of callbacks and keeps the webview, the transcript
 * rows, titles, and permission and selection handling.
 */

import type { ChatPanelLogger } from './chat-panel.js';
import type { ProviderId, ProviderRegistry, TurnCursor, TurnProcess, TurnRequest } from './cli-adapter.js';
import { LockWaitAborted, LockWaitSuperseded, runLeased, type SessionLease, type SessionLocks } from './session-lock.js';
import type { ChatSession, ChatSessionStore } from './session-store.js';
import type { TurnEvent } from './stream-events.js';

/** How often a running turn's cursor (and transcript) is saved at most. */
export const CURSOR_SAVE_MS = 500;

/** insrc.chat.turnLockTimeoutMs default: 10 minutes. */
export const DEFAULT_TURN_LOCK_TIMEOUT_MS = 600_000;

export interface TurnLifecycleDeps {
  readonly providers: ProviderRegistry;
  readonly store: Pick<ChatSessionStore, 'save'>;
  readonly locks: SessionLocks;
  readonly lockTimeoutMs: () => number;
  readonly hostPid: number;
  readonly processStartTime: (pid: number) => number | undefined;
  readonly isAlive: (pid: number) => boolean;
  /** Whether the panel is open; a closed panel is told nothing. */
  readonly isOpen: () => boolean;
  readonly logger: ChatPanelLogger;
}

/** The panel's side of a live turn. Called only while the turn is current. */
export interface TurnSink {
  /** The turn is queued behind the session's previous process. */
  onWaiting(): void;
  /** Runs inside the turn, before the CLI starts (a failure is a turn error). */
  beforeRun(): Promise<void>;
  /** Every event of the turn, the terminal one included. */
  onEvent(ev: TurnEvent): void;
  /** After onEvent of the terminal event, its cursor cleared and nativeSessionId set. May throw. */
  onTerminal(ev: TurnEvent & { kind: 'done' | 'error' }): void;
  onError(message: string, turnId: string): void;
}

/** The panel's side of a followed turn (resumed from a saved cursor). */
export interface FollowSink {
  /** Every event of the turn, whether or not the session is shown. */
  onEvent(ev: TurnEvent): void;
  /** The turn was read to its end: its cursor has been cleared and the session saved. */
  onEnd(): void;
}

export interface TurnLifecycle {
  /**
   * Runs a turn for the session: drops a turn still waiting for the lease and supersedes the
   * current one (synchronously), then waits for the lease and reads the turn. Never rejects.
   */
  start(session: ChatSession, req: TurnRequest, sink: TurnSink): Promise<void>;
  /**
   * Follows a session's saved turn (its output still being read from the session file, e.g. after
   * a window reload) from where it was left. Only the cursor's owner follows it: this host, or any
   * host once the owner's extension host is gone (it then takes ownership). Runs in the background.
   */
  follow(session: ChatSession, sink: FollowSink): void;
  /**
   * The Stop control: ends the live turn, and a turn followed after a reload, with their
   * processes. Resolves once they have exited. Idempotent.
   */
  stop(): Promise<void>;
  /**
   * A chat switch, the panel closing, or adopt(): stop reading the live turn. A turn that writes to
   * the session file keeps running (with its lease) and its cursor stays saved, so following the
   * session again resumes it. A pipe turn could not be resumed, so it is stopped as by stop(). A
   * followed turn's process is not this host's to stop: it is only no longer followed.
   */
  detach(): Promise<void>;
  /** The current turn stops reporting (a chat switch). */
  invalidate(): void;
  /** The turn being read live, once its first event arrived. */
  readonly live: { readonly provider: ProviderId; readonly turnId: string } | undefined;
}

const isTerminal = (ev: TurnEvent): ev is TurnEvent & { kind: 'done' | 'error' } => ev.kind === 'done' || ev.kind === 'error';

export function createTurnLifecycle(deps: TurnLifecycleDeps): TurnLifecycle {
  const log = deps.logger;
  let activeTurnId: string | undefined;
  let activeProvider: ProviderId | undefined;
  let activeIterator: AsyncIterator<TurnEvent> | undefined;
  let generation = 0;
  // Turns this host is reading live; a saved cursor for one of them is not resumed.
  const runningTurns = new Set<string>();
  // Detaches from the live turn (stops reading, leaves its process running) — set while one runs.
  let detachLive: (() => void) | undefined;
  // The wait of a turn that is queued behind the session's previous process; aborting it drops
  // the turn without stopping anything (a newer submit, Stop, a chat switch).
  let waitCtl: AbortController | undefined;
  // The newest CLI process this host started; kept until it exits, even after its answer, so Stop
  // can end a process that is still running in the background.
  let liveProc: TurnProcess | undefined;
  // The saved turn this host is following after a reload (resume), if any.
  let following: { readonly sessionId: string; readonly ctl: AbortController } | undefined;
  let resumedProc: TurnProcess | undefined;

  /** Forgets which turn is being read live (the one place these refs are reset together). */
  const clearLiveRefs = (): void => {
    activeIterator = undefined;
    activeProvider = undefined;
    activeTurnId = undefined;
  };
  /** Persists a session; a persistence failure is logged and never breaks a turn. */
  const trySave = (target: ChatSession): void => {
    try {
      deps.store.save(target);
    } catch (err) {
      log.warn(`[chat] session ${target.id} not saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const isCurrent = (gen: number): boolean => deps.isOpen() && gen === generation;

  /**
   * One CLI process per session: waits until the session's previous process has exited (in this
   * window or another), stopping it only after the lock timeout. Undefined when the turn was
   * dropped while waiting or is no longer current once granted — nothing is to run then.
   */
  async function acquireSessionLease(s: ChatSession, myGen: number, sink: TurnSink): Promise<SessionLease | undefined> {
    const ctl = new AbortController();
    waitCtl = ctl;
    let lease: SessionLease;
    try {
      lease = await deps.locks.acquire(s.id, {
        timeoutMs: deps.lockTimeoutMs(),
        signal: ctl.signal,
        onWaiting: () => {
          log.warn(`[chat] session ${s.id}: waiting for the previous turn's process to exit`);
          if (isCurrent(myGen)) sink.onWaiting();
        },
      });
    } catch (err) {
      // Dropped while waiting (newer submit / Stop / chat switch): nothing to run, nothing to say.
      if (err instanceof LockWaitAborted || err instanceof LockWaitSuperseded) return undefined;
      const message = `could not lock chat session: ${err instanceof Error ? err.message : String(err)}`;
      log.error(`[chat] session ${s.id}: ${message}`);
      if (isCurrent(myGen)) sink.onError(message, 'none');
      return undefined;
    } finally {
      if (waitCtl === ctl) waitCtl = undefined;
    }
    if (!isCurrent(myGen)) {
      lease.release();
      return undefined;
    }
    return lease;
  }

  async function start(s: ChatSession, req: TurnRequest, sink: TurnSink): Promise<void> {
    // Single-in-flight: the newest message wins. A turn still waiting for the lock is dropped,
    // and the generation bump stops the previous loop reporting. The previous turn's process is
    // NOT killed: this turn waits for it below.
    waitCtl?.abort();
    waitCtl = undefined;
    const myGen = ++generation;

    let adapter;
    try {
      adapter = deps.providers.get(s.provider);
    } catch {
      sink.onError(`no adapter for provider ${s.provider}`, 'none');
      return;
    }

    const lease = await acquireSessionLease(s, myGen, sink);
    if (lease === undefined) return;
    // runLeased releases the lease on every path unless a process was attached to it (then the
    // process's exit releases it): a failed spawn, an adapter without onSpawn, or a throw.
    await runLeased(lease, async (attachLease) => {
      // Save the cursor as lines are handled, together with the transcript rows they produced, so
      // the saved session is always a consistent snapshot. Throttled; the terminal event saves.
      let lastCursorSave = 0;
      const saveCursorNow = (): void => {
        lastCursorSave = Date.now();
        trySave(s);
      };
      // The lease follows the started process: it is released when that process exits, not
      // when its answer ends.
      const onSpawn = (proc: TurnProcess): void => {
        attachLease(proc);
        if (myGen === generation) liveProc = proc;
        const forget = (): void => {
          if (liveProc === proc) liveProc = undefined;
        };
        proc.exit.then(forget, forget);
        // The turn's output is kept in the session file: remember where it starts, owned by this
        // host, so a reloaded window can follow it from there.
        if (proc.cursor !== undefined) {
          const { turnId, generation: gen, offset } = proc.cursor;
          runningTurns.add(turnId);
          proc.exit.then(
            () => runningTurns.delete(turnId),
            () => runningTurns.delete(turnId),
          );
          s.liveTurn = {
            cursor: { turnId, generation: gen, offset },
            ownerHostPid: deps.hostPid,
            ...(proc.pid !== undefined ? { pid: proc.pid, startedAt: deps.processStartTime(proc.pid) ?? null } : {}),
          };
          saveCursorNow();
        }
      };
      const onProgress = (c: TurnCursor): void => {
        const live = s.liveTurn;
        if (live === undefined || live.cursor.turnId !== c.turnId) return;
        s.liveTurn = { ...live, cursor: { turnId: c.turnId, generation: c.generation, offset: c.offset } };
        if (Date.now() - lastCursorSave >= CURSOR_SAVE_MS) saveCursorNow();
      };
      /** At the turn's terminal event its output has been fully handled: forget its cursor. */
      const clearCursor = (turnId: string): void => {
        if (s.liveTurn?.cursor.turnId === turnId) delete s.liveTurn;
      };
      let detached = false;
      let detachThis: (() => void) | undefined;
      try {
        // Inside the try, so a failed beforeRun or adapter start is a turn error and the lease is
        // still released.
        await sink.beforeRun();
        // Hold the iterator explicitly so a stop can .return() it even while it is parked
        // awaiting its first event.
        const iterator = adapter.run(req, { onSpawn, onProgress, sessionId: s.id })[Symbol.asyncIterator]();
        activeIterator = iterator;
        activeProvider = s.provider;
        detachThis = (): void => {
          detached = true;
          if (s.liveTurn !== undefined) runningTurns.delete(s.liveTurn.cursor.turnId); // resumable now
          trySave(s); // the cursor and the rows handled so far
          void iterator.return?.(undefined); // stop reading; the CLI keeps writing to the session file
        };
        if (myGen === generation) detachLive = detachThis;
        for (;;) {
          const next = await iterator.next();
          if (next.done === true || detached) break;
          const ev = next.value;
          // Superseded/closed: report nothing more, but keep reading so the superseded turn's CLI
          // never stalls on a full pipe; its process (and the lease) end when it exits.
          if (!isCurrent(myGen)) {
            if (isTerminal(ev)) {
              clearCursor(ev.turnId);
              void iterator.return?.(undefined); // as on the live path: finish the generator
              break;
            }
            continue;
          }
          activeTurnId = ev.turnId;
          sink.onEvent(ev);
          if (isTerminal(ev)) {
            clearCursor(ev.turnId);
            if (ev.kind === 'done' && ev.sessionId !== undefined) s.nativeSessionId = ev.sessionId;
            sink.onTerminal(ev);
            void iterator.return?.(undefined); // finish the generator; the process is left to exit
            break;
          }
        }
      } catch (err) {
        if (isCurrent(myGen)) {
          sink.onError(err instanceof Error ? err.message : String(err), activeTurnId ?? 'none');
          trySave(s);
        }
      } finally {
        if (myGen === generation) clearLiveRefs();
        if (detachThis !== undefined && detachLive === detachThis) detachLive = undefined;
      }
    });
  }

  function follow(s: ChatSession, sink: FollowSink): void {
    const live = s.liveTurn;
    if (live === undefined || following?.sessionId === s.id || runningTurns.has(live.cursor.turnId)) return;
    if (live.ownerHostPid !== deps.hostPid && deps.isAlive(live.ownerHostPid)) return; // another window follows it
    let adapter;
    try {
      adapter = deps.providers.get(s.provider);
    } catch {
      return;
    }
    if (typeof adapter.resume !== 'function') return;
    s.liveTurn = { ...live, ownerHostPid: deps.hostPid };
    trySave(s);
    const ctl = new AbortController();
    following = { sessionId: s.id, ctl };
    let lastSave = Date.now();
    const turnId = live.cursor.turnId;
    void (async () => {
      try {
        const events = adapter.resume(
          { cursor: { sessionId: s.id, ...live.cursor }, pid: live.pid, startedAt: live.startedAt ?? null },
          {
            signal: ctl.signal,
            onAttach: (p) => {
              resumedProc = p;
            },
            onProgress: (c) => {
              if (s.liveTurn?.cursor.turnId !== c.turnId) return;
              s.liveTurn = { ...s.liveTurn, cursor: { turnId: c.turnId, generation: c.generation, offset: c.offset } };
              if (Date.now() - lastSave >= CURSOR_SAVE_MS) {
                lastSave = Date.now();
                trySave(s);
              }
            },
          },
        );
        for await (const ev of events) {
          if (ctl.signal.aborted) break;
          sink.onEvent(ev);
          if (ev.kind === 'done' && ev.sessionId !== undefined) s.nativeSessionId = ev.sessionId;
          if (isTerminal(ev)) break;
        }
        if (!ctl.signal.aborted) {
          if (s.liveTurn?.cursor.turnId === turnId) delete s.liveTurn;
          trySave(s);
          sink.onEnd();
        }
      } catch (err) {
        log.warn(`[chat] session ${s.id}: could not resume turn ${turnId}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (following?.ctl === ctl) following = undefined;
        resumedProc = undefined;
      }
    })();
  }

  /**
   * Ends the live turn: drops a turn waiting for its lease, returns the iterator, cancels the
   * provider's turn and stops the newest CLI process. Resolves once the process has exited (or
   * there was none). Idempotent.
   */
  const stopLive = async (): Promise<void> => {
    waitCtl?.abort();
    waitCtl = undefined;
    detachLive = undefined;
    const it = activeIterator;
    const prov = activeProvider;
    const tid = activeTurnId;
    const proc = liveProc;
    clearLiveRefs();
    liveProc = undefined;
    if (it !== undefined) {
      try {
        void it.return?.(undefined);
      } catch {
        /* returning an already-finished iterator is a no-op */
      }
    }
    if (prov !== undefined && tid !== undefined) {
      try {
        await deps.providers.get(prov).cancel(tid);
      } catch {
        /* provider gone / already finished — nothing to cancel */
      }
    }
    if (proc !== undefined) {
      try {
        await proc.stop();
      } catch {
        /* already gone / not signalable — callers fire this and forget it */
      }
    }
  };

  const stop = async (): Promise<void> => {
    following?.ctl.abort();
    const resumed = resumedProc;
    resumedProc = undefined;
    await stopLive();
    if (resumed !== undefined) await resumed.stop().catch(() => {});
  };

  const detach = async (): Promise<void> => {
    waitCtl?.abort();
    waitCtl = undefined;
    following?.ctl.abort(); // a resumed turn: its process is not ours to stop here
    resumedProc = undefined;
    const detachThis = detachLive;
    if (detachThis !== undefined && liveProc?.cursor !== undefined) {
      detachLive = undefined;
      liveProc = undefined;
      clearLiveRefs();
      detachThis();
      return;
    }
    await stopLive();
  };

  return {
    start,
    follow,
    stop,
    detach,
    invalidate(): void {
      ++generation;
    },
    get live() {
      return activeProvider !== undefined && activeTurnId !== undefined ? { provider: activeProvider, turnId: activeTurnId } : undefined;
    },
  };
}
