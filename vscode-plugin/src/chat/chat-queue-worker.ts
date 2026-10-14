/**
 * Epic E20261014613abdb3 Story S001 — a window's chat queue worker (HLD sc4).
 *
 * Every VS Code window on a repository runs one. It keeps the window's presence fresh,
 * notices changes to the repository's queue (another window's commit through SQLite's
 * data_version, and its own writes through the store's counter), and when the message at
 * the front is this window's and the lease is free, it acknowledges the message (taking
 * the lease), runs it through the chat host's runner, heartbeats the lease while it runs,
 * and records the outcome. One message runs at a time per window; the lease makes that one
 * per repository.
 *
 * vscode-free and deps-injected: the store, the runner, the clock, timers and the process
 * check come in from the extension.
 */

import { randomUUID } from 'node:crypto';
import { REAL_TIMERS, type Timers } from './async-util.js';
import type { AttachmentRef } from './attachment-store.js';
import type { ChatPanelLogger } from './chat-panel.js';
import {
  BUSY_NOTE, LEASE_HEARTBEAT_MS, StoreBusy,
  type ChatQueueLeases, type ChatQueueStore, type EnqueueResult, type LeaseClaim, type QueuedMessage, type TurnOutcome,
} from './chat-queue-store.js';

/** How often the queue is checked while it has rows or this window holds the lease. */
export const ACTIVE_POLL_MS = 500;
/** How often it is checked otherwise. */
export const IDLE_POLL_MS = 5_000;

/** The card a running queued message waits on (Epic E20261014613abdb3 Story S002), or undefined when none. */
export type WaitingOn = 'approval' | 'selection' | undefined;

/** Runs one acknowledged message in this window (the chat host's runQueued, HLD sc3). */
export interface QueuedTurnRunner {
  /**
   * Story S002 (AMD-8): `onWaiting` is called when the message's first approval or selection card
   * appears, and with undefined once none of its cards waits; the worker records it on the message.
   */
  run(
    message: QueuedMessage,
    onSpawn: (cli: { readonly pid?: number | undefined; readonly startedAt?: number | undefined }) => void,
    onWaiting?: (on: WaitingOn) => void,
  ): Promise<TurnOutcome>;
}

/** An outbox action on one message (Story S002, AMD-3). */
export type QueueAction = 'cancel' | 'dismiss' | 'resend';
export type QueueActionResult = { readonly ok: true } | { readonly ok: false; readonly note: string };

/** The sentence a refused action shows in the outbox. */
export const ACTION_NOTES = {
  started: 'That message has already started; it is in the chat now.',
  gone: 'That message is no longer in the outbox.',
} as const;

export interface ChatQueueSubmission {
  readonly sessionId: string;
  readonly text: string;
  readonly origin: 'typed' | 'review-pane';
  readonly attachments: readonly AttachmentRef[];
}

export interface ChatQueueWorker {
  submit(m: ChatQueueSubmission): EnqueueResult;
  /** After any commit, this window's or another's: the live rows in queue order. */
  onChange(listener: (rows: readonly QueuedMessage[]) => void): { dispose(): void };
  /** Sessions with a live row: kept by the attachment sweep and by session eviction. */
  liveSessionIds(): ReadonlySet<string>;
  /** Whether this window is running a queued message now. */
  running(): boolean;
  /**
   * Story S002 (AMD-3): an outbox action. cancel a queued or retrying message, dismiss a failed or
   * not-delivered one, or resend it at the back as this window's. The change is noticed at once; a
   * refusal carries a sentence for the user and is never thrown.
   */
  act(seq: number, action: QueueAction): QueueActionResult;
  dispose(): void;
}

export interface ChatQueueWorkerDeps {
  readonly store: ChatQueueStore & ChatQueueLeases;
  /** This window: its window key (stable across reloads) and its extension-host process. */
  readonly claim: LeaseClaim;
  readonly runner: QueuedTurnRunner;
  /** The pid is alive and, when a start time is given, it is the same process. */
  readonly isAlive: (pid: number, startedAt?: number) => boolean;
  readonly now: () => number;
  readonly timers?: Timers | undefined;
  readonly log?: ChatPanelLogger | undefined;
  /** A turn id for a new message. */
  readonly newTurnId?: (() => string) | undefined;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function createChatQueueWorker(deps: ChatQueueWorkerDeps): ChatQueueWorker {
  const { store, claim, now } = deps;
  const timers = deps.timers ?? REAL_TIMERS;
  const log = deps.log;
  const newTurnId = deps.newTurnId ?? (() => randomUUID());
  const listeners = new Set<(rows: readonly QueuedMessage[]) => void>();

  let disposed = false;
  let current: QueuedMessage | undefined;
  /** A finish (and release) that could not be written; retried before any new message is taken. */
  let pendingFinish: { readonly seq: number; readonly outcome: TurnOutcome } | undefined;
  let stamp = '';
  let lastPresence = Number.NEGATIVE_INFINITY;
  let pollHandle: unknown;
  let beatHandle: unknown;
  /** Story S002: a card state of the running message that could not be written yet; written on the next tick. */
  let pendingWaiting: { readonly seq: number; readonly on: WaitingOn } | undefined;

  function emit(): void {
    let rows: readonly QueuedMessage[];
    try {
      rows = store.list();
    } catch (err) {
      log?.warn(`[chat-queue] the queue could not be read: ${errText(err)}`);
      return;
    }
    for (const l of listeners) {
      try {
        l(rows);
      } catch (err) {
        log?.error(`[chat-queue] an onChange listener failed: ${errText(err)}`);
      }
    }
  }

  /** Emits when another connection committed or this one wrote since the last check. */
  function noticeChanges(): void {
    const next = `${store.dataVersion()}:${store.ownWrites()}`;
    if (next === stamp) return;
    stamp = next;
    emit();
  }

  function finishNow(seq: number, outcome: TurnOutcome): boolean {
    try {
      store.finish(seq, outcome);
      store.release(claim);
      return true;
    } catch (err) {
      log?.warn(`[chat-queue] the outcome of message ${seq} could not be written yet: ${errText(err)}`);
      return false;
    }
  }

  function startHeartbeat(): void {
    const beat = (): void => {
      if (disposed || current === undefined) return;
      try {
        if (!store.heartbeat(claim)) log?.warn(`[chat-queue] the lease for message ${current.seq} is no longer this window's`);
      } catch (err) {
        log?.warn(`[chat-queue] lease heartbeat failed: ${errText(err)}`);
      }
      beatHandle = timers.setTimeout(beat, LEASE_HEARTBEAT_MS);
    };
    beatHandle = timers.setTimeout(beat, LEASE_HEARTBEAT_MS);
  }

  /** Story S002: records the card the running message waits on; a failed write is kept for the next tick. */
  function writeWaiting(seq: number, on: WaitingOn): void {
    pendingWaiting = undefined;
    try {
      store.markWaiting(seq, on);
    } catch (err) {
      log?.warn(`[chat-queue] the card of message ${seq} could not be recorded yet: ${errText(err)}`);
      pendingWaiting = { seq, on };
    }
  }

  async function runMessage(m: QueuedMessage): Promise<void> {
    current = m;
    startHeartbeat();
    let outcome: TurnOutcome;
    try {
      outcome = await deps.runner.run(
        m,
        (cli) => {
          try {
            store.attachCli(claim, cli);
          } catch (err) {
            log?.warn(`[chat-queue] the CLI of message ${m.seq} could not be recorded: ${errText(err)}`);
          }
        },
        (on) => {
          if (disposed || current?.seq !== m.seq) return;
          writeWaiting(m.seq, on);
          schedule(0);
        },
      );
    } catch (err) {
      // A runner that rejects instead of resolving: failed, and never retried.
      outcome = { kind: 'failed', error: errText(err), acted: true };
    }
    timers.clearTimeout(beatHandle);
    current = undefined;
    if (pendingWaiting?.seq === m.seq) pendingWaiting = undefined; // the flag ends with the message
    if (disposed) return;
    if (!finishNow(m.seq, outcome)) pendingFinish = { seq: m.seq, outcome };
    schedule(0);
  }

  function tick(): void {
    pollHandle = undefined;
    if (disposed) return;
    try {
      const at = now();
      if (at - lastPresence >= LEASE_HEARTBEAT_MS) {
        store.presence(claim);
        lastPresence = at;
      }
      if (pendingFinish !== undefined) {
        if (finishNow(pendingFinish.seq, pendingFinish.outcome)) pendingFinish = undefined;
      }
      if (pendingWaiting !== undefined && current?.seq === pendingWaiting.seq) writeWaiting(pendingWaiting.seq, pendingWaiting.on);
      noticeChanges();
      if (current === undefined && pendingFinish === undefined) {
        const head = store.head();
        const due = head !== undefined && (head.state !== 'retrying' || head.nextAttemptAt === undefined || head.nextAttemptAt <= at);
        if (head !== undefined && due && head.windowKey === claim.windowKey && store.acknowledge(head.seq, claim)) {
          void runMessage({ ...head, state: 'processing' });
          noticeChanges();
        }
      }
    } catch (err) {
      log?.warn(`[chat-queue] check failed, retrying on the next poll: ${errText(err)}`);
    }
    schedule();
  }

  function schedule(ms?: number): void {
    if (disposed) return;
    if (pollHandle !== undefined) {
      if (ms === undefined) return;
      timers.clearTimeout(pollHandle);
    }
    let active = current !== undefined || pendingFinish !== undefined;
    if (!active) {
      try {
        active = store.list().length > 0;
      } catch {
        active = true;
      }
    }
    pollHandle = timers.setTimeout(tick, ms ?? (active ? ACTIVE_POLL_MS : IDLE_POLL_MS));
  }

  schedule(0);

  return {
    submit(m) {
      const turnId = newTurnId();
      const res = store.enqueue({
        key: `${m.sessionId}::${turnId}`,
        sessionId: m.sessionId,
        turnId,
        windowKey: claim.windowKey,
        origin: m.origin,
        text: m.text,
        attachments: m.attachments,
      });
      schedule(0);
      return res;
    },
    onChange(listener) {
      listeners.add(listener);
      return { dispose: () => void listeners.delete(listener) };
    },
    liveSessionIds() {
      try {
        return new Set(store.list().map((r) => r.sessionId));
      } catch {
        return new Set();
      }
    },
    running() {
      return current !== undefined;
    },
    act(seq, action) {
      if (disposed) return { ok: false, note: ACTION_NOTES.gone };
      let res: QueueActionResult;
      try {
        if (action === 'resend') {
          const sent = store.resendFrom(seq, newTurnId(), claim.windowKey);
          res = sent.ok ? { ok: true } : { ok: false, note: sent.note };
        } else if (action === 'cancel') {
          res = store.cancel(seq) ? { ok: true } : { ok: false, note: store.list().some((r) => r.seq === seq && r.state === 'processing') ? ACTION_NOTES.started : ACTION_NOTES.gone };
        } else {
          res = store.dismiss(seq) ? { ok: true } : { ok: false, note: ACTION_NOTES.gone };
        }
      } catch (err) {
        log?.warn(`[chat-queue] ${action} of message ${seq} failed: ${errText(err)}`);
        res = { ok: false, note: err instanceof StoreBusy ? BUSY_NOTE : `The chat queue could not change the message: ${errText(err)}` };
      }
      if (res.ok) schedule(0);
      return res;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pollHandle !== undefined) timers.clearTimeout(pollHandle);
      timers.clearTimeout(beatHandle);
      try {
        store.leave(claim);
        const lease = store.lease();
        if (lease !== undefined && lease.windowKey === claim.windowKey && lease.pid === claim.pid) {
          // A turn whose CLI has already exited is finished now; one still running keeps the lease
          // until its heartbeat times out (Story S003 takes it over).
          const cliGone = lease.cliPid === undefined || !deps.isAlive(lease.cliPid, lease.cliStartedAt);
          if (cliGone) {
            store.finish(lease.seq, { kind: 'failed', error: 'the window closed during the turn', acted: true });
            store.release(claim);
          }
        } else if (pendingFinish !== undefined) {
          finishNow(pendingFinish.seq, pendingFinish.outcome);
        }
      } catch (err) {
        log?.warn(`[chat-queue] closing the queue worker: ${errText(err)}`);
      }
      listeners.clear();
    },
  };
}
