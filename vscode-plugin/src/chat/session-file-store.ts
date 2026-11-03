/**
 * Story E20261012c96a97a2:S001 (ISSUE-c96a97a2) — the file-backed chat session store.
 *
 * VS Code keeps all of an extension's globalState as ONE stored value, so a session kept there is
 * rewritten whole, with every other session, on each save. This store keeps each session in two
 * files under one directory instead:
 *
 * - `<name>.head.json`: every ChatSession field except the transcript, written whole through a
 *   temporary file and a rename.
 * - `<name>.rows.ndjson`: one transcript row per line. A save only appends to it.
 *
 * `<name>` is sessionFileName(id), the base name the session's output files use too.
 *
 * A save appends the rows the session object has not yet written and replaces the head, so its
 * cost follows what changed and not the length of the history; the history list reads heads only.
 * For that the store keeps, per session OBJECT, how many of its leading rows are on disk: the
 * callers hold one object and save it again and again, and the transcript is only ever pushed to.
 *
 * It implements the same synchronous ChatSessionStore as the Memento store, so its callers do not
 * change. File access goes through the structural {@link SessionFilesFs} so tests inject a fake.
 * Reads never throw (a missing or damaged session reads as absent); a save that cannot write
 * throws, as trySaveSession expects.
 */
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import type { ProviderId } from './cli-adapter.js';
import { sessionFileName } from './session-output.js';
import {
  INDEX_KEY,
  SESSION_PREFIX,
  isSession,
  updatedAtOf,
  type ChatSession,
  type ChatSessionStore,
  type ChatSummary,
  type MementoLike,
  type RunConfig,
  type TranscriptEntry,
} from './session-store.js';

/** The synchronous file calls the store needs. */
export interface SessionFilesFs {
  mkdir(dir: string): void;
  /** The file's text; undefined when it does not exist. */
  readText(path: string): string | undefined;
  writeText(path: string, data: string): void;
  appendText(path: string, data: string): void;
  rename(from: string, to: string): void;
  remove(path: string): void;
  truncate(path: string, bytes: number): void;
  /** undefined when the file does not exist. */
  stat(path: string): { readonly size: number; readonly mtimeMs: number } | undefined;
  /** The names in a directory; [] when it does not exist. */
  list(dir: string): string[];
}

const errCode = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;

export const nodeSessionFilesFs: SessionFilesFs = {
  mkdir: (dir) => {
    mkdirSync(dir, { recursive: true });
  },
  readText: (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch (e) {
      if (errCode(e) === 'ENOENT') return undefined;
      throw e;
    }
  },
  writeText: (path, data) => writeFileSync(path, data, 'utf8'),
  appendText: (path, data) => appendFileSync(path, data, 'utf8'),
  rename: (from, to) => renameSync(from, to),
  remove: (path) => rmSync(path, { force: true }),
  truncate: (path, bytes) => truncateSync(path, bytes),
  stat: (path) => {
    try {
      const s = statSync(path);
      return { size: s.size, mtimeMs: s.mtimeMs };
    } catch (e) {
      if (errCode(e) === 'ENOENT') return undefined;
      throw e;
    }
  },
  list: (dir) => {
    try {
      return readdirSync(dir);
    } catch (e) {
      if (errCode(e) === 'ENOENT') return [];
      throw e;
    }
  },
};

export interface FileStoreLogger {
  warn(msg: string): void;
}

export interface FileStoreDeps {
  /** The directory holding the session files. */
  readonly root: string;
  readonly fs?: SessionFilesFs;
  readonly now?: () => string;
  readonly genId?: () => string;
  readonly maxSessions?: number;
  readonly onEvict?: ((sessionId: string) => void) | undefined;
  readonly logger?: FileStoreLogger;
}

export const HEAD_SUFFIX = '.head.json';
export const ROWS_SUFFIX = '.rows.ndjson';

/** A session's head record: the session without its transcript, and what the list and the cap need. */
export type SessionHead = Omit<ChatSession, 'transcript'> & {
  readonly v: 1;
  /** The last row's time, else createdAt (updatedAtOf). */
  readonly updatedAt: string;
  /** The transcript's length at the save: a record only, a read takes its rows from the rows file. */
  readonly rows: number;
  /** When the head was written: the order sessions are evicted in. */
  readonly savedAt: string;
};

export interface SessionPaths {
  readonly head: string;
  readonly rows: string;
}

export function sessionPaths(root: string, id: string): SessionPaths {
  const base = `${root}/${sessionFileName(id)}`;
  return { head: `${base}${HEAD_SUFFIX}`, rows: `${base}${ROWS_SUFFIX}` };
}

const byteLength = (s: string): number => Buffer.byteLength(s, 'utf8');
const rowLines = (rows: readonly TranscriptEntry[]): string => rows.map((r) => `${JSON.stringify(r)}\n`).join('');

let tmpSeq = 0;
/** Replaces a file's content whole: a temporary file beside it, then a rename over it. */
export function writeWhole(fs: SessionFilesFs, path: string, data: string): void {
  const tmp = `${path}.${process.pid}.${++tmpSeq}.tmp`;
  try {
    fs.writeText(tmp, data);
    fs.rename(tmp, path);
  } catch (err) {
    // A failed write must not leave its temporary file behind: every call uses a new name.
    try {
      fs.remove(tmp);
    } catch {
      /* the write's own error is the one to report */
    }
    throw err;
  }
}

/**
 * A session's head: every field it carries except the transcript, so a field added to ChatSession
 * later is kept without a change here.
 */
export function headOf(s: ChatSession, savedAt: string): SessionHead {
  const { transcript, ...fields } = s;
  return { ...fields, v: 1, updatedAt: updatedAtOf(s), rows: transcript.length, savedAt };
}

/** A head file's record, or undefined when the file is missing, not JSON, or not a session head. */
export function readHead(fs: SessionFilesFs, path: string): SessionHead | undefined {
  const text = fs.readText(path);
  if (text === undefined) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  // The same field checks as a stored session, without its transcript.
  if (typeof raw !== 'object' || raw === null || !isSession({ ...raw, transcript: [] })) return undefined;
  const h = raw as Partial<SessionHead> & { id: string; createdAt: string };
  return {
    ...(h as SessionHead),
    updatedAt: typeof h.updatedAt === 'string' ? h.updatedAt : h.createdAt,
    rows: typeof h.rows === 'number' ? h.rows : 0,
    savedAt: typeof h.savedAt === 'string' ? h.savedAt : h.createdAt,
  };
}

/**
 * A rows file's rows in file order, and the file's size once read. A last line that is incomplete
 * (no trailing newline, or not JSON: a save was interrupted) is left out and the file is cut back
 * to the end of the last complete line, so a later append starts on a clean line. A line in the
 * middle that is not JSON is skipped and the file is left as it is.
 */
export function readRows(fs: SessionFilesFs, path: string, log?: FileStoreLogger): { rows: TranscriptEntry[]; bytes: number } {
  const text = fs.readText(path);
  if (text === undefined) return { rows: [], bytes: 0 };
  const lines = text.split('\n');
  const tail = lines.pop() ?? ''; // what follows the last newline: '' for a file that ends on one
  const rows: TranscriptEntry[] = [];
  let lastLineTorn = false;
  lines.forEach((line, i) => {
    try {
      rows.push(JSON.parse(line) as TranscriptEntry);
    } catch {
      if (i === lines.length - 1) lastLineTorn = true;
      else log?.warn(`[chat] ${path}: line ${i + 1} is not a transcript row; skipped`);
    }
  });
  let keep = text.length - tail.length;
  if (lastLineTorn) keep -= (lines[lines.length - 1] ?? '').length + 1;
  if (keep === text.length) return { rows, bytes: byteLength(text) };
  const bytes = byteLength(text.slice(0, keep));
  log?.warn(`[chat] ${path}: an incomplete last line was dropped`);
  fs.truncate(path, bytes);
  return { rows, bytes };
}

/** The session a head and its rows make: the head's own fields without what the store added. */
function sessionOf(head: SessionHead, rows: TranscriptEntry[]): ChatSession {
  const { v: _v, updatedAt: _updatedAt, rows: _rows, savedAt: _savedAt, ...fields } = head;
  return { ...fields, transcript: rows };
}

export function createFileChatSessionStore(deps: FileStoreDeps): ChatSessionStore {
  const fs = deps.fs ?? nodeSessionFilesFs;
  const log = deps.logger;
  const now = deps.now ?? (() => new Date().toISOString());
  const genId = deps.genId ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const paths = (id: string): SessionPaths => sessionPaths(deps.root, id);

  // Only a positive integer is a cap, as in the Memento store; anything else is no cap.
  const maxSessions = deps.maxSessions !== undefined && deps.maxSessions >= 1 ? Math.floor(deps.maxSessions) : undefined;

  /**
   * Per session OBJECT: how many of its leading rows are on disk. Kept for as long as the object
   * lives: neither another window's append nor a get() that hands out a fresh object for the same
   * id changes it, so an object the callers hold only ever appends its own new rows.
   */
  const tracked = new WeakMap<ChatSession, { count: number }>();
  /** Per id: the object get() hands out, and the head's modification time when it was read or written. */
  const cache = new Map<string, { session: ChatSession; headMtimeMs: number }>();
  /** Per id: the rows file's size as this store last left or read it (after its own cut-back too). */
  const rowsSeen = new Map<string, number>();
  /** Objects saved after another writer appended: they lack that writer's rows, so get() never hands them out again. */
  const stale = new WeakSet<ChatSession>();
  const warnedHeads = new Set<string>();

  const remember = (s: ChatSession, p: SessionPaths): void => {
    if (stale.has(s)) return;
    const held = cache.get(s.id);
    if (held !== undefined && held.session !== s) return; // another object is the one get() hands out
    cache.set(s.id, { session: s, headMtimeMs: fs.stat(p.head)?.mtimeMs ?? 0 });
  };

  const get = (id: string): ChatSession | undefined => {
    try {
      const p = paths(id);
      const headStat = fs.stat(p.head);
      if (headStat === undefined) {
        cache.delete(id);
        return undefined;
      }
      const held = cache.get(id);
      if (held !== undefined && held.headMtimeMs === headStat.mtimeMs && rowsSeen.get(id) === (fs.stat(p.rows)?.size ?? 0)) {
        return held.session;
      }
      const head = readHead(fs, p.head);
      if (head === undefined || head.id !== id) {
        if (!warnedHeads.has(p.head)) {
          warnedHeads.add(p.head);
          log?.warn(`[chat] ${p.head} is not a readable session head; the session is left out`);
        }
        cache.delete(id);
        return undefined;
      }
      const { rows, bytes } = readRows(fs, p.rows, log);
      const session = sessionOf(head, rows);
      tracked.set(session, { count: rows.length });
      rowsSeen.set(id, bytes);
      cache.set(id, { session, headMtimeMs: headStat.mtimeMs });
      return session;
    } catch (err) {
      log?.warn(`[chat] session ${id} could not be read: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };

  /** Removes the sessions with the oldest savedAt beyond the cap, never `keepId`. */
  const evictBeyondCap = (keepId: string): void => {
    if (maxSessions === undefined) return;
    const heads: SessionHead[] = [];
    for (const name of fs.list(deps.root)) {
      if (!name.endsWith(HEAD_SUFFIX)) continue;
      const head = readHead(fs, `${deps.root}/${name}`);
      if (head !== undefined) heads.push(head);
    }
    if (heads.length <= maxSessions) return;
    const oldestFirst = heads
      .filter((h) => h.id !== keepId)
      .sort((a, b) => (a.savedAt < b.savedAt ? -1 : a.savedAt > b.savedAt ? 1 : a.id < b.id ? -1 : 1));
    for (const head of oldestFirst.slice(0, heads.length - maxSessions)) {
      const p = paths(head.id);
      try {
        fs.remove(p.head); // the head first: a session without a head is not a session
        fs.remove(p.rows);
      } catch (err) {
        log?.warn(`[chat] files of evicted session ${head.id} not removed: ${err instanceof Error ? err.message : String(err)}`);
      }
      cache.delete(head.id);
      rowsSeen.delete(head.id);
      try {
        deps.onEvict?.(head.id);
      } catch {
        /* cleanup is best-effort; eviction itself has happened */
      }
    }
  };

  const save = (s: ChatSession): void => {
    const p = paths(s.id);
    fs.mkdir(deps.root);
    const t = tracked.get(s);
    const headStat = fs.stat(p.head);
    const rowsStat = fs.stat(p.rows);
    const onDisk = rowsStat?.size ?? 0;
    const seen = rowsSeen.get(s.id) ?? 0;
    // The rows file is written whole in three cases only, none of which the callers reach in
    // normal use: an object this store has never tracked, for an id whose files exist; a tracked
    // object whose transcript is shorter than what it wrote; and a tracked object whose rows are
    // on disk no longer (the head is gone or the rows file is shorter than this store left it, as
    // after an eviction), so that the session comes back complete.
    const whole =
      t === undefined
        ? headStat !== undefined || rowsStat !== undefined
        : s.transcript.length < t.count || (t.count > 0 && (headStat === undefined || onDisk < seen));
    if (whole) {
      writeWhole(fs, p.rows, rowLines(s.transcript));
      tracked.set(s, { count: s.transcript.length });
    } else {
      const count = t?.count ?? 0;
      // A rows file longer than this store left it: another writer appended. This object's new
      // rows still go after theirs; it lacks their rows, so the next get() must read the files.
      if (onDisk > seen && rowsSeen.has(s.id)) {
        stale.add(s);
        if (cache.get(s.id)?.session === s) cache.delete(s.id);
      }
      const fresh = s.transcript.slice(count);
      if (fresh.length > 0) fs.appendText(p.rows, rowLines(fresh));
      // Advanced as soon as the rows are on disk: a head write that fails below must not make the
      // next save write them again.
      tracked.set(s, { count: s.transcript.length });
    }
    rowsSeen.set(s.id, fs.stat(p.rows)?.size ?? 0);
    writeWhole(fs, p.head, JSON.stringify(headOf(s, now())));
    remember(s, p);
    if (headStat === undefined) {
      try {
        evictBeyondCap(s.id);
      } catch (err) {
        log?.warn(`[chat] session cap not applied: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const draft = (provider: ProviderId, run?: RunConfig): ChatSession => {
    const session: ChatSession = {
      id: genId(), provider, createdAt: now(), title: 'new chat', editMode: 'auto', mode: 'manual',
      ...(run?.model !== undefined ? { model: run.model } : {}),
      ...(run?.effort !== undefined ? { effort: run.effort } : {}),
      transcript: [],
    };
    tracked.set(session, { count: 0 });
    return session;
  };

  return {
    draft,
    create(provider: ProviderId, run?: RunConfig): ChatSession {
      const session = draft(provider, run);
      save(session);
      return session;
    },
    get,
    list(): ReadonlyArray<ChatSummary> {
      const out: ChatSummary[] = [];
      let names: string[];
      try {
        names = fs.list(deps.root);
      } catch {
        return [];
      }
      for (const name of names) {
        if (!name.endsWith(HEAD_SUFFIX)) continue;
        try {
          const head = readHead(fs, `${deps.root}/${name}`);
          if (head !== undefined) out.push({ id: head.id, provider: head.provider, title: head.title, updatedAt: head.updatedAt });
        } catch {
          /* an unreadable head is left out */
        }
      }
      return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    },
    append(id: string, entry: TranscriptEntry): void {
      const s = get(id);
      if (s === undefined) return; // missing or damaged: a no-op, as in the Memento store
      s.transcript.push(entry);
      save(s);
    },
    save,
  };
}

export interface MigrationLogger extends FileStoreLogger {
  info?(msg: string): void;
}

export interface MigrationDeps {
  /** Where the sessions were kept: context.globalState, read through the Memento store's keys. */
  readonly memento: MementoLike;
  /** The directory the file store uses. */
  readonly root: string;
  readonly fs?: SessionFilesFs;
  readonly logger?: MigrationLogger;
}

export interface MigrationResult {
  /** Sessions now in files and removed from the memento. */
  readonly migrated: number;
  /** Ids of the sessions left in the memento: their output files must be kept meanwhile. */
  readonly kept: readonly string[];
}

/** A value as it reads back from JSON, so two records compare by what a file can hold. */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sameRow = (a: TranscriptEntry, b: TranscriptEntry): boolean => isDeepStrictEqual(plain(a), plain(b));

/**
 * Moves the sessions the Memento store kept in globalState into the file store's files, once.
 *
 * For each indexed session: with no head on disk its rows and then its head are written; with a
 * head whose rows are a prefix of the memento's, the missing rows are appended; when the memento's
 * rows are a prefix of the files' (the files are newer) nothing is written. The files are then
 * read back and compared with the memento's copy, and ONLY THEN is its memento key removed.
 *
 * A session whose copies disagree, whose write or read-back fails, or that is not a session, is
 * left in the memento untouched, logged, and returned in `kept`; the next start tries it again.
 * Never throws. With no index it does nothing.
 */
export function migrateChatSessionsFromMemento(deps: MigrationDeps): MigrationResult {
  const fs = deps.fs ?? nodeSessionFilesFs;
  const log = deps.logger;
  let ids: string[];
  try {
    const raw = deps.memento.get<unknown>(INDEX_KEY);
    if (!Array.isArray(raw)) return { migrated: 0, kept: [] };
    ids = raw.filter((x): x is string => typeof x === 'string');
  } catch (err) {
    log?.warn(`[chat] the stored chat index could not be read: ${err instanceof Error ? err.message : String(err)}`);
    return { migrated: 0, kept: [] };
  }

  /** Sets a memento key; a write that fails later is logged, never an unhandled rejection. */
  const setKey = (key: string, value: unknown): void => {
    void Promise.resolve(deps.memento.update(key, value)).catch((err: unknown) => {
      log?.warn(`[chat] stored key ${key} not updated: ${err instanceof Error ? err.message : String(err)}`);
    });
  };

  /** Whether the session is in the files, with every row and field of the memento's copy. */
  const migrateOne = (id: string): boolean => {
    const stored = deps.memento.get<unknown>(SESSION_PREFIX + id);
    if (!isSession(stored) || stored.id !== id) {
      log?.warn(`[chat] stored session ${id} is not a session record; left in place`);
      return false;
    }
    const want = stored.transcript;
    const p = sessionPaths(deps.root, id);
    fs.mkdir(deps.root);
    if (fs.stat(p.head) === undefined) {
      // Not in the files yet. The head goes last, so a session that has a head has its rows.
      writeWhole(fs, p.rows, rowLines(want));
      writeWhole(fs, p.head, JSON.stringify(headOf(stored, updatedAtOf(stored))));
    } else {
      // Already there (another window migrated it, or an older version wrote it again since).
      const have = readRows(fs, p.rows, log).rows;
      const shared = Math.min(have.length, want.length);
      for (let i = 0; i < shared; i++) {
        if (!sameRow(have[i]!, want[i]!)) {
          log?.warn(`[chat] stored session ${id} and its files disagree at row ${i}; neither is changed`);
          return false;
        }
      }
      if (have.length < want.length) {
        fs.appendText(p.rows, rowLines(want.slice(have.length)));
        writeWhole(fs, p.head, JSON.stringify(headOf(stored, updatedAtOf(stored))));
      }
    }
    // Read back, and compare with the memento's copy before anything is removed from it.
    const head = readHead(fs, p.head);
    if (head === undefined || head.id !== id) {
      log?.warn(`[chat] stored session ${id}: its head file does not read back; left in place`);
      return false;
    }
    const got = readRows(fs, p.rows, log).rows;
    const rowsMatch = got.length >= want.length && want.every((r, i) => sameRow(got[i]!, r));
    // With the same rows the whole session must match; with more rows the files are newer, and
    // their head is the newer one too.
    const fieldsMatch =
      got.length > want.length || isDeepStrictEqual(plain(sessionOf(head, got)), plain(stored));
    if (!rowsMatch || !fieldsMatch) {
      log?.warn(`[chat] stored session ${id} does not read back equal from its files; left in place`);
      return false;
    }
    return true;
  };

  const kept: string[] = [];
  let migrated = 0;
  for (const id of ids) {
    let ok = false;
    try {
      ok = migrateOne(id);
      if (ok) setKey(SESSION_PREFIX + id, undefined);
    } catch (err) {
      ok = false;
      log?.warn(`[chat] stored session ${id} not migrated: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (ok) migrated++;
    else kept.push(id);
  }
  try {
    if (kept.length === 0) setKey(INDEX_KEY, undefined);
    else if (kept.length !== ids.length) setKey(INDEX_KEY, kept);
  } catch (err) {
    log?.warn(`[chat] the stored chat index could not be updated: ${err instanceof Error ? err.message : String(err)}`);
  }
  log?.info?.(`[chat] ${migrated} chat session(s) moved to ${deps.root}${kept.length > 0 ? `; ${kept.length} left in place` : ''}`);
  return { migrated, kept };
}
