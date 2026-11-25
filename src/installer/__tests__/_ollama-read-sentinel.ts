import assert from 'node:assert/strict';
import fs from 'node:fs';
import io from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPENDENCY_INVENTORY_LIMIT, DEPENDENCY_RECORD_LIMIT } from '../ollama-records.js';

interface Info { file: string; name: string; metadata: boolean; maximum: number; bytes: number }
type ReadEvent = { file: string; bytes: number; api: string };
/** Test-local boundary for descriptors opened during observation. Pre-existing
 * foreign descriptors are outside this fixture's ownership. */
export function observeOllamaReads(root: string, beforeOpen?: (file: string) => Promise<void>) {
  const original = { open: io.open, readFile: io.readFile, openSync: fs.openSync, openCallback: fs.open,
    read: fs.read, readSync: fs.readSync, readv: fs.readv, readvSync: fs.readvSync, readFileCallback: fs.readFile,
    readFileSync: fs.readFileSync, createReadStream: fs.createReadStream, close: fs.close, closeSync: fs.closeSync };
  const reads: ReadEvent[] = [], metadataReads: ReadEvent[] = [], descriptors = new Map<number, Info>(), finishes = new Map<number, () => void>(), active = new Set<Promise<void>>();
  const infoFor = (input: unknown): Info | undefined => {
    if (typeof input === 'number') return descriptors.get(input);
    if (input && typeof input === 'object' && 'fd' in input && typeof input.fd === 'number') return descriptors.get(input.fd);
    const file = input instanceof URL ? fileURLToPath(input) : typeof input === 'string' ? resolve(input) : Buffer.isBuffer(input) ? resolve(input.toString()) : '';
    const name = file ? relative(root, file).replaceAll('\\', '/') : '';
    if (!name || name === '..' || name.startsWith('../')) return undefined;
    const metadata = ['inventory.json', '.ollama-receipt.json'].includes(name);
    return { file, name, metadata, maximum: name === 'inventory.json' ? DEPENDENCY_INVENTORY_LIMIT : metadata ? DEPENDENCY_RECORD_LIMIT : 8192, bytes: 0 };
  };
  const begin = () => { let done!: () => void; const promise = new Promise<void>(resolve => { done = resolve; }); active.add(promise); return () => { active.delete(promise); done(); }; };
  const completed = (fd: number) => { descriptors.delete(fd); finishes.get(fd)?.(); finishes.delete(fd); };
  const attach = (fd: number, info: Info, finish = begin()) => { descriptors.set(fd, info); finishes.set(fd, finish); };
  const header = (info: Info) => /ollama(?:\.exe)?$|\.(?:dll|dylib)$|\.so(?:\.[0-9.]+)?$/i.test(basename(info.name))
    || /(?:^|\/)([^/]+)\.framework\/(?:Versions\/[^/]+\/)?\1$/.test(info.name);
  const allowed = (info: Info | undefined, count: unknown) => {
    if (!info) return;
    assert.ok(typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 && count <= (info.metadata ? info.maximum + 1 : 4096), `full installed-file read: ${info.name}`);
    assert.ok(info.metadata || header(info), `unexpected content read: ${info.name}`);
  };
  const record = (info: Info | undefined, count: number, api: string) => {
    if (!info) return; info.bytes += count; assert.ok(info.bytes <= info.maximum, `unbounded ${info.metadata ? 'metadata' : 'header'} read: ${info.name}`);
    (info.metadata ? metadataReads : reads).push({ file: info.name, bytes: count, api });
  };
  const requested = (args: unknown[]) => {
    const first = args[0] as { buffer?: ArrayBufferView; length?: number; offset?: number } | undefined;
    if (ArrayBuffer.isView(first)) {
      const options = args[1] && typeof args[1] === 'object' ? args[1] as { length?: number; offset?: number } : undefined;
      return options ? options.length ?? first.byteLength - (options.offset ?? 0) : args[2] ?? first.byteLength - (typeof args[1] === 'number' ? args[1] : 0);
    }
    return first?.length ?? (first?.buffer ? first.buffer.byteLength - (first.offset ?? 0) : undefined);
  };
  const whole = (info: Info | undefined) => {
    if (!info) return; assert.ok(info.metadata, `whole installed-file read: ${info.name}`);
    const stat = fs.lstatSync(info.file); assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size <= info.maximum, `unbounded metadata read: ${info.name}`);
  };
  const checkStream = (info: Info | undefined, options?: { start?: number; end?: number }) => {
    if (!info) return; if (info.metadata) { whole(info); return; }
    const start = options?.start ?? 0, end = options?.end;
    assert.ok(Number.isSafeInteger(start) && start >= 0 && typeof end === 'number' && end >= start, `unbounded installed stream: ${info.name}`); allowed(info, end! - start + 1);
  };
  const watchStream = (stream: Readable, info: Info | undefined) => {
    if (info) stream.on('data', chunk => { try { record(info, Buffer.byteLength(chunk), 'stream'); } catch (error) { stream.destroy(error as Error); } });
    return stream;
  };
  const wrapHandle = (handle: FileHandle, info: Info, finish: () => void) => {
    attach(handle.fd, info, finish); const fd = handle.fd; handle.once('close', () => completed(fd));
    const read = handle.read, readv = handle.readv, readFile = handle.readFile, close = handle.close, stream = handle.createReadStream;
    handle.read = (async (...args: unknown[]) => { allowed(info, requested(args)); const result = await Reflect.apply(read, handle, args); record(info, result.bytesRead, 'handle.read'); return result; }) as typeof read;
    handle.readv = (async (...args: Parameters<typeof readv>) => { allowed(info, args[0].reduce((n, buffer) => n + buffer.byteLength, 0)); const result = await readv.apply(handle, args); record(info, result.bytesRead, 'handle.readv'); return result; }) as typeof readv;
    handle.readFile = (async (...args: unknown[]) => { whole(info); const result = await Reflect.apply(readFile, handle, args); record(info, Buffer.byteLength(result), 'handle.readFile'); return result; }) as typeof readFile;
    handle.createReadStream = ((options) => { checkStream(info, options); return watchStream(stream.call(handle, options), info); }) as typeof stream;
    handle.readableWebStream = (() => { throw new Error(`unbounded installed web stream: ${info.name}`); }) as typeof handle.readableWebStream;
    handle.readLines = (() => { throw new Error(`unbounded installed line stream: ${info.name}`); }) as typeof handle.readLines;
    handle.close = async () => { await close.call(handle); completed(fd); }; return handle;
  };
  io.open = (async (...args: Parameters<typeof io.open>) => {
    const info = infoFor(args[0]), finish = info ? begin() : undefined;
    try { if (beforeOpen) await beforeOpen(info?.file ?? (typeof args[0] === 'string' ? resolve(args[0]) : '')); const handle = await original.open(...args); return info ? wrapHandle(handle, info, finish!) : handle; }
    catch (error) { finish?.(); throw error; }
  }) as typeof io.open;
  io.readFile = (async (...args: unknown[]) => { const info = infoFor(args[0]); whole(info); const result = await Reflect.apply(original.readFile, io, args); record(info, Buffer.byteLength(result), 'promises.readFile'); return result; }) as typeof io.readFile;
  fs.openSync = ((...args: Parameters<typeof fs.openSync>) => { const info = infoFor(args[0]), fd = original.openSync(...args); if (info) attach(fd, info); return fd; }) as typeof fs.openSync;
  fs.open = ((...args: unknown[]) => { const info = infoFor(args[0]), callback = args.at(-1) as (error: unknown, fd: number) => void;
    args[args.length - 1] = (error: unknown, fd: number) => { if (!error && info) attach(fd, info); callback(error, fd); }; return Reflect.apply(original.openCallback, fs, args);
  }) as typeof fs.open;
  fs.readSync = ((fd: number, ...args: unknown[]) => { const info = descriptors.get(fd); allowed(info, requested(args)); const count = Reflect.apply(original.readSync, fs, [fd, ...args]); record(info, count, 'readSync'); return count; }) as typeof fs.readSync;
  fs.read = ((fd: number, ...args: unknown[]) => { const info = descriptors.get(fd); allowed(info, requested(args)); const callback = args.at(-1) as (...values: unknown[]) => void;
    args[args.length - 1] = (error: unknown, count: number, buffer: unknown) => { if (!error) record(info, count, 'read'); callback(error, count, buffer); }; return Reflect.apply(original.read, fs, [fd, ...args]);
  }) as typeof fs.read;
  fs.readvSync = ((fd, buffers, position) => { const info = descriptors.get(fd); allowed(info, buffers.reduce((n, buffer) => n + buffer.byteLength, 0)); const count = original.readvSync(fd, buffers, position); record(info, count, 'readvSync'); return count; }) as typeof fs.readvSync;
  fs.readv = ((fd: number, buffers: ArrayBufferView[], ...args: unknown[]) => { const info = descriptors.get(fd); allowed(info, buffers.reduce((n, buffer) => n + buffer.byteLength, 0)); const callback = args.at(-1) as (...values: unknown[]) => void;
    args[args.length - 1] = (error: unknown, count: number, result: unknown) => { if (!error) record(info, count, 'readv'); callback(error, count, result); }; return Reflect.apply(original.readv, fs, [fd, buffers, ...args]);
  }) as typeof fs.readv;
  fs.readFileSync = ((...args: unknown[]) => { const info = infoFor(args[0]); whole(info); const result = Reflect.apply(original.readFileSync, fs, args); record(info, Buffer.byteLength(result), 'readFileSync'); return result; }) as typeof fs.readFileSync;
  fs.readFile = ((...args: unknown[]) => { const info = infoFor(args[0]); whole(info); const callback = args.at(-1) as (...values: unknown[]) => void;
    args[args.length - 1] = (error: unknown, value: string | Buffer) => { if (!error) record(info, Buffer.byteLength(value), 'readFile'); callback(error, value); }; return Reflect.apply(original.readFileCallback, fs, args);
  }) as typeof fs.readFile;
  fs.createReadStream = ((file, options) => { const info = infoFor(file) ?? infoFor(options && typeof options === 'object' ? options.fd : undefined); checkStream(info, options as { start?: number; end?: number }); return watchStream(original.createReadStream(file, options), info); }) as typeof fs.createReadStream;
  fs.closeSync = fd => { original.closeSync(fd); completed(fd); };
  fs.close = ((fd, callback) => original.close(fd, error => { if (!error) completed(fd); callback(error); })) as typeof fs.close;
  syncBuiltinESMExports();
  return { reads, metadataReads, async drain() { while (active.size) await Promise.all([...active]); }, restore() {
    io.open = original.open; io.readFile = original.readFile; fs.openSync = original.openSync; fs.open = original.openCallback;
    fs.read = original.read; fs.readSync = original.readSync; fs.readv = original.readv; fs.readvSync = original.readvSync;
    fs.readFile = original.readFileCallback; fs.readFileSync = original.readFileSync; fs.createReadStream = original.createReadStream;
    fs.close = original.close; fs.closeSync = original.closeSync; syncBuiltinESMExports();
  } };
}
