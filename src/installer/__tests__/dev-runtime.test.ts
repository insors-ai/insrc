import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, renameSync, rmSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import io from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import type { Target, ReleaseManifest } from '../contracts.js';
import { devRuntimeFixture } from './_dev-runtime-fixture.js';
import { createDevSourceOffer } from '../dev.js';
import { openPreparedDev } from '../dev-delivery.js';
import { openPreparedBundle } from '../bundle.js';
import { verifyDevToolchain } from '../dev-toolchain.js';
import { ControllerStore } from '../controller-store.js';
import { canonicalJson, digest } from '../release-descriptor.js';
import { runtimeStorePaths } from '../runtime-policy.js';
import { verifyDevPayload } from '../dev-payload.js';

test('dev candidate opening reuses the bundle runtime read-only and rejects missing runtime or foreign process', async t => {
  const home = mkdtempSync(join(realpathSync(tmpdir()), 'idr-'));
  const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'read-only-fixture' };
  try {
    const { location, identity, runtime } = await devRuntimeFixture(home, target);
    const root = runtimeStorePaths(home, identity).root, inode = lstatSync(root).ino;
    const offer = createDevSourceOffer({ kind: 'dev-source', delivery: { mode: 'dev', repository: join(home, 'unavailable-source'), branch: 'installer' },
      sourceCommit: 'a'.repeat(40), target, runtime: identity, recipeVersion: 'dev-v2-app-only' });
    // Controlled app bytes exercise receipt/inventory boundaries, not native app execution.
    const names = ['bootstrap.mjs', 'manager.mjs', 'native/control.node', 'package.json', 'out/installer/native/control.node',
      'out/installer/terminal-entry.js', 'out/installer/manager-entry.js', 'out/bin/insrc-mcp.js', 'out/daemon/index.js', 'out/cli/index.js', 'out/assets/model.dat'];
    const data = Buffer.from('controlled app fixture');
    const inventory = { schemaVersion: 1, files: names.map(path => ({ path, bytes: data.length, sha256: digest(data), mode: 0o644 })) };
    const inventoryBytes = canonicalJson(inventory), inventorySha256 = digest(inventoryBytes);
    const manifest: ReleaseManifest = { schemaVersion: 1, releaseId: offer.releaseId, sourceCommit: offer.sourceCommit, target, runtime: identity,
      payloadSha256: inventorySha256, daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js',
      protocolVersion: 1, compatiblePredecessors: [], migrations: [] };
    function writeApp(releaseId: string, receiptName: string, receipt: unknown): void {
      const directory = join(home, 'releases', releaseId);
      for (const name of names) { const file = join(directory, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, data); }
      writeFileSync(join(directory, 'inventory.json'), inventoryBytes);
      writeFileSync(join(directory, receiptName), canonicalJson(receipt), { mode: 0o600 });
    }
    writeApp(offer.releaseId, '.dev-release.json', { schemaVersion: 2, mode: 'dev', sourceOffer: offer, manifest, inventorySha256,
      checkoutRelativePath: 'dev/checkouts/never-built-here' });
    const asset = { url: 'https://example.invalid/app', bytes: data.length, sha256: digest(data) };
    writeApp('bundle-fixture', '.release.json', { schemaVersion: 2, publication: 'qualified', manifest: { ...manifest, releaseId: 'bundle-fixture' },
      inventorySha256, payload: { ...asset, sha256: inventorySha256 }, bootstrap: asset, native: asset });
    t.mock.method(ControllerStore.prototype, 'ensureRuntime', async () => assert.fail('Read-only opening attempted runtime acquisition'));
    const receiptBefore = readFileSync(join(home, 'releases', offer.releaseId, '.dev-release.json'));
    const dev = await openPreparedDev(location, offer.releaseId, target);
    const bundle = await openPreparedBundle(location, 'bundle-fixture', target);
    assert.deepEqual(dev.manifest.runtime, bundle.manifest.runtime);
    const tools = await verifyDevToolchain(location, identity, { requireCurrentProcess: false });
    assert.equal(tools.node, runtime.node); assert.equal(tools.npmCli, runtime.npmCli); assert.equal(tools.headers, runtime.headers);
    assert.equal(tools.nodeLib, runtime.nodeLib);
    await assert.rejects(verifyDevToolchain(location, identity), { code: 'runtime-invalid' });
    const devRoot = join(home, 'releases', offer.releaseId), bundleRoot = join(home, 'releases/bundle-fixture');
    await verifyDevPayload(devRoot, target, location);
    writeFileSync(join(devRoot, 'out/assets/model.dat'), Buffer.alloc(data.length, 120));
    const readdir = io.readdir, open = io.open;
    t.mock.method(io, 'readdir', ((path: unknown, ...args: unknown[]) => {
      assert.ok(![devRoot, bundleRoot].some(root => String(path).startsWith(root)), 'Installed opening must not walk the app tree');
      return Reflect.apply(readdir, io, [path, ...args]);
    }) as typeof io.readdir);
    t.mock.method(io, 'open', ((path: unknown, ...args: unknown[]) => {
      assert.ok(!String(path).replaceAll('\\', '/').endsWith('/out/assets/model.dat'), 'Installed opening must not hash app data');
      return Reflect.apply(open, io, [path, ...args]);
    }) as typeof io.open);
    syncBuiltinESMExports();
    try { await openPreparedDev(location, offer.releaseId, target); await openPreparedBundle(location, 'bundle-fixture', target); }
    finally { io.readdir = readdir; io.open = open; syncBuiltinESMExports(); }
    await assert.rejects(verifyDevPayload(devRoot, target, location), /digest differs/);
    assert.equal(lstatSync(root).ino, inode);
    renameSync(root, `${root}.held`);
    try {
      await assert.rejects(openPreparedDev(location, offer.releaseId, target), { code: 'runtime-invalid' });
      assert.equal(lstatSync(`${root}.held`).ino, inode);
    } finally { renameSync(`${root}.held`, root); }
    assert.deepEqual(readFileSync(join(home, 'releases', offer.releaseId, '.dev-release.json')), receiptBefore);
    assert.equal(existsSync(join(home, 'dev/checkouts')), false);
    assert.equal(existsSync(join(home, 'install/controller.json')), false);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); rmSync(home, { recursive: true, force: true }); }
});
