/** Shared strict tar byte/header primitives; no decompression, writing or policy. */
import { InstallerError } from './contracts.js';
import { assertRelativeFile } from './location.js';
const unsafe = (message: string) => new InstallerError('archive-unsafe', message);
const text = new TextDecoder('utf-8', { fatal: true });
export function tarField(header: Buffer, offset: number, size: number): string {
  const bytes = header.subarray(offset, offset + size), zero = bytes.indexOf(0);
  if (zero >= 0 && bytes.subarray(zero).some(byte => byte !== 0 && byte !== 32)) throw unsafe('Ambiguous tar string padding');
  return text.decode(zero < 0 ? bytes : bytes.subarray(0, zero));
}
export function tarNumeric(header: Buffer, offset: number, size: number): number {
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
export function tarMemberName(value: string, directory = false): string {
  if (directory && (value === '.' || /^(?:\.\/)+$/.test(value))) return '';
  while (value.startsWith('./')) value = value.slice(2);
  if (directory && value.endsWith('/')) value = value.slice(0, -1);
  assertRelativeFile(value);
  if (value.split('/').length > 64 || ['.ollama-receipt.json', 'inventory.json', '.release.json', '.dev-release.json'].includes(value)) throw unsafe('Reserved or excessive tar path');
  return value;
}
export class TarBytes {
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
export function tarPax(bytes: Buffer): Record<string, string> {
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
