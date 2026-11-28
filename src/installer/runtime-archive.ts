/** Fixed Node distribution profile extraction. Never executes or publishes code. */
import { constants } from 'node:fs';
import { open, lstat, mkdir, readdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { gunzip as gunzipCallback } from 'node:zlib';
import { promisify } from 'node:util';
import yauzl from 'yauzl';
import type { Entry } from 'yauzl';
import type { Readable } from 'node:stream';
import { InstallerError } from './contracts.js';
import type { RuntimeIdentity, Target } from './contracts.js';
import { assertRelativeFile } from './location.js';
import { closeOwnedFile } from './owned-file.js';
import { controlBinding } from './native.js';
import { TarBytes, tarField, tarNumeric, tarMemberName, tarPax } from './tar-primitives.js';
import { runtimeArchive, runtimePolicy, runtimeProfile } from './runtime-policy.js';
import { RUNTIME_LIMITS, RUNTIME_PROFILE_VERSION, runtimeCompletionJson, runtimeInventoryJson } from './runtime-metadata.js';
import { operationTimeBudgets } from './operation-time-budgets.mjs';
import type { RuntimeAsset, RuntimeInventoryFile } from './runtime-metadata.js';
import { verifyRuntimeInventory } from './runtime-store.js';

const unsafe = (message: string) => new InstallerError('archive-unsafe', message);
const gunzip = promisify(gunzipCallback);
export interface RuntimeArchiveSources { archive: string; headers?: string | undefined; library?: string | undefined }
function included(path: string, windows: boolean, headers: boolean): boolean {
  return headers ? path.startsWith('include/node/') : path === (windows ? 'node.exe' : 'bin/node') || path === 'LICENSE'
    || path.startsWith(windows ? 'node_modules/npm/' : 'lib/node_modules/npm/') || (!windows && path.startsWith('include/node/'));
}
/** Reads the exact digest-verified bytes that the parser will consume. */
async function verifiedBytes(path: string, asset: RuntimeAsset, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted();
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size !== asset.bytes || info.size > RUNTIME_LIMITS.compressedBytes) throw unsafe('Unexpected runtime archive file');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await file.stat(); if (before.ino !== info.ino || before.dev !== info.dev || before.size !== info.size) throw unsafe('Runtime archive changed');
    const bytes = Buffer.alloc(info.size), hash = createHash('sha256'); let offset = 0;
    while (offset < bytes.length) {
      signal.throwIfAborted(); const result = await file.read(bytes, offset, Math.min(65536, bytes.length - offset), null); if (!result.bytesRead) throw unsafe('Truncated runtime archive');
      hash.update(bytes.subarray(offset, offset + result.bytesRead)); offset += result.bytesRead;
    }
    signal.throwIfAborted(); const after = await file.stat();
    if (hash.digest('hex') !== asset.sha256 || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw unsafe('Runtime archive digest or identity differs');
    return bytes;
  } finally { await closeOwnedFile(file); }
}
class ProfileWriter {
  readonly files: RuntimeInventoryFile[] = [];
  readonly components = new Map<string, { name: string; directory: boolean }>();
  readonly seen = new Set<string>(); expanded = 0;
  constructor(readonly directory: string, readonly signal: AbortSignal) {}
  register(name: string, directory: boolean): void {
    assertRelativeFile(name); const parts = name.split('/'); if (parts.length > 64) throw unsafe('Runtime archive path depth');
    if (this.seen.has(name.normalize('NFC').toLowerCase())) throw unsafe('Duplicate runtime archive path'); this.seen.add(name.normalize('NFC').toLowerCase());
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.slice(0, i + 1).join('/'), key = prefix.normalize('NFC').toLowerCase(), isDirectory = i < parts.length - 1 || directory;
      const prior = this.components.get(key);
      if (prior && (prior.name !== prefix || prior.directory !== isDirectory)) throw unsafe('Aliasing runtime archive component');
      this.components.set(key, { name: prefix, directory: isDirectory });
      if (this.components.size > RUNTIME_LIMITS.entries * 2) throw unsafe('Runtime path component bound');
    }
  }
  async file(name: string, size: number, mode: number, source: AsyncIterable<Buffer>): Promise<void> {
    if (!Number.isSafeInteger(size) || size < 0 || size > RUNTIME_LIMITS.entryBytes || this.expanded + size > RUNTIME_LIMITS.expandedBytes || this.files.length >= RUNTIME_LIMITS.entries) throw unsafe('Runtime file bound');
    this.expanded += size; this.signal.throwIfAborted();
    const path = join(this.directory, name); let parent = this.directory;
    for (const part of name.split('/').slice(0, -1)) {
      parent = join(parent, part); try { await mkdir(parent, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const stat = await lstat(parent); if (!stat.isDirectory() || stat.isSymbolicLink()) throw unsafe('Linked runtime output parent');
    }
    let output: FileHandle | undefined;
    try {
      output = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      const hash = createHash('sha256'); let bytes = 0;
      for await (const chunk of source) {
        this.signal.throwIfAborted(); bytes += chunk.length; if (bytes > size) throw unsafe('Runtime entry grew'); hash.update(chunk); let offset = 0;
        while (offset < chunk.length) { this.signal.throwIfAborted(); const result = await output.write(chunk, offset, chunk.length - offset); if (!result.bytesWritten) throw unsafe('Short runtime write'); offset += result.bytesWritten; }
      }
      if (bytes !== size) throw unsafe('Truncated runtime entry');
      await output.chmod(mode); await output.sync();
      this.files.push({ path: name, bytes, mode, sha256: hash.digest('hex') });
    } finally { await closeOwnedFile(output); }
  }
}
/** Gzip decoding is bounded and awaited to completion before cleanup on abort.
 * No target bytes are executed and no unbounded decoder actor is abandoned. */
async function tarProfile(bytes: Buffer, archiveRoot: string, writer: ProfileWriter, headers = false): Promise<void> {
  writer.signal.throwIfAborted();
  const decoded = await gunzip(bytes, { maxOutputLength: RUNTIME_LIMITS.expandedBytes }); writer.signal.throwIfAborted();
  async function* chunks() { yield decoded; }
  const reader = new TarBytes(chunks(), writer.signal);
  let entries = 0, declared = 0, zeros = 0, controls = 0, metadata = 0, pending: Record<string, string> = {}, longName: string | undefined;
  while (true) {
    const header = await reader.take(512, true); if (!header) break;
    if (header.every(b => b === 0)) { zeros++; continue; }
    if (zeros || ++entries > RUNTIME_LIMITS.entries) throw unsafe('Runtime tar terminator or entry bound');
    let checksum = 0; for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i]!;
    if (checksum !== tarNumeric(header, 148, 8)) throw unsafe('Runtime tar checksum differs');
    const magic = tarField(header, 257, 6); if (magic && magic !== 'ustar' && magic !== 'ustar ') throw unsafe('Runtime tar format');
    const type = String.fromCharCode(header[156] || 48), control = ['x', 'g', 'L', 'K'].includes(type), mode = tarNumeric(header, 100, 8);
    const sizeField = tarNumeric(header, 124, 12); let size = sizeField;
    if (!control && pending['size'] !== undefined) { if (!/^(?:0|[1-9][0-9]*)$/.test(pending['size'])) throw unsafe('Runtime PAX size'); size = Number(pending['size']); }
    if (!Number.isSafeInteger(size) || size > (control ? 65536 : RUNTIME_LIMITS.entryBytes) || (declared += size) > RUNTIME_LIMITS.expandedBytes) throw unsafe('Runtime tar size bound');
    if (control) {
      if (++controls > 16 || (metadata += size) > 65536) throw unsafe('Runtime tar metadata bound');
      const data = (await reader.take(size))!;
      if (type === 'x') pending = { ...pending, ...tarPax(data) };
      else if (type === 'g') { const global = tarPax(data); if (['path', 'linkpath', 'size'].some(k => global[k] !== undefined)) throw unsafe('Structural global PAX'); }
      else if (type === 'L') longName = tarField(data, 0, data.length);
      else pending['linkpath'] = tarField(data, 0, data.length);
    } else {
      metadata = 0; controls = 0;
      const directory = type === '5', prefix = magic === 'ustar' ? tarField(header, 345, 155) : '';
      const name = tarMemberName(pending['path'] ?? longName ?? (prefix ? `${prefix}/` : '') + tarField(header, 0, 100), directory);
      pending = {}; longName = undefined;
      if (!['0', '1', '2', '5'].includes(type) || (mode & 0o7000) || (type !== '0' && size)) throw unsafe('Special runtime tar member');
      if (name !== archiveRoot && !name.startsWith(archiveRoot + '/')) throw unsafe('Runtime archive root differs');
      if (name) writer.register(name, directory);
      const path = name.slice(archiveRoot.length + 1), select = name !== archiveRoot && included(path, false, headers);
      if (select && !directory && type !== '0') throw unsafe('Runtime profile links forbidden');
      async function* body() { let remaining = size; while (remaining) { const chunk = (await reader.take(Math.min(65536, remaining)))!; remaining -= chunk.length; yield chunk; } }
      if (select && type === '0') await writer.file(path, size, mode & 0o111 ? 0o755 : 0o644, body());
      else for await (const _ of body()) { /* Drain unselected official members without writing them. */ }
    }
    const padding = (512 - size % 512) % 512; if (padding && (await reader.take(padding))!.some(b => b !== 0)) throw unsafe('Runtime tar padding');
  }
  if (zeros < 2 || Object.keys(pending).length || longName !== undefined) throw unsafe('Incomplete runtime tar');
}
async function zipProfile(bytes: Buffer, archiveRoot: string, writer: ProfileWriter): Promise<void> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true, autoClose: false }, (error, value) => error ? reject(error) : resolve(value!)));
  let pending: { resolve: (entry: Entry | null) => void; reject: (error: unknown) => void } | undefined, current: Readable | undefined, failure: unknown;
  const fail = (error: unknown) => { failure = error; pending?.reject(error); pending = undefined; };
  zip.on('error', fail); zip.on('entry', entry => { const receiver = pending; pending = undefined; receiver?.resolve(entry); }); zip.on('end', () => { const receiver = pending; pending = undefined; receiver?.resolve(null); });
  const cancel = () => { current?.destroy(); fail(writer.signal.reason); }; writer.signal.addEventListener('abort', cancel, { once: true });
  try {
    if (zip.entryCount > RUNTIME_LIMITS.entries) throw unsafe('Runtime ZIP entry bound');
    while (true) {
      writer.signal.throwIfAborted(); if (failure) throw failure;
      const entry = await new Promise<Entry | null>((resolve, reject) => { pending = { resolve, reject }; zip.readEntry(); }); if (!entry) break;
      const directory = entry.fileName.endsWith('/'), name = directory ? entry.fileName.slice(0, -1) : entry.fileName;
      if ((entry.generalPurposeBitFlag & 0x41) || ![0, 8].includes(entry.compressionMethod) || !Number.isSafeInteger(entry.uncompressedSize)
        || entry.uncompressedSize > RUNTIME_LIMITS.entryBytes || entry.uncompressedSize / Math.max(1, entry.compressedSize) > 2000) throw unsafe('Unsupported runtime ZIP member');
      const mode = entry.externalFileAttributes >>> 16, kind = mode & 0o170000;
      if ((mode & 0o7000) || (entry.externalFileAttributes & 0x400) || (kind && kind !== (directory ? 0o040000 : 0o100000))
        || (directory && entry.uncompressedSize !== 0) || (!directory && (entry.externalFileAttributes & 0x10))) throw unsafe('Runtime ZIP link or special attributes');
      const utf8 = (entry.generalPurposeBitFlag & 0x800) !== 0;
      if (utf8 ? !Buffer.from(entry.fileName, 'utf8').equals(entry.fileNameRaw)
        : entry.fileNameRaw.some(byte => byte > 127) || entry.fileNameRaw.toString('ascii') !== entry.fileName) throw unsafe('Ambiguous runtime ZIP encoding');
      if (name !== archiveRoot && !name.startsWith(archiveRoot + '/')) throw unsafe('Runtime ZIP root differs');
      writer.register(name, directory); const path = name.slice(archiveRoot.length + 1);
      if (directory || !included(path, true, false)) continue;
      current = await new Promise<Readable>((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream!)));
      try { await writer.file(path, entry.uncompressedSize, path === 'node.exe' ? 0o755 : 0o644, current); }
      finally { await closeMemoryEntry(current); current = undefined; }
    }
  } finally {
    writer.signal.removeEventListener('abort', cancel);
    if (current) await closeMemoryEntry(current);
    // fromBuffer owns no fd and never emits close (yauzl's documented contract).
    // Entry decoder streams are positively closed above; stop further admission.
    zip.close();
  }
}
async function closeMemoryEntry(stream: Readable): Promise<void> {
  if (stream.closed) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  stream.on('error', () => {});
  const closed = new Promise<void>(resolve => stream.once('close', resolve)); stream.destroy();
  try { await Promise.race([closed, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new InstallerError('resource-close-uncertain', 'Runtime ZIP entry decoder closure is uncertain')), operationTimeBudgets().runtime.resourceDrainMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}
async function metadata(path: string, bytes: string): Promise<void> {
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await closeOwnedFile(file); }
}
async function privateDirectory(root: string, empty: boolean): Promise<void> {
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || (empty && (await readdir(root)).length)) throw unsafe('Expected owned runtime stage');
  let parent = root; while (true) { const stat = await lstat(parent); if (!stat.isDirectory() || stat.isSymbolicLink()) throw unsafe('Linked runtime stage ancestor'); const next = dirname(parent); if (next === parent) break; parent = next; }
  if (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077))) throw unsafe('Runtime stage is not private');
  if (process.platform === 'win32' && !controlBinding().safePath(root, true, true)) throw unsafe('Runtime stage ACL is not private');
}
/** Internal parser boundary. Output is not an authenticity/publication proof:
 * stageRuntime supplies authenticated bytes and later checks the independent inventory pin. */
export async function extractRuntimeArchiveBytes(bytes: Buffer, distribution: string, target: Target, signal: AbortSignal,
  headers = false): Promise<RuntimeInventoryFile[]> {
  signal.throwIfAborted(); await privateDirectory(distribution, false);
  if (bytes.length > RUNTIME_LIMITS.compressedBytes) throw unsafe('Runtime compressed bound');
  const writer = new ProfileWriter(distribution, signal), archive = runtimeArchive(target);
  if (target.os === 'win32' && !headers) await zipProfile(bytes, archive.root, writer);
  else await tarProfile(bytes, headers ? `node-v${runtimePolicy.nodeVersion}` : archive.root, writer, headers);
  return writer.files;
}
/** Internal staging operation: caller owns an empty private root, not a release.
 * These filenames are not accepted on manager/IDE wire requests. */
export async function extractRuntimeProfile(sources: RuntimeArchiveSources, root: string, identity: RuntimeIdentity, signal: AbortSignal): Promise<void> {
  await privateDirectory(root, true);
  const target = identity.target, archive = runtimeArchive(target), profile = runtimeProfile(target);
  if (identity.sha256 !== archive.sha256 || identity.version !== runtimePolicy.nodeVersion || identity.relativeExecutable !== (target.os === 'win32' ? 'node.exe' : 'bin/node')) throw unsafe('Runtime stage identity differs');
  const bytes = await verifiedBytes(sources.archive, { ...archive, bytes: profile.archiveBytes }, signal);
  const distribution = join(root, 'distribution'); await mkdir(distribution, { mode: 0o700 }); const files: RuntimeInventoryFile[] = [];
  if (target.os === 'win32') {
    if (!sources.headers || !sources.library) throw unsafe('Runtime headers and architecture library required');
    files.push(...await extractRuntimeArchiveBytes(bytes, distribution, target, signal));
    files.push(...await extractRuntimeArchiveBytes(await verifiedBytes(sources.headers, runtimePolicy.supplemental.headers, signal), distribution, target, signal, true));
    const library = await verifiedBytes(sources.library, runtimePolicy.supplemental.libraries[target.arch], signal);
    const name = `${target.arch}/node.lib`, writer = new ProfileWriter(distribution, signal);
    writer.register(name, false); async function* body() { yield library; } await writer.file(name, library.length, 0o644, body()); files.push(...writer.files);
  } else files.push(...await extractRuntimeArchiveBytes(bytes, distribution, target, signal));
  signal.throwIfAborted(); const inventory = runtimeInventoryJson(files); verifyRuntimeInventory(Buffer.from(inventory), profile);
  await metadata(join(root, 'inventory.json'), inventory);
  await metadata(join(root, 'completion.json'), runtimeCompletionJson({ schemaVersion: 1, identity, profileVersion: RUNTIME_PROFILE_VERSION,
    inventorySha256: profile.inventorySha256, npmVersion: runtimePolicy.npmVersion, headersVersion: runtimePolicy.headersVersion }));
}
