/**
 * Story E202611134642d49a:S001 / t1 — an in-memory ScratchFs for the scratch store's tests.
 *
 * It records every call (so refusal tests can assert ZERO mutation calls) and can be
 * told to fail one. A write that is made to fail still leaves part of the file behind,
 * as a real disk does. `links` models hard-link semantics: link() throws EEXIST when
 * the destination exists, and the source keeps living until its own unlink.
 */
import type { ScratchFs, ScratchFsHandle } from '../scratch-store.js';

export interface ScratchFsCall {
  readonly op: 'mkdir' | 'readdir' | 'lstat' | 'writeFile' | 'link' | 'unlink' | 'open' | 'read' | 'fstat' | 'close';
  readonly path: string;
  /** link: the destination. */
  readonly to?: string;
}

/** Operations that mutate the filesystem. */
const MUTATIONS: ReadonlySet<ScratchFsCall['op']> = new Set(['mkdir', 'writeFile', 'link', 'unlink']);

export interface FakeScratchFs {
  readonly fs: ScratchFs;
  /** path -> content, for files. */
  readonly files: Map<string, Uint8Array>;
  readonly dirs: Set<string>;
  /** path -> kind: 'file' | 'dir' | 'symlink'. */
  readonly kinds: Map<string, 'file' | 'dir' | 'symlink'>;
  readonly mtimes: Map<string, number>;
  readonly calls: ScratchFsCall[];
  /** path -> the path a symlink points to (kind must be 'symlink'). */
  readonly linkTargets: Map<string, string>;
  /** Set to make a call throw: return an Error for the call that must fail. */
  failOn: ((call: ScratchFsCall) => Error | undefined) | undefined;
  /** The time the next write is stamped with. */
  clock: number;
  ops(...kinds: ScratchFsCall['op'][]): ScratchFsCall[];
  /** The mutation calls since the last mark, so refusal paths can assert zero mutations. */
  mutationsSince(mark: number): ScratchFsCall[];
}

const enoent = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
const eexist = (path: string): Error => Object.assign(new Error(`EEXIST: ${path}`), { code: 'EEXIST' });
const eloop = (path: string): Error => Object.assign(new Error(`ELOOP: ${path}`), { code: 'ELOOP' });
const eacces = (path: string): Error => Object.assign(new Error(`EACCES: ${path}`), { code: 'EACCES' });

export { enoent, eexist, eloop, eacces };

const parent = (path: string): string => path.slice(0, path.lastIndexOf('/'));

export function fakeScratchFs(): FakeScratchFs {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>();
  const kinds = new Map<string, 'file' | 'dir' | 'symlink'>();
  const mtimes = new Map<string, number>();
  const linkTargets = new Map<string, string>();
  const calls: ScratchFsCall[] = [];
  const fake: FakeScratchFs = {
    files,
    dirs,
    kinds,
    mtimes,
    linkTargets,
    calls,
    failOn: undefined,
    clock: 1_000_000,
    ops: (...ks) => calls.filter((c) => ks.includes(c.op)),
    mutationsSince: (mark) => calls.slice(mark).filter((c) => MUTATIONS.has(c.op)),
    fs: undefined as unknown as ScratchFs,
  };
  const record = (call: ScratchFsCall): Error | undefined => {
    calls.push(call);
    return fake.failOn?.(call);
  };
  const kindOf = (p: string): 'file' | 'dir' | 'symlink' | undefined => {
    if (files.has(p)) return 'file';
    if (dirs.has(p)) return 'dir';
    return kinds.get(p);
  };
  const lstatOf = (p: string): { isFile: boolean; isSymbolicLink: boolean; size: number; mtimeMs: number } | undefined => {
    const k = kindOf(p);
    if (k === undefined) return undefined;
    if (k === 'symlink') return { isFile: false, isSymbolicLink: true, size: 0, mtimeMs: mtimes.get(p) ?? 0 };
    if (k === 'dir') return { isFile: false, isSymbolicLink: false, size: 0, mtimeMs: mtimes.get(p) ?? 0 };
    return { isFile: true, isSymbolicLink: false, size: (files.get(p) ?? new Uint8Array()).length, mtimeMs: mtimes.get(p) ?? 0 };
  };
  const put = (path: string, data: Uint8Array): void => {
    files.set(path, data);
    kinds.set(path, 'file');
    mtimes.set(path, fake.clock);
    mtimes.set(parent(path), fake.clock);
  };
  const fs: ScratchFs = {
    mkdir: async (path) => {
      const err = record({ op: 'mkdir', path });
      if (err !== undefined) throw err;
      for (let p = path; p !== '' && !dirs.has(p); p = parent(p)) {
        dirs.add(p);
        kinds.set(p, 'dir');
        mtimes.set(p, fake.clock);
      }
    },
    readdir: async (path) => {
      const err = record({ op: 'readdir', path });
      if (err !== undefined) throw err;
      if (!dirs.has(path)) throw enoent(path);
      const names = new Set<string>();
      const scan = (store: Iterable<string>): void => {
        for (const p of store) {
          if (p.startsWith(`${path}/`)) names.add(p.slice(path.length + 1).split('/')[0] ?? '');
        }
      };
      scan(files.keys());
      scan([...dirs]);
      scan([...kinds.keys()]);
      return [...names].sort();
    },
    lstat: async (path) => {
      const err = record({ op: 'lstat', path });
      if (err !== undefined) throw err;
      const st = lstatOf(path);
      if (st === undefined) throw enoent(path);
      return st;
    },
    writeFile: async (path, data) => {
      const err = record({ op: 'writeFile', path });
      if (err !== undefined) {
        put(path, data.subarray(0, Math.floor(data.length / 2)));
        throw err;
      }
      put(path, data);
    },
    link: async (from, to) => {
      const err = record({ op: 'link', path: from, to });
      const data = files.get(from);
      if (data === undefined) throw enoent(from);
      if (files.has(to) || dirs.has(to) || kinds.has(to)) throw eexist(to);
      if (err !== undefined) throw err;
      put(to, data);
    },
    unlink: async (path) => {
      const err = record({ op: 'unlink', path });
      if (err !== undefined) throw err;
      if (!files.has(path)) throw enoent(path);
      files.delete(path);
      kinds.delete(path);
      mtimes.delete(path);
    },
    open: async (path) => {
      const err = record({ op: 'open', path });
      if (err !== undefined) throw err;
      const k = kindOf(path);
      if (k === 'symlink') throw eloop(path); // O_NOFOLLOW
      if (k === undefined) throw enoent(path);
      if (k === 'dir') throw Object.assign(new Error(`EISDIR: ${path}`), { code: 'EISDIR' });
      let closed = false;
      let pos = 0;
      const handle: ScratchFsHandle = {
        read: async () => {
          const e = record({ op: 'read', path });
          if (e !== undefined) throw e;
          if (closed) throw Object.assign(new Error('EBADF'), { code: 'EBADF' });
          // A file deleted between open and read reports ENOENT on the fd, like a real one.
          if (!files.has(path)) throw enoent(path);
          const data = files.get(path) ?? new Uint8Array();
          const chunk = data.subarray(pos, pos + 64 * 1024);
          pos += chunk.length;
          return { bytes: chunk, bytesRead: chunk.length };
        },
        stat: async () => {
          const e = record({ op: 'fstat', path });
          if (e !== undefined) throw e;
          const st = lstatOf(path);
          if (st === undefined) throw enoent(path);
          return { isFile: st.isFile, size: st.size, mtimeMs: st.mtimeMs };
        },
        close: async () => {
          record({ op: 'close', path });
          closed = true;
        },
      };
      return handle;
    },
  };
  (fake as { fs: ScratchFs }).fs = fs;
  return fake;
}
