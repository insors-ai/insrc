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
import { observeProcess, processDeparted, type ProcessObservation } from './session-lock.js';
import {
  BUSY_NOTE, LEASE_HEARTBEAT_MS, LEASE_TAKEOVER_MS, PRESENCE_GRACE_MS, StoreBusy,
  type ChatQueueLeases, type ChatQueueStore, type EnqueueResult, type LeaseClaim, type QueuedMessage, type RepoLease, type TurnOutcome,
  type LeaseToken, type ProcessExitProof, type SessionLease, type SessionQueueStore,
} from './chat-queue-store.js';

/** How often the queue is checked while it has rows or this window holds the lease. */
export const ACTIVE_POLL_MS = 500;
/** How often it is checked otherwise. */
export const IDLE_POLL_MS = 5_000;

/** The card a running queued message waits on (Epic E20261014613abdb3 Story S002), or undefined when none. */
export type WaitingOn = 'approval' | 'selection' | undefined;

export interface QueuedCliIdentity {
  readonly pid?: number | undefined;
  readonly startedAt?: number | undefined;
  readonly exited?: Promise<void> | undefined;
}

/** Runs one acknowledged message in this window (the chat host's runQueued, HLD sc3). */
export interface QueuedTurnRunner {
  /**
   * Story S002 (AMD-8): `onWaiting` is called when the message's first approval or selection card
   * appears, and with undefined once none of its cards waits; the worker records it on the message.
   */
  run(
    message: QueuedMessage,
    onSpawn: (cli: QueuedCliIdentity) => void,
    onWaiting?: (on: WaitingOn) => void,
  ): Promise<TurnOutcome>;
  /** Story S004: says a line in the message's chat (the worker's give-up note for a busy outcome write). */
  note?(message: QueuedMessage, text: string): void;
  /** Positive spawn evidence from the persisted live-turn checkpoint if the lease missed it. */
  recoverCli?(lease: SessionLease): QueuedCliIdentity | undefined;
}

/** Story S004: how long a busy outcome write is retried before the worker stops and asks for a reload. */
export const BUSY_GIVE_UP_MS = 60_000;
/** The chat note said when the outcome write is given up. */
export const GIVE_UP_NOTE =
  "The chat queue could not record this message's result. Reload the window to recover it: the queue then fails the message so you can resend it, and moves on.";

/** An outbox action on one message (Story S002, AMD-3). */
export type QueueAction = 'cancel' | 'dismiss' | 'resend' | 'retry-now';
export type QueueActionResult = { readonly ok: true } | { readonly ok: false; readonly note: string };

/** The sentence a refused action shows in the outbox. */
export const ACTION_NOTES = {
  started: 'That message has already started; it is in the chat now.',
  gone: 'That message is no longer in the outbox.',
  notRetrying: 'That message is not waiting to be retried.',
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

export interface SessionQueueWorkerDeps extends Omit<ChatQueueWorkerDeps, 'store' | 'isAlive'> {
  readonly store: SessionQueueStore;
  readonly observe?: ((pid: number) => ProcessObservation) | undefined;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function queueCommands(
  store: Pick<ChatQueueStore, 'enqueue' | 'list' | 'resendFrom' | 'retryNow' | 'cancel' | 'dismiss'>,
  claim: LeaseClaim,
  newTurnId: () => string,
  listeners: Set<(rows: readonly QueuedMessage[]) => void>,
  isDisposed: () => boolean,
  schedule: (ms?: number) => void,
  log: ChatPanelLogger | undefined,
): Omit<ChatQueueWorker, 'running' | 'dispose'> {
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
    act(seq, action) {
      if (isDisposed()) return { ok: false, note: ACTION_NOTES.gone };
      let res: QueueActionResult;
      try {
        if (action === 'resend') {
          const sent = store.resendFrom(seq, newTurnId(), claim.windowKey);
          res = sent.ok ? { ok: true } : { ok: false, note: sent.note };
        } else if (action === 'retry-now') {
          res = store.retryNow(seq) ? { ok: true } : { ok: false, note: ACTION_NOTES.notRetrying };
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
  };
}

export function createChatQueueWorker(deps: ChatQueueWorkerDeps): ChatQueueWorker {
  const { store, claim, now } = deps;
  const timers = deps.timers ?? REAL_TIMERS;
  const log = deps.log;
  const newTurnId = deps.newTurnId ?? (() => randomUUID());
  const listeners = new Set<(rows: readonly QueuedMessage[]) => void>();

  let disposed = false;
  let current: QueuedMessage | undefined;
  /** A finish (and release) that could not be written; retried before any new message is taken. */
  let pendingFinish: { readonly seq: number; readonly outcome: TurnOutcome; readonly message: QueuedMessage; readonly since: number; gaveUp: boolean } | undefined;
  let stamp = '';
  let lastPresence = Number.NEGATIVE_INFINITY;
  let pollHandle: unknown;
  let beatHandle: unknown;
  /** Story S002: a card state of the running message that could not be written yet; written on the next tick. */
  let pendingWaiting: { readonly seq: number; readonly on: WaitingOn } | undefined;
  /** Story S003: the message of a lease this window reclaimed after a reload, and when it last refreshed that lease. */
  let reclaimedSeq: number | undefined;
  let lastReclaimBeat = Number.NEGATIVE_INFINITY;

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

  /**
   * Story S004 (FR004): a busy outcome write is retried each tick for BUSY_GIVE_UP_MS; then one chat note
   * asks for a reload and the retries stop. The reload frees the lease through S003's same-window rule.
   */
  function retryFinish(p: NonNullable<typeof pendingFinish>, at: number): void {
    if (p.gaveUp) return;
    if (finishNow(p.seq, p.outcome)) {
      pendingFinish = undefined;
      return;
    }
    if (at - p.since < BUSY_GIVE_UP_MS) return;
    p.gaveUp = true;
    log?.error(`[chat-queue] giving up writing the outcome of message ${p.seq} after ${BUSY_GIVE_UP_MS} ms; a window reload recovers it`);
    try {
      deps.runner.note?.(p.message, GIVE_UP_NOTE);
    } catch (err) {
      log?.warn(`[chat-queue] the give-up note for message ${p.seq} could not be shown: ${errText(err)}`);
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
    if (!finishNow(m.seq, outcome)) pendingFinish = { seq: m.seq, outcome, message: m, since: now(), gaveUp: false };
    schedule(0);
  }

  /** The holder window's process and the lease's CLI are both gone. */
  const holderGone = (l: RepoLease): boolean => !deps.isAlive(l.pid, l.pidStartedAt) && !cliAlive(l);
  const cliAlive = (l: RepoLease): boolean => l.cliPid !== undefined && deps.isAlive(l.cliPid, l.cliStartedAt);
  const holderPidGone = (l: RepoLease): boolean => !deps.isAlive(l.pid, l.pidStartedAt);

  /**
   * Epic E20261014613abdb3 Story S003 (replaces the ad-hoc recoverDeadLease): the lease rules, each a single store
   * transaction. A lease this window holds because it reclaimed it after a reload is followed until its CLI exits. For
   * another lease whose holder process is gone: the same window key (a reload) is reclaimed when the turn's CLI still
   * lives (the message is not failed) and taken over at once when it does not (the message fails, the outbox offers
   * resend); another window's lease is taken over only after LEASE_TAKEOVER_MS without a heartbeat.
   */
  function applyLeaseRules(at: number): void {
    const lease = store.lease();
    if (lease === undefined) {
      reclaimedSeq = undefined;
      return;
    }
    if (lease.windowKey === claim.windowKey && lease.pid === claim.pid) {
      if (reclaimedSeq === lease.seq) followReclaimed(lease, at);
      return;
    }
    reclaimedSeq = undefined; // the lease is not this window's (any more)
    if (lease.windowKey === claim.windowKey) {
      if (!holderPidGone(lease)) return;
      if (cliAlive(lease)) {
        if (store.reclaim(claim, holderPidGone)) {
          reclaimedSeq = lease.seq;
          lastReclaimBeat = at;
          log?.warn(`[chat-queue] reclaimed the lease of message ${lease.seq} after a reload: its CLI (pid ${lease.cliPid}) is still running`);
        }
      } else if (store.takeOver(claim, at, holderGone)) {
        log?.warn(`[chat-queue] freed the lease of message ${lease.seq}: this window's earlier process (pid ${lease.pid}) and its CLI are gone`);
      }
      return;
    }
    if (at - lease.heartbeatAt < LEASE_TAKEOVER_MS || !holderGone(lease)) return;
    if (store.takeOver(claim, at, holderGone)) {
      log?.warn(`[chat-queue] took over the lease of message ${lease.seq}: window ${lease.windowKey} (pid ${lease.pid}) is gone`);
    }
  }

  /**
   * A reclaimed lease runs a turn this window did not start. Keep it fresh while the CLI lives; when the CLI has exited the
   * turn is over (its output is in the chat's transcript): the message is finished as detached-ended and the lease released.
   */
  function followReclaimed(lease: RepoLease, at: number): void {
    if (cliAlive(lease)) {
      if (at - lastReclaimBeat >= LEASE_HEARTBEAT_MS) {
        lastReclaimBeat = at;
        if (!store.heartbeat(claim)) reclaimedSeq = undefined;
      }
      return;
    }
    store.finish(lease.seq, { kind: 'detached-ended' });
    store.release(claim);
    reclaimedSeq = undefined;
    log?.warn(`[chat-queue] the reclaimed turn of message ${lease.seq} has ended`);
  }

  /**
   * Epic E20261014613abdb3 Story S003: whether the window a head message belongs to is closed. A window is closed only when
   * its presence row has not been refreshed for PRESENCE_GRACE_MS AND its recorded process is gone; a window with no
   * presence row at all is judged closed only once the message itself is older than PRESENCE_GRACE_MS (a reloading window's
   * row is kept by dispose, so it is still fresh; a previous-plugin window's dispose deleted it).
   */
  function windowClosed(head: QueuedMessage, at: number): boolean {
    const presence = store.presenceOf(head.windowKey);
    if (presence === undefined) return at - head.createdAt > PRESENCE_GRACE_MS;
    return at - presence.heartbeatAt > PRESENCE_GRACE_MS && !deps.isAlive(presence.pid, presence.pidStartedAt);
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
        retryFinish(pendingFinish, at);
      }
      if (current === undefined && pendingFinish === undefined) applyLeaseRules(at);
      if (pendingWaiting !== undefined && current?.seq === pendingWaiting.seq) writeWaiting(pendingWaiting.seq, pendingWaiting.on);
      noticeChanges();
      if (current === undefined && pendingFinish === undefined) {
        const head = store.head();
        const due = head !== undefined && (head.state !== 'retrying' || head.nextAttemptAt === undefined || head.nextAttemptAt <= at);
        if (head !== undefined && due && head.windowKey === claim.windowKey && store.acknowledge(head.seq, claim)) {
          void runMessage({ ...head, state: 'processing' });
          noticeChanges();
        } else if (head !== undefined && head.windowKey !== claim.windowKey && store.lease() === undefined && windowClosed(head, at)) {
          // The head's window is closed: it is marked not delivered (the outbox offers resend) so the queue moves on. A false
          // return means another window took, cancelled or finished it first.
          if (store.markNotDeliveredIfHead(head.seq)) {
            log?.warn(`[chat-queue] message ${head.key} is not delivered: its window ${head.windowKey} is closed`);
            noticeChanges();
          }
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
    ...queueCommands(store, claim, newTurnId, listeners, () => disposed, schedule, log),
    running: () => current !== undefined,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pollHandle !== undefined) timers.clearTimeout(pollHandle);
      timers.clearTimeout(beatHandle);
      try {
        // Story S003: the presence row is left in place. A reload disposes and recreates the worker with the same window key
        // within seconds; deleting the row would make the window look closed to another window's tick in that gap. The row
        // ages out over PRESENCE_GRACE_MS when the window really is gone.
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

/** Staged v3 scheduler. The production factory selects it at queue cutover. */
export function createSessionQueueWorker(deps: SessionQueueWorkerDeps): ChatQueueWorker {
  const { store, claim, now, runner, log } = deps;
  const timers = deps.timers ?? REAL_TIMERS;
  const observe = deps.observe ?? observeProcess;
  const listeners = new Set<(rows: readonly QueuedMessage[]) => void>();
  interface LocalRun {
    readonly token: LeaseToken;
    readonly message: QueuedMessage;
    child?: { readonly identity: QueuedCliIdentity; exited: boolean } | undefined;
    pendingCli?: QueuedCliIdentity | undefined;
    pendingWaiting?: { readonly on: WaitingOn } | undefined;
    outcome?: TurnOutcome | undefined;
    firstWriteFailure?: number | undefined;
    gaveUp?: boolean | undefined;
  }
  const active = new Map<string, LocalRun>();
  const recovered = new Map<string, { readonly token: LeaseToken; readonly child: QueuedCliIdentity }>();
  let disposed = false;
  let poll: unknown;
  let lastBeat = Number.NEGATIVE_INFINITY;
  let stamp = '';

  const proofFor = (pid: number, startedAt?: number): ProcessExitProof =>
    ({ pid, recordedStartedAt: startedAt, observation: observe(pid) });
  const departed = (child: QueuedCliIdentity): boolean =>
    child.pid !== undefined && processDeparted(observe(child.pid), child.startedAt);

  function flush(run: LocalRun, at: number): void {
    if (active.get(run.token.sessionId) !== run || run.gaveUp) return;
    try {
      if (run.pendingCli !== undefined) {
        if (!store.attachCli(run.token, run.pendingCli)) {
          active.delete(run.token.sessionId);
          return;
        }
        run.pendingCli = undefined;
      }
      if (run.pendingWaiting !== undefined) {
        store.markWaiting(run.token, run.pendingWaiting.on);
        run.pendingWaiting = undefined;
      }
      if (run.outcome === undefined || run.gaveUp ||
          (run.child !== undefined && !run.child.exited && !departed(run.child.identity))) return;
      store.finish(run.token, run.outcome);
      active.delete(run.token.sessionId);
    } catch (err) {
      log?.warn(`[chat-queue] message ${run.token.seq} state write failed: ${errText(err)}`);
      if (run.outcome === undefined || run.gaveUp) return;
      run.firstWriteFailure ??= at;
      if (at - run.firstWriteFailure < BUSY_GIVE_UP_MS) return;
      run.gaveUp = true;
      try { runner.note?.(run.message, GIVE_UP_NOTE); }
      catch (noteErr) { log?.warn(`[chat-queue] could not show the recovery note: ${errText(noteErr)}`); }
    }
  }

  async function runMessage(message: QueuedMessage, token: LeaseToken): Promise<void> {
    const run: LocalRun = { message, token };
    active.set(token.sessionId, run);
    const isCurrent = () => !disposed && active.get(token.sessionId) === run;
    try {
      run.outcome = await runner.run(message, (identity) => {
        if (!isCurrent()) return;
        const child = { identity, exited: false };
        run.child = child;
        if (identity.pid !== undefined) run.pendingCli = identity;
        if (identity.exited !== undefined) void identity.exited.then(() => {
          if (!isCurrent() || run.child !== child) return;
          child.exited = true;
          schedule(0);
        }, () => {});
        flush(run, now());
      }, (on) => {
        if (!isCurrent()) return;
        run.pendingWaiting = { on };
        flush(run, now());
        schedule(0);
      });
    } catch (err) {
      run.outcome = { kind: 'failed', error: errText(err), acted: true };
    }
    if (!isCurrent()) return;
    flush(run, now());
    schedule(0);
  }

  function recover(lease: SessionLease, beat: boolean): void {
    const known = recovered.get(lease.sessionId);
    if (known?.token.epoch === lease.epoch) {
      if (departed(known.child)) {
        store.finish(known.token, { kind: 'detached-ended' });
        recovered.delete(lease.sessionId);
      } else {
        if (lease.cliPid === undefined) store.attachCli(known.token, known.child);
        if (beat) store.heartbeat(known.token);
      }
      return;
    }
    if (lease.windowKey === claim.windowKey && lease.pid === claim.pid && lease.pidStartedAt === claim.pidStartedAt) return;
    const owner = proofFor(lease.pid, lease.pidStartedAt);
    if (!processDeparted(owner.observation, owner.recordedStartedAt)) return;
    const child = lease.cliPid === undefined ? runner.recoverCli?.(lease) : { pid: lease.cliPid, startedAt: lease.cliStartedAt };
    if (child?.pid === undefined) return; // missing spawn evidence is unresolved
    if (lease.cliPid !== undefined) {
      const cli = proofFor(lease.cliPid, lease.cliStartedAt);
      if (processDeparted(cli.observation, cli.recordedStartedAt)) {
        store.takeOver(lease, claim, { owner, cli });
        return;
      }
    }
    if (lease.windowKey !== claim.windowKey) return;
    const token = store.reclaim(lease, claim, owner);
    if (token === undefined) return;
    recovered.set(lease.sessionId, { token, child });
    if (lease.cliPid === undefined) store.attachCli(token, child);
  }

  function markClosedRows(rows: readonly QueuedMessage[], at: number): void {
    for (const row of rows) {
      if (row.windowKey === claim.windowKey || (row.state !== 'queued' && row.state !== 'retrying')) continue;
      const presence = store.presenceOf(row.windowKey);
      if (presence === undefined) {
        if (at - row.createdAt > PRESENCE_GRACE_MS) store.markNotDeliveredIfHead(row.seq);
      } else if (at - presence.heartbeatAt > PRESENCE_GRACE_MS) {
        const proof = proofFor(presence.pid, presence.pidStartedAt);
        if (processDeparted(proof.observation, proof.recordedStartedAt)) store.markNotDeliveredIfHead(row.seq, proof);
      }
    }
  }

  function tick(): void {
    poll = undefined;
    if (disposed) return;
    let hasRows = true;
    try {
      const at = now();
      const beat = at - lastBeat >= LEASE_HEARTBEAT_MS;
      if (beat) {
        store.presence(claim);
        lastBeat = at;
      }
      const leases = store.leases();
      for (const [sessionId, run] of active) {
        if (!leases.some((lease) => lease.epoch === run.token.epoch)) active.delete(sessionId);
        else {
          flush(run, at);
          if (beat && active.has(sessionId)) store.heartbeat(run.token);
        }
      }
      for (const [sessionId, entry] of recovered) {
        if (!leases.some((lease) => lease.epoch === entry.token.epoch)) recovered.delete(sessionId);
      }
      for (const lease of leases) {
        if (active.has(lease.sessionId)) continue;
        try { recover(lease, beat); }
        catch (err) { log?.warn(`[chat-queue] recovery of message ${lease.seq} will retry: ${errText(err)}`); }
      }
      for (let head = store.head(claim.windowKey, at); head !== undefined; head = store.head(claim.windowKey, at)) {
        const token = store.acknowledge(head.seq, claim);
        if (token === undefined) break;
        void runMessage({ ...head, state: 'processing' }, token);
      }
      markClosedRows(store.list(), at);
      const nextStamp = `${store.dataVersion()}:${store.ownWrites()}`;
      if (nextStamp !== stamp) {
        const rows = store.list();
        hasRows = rows.length > 0;
        stamp = nextStamp;
        for (const listener of listeners) {
          try { listener(rows); }
          catch (err) { log?.error(`[chat-queue] an onChange listener failed: ${errText(err)}`); }
        }
      } else hasRows = store.list().length > 0;
    } catch (err) {
      log?.warn(`[chat-queue] check failed, retrying on the next poll: ${errText(err)}`);
    }
    if (poll === undefined) schedule(hasRows ? ACTIVE_POLL_MS : IDLE_POLL_MS);
  }

  function schedule(delay = 0): void {
    if (disposed) return;
    if (poll !== undefined) timers.clearTimeout(poll);
    poll = timers.setTimeout(tick, delay);
  }

  schedule();
  return {
    ...queueCommands(store, claim, deps.newTurnId ?? randomUUID, listeners, () => disposed, schedule, log),
    running: () => active.size > 0 || recovered.size > 0,
    dispose() {
      disposed = true;
      if (poll !== undefined) timers.clearTimeout(poll);
      listeners.clear();
    },
  };
}
