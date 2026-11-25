import assert from 'node:assert/strict';
import fs from 'node:fs';
import io from 'node:fs/promises';
import { once } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { crc32, zstdCompressSync } from 'node:zlib';
import { Decompress } from 'fzstd';
import { ZipFile } from 'yazl';
import { privateRuntimeTest } from './_private-runtime-test.js';
import { boundaryFixture, boundaryPolicy, paxLine, singleZip, tarChecksum, tarHeader, tarMember } from './_archive-boundary-fixture.js';
import { ollamaFixture, fixtureExecutable } from './_ollama-fixture.js';
import { extractOllamaTarZstd } from '../ollama-tar.js';
import { extractOllamaZip } from '../ollama-zip.js';
import { decodeOllamaZstd } from '../ollama-zstd.js';
import { closedOllamaAttempts, prepareOllama } from '../ollama-prepare.js';
import { digest } from '../release-descriptor.js';

const zeros = Buffer.alloc(1024), payload = Buffer.from('abc');
const member = (name: string, data = payload, options: Parameters<typeof tarHeader>[2] = {}) => tarMember(tarHeader(name, data, options), data);
async function rejects(promise: Promise<unknown>, code: string, message: RegExp): Promise<void> {
  await assert.rejects(promise, (error: unknown) => { const value = error as { code: string; message: string }; assert.equal(value.code, code); assert.match(value.message, message); return true; });
}
privateRuntimeTest(import.meta.url, 'tar-gnu-numeric-pax-padding-terminator-and-reserved-name-boundary-matrix', async () => {
  const f = boundaryFixture();
  try {
    const numeric = tarHeader('safe', payload); numeric.fill(0, 124, 136); numeric[124] = 0x80; numeric[135] = payload.length; tarChecksum(numeric);
    const long = Buffer.from('deep/'.repeat(22) + 'safe\0'), longLink = Buffer.from('target\0'), size = paxLine('size', '3');
    const positives = [
      { raw: Buffer.concat([tarMember(numeric, payload), zeros]), path: 'safe' },
      { raw: Buffer.concat([member('gnu', long, { type: 'L' }), member('placeholder'), zeros]), path: long.subarray(0, -1).toString() },
      { raw: Buffer.concat([member('pax', size, { type: 'x' }), member('safe', payload, { size: 0 }), zeros]), path: 'safe' },
      { raw: Buffer.concat([member('safe', payload, { mode: 0o4755 }), zeros]), path: 'safe' },
      { raw: Buffer.concat([member('lib/inventory.json', Buffer.from('{"forged":true}')), zeros]), path: 'lib/inventory.json' },
    ];
    for (const item of positives) {
      const bytes = zstdCompressSync(item.raw), input = f.input(bytes), result = await extractOllamaTarZstd(input.archive, input.stage, boundaryPolicy(bytes, 'tar.zst'));
      assert.ok(result.files.some(file => file.path === item.path)); assert.equal(fs.existsSync(join(input.stage, 'inventory.json')), false, 'nested vendor data never becomes root trusted metadata');
      assert.equal(fs.lstatSync(join(input.stage, item.path)).mode & 0o7000, 0, 'privileged mode bits normalize away'); f.preserved();
    }
    const k = zstdCompressSync(Buffer.concat([member('gnu', longLink, { type: 'K' }), member('lib/link', Buffer.alloc(0), { type: '2', link: 'ignored' }), zeros])), ki = f.input(k);
    assert.deepEqual((await extractOllamaTarZstd(ki.archive, ki.stage, boundaryPolicy(k, 'tar.zst'))).aliases, [{ path: 'lib/link', target: 'lib/target', kind: 'symlink' }]);
    const negative = Buffer.from(numeric); negative[124] = 0xc0; tarChecksum(negative);
    const padding = member('safe'); padding[512 + payload.length] = 1;
    const cases = [
      { raw: Buffer.concat([member('gnu', Buffer.from('../escaped\0'), { type: 'L' }), member('ignored'), zeros]), code: 'path-invalid', pattern: /contained portable/ },
      { raw: Buffer.concat([member('gnu', Buffer.from('../../escaped\0'), { type: 'K' }), member('lib/link', Buffer.alloc(0), { type: '2', link: 'ignored' }), zeros]), code: 'path-invalid', pattern: /contained portable/ },
      { raw: Buffer.concat([tarMember(negative, payload), zeros]), code: 'archive-unsafe', pattern: /Negative tar numeric/ },
      { raw: Buffer.concat([member('pax', paxLine('size', '-1'), { type: 'x' }), member('safe'), zeros]), code: 'archive-unsafe', pattern: /Invalid PAX size/ },
      { raw: Buffer.concat([member('pax', paxLine('size', String(64 * 1024 * 1024)), { type: 'x' }), member('safe'), zeros]), code: 'archive-unsafe', pattern: /exceeds policy/ },
      { raw: Buffer.concat([padding, zeros]), code: 'archive-unsafe', pattern: /Nonzero tar member padding/ },
      { raw: Buffer.concat([member('safe'), Buffer.alloc(512)]), code: 'archive-unsafe', pattern: /Missing tar terminator/ },
      { raw: Buffer.concat([member('safe'), zeros, member('after-end'), zeros]), code: 'archive-unsafe', pattern: /after end marker/ },
      { raw: Buffer.concat([member('lib/link', payload, { type: '2', link: 'safe' }), zeros]), code: 'archive-unsafe', pattern: /Non-file tar member contains data/ },
      { raw: Buffer.concat([member('inventory.json'), zeros]), code: 'archive-unsafe', pattern: /Reserved/ },
    ];
    for (const item of cases) {
      const bytes = zstdCompressSync(item.raw), input = f.input(bytes);
      await rejects(extractOllamaTarZstd(input.archive, input.stage, boundaryPolicy(bytes, 'tar.zst')), item.code, item.pattern);
      assert.equal(fs.existsSync(join(f.home, 'escaped')), false); f.preserved();
    }
  } finally { f.cleanup(); }
});

function rawFrame(data: Buffer): Buffer {
  assert.ok(data.length < 256); const block = Buffer.alloc(3); block.writeUIntLE((data.length << 3) | 1, 0, 3);
  return Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, data.length]), block, data]);
}
async function decode(bytes: Buffer): Promise<Buffer> {
  const output: Buffer[] = []; async function* input() { yield bytes; }
  for await (const part of decodeOllamaZstd(input(), boundaryPolicy(bytes, 'tar.zst'))) output.push(part);
  return Buffer.concat(output);
}
privateRuntimeTest(import.meta.url, 'zstd-reserved-dictionary-size-skippable-and-dual-decoder-boundary-matrix', async () => {
  const good = rawFrame(Buffer.from('correct-data')); assert.equal((await decode(good)).toString(), 'correct-data');
  const reserved = Buffer.from(good); reserved[4]! |= 8;
  const dictionary = Buffer.concat([good.subarray(0, 5), Buffer.from([1]), good.subarray(5)]); dictionary[4]! |= 1;
  const mismatch = Buffer.from(good); mismatch[5]!++;
  for (const [bytes, pattern] of [[reserved, /Reserved zstd/], [dictionary, /dictionaries/], [mismatch, /Malformed|content/], [Buffer.from([0x50, 0x2a, 0x4d, 0x18, 0, 0, 0, 0]), /Unsupported.*frames/]] as const) await rejects(decode(bytes), 'archive-unsafe', pattern);
  const push = Decompress.prototype.push, wrapped = new WeakSet<object>();
  try {
    Decompress.prototype.push = function (...args) {
      if (!wrapped.has(this)) { wrapped.add(this); const output = this.ondata; this.ondata = (bytes, final) => { const changed = Buffer.from(bytes); if (changed.length) changed[0]! ^= 1; output(changed, final); }; }
      return push.apply(this, args);
    };
    await rejects(decode(good), 'archive-unsafe', /content length\/checksum differs/);
  } finally { Decompress.prototype.push = push; }
});

privateRuntimeTest(import.meta.url, 'zip64-descriptor-comment-unicode-gap-and-overlap-boundary-matrix', async () => {
  const f = boundaryFixture();
  try {
    const wide = singleZip(payload, { wide: true }), normal = singleZip(), endAt = normal.length - 22, central = normal.readUInt32LE(endAt + 16);
    const unicode = (name: string) => { const value = Buffer.from(name), extra = Buffer.alloc(9 + value.length); extra.writeUInt16LE(0x7075); extra.writeUInt16LE(5 + value.length, 2); extra[4] = 1; extra.writeUInt32LE(crc32(Buffer.from('safe.txt')), 5); value.copy(extra, 9); return extra; };
    for (const bytes of [wide, singleZip(payload, { comment: Buffer.from([0x50, 0x4b, 5, 6]) }), singleZip(payload, { centralExtra: unicode('safe.txt') })]) {
      const input = f.input(bytes); assert.equal((await extractOllamaZip(input.archive, input.stage, boundaryPolicy(bytes))).files.length, 1); f.preserved();
    }
    const badDescriptor = Buffer.from(wide), wideCentral = wide.readUInt32LE(wide.length - 6); badDescriptor.writeBigUInt64LE(99n, wideCentral - 16);
    const fakeEnd = Buffer.alloc(22); fakeEnd.writeUInt32LE(0x06054b50);
    const gap = Buffer.from(normal); gap.writeUInt32LE(1, central + 42); gap.writeUInt32LE(central + 1, endAt + 16);
    const directory = normal.subarray(central, endAt), end = Buffer.from(normal.subarray(endAt)); end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10); end.writeUInt32LE(directory.length * 2, 12);
    for (const [bytes, pattern] of [
      [badDescriptor, /data descriptor differs/], [singleZip(payload, { comment: fakeEnd }), /ambiguous ZIP directory end/],
      [singleZip(payload, { centralExtra: unicode('evil.txt') }), /Ambiguous.*filename/],
      [Buffer.concat([Buffer.from([0]), gap]), /unreferenced ZIP data region/],
      [Buffer.concat([normal.subarray(0, central), directory, directory, end]), /Overlapping.*data region/],
    ] as const) {
      const input = f.input(bytes); await rejects(extractOllamaZip(input.archive, input.stage, boundaryPolicy(bytes)), 'archive-unsafe', pattern);
      assert.deepEqual(fs.readdirSync(input.stage), [], 'directory/envelope rejection precedes writes'); f.preserved();
    }
  } finally { f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'alias-copy-cancellation-closes-before-owned-cleanup', async () => {
  const f = await ollamaFixture(), open = io.open, abort = new AbortController(); let copying = false, outputClosed = false, sourceClosed = false;
  try {
    const data = Buffer.alloc(1024 * 1024, 7), executable = fixtureExecutable(f.target), path = f.policy.layout.executable;
    let bytes: Buffer;
    if (f.target.os === 'linux') bytes = zstdCompressSync(Buffer.concat([member(path, executable, { mode: 0o755 }), member('lib/data.dat', data), member('lib/copy.dat', Buffer.alloc(0), { type: '2', link: 'data.dat' }), zeros]));
    else {
      const zip = new ZipFile(), parts: Buffer[] = []; zip.outputStream.on('data', part => parts.push(part)); const end = once(zip.outputStream, 'end');
      zip.addBuffer(executable, path, { mode: 0o100755 }); zip.addBuffer(data, 'lib/data.dat'); zip.addBuffer(Buffer.from('data.dat'), 'lib/copy.dat', { mode: 0o120777 }); zip.end(); await end; bytes = Buffer.concat(parts);
    }
    f.setPolicy({ ...f.policy, asset: { ...f.policy.asset, sha256: digest(bytes), bytes: bytes.length }, limits: { ...f.policy.limits, fileBytes: 2 * 1024 * 1024, expandedBytes: 4 * 1024 * 1024 },
      layout: { ...f.policy.layout, aliases: [{ path: 'lib/copy.dat', target: 'lib/data.dat', kind: 'file' }], requiredFiles: [...f.policy.layout.requiredFiles, 'lib/copy.dat'] } });
    const input = await f.input();
    fs.mkdirSync(join(f.home, 'releases/incumbent'), { recursive: true, mode: 0o700 }); fs.writeFileSync(join(f.home, 'releases/incumbent/marker'), 'retain');
    io.open = (async (...args: Parameters<typeof open>) => {
      const handle = await open(...args), name = String(args[0]).replaceAll('\\', '/'), flags = args[1];
      const alias = name.endsWith('/lib/copy.dat'), source = name.endsWith('/lib/data.dat') && typeof flags === 'number' && !(flags & fs.constants.O_CREAT);
      if (!alias && !source) return handle;
      return new Proxy(handle, { get(target, key) {
        if (key === 'close') return async () => { await target.close(); if (alias) outputClosed = true; if (source) sourceClosed = true; };
        if (key === 'write' && alias) return async (...writeArgs: Parameters<typeof handle.write>) => { const result = await handle.write(...writeArgs); copying = true; abort.abort(); return result; };
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } });
    }) as typeof open; syncBuiltinESMExports();
    await assert.rejects(prepareOllama(f.location, input.policy, input.offer, f.context('a'.repeat(64), abort.signal), { recheck: f.recheck, transport: async () => ({ status: 200, body: Readable.from([bytes]) }) }), { code: 'cancelled' });
    assert.equal(copying, true); assert.equal(outputClosed, true); assert.equal(sourceClosed, true);
    assert.equal(fs.existsSync(input.offer.destination), false); assert.equal((await closedOllamaAttempts(f.location)).length, 1);
    assert.deepEqual(fs.readdirSync(join(f.home, 'releases')), ['incumbent']); assert.equal(fs.readFileSync(join(f.home, 'releases/incumbent/marker'), 'utf8'), 'retain');
  } finally { io.open = open; syncBuiltinESMExports(); await f.cleanup(); }
});
