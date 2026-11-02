import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DirectoryOwnership } from '../ownership.js';
import { assertPrivateFile } from '../private-file.js';
import { errno } from '../configuration.js';
import { MemoryError } from '../errors.js';
import { decodeFrame, encodeFrame, snapshotJson } from './codec.js';
import type { SegmentHeader } from './types.js';
import { QUEUE_LIMITS } from './types.js';

export interface IoHooks {
  before?(operation: string, path: string): Promise<void>;
  after?(operation: string, path: string): Promise<void>;
  /** Private short-write seam; not an option of MemoryFactory or any host port. */
  write?(file: FileHandle, bytes: Uint8Array, offset: number, length: number, position: number): Promise<number>;
}
interface Directory { readonly path: string; readonly file: FileHandle; readonly dev: bigint; readonly ino: bigint; }
const liveHandles = new Set<FileHandle>();
const failure = (): MemoryError => new MemoryError('STORE_UNAVAILABLE', 'Memory queue I/O could not be verified.', true);
export const INITIAL_SEGMENT = '00000000000000000001';
export function segmentName(id: string): string {
  if (!/^[0-9]{20}$/.test(id) || BigInt(id) < 1n || BigInt(id) > 18_446_744_073_709_551_615n) throw failure();
  return id + '.jsonl';
}
const controls = new Set(['format.json', 'checkpoint.json', 'checkpoint.prev', 'checkpoint.next', 'checkpoint.prev.next', 'recovery.json', 'fault.json', 'receipt-barrier.json']);

/** One owned instance; construct before startup so even failed startup is closable. */
export class QueueIo {
  readonly #owner: DirectoryOwnership;
  readonly #root: string;
  readonly #hooks: IoHooks;
  readonly #directories = new Map<string, Directory>();
  readonly #files = new Set<FileHandle>();
  #closed = false;
  #fenced = false;
  constructor(owner: DirectoryOwnership, root: string, hooks: IoHooks = {}) {
    if (!isAbsolute(root)) throw new MemoryError('INVALID_REQUEST', 'An explicit memory root is required.');
    this.#owner = owner; this.#root = root; this.#hooks = hooks;
  }
  get fenced(): boolean { return this.#fenced; }
  get path(): string { return join(this.#root, 'queue'); }
  #path(name: string): string {
    if (controls.has(name)) return join(this.path, name);
    if (/^segments\/[0-9]{20}\.jsonl$/.test(name)) {
      segmentName(name.slice(9, -6)); return join(this.path, name);
    }
    throw failure();
  }
  async #checkDirectory(directory: Directory): Promise<void> {
    const a = await directory.file.stat({ bigint: true }), b = await lstat(directory.path, { bigint: true });
    if (!a.isDirectory() || !b.isDirectory() || a.dev !== directory.dev || a.ino !== directory.ino || b.dev !== a.dev || b.ino !== a.ino || b.uid !== BigInt(process.getuid!()) || (b.mode & 0o077n) !== 0n) throw failure();
  }
  async assertOwned(): Promise<void> {
    if (this.#closed || this.#fenced) throw failure();
    await this.#owner.assertOwned();
    for (const dir of this.#directories.values()) await this.#checkDirectory(dir);
  }
  async #action<T>(operation: string, name: string, mutation: boolean, action: () => Promise<T>): Promise<T> {
    try {
      await this.assertOwned(); await this.#hooks.before?.(operation, name);
      // A hook/await can reveal directory replacement; check again before action.
      await this.assertOwned();
      const result = await action();
      await this.#hooks.after?.(operation, name); await this.assertOwned();
      return result;
    } catch (error) {
      if (mutation) this.#fenced = true;
      if (error instanceof MemoryError) throw error;
      throw failure();
    }
  }
  async #release(file: FileHandle): Promise<void> {
    await file.close(); this.#files.delete(file); liveHandles.delete(file);
  }
  async #directory(path: string): Promise<void> {
    const file = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    this.#files.add(file); liveHandles.add(file);
    const value = await file.stat({ bigint: true });
    const dir = { path, file, dev: value.dev, ino: value.ino };
    this.#directories.set(path, dir); await this.#checkDirectory(dir);
  }
  /** Bootstrap only the queue-owned subtree; S1 guard already owns the root. */
  async start(): Promise<void> {
    try {
      await this.#owner.assertOwned();
      if (await realpath(this.#root) !== this.#root) throw failure();
      await this.#directory(this.#root);
      for (const path of [this.path, join(this.path, 'segments')]) {
        await this.#action('mkdir', path, true, async () => {
          try { await mkdir(path, { mode: 0o700 }); }
          catch (error) { if (errno(error) !== 'EEXIST') throw error; }
        });
        await this.#directory(path);
        await this.syncDirectory(path === this.path ? 'root' : 'queue');
      }
    } catch { this.#fenced = true; throw failure(); }
  }
  async syncDirectory(which: 'root' | 'queue' | 'segments'): Promise<void> {
    const path = which === 'root' ? this.#root : which === 'queue' ? this.path : join(this.path, 'segments');
    const dir = this.#directories.get(path);
    if (!dir) throw failure();
    await this.#action('directory-sync', which, true, () => dir.file.sync());
  }
  async #open(name: string, create: boolean): Promise<FileHandle> {
    await this.assertOwned();
    const file = await open(this.#path(name), constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK | (create ? constants.O_CREAT | constants.O_EXCL : 0), 0o600);
    this.#files.add(file); liveHandles.add(file);
    await this.#checkFile(name, file); return file;
  }
  async #checkFile(name: string, file: FileHandle): Promise<void> {
    assertPrivateFile(await file.stat());
    const a = await file.stat({ bigint: true }), b = await lstat(this.#path(name), { bigint: true });
    if (!b.isFile() || b.dev !== a.dev || b.ino !== a.ino) throw failure();
  }
  async exists(name: string): Promise<boolean> {
    await this.assertOwned();
    try { const file = await this.#open(name, false); await this.#release(file); return true; }
    catch (error) { if (errno(error) === 'ENOENT') return false; throw failure(); }
  }
  async list(which: 'queue' | 'segments'): Promise<string[]> {
    return this.#action('list', which, false, async () => {
      const names = await readdir(which === 'queue' ? this.path : join(this.path, 'segments'));
      if (names.length > QUEUE_LIMITS.maxSegments + controls.size + 1) throw failure();
      for (const name of names) {
        if (which === 'queue' ? name !== 'segments' && !controls.has(name) : !/^[0-9]{20}\.jsonl$/.test(name)) throw failure();
      }
      return names.sort();
    });
  }
  /** Capped allocation/read. Never trust an on-disk length for allocation. */
  async read(name: string, maxBytes: number): Promise<Buffer> {
    return this.#action('read', name, false, async () => {
      const file = await this.#open(name, false);
      try {
        const size = (await file.stat()).size;
        if (!Number.isSafeInteger(size) || size > maxBytes) throw failure();
        const output = Buffer.alloc(size); let offset = 0;
        while (offset < size) {
          const read = await file.read(output, offset, Math.min(size - offset, 65_536), offset);
          if (!read.bytesRead) throw failure(); offset += read.bytesRead;
        }
        await this.#checkFile(name, file);
        if ((await file.stat()).size !== size) throw failure();
        return output;
      } finally { await this.#release(file); }
    });
  }
  async write(name: string, bytes: Uint8Array, mode: 'create' | 'replace' | 'append', position = 0): Promise<void> {
    await this.#action('write', name, true, async () => {
      const file = await this.#open(name, mode === 'create');
      try {
        if (mode === 'replace') await file.truncate(0);
        if (mode === 'append' && (await file.stat()).size !== position) throw failure();
        let offset = 0;
        while (offset < bytes.byteLength) {
          await this.#hooks.before?.('write-chunk', name); await this.assertOwned(); await this.#checkFile(name, file);
          const written = this.#hooks.write ? await this.#hooks.write(file, bytes, offset, bytes.byteLength - offset, position + offset) : (await file.write(bytes, offset, bytes.byteLength - offset, position + offset)).bytesWritten;
          if (!Number.isSafeInteger(written) || written < 1 || written > bytes.byteLength - offset) throw failure();
          offset += written; await this.#hooks.after?.('write-chunk', name);
        }
        await this.#checkFile(name, file);
        await this.#hooks.before?.('file-sync', name); await this.assertOwned(); await this.#checkFile(name, file); await file.sync(); await this.#hooks.after?.('file-sync', name);
        await this.#checkFile(name, file);
      } finally { await this.#release(file); }
    });
  }
  async rename(from: string, to: string): Promise<void> {
    await this.#action('rename', from + '->' + to, true, async () => {
      const source = await this.#open(from, false);
      try {
        if (await this.exists(to)) { const target = await this.#open(to, false); await this.#release(target); }
        await this.#checkFile(from, source); await rename(this.#path(from), this.#path(to)); await this.#checkFile(to, source);
      } finally { await this.#release(source); }
    });
  }
  async truncate(name: string, size: number): Promise<void> {
    await this.#action('truncate', name, true, async () => {
      const file = await this.#open(name, false);
      try { if (size > (await file.stat()).size) throw failure(); await file.truncate(size); await file.sync(); await this.#checkFile(name, file); }
      finally { await this.#release(file); }
    });
  }
  async unlink(name: string): Promise<void> {
    await this.#action('unlink', name, true, async () => {
      const file = await this.#open(name, false);
      try { await this.#checkFile(name, file); await unlink(this.#path(name)); }
      finally { await this.#release(file); }
    });
  }
  async bootstrap(): Promise<{ queueId: string; header: SegmentHeader }> {
    const names = await this.list('queue'); const segments = await this.list('segments');
    let queueId: string;
    if (!names.includes('format.json')) {
      if (names.some(n => n !== 'segments') || segments.length) throw failure();
      queueId = randomUUID();
      await this.write('format.json', Buffer.from(snapshotJson({ formatVersion: 1, queueId }, 512).text + '\n'), 'create');
      await this.syncDirectory('queue');
    } else {
      const text = (await this.read('format.json', 512)).toString('utf8');
      try {
        const value = JSON.parse(text) as { formatVersion: number; queueId: string };
        if (snapshotJson(value, 512).text + '\n' !== text || Object.keys(value).length !== 2 || value.formatVersion !== 1 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.queueId)) throw failure();
        queueId = value.queueId;
      } catch { throw failure(); }
    }
    const header: SegmentHeader = { formatVersion: 1, recordType: 'segment', queueId, segmentId: INITIAL_SEGMENT, firstSequence: '1' };
    if (!segments.length && !names.includes('checkpoint.json')) {
      await this.write('segments/' + segmentName(INITIAL_SEGMENT), encodeFrame(header, 512), 'create');
      await this.syncDirectory('segments');
    } else if (!names.includes('checkpoint.json')) {
      if (segments.length !== 1 || segments[0] !== segmentName(INITIAL_SEGMENT)) throw failure();
      const line = await this.read('segments/' + segments[0], 512);
      const existing = decodeFrame(line, 512).body;
      if (snapshotJson(existing, 512).text !== snapshotJson(header, 512).text) throw failure();
    }
    return { queueId, header };
  }
  /** Allowed even after an uncertain operation; never releases the S1 owner. */
  async close(): Promise<void> {
    this.#closed = true;
    let failed = false;
    for (const file of [...this.#files].reverse()) { try { await this.#release(file); } catch { failed = true; } }
    if (failed) throw failure();
    this.#directories.clear();
  }
}
