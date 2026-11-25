import yauzl from 'yauzl';
import type { Entry, ZipFile, LocalFileHeader } from 'yauzl';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
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
import { closeOwnedFile } from './owned-file.js';

function extraFields(bytes: Buffer): Map<number, Buffer> {
  const fields = new Map<number, Buffer>(); let offset = 0;
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) throw archiveUnsafe('Truncated ZIP extra field');
    const id = bytes.readUInt16LE(offset), count = bytes.readUInt16LE(offset + 2); offset += 4;
    if (offset + count > bytes.length || fields.has(id)) throw archiveUnsafe('Truncated or duplicate ZIP extra field');
    fields.set(id, bytes.subarray(offset, offset + count)); offset += count;
  }
  return fields;
}
function localSizes(local: LocalFileHeader): { compressed: number; expanded: number } {
  const fields = extraFields(local.extraField);
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
/** yauzl intentionally tolerates some directory metadata. Qualify its envelope
 * and raw extra fields strictly, including fields it otherwise ignores. */
async function directoryEnvelope(file: FileHandle, bytes: number, maximum: number, signal?: AbortSignal) {
  const read = async (offset: number, length: number) => {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > bytes) throw archiveUnsafe('ZIP metadata range exceeds archive');
    const data = Buffer.alloc(length); let got = 0;
    while (got < length) { signal?.throwIfAborted(); const part = await file.read(data, got, length - got, offset + got); if (!part.bytesRead) throw archiveUnsafe('Truncated ZIP metadata'); got += part.bytesRead; }
    return data;
  };
  const integer = (value: bigint) => { if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw archiveUnsafe('ZIP64 metadata integer exceeds bound'); return Number(value); };
  const tail = await read(Math.max(0, bytes - 65577), Math.min(bytes, 65577)), candidates: number[] = [];
  for (let i = 0; i + 22 <= tail.length; i++) if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) candidates.push(i);
  if (candidates.length !== 1) throw archiveUnsafe('Missing or ambiguous ZIP directory end');
  const position = candidates[0]!, end = tail.subarray(position), endOffset = bytes - tail.length + position;
  if (end.readUInt16LE(4) !== 0 || end.readUInt16LE(6) !== 0) throw archiveUnsafe('Multidisk ZIP is unsupported');
  let count = end.readUInt16LE(10), size = end.readUInt32LE(12), offset = end.readUInt32LE(16), boundary = endOffset;
  const locator = endOffset >= 20 ? await read(endOffset - 20, 20) : Buffer.alloc(20);
  if (locator.readUInt32LE() === 0x07064b50) {
    if (locator.readUInt32LE(4) !== 0 || locator.readUInt32LE(16) !== 1) throw archiveUnsafe('Multidisk ZIP64 is unsupported');
    const recordOffset = integer(locator.readBigUInt64LE(8)), record = await read(recordOffset, 56);
    if (record.readUInt32LE() !== 0x06064b50 || record.readBigUInt64LE(4) !== 44n || recordOffset + 56 !== endOffset - 20
      || record.readUInt16LE(14) < 45 || record.readUInt32LE(16) !== 0 || record.readUInt32LE(20) !== 0
      || record.readBigUInt64LE(24) !== record.readBigUInt64LE(32)) throw archiveUnsafe('Invalid bounded ZIP64 directory end');
    const largeCount = integer(record.readBigUInt64LE(32)), largeSize = integer(record.readBigUInt64LE(40)), largeOffset = integer(record.readBigUInt64LE(48));
    if ((count !== 0xffff && count !== largeCount) || (end.readUInt16LE(8) !== 0xffff && end.readUInt16LE(8) !== largeCount)
      || (size !== 0xffffffff && size !== largeSize) || (offset !== 0xffffffff && offset !== largeOffset)) throw archiveUnsafe('ZIP64 and ordinary directory ends differ');
    count = largeCount; size = largeSize; offset = largeOffset; boundary = recordOffset;
  } else if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff || end.readUInt16LE(8) !== count) throw archiveUnsafe('Missing ZIP64 or inconsistent ZIP directory counts');
  if (count > maximum || size > 16 * 1024 * 1024 || offset + size !== boundary) throw archiveUnsafe('ZIP directory bounds/count differ');
  let cursor = offset;
  const ranges: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < count; index++) {
    signal?.throwIfAborted(); const header = await read(cursor, 46);
    if (header.readUInt32LE() !== 0x02014b50 || ![10, 20, 45].includes(header.readUInt16LE(6))) throw archiveUnsafe('Unsupported ZIP directory member');
    const name = header.readUInt16LE(28), extra = header.readUInt16LE(30), comment = header.readUInt16LE(32);
    if (cursor + 46 + name + extra + comment > boundary) throw archiveUnsafe('ZIP directory member exceeds envelope');
    const variable = await read(cursor + 46, name + extra + comment), fields = extraFields(variable.subarray(name, name + extra));
    const disk = header.readUInt16LE(34), data = fields.get(1); let used = 0;
    let expanded = header.readUInt32LE(24), compressed = header.readUInt32LE(20), localOffset = header.readUInt32LE(42);
    for (const [at, sentinel, width] of [[24, 0xffffffff, 8], [20, 0xffffffff, 8], [42, 0xffffffff, 8], [34, 0xffff, 4]] as const) {
      const value = width === 4 ? header.readUInt16LE(at) : header.readUInt32LE(at);
      if (value !== sentinel) continue;
      if (!data || used + width > data.length || header.readUInt16LE(6) < 45) throw archiveUnsafe('Missing ZIP64 directory member fields');
      const large = width === 8 ? integer(data.readBigUInt64LE(used)) : data.readUInt32LE(used); used += width;
      if (at === 24) expanded = large; if (at === 20) compressed = large; if (at === 42) localOffset = large;
      if (at === 34 && large !== 0) throw archiveUnsafe('Multidisk ZIP member is unsupported');
    }
    if ((disk !== 0 && disk !== 0xffff) || (data && (!used || used !== data.length))) throw archiveUnsafe('Ambiguous ZIP64 directory member metadata');
    const local = await read(localOffset, 30);
    if (local.readUInt32LE() !== 0x04034b50) throw archiveUnsafe('Invalid ZIP local signature');
    const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28); let dataEnd = dataStart + compressed;
    if (!Number.isSafeInteger(dataEnd) || dataEnd > offset) throw archiveUnsafe('ZIP member exceeds data region');
    if (header.readUInt16LE(8) & 8) {
      const signed = (await read(dataEnd, 4)).readUInt32LE() === 0x08074b50;
      const wide = local.readUInt32LE(18) === 0xffffffff || local.readUInt32LE(22) === 0xffffffff || compressed > 0xffffffff || expanded > 0xffffffff;
      const descriptor = await read(dataEnd + (signed ? 4 : 0), wide ? 20 : 12);
      if (descriptor.readUInt32LE() !== header.readUInt32LE(16)
        || (wide ? integer(descriptor.readBigUInt64LE(4)) : descriptor.readUInt32LE(4)) !== compressed
        || (wide ? integer(descriptor.readBigUInt64LE(12)) : descriptor.readUInt32LE(8)) !== expanded) throw archiveUnsafe('ZIP data descriptor differs from directory');
      dataEnd += (signed ? 4 : 0) + descriptor.length;
      if (dataEnd > offset) throw archiveUnsafe('ZIP data descriptor exceeds data region');
    }
    ranges.push({ start: localOffset, end: dataEnd });
    cursor += 46 + name + extra + comment;
  }
  if (cursor !== offset + size) throw archiveUnsafe('ZIP directory size/count mismatch');
  ranges.sort((left, right) => left.start - right.start); let dataEnd = 0;
  for (const range of ranges) { if (range.start !== dataEnd) throw archiveUnsafe('Overlapping or unreferenced ZIP data region'); dataEnd = range.end; }
  if (dataEnd !== offset) throw archiveUnsafe('ZIP data region coverage differs');
  return { count, offset, end: cursor };
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
  let envelope: Awaited<ReturnType<typeof directoryEnvelope>>;
  try {
    const info = await source.stat(), initial = await lstat(archive);
    if (!info.isFile() || info.nlink !== 1 || info.size !== policy.asset.bytes || info.ino !== initial.ino || initial.isSymbolicLink()) throw archiveUnsafe('Unsafe dependency ZIP source');
    const hash = createHash('sha256'), buffer = Buffer.alloc(65536); let bytes = 0;
    while (true) {
      signal?.throwIfAborted(); const part = await source.read(buffer, 0, buffer.length, null); if (!part.bytesRead) break;
      if ((bytes += part.bytesRead) > policy.asset.bytes) throw archiveUnsafe('Dependency ZIP source grew'); hash.update(buffer.subarray(0, part.bytesRead));
    }
    if (bytes !== policy.asset.bytes || hash.digest('hex') !== policy.asset.sha256) throw archiveUnsafe('Dependency ZIP identity differs');
    envelope = await directoryEnvelope(source, info.size, policy.limits.files, signal);
  } finally { await closeOwnedFile(source); }
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
    if (zip.entryCount !== envelope.count || central !== envelope.offset) throw archiveUnsafe('ZIP reader and verified directory envelope differ');
    // Validate the whole directory and each local header before creating files.
    while (true) {
      signal?.throwIfAborted(); if (failure) throw failure;
      const entry = await new Promise<Entry | null>((resolve, reject) => { pending = { resolve, reject }; zip.readEntry(); }); if (!entry) break;
      const directory = entry.fileName.endsWith('/'), name = directory ? entry.fileName.slice(0, -1) : entry.fileName;
      paths.add(name, directory);
      extraFields(entry.extraFieldRaw);
      if ((entry.generalPurposeBitFlag & ~0x80e) !== 0 || ![0, 8].includes(entry.compressionMethod)) throw archiveUnsafe('Encrypted or unsupported ZIP encoding');
      if ((entry.compressionMethod === 0 && (entry.generalPurposeBitFlag & 6)) || (entry.compressionMethod === 8 && entry.versionNeededToExtract < 20)) throw archiveUnsafe('Inconsistent ZIP compression metadata');
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
        || ![10, 20, 45].includes(local.versionNeededToExtract) || local.versionNeededToExtract > entry.versionNeededToExtract
        || (entry.compressionMethod === 8 && local.versionNeededToExtract < 20)
        || (local.crc32 !== entry.crc32 && !(deferred && local.crc32 === 0))
        || (sizes.compressed !== entry.compressedSize && !(deferred && sizes.compressed === 0))
        || (sizes.expanded !== entry.uncompressedSize && !(deferred && sizes.expanded === 0))) throw archiveUnsafe('Dependency ZIP local/directory headers differ');
      if (entry.relativeOffsetOfLocalHeader < 0 || !Number.isSafeInteger(local.fileDataStart + entry.compressedSize) || local.fileDataStart + entry.compressedSize > central) throw archiveUnsafe('Dependency ZIP data overlaps directory');
      entries.push({ entry, name, directory, alias, mode: mode & 0o111 ? 0o755 : 0o644, start: entry.relativeOffsetOfLocalHeader, end: local.fileDataStart + entry.compressedSize });
    }
    if (entries.length !== envelope.count || Number(zip.readEntryCursor) !== envelope.end) throw archiveUnsafe('ZIP reader directory coverage differs');
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
      } finally { try { await closeOwnedFile(output); } finally { input.destroy(); rawInput.destroy(); await piped; input = undefined; } }
    }
    }
    return result;
  } catch (cause) {
    if (signal?.aborted) throw new InstallerError('cancelled', 'Dependency ZIP extraction cancelled', { cause });
    if (cause instanceof InstallerError) throw cause;
    throw new InstallerError('archive-unsafe', 'Malformed dependency ZIP payload', { cause });
  } finally { signal?.removeEventListener('abort', cancel); zip.close(); await closed; }
}
