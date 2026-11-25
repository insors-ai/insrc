import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { digest } from '../release-descriptor.js';
import type { OllamaPolicy } from '../ollama-policy.js';
import { controlBinding } from '../native.js';
import assert from 'node:assert/strict';
import io from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';

/** A real write/positive-close barrier, rather than polling a partial file. */
export function abortAfterFirstWrite(file: string, abort: AbortController) {
  const open = io.open; let seen = false, closed = false;
  io.open = (async (...args: Parameters<typeof open>) => {
    const handle = await open(...args); if (String(args[0]) !== file) return handle;
    return new Proxy(handle, { get(target, key) {
      if (key === 'write') return async (...values: Parameters<typeof handle.write>) => { const result = await handle.write(...values); seen = true; abort.abort(); return result; };
      if (key === 'close') return async () => { await handle.close(); closed = true; };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
  }) as typeof open; syncBuiltinESMExports();
  return { get seen() { return seen; }, get closed() { return closed; }, restore() { io.open = open; syncBuiltinESMExports(); } };
}

export function boundaryPolicy(bytes: Buffer, format: 'zip' | 'tar.zst' = 'zip'): OllamaPolicy {
  const os = format === 'zip' ? 'win32' : 'linux', executable = os === 'linux' ? 'bin/ollama' : 'ollama.exe';
  return { schemaVersion: 1, target: { os, arch: 'arm64', baseline: 'fixture' }, version: '0.0.1-fixture',
    asset: { url: `https://github.com/ollama/ollama/releases/download/v0.0.1-fixture/ollama-${os}-arm64.${format}`, bytes: bytes.length, sha256: digest(bytes), format },
    limits: { expandedBytes: 32 * 1024 * 1024, fileBytes: 16 * 1024 * 1024, files: 128, windowBytes: 2 ** 25 },
    layout: { executable, requiredFiles: [executable], aliases: [] }, endpoint: 'http://127.0.0.1:11434',
    modelsRelativePath: 'deps/ollama/data/models', logsRelativePath: 'deps/ollama/logs/server', start: true };
}
export function boundaryFixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'iab-')), home = join(root, 'home');
  mkdirSync(join(home, 'releases/incumbent'), { recursive: true, mode: 0o700 }); writeFileSync(join(home, 'releases/incumbent/marker'), 'selected release');
  writeFileSync(join(home, 'application-data'), 'retain'); if (process.platform === 'win32') controlBinding().protect(root);
  let serial = 0;
  return { root, home, input(bytes: Buffer) {
    const directory = join(home, 'deps/ollama/.staging', `boundary-${++serial}`), stage = join(directory, 'payload'), archive = join(directory, 'payload.download');
    mkdirSync(stage, { recursive: true, mode: 0o700 }); writeFileSync(archive, bytes, { mode: 0o600 }); return { archive, stage };
  }, preserved() {
    assert.deepEqual(readdirSync(join(home, 'releases')), ['incumbent']); assert.equal(readFileSync(join(home, 'releases/incumbent/marker'), 'utf8'), 'selected release');
    assert.equal(readFileSync(join(home, 'application-data'), 'utf8'), 'retain');
  }, cleanup() { rmSync(root, { recursive: true, force: true }); } };
}
/** Independent one-member ZIP builder, including a real 64-bit data descriptor. */
export function singleZip(data = Buffer.from('original'), options: { wide?: boolean; centralExtra?: Buffer; comment?: Buffer } = {}): Buffer {
  const name = Buffer.from('safe.txt'), extra = options.wide ? Buffer.alloc(20) : Buffer.alloc(0), crc = crc32(data), version = options.wide ? 45 : 20;
  if (options.wide) { extra.writeUInt16LE(1); extra.writeUInt16LE(16, 2); }
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(version, 4); local.writeUInt16LE(options.wide ? 8 : 0, 6);
  local.writeUInt32LE(options.wide ? 0 : crc, 14); local.writeUInt32LE(options.wide ? 0xffffffff : data.length, 18); local.writeUInt32LE(options.wide ? 0xffffffff : data.length, 22);
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(extra.length, 28);
  const descriptor = options.wide ? Buffer.alloc(24) : Buffer.alloc(0);
  if (options.wide) { descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4); descriptor.writeBigUInt64LE(BigInt(data.length), 8); descriptor.writeBigUInt64LE(BigInt(data.length), 16); }
  const start = Buffer.concat([local, name, extra, data, descriptor]), cdExtra = options.centralExtra ?? Buffer.alloc(0), central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(3 * 256 + version, 4); central.writeUInt16LE(version, 6); central.writeUInt16LE(options.wide ? 8 : 0, 8);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(cdExtra.length, 30); central.writeUInt32LE((0o100644 * 65536) >>> 0, 38);
  const directory = Buffer.concat([central, name, cdExtra]), end = Buffer.alloc(22), comment = options.comment ?? Buffer.alloc(0);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(start.length, 16); end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([start, directory, end, comment]);
}
export function tarHeader(name: string, data: Buffer, options: { type?: string; link?: string; mode?: number; size?: number } = {}): Buffer {
  const header = Buffer.alloc(512), octal = (value: number, at: number, size: number) => header.write(value.toString(8).padStart(size - 1, '0') + '\0', at, size, 'ascii');
  header.write(name, 0, 100); octal(options.mode ?? 0o644, 100, 8); octal(0, 108, 8); octal(0, 116, 8); octal(options.size ?? data.length, 124, 12); octal(0, 136, 12);
  header[156] = (options.type ?? '0').charCodeAt(0); header.write(options.link ?? '', 157, 100); header.write('ustar\0', 257, 6); header.write('00', 263, 2); tarChecksum(header); return header;
}
export function tarChecksum(header: Buffer): void {
  header.fill(32, 148, 156); const sum = header.reduce((n, byte) => n + byte, 0); header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
}
export const tarMember = (header: Buffer, data: Buffer): Buffer => Buffer.concat([header, data, Buffer.alloc((512 - data.length % 512) % 512)]);
export function paxLine(key: string, value: string): Buffer {
  const tail = ` ${key}=${value}\n`; let count = tail.length + 1;
  while (String(count).length + tail.length !== count) count = String(count).length + tail.length;
  return Buffer.from(String(count) + tail);
}
