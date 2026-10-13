/**
 * Story E2026101259da3204:S001 — an in-memory AttachmentFs for the attachment store's tests.
 *
 * It records every call and can be told to fail one. A write that is made to fail still leaves
 * part of the file behind, as a real disk does when it fills, so a test can see it cleaned up.
 */
import type { AttachmentFs } from '../attachment-store.js';

export interface AttachmentFsCall {
  readonly op: 'mkdir' | 'writeFile' | 'copyFile' | 'stat' | 'rm' | 'readdir';
  readonly path: string;
  /** copyFile: the destination. */
  readonly to?: string;
}

export interface FakeAttachmentFs {
  readonly fs: AttachmentFs;
  /** path -> content, for files. */
  readonly files: Map<string, Uint8Array>;
  readonly dirs: Set<string>;
  /** path -> modification time, for files and directories. */
  readonly mtimes: Map<string, number>;
  readonly calls: AttachmentFsCall[];
  /** Set to make a call throw: return an Error for the call that must fail. */
  failOn: ((call: AttachmentFsCall) => Error | undefined) | undefined;
  /** The time the next write is stamped with. */
  clock: number;
  ops(...kinds: AttachmentFsCall['op'][]): AttachmentFsCall[];
}

const enoent = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

export function fakeAttachmentFs(): FakeAttachmentFs {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>();
  const mtimes = new Map<string, number>();
  const calls: AttachmentFsCall[] = [];
  const fake: FakeAttachmentFs = {
    files,
    dirs,
    mtimes,
    calls,
    failOn: undefined,
    clock: 1000,
    ops: (...kinds) => calls.filter((c) => kinds.includes(c.op)),
    fs: undefined as unknown as AttachmentFs,
  };
  const parent = (path: string): string => path.slice(0, path.lastIndexOf('/'));
  const record = (call: AttachmentFsCall): Error | undefined => {
    calls.push(call);
    return fake.failOn?.(call);
  };
  const put = (path: string, data: Uint8Array): void => {
    files.set(path, data);
    mtimes.set(path, fake.clock);
    mtimes.set(parent(path), fake.clock);
  };
  const fs: AttachmentFs = {
    mkdir: async (path) => {
      const err = record({ op: 'mkdir', path });
      if (err !== undefined) throw err;
      for (let p = path; p !== '' && !dirs.has(p); p = parent(p)) {
        dirs.add(p);
        mtimes.set(p, fake.clock);
      }
    },
    writeFile: async (path, data) => {
      const err = record({ op: 'writeFile', path });
      if (err !== undefined) {
        put(path, data.subarray(0, Math.floor(data.length / 2)));
        throw err;
      }
      put(path, data);
    },
    copyFile: async (from, to) => {
      const err = record({ op: 'copyFile', path: from, to });
      const data = files.get(from);
      if (data === undefined) throw enoent(from);
      if (err !== undefined) {
        put(to, data.subarray(0, Math.floor(data.length / 2)));
        throw err;
      }
      put(to, data);
    },
    stat: async (path) => {
      const err = record({ op: 'stat', path });
      if (err !== undefined) throw err;
      const data = files.get(path);
      if (data !== undefined) return { size: data.length, isFile: true, mtimeMs: mtimes.get(path) ?? 0 };
      if (dirs.has(path)) return { size: 0, isFile: false, mtimeMs: mtimes.get(path) ?? 0 };
      return undefined;
    },
    rm: async (path) => {
      const err = record({ op: 'rm', path });
      if (err !== undefined) throw err;
      files.delete(path);
      dirs.delete(path);
      for (const p of [...files.keys()]) if (p.startsWith(`${path}/`)) files.delete(p);
      for (const p of [...dirs]) if (p.startsWith(`${path}/`)) dirs.delete(p);
    },
    readdir: async (path) => {
      const err = record({ op: 'readdir', path });
      if (err !== undefined) throw err;
      if (!dirs.has(path)) throw enoent(path);
      const names = new Set<string>();
      for (const p of [...files.keys(), ...dirs]) {
        if (p.startsWith(`${path}/`)) names.add(p.slice(path.length + 1).split('/')[0] ?? '');
      }
      return [...names].sort();
    },
  };
  (fake as { fs: AttachmentFs }).fs = fs;
  return fake;
}
