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
  /**
   * After onEvent of the terminal event, its cursor cleared, nativeSessionId set and the event
   * iterator finished. A throw is logged: the turn has finished, so it is not a turn error.
   */
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

/** Persists a session; a persistence failure is logged and never breaks a turn. Shared with the panel. */
export function trySaveSession(store: Pick<ChatSessionStore, 'save'>, log: ChatPanelLogger, target: ChatSession): void {
  try {
    store.save(target);
  } catch (err) {
    log.warn(`[chat] session ${target.id} not saved: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Finishes a turn's event iterator without waiting for it. A generator's cleanup (its `finally`)
 * may throw: the returned promise's rejection is dropped, as is a synchronous throw.
 */
function finishIterator(it: AsyncIterator<TurnEvent>): void {
  try {
    void Promise.resolve(it.return?.(undefined)).catch(() => {});
  } catch {
    /* returning an already-finished iterator is a no-op */
  }
}

/** Once a turn's output has been fully handled: forget its cursor (if it is still that turn's). */
function clearCursor(s: ChatSession, turnId: string): void {
  if (s.liveTurn?.cursor.turnId === turnId) delete s.liveTurn;
}

/** A done event carries the provider's native session id: the next turn resumes it. */
function keepNativeSession(s: ChatSession, ev: TurnEvent): void {
  if (ev.kind === 'done' && ev.sessionId !== undefined) s.nativeSessionId = ev.sessionId;
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
  // A turn that holds its lease but has not started its CLI yet (beforeRun runs); aborting it
  // drops the turn before it starts anything (Stop, or a chat switch that stops).
  let setupCtl: AbortController | undefined;
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
  const trySave = (target: ChatSession): void => trySaveSession(deps.store, log, target);
  const isCurrent = (gen: number): boolean => deps.isOpen() && gen === generation;
  /** Reports a turn error to the panel; a failing report is logged, never thrown (start never rejects). */
  const reportError = (sink: TurnSink, message: string, turnId: string): void => {
    try {
      sink.onError(message, turnId);
    } catch (err) {
      log.warn(`[chat] could not report "${message}": ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /**
   * Keeps a turn's saved cursor (session.liveTurn) current as its lines are handled: progress for
   * the same turn moves it, saved together with the transcript rows those lines produced, at most
   * every CURSOR_SAVE_MS, so the saved session is always a consistent snapshot.
   */
  const cursorTracker = (s: ChatSession, lastSave: number): { saveNow(): void; progress(c: TurnCursor): void } => {
    let last = lastSave;
    const saveNow = (): void => {
      last = Date.now();
      trySave(s);
    };
    return {
      saveNow,
      progress(c) {
        const live = s.liveTurn;
        if (live === undefined || live.cursor.turnId !== c.turnId) return;
        s.liveTurn = { ...live, cursor: { turnId: c.turnId, generation: c.generation, offset: c.offset } };
        if (Date.now() - last >= CURSOR_SAVE_MS) saveNow();
      },
    };
  };

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
      if (isCurrent(myGen)) reportError(sink, message, 'none');
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
      if (isCurrent(myGen)) reportError(sink, `no adapter for provider ${s.provider}`, 'none');
      return;
    }

    const lease = await acquireSessionLease(s, myGen, sink);
    if (lease === undefined) return;
    // runLeased releases the lease on every path unless a process was attached to it (then the
    // process's exit releases it): a failed spawn, an adapter without onSpawn, or a throw.
    await runLeased(lease, async (attachLease) => {
      const cursor = cursorTracker(s, 0);
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
          cursor.saveNow();
        }
      };
      let detached = false;
      let detachThis: (() => void) | undefined;
      let iterator: AsyncIterator<TurnEvent> | undefined;
      /** At the turn's terminal event its output has been fully handled: forget its cursor, keep its native session, finish the generator. */
      const endTurn = (ev: TurnEvent, it: AsyncIterator<TurnEvent>): void => {
        clearCursor(s, ev.turnId);
        keepNativeSession(s, ev);
        finishIterator(it); // the process is left to exit
      };
      try {
        // Inside the try, so a failed beforeRun or adapter start is a turn error and the lease is
        // still released.
        const setup = new AbortController();
        setupCtl = setup;
        try {
          await sink.beforeRun();
        } finally {
          if (setupCtl === setup) setupCtl = undefined;
        }
        // Superseded, closed or stopped while beforeRun ran: start nothing (the lease is released).
        if (setup.signal.aborted || !isCurrent(myGen)) return;
        // Hold the iterator explicitly so a stop or detach can .return() it. A return() made while
        // a next() is pending only takes effect once that next() settles (the next line, or the
        // end of the output when the process exits).
        const it = adapter.run(req, { onSpawn, onProgress: cursor.progress, sessionId: s.id })[Symbol.asyncIterator]();
        iterator = it;
        activeIterator = it;
        activeProvider = s.provider;
        detachThis = (): void => {
          detached = true;
          if (s.liveTurn !== undefined) runningTurns.delete(s.liveTurn.cursor.turnId); // resumable now
          trySave(s); // the cursor and the rows handled so far
          finishIterator(it); // stop reading; the CLI keeps writing to the session file
        };
        if (myGen === generation) detachLive = detachThis;
        for (;;) {
          const next = await it.next();
          if (next.done === true || detached) break;
          const ev = next.value;
          // Superseded/closed: report nothing more, but keep reading so the superseded turn's CLI
          // never stalls on a full pipe; its process (and the lease) end when it exits. Newest
          // message wins: the rest of a superseded answer is not added to the transcript, so the
          // transcript never interleaves two turns (the provider's native session still holds it).
          if (!isCurrent(myGen)) {
            if (isTerminal(ev)) {
              endTurn(ev, it);
              trySave(s); // a reload must not follow a turn that has ended
              break;
            }
            continue;
          }
          activeTurnId = ev.turnId;
          sink.onEvent(ev);
          if (isTerminal(ev)) {
            endTurn(ev, it);
            try {
              sink.onTerminal(ev);
            } catch (err) {
              log.warn(`[chat] session ${s.id}: after turn ${ev.turnId} ended: ${err instanceof Error ? err.message : String(err)}`);
            }
            break;
          }
        }
      } catch (err) {
        // A failing sink or adapter: nothing reads the turn any more, so finish its generator (an
        // unread CLI could block on a full pipe and hold the lease until the lock timeout).
        if (iterator !== undefined) finishIterator(iterator);
        if (isCurrent(myGen)) {
          reportError(sink, err instanceof Error ? err.message : String(err), activeTurnId ?? 'none');
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
    const cursor = cursorTracker(s, Date.now());
    const turnId = live.cursor.turnId;
    let attached: TurnProcess | undefined;
    void (async () => {
      try {
        const events = adapter.resume(
          { cursor: { sessionId: s.id, ...live.cursor }, pid: live.pid, startedAt: live.startedAt ?? null },
          {
            signal: ctl.signal,
            onAttach: (p) => {
              attached = p;
              resumedProc = p;
            },
            onProgress: cursor.progress,
          },
        );
        for await (const ev of events) {
          if (ctl.signal.aborted) break;
          // A failing panel callback must not strand the follow: the cursor already moved past this
          // event, so it is logged and the follow goes on to the turn's end (never a replay).
          try {
            sink.onEvent(ev);
          } catch (err) {
            log.warn(`[chat] session ${s.id}: turn ${turnId}: an event was not handled: ${err instanceof Error ? err.message : String(err)}`);
          }
          keepNativeSession(s, ev);
          if (isTerminal(ev)) break;
        }
        if (!ctl.signal.aborted) {
          clearCursor(s, turnId);
          trySave(s);
          sink.onEnd();
        }
      } catch (err) {
        log.warn(`[chat] session ${s.id}: could not resume turn ${turnId}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (following?.ctl === ctl) following = undefined;
        // Only this follow's process: a newer follow (another session) may have attached its own.
        if (attached !== undefined && resumedProc === attached) resumedProc = undefined;
      }
    })();
  }

  /**
   * Ends the live turn: drops a turn waiting for its lease or still setting up (beforeRun),
   * returns the iterator, cancels the provider's turn and stops the newest CLI process. Resolves
   * once the process has exited (or there was none). Idempotent.
   */
  const stopLive = async (): Promise<void> => {
    waitCtl?.abort();
    waitCtl = undefined;
    setupCtl?.abort();
    setupCtl = undefined;
    detachLive = undefined;
    const it = activeIterator;
    const prov = activeProvider;
    const tid = activeTurnId;
    const proc = liveProc;
    clearLiveRefs();
    liveProc = undefined;
    if (it !== undefined) finishIterator(it);
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
