import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';
import { ZipFile } from 'yazl';
import { zstdCompressSync } from 'node:zlib';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { extractOllamaArchive } from '../ollama-archive.js';
import { extractOllamaZip } from '../ollama-zip.js';
import { digest } from '../release-descriptor.js';
import { controlBinding } from '../native.js';
import type { OllamaPolicy } from '../ollama-policy.js';

interface Member { path: string; bytes: Buffer; mode?: number }
async function zip(files: Member[], compress = false) {
  const output = new ZipFile(), parts: Buffer[] = []; output.outputStream.on('data', (chunk: Buffer) => parts.push(chunk));
  const done = once(output.outputStream, 'end');
  for (const file of files) output.addBuffer(file.bytes, file.path, { mode: file.mode ?? 0o100644, compress });
  output.end(); await done; return Buffer.concat(parts);
}
function executable(os: OllamaPolicy['target']['os'], arm = true) {
  const data = Buffer.alloc(512);
  if (os === 'linux') { data.set([127, 69, 76, 70, 2, 1]); data.writeUInt16LE(3, 16); data.writeUInt16LE(arm ? 183 : 62, 18); }
  if (os === 'darwin') { data.writeUInt32LE(0xfeedfacf); data.writeUInt32LE(arm ? 0x0100000c : 0x01000007, 4); data.writeUInt32LE(2, 12); }
  if (os === 'win32') { data.write('MZ'); data.writeUInt32LE(128, 60); data.writeUInt32LE(0x4550, 128); data.writeUInt16LE(arm ? 0xaa64 : 0x8664, 132); data.writeUInt16LE(240, 148); data.writeUInt16LE(2, 150); data.writeUInt16LE(0x20b, 152); }
  return data;
}
function library(os: OllamaPolicy['target']['os'], arm = true) {
  const data = executable(os, arm);
  if (os === 'darwin') data.writeUInt32LE(6, 12); else if (os === 'win32') data.writeUInt16LE(0x2002, 150);
  return data;
}
function policy(bytes: Buffer, os: OllamaPolicy['target']['os'] = 'win32'): OllamaPolicy {
  const executable = os === 'win32' ? 'ollama.exe' : os === 'linux' ? 'bin/ollama' : 'Ollama.app/Contents/Resources/ollama';
  return { schemaVersion: 1, target: { os, arch: 'arm64', baseline: 'fixture' }, version: '0.0.1-fixture',
    asset: { url: `https://github.com/ollama/ollama/releases/download/v0.0.1-fixture/ollama-${os}-arm64.${os === 'linux' ? 'tar.zst' : 'zip'}`, sha256: digest(bytes), bytes: bytes.length, format: os === 'linux' ? 'tar.zst' : 'zip' },
    limits: { expandedBytes: 16 * 1024 * 1024, fileBytes: 8 * 1024 * 1024, files: 256, windowBytes: 2 ** 25 },
    layout: { executable, requiredFiles: [executable, 'lib/runtime.dat'], aliases: [] }, endpoint: 'http://127.0.0.1:11434',
    modelsRelativePath: 'deps/ollama/data/models', logsRelativePath: 'deps/ollama/logs/server', start: true };
}
function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'ioa-')); let serial = 0;
  if (process.platform === 'win32') controlBinding().protect(root);
  return { root, input(bytes: Buffer) { const stage = join(root, `stage${++serial}`), archive = join(root, `archive${serial}`); mkdirSync(stage, { mode: 0o700 }); writeFileSync(archive, bytes); return { stage, archive }; }, cleanup() { rmSync(root, { recursive: true, force: true }); } };
}
const tar = createRequire(import.meta.url)('tar-stream') as { pack(): Readable & { entry(header: object, data?: Buffer): void; finalize(): void } };
async function tarBytes(files: Member[], aliases: Array<{ path: string; target: string; type?: string }>) {
  const output = tar.pack(), parts: Buffer[] = [];
  for (const file of files) output.entry({ name: file.path, mode: (file.mode ?? 0o644) & 0o777 }, file.bytes);
  for (const alias of aliases) output.entry({ name: alias.path, type: alias.type ?? 'symlink', linkname: alias.target });
  output.finalize(); for await (const chunk of output) parts.push(Buffer.from(chunk)); return zstdCompressSync(Buffer.concat(parts));
}

test('qualified-zip-app-layout-requires-correct-executable-and-library-closure', async () => {
  const f = fixture();
  try {
    for (const os of ['win32', 'darwin'] as const) {
      const shape = policy(Buffer.from('x'), os), files = [{ path: shape.layout.executable, bytes: executable(os), mode: 0o100755 }, { path: 'lib/runtime.dat', bytes: Buffer.from('required library closure') }];
      const binaryLibrary = os === 'win32' ? 'lib/ollama.dll' : 'lib/libollama.dylib';
      files.push({ path: binaryLibrary, bytes: library(os) });
      const bytes = await zip(files), p = policy(bytes, os), good = f.input(bytes);
      p.layout.requiredFiles.push(binaryLibrary);
      const inventory = await extractOllamaArchive(good.archive, good.stage, p); assert.equal(inventory.length, 3);
      assert.deepEqual(readFileSync(join(good.stage, p.layout.executable)), executable(os));
      const deflated = await zip(files, true), compressed = f.input(deflated);
      const cp = policy(deflated, os); cp.layout.requiredFiles.push(binaryLibrary);
      await extractOllamaArchive(compressed.archive, compressed.stage, cp);
      for (const broken of [files.slice(0, 2), [{ ...files[0]!, bytes: executable(os, false) }, ...files.slice(1)], [{ ...files[0]!, bytes: library(os) }, ...files.slice(1)],
        [files[0]!, files[1]!, { ...files[2]!, bytes: library(os, false) }], [files[0]!, files[1]!, { ...files[2]!, bytes: Buffer.from('wrong library bytes') }],
        [{ ...files[0]!, bytes: Buffer.from('not an executable') }, ...files.slice(1)]]) {
        const bad = await zip(broken), x = f.input(bad), p = policy(bad, os); p.layout.requiredFiles.push(binaryLibrary);
        await assert.rejects(extractOllamaArchive(x.archive, x.stage, p), /layout|missing|executable|library/i);
      }
      const other = structuredClone(p); other.layout.executable = 'OllamaSetup.exe'; other.layout.requiredFiles.push('OllamaSetup.exe');
      const wrong = f.input(bytes); await assert.rejects(extractOllamaArchive(wrong.archive, wrong.stage, other), /missing/i);
      if (os === 'darwin') {
        const fat = Buffer.alloc(28 + executable(os).length); fat.writeUInt32BE(0xcafebabe); fat.writeUInt32BE(1, 4);
        fat.writeUInt32BE(0x0100000c, 8); fat.writeUInt32BE(28, 16); fat.writeUInt32BE(executable(os).length, 20); executable(os).copy(fat, 28);
        const bytes = await zip([{ ...files[0]!, bytes: fat }, files[1]!]), x = f.input(bytes);
        await extractOllamaArchive(x.archive, x.stage, policy(bytes, os));
        fat.writeUInt32BE(0xffffffff, 16);
        const invalid = await zip([{ ...files[0]!, bytes: fat }, files[1]!]), bad = f.input(invalid);
        await assert.rejects(extractOllamaArchive(bad.archive, bad.stage, policy(invalid, os)), /slice/);
      }
    }
  } finally { f.cleanup(); }
});

test('internal-archive-links-materialize-only-qualified-contained-files', async () => {
  const f = fixture();
  try {
    const files = [{ path: 'bin/ollama', bytes: executable('linux'), mode: 0o755 }, { path: 'lib/runtime.dat', bytes: Buffer.from('library') }];
    const bytes = await tarBytes(files, [{ path: 'lib/alias', target: 'runtime.dat' }, { path: 'lib/hard', target: 'lib/alias', type: 'link' }, { path: 'copy', target: 'lib' }]);
    const p = policy(bytes, 'linux');
    p.layout.aliases = [{ path: 'lib/alias', target: 'lib/runtime.dat', kind: 'file' }, { path: 'lib/hard', target: 'lib/alias', kind: 'file' }, { path: 'copy', target: 'lib', kind: 'directory' }];
    p.layout.requiredFiles.push('copy/runtime.dat', 'copy/alias', 'copy/hard');
    const x = f.input(bytes), inventory = await extractOllamaArchive(x.archive, x.stage, p); assert.equal(inventory.length, 7);
    for (const path of ['lib/alias', 'lib/hard', 'copy/runtime.dat', 'copy/alias', 'copy/hard']) {
      const stat = lstatSync(join(x.stage, path)); assert.equal(stat.isFile(), true); assert.equal(stat.nlink, 1); assert.equal(readFileSync(join(x.stage, path), 'utf8'), 'library');
    }
    for (const update of [(p: OllamaPolicy) => { p.layout.aliases = []; }, (p: OllamaPolicy) => { p.layout.aliases[0]!.target = 'lib/other'; },
      (p: OllamaPolicy) => { p.layout.requiredFiles = p.layout.requiredFiles.filter(path => path !== 'copy/alias'); },
      (p: OllamaPolicy) => { p.layout.aliases[0]!.target = 'lib/hard'; }, (p: OllamaPolicy) => { p.layout.aliases[2]!.kind = 'file'; }]) {
      const invalid = structuredClone(p); update(invalid); const bad = f.input(bytes); await assert.rejects(extractOllamaArchive(bad.archive, bad.stage, invalid));
      assert.equal(existsSync(join(bad.stage, 'copy/runtime.dat')), false, 'resolve complete alias plan before copies');
    }
    const zipFiles = [{ path: 'ollama.exe', bytes: executable('win32'), mode: 0o100755 }, { path: 'lib/runtime.dat', bytes: Buffer.from('library') }, { path: 'lib/alias', bytes: Buffer.from('runtime.dat'), mode: 0o120777 }];
    const zipData = await zip(zipFiles), zp = policy(zipData); zp.layout.aliases = [{ path: 'lib/alias', target: 'lib/runtime.dat', kind: 'file' }];
    const z = f.input(zipData); await extractOllamaArchive(z.archive, z.stage, zp); assert.equal(lstatSync(join(z.stage, 'lib/alias')).isFile(), true);
    const framework = 'Ollama.app/Contents/Frameworks/Foo.framework', cli = 'Ollama.app/Contents/Resources/ollama';
    const app = await zip([{ path: cli, bytes: executable('darwin'), mode: 0o100755 }, { path: 'lib/runtime.dat', bytes: Buffer.from('library') },
      { path: `${framework}/Versions/A/Foo`, bytes: library('darwin') },
      { path: `${framework}/Foo`, bytes: Buffer.from('Versions/Current/Foo'), mode: 0o120777 },
      { path: `${framework}/Versions/Current`, bytes: Buffer.from('A'), mode: 0o120777 }]);
    const ap = policy(app, 'darwin'); ap.layout.aliases = [{ path: `${framework}/Foo`, target: `${framework}/Versions/Current/Foo`, kind: 'file' },
      { path: `${framework}/Versions/Current`, target: `${framework}/Versions/A`, kind: 'directory' }];
    ap.layout.requiredFiles.push(`${framework}/Versions/A/Foo`, `${framework}/Versions/Current/Foo`, `${framework}/Foo`);
    const a = f.input(app); await extractOllamaArchive(a.archive, a.stage, ap);
    assert.equal(lstatSync(join(a.stage, `${framework}/Versions/Current`)).isDirectory(), true);
    assert.equal(lstatSync(join(a.stage, `${framework}/Foo`)).isFile(), true);
    assert.deepEqual(readFileSync(join(a.stage, `${framework}/Foo`)), library('darwin'));
    const large = await tarBytes([files[0]!, { path: 'lib/runtime.dat', bytes: Buffer.alloc(1024 * 1024) }], [{ path: 'alias', target: 'lib/runtime.dat' }]);
    const lp = policy(large, 'linux'); lp.limits.expandedBytes = 1200000; lp.limits.fileBytes = 1100000; lp.layout.aliases = [{ path: 'alias', target: 'lib/runtime.dat', kind: 'file' }];
    const bomb = f.input(large); await assert.rejects(extractOllamaArchive(bomb.archive, bomb.stage, lp), /expansion/); assert.equal(existsSync(join(bomb.stage, 'alias')), false);
  } finally { f.cleanup(); }
});

function mutate(zip: Buffer, change: (data: Buffer, offset: number, central: boolean) => void) {
  const data = Buffer.from(zip);
  for (let i = 0; i <= data.length - 46; i++) { const magic = data.readUInt32LE(i); if (magic === 0x02014b50) change(data, i, true); else if (magic === 0x04034b50) change(data, i, false); }
  return data;
}
test('zip-and-layout-escapes-collisions-and-abort-preserve-existing-bytes', async () => {
  const f = fixture(); let timer: ReturnType<typeof setInterval> | undefined;
  try {
    const base = await zip([{ path: 'safe.txt', bytes: Buffer.from('safe') }]);
    for (const name of ['../a.txt', '/bad.txt', 'C:/a.txt', 'ads:byte', 'CON.file', 'bad\\name']) {
      const data = Buffer.from(base.toString('latin1').replaceAll('safe.txt', name), 'latin1'), x = f.input(data);
      await assert.rejects(extractOllamaZip(x.archive, x.stage, policy(data))); assert.equal(existsSync(join(f.root, 'a.txt')), false);
    }
    for (const data of [await zip([{ path: 'Folder/a', bytes: Buffer.alloc(1) }, { path: 'folder/b', bytes: Buffer.alloc(1) }]),
      await zip([{ path: 'café', bytes: Buffer.alloc(1) }, { path: 'cafe\u0301', bytes: Buffer.alloc(1) }]),
      mutate(base, (b, i, central) => { if (central) b.writeUInt32LE((0o010600 * 65536) >>> 0, i + 38); }),
      mutate(base, (b, i, central) => { if (central) b.writeUInt32LE((b.readUInt32LE(i + 38) | 0x400) >>> 0, i + 38); }),
      mutate(base, (b, i, central) => b.writeUInt16LE(b.readUInt16LE(i + (central ? 8 : 6)) | 1, i + (central ? 8 : 6))),
      mutate(base, (b, i, central) => { if (!central) b[i + 30]! ^= 1; }),
      mutate(base, (b, i, central) => { if (central) b.writeUInt32LE((b.readUInt32LE(i + 16) ^ 1) >>> 0, i + 16); }), base.subarray(0, base.length - 5),
      mutate(base, (b, i, central) => { const offset = central ? 16 : 14; b.writeUInt32LE((b.readUInt32LE(i + offset) ^ 1) >>> 0, i + offset); }),
      await zip([{ path: 'lib/alias', bytes: Buffer.from('../../escape'), mode: 0o120777 }]),
    ]) { const x = f.input(data); await assert.rejects(extractOllamaZip(x.archive, x.stage, policy(data))); assert.equal(existsSync(join(f.root, 'escape')), false); assert.deepEqual(readdirSync(x.stage), [], 'invalid ZIP data must fail before any write'); }
    const bytes = await zip([{ path: 'ollama.exe', bytes: executable('win32'), mode: 0o100755 }, { path: 'lib/runtime.dat', bytes: Buffer.alloc(2 * 1024 * 1024) }]);
    const occupied = f.input(bytes); writeFileSync(join(occupied.stage, 'sentinel'), 'retain');
    await assert.rejects(extractOllamaArchive(occupied.archive, occupied.stage, policy(bytes)), /private owned/); assert.deepEqual(readdirSync(occupied.stage), ['sentinel']);
    assert.equal(controlBinding().safePath(f.root, true, true), true);
    assert.equal(controlBinding().safePath(join(occupied.stage, 'sentinel'), false, false), true);
    const linked = join(f.root, 'linked'); symlinkSync(occupied.stage, linked, process.platform === 'win32' ? 'junction' : 'dir'); const linkInput = f.input(bytes);
    assert.equal(controlBinding().safePath(linked, true, false), false);
    await assert.rejects(extractOllamaArchive(linkInput.archive, linked, policy(bytes)), /private owned/); assert.equal(readFileSync(join(occupied.stage, 'sentinel'), 'utf8'), 'retain');
    const x = f.input(bytes), cancel = new AbortController(); let seen = false;
    timer = setInterval(() => { if (existsSync(join(x.stage, 'lib/runtime.dat'))) { seen = true; cancel.abort(); } }, 1);
    await assert.rejects(extractOllamaArchive(x.archive, x.stage, policy(bytes), cancel.signal), { code: 'cancelled' });
    clearInterval(timer); timer = undefined; assert.equal(seen, true);
    const before = lstatSync(join(x.stage, 'lib/runtime.dat')).size; await delay(30); assert.equal(lstatSync(join(x.stage, 'lib/runtime.dat')).size, before);
    assert.equal(existsSync(join(f.root, 'releases')), false);
  } finally { if (timer) clearInterval(timer); f.cleanup(); }
});
