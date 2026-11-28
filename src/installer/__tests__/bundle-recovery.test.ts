import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createReadStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { ZipFile } from 'yazl';
import { privateRuntimeTest } from './_private-runtime-test.js';
import { archiveFixture } from './_runtime-fixture.js';
import { managerFixture } from './_manager-fixture.js';
import { bundleDelivery } from '../bundle-delivery.js';
import { ControllerStore } from '../controller-store.js';
import { InstallerError, MAX_CONTROL_BYTES } from '../contracts.js';
import { BUNDLE_LIMITS, canonicalJson, digest, parseReleaseDescriptor } from '../release-descriptor.js';
import type { ReleaseDescriptor } from '../release-descriptor.js';
import { runtimeArchive } from '../runtime-policy.js';
import { requireTerminal } from '../terminal-admission.js';
import type { DownloadTransport } from '../download.js';
import { ownedRuntimeHome } from './_owned-runtime-home.js';

function runtimeTransport(archive: string, expectedUrl: string, capture: Awaited<ReturnType<typeof ownedRuntimeHome>>): DownloadTransport {
  return async url => {
    if (url.href !== expectedUrl) throw new InstallerError('download-invalid', `Unexpected bundle recovery runtime URL: ${url.href}`);
    const body = createReadStream(archive), closed = new Promise<void>(resolve => body.once('close', resolve));
    capture.trackResource(closed); return { status: 200, body, closed };
  };
}
async function seedRuntime(f: ReturnType<typeof managerFixture>, capture: Awaited<ReturnType<typeof ownedRuntimeHome>>): Promise<void> {
  const archive = await archiveFixture(), official = runtimeArchive(f.target), store = ControllerStore.acquire(f.location);
  try { await store.ensureRuntime({ ...f.next.manifest.runtime, sha256: official.sha256 }, { transport: runtimeTransport(archive, official.url, capture) }); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'resource-close-uncertain') capture.retain(cause); throw cause; }
  finally { store.close(); }
}
async function payload(f: ReturnType<typeof managerFixture>): Promise<{ zip: Buffer; descriptor: ReleaseDescriptor }> {
  const native = readFileSync('out/installer/native/control.node'), bootstrap = Buffer.from('// controlled bootstrap fixture');
  const files = [
    { path: 'out/daemon/index.js', bytes: Buffer.from('// controlled daemon fixture'), mode: 0o644 },
    { path: 'out/cli/index.js', bytes: Buffer.from('// controlled TUI fixture'), mode: 0o644 },
    { path: 'manager.mjs', bytes: Buffer.from('// controlled manager fixture'), mode: 0o644 },
    { path: 'bootstrap.mjs', bytes: bootstrap, mode: 0o644 }, { path: 'native/control.node', bytes: native, mode: 0o755 },
  ];
  const inventory = Buffer.from(JSON.stringify({ schemaVersion: 1, files: files.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: digest(file.bytes), mode: file.mode })) }));
  const zip = new ZipFile(), chunks: Buffer[] = []; zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk)); const closed = once(zip.outputStream, 'end');
  for (const file of [...files, { path: 'inventory.json', bytes: inventory, mode: 0o644 }]) zip.addBuffer(file.bytes, file.path, { mode: 0o100000 | file.mode });
  zip.end(); await closed; const bytes = Buffer.concat(chunks), official = runtimeArchive(f.target);
  const descriptor = parseReleaseDescriptor({ schemaVersion: 2, publication: 'qualified',
    manifest: { ...f.next.manifest, releaseId: 'durable-candidate', runtime: { ...f.next.manifest.runtime, sha256: official.sha256 }, payloadSha256: digest(bytes) },
    inventorySha256: digest(inventory), payload: { url: 'https://fixture.invalid/payload.zip', bytes: bytes.length, sha256: digest(bytes) },
    bootstrap: { url: 'https://fixture.invalid/bootstrap', bytes: bootstrap.length, sha256: digest(bootstrap) },
    native: { url: 'https://fixture.invalid/native', bytes: native.length, sha256: digest(native) } }, { target: f.target, predecessorId: 'old' });
  return { zip: bytes, descriptor };
}

privateRuntimeTest(import.meta.url, 'fresh-bundle-peer-validates-durable-descriptor-without-resolve-map', async () => {
  const capture = await ownedRuntimeHome('ibr-');
  try {
    const f = managerFixture(capture.root, true);
    await seedRuntime(f, capture);
    const { zip, descriptor } = await payload(f); let discovery = 0, downloads = 0;
    const transport: DownloadTransport = async input => {
      const url = input.href;
      if (url === descriptor.payload.url) { downloads++; return { status: 200, body: Readable.from([zip]) }; }
      if (url !== 'https://api.github.com/repos/insors-ai/insrc/releases/latest' && url !== 'https://fixture.invalid/descriptor.json') throw new InstallerError('download-invalid', `Unexpected bundle recovery URL: ${url}`);
      discovery++;
      const value = url === 'https://api.github.com/repos/insors-ai/insrc/releases/latest' ? { draft: false, assets: [{ name: `insrc-${f.target.os}-${f.target.arch}.release.json`, browser_download_url: 'https://fixture.invalid/descriptor.json' }] } : descriptor;
      return { status: 200, body: Readable.from([Buffer.from(JSON.stringify(value))]) };
    };
    await assert.rejects(transport(new URL('https://unexpected.invalid/descriptor'), AbortSignal.timeout(1000)), { code: 'download-invalid' });
    f.peers.bundle = bundleDelivery(f.target, { transport });
    const ready = await f.peers.dependencies!.inspect(f.location);
    f.peers.dependencies!.inspect = async () => ({ ...ready, ollama: 'missing', ollamaInstallOffer: { id: 'offer', version: 'fixture', destination: f.home }, blockers: ['missing'] });
    f.peers.dependencies!.decide = async () => { throw new InstallerError('dependency-uncertain', 'Interrupted before bundle download'); };
    const first = f.manager(), offer = await first.checkUpgrade(); assert.ok(offer);
    const blocked = await first.upgradeFromTerminal(requireTerminal({ stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: true } }),
      { protocolVersion: 1, installationId: 'fixture', operationId: 'durable-upgrade', action: 'upgrade', acceptedOfferId: offer.offerId }, { offerId: 'offer', choice: 'install' });
    assert.equal(blocked.state.phase, 'blocked'); assert.equal(downloads, 0);
    const file = join(f.home, 'install/operations/durable-upgrade/release-offer.json');
    const saved = JSON.parse(readFileSync(file, 'utf8')); assert.equal(saved.schemaVersion, 2); assert.deepEqual(saved.descriptor, descriptor);
    const originalDiscovery = discovery;
    // New adapter closure: it has never resolved any descriptor. Recovery can
    // only fetch the exact payload from the durable, accepted descriptor.
    f.peers.bundle = bundleDelivery(f.target, { transport: async url => {
      assert.equal(url.href, descriptor.payload.url, 'fresh peer must not resolve latest'); downloads++;
      return { status: 200, body: Readable.from([zip]) };
    } });
    f.peers.dependencies!.inspect = async () => ready;
    const retry = () => f.manager().execute({ protocolVersion: 1, installationId: 'fixture', operationId: 'durable-upgrade', action: 'retry-migration' });
    const writeOffer = (value: unknown) => { const store = ControllerStore.acquire(f.location); try { store.writeOperationData('durable-upgrade', 'release-offer', value, true); } finally { store.close(); } };
    for (const invalid of [{ ...saved, descriptorSha256: '0'.repeat(64) },
      { ...saved, descriptor: { ...descriptor, manifest: { ...descriptor.manifest, target: { ...f.target, arch: f.target.arch === 'arm64' ? 'x64' : 'arm64' } } } },
      { schemaVersion: 1, offer: { kind: 'bundle', manifest: descriptor.manifest, descriptorSha256: digest(canonicalJson(descriptor)) } }]) {
      writeOffer(invalid); const result = await retry(); assert.equal(result.state.phase, 'blocked', result.state.message);
      assert.equal(downloads, 0); assert.equal(f.state.shutdowns.length, 0); assert.equal(f.state.activations.length, 0);
      assert.equal(readFileSync(join(f.old.directory, 'marker'), 'utf8'), 'old');
    }
    writeOffer(saved); const result = await retry(); assert.equal(result.state.phase, 'ready', result.state.message);
    assert.equal(result.state.candidateId, descriptor.manifest.releaseId); assert.equal(downloads, 1); assert.equal(discovery, originalDiscovery);
    assert.equal(f.state.migrations.length, 1); assert.equal(f.state.activations.length, 1);
    assert.equal(readFileSync(join(f.old.directory, 'marker'), 'utf8'), 'old'); assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), saved);
  } finally { await capture.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'private-release-offer-bound-supports-full-descriptors-without-widening-other-records', async () => {
  const capture = await ownedRuntimeHome('ibr-');
  try {
    const f = managerFixture(capture.root, true);
    const official = runtimeArchive(f.target);
    const manifest = { ...f.next.manifest, runtime: { ...f.next.manifest.runtime, sha256: official.sha256 }, migrations: Array.from({ length: 512 }, (_, i) => ({ id: `hook-${i}`, version: '1', module: `out/migrations/${i}-${'m'.repeat(180)}.js` })) };
    const descriptor = parseReleaseDescriptor({ schemaVersion: 2, publication: 'qualified', manifest, inventorySha256: digest('inventory'),
      payload: { url: 'https://fixture.invalid/payload', bytes: 1, sha256: manifest.payloadSha256 },
      bootstrap: { url: 'https://fixture.invalid/bootstrap', bytes: 1, sha256: digest('bootstrap') },
      native: { url: 'https://fixture.invalid/native', bytes: 1, sha256: digest('native') } }, { target: f.target });
    const record = { schemaVersion: 2, kind: 'bundle', descriptor, descriptorSha256: digest(canonicalJson(descriptor)) };
    assert.ok(Buffer.byteLength(JSON.stringify(record)) > MAX_CONTROL_BYTES);
    const store = ControllerStore.acquire(f.location);
    try {
      store.writeOperationData('large-offer', 'release-offer', record); assert.deepEqual(store.readOperationData('large-offer', 'release-offer'), record);
      assert.throws(() => store.writeOperationData('large-offer', 'dependency', record), { code: 'record-invalid' });
      assert.throws(() => store.writeOperationData('large-offer', 'release-offer', 'x'.repeat(BUNDLE_LIMITS.descriptorBytes + MAX_CONTROL_BYTES)), { code: 'record-invalid' });
    } finally { store.close(); }
  } finally { await capture.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'bundle-recovery-runtime-transport-refuses-unknown-URLs-before-opening-any-resource', async () => {
  const capture = await ownedRuntimeHome('ibr-');
  try {
    const f = managerFixture(capture.root, true), official = runtimeArchive(f.target);
    const transport = runtimeTransport(join(capture.root, 'never-opened'), official.url, capture);
    await assert.rejects(transport(new URL('https://unexpected.invalid/runtime'), AbortSignal.timeout(1000)), {
      code: 'download-invalid', message: 'Unexpected bundle recovery runtime URL: https://unexpected.invalid/runtime',
    });
  } finally { await capture.cleanup(); }
});
