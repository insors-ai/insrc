/**
 * Story E202610101d04e560:S001 — a durable, per-session output file for the chat CLI.
 *
 * A vscode-free, deps-injected module. Each chat session has ONE rolling output file
 * (<root>/<sessionId>.ndjson) instead of a file per turn. The CLI appends its own stream
 * lines to it (the spawner passes the file as the child's stdout), so nothing is lost when
 * the extension stops reading, a turn runs long, or the window reloads. Turns are segments
 * framed by marker lines the host writes:
 *
 *   {"insrc.marker":"file","sessionId":…,"generation":n}          first line of a generation
 *   {"insrc.marker":"turn-start","turnId":…,"at":…}
 *   …the CLI's own lines…
 *   {"insrc.marker":"turn-end","turnId":…,"code":…,"signal":…}
 *
 * The session lock (session-lock.ts) allows one CLI process per session, so segments never
 * interleave: beginTurn is only called while the caller holds the session's lease. A reader
 * follows one segment by cursor (turn, generation, byte offset), yields only complete lines,
 * and can stop and resume at any yielded cursor.
 */

import { appendFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

/** Where a reader is in a turn's segment: the byte offset just after the last line it handled. */
export interface SegmentCursor {
  readonly sessionId: string;
  readonly turnId: string;
  readonly generation: number;
  readonly offset: number;
}

export interface TurnSegment {
  readonly outPath: string;
  readonly errPath: string;
  /** Just after the segment's turn-start marker. */
  readonly cursor: SegmentCursor;
}

export interface TurnExit {
  readonly code: number | null;
  readonly signal: string | null;
}

/** The fs surface the module uses. */
export interface SessionOutputFs {
  mkdir(path: string): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  writeFile(path: string, data: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  /** Up to `length` bytes starting at `start`; empty at end of file. */
  readRange(path: string, start: number, length: number): Promise<Buffer>;
  /** Size in bytes, or undefined when the file does not exist. */
  size(path: string): Promise<number | undefined>;
  mtimeMs(path: string): Promise<number | undefined>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  readTextSync(path: string): string | undefined;
}

const errCode = (e: unknown): string | undefined => (e as NodeJS.ErrnoException | undefined)?.code;

export const nodeSessionOutputFs: SessionOutputFs = {
  mkdir: async (p) => {
    await mkdir(p, { recursive: true });
  },
  appendFile: (p, data) => appendFile(p, data, 'utf8'),
  writeFile: (p, data) => writeFile(p, data, 'utf8'),
  readFile: (p) => readFile(p),
  readRange: async (p, start, length) => {
    const fh = await open(p, 'r');
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, start);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  },
  size: async (p) => {
    try {
      return (await stat(p)).size;
    } catch (e) {
      if (errCode(e) === 'ENOENT') return undefined;
      throw e;
    }
  },
  mtimeMs: async (p) => {
    try {
      return (await stat(p)).mtimeMs;
    } catch (e) {
      if (errCode(e) === 'ENOENT') return undefined;
      throw e;
    }
  },
  rename: (from, to) => rename(from, to),
  rm: (p) => rm(p, { force: true }),
  readdir: (p) => readdir(p),
  readTextSync: (p) => {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      return undefined;
    }
  },
};

/** The reserved key that marks a host-written line; a CLI stream line never has it at top level. */
export const MARKER_KEY = 'insrc.marker';

export type Marker =
  | { readonly kind: 'file'; readonly sessionId: string; readonly generation: number }
  | { readonly kind: 'turn-start'; readonly turnId: string }
  | { readonly kind: 'turn-end'; readonly turnId: string };

/** The marker a line carries, or undefined for a CLI line (only a top-level "insrc.marker" key counts). */
export function parseMarker(line: string): Marker | undefined {
  if (!line.startsWith('{') || !line.includes(MARKER_KEY)) return undefined;
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof v !== 'object' || v === null || !Object.prototype.hasOwnProperty.call(v, MARKER_KEY)) return undefined;
  const o = v as Record<string, unknown>;
  switch (o[MARKER_KEY]) {
    case 'file':
      return typeof o['generation'] === 'number' ? { kind: 'file', sessionId: String(o['sessionId']), generation: o['generation'] } : undefined;
    case 'turn-start':
      return typeof o['turnId'] === 'string' ? { kind: 'turn-start', turnId: o['turnId'] } : undefined;
    case 'turn-end':
      return typeof o['turnId'] === 'string' ? { kind: 'turn-end', turnId: o['turnId'] } : undefined;
    default:
      return undefined;
  }
}

/** A cursor names a generation that neither the current nor the previous file holds any more. */
export class SegmentGone extends Error {
  constructor(cursor: SegmentCursor) {
    super(`output of turn ${cursor.turnId} (session ${cursor.sessionId}, generation ${cursor.generation}) is no longer kept`);
    this.name = 'SegmentGone';
  }
}

export interface SessionOutputDeps {
  readonly root: string;
  readonly fs?: SessionOutputFs | undefined;
  /** A session file rolls over at the next turn start once it is larger than this. Default 4 MiB. */
  readonly maxBytes?: number | undefined;
  readonly logger?: { warn(msg: string): void } | undefined;
  /** How often a reader polls for more output. Default 100 ms. */
  readonly pollMs?: number | undefined;
  readonly now?: (() => number) | undefined;
}

export interface SessionOutput {
  beginTurn(sessionId: string, turnId: string): Promise<TurnSegment>;
  endTurn(sessionId: string, turnId: string, exit: TurnExit): Promise<void>;
  tail(cursor: SegmentCursor, opts: { readonly finished: () => boolean; readonly signal?: AbortSignal | undefined }): AsyncIterable<{ readonly line: string; readonly cursor: SegmentCursor }>;
  /** The last part of the current turn's stderr ('' when there is none). */
  errTail(sessionId: string): string;
  /** Deletes a session's files (its session was removed). */
  remove(sessionId: string): Promise<void>;
  /** Deletes the files of sessions not in `keep` that have not been written for `olderThanMs`. */
  sweep(opts: { readonly olderThanMs: number; readonly keep: ReadonlySet<string> }): Promise<void>;
}

export const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const SUFFIXES = ['.1.ndjson', '.ndjson', '.err.log'] as const;

const READ_CHUNK = 64 * 1024;
const ERR_TAIL = 2000;

export const sessionFileName = (sessionId: string): string => sessionId.replace(/[^A-Za-z0-9_-]/g, '_');

export function createSessionOutput(deps: SessionOutputDeps): SessionOutput {
  const fs = deps.fs ?? nodeSessionOutputFs;
  const pollMs = deps.pollMs ?? 100;
  const now = deps.now ?? Date.now;
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
  const log = deps.logger ?? { warn: () => {} };
  const paths = (sessionId: string): { current: string; previous: string; err: string } => {
    const base = `${deps.root}/${sessionFileName(sessionId)}`;
    return { current: `${base}.ndjson`, previous: `${base}.1.ndjson`, err: `${base}.err.log` };
  };

  /** The generation a file holds (from its header line), or undefined when it is missing. */
  const generationOf = async (path: string): Promise<number | undefined> => {
    if ((await fs.size(path)) === undefined) return undefined;
    const head = (await fs.readRange(path, 0, 4096)).toString('utf8');
    const first = head.slice(0, head.indexOf('\n') === -1 ? head.length : head.indexOf('\n'));
    const m = parseMarker(first);
    return m?.kind === 'file' ? m.generation : undefined;
  };

  /** The turn whose segment is still open at the end of the file (a turn-start with no turn-end), if any. */
  const openTurn = async (path: string): Promise<string | undefined> => {
    let open: string | undefined;
    for (const line of (await fs.readFile(path)).toString('utf8').split('\n')) {
      const m = parseMarker(line);
      if (m?.kind === 'turn-start') open = m.turnId;
      else if (m?.kind === 'turn-end' && m.turnId === open) open = undefined;
    }
    return open;
  };

  /** The offset just after a turn's turn-start marker in a file, if it is there. */
  const turnStartOffset = async (path: string, turnId: string): Promise<number | undefined> => {
    const buf = await fs.readFile(path);
    let pos = 0;
    for (let nl = buf.indexOf(0x0a, pos); nl !== -1; nl = buf.indexOf(0x0a, pos)) {
      const m = parseMarker(buf.subarray(pos, nl).toString('utf8'));
      pos = nl + 1;
      if (m?.kind === 'turn-start' && m.turnId === turnId) return pos;
    }
    return undefined;
  };

  /** Appends a marker on a line of its own (terminating a CLI line the writer left unfinished). */
  const appendMarker = async (path: string, marker: Record<string, unknown>): Promise<void> => {
    const size = (await fs.size(path)) ?? 0;
    const unterminated = size > 0 && (await fs.readRange(path, size - 1, 1)).toString('utf8') !== '\n';
    await fs.appendFile(path, `${unterminated ? '\n' : ''}${JSON.stringify(marker)}\n`);
  };

  /** The file currently holding a cursor's generation. */
  const fileFor = async (cursor: SegmentCursor): Promise<string> => {
    const p = paths(cursor.sessionId);
    if ((await generationOf(p.current)) === cursor.generation) return p.current;
    if ((await generationOf(p.previous)) === cursor.generation) return p.previous;
    throw new SegmentGone(cursor);
  };

  const sleep = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
    new Promise((resolve) => {
      if (signal?.aborted === true) return resolve();
      const t = setTimeout(done, ms);
      function done(): void {
        clearTimeout(t);
        signal?.removeEventListener('abort', done);
        resolve();
      }
      signal?.addEventListener('abort', done, { once: true });
    });

  return {
    async beginTurn(sessionId: string, turnId: string): Promise<TurnSegment> {
      const p = paths(sessionId);
      await fs.mkdir(deps.root);
      let generation = await generationOf(p.current);
      if (generation !== undefined) {
        // A turn whose host went away before its exit never got a turn-end: close it first.
        const open = await openTurn(p.current);
        if (open !== undefined) await appendMarker(p.current, { [MARKER_KEY]: 'turn-end', turnId: open, code: null, signal: null, unknown: true });
        // Roll over between turns only, so a segment is never split across files.
        if (((await fs.size(p.current)) ?? 0) > maxBytes) {
          await fs.rename(p.current, p.previous); // replaces the older generation
          generation = undefined;
        }
      }
      if (generation === undefined) {
        generation = ((await generationOf(p.previous)) ?? 0) + 1;
        await fs.writeFile(p.current, `${JSON.stringify({ [MARKER_KEY]: 'file', sessionId, generation })}\n`);
      }
      await fs.writeFile(p.err, '');
      await appendMarker(p.current, { [MARKER_KEY]: 'turn-start', turnId, at: new Date(now()).toISOString() });
      const offset = (await fs.size(p.current)) ?? 0;
      return { outPath: p.current, errPath: p.err, cursor: { sessionId, turnId, generation, offset } };
    },

    async endTurn(sessionId: string, turnId: string, exit: TurnExit): Promise<void> {
      const p = paths(sessionId);
      if ((await fs.size(p.current)) === undefined) return;
      if ((await openTurn(p.current)) !== turnId) return; // already closed, or not this turn's file any more
      await appendMarker(p.current, { [MARKER_KEY]: 'turn-end', turnId, code: exit.code, signal: exit.signal });
    },

    async *tail(cursor, opts) {
      const file = await fileFor(cursor);
      let offset = cursor.offset;
      if (offset > ((await fs.size(file)) ?? 0)) {
        // The file is shorter than the cursor (truncated or replaced): re-anchor at the turn's start.
        const anchor = await turnStartOffset(file, cursor.turnId);
        if (anchor === undefined) throw new SegmentGone(cursor);
        log.warn(`[chat-output] session ${cursor.sessionId}: cursor past the end of its file; re-reading turn ${cursor.turnId} from its start`);
        offset = anchor;
      }
      let pending: Buffer = Buffer.alloc(0);
      for (;;) {
        if (opts.signal?.aborted === true) return;
        // Read finished() BEFORE reading, so bytes written just before the writer finished are not missed.
        const done = opts.finished();
        const chunk = await fs.readRange(file, offset + pending.length, READ_CHUNK);
        if (chunk.length > 0) {
          pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
          for (let nl = pending.indexOf(0x0a); nl !== -1; nl = pending.indexOf(0x0a)) {
            const line = pending.subarray(0, nl).toString('utf8');
            offset += nl + 1;
            pending = pending.subarray(nl + 1);
            const marker = parseMarker(line);
            if (marker === undefined) {
              yield { line, cursor: { ...cursor, offset } };
              continue;
            }
            if (marker.kind === 'turn-end' && marker.turnId === cursor.turnId) return;
            if (marker.kind === 'turn-start' && marker.turnId !== cursor.turnId) return;
          }
          continue; // there may be more right away
        }
        if (done) {
          // The writer has finished: an unterminated last line is complete now.
          if (pending.length > 0) {
            const line = pending.toString('utf8');
            offset += pending.length;
            if (parseMarker(line) === undefined) yield { line, cursor: { ...cursor, offset } };
          }
          return;
        }
        await sleep(pollMs, opts.signal);
      }
    },

    errTail(sessionId: string): string {
      return (fs.readTextSync(paths(sessionId).err) ?? '').slice(-ERR_TAIL);
    },

    async remove(sessionId: string): Promise<void> {
      const p = paths(sessionId);
      await fs.rm(p.current);
      await fs.rm(p.previous);
      await fs.rm(p.err);
    },

    async sweep(opts): Promise<void> {
      let names: string[];
      try {
        names = await fs.readdir(deps.root);
      } catch (e) {
        if (errCode(e) === 'ENOENT') return;
        throw e;
      }
      const keep = new Set([...opts.keep].map(sessionFileName));
      const bySession = new Map<string, string[]>();
      for (const name of names) {
        const suffix = SUFFIXES.find((x) => name.endsWith(x));
        if (suffix === undefined) continue;
        const base = name.slice(0, -suffix.length);
        if (keep.has(base)) continue;
        bySession.set(base, [...(bySession.get(base) ?? []), name]);
      }
      const cutoff = now() - opts.olderThanMs;
      for (const files of bySession.values()) {
        const times: number[] = [];
        for (const f of files) times.push((await fs.mtimeMs(`${deps.root}/${f}`)) ?? 0);
        if (times.some((t) => t > cutoff)) continue; // written recently: maybe a turn of another window's session
        for (const f of files) await fs.rm(`${deps.root}/${f}`);
      }
    },
  };
}
