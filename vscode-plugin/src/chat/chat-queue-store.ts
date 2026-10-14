/**
 * Epic E20261014613abdb3 Story S001 — the repository's chat queue store.
 *
 * One SQLite database per repository, shared by every VS Code window on it (HLD sc1, sc2):
 * the chat messages in the order they were sent, a single-row lease naming the window that
 * runs the repository's turn, and the presence of live windows. Every write is one short
 * BEGIN IMMEDIATE transaction, so two windows never interleave a change; SQLite's file lock
 * serialises them and the busy timeout makes a writer wait rather than fail.
 *
 * A vscode-free, deps-injected module: the database is opened through `openDatabase`
 * (node:sqlite's DatabaseSync in the extension), so tests use a temp file.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AttachmentRef } from './attachment-store.js';
import type { ChatPanelLogger } from './chat-panel.js';

/** At most this many rows live in a repository's queue; done rows are deleted at once. */
export const QUEUE_RECORD_BOUND = 500;
/** How often a running turn's window refreshes the lease, and every window its presence. */
export const LEASE_HEARTBEAT_MS = 5_000;
/** A lease this long without a heartbeat may be taken over (Story S003), once its processes are gone. */
export const LEASE_TAKEOVER_MS = 600_000;
/** A window absent this long, with its process gone, is closed (Story S003). */
export const PRESENCE_GRACE_MS = 30_000;
/** How long the store waits for another window's write before a write fails as busy. */
export const BUSY_TIMEOUT_MS = 5_000;
/** The schema this module reads and writes. */
export const SCHEMA_VERSION = 2;

export type QueueState = 'queued' | 'processing' | 'retrying' | 'done' | 'failed' | 'not-delivered';

export interface QueuedMessage {
  /** Queue order: the row id. */
  readonly seq: number;
  /** `${sessionId}::${turnId}`. */
  readonly key: string;
  readonly sessionId: string;
  readonly turnId: string;
  /** The window that sent it; stable across reloads. */
  readonly windowKey: string;
  readonly origin: 'typed' | 'review-pane';
  readonly text: string;
  /** The attachment store's own refs, kept as they are. */
  readonly attachments: readonly AttachmentRef[];
  readonly state: QueueState;
  /** Infrastructure retries made (Story S004). */
  readonly attempts: number;
  readonly nextAttemptAt?: number | undefined;
  readonly error?: string | undefined;
  /** Epic E20261014613abdb3 Story S002: a processing message waiting on an approval or selection card (schema 2). */
  readonly waitingOn?: 'approval' | 'selection' | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type EnqueueResult =
  | { readonly ok: true; readonly message: QueuedMessage }
  | { readonly ok: false; readonly reason: 'full' | 'busy' | 'unavailable'; readonly note: string };

export interface LeaseClaim {
  readonly windowKey: string;
  readonly pid: number;
  readonly pidStartedAt?: number | undefined;
}

export interface RepoLease extends LeaseClaim {
  /** The message being run. */
  readonly seq: number;
  /** The turn's CLI process, recorded at spawn. */
  readonly cliPid?: number | undefined;
  readonly cliStartedAt?: number | undefined;
  readonly heartbeatAt: number;
}

export interface WindowPresence extends LeaseClaim {
  readonly heartbeatAt: number;
}

export type InfraCause = 'spawn' | 'rate-limit' | 'overloaded' | 'network' | 'timeout' | 'auth' | 'other';

/** How a queued turn and its continuations ended (HLD sc3). */
export type TurnOutcome =
  | { readonly kind: 'done' }
  | { readonly kind: 'stopped'; readonly reason?: string | undefined }
  | { readonly kind: 'failed'; readonly error: string; readonly acted: boolean; readonly cause?: InfraCause | undefined }
  | { readonly kind: 'detached-ended' }
  | { readonly kind: 'not-delivered'; readonly reason: 'window-closed' };

/** What a sender gives; the store adds the order, state and times. */
export type NewMessage = Omit<QueuedMessage, 'seq' | 'state' | 'attempts' | 'createdAt' | 'updatedAt' | 'nextAttemptAt' | 'error' | 'waitingOn'>;

export interface ChatQueueStore {
  enqueue(m: NewMessage): EnqueueResult;
  /** The first row in queue order that is queued or retrying; a retrying head that is not yet due still is the head. */
  head(): QueuedMessage | undefined;
  /** queued (or retrying and due) -> processing for the head message, taking the free lease, in one transaction. */
  acknowledge(seq: number, claim: LeaseClaim): boolean;
  /** Records how the message's turn ended and clears the lease when it names this message. */
  finish(seq: number, outcome: TurnOutcome): QueuedMessage | undefined;
  /** A queued or retrying message leaves the queue. */
  cancel(seq: number): boolean;
  /** A failed or not-delivered message is deleted. */
  dismiss(seq: number): boolean;
  /** A failed or not-delivered message is queued again at the back under a new turn id. */
  resend(seq: number, newTurnId: string): EnqueueResult;
  /**
   * Epic E20261014613abdb3 Story S002: resend, with the message handed to the window that resends it (a
   * not-delivered message's own window is closed, so under its old key no window would take it).
   */
  resendFrom(seq: number, newTurnId: string, windowKey: string): EnqueueResult;
  /**
   * Epic E20261014613abdb3 Story S003: marks the head not-delivered ('its window was closed') when `seq` is still the
   * head (queued or retrying) inside the transaction; false when another window took, cancelled or finished it first.
   */
  markNotDeliveredIfHead(seq: number): boolean;
  /** Epic E20261014613abdb3 Story S002: sets or clears the card a processing message waits on; false on any other row. */
  markWaiting(seq: number, on: 'approval' | 'selection' | undefined): boolean;
  /** Every live row, in queue order. */
  list(): readonly QueuedMessage[];
  /** Changes when another connection commits (SQLite's data_version). */
  dataVersion(): number;
  /** Counts this connection's own committed writes, which data_version does not reflect. */
  ownWrites(): number;
  close(): void;
}

export interface ChatQueueLeases {
  /** Refreshes this window's presence row. */
  presence(claim: LeaseClaim): void;
  /** Removes this window's presence row (the window is closing). */
  leave(claim: LeaseClaim): void;
  lease(): RepoLease | undefined;
  /** Records the turn's CLI process on this window's lease. */
  attachCli(claim: LeaseClaim, cli: { readonly pid?: number | undefined; readonly startedAt?: number | undefined }): boolean;
  /** False when the lease is no longer this window's. */
  heartbeat(claim: LeaseClaim): boolean;
  release(claim: LeaseClaim): void;
  /** Story S003 gives the rule; until then a held lease is never taken over. */
  takeOver(claim: LeaseClaim, now: number): boolean;
  /** Story S003 gives the rule; until then a reloaded window does not reclaim. */
  reclaim(claim: LeaseClaim): boolean;
  /** Whether a live presence row for the window was refreshed within PRESENCE_GRACE_MS. */
  windowAlive(windowKey: string, now: number): boolean;
  /** Epic E20261014613abdb3 Story S003: the window's presence row (pid and last refresh), or undefined when it has none. */
  presenceOf(windowKey: string): WindowPresence | undefined;
}

/** The subset of node:sqlite's DatabaseSync the store uses. */
export interface SqliteStatement {
  run(...params: SqlValue[]): { readonly changes: number | bigint; readonly lastInsertRowid: number | bigint };
  get(...params: SqlValue[]): Record<string, unknown> | undefined;
  all(...params: SqlValue[]): Record<string, unknown>[];
}
export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
export type SqlValue = string | number | bigint | null;

export interface ChatQueueStoreDeps {
  readonly path: string;
  readonly openDatabase: (path: string) => SqliteDatabase;
  readonly now: () => number;
  readonly pluginVersion: string;
  readonly log?: ChatPanelLogger | undefined;
}

/** The store cannot be used: the database could not be opened, or another plugin made a newer schema. */
export class StoreUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreUnavailable';
  }
}

/** A write waited past the busy timeout for another window. */
export class StoreBusy extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreBusy';
  }
}

export const FULL_NOTE = `The chat queue for this repository is full (${QUEUE_RECORD_BOUND} messages). Dismiss or cancel some to send more.`;
export const BUSY_NOTE = 'The chat queue is busy in another window; send the message again in a moment.';

const isBusy = (err: unknown): boolean => /database is locked|SQLITE_BUSY|database table is locked/i.test(err instanceof Error ? err.message : String(err));

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS messages (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     key TEXT NOT NULL UNIQUE,
     session_id TEXT NOT NULL,
     turn_id TEXT NOT NULL,
     window_key TEXT NOT NULL,
     origin TEXT NOT NULL,
     text TEXT NOT NULL,
     attachments_json TEXT NOT NULL,
     state TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     next_attempt_at INTEGER,
     error TEXT,
     waiting_on TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS messages_state_seq ON messages (state, seq)`,
  `CREATE TABLE IF NOT EXISTS lease (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     window_key TEXT NOT NULL,
     pid INTEGER NOT NULL,
     pid_started_at INTEGER,
     seq INTEGER NOT NULL,
     cli_pid INTEGER,
     cli_started_at INTEGER,
     heartbeat_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS presence (
     window_key TEXT PRIMARY KEY,
     pid INTEGER NOT NULL,
     pid_started_at INTEGER,
     heartbeat_at INTEGER NOT NULL)`,
];

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function rowToMessage(r: Record<string, unknown>): QueuedMessage {
  let attachments: AttachmentRef[] = [];
  try {
    const parsed: unknown = JSON.parse(String(r['attachments_json'] ?? '[]'));
    if (Array.isArray(parsed)) attachments = parsed as AttachmentRef[];
  } catch {
    attachments = [];
  }
  const nextAttemptAt = num(r['next_attempt_at']);
  const error = str(r['error']);
  const waiting = r['waiting_on'];
  const waitingOn = waiting === 'approval' || waiting === 'selection' ? waiting : undefined;
  return {
    seq: num(r['seq']) ?? 0,
    key: String(r['key']),
    sessionId: String(r['session_id']),
    turnId: String(r['turn_id']),
    windowKey: String(r['window_key']),
    origin: r['origin'] === 'review-pane' ? 'review-pane' : 'typed',
    text: String(r['text']),
    attachments,
    state: String(r['state']) as QueueState,
    attempts: num(r['attempts']) ?? 0,
    ...(nextAttemptAt !== undefined ? { nextAttemptAt } : {}),
    ...(error !== undefined ? { error } : {}),
    ...(waitingOn !== undefined ? { waitingOn } : {}),
    createdAt: num(r['created_at']) ?? 0,
    updatedAt: num(r['updated_at']) ?? 0,
  };
}

function rowToLease(r: Record<string, unknown>): RepoLease {
  const pidStartedAt = num(r['pid_started_at']);
  const cliPid = num(r['cli_pid']);
  const cliStartedAt = num(r['cli_started_at']);
  return {
    windowKey: String(r['window_key']),
    pid: num(r['pid']) ?? 0,
    ...(pidStartedAt !== undefined ? { pidStartedAt } : {}),
    seq: num(r['seq']) ?? 0,
    ...(cliPid !== undefined ? { cliPid } : {}),
    ...(cliStartedAt !== undefined ? { cliStartedAt } : {}),
    heartbeatAt: num(r['heartbeat_at']) ?? 0,
  };
}

const LIVE_HEAD = `SELECT * FROM messages WHERE state IN ('queued', 'retrying') ORDER BY seq LIMIT 1`;

export function createChatQueueStore(deps: ChatQueueStoreDeps): ChatQueueStore & ChatQueueLeases {
  const { now } = deps;
  let db: SqliteDatabase;
  try {
    mkdirSync(dirname(deps.path), { recursive: true });
    db = deps.openDatabase(deps.path);
  } catch (err) {
    throw new StoreUnavailable(`the chat queue could not be opened: ${err instanceof Error ? err.message : String(err)}`);
  }
  let own = 0;

  /** One write: BEGIN IMMEDIATE ... COMMIT, rolled back on a throw; a busy wait past the timeout is StoreBusy. */
  function write<T>(fn: () => T): T {
    try {
      db.exec('BEGIN IMMEDIATE');
    } catch (err) {
      if (isBusy(err)) throw new StoreBusy(String(err instanceof Error ? err.message : err));
      throw err;
    }
    try {
      const out = fn();
      db.exec('COMMIT');
      own += 1;
      return out;
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* the transaction may already be gone */
      }
      if (isBusy(err)) throw new StoreBusy(String(err instanceof Error ? err.message : err));
      throw err;
    }
  }

  try {
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    write(() => {
      for (const sql of SCHEMA) db.exec(sql);
      const version = num(Number(str(db.prepare(`SELECT value FROM meta WHERE key = 'schema_version'`).get()?.['value']) ?? NaN));
      if (version === undefined || Number.isNaN(version)) {
        db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`).run(String(SCHEMA_VERSION));
        db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('created_by', ?)`).run(deps.pluginVersion);
      } else if (version > SCHEMA_VERSION) {
        throw new StoreUnavailable(`the chat queue was made by a newer plugin (schema ${version}); reload or update this window`);
      } else if (version < SCHEMA_VERSION) {
        // Epic E20261014613abdb3 Story S002: version 1 -> 2 adds waiting_on; its rows are kept.
        if (version < 2) db.exec(`ALTER TABLE messages ADD COLUMN waiting_on TEXT`);
        db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`).run(String(SCHEMA_VERSION));
      }
    });
  } catch (err) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    if (err instanceof StoreUnavailable) throw err;
    throw new StoreUnavailable(`the chat queue could not be prepared: ${err instanceof Error ? err.message : String(err)}`);
  }

  const liveCount = (): number => num(db.prepare(`SELECT COUNT(*) AS n FROM messages`).get()?.['n']) ?? 0;
  const bySeq = (seq: number): QueuedMessage | undefined => {
    const r = db.prepare(`SELECT * FROM messages WHERE seq = ?`).get(seq);
    return r === undefined ? undefined : rowToMessage(r);
  };
  const leaseRow = (): RepoLease | undefined => {
    const r = db.prepare(`SELECT * FROM lease WHERE id = 1`).get();
    return r === undefined ? undefined : rowToLease(r);
  };
  const holds = (_claim: LeaseClaim): string => `window_key = ? AND pid = ?`;

  function insert(m: NewMessage, at: number): QueuedMessage {
    const res = db
      .prepare(
        `INSERT INTO messages (key, session_id, turn_id, window_key, origin, text, attachments_json, state, attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)`,
      )
      .run(m.key, m.sessionId, m.turnId, m.windowKey, m.origin, m.text, JSON.stringify(m.attachments), at, at);
    return bySeq(Number(res.lastInsertRowid))!;
  }

  const refused = (reason: 'full' | 'busy' | 'unavailable', note: string): EnqueueResult => ({ ok: false, reason, note });

  /** A failed or not-delivered message queued again at the back under a new turn id, by its own window or the given one. */
  function resendTo(seq: number, newTurnId: string, windowKey: string | undefined): EnqueueResult {
    try {
      return write((): EnqueueResult => {
        const old = bySeq(seq);
        if (old === undefined || (old.state !== 'failed' && old.state !== 'not-delivered')) {
          return refused('unavailable', 'That message can no longer be sent again.');
        }
        db.prepare(`DELETE FROM messages WHERE seq = ?`).run(seq);
        // The old row's place is freed first, so a resend never needs more room than it had.
        if (liveCount() >= QUEUE_RECORD_BOUND) return refused('full', FULL_NOTE);
        return {
          ok: true,
          message: insert(
            { key: `${old.sessionId}::${newTurnId}`, sessionId: old.sessionId, turnId: newTurnId, windowKey: windowKey ?? old.windowKey, origin: old.origin, text: old.text, attachments: old.attachments },
            now(),
          ),
        };
      });
    } catch (err) {
      if (err instanceof StoreBusy) return refused('busy', BUSY_NOTE);
      return refused('unavailable', `The chat queue could not take the message: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    enqueue(m) {
      try {
        return write((): EnqueueResult => {
          if (liveCount() >= QUEUE_RECORD_BOUND) return refused('full', FULL_NOTE);
          return { ok: true, message: insert(m, now()) };
        });
      } catch (err) {
        if (err instanceof StoreBusy) {
          deps.log?.warn(`[chat-queue] enqueue of ${m.key} waited past the busy timeout`);
          return refused('busy', BUSY_NOTE);
        }
        deps.log?.error(`[chat-queue] enqueue of ${m.key} failed: ${err instanceof Error ? err.message : String(err)}`);
        return refused('unavailable', `The chat queue could not take the message: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    head() {
      const r = db.prepare(LIVE_HEAD).get();
      return r === undefined ? undefined : rowToMessage(r);
    },

    acknowledge(seq, claim) {
      return write(() => {
        const r = db.prepare(LIVE_HEAD).get();
        if (r === undefined) return false;
        const head = rowToMessage(r);
        if (head.seq !== seq) return false;
        const at = now();
        if (head.state === 'retrying' && head.nextAttemptAt !== undefined && head.nextAttemptAt > at) return false;
        if (leaseRow() !== undefined) return false;
        db.prepare(`INSERT INTO lease (id, window_key, pid, pid_started_at, seq, heartbeat_at) VALUES (1, ?, ?, ?, ?, ?)`).run(
          claim.windowKey,
          claim.pid,
          claim.pidStartedAt ?? null,
          seq,
          at,
        );
        const changed = db.prepare(`UPDATE messages SET state = 'processing', updated_at = ? WHERE seq = ? AND state IN ('queued', 'retrying')`).run(at, seq);
        if (Number(changed.changes) !== 1) throw new Error(`message ${seq} changed while it was acknowledged`);
        return true;
      });
    },

    finish(seq, outcome) {
      return write(() => {
        const at = now();
        switch (outcome.kind) {
          case 'done':
          case 'detached-ended':
            db.prepare(`DELETE FROM messages WHERE seq = ?`).run(seq);
            break;
          case 'stopped':
            db.prepare(`UPDATE messages SET state = 'failed', error = ?, updated_at = ? WHERE seq = ?`).run(outcome.reason ?? 'stopped by the user', at, seq);
            break;
          case 'failed':
            db.prepare(`UPDATE messages SET state = 'failed', error = ?, updated_at = ? WHERE seq = ?`).run(outcome.error, at, seq);
            break;
          case 'not-delivered':
            db.prepare(`UPDATE messages SET state = 'not-delivered', error = ?, updated_at = ? WHERE seq = ?`).run('its window was closed', at, seq);
            break;
        }
        // Story S002: the card it waited on ends with the run.
        db.prepare(`UPDATE messages SET waiting_on = NULL WHERE seq = ?`).run(seq);
        db.prepare(`DELETE FROM lease WHERE id = 1 AND seq = ?`).run(seq);
        return bySeq(seq);
      });
    },

    markNotDeliveredIfHead(seq) {
      return write(() => {
        const r = db.prepare(LIVE_HEAD).get();
        if (r === undefined || rowToMessage(r).seq !== seq) return false;
        const changed = db
          .prepare(`UPDATE messages SET state = 'not-delivered', error = ?, waiting_on = NULL, updated_at = ? WHERE seq = ? AND state IN ('queued', 'retrying')`)
          .run('its window was closed', now(), seq);
        return Number(changed.changes) === 1;
      });
    },

    cancel(seq) {
      return write(() => Number(db.prepare(`DELETE FROM messages WHERE seq = ? AND state IN ('queued', 'retrying')`).run(seq).changes) === 1);
    },

    dismiss(seq) {
      return write(() => Number(db.prepare(`DELETE FROM messages WHERE seq = ? AND state IN ('failed', 'not-delivered')`).run(seq).changes) === 1);
    },

    resend(seq, newTurnId) {
      return resendTo(seq, newTurnId, undefined);
    },

    resendFrom(seq, newTurnId, windowKey) {
      return resendTo(seq, newTurnId, windowKey);
    },

    markWaiting(seq, on) {
      return write(
        () => Number(db.prepare(`UPDATE messages SET waiting_on = ? WHERE seq = ? AND state = 'processing'`).run(on ?? null, seq).changes) === 1,
      );
    },

    list() {
      return db.prepare(`SELECT * FROM messages ORDER BY seq`).all().map(rowToMessage);
    },

    dataVersion() {
      return num(db.prepare('PRAGMA data_version').get()?.['data_version']) ?? 0;
    },

    ownWrites() {
      return own;
    },

    presence(claim) {
      write(() => {
        db.prepare(
          `INSERT INTO presence (window_key, pid, pid_started_at, heartbeat_at) VALUES (?, ?, ?, ?)
           ON CONFLICT (window_key) DO UPDATE SET pid = excluded.pid, pid_started_at = excluded.pid_started_at, heartbeat_at = excluded.heartbeat_at`,
        ).run(claim.windowKey, claim.pid, claim.pidStartedAt ?? null, now());
      });
    },

    leave(claim) {
      write(() => {
        db.prepare(`DELETE FROM presence WHERE ${holds(claim)}`).run(claim.windowKey, claim.pid);
      });
    },

    lease() {
      return leaseRow();
    },

    attachCli(claim, cli) {
      return write(
        () =>
          Number(
            db.prepare(`UPDATE lease SET cli_pid = ?, cli_started_at = ? WHERE id = 1 AND ${holds(claim)}`).run(cli.pid ?? null, cli.startedAt ?? null, claim.windowKey, claim.pid)
              .changes,
          ) === 1,
      );
    },

    heartbeat(claim) {
      return write(() => Number(db.prepare(`UPDATE lease SET heartbeat_at = ? WHERE id = 1 AND ${holds(claim)}`).run(now(), claim.windowKey, claim.pid).changes) === 1);
    },

    release(claim) {
      write(() => {
        db.prepare(`DELETE FROM lease WHERE id = 1 AND ${holds(claim)}`).run(claim.windowKey, claim.pid);
      });
    },

    takeOver() {
      return false;
    },

    reclaim() {
      return false;
    },

    windowAlive(windowKey, at) {
      const r = db.prepare(`SELECT heartbeat_at FROM presence WHERE window_key = ?`).get(windowKey);
      const beat = r === undefined ? undefined : num(r['heartbeat_at']);
      return beat !== undefined && at - beat <= PRESENCE_GRACE_MS;
    },

    presenceOf(windowKey) {
      const r = db.prepare(`SELECT window_key, pid, pid_started_at, heartbeat_at FROM presence WHERE window_key = ?`).get(windowKey);
      if (r === undefined) return undefined;
      const pidStartedAt = num(r['pid_started_at']);
      return {
        windowKey: String(r['window_key']),
        pid: num(r['pid']) ?? 0,
        ...(pidStartedAt !== undefined ? { pidStartedAt } : {}),
        heartbeatAt: num(r['heartbeat_at']) ?? 0,
      };
    },

    close() {
      try {
        db.close();
      } catch {
        /* closing twice is harmless */
      }
    },
  };
}
