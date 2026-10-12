/**
 * Story E20261012c96a97a2:S001 — an in-memory SessionFilesFs for the file store's tests.
 *
 * It records every call, so a test can assert what a save wrote (and that a list read no rows
 * file), and it can be told to fail one. Sizes are UTF-8 byte lengths and every write moves a
 * file's modification time on, as on a real file system.
 */
import type { SessionFilesFs } from '../session-file-store.js';

export interface FsCall {
  readonly op: 'mkdir' | 'readText' | 'writeText' | 'appendText' | 'rename' | 'remove' | 'truncate' | 'stat' | 'list';
  readonly path: string;
  /** writeText / appendText: the text written. */
  readonly data?: string;
  /** rename: the destination. */
  readonly to?: string;
}

export interface FakeSessionFs {
  readonly fs: SessionFilesFs;
  /** path -> content. */
  readonly files: Map<string, string>;
  readonly calls: FsCall[];
  /** Set to make a call throw: return an Error for the call that must fail. */
  failOn: ((call: FsCall) => Error | undefined) | undefined;
  /** The calls of some kinds, in order. */
  ops(...kinds: FsCall['op'][]): FsCall[];
  /** Forget the calls recorded so far. */
  clear(): void;
}

export function fakeSessionFs(): FakeSessionFs {
  const files = new Map<string, string>();
  const mtimes = new Map<string, number>();
  const calls: FsCall[] = [];
  let clock = 1000;
  const touch = (path: string): void => {
    mtimes.set(path, ++clock);
  };
  const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));
  const fake: FakeSessionFs = {
    files,
    calls,
    failOn: undefined,
    ops: (...kinds) => calls.filter((c) => kinds.includes(c.op)),
    clear: () => {
      calls.length = 0;
    },
    fs: undefined as unknown as SessionFilesFs,
  };
  const record = (call: FsCall): void => {
    calls.push(call);
    const err = fake.failOn?.(call);
    if (err !== undefined) throw err;
  };
  const fs: SessionFilesFs = {
    mkdir: (dir) => record({ op: 'mkdir', path: dir }),
    readText: (path) => {
      record({ op: 'readText', path });
      return files.get(path);
    },
    writeText: (path, data) => {
      record({ op: 'writeText', path, data });
      files.set(path, data);
      touch(path);
    },
    appendText: (path, data) => {
      record({ op: 'appendText', path, data });
      files.set(path, (files.get(path) ?? '') + data);
      touch(path);
    },
    rename: (from, to) => {
      record({ op: 'rename', path: from, to });
      const data = files.get(from);
      if (data === undefined) throw new Error(`ENOENT: ${from}`);
      files.delete(from);
      mtimes.delete(from);
      files.set(to, data);
      touch(to);
    },
    remove: (path) => {
      record({ op: 'remove', path });
      files.delete(path);
      mtimes.delete(path);
    },
    truncate: (path, bytes) => {
      record({ op: 'truncate', path });
      const data = files.get(path);
      if (data === undefined) throw new Error(`ENOENT: ${path}`);
      files.set(path, Buffer.from(data, 'utf8').subarray(0, bytes).toString('utf8'));
      touch(path);
    },
    stat: (path) => {
      record({ op: 'stat', path });
      const data = files.get(path);
      return data === undefined ? undefined : { size: Buffer.byteLength(data, 'utf8'), mtimeMs: mtimes.get(path) ?? 0 };
    },
    list: (dir) => {
      record({ op: 'list', path: dir });
      return [...files.keys()].filter((p) => dirOf(p) === dir).map((p) => p.slice(dir.length + 1));
    },
  };
  (fake as { fs: SessionFilesFs }).fs = fs;
  return fake;
}
