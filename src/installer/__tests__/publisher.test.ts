import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { win32, posix, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import yauzl from 'yauzl';
import { assembleFixtureRelease, assertManagerBoundary, collectProductionPayload } from '../../../scripts/package-installer.mjs';
import { productionClosure, sha256, isContainedPath } from '../../../scripts/installer-payload.mjs';
import { node22Fixture } from './_runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import type { ChildProcess } from 'node:child_process';
import { copyInstallerAssets, stageClientInstallerAssets } from '../../../scripts/sync-client-runtime-assets.mjs';
const manifest = { schemaVersion: 1, releaseId: 'fixture-release', sourceCommit: 'a'.repeat(40), target: { os: 'darwin', arch: 'arm64', baseline: 'macos-13' }, runtime: { version: '22.22.1', target: { os: 'darwin', arch: 'arm64', baseline: 'macos-13' }, sha256: sha256(Buffer.from('controlled runtime archive fixture')), relativeExecutable: 'bin/node' }, daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js', protocolVersion: 1, compatiblePredecessors: ['fixture-old'], migrations: [] };
async function fixture(root: string, os: 'darwin' | 'win32' = 'darwin') {
  const target = { ...manifest.target, os, baseline: os === 'win32' ? 'windows-10' : 'macos-13' };
  const specific = { ...manifest, target, runtime: { ...manifest.runtime, target, relativeExecutable: os === 'win32' ? 'node.exe' : 'bin/node' } };
  const files = new Map([
    ['out/daemon/index.js', { bytes: Buffer.from('// controlled daemon fixture'), mode: 0o644 }],
    ['out/cli/index.js', { bytes: Buffer.from('// controlled TUI fixture'), mode: 0o644 }],
    ['manager.mjs', { bytes: Buffer.from('// controlled manager fixture'), mode: 0o644 }],
    ['runtime/node.tar.gz', { bytes: Buffer.from('controlled runtime archive fixture'), mode: 0o644 }],
    [os === 'win32' ? 'tools/node/node.exe' : 'tools/node/bin/node', { bytes: Buffer.from('controlled runtime fixture'), mode: 0o755 }],
  ]);
  return { files, descriptor: await assembleFixtureRelease({ files, directory: join(root, 'release'), manifest: specific, baseUrl: 'https://example.invalid/fixture-release', bootstrap: Buffer.from('// fixture bootstrap'), native: Buffer.from('fixture binding'), runtimeArchive: { path: 'runtime/node.tar.gz', sha256: sha256(Buffer.from('controlled runtime archive fixture')), bytes: Buffer.byteLength('controlled runtime archive fixture') } }) };
}
async function readZip(path: string): Promise<Map<string, Buffer>> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(path, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, value) => error ? reject(error) : resolve(value!)));
  const files = new Map<string, Buffer>();
  const end = once(zip, 'end');
  zip.on('entry', (entry: yauzl.Entry) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) { zip.emit('error', error); return; }
      const chunks: Buffer[] = []; stream!.on('data', chunk => chunks.push(chunk)); stream!.on('error', error => zip.emit('error', error));
      stream!.on('end', () => { files.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
    });
  });
  zip.readEntry(); await end; return files;
}
test('publisher binds exact source target runtime inventory and independent archive digest', async () => {
  const root = mkdtempSync(join(tmpdir(), 'insrc-publisher-'));
  try {
    const { descriptor, files } = await fixture(root);
    assert.equal(descriptor.publication, 'fixture'); assert.equal(descriptor.manifest.sourceCommit, manifest.sourceCommit);
    assert.deepEqual(descriptor.manifest.target, manifest.target); assert.deepEqual(descriptor.manifest.runtime, manifest.runtime);
    const archive = readFileSync(join(root, 'release/payload.zip'));
    assert.equal(descriptor.payload.sha256, sha256(archive)); assert.equal(descriptor.manifest.payloadSha256, sha256(archive));
    assert.equal(descriptor.payload.bytes, archive.length);
    assert.match(descriptor.payload.url, /insrc-fixture-release-darwin-arm64\.zip$/);
    assert.deepEqual(archive, readFileSync(join(root, 'release/insrc-fixture-release-darwin-arm64.zip')));
    const zip = await readZip(join(root, 'release/payload.zip')), inventory = JSON.parse(zip.get('inventory.json')!.toString());
    assert.equal(sha256(zip.get('inventory.json')), descriptor.inventorySha256);
    assert.equal(inventory.files.length, files.size); assert.ok(!inventory.files.some((file: { path: string }) => file.path === 'inventory.json' || file.path === 'release.json'));
    for (const file of inventory.files) { assert.equal(sha256(zip.get(file.path)), file.sha256); assert.equal(zip.get(file.path)!.length, file.bytes); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('production payload closure rejects missing entrypoints and escaping workspace links', () => {
  const root = mkdtempSync(join(tmpdir(), 'insrc-closure-')), outside = mkdtempSync(join(tmpdir(), 'insrc-outside-'));
  const put = (path: string, text: string) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  try {
    assert.throws(() => collectProductionPayload(root, root), /ENOENT|entrypoint/);
    put('package.json', JSON.stringify({ workspaces: ['packages/workspace'], dependencies: { workspace: '1' } }));
    put('packages/workspace/package.json', JSON.stringify({ name: 'workspace', files: ['index.js'], dependencies: { native: '1' }, optionalDependencies: { 'native-optional': '1' } }));
    put('packages/workspace/index.js', '// workspace code');
    put('packages/workspace/node_modules/native/package.json', JSON.stringify({ name: 'native' }));
    put('packages/workspace/node_modules/native/addon.node', 'native fixture');
    put('node_modules/native-optional/package.json', JSON.stringify({ name: 'native-optional' }));
    put('node_modules/native-optional/native.node', 'optional fixture');
    mkdirSync(join(root, 'node_modules'), { recursive: true }); symlinkSync(join(root, 'packages/workspace'), join(root, 'node_modules/workspace'), process.platform === 'win32' ? 'junction' : 'dir');
    const closure = productionClosure(root);
    assert.ok(closure.has('node_modules/workspace/index.js')); assert.ok(closure.has('node_modules/workspace/node_modules/native/addon.node')); assert.ok(closure.has('node_modules/native-optional/native.node'));
    rmSync(join(root, 'node_modules/workspace')); writeFileSync(join(outside, 'package.json'), '{"name":"workspace"}');
    symlinkSync(outside, join(root, 'node_modules/workspace'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => productionClosure(root), /escapes source root/);
    assert.equal(isContainedPath('C:\\source', 'D:\\other', win32), false);
    assert.equal(isContainedPath('C:\\source', 'C:\\source-other', win32), false);
    assert.equal(isContainedPath('C:\\source', 'C:\\source\\packages\\valid', win32), true);
    assert.equal(isContainedPath('/source', '/source-other', posix), false);

  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('bundled manager excludes DB indexer model imports and consumer npm build', () => {
  assertManagerBoundary({ inputs: { 'out/installer/contracts.js': {}, 'node_modules/yauzl/index.js': {} }, outputs: { 'bootstrap.mjs': { imports: [{ path: 'node:fs', external: true }] } } });
  for (const path of ['src/db/lmdb.ts', 'out/indexer/index.js', 'src/agent/providers/ollama.ts', 'out/daemon/index.js']) assert.throws(() => assertManagerBoundary({ inputs: { [path]: {} }, outputs: {} }), /application runtime/);
  assert.throws(() => assertManagerBoundary({ inputs: { 'node_modules/lmdb/index.js': {} }, outputs: {} }), /forbidden package/);
  assert.throws(() => assertManagerBoundary({ inputs: {}, outputs: { manager: { imports: [{ path: 'lmdb', external: true }] } } }), /unbundled dependency/);
  for (const path of ['scripts/install.sh', 'scripts/install.ps1']) assert.doesNotMatch(readFileSync(path, 'utf8'), /npm (install|ci|run)|node-gyp|tsc|sudo|RunAs/);
});

test('published manual and both IDE installer script assets have exact byte parity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'insrc-parity-'));
  try {
    for (const os of ['darwin', 'win32'] as const) {
      const platformRoot = join(root, os); mkdirSync(platformRoot); await fixture(platformRoot, os);
      const source = join(platformRoot, 'release'), script = os === 'win32' ? 'install.ps1' : 'install.sh';
      const published = join(source, `insrc-fixture-release-${os}-arm64.${script}`);
      for (const client of ['vscode', 'jetbrains']) {
        const destination = stageClientInstallerAssets(client, source, join(platformRoot, 'checkout'));
        assert.equal(destination, join(platformRoot, 'checkout', client === 'vscode' ? 'vscode-plugin/assets' : 'jetbrains-plugin/build/generated-resources/insrc'));
        assert.deepEqual(readFileSync(join(destination, script)), readFileSync(published));
        assert.deepEqual(readFileSync(join(destination, 'installer-assets.json')), readFileSync(join(source, 'installer-assets.json')));
      }
    }
    const source = join(root, 'darwin/release');
    writeFileSync(join(source, 'install.sh'), 'changed');
    assert.throws(() => copyInstallerAssets(source, join(root, 'bad')), /digest mismatch/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


async function ownedPublisherFixture(mode = 'bundle') {
  const root = mkdtempSync(join(tmpdir(), 'insrc-bundle-control-')), children: ChildProcess[] = [];
  const runtime = await node22Fixture();
  try {
    const contracts = fileURLToPath(new URL('../../../out/installer/contracts.js', import.meta.url));
    const zip = fileURLToPath(new URL('../../../node_modules/yauzl/index.js', import.meta.url));
    const entry = join(root, 'fixture.mjs'), output = join(root, 'control.mjs');
    writeFileSync(entry, `import {PRIVATE_NODE_VERSION} from ${JSON.stringify(contracts)};import yauzl from ${JSON.stringify(zip)};process.stdout.write(JSON.stringify({version:PRIVATE_NODE_VERSION,zip:typeof yauzl.open}));`);
    const child = spawnFixture(runtime.executable, [fileURLToPath(new URL('./publisher-bundle-fixture.mjs', import.meta.url)), root, entry, output, mode], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
    let diagnostics = ''; child.stderr!.on('data', (bytes: Buffer) => { diagnostics += bytes; });
    assert.deepEqual(await once(child, 'close'), [0, null], diagnostics);
  } finally { await stopOwnedChildren(children); runtime.cleanup(); rmSync(root, { recursive: true, force: true }); }
 }

test('real bundler produces one dependency-minimal control fixture under owned build scope', () => ownedPublisherFixture());
test('publisher rejects uncommitted compiler inputs despite unchanged source revision', () => ownedPublisherFixture('source'));
