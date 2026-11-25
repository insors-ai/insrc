import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';
import { constants, zstdCompressSync } from 'node:zlib';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { digest } from '../release-descriptor.js';
import { decodeOllamaZstd } from '../ollama-zstd.js';
import { extractOllamaTarZstd } from '../ollama-tar.js';
import type { OllamaPolicy } from '../ollama-policy.js';

type Entry = { name: string; type?: string; linkname?: string; mode?: number; data?: Buffer };
interface Pack extends Readable { entry(header: Omit<Entry, 'data'>, data: Buffer): void; finalize(): void }
const tar = createRequire(import.meta.url)('tar-stream') as { pack(): Pack };
async function archive(entries: Entry[]): Promise<Buffer> {
  const pack = tar.pack();
  for (const { data, ...header } of entries) pack.entry(header, data ?? Buffer.alloc(0));
  pack.finalize(); const output: Buffer[] = []; for await (const chunk of pack) output.push(Buffer.from(chunk)); return Buffer.concat(output);
}
function policy(bytes: Buffer, expandedBytes = 8 * 1024 * 1024): OllamaPolicy {
  return { schemaVersion: 1, target: { os: 'linux', arch: 'arm64', baseline: 'fixture' }, version: '0.0.1-fixture',
    asset: { url: 'https://github.com/ollama/ollama/releases/download/v0.0.1-fixture/ollama-linux-arm64.tar.zst', sha256: digest(bytes), bytes: bytes.length, format: 'tar.zst' },
    limits: { expandedBytes, fileBytes: expandedBytes, files: 128, windowBytes: 2 ** 25 }, layout: { executable: 'bin/ollama', requiredFiles: ['bin/ollama'], aliases: [] },
    endpoint: 'http://127.0.0.1:11434', modelsRelativePath: 'deps/ollama/data/models', logsRelativePath: 'deps/ollama/logs/server', start: true };
}
const compress = (value: Buffer) => zstdCompressSync(value, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
async function* chunks(bytes: Buffer, width = 65536) { for (let index = 0; index < bytes.length; index += width) yield bytes.subarray(index, index + width); }
async function decode(bytes: Buffer, p = policy(bytes), width = 65536): Promise<Buffer> {
  const output: Buffer[] = []; for await (const value of decodeOllamaZstd(chunks(bytes, width), p)) output.push(value); return Buffer.concat(output);
}
function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'idz-')); let index = 0;
  const input = (data: Buffer) => { const destination = join(root, `payload-${++index}`), file = join(root, `archive-${index}.zst`); mkdirSync(destination, { mode: 0o700 }); writeFileSync(file, data); return { destination, file }; };
  return { root, input, cleanup() { rmSync(root, { recursive: true, force: true }); } };
}

test('linux-zstd-large-window-truncation-and-output-bombs-refuse-before-unsafe-write', async () => {
  const f = fixture();
  try {
    const contents = await archive([{ name: 'bin/ollama', data: Buffer.from('qualified fixture'), mode: 0o755 }]), good = compress(contents);
    for (const width of [1, 7, 65536]) assert.deepEqual(await decode(good, policy(good), width), contents);
    const multiple = Buffer.concat([compress(contents.subarray(0, 700)), compress(contents.subarray(700))]);
    await assert.rejects(decode(multiple), /multiple zstd frames/);
    const huge = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0x80, 1, 0, 0]);
    const secondHuge = Buffer.concat([compress(contents.subarray(0, 512)), huge]);
    for (const invalid of [huge, secondHuge, good.subarray(0, good.length - 1), Buffer.from([1, 2, 3, 4]), Buffer.concat([good, Buffer.from([1])])]) {
      const x = f.input(invalid); await assert.rejects(extractOllamaTarZstd(x.file, x.destination, policy(invalid)), { code: 'archive-unsafe' });
      assert.equal(existsSync(join(f.root, 'releases')), false);
      if (invalid === huge) assert.deepEqual(readdirSync(x.destination), [], 'window must be rejected before output/allocation');
    }
    const corruptChecksum = Buffer.from(good); corruptChecksum[corruptChecksum.length - 1]! ^= 1;
    await assert.rejects(decode(corruptChecksum), { code: 'archive-unsafe' });
    const wrongDigest = policy(good); wrongDigest.asset.sha256 = '0'.repeat(64);
    await assert.rejects(decode(good, wrongDigest), /digest/);
    // Unknown-size RLE block expands beyond the limit without declaring an FCS.
    const header = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 7 << 3]), block = Buffer.alloc(3); block.writeUIntLE((131072 << 3) | 3, 0, 3);
    const bomb = Buffer.concat([header, block, Buffer.from([0])]);
    await assert.rejects(decode(bomb, policy(bomb, 1024)), /output.*bound/);
    const malformed = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, 0, 5, 0, 0]);
    await assert.rejects(decode(malformed), /block/);
    // Declares literals but omits the required sequence-count field.
    const missingSequences = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, 0, 21, 0, 0, 8, 0x61]);
    await assert.rejects(decode(missingSequences));
    if (process.platform !== 'win32') {
      const permissive = f.input(good); chmodSync(permissive.destination, 0o777);
      await assert.rejects(extractOllamaTarZstd(permissive.file, permissive.destination, policy(good)), /owned extraction/);
      assert.deepEqual(readdirSync(permissive.destination), []);
    }
    const paxLine = (key: string) => {
      const body = ` ${key}=${'x'.repeat(40000)}\n`; let size = body.length + 1;
      while (String(size).length + body.length !== size) size = String(size).length + body.length;
      return Buffer.from(String(size) + body);
    };
    for (const entries of [
      [{ name: 'pax1', type: 'pax-header', data: paxLine('SCHILY.xattr.one') }, { name: 'pax2', type: 'pax-header', data: paxLine('SCHILY.xattr.two') }],
      Array.from({ length: 17 }, (_, i) => ({ name: `pax${i}`, type: 'pax-header', data: Buffer.alloc(0) })),
    ]) {
      const encoded = compress(await archive(entries)), x = f.input(encoded);
      await assert.rejects(extractOllamaTarZstd(x.file, x.destination, policy(encoded)), /Cumulative tar metadata/);
      assert.deepEqual(readdirSync(x.destination), []);
    }
  } finally { f.cleanup(); }
});

test('linux-tar-path-collision-device-and-link-escape-inputs-stay-contained', async () => {
  const f = fixture();
  try {
    const data = Buffer.from('private bytes'), good = compress(await archive([
      { name: './', type: 'directory' }, { name: 'bin/ollama', data, mode: 0o755 }, { name: 'lib/源-data', data },
      { name: 'lib/alias', type: 'symlink', linkname: '源-data' }, { name: 'lib/hard', type: 'link', linkname: 'lib/源-data' },
    ]));
    const x = f.input(good), result = await extractOllamaTarZstd(x.file, x.destination, policy(good));
    assert.equal(readFileSync(join(x.destination, 'bin/ollama')).toString(), data.toString());
    assert.equal(result.files.find(file => file.path === 'bin/ollama')!.mode, 0o755);
    assert.deepEqual(result.aliases.map(alias => alias.target), ['lib/源-data', 'lib/源-data']);
    assert.equal(existsSync(join(x.destination, 'lib/alias')), false); assert.equal(existsSync(join(x.destination, 'lib/hard')), false);
    for (const entries of [
      [{ name: '../escaped', data }], [{ name: '/absolute', data }], [{ name: 'C:/drive', data }], [{ name: 'ads:stream', data }],
      [{ name: 'bin/ollama', data }, { name: 'BIN/other', data }], [{ name: 'bin/ollama', data }, { name: 'bin/ollama', data }],
      [{ name: 'lib/device', type: 'character-device' }], [{ name: 'lib/pipe', type: 'fifo' }],
      [{ name: 'lib/link', type: 'symlink', linkname: '../../escaped' }], [{ name: 'lib/link', type: 'link', linkname: '../escaped' }],
      [{ name: 'lib/link', type: 'symlink', linkname: 'target' }, { name: 'lib/link/file', data }],
      [{ name: '.ollama-receipt.json', data }],
    ] as Entry[][]) {
      const bad = compress(await archive(entries)), target = f.input(bad);
      await assert.rejects(extractOllamaTarZstd(target.file, target.destination, policy(bad)));
      assert.equal(existsSync(join(f.root, 'escaped')), false); assert.equal(existsSync(join(f.root, 'releases')), false);
    }
    const invalidTar = await archive([{ name: 'bin/ollama', data }]); invalidTar[0]! ^= 1;
    const invalid = compress(invalidTar), bad = f.input(invalid);
    await assert.rejects(extractOllamaTarZstd(bad.file, bad.destination, policy(invalid)), /checksum/);
    const partial = compress((await archive([{ name: 'bin/ollama', data }])).subarray(0, 514)), end = f.input(partial);
    await assert.rejects(extractOllamaTarZstd(end.file, end.destination, policy(partial)), /Truncated/);
  } finally { f.cleanup(); }
});

test('stream-decoding-cancellation-yields-and-leaves-no-published-payload', async () => {
  const f = fixture(); let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const content = await archive([{ name: 'bin/ollama', data: Buffer.alloc(2 * 1024 * 1024, 1), mode: 0o755 }]), compressed = compress(content);
    const x = f.input(compressed), cancel = new AbortController(); let observed = false;
    timer = setInterval(() => { if (existsSync(join(x.destination, 'bin/ollama'))) { observed = true; cancel.abort(); } }, 1);
    await assert.rejects(extractOllamaTarZstd(x.file, x.destination, policy(compressed), cancel.signal), { code: 'cancelled' });
    clearInterval(timer); timer = undefined; assert.equal(observed, true, 'cancel after extraction begins, not before it is admitted');
    const before = lstatSync(join(x.destination, 'bin/ollama')).size; await delay(30);
    assert.equal(lstatSync(join(x.destination, 'bin/ollama')).size, before); assert.ok(before < 2 * 1024 * 1024);
    assert.equal(existsSync(join(f.root, 'releases')), false);
  } finally { if (timer) clearInterval(timer); f.cleanup(); }
});
