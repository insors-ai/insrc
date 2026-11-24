import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { mkdirSync, mkdtempSync, realpathSync, readFileSync, readdirSync, rmSync, writeFileSync, lstatSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZipFile } from 'yazl';
import { archiveFixture } from './_runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import type { ChildProcess } from 'node:child_process';
import { ControllerStore } from '../controller-store.js';
import { resolveInstallationLocation } from '../location.js';
import { prepareBundle, resolveBundleDelivery } from '../bundle.js';
import { digest, canonicalJson, parseInventory, BUNDLE_LIMITS } from '../release-descriptor.js';
import { runtimeArchive } from '../runtime-policy.js';
import { downloadJson } from '../download.js';
import type { DownloadTransport } from '../download.js';
import type { ControllerSnapshot, Target } from '../contracts.js';
import { collectTree } from '../../../scripts/installer-payload.mjs';
const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'fixture-native' };
const rootName = runtimeArchive(target).root;
interface File { path: string; bytes: Buffer; mode?: number }
async function zipBytes(files: File[]): Promise<Buffer> {
  const zip = new ZipFile(), chunks: Buffer[] = [];
  zip.outputStream.on('data', (bytes: Buffer) => chunks.push(bytes)); const done = once(zip.outputStream, 'end');
  for (const file of files) zip.addBuffer(file.bytes, file.path, { mode: file.mode ?? 0o100644, compress: !file.path.endsWith('.tar.gz') && !file.path.endsWith('.zip') });
  zip.end(); await done; return Buffer.concat(chunks);
}
function descriptor(zip: Buffer, inventory: Buffer = Buffer.from('{}')) {
  const official = runtimeArchive(target);
  return { schemaVersion: 1, publication: 'qualified', manifest: { schemaVersion: 1, releaseId: 'candidate', sourceCommit: 'a'.repeat(40), target, runtime: { version: '22.22.1', target, sha256: official.sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' }, payloadSha256: digest(zip), daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js', protocolVersion: 1, compatiblePredecessors: ['old'], migrations: [] }, inventorySha256: digest(inventory), payload: { url: 'https://fixture.invalid/payload.zip', bytes: zip.length, sha256: digest(zip) }, bootstrap: { url: 'https://fixture.invalid/bootstrap', bytes: 1, sha256: digest('b') }, native: { url: 'https://fixture.invalid/native', bytes: 1, sha256: digest('n') }, runtimeArchive: { path: 'runtime/node.tar.gz', sha256: official.sha256, bytes: 1 } };
}
function zipAttribute(zip: Buffer, update: (buffer: Buffer, offset: number, central: boolean) => void): Buffer {
  const output = Buffer.from(zip);
  for (let i = 0; i < output.length - 46; i++) {
    if (output.readUInt32LE(i) === 0x02014b50) update(output, i, true);
    else if (output.readUInt32LE(i) === 0x04034b50) update(output, i, false);
  }
  return output;
}
async function setup() {
  const home = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-prep-')), children: ChildProcess[] = [];
  const store = ControllerStore.acquire(resolveInstallationLocation('fixture', { home }));
  const snapshot: ControllerSnapshot = { schemaVersion: 1, revision: 0, installation: { schemaVersion: 1, installationId: 'fixture', dataHome: home, delivery: { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' }, activeReleaseId: 'old', operationId: 'old-op' }, operation: { operationId: 'old-op', phase: 'ready', candidateId: 'old' } };
  store.commit(snapshot, null); writeFileSync(join(home, 'application-data'), 'retain');
  const runtimeStage = join(home, 'trusted-runtime'); mkdirSync(runtimeStage);
  const archive = await archiveFixture();
  const child = target.os === 'win32'
    ? spawnFixture('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${runtimeStage.replaceAll("'", "''")}'`], { stdio: 'ignore' })
    : spawnFixture('tar', ['-xzf', archive, '-C', runtimeStage, `${rootName}/bin/node`, `${rootName}/lib/node_modules/npm`, `${rootName}/include/node`, `${rootName}/LICENSE`], { stdio: 'ignore' });
  children.push(child); assert.deepEqual(await once(child, 'close'), [0, null]);
  const runtime = join(runtimeStage, rootName);
  if (target.os === 'win32') for (const name of ['npm', 'npm.cmd', 'npm.ps1', 'npx', 'npx.cmd', 'npx.ps1', 'corepack', 'corepack.cmd', 'corepack.ps1']) rmSync(join(runtime, name), { force: true });
  return { home, store, snapshot, runtime, archive, async cleanup() { store.close(); await stopOwnedChildren(children); rmSync(home, { recursive: true, force: true }); } };
}
const sendBytes = (bytes: Buffer): DownloadTransport => async () => ({ status: 200, body: Readable.from([bytes]) });
function unchanged(f: Awaited<ReturnType<typeof setup>>): void {
  assert.deepEqual(f.store.inspect(), { kind: 'present', snapshot: f.snapshot }); assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain');
  const staging = join(f.home, 'install/staging'); try { assert.deepEqual(readdirSync(staging), []); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

test('hostile ZIP corpus cannot escape staging or exceed bounded extraction', { timeout: 180_000 }, async () => {
  const f = await setup();
  try {
    const base = await zipBytes([{ path: 'safe.txt', bytes: Buffer.from('safe') }]);
    for (const path of ['../a.txt', '/bad.txt', '//a/file', 'safe\0txt', 'C:/a.txt', 'safe:txt', 'saf\\e.tx', 'CON.file', 'safe.tx.']) {
      const zip = Buffer.from(base.toString('latin1').replaceAll('safe.txt', path), 'latin1');
      await assert.rejects(prepareBundle(f.store, descriptor(zip), { target, runtimeDirectory: f.runtime, transport: sendBytes(zip) }), /path|filename|absolute|invalid/i); unchanged(f);
    }
    const corpora: Array<{ zip: Buffer; pattern: RegExp; limits?: { entries?: number; entryBytes?: number; expanded?: number; ratio?: number } }> = [
      { zip: await zipBytes([{ path: 'safe.txt', bytes: Buffer.from('a') }, { path: 'safe.txt', bytes: Buffer.from('b') }]), pattern: /Duplicate|colliding/ },
      { zip: await zipBytes([{ path: 'Folder/a', bytes: Buffer.from('a') }, { path: 'folder/b', bytes: Buffer.from('b') }]), pattern: /Aliasing|conflicting/ },
      { zip: await zipBytes([{ path: 'café', bytes: Buffer.from('a') }, { path: 'cafe\u0301', bytes: Buffer.from('b') }]), pattern: /Aliasing|colliding|Duplicate/ },
      { zip: await zipBytes([{ path: 'a/'.repeat(65) + 'file', bytes: Buffer.from('a') }]), pattern: /depth|bound/ },
      { zip: zipAttribute(base, (b, i, central) => { if (central) b.writeUInt32LE((0o120777 * 65536) >>> 0, i + 38); }), pattern: /Symlink|special/ },
      { zip: zipAttribute(base, (b, i, central) => { if (central) b.writeUInt32LE((0o010600 * 65536) >>> 0, i + 38); }), pattern: /special/ },
      { zip: zipAttribute(base, (b, i, central) => b.writeUInt16LE(b.readUInt16LE(i + (central ? 8 : 6)) | 1, i + (central ? 8 : 6))), pattern: /Encrypted|unsupported/ },
      { zip: zipAttribute(base, (b, i, central) => b.writeUInt16LE(99, i + (central ? 10 : 8))), pattern: /unsupported/ },
      { zip: base.subarray(0, base.length - 12), pattern: /central|signature|range|end|invalid/i },
      { zip: await zipBytes([{ path: 'bomb', bytes: Buffer.alloc(64 * 1024) }]), pattern: /size|ratio|bound/, limits: { entryBytes: 1024 } },
      { zip: await zipBytes([{ path: 'bytes', bytes: Buffer.alloc(512) }]), pattern: /size|ratio|bound/, limits: { expanded: 256 } },
      { zip: await zipBytes([{ path: 'bomb', bytes: Buffer.alloc(64 * 1024) }]), pattern: /size|ratio|bound/, limits: { ratio: 2 } },
      { zip: await zipBytes([{ path: 'a', bytes: Buffer.from('a') }, { path: 'b', bytes: Buffer.from('b') }]), pattern: /count|bound/, limits: { entries: 1 } },
    ];
    for (const corpus of corpora) { await assert.rejects(prepareBundle(f.store, descriptor(corpus.zip), { target, runtimeDirectory: f.runtime, transport: sendBytes(corpus.zip), limits: corpus.limits }), corpus.pattern); unchanged(f); }
    assert.equal(readdirSync(f.home).includes('a.txt'), false);
  } finally { await f.cleanup(); }
});

async function completeFixture(f: Awaited<ReturnType<typeof setup>>) {
  const files: File[] = [...collectTree(f.runtime, f.runtime, 'tools/node')].map(([path, value]) => ({ path, bytes: value.bytes, mode: 0o100000 | value.mode }));
  const native = readFileSync('out/installer/native/control.node'), bootstrap = Buffer.from('// controlled terminal bootstrap fixture');
  files.push({ path: 'out/daemon/index.js', bytes: Buffer.from('// controlled daemon fixture') }, { path: 'out/cli/index.js', bytes: Buffer.from('// controlled TUI fixture') }, { path: 'manager.mjs', bytes: Buffer.from('// controlled manager fixture') }, { path: 'bootstrap.mjs', bytes: bootstrap }, { path: 'native/control.node', bytes: native, mode: 0o100755 }, { path: 'runtime/node.tar.gz', bytes: readFileSync(f.archive) });
  const inventory = Buffer.from(JSON.stringify({ schemaVersion: 1, files: files.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: digest(file.bytes), mode: (file.mode ?? 0o100644) & 0o111 ? 0o755 : 0o644 })) }));
  const zip = await zipBytes([...files, { path: 'inventory.json', bytes: inventory }]), release = descriptor(zip, inventory);
  release.bootstrap.bytes = bootstrap.length; release.bootstrap.sha256 = digest(bootstrap); release.native.bytes = native.length; release.native.sha256 = digest(native); release.runtimeArchive.bytes = readFileSync(f.archive).length;
  return { zip, release };
}

test('download digest target runtime cancellation and retry preserve incumbent', { timeout: 240_000 }, async () => {
  const f = await setup();
  try {
    const { zip, release } = await completeFixture(f), options = { target, predecessorId: 'old', runtimeDirectory: f.runtime, transport: sendBytes(zip) };
    await assert.rejects(prepareBundle(f.store, { ...release, payload: { ...release.payload, sha256: '0'.repeat(64) } }, options), /identities|digest/); unchanged(f);
    const corruptDigest = structuredClone(release); corruptDigest.payload.sha256 = '0'.repeat(64); corruptDigest.manifest.payloadSha256 = '0'.repeat(64);
    await assert.rejects(prepareBundle(f.store, corruptDigest, options), /size or digest/); unchanged(f);
    await assert.rejects(prepareBundle(f.store, { ...release, publication: 'fixture' }, options), /unqualified|Invalid/); unchanged(f);
    const incompatible = structuredClone(release); incompatible.manifest.compatiblePredecessors = [];
    await assert.rejects(prepareBundle(f.store, incompatible, { ...options, predecessorId: undefined }), /predecessor/); unchanged(f);
    const wrong = structuredClone(release); wrong.manifest.target.arch = target.arch === 'arm64' ? 'x64' : 'arm64';
    await assert.rejects(prepareBundle(f.store, wrong, options), /target/); unchanged(f);
    const runtime = structuredClone(release); runtime.manifest.runtime.version = '26.0.0';
    await assert.rejects(prepareBundle(f.store, runtime, options), /Invalid|invalid/); unchanged(f);
    await assert.rejects(prepareBundle(f.store, release, { ...options, predecessorId: 'unsupported' }), /predecessor/); unchanged(f);
    await assert.rejects(prepareBundle(f.store, release, { ...options, transport: async () => { throw new Error('network-failed'); } }), /network-failed/); unchanged(f);
    await assert.rejects(prepareBundle(f.store, release, { ...options, transport: sendBytes(zip.subarray(0, zip.length - 12)) }), /size or digest/); unchanged(f);
    await assert.rejects(prepareBundle(f.store, { ...release, inventorySha256: '0'.repeat(64) }, options), /Inventory identity/); unchanged(f);
    const cancellation = new AbortController();
    await assert.rejects(prepareBundle(f.store, release, { ...options, signal: cancellation.signal, transport: async () => { cancellation.abort(); return { status: 200, body: Readable.from([zip]) }; } }), /abort|cancel/i); unchanged(f);
    const prepared = await prepareBundle(f.store, release, options); unchanged(f);
    assert.equal(prepared.directory, join(f.home, 'releases/candidate'));
    const before = lstatSync(join(prepared.directory, 'manager.mjs')).ino;
    const retried = await prepareBundle(f.store, release, { ...options, transport: async () => { throw new Error('Retry should validate existing immutable bytes without downloading'); } });
    assert.equal(retried.payloadSha256, prepared.payloadSha256); assert.equal(lstatSync(join(prepared.directory, 'manager.mjs')).ino, before); unchanged(f);
    writeFileSync(join(prepared.directory, 'manager.mjs'), 'tampered');
    await assert.rejects(prepareBundle(f.store, release, options), /differs|membership|digest/i); unchanged(f);
  } finally { await f.cleanup(); }
});

test('release discovery rejects insecure redirects and never falls back to dev', async () => {
  await assert.rejects(resolveBundleDelivery({ mode: 'dev', repository: 'repo', branch: 'main' }, target), /bundle delivery/);
  await assert.rejects(downloadJson('http://fixture.invalid'), /HTTPS/);
  await assert.rejects(downloadJson('https://fixture.invalid', { transport: async () => ({ status: 302, location: 'http://fixture.invalid/insecure', body: Readable.from([]) }) }), /HTTPS/);
  let count = 0;
  await assert.rejects(downloadJson('https://fixture.invalid', { transport: async () => { count++; return { status: 302, location: '/again', body: Readable.from([]) }; } }), /Too many/); assert.equal(count, 9);
  assert.equal(BUNDLE_LIMITS.entries, 65_536);
});


test('inventory bound reserves the archive inventory entry', () => {
  const files = Array.from({ length: BUNDLE_LIMITS.entries - 1 }, (_, index) => ({ path: `files/${index}`, bytes: 0, sha256: digest(''), mode: 0o644 }));
  assert.equal(parseInventory({ schemaVersion: 1, files }).files.length, BUNDLE_LIMITS.entries - 1);
  files.push({ ...files[0]!, path: 'files/overflow' });
  assert.throws(() => parseInventory({ schemaVersion: 1, files }), /inventory/i);
});
