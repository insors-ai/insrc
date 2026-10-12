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
import type { ProviderId } from './cli-adapter.js';
import { sessionFileName } from './session-output.js';
import {
  isSession,
  updatedAtOf,
  type ChatSession,
  type ChatSessionStore,
  type ChatSummary,
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
export interface SessionHead {
  readonly v: 1;
  readonly id: string;
  readonly provider: ProviderId;
  readonly createdAt: string;
  readonly title: string;
  readonly editMode: 'auto' | 'review';
  readonly mode?: ChatSession['mode'];
  readonly nativeSessionId?: string;
  readonly liveTurn?: ChatSession['liveTurn'];
  /** The last row's time, else createdAt (updatedAtOf). */
  readonly updatedAt: string;
  /** The transcript's length at the save: a record only, a read takes its rows from the rows file. */
  readonly rows: number;
  /** When the head was written: the order sessions are evicted in. */
  readonly savedAt: string;
}

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
  fs.writeText(tmp, data);
  fs.rename(tmp, path);
}

export function headOf(s: ChatSession, savedAt: string): SessionHead {
  return {
    v: 1,
    id: s.id,
    provider: s.provider,
    createdAt: s.createdAt,
    title: s.title,
    editMode: s.editMode,
    ...(s.mode !== undefined ? { mode: s.mode } : {}),
    ...(s.nativeSessionId !== undefined ? { nativeSessionId: s.nativeSessionId } : {}),
    ...(s.liveTurn !== undefined ? { liveTurn: s.liveTurn } : {}),
    updatedAt: updatedAtOf(s),
    rows: s.transcript.length,
    savedAt,
  };
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

function sessionOf(head: SessionHead, rows: TranscriptEntry[]): ChatSession {
  return {
    id: head.id,
    provider: head.provider,
    createdAt: head.createdAt,
    title: head.title,
    editMode: head.editMode,
    ...(head.mode !== undefined ? { mode: head.mode } : {}),
    ...(head.nativeSessionId !== undefined ? { nativeSessionId: head.nativeSessionId } : {}),
    ...(head.liveTurn !== undefined ? { liveTurn: head.liveTurn } : {}),
    transcript: rows,
  };
}

export function createFileChatSessionStore(deps: FileStoreDeps): ChatSessionStore {
  const fs = deps.fs ?? nodeSessionFilesFs;
  const log = deps.logger;
  const now = deps.now ?? (() => new Date().toISOString());
  const genId = deps.genId ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const paths = (id: string): SessionPaths => sessionPaths(deps.root, id);

  /** Per session OBJECT: how many of its leading rows are on disk. */
  const tracked = new WeakMap<ChatSession, { count: number }>();
  /** Per id: the object get() hands out, and the files' state when this store last left or read them. */
  const cache = new Map<string, { session: ChatSession; headMtimeMs: number; rowsBytes: number }>();
  const warnedHeads = new Set<string>();

  const remember = (s: ChatSession, p: SessionPaths): void => {
    const held = cache.get(s.id);
    if (held !== undefined && held.session !== s) return; // another object is the one get() hands out
    cache.set(s.id, { session: s, headMtimeMs: fs.stat(p.head)?.mtimeMs ?? 0, rowsBytes: fs.stat(p.rows)?.size ?? 0 });
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
      if (held !== undefined && held.headMtimeMs === headStat.mtimeMs && held.rowsBytes === (fs.stat(p.rows)?.size ?? 0)) {
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
      cache.set(id, { session, headMtimeMs: headStat.mtimeMs, rowsBytes: bytes });
      return session;
    } catch (err) {
      log?.warn(`[chat] session ${id} could not be read: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };

  const save = (s: ChatSession): void => {
    const p = paths(s.id);
    fs.mkdir(deps.root);
    const count = tracked.get(s)?.count ?? 0;
    const fresh = s.transcript.slice(count);
    if (fresh.length > 0) {
      fs.appendText(p.rows, rowLines(fresh));
      // Advanced as soon as the rows are on disk: a head write that fails below must not make the
      // next save write them again.
      tracked.set(s, { count: s.transcript.length });
    } else if (!tracked.has(s)) {
      tracked.set(s, { count });
    }
    writeWhole(fs, p.head, JSON.stringify(headOf(s, now())));
    remember(s, p);
  };

  const draft = (provider: ProviderId): ChatSession => {
    const session: ChatSession = { id: genId(), provider, createdAt: now(), title: 'new chat', editMode: 'auto', mode: 'manual', transcript: [] };
    tracked.set(session, { count: 0 });
    return session;
  };

  return {
    draft,
    create(provider: ProviderId): ChatSession {
      const session = draft(provider);
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
