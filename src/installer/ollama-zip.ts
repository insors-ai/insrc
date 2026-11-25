import yauzl from 'yauzl';
import type { Entry, ZipFile, LocalFileHeader } from 'yauzl';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { posix, join, dirname } from 'node:path';
import { crc32, createInflateRaw } from 'node:zlib';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { InstallerError } from './contracts.js';
import { parseOllamaPolicy } from './ollama-policy.js';
import type { OllamaPolicy } from './ollama-policy.js';
import type { OllamaExtracted } from './ollama-tar.js';
import { archiveUnsafe, OllamaArchivePaths, ollamaMemberPath, ollamaParents, privateOllamaDirectory } from './ollama-layout.js';
import { controlBinding } from './native.js';

function localSizes(local: LocalFileHeader): { compressed: number; expanded: number } {
  const fields = new Map<number, Buffer>(); let offset = 0;
  while (offset < local.extraField.length) {
    if (offset + 4 > local.extraField.length) throw archiveUnsafe('Truncated ZIP local extra field');
    const id = local.extraField.readUInt16LE(offset), bytes = local.extraField.readUInt16LE(offset + 2); offset += 4;
    if (offset + bytes > local.extraField.length || fields.has(id)) throw archiveUnsafe('Truncated or duplicate ZIP local extra field');
    fields.set(id, local.extraField.subarray(offset, offset + bytes)); offset += bytes;
  }
  let compressed = local.compressedSize, expanded = local.uncompressedSize;
  if (compressed === 0xffffffff || expanded === 0xffffffff) {
    const data = fields.get(1), expected = (compressed === 0xffffffff ? 8 : 0) + (expanded === 0xffffffff ? 8 : 0);
    if (!data || ![expected, 16].includes(data.length) || local.versionNeededToExtract < 45) throw archiveUnsafe('Missing or invalid ZIP64 local sizes');
    let position = 0;
    const value = () => { const integer = data.readBigUInt64LE(position); position += 8;
      if (integer > BigInt(Number.MAX_SAFE_INTEGER)) throw archiveUnsafe('ZIP64 local size exceeds integer bounds'); return Number(integer); };
    if (data.length === 16) {
      const largeExpanded = value(), largeCompressed = value();
      if ((expanded !== 0xffffffff && expanded !== largeExpanded) || (compressed !== 0xffffffff && compressed !== largeCompressed)) throw archiveUnsafe('Conflicting ZIP64 local sizes');
      expanded = largeExpanded; compressed = largeCompressed;
    } else { if (expanded === 0xffffffff) expanded = value(); if (compressed === 0xffffffff) compressed = value(); }
  } else if (fields.has(1)) throw archiveUnsafe('Ambiguous ZIP64 local sizes without placeholders');
  return { compressed, expanded };
}

/** Separate policy from S1 ZIP limits: no inventory is trusted from the vendor. */
export async function extractOllamaZip(archive: string, destination: string, policyInput: OllamaPolicy,
  signal?: AbortSignal): Promise<OllamaExtracted> {
  const policy = parseOllamaPolicy(policyInput); signal?.throwIfAborted();
  if (policy.asset.format !== 'zip') throw archiveUnsafe('Expected dependency ZIP policy');
  await privateOllamaDirectory(destination, true);
  await privateOllamaDirectory(dirname(archive));
  if (process.platform === 'win32' && !controlBinding().safePath(archive, false, false)) throw archiveUnsafe('Dependency ZIP is a reparse point');
  const source = await open(archive, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await source.stat(), initial = await lstat(archive);
    if (!info.isFile() || info.nlink !== 1 || info.size !== policy.asset.bytes || info.ino !== initial.ino || initial.isSymbolicLink()) throw archiveUnsafe('Unsafe dependency ZIP source');
    const hash = createHash('sha256'), buffer = Buffer.alloc(65536); let bytes = 0;
    while (true) {
      signal?.throwIfAborted(); const part = await source.read(buffer, 0, buffer.length, null); if (!part.bytesRead) break;
      if ((bytes += part.bytesRead) > policy.asset.bytes) throw archiveUnsafe('Dependency ZIP source grew'); hash.update(buffer.subarray(0, part.bytesRead));
    }
    if (bytes !== policy.asset.bytes || hash.digest('hex') !== policy.asset.sha256) throw archiveUnsafe('Dependency ZIP identity differs');
  } finally { await source.close(); }
  const zip = await new Promise<ZipFile>((resolve, reject) => yauzl.open(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true, autoClose: false }, (error, value) => error ? reject(error) : resolve(value!)));
  const closed = new Promise<void>(resolve => zip.once('close', resolve));
  let failure: unknown, pending: { resolve(entry: Entry | null): void; reject(error: unknown): void } | undefined, input: Readable | undefined;
  const fail = (error: Error) => { failure = error; pending?.reject(error); pending = undefined; input?.destroy(error); };
  zip.on('error', fail);
  zip.on('entry', entry => { const receiver = pending; pending = undefined; receiver?.resolve(entry); });
  zip.on('end', () => { const receiver = pending; pending = undefined; receiver?.resolve(null); });
  const cancel = () => fail(new InstallerError('cancelled', 'Dependency ZIP extraction cancelled'));
  signal?.addEventListener('abort', cancel, { once: true });
  const result: OllamaExtracted = { files: [], aliases: [] }, paths = new OllamaArchivePaths(policy.limits.files);
  const entries: Array<{ entry: Entry; name: string; directory: boolean; alias: boolean; mode: number; start: number; end: number }> = [];
  const central = Number(zip.readEntryCursor); let total = 0, metadata = 0;
  try {
    if (zip.entryCount > policy.limits.files) throw archiveUnsafe('Dependency ZIP entry count exceeds policy');
    // Validate the whole directory and each local header before creating files.
    while (true) {
      signal?.throwIfAborted(); if (failure) throw failure;
      const entry = await new Promise<Entry | null>((resolve, reject) => { pending = { resolve, reject }; zip.readEntry(); }); if (!entry) break;
      const directory = entry.fileName.endsWith('/'), name = directory ? entry.fileName.slice(0, -1) : entry.fileName;
      paths.add(name, directory);
      if ((entry.generalPurposeBitFlag & ~0x80e) !== 0 || ![0, 8].includes(entry.compressionMethod)) throw archiveUnsafe('Encrypted or unsupported ZIP encoding');
      const utf8 = !!(entry.generalPurposeBitFlag & 0x800);
      if ((utf8 && !Buffer.from(entry.fileName, 'utf8').equals(entry.fileNameRaw))
        || (!utf8 && (entry.fileNameRaw.some(byte => byte > 127) || entry.fileNameRaw.toString('ascii') !== entry.fileName))) throw archiveUnsafe('Ambiguous dependency ZIP filename');
      const mode = entry.externalFileAttributes >>> 16, kind = mode & 0o170000, alias = kind === 0o120000;
      if ((mode & 0o7000) || (entry.externalFileAttributes & 0x400) || (kind !== 0 && kind !== (directory ? 0o040000 : 0o100000) && !(!directory && alias))
        || (!directory && (entry.externalFileAttributes & 0x10))) throw archiveUnsafe('Special dependency ZIP attributes');
      if (![entry.uncompressedSize, entry.compressedSize].every(n => Number.isSafeInteger(n) && n >= 0)
        || entry.uncompressedSize > (alias ? 1024 : policy.limits.fileBytes) || (directory && (entry.uncompressedSize !== 0 || entry.compressedSize !== 0 || entry.compressionMethod !== 0))
        || (total += entry.uncompressedSize) > policy.limits.expandedBytes) throw archiveUnsafe('Dependency ZIP expansion exceeds policy');
      const local = await zip.readLocalFileHeaderPromise(entry); signal?.throwIfAborted();
      const sizes = localSizes(local), deferred = !!(entry.generalPurposeBitFlag & 8);
      metadata += 76 + entry.fileNameLength + entry.extraFieldLength + entry.fileCommentLength + local.fileNameLength + local.extraFieldLength;
      if (metadata > 16 * 1024 * 1024) throw archiveUnsafe('Dependency ZIP metadata memory exceeds bound');
      if (!local.fileName.equals(entry.fileNameRaw) || local.compressionMethod !== entry.compressionMethod || local.generalPurposeBitFlag !== entry.generalPurposeBitFlag
        || (local.crc32 !== entry.crc32 && !(deferred && local.crc32 === 0))
        || (sizes.compressed !== entry.compressedSize && !(deferred && sizes.compressed === 0))
        || (sizes.expanded !== entry.uncompressedSize && !(deferred && sizes.expanded === 0))) throw archiveUnsafe('Dependency ZIP local/directory headers differ');
      if (entry.relativeOffsetOfLocalHeader < 0 || !Number.isSafeInteger(local.fileDataStart + entry.compressedSize) || local.fileDataStart + entry.compressedSize > central) throw archiveUnsafe('Dependency ZIP data overlaps directory');
      entries.push({ entry, name, directory, alias, mode: mode & 0o111 ? 0o755 : 0o644, start: entry.relativeOffsetOfLocalHeader, end: local.fileDataStart + entry.compressedSize });
    }
    const ordered = [...entries].sort((a, b) => a.start - b.start);
    for (let i = 1; i < ordered.length; i++) if (ordered[i]!.start < ordered[i - 1]!.end) throw archiveUnsafe('Overlapping dependency ZIP members');
    const verified = new Map<string, string>();
    // First consume/verify every compressed member without writing. A second
    // streaming pass copies only those bytes, checking the same digest again.
    for (const writing of [false, true]) {
      total = 0;
      for (const item of entries) {
      signal?.throwIfAborted(); if (failure) throw failure;
      if (item.directory) { if (item.entry.crc32 !== 0) throw archiveUnsafe('Invalid ZIP directory checksum'); if (writing) await ollamaParents(destination, item.name, true, signal); continue; }
      if (writing && item.alias) continue;
      const rawInput = await zip.openReadStreamPromise(item.entry, { decodeFileData: false });
      const inflater = item.entry.compressionMethod === 8 ? createInflateRaw({ chunkSize: 65536 }) : undefined;
      input = inflater ?? rawInput; input.on('error', error => { failure = error; });
      let pipeError: unknown;
      const piped = inflater ? pipeline(rawInput, inflater, { signal }).catch(error => { pipeError = error; }) : Promise.resolve();
      const hash = createHash('sha256'); let bytes = 0, crc = 0; const link: Buffer[] = [];
      let output: Awaited<ReturnType<typeof open>> | undefined;
      try {
        if (writing) { await ollamaParents(destination, item.name, false, signal); signal?.throwIfAborted(); output = await open(join(destination, item.name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, item.mode); }
        for await (const raw of input) {
          signal?.throwIfAborted(); const chunk = raw as Buffer;
          if (chunk.length > 65536 || (bytes += chunk.length) > item.entry.uncompressedSize || (total += chunk.length) > policy.limits.expandedBytes) throw archiveUnsafe('Dependency ZIP actual output exceeds bounds');
          hash.update(chunk); crc = crc32(chunk, crc);
          if (item.alias) link.push(Buffer.from(chunk));
          else if (writing) { let offset = 0; while (offset < chunk.length) { signal?.throwIfAborted(); const wrote = await output!.write(chunk, offset, chunk.length - offset); if (!wrote.bytesWritten) throw archiveUnsafe('Short ZIP output write'); offset += wrote.bytesWritten; } }
        }
        await piped; if (pipeError) throw pipeError;
        if ((inflater && inflater.bytesWritten !== item.entry.compressedSize) || bytes !== item.entry.uncompressedSize || crc !== item.entry.crc32) throw archiveUnsafe('Dependency ZIP compressed consumption, length or CRC differs');
        if (item.alias) {
          const target = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(link));
          if (!target || /^[\\/]/.test(target) || /[\\:\u0000-\u001f\u007f]/.test(target)) throw archiveUnsafe('Escaping ZIP alias target');
          const normalized = posix.normalize(posix.join(posix.dirname(item.name), target)); ollamaMemberPath(normalized);
          if (normalized.normalize('NFC').toLowerCase() === item.name.normalize('NFC').toLowerCase()) throw archiveUnsafe('Self-referencing ZIP alias');
          result.aliases.push({ path: item.name, target: normalized, kind: 'symlink' });
        } else {
          const sha256 = hash.digest('hex');
          if (writing) {
            if (verified.get(item.name) !== sha256) throw archiveUnsafe('ZIP bytes changed after validation');
            result.files.push({ path: item.name, bytes, sha256, mode: item.mode });
          } else verified.set(item.name, sha256);
        }
      } finally { try { await output?.close(); } finally { input.destroy(); rawInput.destroy(); await piped; input = undefined; } }
    }
    }
    return result;
  } catch (cause) {
    if (signal?.aborted) throw new InstallerError('cancelled', 'Dependency ZIP extraction cancelled', { cause });
    if (cause instanceof InstallerError) throw cause;
    throw new InstallerError('archive-unsafe', 'Malformed dependency ZIP payload', { cause });
  } finally { signal?.removeEventListener('abort', cancel); zip.close(); await closed; }
}
