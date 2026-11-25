/** Bounded private Linux payload reader. This does not publish or select anything. */
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, posix } from 'node:path';
import { InstallerError } from './contracts.js';
import { assertRelativeFile } from './location.js';
import type { InventoryFile } from './release-descriptor.js';
import { parseOllamaPolicy } from './ollama-policy.js';
import type { OllamaPolicy } from './ollama-policy.js';
import { decodeOllamaZstd } from './ollama-zstd.js';

export interface OllamaArchiveAlias { path: string; target: string; kind: 'file' | 'symlink' }
export interface OllamaExtracted { files: InventoryFile[]; aliases: OllamaArchiveAlias[] }
const unsafe = (message: string) => new InstallerError('archive-unsafe', message);
const text = new TextDecoder('utf-8', { fatal: true });
const folded = (value: string) => value.normalize('NFC').toLowerCase();
function field(header: Buffer, offset: number, size: number): string {
  const bytes = header.subarray(offset, offset + size), zero = bytes.indexOf(0);
  if (zero >= 0 && bytes.subarray(zero).some(byte => byte !== 0 && byte !== 32)) throw unsafe('Ambiguous tar string padding');
  return text.decode(zero < 0 ? bytes : bytes.subarray(0, zero));
}
function numeric(header: Buffer, offset: number, size: number): number {
  const bytes = header.subarray(offset, offset + size); let result: bigint;
  if (bytes[0]! & 0x80) {
    if (bytes[0]! & 0x40) throw unsafe('Negative tar numeric value');
    result = BigInt(bytes[0]! & 0x7f); for (const byte of bytes.subarray(1)) result = (result << 8n) | BigInt(byte);
  } else {
    if (bytes.some(byte => byte !== 0 && byte !== 32 && (byte < 48 || byte > 55))) throw unsafe('Invalid tar octal field');
    const digits = bytes.toString('ascii').replace(/\0.*$/, '').trim();
    if (!/^[0-7]*$/.test(digits)) throw unsafe('Invalid tar numeric field'); result = BigInt('0o' + (digits || '0'));
  }
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw unsafe('Oversized tar numeric value'); return Number(result);
}
function memberName(value: string, directory = false): string {
  if (directory && value === '.') return '';
  while (value.startsWith('./')) value = value.slice(2);
  if (directory && value.endsWith('/')) value = value.slice(0, -1);
  if (!value && directory) return '';
  assertRelativeFile(value);
  if (value.split('/').length > 64 || ['.ollama-receipt.json', 'inventory.json', '.release.json', '.dev-release.json'].includes(value)) throw unsafe('Reserved or excessive tar path');
  return value;
}
class TarBytes {
  readonly iterator: AsyncIterator<Buffer>; chunk: Buffer = Buffer.alloc(0); offset = 0; ended = false;
  constructor(source: AsyncIterable<Buffer>, readonly signal?: AbortSignal) { this.iterator = source[Symbol.asyncIterator](); }
  async take(length: number, allowEnd = false): Promise<Buffer | undefined> {
    const parts: Buffer[] = []; let bytes = 0;
    while (bytes < length) {
      this.signal?.throwIfAborted();
      if (this.offset === this.chunk.length) {
        const part = await this.iterator.next(); this.signal?.throwIfAborted();
        if (part.done) { this.ended = true; if (allowEnd && bytes === 0) return undefined; throw unsafe('Truncated tar member'); }
        this.chunk = part.value; this.offset = 0; if (!this.chunk.length) continue;
      }
      const count = Math.min(length - bytes, this.chunk.length - this.offset);
      parts.push(this.chunk.subarray(this.offset, this.offset + count)); this.offset += count; bytes += count;
    }
    return parts.length === 1 ? parts[0]! : Buffer.concat(parts, length);
  }
}
function pax(bytes: Buffer): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>; let offset = 0;
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset);
    if (space < offset || space - offset > 10) throw unsafe('Malformed bounded PAX length');
    const digits = bytes.subarray(offset, space).toString('ascii');
    if (!/^[1-9][0-9]*$/.test(digits)) throw unsafe('Invalid PAX record length');
    const size = Number(digits), end = offset + size;
    if (!Number.isSafeInteger(size) || end > bytes.length || end <= space + 2 || bytes[end - 1] !== 10) throw unsafe('Truncated PAX record');
    const pair = text.decode(bytes.subarray(space + 1, end - 1)), equal = pair.indexOf('=');
    if (equal < 1) throw unsafe('Invalid PAX record');
    const key = pair.slice(0, equal), value = pair.slice(equal + 1);
    if (Object.hasOwn(result, key) || (!['path', 'linkpath', 'size', 'uid', 'gid', 'uname', 'gname', 'mtime', 'atime', 'ctime', 'charset', 'comment', 'LIBARCHIVE.creationtime'].includes(key)
      && !key.startsWith('SCHILY.xattr.'))) throw unsafe('Unsupported or duplicate PAX attribute');
    result[key] = value; offset = end;
  }
  return result;
}

export async function extractOllamaTarZstd(archive: string, destination: string, policyInput: OllamaPolicy,
  signal?: AbortSignal): Promise<OllamaExtracted> {
  const policy = parseOllamaPolicy(policyInput); signal?.throwIfAborted();
  const root = await lstat(destination);
  if (!root.isDirectory() || root.isSymbolicLink() || (typeof process.getuid === 'function' && root.uid !== process.getuid())
    || (process.platform !== 'win32' && (root.mode & 0o077) !== 0)
    || (await readdir(destination)).length) throw unsafe('Expected empty owned extraction directory');
  // A linked ancestor must not turn a private stage into an external write.
  let parent = destination;
  while (true) {
    const info = await lstat(parent);
    if (info.isSymbolicLink() || !info.isDirectory()) throw unsafe('Linked extraction ancestor');
    const next = dirname(parent); if (next === parent) break; parent = next;
  }
  const source = await open(archive, constants.O_RDONLY | constants.O_NOFOLLOW);
  let reader: TarBytes | undefined, current: FileHandle | undefined;
  const files: InventoryFile[] = [], aliases: OllamaArchiveAlias[] = [], components = new Map<string, { path: string; directory: boolean }>(), seen = new Set<string>();
  let entries = 0, declared = 0, zeros = 0, metadataBytes = 0, controls = 0;
  let pending: Record<string, string> = {}, longName: string | undefined, longLink: string | undefined;
  const register = (name: string, directory: boolean) => {
    const parts = name.split('/');
    for (let index = 0; index < parts.length; index++) {
      const prefix = parts.slice(0, index + 1).join('/'), key = folded(prefix), isDirectory = index < parts.length - 1 || directory;
      const previous = components.get(key);
      if (previous && (previous.path !== prefix || previous.directory !== isDirectory)) throw unsafe('Colliding tar path component');
      components.set(key, { path: prefix, directory: isDirectory });
      if (components.size > policy.limits.files * 2) throw unsafe('Tar path component count exceeds bound');
    }
    const key = folded(name); if (seen.has(key)) throw unsafe('Duplicate tar member'); seen.add(key);
  };
  const parents = async (name: string, includeLeaf: boolean) => {
    const parts = name.split('/'); let path = destination;
    for (const part of includeLeaf ? parts : parts.slice(0, -1)) {
      signal?.throwIfAborted(); path = join(path, part);
      try { await mkdir(path, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw unsafe('Linked or non-directory tar parent');
    }
  };
  try {
    const info = await source.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size !== policy.asset.bytes) throw unsafe('Compressed source is not the expected regular file');
    async function* compressed() {
      let position = 0;
      while (true) { signal?.throwIfAborted(); const buffer = Buffer.alloc(65536); const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
        signal?.throwIfAborted(); if (!bytesRead) return; position += bytesRead; yield buffer.subarray(0, bytesRead); }
    }
    reader = new TarBytes(decodeOllamaZstd(compressed(), policy, signal), signal);
    while (true) {
      signal?.throwIfAborted(); const header = await reader.take(512, true); if (!header) break;
      if (header.every(value => value === 0)) { zeros++; continue; }
      if (zeros) throw unsafe('Nonzero tar content after end marker');
      if (++entries > policy.limits.files) throw unsafe('Tar entry count exceeds policy');
      const expected = numeric(header, 148, 8); let checksum = 0;
      for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i]!;
      if (checksum !== expected) throw unsafe('Tar header checksum differs');
      const magic = field(header, 257, 6);
      if (magic && magic !== 'ustar' && magic !== 'ustar ') throw unsafe('Unsupported tar header format');
      const type = String.fromCharCode(header[156] || 48), sizeField = numeric(header, 124, 12), mode = numeric(header, 100, 8);
      const control = ['x', 'g', 'L', 'K'].includes(type);
      let size = sizeField;
      if (!control && pending['size'] !== undefined) {
        if (!/^(?:0|[1-9][0-9]*)$/.test(pending['size'])) throw unsafe('Invalid PAX size'); size = Number(pending['size']);
      }
      if (!Number.isSafeInteger(size) || size > (control ? 65536 : policy.limits.fileBytes) || declared + size > policy.limits.expandedBytes) throw unsafe('Tar member/metadata exceeds policy');
      declared += size;
      if (control) {
        metadataBytes += size;
        if (++controls > 16 || metadataBytes > 65536) throw unsafe('Cumulative tar metadata exceeds bound');
        const data = (await reader.take(size))!;
        if (type === 'x') pending = { ...pending, ...pax(data) };
        else if (type === 'g') { const global = pax(data); if (['path', 'linkpath', 'size'].some(key => global[key] !== undefined)) throw unsafe('Structural global PAX attributes unsupported'); }
        else { const value = field(data, 0, data.length); if (type === 'L') longName = value; else longLink = value; }
      } else {
        metadataBytes = 0; controls = 0;
        const directory = type === '5', prefix = magic === 'ustar' ? field(header, 345, 155) : '';
        const name = memberName(pending['path'] ?? longName ?? (prefix ? `${prefix}/` : '') + field(header, 0, 100), directory);
        const link = pending['linkpath'] ?? longLink ?? field(header, 157, 100);
        pending = {}; longName = undefined; longLink = undefined;
        if (!['0', '1', '2', '5'].includes(type)) throw unsafe('Special, sparse or unsupported tar entry');
        if (type !== '0' && size !== 0) throw unsafe('Non-file tar member contains data');
        if (name) register(name, directory);
        if (directory) { if (name) await parents(name, true); }
        else if (type === '1' || type === '2') {
          if (!link || /^[\\/]/.test(link) || /[\\:\u0000-\u001f\u007f]/.test(link)) throw unsafe('Unsafe tar link target');
          const target = memberName(posix.normalize(type === '1' ? link : posix.join(posix.dirname(name), link)));
          if (folded(target) === folded(name)) throw unsafe('Self-referencing tar link');
          aliases.push({ path: name, target, kind: type === '1' ? 'file' : 'symlink' });
        } else {
          await parents(name, false); signal?.throwIfAborted();
          current = await open(join(destination, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode & 0o111 ? 0o755 : 0o644);
          const hash = createHash('sha256'); let remaining = size;
          while (remaining) {
            signal?.throwIfAborted(); const chunk = (await reader.take(Math.min(65536, remaining)))!; hash.update(chunk);
            let written = 0;
            while (written < chunk.length) { signal?.throwIfAborted(); const result = await current.write(chunk, written, chunk.length - written); if (!result.bytesWritten) throw unsafe('Short tar payload write'); written += result.bytesWritten; }
            remaining -= chunk.length;
          }
          await current.close(); current = undefined; files.push({ path: name, bytes: size, mode: mode & 0o111 ? 0o755 : 0o644, sha256: hash.digest('hex') });
        }
      }
      const padding = (512 - size % 512) % 512;
      if (padding && (await reader.take(padding))!.some(byte => byte !== 0)) throw unsafe('Nonzero tar member padding');
    }
    if (zeros < 2 || Object.keys(pending).length || longName !== undefined || longLink !== undefined) throw unsafe('Missing tar terminator or dangling metadata');
    return { files: files.sort((a, b) => a.path.localeCompare(b.path)), aliases };
  } catch (cause) {
    if (signal?.aborted) throw new InstallerError('cancelled', 'Ollama extraction cancelled', { cause });
    if (cause instanceof InstallerError) throw cause;
    throw new InstallerError('archive-unsafe', 'Malformed bounded tar payload', { cause });
  } finally { try { await current?.close(); } finally { try { if (reader && !reader.ended) await reader.iterator.return?.(); } finally { await source.close(); } } }
}
