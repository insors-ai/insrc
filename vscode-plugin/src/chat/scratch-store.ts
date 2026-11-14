/**
 * Story E202611134642d49a:S001 / t1 — the scratchpad store.
 *
 * A vscode-free, deps-injected module. Scratchpads are plain markdown files in
 * one directory (<root>/, i.e. ~/.insrc/scratches in production), named
 * `<yyyymmdd-hhmmss>-<slug>.md`; the file name is the scratchpad's id. There is
 * NO daemon IPC — pure filesystem.
 *
 * Publication is exclusive and cross-process safe: content is written to a
 * temp file (pid + random suffix, never matching *.md) and published with
 * link(temp, final) + unlink(temp) ONLY — never rename, which would clobber a
 * destination created after the existence probe. link() fails with EEXIST when
 * the destination exists, so a concurrent create in another window can never
 * replace a scratchpad; on EEXIST the next collision suffix is probed.
 *
 * Reads open the file with O_RDONLY | O_NOFOLLOW and fstat that single fd, so a
 * symlink swapped in after any earlier check still yields ELOOP -> ScratchRefused
 * and is never followed. Deletes lstat-confirm a regular file and unlink only
 * (never recursive), and treat ENOENT at any checkpoint as success (idempotent).
 */

import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readdir, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { errCode } from './async-util.js';

/** One scratchpad's metadata; `id` is the file basename. */
export interface ScratchEntry {
  readonly id: string;
  /** Reconstructed from the id (the <yyyymmdd-hhmmss>-<slug> basename). */
  readonly name: string;
  readonly mtime: number;
  readonly size: number;
}

/**
 * The fs surface the store uses. lstat/stat report `symlink: true` for a
 * symbolic link; open() returns a handle whose read/fstat operate on that fd,
 * so validation and read observe the same file.
 */
export interface ScratchFs {
  mkdir(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  lstat(path: string): Promise<{ readonly isFile: boolean; readonly isSymbolicLink: boolean; readonly size: number; readonly mtimeMs: number }>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  /** Hard link — fails with EEXIST when `to` exists. Never replaced by rename. */
  link(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  open(path: string): Promise<ScratchFsHandle>;
}

export interface ScratchFsHandle {
  read(): Promise<{ bytes: Uint8Array; bytesRead: number }>;
  stat(): Promise<{ readonly isFile: boolean; readonly size: number; readonly mtimeMs: number }>;
  close(): Promise<void>;
}

/** The node adapter: the production default when `fs` is omitted. */
export const nodeScratchFs: ScratchFs = {
  mkdir: async (p) => {
    await mkdir(p, { recursive: true });
  },
  readdir: async (p) => {
    const names = await readdir(p);
    return names as string[];
  },
  lstat: async (p) => {
    const s = await lstat(p);
    return { isFile: s.isFile(), isSymbolicLink: s.isSymbolicLink(), size: s.size, mtimeMs: s.mtimeMs };
  },
  writeFile: (p, data) => writeFile(p, data),
  link: (from, to) => link(from, to),
  unlink: (p) => unlink(p),
  open: async (p) => {
    // O_NOFOLLOW: a symlink at the path yields ELOOP and is never followed.
    const h = await open(p, constants.O_RDONLY | constants.O_NOFOLLOW);
    return {
      read: async () => {
        const buf = Buffer.alloc(64 * 1024);
        // position null: advance the fd's own position, so consecutive reads walk the file.
        const { bytesRead } = await h.read(buf, 0, buf.length, null);
        return { bytes: buf.subarray(0, bytesRead), bytesRead };
      },
      stat: async () => {
        const s = await h.stat();
        return { isFile: s.isFile(), size: s.size, mtimeMs: s.mtimeMs };
      },
      close: () => h.close(),
    };
  },
};

/** The store could not perform the operation (I/O, capacity, permissions). */
export class ScratchStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScratchStoreError';
  }
}

/** The id or file is refused (bad name, not inside the root, not a regular file, symlink). */
export class ScratchRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScratchRefused';
  }
}

/** The scratchpad named by the id does not exist (at open or at read on the same fd). */
export class ScratchNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScratchNotFound';
  }
}

export interface ScratchStoreDeps {
  readonly root: string;
  readonly fs?: ScratchFs | undefined;
  readonly now?: (() => Date) | undefined;
  readonly logger?: { warn(msg: string): void } | undefined;
}

export interface ScratchStore {
  listScratches(limit?: number | undefined): Promise<ScratchEntry[]>;
  createScratch(title: string, body?: string | undefined): Promise<ScratchEntry>;
  readScratch(id: string): Promise<{ entry: ScratchEntry; content: string }>;
  deleteScratch(id: string): Promise<void>;
}

/** The shape a scratchpad id must have: a single safe *.md file name. */
const ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

/** Only plain *.md files are listed or accepted; temp files never match. */
const isScratchName = (name: string): boolean => name.endsWith('.md') && ID_SHAPE.test(name);

/** `title` -> lowercase slug; spaces to dashes, other characters dropped; no alphanumeric left -> 'scratch'. */
const slugify = (title: string): string => {
  const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  return /[a-z0-9]/.test(slug) ? slug : 'scratch';
};

/** <yyyymmdd-hhmmss> of `d`, local time. */
const stampOf = (d: Date): string => {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const entryOf = (id: string, st: { size: number; mtimeMs: number }): ScratchEntry => ({
  id,
  name: id.replace(/\.md$/, ''),
  mtime: st.mtimeMs,
  size: st.size,
});

/** EACCES/ENOSPC/EROFS-style failures become ScratchStoreError; the rest pass through. */
const storeError = (e: unknown): ScratchStoreError => {
  const code = errCode(e);
  if (code === 'EACCES' || code === 'ENOSPC' || code === 'EROFS' || code === 'ENOTDIR') {
    return new ScratchStoreError(`scratchpads unavailable: ${String(e)}`);
  }
  return new ScratchStoreError(`scratchpad store failure: ${String(e)}`);
};

export function createScratchStore(deps: ScratchStoreDeps): ScratchStore {
  const fs = deps.fs ?? nodeScratchFs;
  const now = deps.now ?? (() => new Date());
  const log = deps.logger ?? { warn: () => {} };
  const root = deps.root;

  /** The id is safe AND resolves strictly inside the root — checked before any fs call. */
  const resolveInside = (id: string): string => {
    if (typeof id !== 'string' || !isScratchName(id) || id === '.' || id === '..') {
      throw new ScratchRefused(`'${String(id)}' is not a scratchpad file name`);
    }
    const rootResolved = resolve(root);
    const path = resolve(rootResolved, id);
    // relative() is separator-agnostic (correct on Windows too, where resolved
    // paths use backslashes); an escaping id yields '' or a path that starts
    // with '..' or is absolute.
    const rel = relative(rootResolved, path);
    if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || resolve(rel) === rel) {
      throw new ScratchRefused(`'${id}' is outside the scratches directory`);
    }
    return path;
  };

  const ensureRoot = async (): Promise<void> => {
    try {
      await fs.mkdir(root);
    } catch (e) {
      throw storeError(e);
    }
  };

  const listScratches = async (limit?: number | undefined): Promise<ScratchEntry[]> => {
    let names: string[];
    try {
      names = await fs.readdir(root);
    } catch (e) {
      if (errCode(e) === 'ENOENT') return [];
      throw storeError(e);
    }
    const entries: ScratchEntry[] = [];
    for (const name of names) {
      if (!isScratchName(name)) continue;
      let st;
      try {
        st = await fs.lstat(join(root, name));
      } catch {
        continue; // disappeared or unreadable between readdir and lstat
      }
      if (!st.isFile || st.isSymbolicLink) continue;
      entries.push(entryOf(name, st));
    }
    entries.sort((a, b) => (b.mtime - a.mtime) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return limit === undefined ? entries : entries.slice(0, limit);
  };

  const createScratch = async (title: string, body?: string | undefined): Promise<ScratchEntry> => {
    if (typeof title !== 'string' || title.trim() === '') throw new ScratchRefused('a scratchpad needs a non-empty title');
    await ensureRoot();
    const base = `${stampOf(now())}-${slugify(title)}`;
    const content = Buffer.from(body ?? `# ${title}\n\n`, 'utf8');
    const temp = join(root, `.tmp-${process.pid}-${randomBytes(6).toString('hex')}`);
    try {
      await fs.writeFile(temp, content);
    } catch (e) {
      throw storeError(e);
    }
    // Exclusive publication: link() is the single atomic no-clobber point. Each
    // candidate name is first probed with lstat (occupied -> next suffix); a
    // concurrent create can still win between probe and link, which the EEXIST
    // branch covers.
    for (let suffix = 0; ; suffix++) {
      const id = suffix === 0 ? `${base}.md` : `${base}-${suffix + 1}.md`;
      const final = join(root, id);
      try {
        await fs.lstat(final);
        continue; // probed occupied: next suffix
      } catch (e) {
        if (errCode(e) !== 'ENOENT') {
          try { await fs.unlink(temp); } catch (rmErr) { log.warn(`[scratches] could not remove temp ${temp}: ${String(rmErr)}`); }
          throw storeError(e);
        }
      }
      try {
        await fs.link(temp, final);
      } catch (e) {
        if (errCode(e) === 'EEXIST') continue; // lost the race: probe the next suffix
        try { await fs.unlink(temp); } catch (rmErr) { log.warn(`[scratches] could not remove temp ${temp}: ${String(rmErr)}`); }
        throw storeError(e);
      }
      // Published: the scratchpad exists. A failed temp cleanup is non-fatal
      // (the temp name never matches *.md, so it stays invisible to lists).
      try {
        await fs.unlink(temp);
      } catch (rmErr) {
        log.warn(`[scratches] could not remove temp ${temp}: ${String(rmErr)}`);
      }
      // Post-publication metadata lookup. This must NOT fail the create: the file
      // already exists (link() succeeded atomically), so throwing here would report
      // failure for a successfully published scratchpad. Degraded metadata is fine —
      // size 0 / mtime 0 is corrected by the next list/refresh.
      let st;
      try {
        st = await fs.lstat(final);
      } catch (e) {
        log.warn(`[scratches] published ${id} but could not stat it: ${String(e)}`);
        st = { size: content.length, mtimeMs: now().getTime() };
      }
      return entryOf(id, st);
    }
    // Unreachable: the ladder always either publishes or throws.
    throw new ScratchStoreError('no free scratchpad name within the collision ladder');
  };

  const readScratch = async (id: string): Promise<{ entry: ScratchEntry; content: string }> => {
    const path = resolveInside(id);
    let handle;
    try {
      handle = await fs.open(path);
    } catch (e) {
      const code = errCode(e);
      if (code === 'ENOENT') throw new ScratchNotFound(`'${id}' does not exist`);
      if (code === 'ELOOP' || code === 'EISDIR') throw new ScratchRefused(`'${id}' is not a regular file and is refused`);
      throw storeError(e);
    }
    try {
      let st;
      try {
        st = await handle.stat();
      } catch (e) {
        if (errCode(e) === 'ENOENT') throw new ScratchNotFound(`'${id}' disappeared while reading`);
        throw storeError(e);
      }
      if (!st.isFile) throw new ScratchRefused(`'${id}' is not a regular file`);
      const chunks: Uint8Array[] = [];
      for (;;) {
        let chunk;
        try {
          chunk = await handle.read();
        } catch (e) {
          if (errCode(e) === 'ENOENT') throw new ScratchNotFound(`'${id}' disappeared while reading`);
          throw storeError(e);
        }
        if (chunk.bytesRead === 0) break;
        chunks.push(chunk.bytes);
      }
      const content = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
      return { entry: entryOf(id, st), content };
    } finally {
      try { await handle.close(); } catch { /* closing a read fd is best-effort */ }
    }
  };

  const deleteScratch = async (id: string): Promise<void> => {
    const path = resolveInside(id);
    let st;
    try {
      st = await fs.lstat(path);
    } catch (e) {
      if (errCode(e) === 'ENOENT') return; // already gone: idempotent success
      throw storeError(e);
    }
    if (!st.isFile || st.isSymbolicLink) throw new ScratchRefused(`'${id}' is not a regular file and is refused`);
    try {
      await fs.unlink(path);
    } catch (e) {
      if (errCode(e) === 'ENOENT') return; // deleted between lstat and unlink: idempotent success
      throw storeError(e);
    }
  };

  return { listScratches, createScratch, readScratch, deleteScratch };
}
