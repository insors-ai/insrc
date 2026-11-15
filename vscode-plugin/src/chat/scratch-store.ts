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
  lstat(path: string): Promise<{ readonly isFile: boolean; readonly isSymbolicLink: boolean; readonly size: number; readonly mtimeMs: number; readonly ino: number }>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  /**
   * Exclusive, no-follow write for the update path: creates `path` ONLY when it
   * does not exist and is not a symlink — fails with EEXIST on an occupied name
   * and ELOOP on a symlink (O_CREAT|O_EXCL|O_NOFOLLOW).
   */
  writeFileExclusive(path: string, data: Uint8Array): Promise<void>;
  /** Hard link — fails with EEXIST when `to` exists. The ONLY way the store publishes or
 * restores a name: link() is the atomic create-if-absent, so it can never clobber a
 * concurrently recreated destination. There is deliberately no rename in this surface. */
  link(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  open(path: string): Promise<ScratchFsHandle>;
}

export interface ScratchFsHandle {
  read(): Promise<{ bytes: Uint8Array; bytesRead: number }>;
  stat(): Promise<{ readonly isFile: boolean; readonly size: number; readonly mtimeMs: number; readonly ino: number }>;
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
    return { isFile: s.isFile(), isSymbolicLink: s.isSymbolicLink(), size: s.size, mtimeMs: s.mtimeMs, ino: s.ino };
  },
  writeFile: (p, data) => writeFile(p, data),
  writeFileExclusive: async (p, data) => {
    // O_CREAT|O_EXCL|O_NOFOLLOW: EEXIST on an occupied name, ELOOP on a symlink — never followed.
    const h = await open(p, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW);
    try {
      await h.writeFile(data);
    } finally {
      await h.close();
    }
  },
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
        return { isFile: s.isFile(), size: s.size, mtimeMs: s.mtimeMs, ino: s.ino };
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
  /**
   * Replace the whole content of an existing scratchpad. Same id validation as
   * read/delete (strictly inside root, *.md basename, regular file, symlink
   * refused, O_NOFOLLOW). The new content is written to a temp file created
   * EXCLUSIVELY and no-follow, then published over the destination with
   * unlink(destination) + link(temp, destination) + unlink(temp) — never rename.
   * The destination is re-opened O_NOFOLLOW and fstat'd before its unlink, so a
   * symlink swapped in after the lstat is never removed; a link() EEXIST (the
   * destination recreated concurrently) is re-validated and retried a bounded
   * number of times. Throws ScratchRefused / ScratchNotFound / ScratchStoreError.
   */
  updateScratch(id: string, text: string): Promise<void>;
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

  /** Bounded retries when a concurrent recreate surfaces as link() EEXIST on the destination. */
  const PUBLISH_ATTEMPTS = 5;

  const updateScratch = async (id: string, text: string): Promise<void> => {
    if (typeof text !== 'string') throw new ScratchRefused('the scratchpad content must be a string');
    const path = resolveInside(id);
    // Same validation as delete: lstat-confirm a regular file, symlink refused.
    let st;
    try {
      st = await fs.lstat(path);
    } catch (e) {
      if (errCode(e) === 'ENOENT') throw new ScratchNotFound(`'${id}' does not exist`);
      throw storeError(e);
    }
    if (!st.isFile || st.isSymbolicLink) throw new ScratchRefused(`'${id}' is not a regular file and is refused`);

    // Exclusive no-follow temp write: O_CREAT|O_EXCL|O_NOFOLLOW — an occupied or
    // symlinked temp name fails with EEXIST/ELOOP instead of being followed. On
    // failure the temp was never created by us, so it is left strictly alone.
    const temp = join(root, `.tmp-${process.pid}-${randomBytes(6).toString('hex')}`);
    const content = Buffer.from(text, 'utf8');
    const unlinkTemp = async (): Promise<void> => {
      try { await fs.unlink(temp); } catch (rmErr) { log.warn(`[scratches] could not remove temp ${temp}: ${String(rmErr)}`); }
    };
    try {
      await fs.writeFileExclusive(temp, content);
    } catch (e) {
      const code = errCode(e);
      if (code === 'EEXIST' || code === 'ELOOP') {
        // The exclusive create never happened: the entry at the temp name is NOT
        // ours — leave it strictly alone (it may be a pre-existing file or symlink).
        throw new ScratchStoreError(`scratchpad update refused: temp name is occupied (${String(e)})`);
      }
      // The create succeeded but the write failed (e.g. ENOSPC leaves a partial temp
      // this call created): clean up the temp we own.
      await unlinkTemp();
      throw storeError(e);
    }

    /** Abandon the save: if any attempt already unlinked the destination, put the
     * ORIGINAL content back from the backup hard link first (the destination must be
     * untouched by a failed save, even on the retry path), then clean up temp+backups.
     * The restore is link-only: link() is the atomic create-if-absent, so it can never
     * clobber a concurrently recreated destination (EEXIST => leave that file alone).
     * There is deliberately NO rename fallback — rename would race a concurrent
     * recreation between any existence check and the rename itself. If every restore
     * link fails non-EEXIST, the backup is simply left in place (logged) and the store
     * error still reports the failure; the original inode is never destroyed.
     * Backups are unlinked only if this operation created them — a failed backup-link
     * must never delete an entry it does not own. */
    let unlinkedSoFar = false;
    // One backup name per publish attempt, in order: backups[i] hard-links the inode
    // that attempt i validated and unlinked. The LATEST backup is the one whose inode
    // is currently missing from the destination name and must be restored on failure.
    const backups: string[] = [];
    const backupName = (): string => join(root, `.tmp-${process.pid}-${randomBytes(6).toString('hex')}.bak`);
    const dropBackup = async (b: string): Promise<void> => {
      try { await fs.unlink(b); } catch (rmErr) { log.warn(`[scratches] could not remove backup ${b}: ${String(rmErr)}`); }
    };
    const unlinkBackups = async (): Promise<void> => {
      for (const b of backups) await dropBackup(b);
    };
    // restoreFromBackup returns true when every restore link failed non-EEXIST (the
    // backup is intentionally left on disk — it still hard-links the original inode —
    // because no rename fallback exists to force it back safely).
    const restoreFromBackup = async (): Promise<boolean> => {
      const backup = backups[backups.length - 1];
      if (backup === undefined) return false;
      for (let rAttempt = 0; rAttempt < PUBLISH_ATTEMPTS; rAttempt++) {
        try {
          await fs.link(backup, path);
          return false;
        } catch (rmErr) {
          if (errCode(rmErr) === 'EEXIST') {
            // The name was recreated concurrently after our unlink: leave that actor's
            // file alone (never clobber it) — the destination is not missing.
            log.warn(`[scratches] restore of ${id} skipped: the name was recreated concurrently: ${String(rmErr)}`);
            return false;
          }
          log.warn(`[scratches] could not restore ${id} from the backup link (attempt ${rAttempt + 1}): ${String(rmErr)}`);
        }
      }
      // Every restore link failed for a non-EEXIST reason and the name is still absent:
      // do NOT rename the backup over the name — a check-then-rename race could clobber
      // a destination recreated in between. Leave the backup on disk (original inode
      // preserved) and report via the caller's ScratchStoreError.
      log.warn(`[scratches] could not restore ${id} from the backup link; leaving ${backup} in place (original inode preserved, no rename fallback)`);
      return true;
    };
    const fail = async (e: unknown): Promise<unknown> => {
      const gaveUp = unlinkedSoFar ? await restoreFromBackup() : false;
      await unlinkTemp();
      if (!gaveUp) await unlinkBackups();
      return e;
    };

    // No-clobber publish: unlink(destination) + link(temp, destination) + unlink(temp).
    // Never rename — rename would clobber a destination created after the probe above.
    // Each attempt re-validates the destination (lstat), then re-opens it O_NOFOLLOW and
    // fstats the SAME fd and only unlinks when that fd's inode is the one just lstat'd —
    // a symlink or replacement swapped in between is refused, never removed.
    let unlinked = false;
    let publishErr: unknown;
    for (let attempt = 0; ; attempt++) {
      let st2;
      try {
        st2 = await fs.lstat(path);
      } catch (e) {
        throw await fail(errCode(e) === 'ENOENT' ? new ScratchNotFound(`'${id}' disappeared before the save`) : storeError(e));
      }
      if (!st2.isFile || st2.isSymbolicLink) {
        throw await fail(new ScratchRefused(`'${id}' is not a regular file and is refused`));
      }
      let handle;
      try {
        handle = await fs.open(path);
      } catch (e) {
        const code = errCode(e);
        if (code === 'ENOENT') throw await fail(new ScratchNotFound(`'${id}' disappeared before the save`));
        if (code === 'ELOOP' || code === 'EISDIR') throw await fail(new ScratchRefused(`'${id}' is not a regular file and is refused`));
        throw await fail(storeError(e));
      }
      try {
        let fst;
        try {
          fst = await handle.stat();
        } catch (e) {
          throw await fail(errCode(e) === 'ENOENT' ? new ScratchNotFound(`'${id}' disappeared before the save`) : storeError(e));
        }
        if (!fst.isFile || fst.ino !== st2.ino) {
          throw await fail(new ScratchRefused(`'${id}' changed between validation and unlink and is refused`));
        }
      } finally {
        try { await handle.close(); } catch { /* closing the probe fd is best-effort */ }
      }

      // Back up the EXACT inode we just validated on the fd, so a later restore puts
      // back precisely what this attempt removes. The previous attempt's backup (a
      // stale, already-unlinked inode) is dropped only AFTER this link succeeds, so a
      // restore backup always exists once anything has been unlinked. A single backup
      // linked once up front could instead preserve a stale inode A while the loop
      // unlinks a replacement inode B, and a failed publish would restore A over the
      // path, losing B (r32 CR-MED).
      const backup = backupName();
      try {
        await fs.link(path, backup);
      } catch (e) {
        throw await fail(errCode(e) === 'ENOENT' ? new ScratchNotFound(`'${id}' disappeared before the save`) : storeError(e));
      }
      backups.push(backup);
      if (backups.length > 1) await dropBackup(backups[backups.length - 2] ?? '');

      // The re-validated inode is confirmed on the fd and backed up: unlink it, then
      // link the temp over the name.
      try {
        await fs.unlink(path);
      } catch (e) {
        // Deleted between the backup and the unlink: nothing to publish over.
        throw await fail(errCode(e) === 'ENOENT' ? new ScratchNotFound(`'${id}' disappeared before the save`) : storeError(e));
      }
      unlinked = true;
      unlinkedSoFar = true;
      try {
        await fs.link(temp, path);
      } catch (e) {
        if (errCode(e) === 'EEXIST' && attempt + 1 < PUBLISH_ATTEMPTS) {
          // The destination was recreated between our unlink and link: the next attempt
          // re-validates it (lstat + O_NOFOLLOW fstat inode check) before unlinking again.
          continue;
        }
        publishErr = e;
        break;
      }
      // Published: the destination now holds the new content; remove the temp and the backups.
      try {
        await fs.unlink(temp);
      } catch (rmErr) {
        log.warn(`[scratches] could not remove temp ${temp}: ${String(rmErr)}`);
      }
      await unlinkBackups();
      return;
    }
    // The publish never landed (non-EEXIST link failure, or retries exhausted). Put the
    // ORIGINAL content back under the original name from the latest backup hard link
    // (link-only restore — never a rename, which could clobber a concurrently recreated
    // name). If even the restore links all fail non-EEXIST, the backup is deliberately
    // LEFT on disk (it still hard-links the original inode) instead of forcing a rename.
    const restoreGaveUp = unlinked ? await restoreFromBackup() : false;
    await unlinkTemp();
    if (!restoreGaveUp) await unlinkBackups();
    throw storeError(publishErr);
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

  return { listScratches, createScratch, readScratch, deleteScratch, updateScratch };
}
