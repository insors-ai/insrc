import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';
import { createWriteStream, constants } from 'node:fs';
import { mkdir, open, lstat, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { InstallerError } from './contracts.js';
import { assertRelativeFile } from './location.js';
import { BUNDLE_LIMITS, digest, parseInventory } from './release-descriptor.js';
import type { PayloadInventory, ReleaseDescriptor } from './release-descriptor.js';
import { closeOwnedFile } from './owned-file.js';
export type ExtractionLimits = typeof BUNDLE_LIMITS extends infer T ? { [K in keyof T]: number } : never;
const unsafe = (message: string): InstallerError => new InstallerError('archive-unsafe', message);
export async function readBoundedFile(path: string, limit: number): Promise<Buffer> {
  const initial = await lstat(path);
  if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1 || initial.size > limit) throw unsafe('Unsafe or oversized record');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await file.stat(); if (!stat.isFile() || stat.size > limit) throw unsafe('Unsafe record');
    const bytes = Buffer.alloc(stat.size + 1); let count = 0;
    while (count < bytes.length) { const result = await file.read(bytes, count, bytes.length - count, null); if (!result.bytesRead) break; count += result.bytesRead; }
    if (count > stat.size) throw unsafe('Record grew during read'); return bytes.subarray(0, count);
  } finally { await closeOwnedFile(file); }
}
export async function extractSafeZip(archive: string, destination: string, descriptor: ReleaseDescriptor, options: { signal?: AbortSignal | undefined; limits?: Partial<ExtractionLimits> | undefined } = {}): Promise<PayloadInventory> {
  const limits = { ...BUNDLE_LIMITS, ...options.limits };
  if (Object.values(limits).some(n => !Number.isSafeInteger(n) || n <= 0) || Object.entries(limits).some(([key, n]) => n > BUNDLE_LIMITS[key as keyof typeof BUNDLE_LIMITS])) throw unsafe('Extraction limits may only be tightened');
  const abort = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, abort.signal]) : abort.signal;
  signal.throwIfAborted();
  const zip = await new Promise<ZipFile>((resolve, reject) => yauzl.open(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true, autoClose: false }, (error, value) => error ? reject(error) : resolve(value!)));
  let failure: unknown, pending: { resolve: (entry: Entry | null) => void; reject: (error: unknown) => void } | undefined;
  const closed = new Promise<void>(resolve => zip.once('close', resolve));
  const fail = (error: unknown): void => { failure = error; abort.abort(error); pending?.reject(error); pending = undefined; };
  zip.on('error', fail);
  zip.on('entry', (entry: Entry) => { const receiver = pending; pending = undefined; receiver?.resolve(entry); });
  zip.on('end', () => { const receiver = pending; pending = undefined; receiver?.resolve(null); });
  const cancel = () => fail(new InstallerError('cancelled', 'Bundle extraction cancelled'));
  options.signal?.addEventListener('abort', cancel, { once: true });
  const components = new Map<string, { path: string; directory: boolean }>();
  const extracted = new Map<string, { bytes: number; sha256: string; mode: number }>(), seen = new Set<string>(); let total = 0, count = 0;
  try {
    if (zip.entryCount > limits.entries) throw unsafe('Archive entry count exceeds bound');
    while (true) {
      signal.throwIfAborted(); if (failure) throw failure;
      const entry = await new Promise<Entry | null>((resolve, reject) => { pending = { resolve, reject }; zip.readEntry(); });
      if (!entry) break;
      if (++count > limits.entries || (entry.generalPurposeBitFlag & 0x41) !== 0 || ![0, 8].includes(entry.compressionMethod)) throw unsafe('Encrypted, unsupported or excessive entries');
      const directory = entry.fileName.endsWith('/'), name = directory ? entry.fileName.slice(0, -1) : entry.fileName;
      try { assertRelativeFile(name); } catch { throw unsafe('Unsafe ZIP path'); }
      const utf8 = (entry.generalPurposeBitFlag & 0x800) !== 0;
      if ((utf8 && (!Buffer.from(entry.fileName, 'utf8').equals(entry.fileNameRaw))) || (!utf8 && (entry.fileNameRaw.some(byte => byte > 127) || entry.fileNameRaw.toString('ascii') !== entry.fileName))) throw unsafe('Ambiguous ZIP filename encoding');
      const parts = name.split('/');
      if (parts.length > 64) throw unsafe('ZIP path depth exceeds bound');
      for (let index = 0; index < parts.length; index++) {
        const prefix = parts.slice(0, index + 1).join('/'), folded = prefix.normalize('NFC').toLowerCase(), isDirectory = index < parts.length - 1 || directory;
        const previous = components.get(folded);
        if (previous && (previous.path !== prefix || previous.directory !== isDirectory)) throw unsafe('Aliasing or conflicting ZIP path component');
        components.set(folded, { path: prefix, directory: isDirectory });
        if (components.size > limits.entries * 2) throw unsafe('ZIP filesystem entry count exceeds bound');
      }
      if (name === '.release.json') throw unsafe('Reserved receipt path');
      const key = name.normalize('NFC').toLowerCase();
      if (seen.has(key)) throw unsafe('Duplicate or case-colliding ZIP path'); seen.add(key);
      const mode = entry.externalFileAttributes >>> 16, kind = mode & 0o170000;
      if ((mode & 0o7000) || (entry.externalFileAttributes & 0x400)) throw unsafe('Special ZIP attributes');
      if (kind !== 0 && kind !== (directory ? 0o040000 : 0o100000)) throw unsafe('Symlink or special ZIP entry');
      if (!directory && (entry.externalFileAttributes & 0x10)) throw unsafe('Directory attribute on file entry');
      if (![entry.uncompressedSize, entry.compressedSize].every(n => Number.isSafeInteger(n) && n >= 0)
        || entry.uncompressedSize > (name === 'inventory.json' ? limits.inventoryBytes : limits.entryBytes)
        || entry.uncompressedSize / Math.max(1, entry.compressedSize) > limits.ratio
        || total + entry.uncompressedSize > limits.expanded) throw unsafe('ZIP size or expansion ratio exceeds bound');
      const path = join(destination, name);
      if (directory) {
        if (entry.uncompressedSize !== 0) throw unsafe('Directory entry contains bytes');
        await mkdir(path, { recursive: true, mode: 0o700 }); continue;
      }
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const input = await new Promise<NodeJS.ReadableStream>((resolve, reject) => zip.openReadStream(entry, (error, value) => error ? reject(error) : resolve(value!)));
      const hash = createHash('sha256'); let bytes = 0;
      const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length; total += chunk.length;
        if (bytes > entry.uncompressedSize || total > limits.expanded) { callback(unsafe('Actual ZIP bytes exceed declared limit')); return; }
        hash.update(chunk); callback(null, chunk);
      } });
      const permissions = (mode & 0o111) ? 0o755 : 0o644;
      await pipeline(input, counter, createWriteStream(path, { flags: 'wx', mode: permissions }), { signal });
      if (bytes !== entry.uncompressedSize) throw unsafe('Truncated ZIP entry');
      const file = await open(path, 'r+'); try { await file.sync(); } finally { await file.close(); }
      extracted.set(name, { bytes, sha256: hash.digest('hex'), mode: permissions });
    }
    const inventoryBytes = await readBoundedFile(join(destination, 'inventory.json'), limits.inventoryBytes);
    if (inventoryBytes.length > limits.inventoryBytes || digest(inventoryBytes) !== descriptor.inventorySha256) throw unsafe('Inventory identity differs');
    const inventory = parseInventory(JSON.parse(inventoryBytes.toString('utf8')) as unknown);
    if (inventory.files.length + 1 !== extracted.size) throw unsafe('Inventory and archive membership differ');
    for (const record of inventory.files) {
      const actual = extracted.get(record.path);
      if (!actual || actual.bytes !== record.bytes || actual.sha256 !== record.sha256 || actual.mode !== record.mode) throw unsafe(`Inventory mismatch: ${record.path}`);
    }
    validatePayloadEntries(inventory, descriptor);
    return inventory;
  } finally {
    options.signal?.removeEventListener('abort', cancel); zip.close(); await closed;
  }
}
export function validatePayloadEntries(inventory: PayloadInventory, descriptor: ReleaseDescriptor): void {
  const files = new Map(inventory.files.map(file => [file.path, file]));
  const manifest = descriptor.manifest;
  for (const path of [manifest.daemonEntry, manifest.managerEntry, manifest.tuiEntry, `tools/node/${manifest.runtime.relativeExecutable}`, ...manifest.migrations.map(hook => hook.module)]) if (!files.has(path)) throw unsafe(`Payload entrypoint absent: ${path}`);
  if (manifest.target.os !== 'win32' && files.get(`tools/node/${manifest.runtime.relativeExecutable}`)?.mode !== 0o755) throw unsafe('Private runtime is not executable');
  for (const [name, asset] of [['bootstrap.mjs', descriptor.bootstrap], ['native/control.node', descriptor.native]] as const) { const file = files.get(name); if (!file || file.sha256 !== asset.sha256 || file.bytes !== asset.bytes) throw unsafe('Control asset identity differs from inventory'); }
  const archive = files.get(descriptor.runtimeArchive.path);
  if (!archive || archive.sha256 !== descriptor.runtimeArchive.sha256 || archive.bytes !== descriptor.runtimeArchive.bytes) throw unsafe('Runtime archive identity differs from inventory');
}
/** Existing release retry is a full revalidation, never trust a success marker. */
export async function verifyPublishedPayload(directory: string, descriptor: ReleaseDescriptor, signal?: AbortSignal): Promise<PayloadInventory> {
  const root = await lstat(directory); if (!root.isDirectory() || root.isSymbolicLink()) throw unsafe('Unsafe immutable release root');
  const inventoryBytes = await readBoundedFile(join(directory, 'inventory.json'), BUNDLE_LIMITS.inventoryBytes);
  if (inventoryBytes.length > BUNDLE_LIMITS.inventoryBytes || digest(inventoryBytes) !== descriptor.inventorySha256) throw unsafe('Immutable inventory differs');
  const inventory = parseInventory(JSON.parse(inventoryBytes.toString('utf8')) as unknown);
  await verifyPayloadInventory(directory, inventory, { receipt: '.release.json', signal });
  validatePayloadEntries(inventory, descriptor); return inventory;
}
/** Shared complete tree verification; receipt mode is explicit and never inferred. */
export async function verifyPayloadInventory(directory: string, input: PayloadInventory, options: { receipt: '.release.json' | '.dev-release.json'; signal?: AbortSignal | undefined }): Promise<void> {
  const inventory = parseInventory(input), { signal } = options;
  const root = await lstat(directory); if (!root.isDirectory() || root.isSymbolicLink()) throw unsafe('Unsafe payload root');
  const expected = new Map(inventory.files.map(file => [file.path, file]));
  if (expected.has('.dev-release.json')) throw unsafe('Inventory cannot include a receipt');
  const components = new Map<string, string>();
  let count = 0;
  async function visit(path: string, prefix = ''): Promise<void> {
    for (const name of await readdir(path)) {
      signal?.throwIfAborted();
      const relative = prefix ? `${prefix}/${name}` : name, file = join(path, name), stat = await lstat(file);
      assertRelativeFile(relative);
      const folded = relative.normalize('NFC').toLowerCase(), prior = components.get(folded);
      if (prior !== undefined && prior !== relative) throw unsafe('Payload path components collide');
      components.set(folded, relative);
      if (++count > BUNDLE_LIMITS.entries * 2 + 1) throw unsafe('Immutable payload has excessive entries');
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink !== 1)) throw unsafe('Immutable payload has special entries');
      if (stat.isDirectory()) { await visit(file, relative); continue; }
      if (relative === 'inventory.json' || relative === options.receipt) continue;
      const record = expected.get(relative);
      if (!record || stat.size !== record.bytes || (process.platform !== 'win32' && ((stat.mode & 0o111) ? 0o755 : 0o644) !== record.mode)) throw unsafe('Immutable payload membership differs');
      const { createReadStream } = await import('node:fs'); const hash = createHash('sha256'); let bytes = 0;
      for await (const chunk of createReadStream(file)) { signal?.throwIfAborted(); const data = chunk as Buffer; bytes += data.length; if (bytes > record.bytes) throw unsafe('Immutable payload grew'); hash.update(data); }
      if (bytes !== record.bytes || hash.digest('hex') !== record.sha256) throw unsafe('Immutable payload digest differs');
      expected.delete(relative);
    }
  }
  await visit(directory); if (expected.size) throw unsafe('Immutable payload file missing');
}
