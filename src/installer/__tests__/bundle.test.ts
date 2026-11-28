import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import io from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { ZipFile } from 'yazl';
import { archiveFixture } from './_runtime-fixture.js';
import { ControllerStore } from '../controller-store.js';
import { resolveInstallationLocation } from '../location.js';
import { openPreparedBundle, prepareBundle, resolveBundleDelivery } from '../bundle.js';
import { bundleDelivery } from '../bundle-delivery.js';
import { createCandidateIntegrityOperation, invalidateCandidateIntegrity, rememberCandidateIntegrity, verifyCandidateIntegrity } from '../candidate-integrity.js';
import { digest, canonicalJson, parseInventory, parseReleaseDescriptor, BUNDLE_LIMITS } from '../release-descriptor.js';
import { readInstalledReceipt } from '../installed-receipt.js';
import { runtimeArchive } from '../runtime-policy.js';
import { downloadJson } from '../download.js';
import type { DownloadTransport } from '../download.js';
import type { ControllerSnapshot, Target } from '../contracts.js';
import { InstallerError } from '../contracts.js';
import { parseDevReleaseReceipt } from '../dev.js';
import { verifyPublishedPayload } from '../safe-zip.js';
import { ownedRuntimeHome } from './_owned-runtime-home.js';
const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'fixture-native' };
interface File { path: string; bytes: Buffer; mode?: number }
async function zipBytes(files: File[]): Promise<Buffer> {
  const zip = new ZipFile(), chunks: Buffer[] = [];
  zip.outputStream.on('data', (bytes: Buffer) => chunks.push(bytes)); const done = once(zip.outputStream, 'end');
  for (const file of files) zip.addBuffer(file.bytes, file.path, { mode: file.mode ?? 0o100644, compress: !file.path.endsWith('.tar.gz') && !file.path.endsWith('.zip') });
  zip.end(); await done; return Buffer.concat(chunks);
}
function descriptor(zip: Buffer, inventory: Buffer = Buffer.from('{}')) {
  const official = runtimeArchive(target);
  return { schemaVersion: 2, publication: 'qualified', manifest: { schemaVersion: 1, releaseId: 'candidate', sourceCommit: 'a'.repeat(40), target, runtime: { version: '22.22.1', target, sha256: official.sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' }, payloadSha256: digest(zip), daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js', protocolVersion: 1, compatiblePredecessors: ['old'], migrations: [] }, inventorySha256: digest(inventory), payload: { url: 'https://fixture.invalid/payload.zip', bytes: zip.length, sha256: digest(zip) }, bootstrap: { url: 'https://fixture.invalid/bootstrap', bytes: 1, sha256: digest('b') }, native: { url: 'https://fixture.invalid/native', bytes: 1, sha256: digest('n') } };
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
  const capture = await ownedRuntimeHome('insrc-prep-'), home = capture.root;
  let store: ControllerStore | undefined;
  try {
  store = ControllerStore.acquire(resolveInstallationLocation('fixture', { home }));
  const snapshot: ControllerSnapshot = { schemaVersion: 1, revision: 0, installation: { schemaVersion: 1, installationId: 'fixture', dataHome: home, delivery: { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' }, activeReleaseId: 'old', operationId: 'old-op' }, operation: { operationId: 'old-op', phase: 'ready', candidateId: 'old' } };
  store.commit(snapshot, null); writeFileSync(join(home, 'application-data'), 'retain');
  const archive = await archiveFixture();
  const runtimeResult = await store.ensureRuntime({ version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' }, { transport: async url => {
    const { createReadStream } = await import('node:fs');
    if (url.href !== runtimeArchive(target).url) {
      throw new InstallerError('download-invalid', `Unexpected bundle fixture runtime URL: ${url.href}`);
    }
    const body = createReadStream(archive), closed = new Promise<void>(resolve => body.once('close', resolve));
    capture.trackResource(closed); return { status: 200, body, closed };
  } });
  const runtime = runtimeResult.directory;
  const owner = store;
  return { home, store: owner, capture, snapshot, runtime, archive, async cleanup() { owner.close(); await capture.cleanup(); } };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'resource-close-uncertain') capture.retain(cause);
    store?.close(); await capture.cleanup(); throw cause;
  }
}
const sendBytes = (bytes: Buffer): DownloadTransport => async url => {
  if (url.href !== 'https://fixture.invalid/payload.zip') throw new InstallerError('download-invalid', `Unexpected bundle fixture URL: ${url.href}`);
  return { status: 200, body: Readable.from([bytes]) };
};
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
      await assert.rejects(prepareBundle(f.store, descriptor(zip), { target, transport: sendBytes(zip) }), /path|filename|absolute|invalid/i); unchanged(f);
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
    for (const corpus of corpora) { await assert.rejects(prepareBundle(f.store, descriptor(corpus.zip), { target, transport: sendBytes(corpus.zip), limits: corpus.limits }), corpus.pattern); unchanged(f); }
    assert.equal(readdirSync(f.home).includes('a.txt'), false);
  } finally { await f.cleanup(); }
});

async function completeFixture(f: Awaited<ReturnType<typeof setup>>) {
  const files: File[] = [];
  const native = readFileSync('out/installer/native/control.node'), bootstrap = Buffer.from('// controlled terminal bootstrap fixture');
  files.push({ path: 'out/daemon/index.js', bytes: Buffer.from('// controlled daemon fixture') }, { path: 'out/cli/index.js', bytes: Buffer.from('// controlled TUI fixture') }, { path: 'manager.mjs', bytes: Buffer.from('// controlled manager fixture') }, { path: 'bootstrap.mjs', bytes: bootstrap }, { path: 'native/control.node', bytes: native, mode: 0o100755 });
  files.push({ path: 'out/features/non-control.js', bytes: Buffer.from('// independently verified application module') },
    { path: 'node_modules/fixture-native/addon.node', bytes: Buffer.from('unexecuted native application fixture'), mode: 0o100755 });
  const inventory = Buffer.from(JSON.stringify({ schemaVersion: 1, files: files.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: digest(file.bytes), mode: (file.mode ?? 0o100644) & 0o111 ? 0o755 : 0o644 })) }));
  const zip = await zipBytes([...files, { path: 'inventory.json', bytes: inventory }]), release = descriptor(zip, inventory);
  release.bootstrap.bytes = bootstrap.length; release.bootstrap.sha256 = digest(bootstrap); release.native.bytes = native.length; release.native.sha256 = digest(native);
  return { zip, release };
}

test('download digest target runtime cancellation and retry preserve incumbent', { timeout: 240_000 }, async () => {
  const f = await setup();
  try {
    const { zip, release } = await completeFixture(f), options = { target, predecessorId: 'old', transport: sendBytes(zip) };
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
    await assert.rejects(prepareBundle(f.store, release, { ...options, signal: cancellation.signal, transport: async url => { assert.equal(url.href, release.payload.url); cancellation.abort(); return { status: 200, body: Readable.from([zip]) }; } }), /abort|cancel/i); unchanged(f);
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
  await assert.rejects(downloadJson('https://fixture.invalid', { transport: async url => { assert.equal(url.href, 'https://fixture.invalid/'); return { status: 302, location: 'http://fixture.invalid/insecure', body: Readable.from([]) }; } }), /HTTPS/);
  let count = 0;
  await assert.rejects(downloadJson('https://fixture.invalid', { transport: async url => { assert.ok(['https://fixture.invalid/', 'https://fixture.invalid/again'].includes(url.href)); count++; return { status: 302, location: '/again', body: Readable.from([]) }; } }), /Too many/); assert.equal(count, 9);
  assert.equal(BUNDLE_LIMITS.entries, 65_536);
});


test('inventory bound reserves the archive inventory entry', () => {
  const files = Array.from({ length: BUNDLE_LIMITS.entries - 1 }, (_, index) => ({ path: `files/${index}`, bytes: 0, sha256: digest(''), mode: 0o644 }));
  assert.equal(parseInventory({ schemaVersion: 1, files }).files.length, BUNDLE_LIMITS.entries - 1);
  files.push({ ...files[0]!, path: 'files/overflow' });
  assert.throws(() => parseInventory({ schemaVersion: 1, files }), /inventory/i);
});

test('bundle descriptor2 and installed receipts preserve public manifest1 and reject embedded format1', async () => {
  const release = descriptor(Buffer.from('fixture-payload'));
  const parsed = parseReleaseDescriptor(release, { target });
  assert.equal(parsed.schemaVersion, 2); assert.equal(parsed.manifest.schemaVersion, 1);
  assert.equal('runtimeArchive' in parsed, false); assert.deepEqual(parsed.manifest.runtime, release.manifest.runtime);
  const legacy = { ...release, schemaVersion: 1, runtimeArchive: { path: 'runtime/node.tar.gz', bytes: 1, sha256: runtimeArchive(target).sha256 } };
  const legacyError = { code: 'manifest-invalid', message: 'Legacy embedded-runtime release descriptor format1 is unsupported; use an application-only release' };
  assert.throws(() => parseReleaseDescriptor(legacy, { target }), legacyError);
  assert.throws(() => parseDevReleaseReceipt({ schemaVersion: 1, mode: 'dev' }), {
    code: 'source-incompatible', message: 'Legacy embedded-runtime dev receipt/recipe is unsupported; use application-only receipt2 and dev-v2-app-only',
  });
  const capture = await ownedRuntimeHome('ibl-'), home = capture.root, directory = join(home, 'releases', release.manifest.releaseId);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(join(directory, '.release.json'), canonicalJson(release), { mode: 0o600 });
    const receipt = await readInstalledReceipt(directory, target); assert.equal(receipt.mode, 'bundle'); assert.equal(receipt.manifest.schemaVersion, 1);
    writeFileSync(join(directory, '.release.json'), canonicalJson(legacy));
    await assert.rejects(readInstalledReceipt(directory, target), legacyError);
    assert.equal(lstatSync(directory).isDirectory(), true, 'legacy metadata is diagnosed without adoption or deletion');
  } finally { await capture.cleanup(); }
});

test('application full integrity is bound to its operation candidate and closed producer inventory', { timeout: 240_000 }, async t => {
  const f = await setup(), open = io.open;
  let retained: FileHandle | undefined, closed: (() => void) | undefined;
  try {
    const { zip, release } = await completeFixture(f), location = f.store.location;
    const operation = createCandidateIntegrityOperation(location, 'first-operation', () => f.store.assertHeld());
    const reads = new Map<string, number>();
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const path = String(args[0]);
      if (typeof args[1] === 'number' && (path.endsWith('/out/features/non-control.js') || path.endsWith('/node_modules/fixture-native/addon.node'))) reads.set(path.endsWith('.js') ? 'module' : 'native', (reads.get(path.endsWith('.js') ? 'module' : 'native') ?? 0) + 1);
      return open(...args);
    }); syncBuiltinESMExports();
    const candidate = await prepareBundle(f.store, release, { target, transport: sendBytes(zip), integrity: operation });
    const delivery = bundleDelivery(target);
    assert.deepEqual(Object.fromEntries(reads), { module: 1, native: 1 });
    await delivery.verify(candidate, location, operation); await delivery.verify(candidate, location, operation);
    await openPreparedBundle(location, candidate.releaseId, target);
    assert.deepEqual(Object.fromEntries(reads), { module: 1, native: 1 }, 'same operation reuses original authority; bounded opening does not scan application files');
    await delivery.verify(structuredClone(candidate), location, operation);
    assert.deepEqual(Object.fromEntries(reads), { module: 2, native: 2 }, 'cloned candidate data cannot grant proof reuse');
    const serialized = JSON.parse(JSON.stringify(operation)) as typeof operation;
    await delivery.verify(candidate, location, serialized); await delivery.verify(candidate, location, serialized);
    assert.deepEqual(Object.fromEntries(reads), { module: 4, native: 4 }, 'serialized context performs fresh checks and never caches authority');
    const inventory = await verifyPublishedPayload(candidate.directory, parseReleaseDescriptor(release, { target }), undefined, operation);
    await assert.rejects(rememberCandidateIntegrity(candidate, location, structuredClone(inventory), operation), /original operation-bound full verification/);
    await assert.rejects(delivery.verify(candidate, location, operation), /failed/);
    const reopened = createCandidateIntegrityOperation(location, 'first-operation', () => f.store.assertHeld());
    await assert.rejects(rememberCandidateIntegrity(candidate, location, inventory, reopened), /original operation-bound full verification/);
    const recovered = createCandidateIntegrityOperation(location, 'recovery-operation', () => f.store.assertHeld());
    await delivery.verify(candidate, location, recovered);
    const before = { ...Object.fromEntries(reads) };
    await delivery.verify(candidate, location, recovered);
    assert.deepEqual(Object.fromEntries(reads), before);
    invalidateCandidateIntegrity(recovered);
    await assert.rejects(verifyCandidateIntegrity(candidate, location, recovered), /failed/);
    const cancellation = new AbortController();
    const uncertain = createCandidateIntegrityOperation(location, 'uncertain-close', () => f.store.assertHeld(), cancellation.signal);
    t.mock.method(io, 'open', async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      if (retained || String(args[0]) !== join(candidate.directory, 'out/features/non-control.js')) return handle;
      retained = handle; f.capture.trackResource(new Promise<void>(resolve => { closed = resolve; }));
      return new Proxy(handle, { get(file, key) {
        if (key === 'close') return async () => { cancellation.abort(); return new Promise<void>(() => {}); };
        const value = Reflect.get(file, key); return typeof value === 'function' ? value.bind(file) : value;
      } });
    }); syncBuiltinESMExports();
    const original = lstatSync(candidate.directory);
    await assert.rejects(prepareBundle(f.store, release, { target, integrity: uncertain, signal: cancellation.signal, transport: sendBytes(zip) }), { code: 'resource-close-uncertain' });
    assert.ok(retained); assert.equal((await retained.stat()).isFile(), true);
    assert.equal(lstatSync(candidate.directory).ino, original.ino);
    await assert.rejects(verifyCandidateIntegrity(candidate, location, uncertain), /failed/);
    unchanged(f);
  } finally {
    t.mock.restoreAll(); syncBuiltinESMExports();
    try { await retained?.close(); closed?.(); } catch (cause) { f.capture.retain(cause); throw cause; }
    finally { await f.cleanup(); }
  }
});

test('new recovery rejects truncated non-control modules and native addons and cancellation cannot reuse proof', { timeout: 240_000 }, async () => {
  const f = await setup();
  try {
    const { zip, release } = await completeFixture(f), location = f.store.location, delivery = bundleDelivery(target);
    const first = createCandidateIntegrityOperation(location, 'prepare-operation', () => f.store.assertHeld());
    const candidate = await prepareBundle(f.store, release, { target, transport: sendBytes(zip), integrity: first });
    await delivery.verify(candidate, location, first);
    for (const [index, relative] of ['out/features/non-control.js', 'node_modules/fixture-native/addon.node'].entries()) {
      const path = join(candidate.directory, relative), original = readFileSync(path);
      writeFileSync(path, original.subarray(0, 1));
      const reopened = await openPreparedBundle(location, candidate.releaseId, target);
      const recovering = createCandidateIntegrityOperation(location, `recover-${index}`, () => f.store.assertHeld());
      await assert.rejects(delivery.verify(reopened, location, recovering), /payload membership|payload digest|payload.*identity/i);
      writeFileSync(path, original);
      await assert.rejects(delivery.verify(reopened, location, recovering), /failed/);
      const restored = createCandidateIntegrityOperation(location, `restored-${index}`, () => f.store.assertHeld());
      await delivery.verify(reopened, location, restored);
    }
    const cancellation = new AbortController();
    const cancellable = createCandidateIntegrityOperation(location, 'cancel-operation', () => f.store.assertHeld());
    const prepared = await prepareBundle(f.store, release, { target, transport: sendBytes(zip), integrity: cancellable, signal: cancellation.signal });
    cancellation.abort();
    await assert.rejects(delivery.verify(prepared, location, cancellable), { name: 'AbortError' });
    await assert.rejects(delivery.verify(prepared, location, cancellable), /failed/);
    unchanged(f);
  } finally { await f.cleanup(); }
});

test('bundle fixture transports refuse unknown URLs without a real HTTPS fallback', async () => {
  const transport = sendBytes(Buffer.from('fixture'));
  await assert.rejects(transport(new URL('https://unexpected.invalid/other'), AbortSignal.timeout(1000)), {
    code: 'download-invalid', message: 'Unexpected bundle fixture URL: https://unexpected.invalid/other',
  });
});
