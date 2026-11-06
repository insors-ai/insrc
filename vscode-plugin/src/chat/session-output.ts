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
import { readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { abortableSleep, errCode } from './async-util.js';

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
  /** E202611031bd72813:S001 t5: synchronous write/rm, so a pin marker is visible to OTHER
   * processes immediately (async writes are invisible to a concurrent rollover in another window). */
  writeFileSync?(path: string, data: string): void;
  rmSync?(path: string): void;
  /** Create-only write (O_EXCL) for lock files. */
  writeFileExclusive?(path: string, data: string): Promise<void>;
  /** Synchronous O_EXCL create — lets the synchronous registerCursor hold the session lock around
   * its marker write, serialized with sweep's pin-check + archive deletion. */
  writeFileExclusiveSync?(path: string, data: string): void;
  readdirSync?(path: string): string[];
  sizeSync?(path: string): number | undefined;
}


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
  writeFileSync: (p, data) => writeFileSync(p, data),
  rmSync: (p) => rmSync(p, { force: true }),
  writeFileExclusive: (p, data) => writeFile(p, data, { flag: 'wx' }),
  writeFileExclusiveSync: (p, data) => writeFileSync(p, data, { flag: 'wx' }),
  readdirSync: (p) => readdirSync(p),
  sizeSync: (p) => {
    try {
      return statSync(p).size;
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
  tail(cursor: SegmentCursor, opts: {
    readonly finished: () => boolean;
    readonly signal?: AbortSignal | undefined;
    /** Reconstruct state from this turn's marker, without replaying another turn. */
    readonly fromTurnStart?: boolean | undefined;
    /** Bounded prefix read: complete lines ending at/before this byte offset; never polls. */
    readonly beforeOffset?: number | undefined;
  }): AsyncIterable<{ readonly line: string; readonly cursor: SegmentCursor }>;
  /** The last part of the current turn's stderr ('' when there is none). */
  errTail(sessionId: string): string;
  /** Deletes a session's files (its session was removed). */
  remove(sessionId: string): Promise<void>;
  /** Deletes the files of sessions not in `keep` that have not been written for `olderThanMs`. */
  sweep(opts: { readonly olderThanMs: number; readonly keep: ReadonlySet<string> }): Promise<void>;
  /**
   * E202611031bd72813:S001 t5: registers a long-lived reader cursor (the background observer's).
   * While registered, rollover keeps its generation readable (archived instead of discarded).
   */
  registerCursor(cursor: SegmentCursor, readerId?: string): void;
  /** Drops one reader's registration (its durable pin marker goes too). The archived generation
   * itself is NOT deleted here — only sweep/remove prune archives, age-gated and pin-checked, so a
   * registration racing an unregister can never lose the generation under a live pin. */
  unregisterCursor(cursor: SegmentCursor, readerId?: string): void;
  /** The oldest generation still retained for a session (for SegmentGone replay recovery). */
  oldestRetainedGeneration(sessionId: string): Promise<number | undefined>;
  /**
   * E202611031bd72813:S001 t5: re-anchors a turn whose segment was lost (SegmentGone) into the
   * oldest retained generation that still contains its turn-start marker. Returns undefined when
   * no retained file holds the turn.
   */
  recoverTurn(sessionId: string, turnId: string): Promise<SegmentCursor | undefined>;
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

  /** The durable pin marker for one reader of one generation (`<session>.pin.<gen>.<reader>`). */
  const pinPath = (sessionId: string, generation: number, readerId: string): string => `${deps.root}/${sessionFileName(sessionId)}.pin.${generation}.${readerId}`;
  const pinPrefix = (sessionId: string, generation: number): string => `${sessionFileName(sessionId)}.pin.${generation}.`;
  // Pin-marker writes/removals are serialized on this chain; genPinned awaits it first, so a
  // rollover never scans the directory while a marker write is still in flight (the registration race).
  let pinIo: Promise<void> = Promise.resolve();
  const enqueuePinIo = (work: () => Promise<void>): void => {
    pinIo = pinIo.then(work).catch(() => {});
  };
  // E202611031bd72813:S001 t5: a per-session lock file makes registration vs. rollover/unregister
  // check-then-act ATOMIC across processes: register/unregister take it around their marker write/rm,
  // and the rollover takes it around its pin-check + replace. O_EXCL create + spin.
  const lockPathOf = (sessionId: string): string => `${deps.root}/${sessionFileName(sessionId)}.lock`;
  const withSessionLock = async <T>(sessionId: string, work: () => Promise<T>): Promise<T> => {
    const p = lockPathOf(sessionId);
    const deadline = Date.now() + 10_000;
    for (;;) {
      try {
        if (fs.writeFileExclusive !== undefined) await fs.writeFileExclusive(p, String(process.pid));
        else await fs.writeFile(p, String(process.pid));
        break;
      } catch (e) {
        if (errCode(e) !== 'EEXIST') throw e;
        // stale-lock recovery: if the recorded holder pid is dead, break the lock and retry
        try {
          const holder = Number((await fs.readFile(p)).toString('utf8'));
          if (Number.isInteger(holder) && holder > 0) {
            try {
              process.kill(holder, 0); // throws ESRCH when dead
            } catch (ke) {
              if (errCode(ke) === 'ESRCH') await fs.rm(p).catch(() => {});
            }
          }
        } catch { /* unreadable lock — just spin */ }
        if (Date.now() > deadline) throw new Error(`session-output: lock ${p} not acquired within 10s`);
        await sleep(5, undefined);
      }
    }
    try {
      return await work();
    } finally {
      await fs.rm(p).catch(() => {});
    }
  };
  /** Any pin — in-memory or on disk — for this session generation (another process may hold it). */
  const genPinned = async (sessionId: string, generation: number, awaitIo = true): Promise<boolean> => {
    const prefix = `${sessionFileName(sessionId)}:${generation}:`;
    for (const key of pinned.keys()) if (key.startsWith(prefix)) return true;
    // Await in-flight marker writes before the disk scan — EXCEPT inside a lock section (the lock
    // already serializes against them; awaiting pinIo there would deadlock).
    if (awaitIo) await pinIo;
    let names: string[] = [];
    try {
      names = await fs.readdir(deps.root);
    } catch { /* no root */ }
    return names.some((n) => n.startsWith(pinPrefix(sessionId, generation)));
  };

  /** The generation a file holds (from its header line), or undefined when it is missing. */
  const generationOf = async (path: string): Promise<number | undefined> => {
    if ((await fs.size(path)) === undefined) return undefined;
    let head: string;
    try {
      head = (await fs.readRange(path, 0, 4096)).toString('utf8');
    } catch {
      return undefined; // renamed away between size and read (rollover) — not here any more
    }
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

  // E202611031bd72813:S001 t5: generations pinned by registered cursors, archived instead of discarded.
  // Refcounted PER READER (`${base}:${generation}:${readerId}` -> count): one reader unregistering must
  // not drop the protection another reader of the same generation still relies on.
  const pinned = new Map<string, number>();
  const archived = new Map<string, string>(); // `${sessionFileName(sessionId)}:${generation}` -> path

  // Archives live on disk as `<session>.pinned.<gen>.ndjson`; the in-memory map is rebuilt from the
  // directory on first use, so a recreated store (window reload) still discovers them (lossless
  // recovery must not depend on one process's memory).
  let archivesScanned: Promise<void> | undefined;
  const scanArchives = (force = false): Promise<void> => {
    if (!force) {
      archivesScanned ??= scanArchives(true);
      return archivesScanned;
    }
    // Always re-read the directory: ANOTHER writer may have archived a generation since the last
    // scan, and a cached scan would make that generation unreadable (SegmentGone) here.
    const p = (async () => {
      let names: string[];
      try {
        names = await fs.readdir(deps.root);
      } catch {
        return; // no root yet — nothing archived
      }
      for (const name of names) {
        const m = /^(.*)\.pinned\.(\d+)\.ndjson$/.exec(name);
        if (m === null) continue;
        const key = `${m[1]}:${Number(m[2])}`;
        if (!archived.has(key)) archived.set(key, `${deps.root}/${name}`);
      }
    })();
    archivesScanned = p;
    return p;
  };

  /** The file currently holding a cursor's generation. */
  const fileFor = async (cursor: SegmentCursor): Promise<string> => {
    const p = paths(cursor.sessionId);
    if ((await generationOf(p.current)) === cursor.generation) return p.current;
    if ((await generationOf(p.previous)) === cursor.generation) return p.previous;
    const key = `${sessionFileName(cursor.sessionId)}:${cursor.generation}`;
    const hit = async (): Promise<string | undefined> => {
      const arch = archived.get(key);
      return arch !== undefined && (await generationOf(arch)) === cursor.generation ? arch : undefined;
    };
    const found = (await hit()) ?? (await scanArchives(true).then(hit));
    if (found !== undefined) return found;
    throw new SegmentGone(cursor);
  };

  const sleep = (ms: number, signal: AbortSignal | undefined): Promise<void> => abortableSleep(ms, signal);
  /** Bounded synchronous wait (Node allows Atomics.wait on the main thread) — used only to spin
   * briefly on the session lock inside the synchronous registerCursor. */
  const syncSleep = (ms: number): void => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  };

  return {
    registerCursor(cursor: SegmentCursor, readerId = 'default'): void {
      const key = `${sessionFileName(cursor.sessionId)}:${cursor.generation}:${readerId}`;
      pinned.set(key, (pinned.get(key) ?? 0) + 1);
      // E202611031bd72813:S001 t5: the pin is also durable — a marker file per (generation, reader),
      // so a RECREATED writer (another window's process) does not discard a generation this
      // (possibly reloaded) reader still needs.
      const marker = pinPath(cursor.sessionId, cursor.generation, readerId);
      // The marker write ALWAYS happens under the session lock — never unlocked — so it is
      // serialized with sweep's pin-check + archive deletion: with the sync O_EXCL seam, spin on
      // the lock (bounded; a holder's critical section is short) and write under it, making the
      // marker durable before registerCursor returns. On spin timeout (e.g. an in-process holder
      // whose async critical section our blocked thread cannot wait out), ONLY a queued locked
      // write is left — tail() awaits that queue before its first read, so a reader never reads a
      // generation before its pin marker is durable. Without sync seams: queued locked write only.
      if (fs.writeFileSync !== undefined && fs.writeFileExclusiveSync !== undefined) {
        const lock = lockPathOf(cursor.sessionId);
        const deadline = Date.now() + 100;
        let locked = false;
        for (;;) {
          try {
            fs.writeFileExclusiveSync(lock, String(process.pid));
            locked = true;
            break;
          } catch (e) {
            if (errCode(e) !== 'EEXIST') throw e;
            if (Date.now() >= deadline) break;
            syncSleep(2);
          }
        }
        if (locked) {
          try {
            fs.writeFileSync(marker, '');
          } finally {
            if (fs.rmSync !== undefined) fs.rmSync(lock);
          }
        } else {
          enqueuePinIo(() => withSessionLock(cursor.sessionId, () => fs.writeFile(marker, '')));
        }
      } else {
        enqueuePinIo(() => withSessionLock(cursor.sessionId, () => fs.writeFile(marker, '')));
      }
    },
    unregisterCursor(cursor: SegmentCursor, readerId = 'default'): void {
      const key = `${sessionFileName(cursor.sessionId)}:${cursor.generation}:${readerId}`;
      const count = pinned.get(key);
      if (count === undefined) return;
      if (count > 1) {
        pinned.set(key, count - 1);
      } else {
        pinned.delete(key);
        // Only this reader's MARKER is removed here. The archive itself is never deleted by
        // unregister: a register racing this cleanup (same or another process) would otherwise
        // end up pinned against a deleted archive (unrecoverable SegmentGone). Archives are
        // pruned exclusively by sweep/remove, which re-check pins right before deleting.
        const marker = pinPath(cursor.sessionId, cursor.generation, readerId);
        // Synchronous marker removal when the seam allows: register -> unregister -> register then
        // preserves order (write, rm, write) because all three are synchronous in this process.
        if (fs.rmSync !== undefined) fs.rmSync(marker);
        // queued + locked fallback for async-only seams; re-check the refcount inside the task so a
        // register that happened after this unregister keeps its re-created marker
        enqueuePinIo(() =>
          withSessionLock(cursor.sessionId, async () => {
            if (pinned.has(key)) return; // re-registered: the new pin's marker must survive
            await fs.rm(marker).catch(() => {});
          }),
        );
      }
    },
    async oldestRetainedGeneration(sessionId: string): Promise<number | undefined> {
      const p = paths(sessionId);
      const base = sessionFileName(sessionId);
      await scanArchives(true); // recovery paths always re-scan: another writer may have archived since
      const gens: number[] = [];
      const cur = await generationOf(p.current);
      if (cur !== undefined) gens.push(cur);
      const prev = await generationOf(p.previous);
      if (prev !== undefined) gens.push(prev);
      for (const key of archived.keys()) {
        if (key.startsWith(`${base}:`)) gens.push(Number(key.slice(base.length + 1)));
      }
      return gens.length === 0 ? undefined : Math.min(...gens);
    },
    async recoverTurn(sessionId: string, turnId: string): Promise<SegmentCursor | undefined> {
      const p = paths(sessionId);
      const base = sessionFileName(sessionId);
      await scanArchives(true); // recovery paths always re-scan: another writer may have archived since
      // oldest retained first: archived generations (sorted), then previous, then current
      const archKeys = [...archived.keys()].filter((k) => k.startsWith(`${base}:`)).sort((a, b) => Number(a.slice(base.length + 1)) - Number(b.slice(base.length + 1)));
      const candidates: { generation: number; path: string }[] = archKeys.map((k) => ({ generation: Number(k.slice(base.length + 1)), path: archived.get(k)! }));
      const prev = await generationOf(p.previous);
      if (prev !== undefined) candidates.push({ generation: prev, path: p.previous });
      const cur = await generationOf(p.current);
      if (cur !== undefined) candidates.push({ generation: cur, path: p.current });
      for (const c of candidates) {
        // A candidate whose file was deleted by another process (stale archive entry) is skipped and
        // pruned — recovery must fall through to later retained files, not throw on the first gap.
        let offset: number | undefined;
        try {
          offset = await turnStartOffset(c.path, turnId);
        } catch {
          archived.delete(`${base}:${c.generation}`);
          continue;
        }
        if (offset !== undefined) return { sessionId, turnId, generation: c.generation, offset };
      }
      return undefined;
    },
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
          await withSessionLock(sessionId, async () => {
          // E202611031bd72813:S001 t5: retention is lossless BY CONSTRUCTION — the outgoing
          // previous generation is ALWAYS archived, never discarded at rollover. A reader that
          // registers its cursor at any point therefore cannot lose unread output to the
          // replacing rename, no matter how its registration interleaves with this rollover
          // (same or another process). Pin markers no longer guard the rollover; they protect
          // an archive from unregister/sweep cleanup while a reader still needs it.
          const prevGen = await generationOf(p.previous);
          if (prevGen !== undefined) {
            const arch = `${deps.root}/${sessionFileName(sessionId)}.pinned.${prevGen}.ndjson`;
            await fs.rename(p.previous, arch);
            archived.set(`${sessionFileName(sessionId)}:${prevGen}`, arch);
          }
          await fs.rename(p.current, p.previous); // previous is gone now: nothing is discarded
          generation = undefined;
          });
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
      const aborted = (): boolean => opts.signal?.aborted === true;
      if (aborted()) return;
      await pinIo; // the caller's registerCursor marker write completes before any read
      let file = await fileFor(cursor);
      let offset = cursor.offset;
      const limit = opts.beforeOffset;
      if (opts.fromTurnStart === true) {
        const anchor = await turnStartOffset(file, cursor.turnId);
        if (anchor === undefined) throw new SegmentGone(cursor);
        offset = anchor;
      }
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < offset || limit > ((await fs.size(file)) ?? 0))) {
        throw new SegmentGone(cursor);
      }
      if (offset > ((await fs.size(file)) ?? 0)) {
        // The file is shorter than the cursor (truncated or replaced): re-anchor at the turn's start.
        const anchor = await turnStartOffset(file, cursor.turnId);
        if (anchor === undefined) throw new SegmentGone(cursor);
        log.warn(`[chat-output] session ${cursor.sessionId}: cursor past the end of its file; re-reading turn ${cursor.turnId} from its start`);
        offset = anchor;
      }
      let pending: Buffer = Buffer.alloc(0);
      for (;;) {
        if (aborted()) return;
        const remaining = limit === undefined ? READ_CHUNK : limit - offset - pending.length;
        if (remaining <= 0) return; // a checkpoint in a partial line does not make that line complete
        // A rollover RENAMES the generation's file (to .previous, or an archived .pinned.* name),
        // so the cursor's generation is re-resolved to its current path on EVERY read — an
        // in-progress (pinned) reader follows the rename and can never switch generations mid-read.
        file = await fileFor(cursor);
        // Read finished() BEFORE reading, so bytes written just before the writer finished are not missed.
        const done = opts.finished();
        let chunk: Buffer;
        try {
          chunk = await fs.readRange(file, offset + pending.length, Math.min(READ_CHUNK, remaining));
        } catch (e) {
          if (errCode(e) === 'ENOENT') continue; // renamed away mid-resolve: loop re-resolves
          throw e; // a real read failure propagates (resume reports it as an observation failure)
        }
        // The path may have been REPLACED by a rollover between resolve and read: verify the file
        // still holds this generation before trusting any byte of the chunk.
        if ((await generationOf(file)) !== cursor.generation) continue;
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
        if (limit !== undefined) return; // bounded reconstruction never waits or flushes a partial line
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
      await pinIo; // pending marker writes/removals settle first, so they cannot recreate files here
      const p = paths(sessionId);
      await fs.rm(p.current);
      await fs.rm(p.previous);
      // E202611031bd72813:S001 t5: archived (pinned) generations of this session go too.
      for (const [key, arch] of archived) {
        if (key.startsWith(`${sessionFileName(sessionId)}:`)) {
          archived.delete(key);
          await fs.rm(arch).catch(() => {});
        }
      }
      // ...and so do its durable pin markers.
      const prefix = `${sessionFileName(sessionId)}.pin.`;
      let names: string[] = [];
      try {
        names = await fs.readdir(deps.root);
      } catch { /* no root */ }
      for (const name of names) {
        if (name.startsWith(prefix)) await fs.rm(`${deps.root}/${name}`).catch(() => {});
      }
      for (const key of [...pinned.keys()]) {
        if (key.startsWith(`${sessionFileName(sessionId)}:`)) pinned.delete(key);
      }
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
        // Pin markers are managed by register/unregister/remove, never swept.
        if (/\.pin\.\d+\./.test(name)) continue;
        // An archived pinned generation (`<session>.pinned.<gen>.ndjson`) belongs to <session>:
        // it is kept iff that session is kept, and never misread as a session named `<session>.pinned`.
        const arch = /^(.*)\.pinned\.\d+\.ndjson$/.exec(name);
        if (arch !== null) {
          const base = arch[1]!;
          const m2 = /pinned\.(\d+)\.ndjson$/.exec(name);
          const gen = m2 === null ? -1 : Number(m2[1]);
          // An archive of a KEPT session is pruned by age like any other file — UNLESS a reader
          // still pins it (in-memory here, or a durable `.pin.<gen>.` marker from any process).
          if (keep.has(base)) {
            const pinnedHere = [...pinned.keys()].some((k) => k.startsWith(`${base}:${gen}:`)) || names.some((n) => n.startsWith(`${base}.pin.${gen}.`));
            if (pinnedHere) continue;
          }
          bySession.set(base, [...(bySession.get(base) ?? []), name]);
          continue;
        }
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
        for (const f of files) {
          // An archive is deleted only under the session lock, with a FRESH pin re-check inside it,
          // so a registerCursor (whose marker write also takes the lock) cannot interleave between
          // the check and the deletion and end up pinned against a deleted archive.
          const am = /pinned\.(\d+)\.ndjson$/.exec(f);
          if (am !== null) {
            const base = f.slice(0, f.length - `.pinned.${am[1]}.ndjson`.length);
            const gen = Number(am[1]);
            try {
              await withSessionLock(base, async () => {
                const fresh = fs.readdirSync !== undefined ? fs.readdirSync(deps.root) : await fs.readdir(deps.root);
                if (fresh.some((n) => n.startsWith(`${sessionFileName(base)}.pin.${gen}.`))) return; // pinned during the sweep
                await fs.rm(`${deps.root}/${f}`);
              });
            } catch {
              // lock not acquired: leave the archive for the next sweep (never delete unlocked)
            }
            continue;
          }
          await fs.rm(`${deps.root}/${f}`);
        }
      }
    },
  };
}
