import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, renameSync, lstatSync, copyFileSync } from 'node:fs';
import { win32, posix, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import yauzl from 'yauzl';
import { assembleFixtureRelease, assertManagerBoundary, collectProductionPayload, assertApplicationSources, preparePublisherRuntime, probePayload } from '../../../scripts/package-installer.mjs';
import { productionClosure, collectTree, sha256, isContainedPath } from '../../../scripts/installer-payload.mjs';
import { privateRuntimePaths, runtimeArchive } from '../runtime-policy.js';
import { ownedRuntimeHome } from './_owned-runtime-home.js';
import { requireNativeQualification, requireEnabledNativeTarget } from '../native-qualification.js';
import type { Target } from '../contracts.js';
import { node22Fixture, archiveFixture } from './_runtime-fixture.js';
import { spawnFixture } from '../../daemon/tools/__tests__/_proc.js';
import { copyInstallerAssets, stageClientInstallerAssets } from '../../../scripts/sync-client-runtime-assets.mjs';
const manifest = { schemaVersion: 1, releaseId: 'fixture-release', sourceCommit: 'a'.repeat(40), target: { os: 'darwin', arch: 'arm64', baseline: 'macos-13' }, runtime: { version: '22.22.1', target: { os: 'darwin', arch: 'arm64', baseline: 'macos-13' }, sha256: runtimeArchive({ os: 'darwin', arch: 'arm64' }).sha256, relativeExecutable: 'bin/node' }, daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js', protocolVersion: 1, compatiblePredecessors: ['fixture-old'], migrations: [] };
async function fixture(root: string, os: 'darwin' | 'win32' = 'darwin') {
  const target = { ...manifest.target, os, baseline: os === 'win32' ? 'windows-10' : 'macos-13' };
  const specific = { ...manifest, target, runtime: { ...manifest.runtime, target, sha256: runtimeArchive(target).sha256, relativeExecutable: os === 'win32' ? 'node.exe' : 'bin/node' } };
  const files = new Map([
    ['out/daemon/index.js', { bytes: Buffer.from('// controlled daemon fixture'), mode: 0o644 }],
    ['out/cli/index.js', { bytes: Buffer.from('// controlled TUI fixture'), mode: 0o644 }],
    ['manager.mjs', { bytes: Buffer.from('// controlled manager fixture'), mode: 0o644 }],
    ['bootstrap.mjs', { bytes: Buffer.from('// fixture bootstrap'), mode: 0o644 }],
    ['native/control.node', { bytes: Buffer.from('fixture binding'), mode: 0o755 }],
  ]);
  return { files, descriptor: await assembleFixtureRelease({ files, directory: join(root, 'release'), manifest: specific, baseUrl: 'https://example.invalid/fixture-release', bootstrap: Buffer.from('// fixture bootstrap'), native: Buffer.from('fixture binding') }) };
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
test('publisher format2 binds app-only inventory public manifest1 source and exact external runtime identity', async () => {
  const capture = await ownedRuntimeHome('insrc-publisher-'), root = capture.root;
  try {
    const { descriptor, files } = await fixture(root);
    assert.equal(descriptor.schemaVersion, 2); assert.equal(descriptor.manifest.schemaVersion, 1); assert.equal('runtimeArchive' in descriptor, false);
    assert.equal(descriptor.publication, 'fixture'); assert.equal(descriptor.manifest.sourceCommit, manifest.sourceCommit);
    assert.deepEqual(descriptor.manifest.target, manifest.target); assert.deepEqual(descriptor.manifest.runtime, manifest.runtime);
    const archive = readFileSync(join(root, 'release/payload.zip'));
    assert.equal(descriptor.payload.sha256, sha256(archive)); assert.equal(descriptor.manifest.payloadSha256, sha256(archive));
    assert.equal(descriptor.payload.bytes, archive.length);
    assert.match(descriptor.payload.url, /insrc-fixture-release-darwin-arm64\.zip$/);
    assert.deepEqual(archive, readFileSync(join(root, 'release/insrc-fixture-release-darwin-arm64.zip')));
    const zip = await readZip(join(root, 'release/payload.zip')), inventory = JSON.parse(zip.get('inventory.json')!.toString());
    assert.equal(inventory.files.some((file: { path: string }) => /^(?:tools\/node|runtime\/)/.test(file.path)), false);
    assert.equal(sha256(zip.get('inventory.json')), descriptor.inventorySha256);
    assert.equal(inventory.files.length, files.size); assert.ok(!inventory.files.some((file: { path: string }) => file.path === 'inventory.json' || file.path === 'release.json'));
    for (const file of inventory.files) { assert.equal(sha256(zip.get(file.path)), file.sha256); assert.equal(zip.get(file.path)!.length, file.bytes); }
  } finally { await capture.cleanup(); }
});

test('publisher rejects a real pinned Node archive even when renamed as an application resource', { timeout: 120_000 }, async () => {
  const capture = await ownedRuntimeHome('ipb-'), root = capture.root;
  try {
    const { descriptor, files } = await fixture(root);
    files.set('out/assets/innocent-resource.bin', { bytes: readFileSync(await archiveFixture()), mode: 0o644 });
    await assert.rejects(assembleFixtureRelease({ files, directory: join(root, 'rejected'), manifest: descriptor.manifest, baseUrl: 'https://example.invalid/rejected', bootstrap: files.get('bootstrap.mjs')!.bytes, native: files.get('native/control.node')!.bytes }), /runtime distribution contribution/);
  } finally { await capture.cleanup(); }
});

test('publisher source provenance excludes renamed runtime inputs and preserves native dependency contributions', async () => {
  const capture = await ownedRuntimeHome('ips-'), root = capture.root;
  const put = (path: string, bytes: string) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), bytes); };
  try {
    put('package.json', JSON.stringify({ dependencies: { native: '1' } }));
    for (const path of ['out/daemon/index.js', 'out/cli/index.js', 'out/installer/terminal-entry.js', 'out/installer/manager-entry.js']) put(path, '// application fixture');
    put('node_modules/native/package.json', '{"name":"native"}'); put('node_modules/native/addon.node', 'native fixture');
    put('downloads/renamed-distribution.bin', 'controlled Node/Ollama input');
    const input = join(root, 'downloads'), contribution = collectTree(root, input, 'runtime-input');
    const renamed = new Map([['out/assets/looks-like-data.dat', [...contribution.values()][0]!]]);
    assert.throws(() => assertApplicationSources(renamed, { sourceRoot: root, excludedInputs: [input] }), /Runtime distribution source/);
    const app = collectProductionPayload(root, { excludedInputs: [input] });
    mkdirSync(join(root, 'out/assets'));
    renameSync(join(input, 'renamed-distribution.bin'), join(root, 'out/assets/looks-like-data.dat'));
    // The original excluded directory remains; the renamed file is now visited.
    assert.throws(() => collectProductionPayload(root, { excludedInputs: [join(root, 'out/assets/looks-like-data.dat')] }), /excluded/);
    rmSync(join(root, 'out/assets/looks-like-data.dat'));
    assert.ok(app.has('node_modules/native/addon.node')); assert.equal([...app.keys()].some(path => path.startsWith('tools/node')), false);
  } finally { await capture.cleanup(); }
});

test('production payload closure rejects missing entrypoints and escaping workspace links', async () => {
  const capture = await ownedRuntimeHome('insrc-closure-'), external = await ownedRuntimeHome('insrc-outside-'), root = capture.root, outside = external.root;
  const put = (path: string, text: string) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  try {
    assert.throws(() => collectProductionPayload(root), /ENOENT|entrypoint/);
    put('package.json', JSON.stringify({ workspaces: ['packages/workspace'], dependencies: { workspace: '1' } }));
    put('packages/workspace/package.json', JSON.stringify({ name: 'workspace', files: ['index.js'], dependencies: { native: '1' }, optionalDependencies: { 'native-optional': '1' } }));
    put('packages/workspace/index.js', '// workspace code');
    put('packages/workspace/node_modules/native/package.json', JSON.stringify({ name: 'native' }));
    put('packages/workspace/node_modules/native/addon.node', 'native fixture');
    put('node_modules/native-optional/package.json', JSON.stringify({ name: 'native-optional' }));
    put('node_modules/native-optional/native.node', 'optional fixture');
    mkdirSync(join(root, 'node_modules'), { recursive: true }); symlinkSync(join(root, 'packages/workspace'), join(root, 'node_modules/workspace'), process.platform === 'win32' ? 'junction' : 'dir'); capture.allowFixtureSymlink(join(root, 'node_modules/workspace'));
    const closure = productionClosure(root);
    assert.ok(closure.has('node_modules/workspace/index.js')); assert.ok(closure.has('node_modules/workspace/node_modules/native/addon.node')); assert.ok(closure.has('node_modules/native-optional/native.node'));
    rmSync(join(root, 'node_modules/workspace')); writeFileSync(join(outside, 'package.json'), '{"name":"workspace"}');
    symlinkSync(outside, join(root, 'node_modules/workspace'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => productionClosure(root), /escapes source root/);
    assert.equal(isContainedPath('C:\\source', 'D:\\other', win32), false);
    assert.equal(isContainedPath('C:\\source', 'C:\\source-other', win32), false);
    assert.equal(isContainedPath('C:\\source', 'C:\\source\\packages\\valid', win32), true);
    assert.equal(isContainedPath('/source', '/source-other', posix), false);

  } finally { await capture.cleanup(); await external.cleanup(); }
});

test('bundled manager excludes DB indexer model imports and consumer npm build', () => {
  assertManagerBoundary({ inputs: { 'out/installer/contracts.js': {}, 'node_modules/yauzl/index.js': {}, 'node_modules/fzstd/esm/index.mjs': {}, 'node_modules/xxhash-wasm/esm/xxhash-wasm.js': {} }, outputs: { 'bootstrap.mjs': { imports: [{ path: 'node:fs', external: true }] } } });
  for (const path of ['src/db/lmdb.ts', 'out/indexer/index.js', 'src/agent/providers/ollama.ts', 'out/daemon/index.js']) assert.throws(() => assertManagerBoundary({ inputs: { [path]: {} }, outputs: {} }), /application runtime/);
  assert.throws(() => assertManagerBoundary({ inputs: { 'node_modules/lmdb/index.js': {} }, outputs: {} }), /forbidden package/);
  assert.throws(() => assertManagerBoundary({ inputs: {}, outputs: { manager: { imports: [{ path: 'lmdb', external: true }] } } }), /unbundled dependency/);
  for (const path of ['scripts/install.sh', 'scripts/install.ps1']) assert.doesNotMatch(readFileSync(path, 'utf8'), /npm (install|ci|run)|node-gyp|tsc|sudo|RunAs/);
});

test('published manual and both IDE installer script assets have exact byte parity', async () => {
  const capture = await ownedRuntimeHome('insrc-parity-'), root = capture.root;
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
  } finally { await capture.cleanup(); }
});


async function ownedPublisherFixture(mode = 'bundle') {
  const capture = await ownedRuntimeHome('insrc-bundle-control-'), root = capture.root;
  let runtime: Awaited<ReturnType<typeof node22Fixture>> | undefined;
  try {
    runtime = await node22Fixture();
    const contracts = fileURLToPath(new URL('../../../out/installer/contracts.js', import.meta.url));
    const zip = fileURLToPath(new URL('../../../node_modules/yauzl/index.js', import.meta.url));
    const entry = join(root, 'fixture.mjs'), output = join(root, 'control.mjs');
    writeFileSync(entry, `import {PRIVATE_NODE_VERSION} from ${JSON.stringify(contracts)};import yauzl from ${JSON.stringify(zip)};process.stdout.write(JSON.stringify({version:PRIVATE_NODE_VERSION,zip:typeof yauzl.open}));`);
    const child = capture.trackChild(spawnFixture(runtime.executable, [fileURLToPath(new URL('./publisher-bundle-fixture.mjs', import.meta.url)), root, entry, output, mode], { stdio: ['ignore', 'pipe', 'pipe'] }));
    let diagnostics = ''; child.stderr!.on('data', (bytes: Buffer) => { diagnostics += bytes; });
    assert.deepEqual(await once(child, 'close'), [0, null], diagnostics);
  } finally { await capture.cleanup(); runtime?.cleanup(); }
 }

test('real bundler produces one dependency-minimal control fixture under owned build scope', () => ownedPublisherFixture());
test('publisher rejects uncommitted compiler inputs despite unchanged source revision', () => ownedPublisherFixture('source'));

test('publisher single-link reads reject replacement mutation and new symlinks after traversal', async () => {
  const capture = await ownedRuntimeHome('publisher-identity-'), root = capture.root;
  const file = join(root, 'out/input.js');
  try {
    mkdirSync(join(root, 'out')); writeFileSync(file, 'original input');
    assert.equal(collectTree(root, join(root, 'out'), 'out').get('out/input.js')!.bytes.toString(), 'original input');
    assert.throws(() => collectTree(root, join(root, 'out'), 'out', { admitFile() {
      renameSync(file, join(root, 'old-input')); writeFileSync(file, 'replaced input');
    } }), /changed before reading/);
    rmSync(file); renameSync(join(root, 'old-input'), file);
    assert.throws(() => collectTree(root, join(root, 'out'), 'out', { admitFile() { writeFileSync(file, 'mutated input'); } }), /changed before reading/);
    writeFileSync(file, 'original input');
    assert.throws(() => collectTree(root, join(root, 'out'), 'out', { admitFile() {
      renameSync(file, join(root, 'old-input')); symlinkSync(join(root, 'old-input'), file); capture.allowFixtureSymlink(file);
    } }), /changed before reading|ELOOP/);
    rmSync(file); renameSync(join(root, 'old-input'), file);
    assert.equal(collectTree(root, join(root, 'out'), 'out').get('out/input.js')!.bytes.toString(), 'original input');
    assert.equal(lstatSync(file).nlink, 1);
  } finally { await capture.cleanup(); }
});

test('release-owned Windows exclusion cannot be overridden by qualification flags or manual CI scope', async () => {
  const target: Target = { os: 'win32', arch: 'arm64', baseline: 'windows-10' }, hash = 'a'.repeat(64);
  const evidence = { target, addonSha256: hash, runtimeVersion: '22.22.1', nativeExecution: true, lockExclusion: true,
    interruptedReplace: true, privateRuntimeSmoke: true, liveInstallUpgrade: true };
  const blocked = { code: 'target-unqualified', message: 'Windows native execution and publication are deferred pending owned-process qualification; metadata computation remains available' };
  assert.throws(() => requireEnabledNativeTarget(target), blocked);
  assert.throws(() => requireNativeQualification(target, hash, evidence), blocked);
  let admitted = false;
  await assert.rejects(preparePublisherRuntime({ assertOwner() { admitted = true; } }, undefined, undefined, target), blocked);
  assert.equal(admitted, true);
  await assert.rejects(probePayload({}, { start() { throw Error('native execution must not occur'); } }, 'unused', target, {}), blocked);
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const job = workflow.slice(workflow.indexOf('  runtime-foundation-windows:'));
  assert.match(job, /if: \$\{\{ false \}\}/);
  assert.equal(runtimeArchive(target).sha256.length, 64, 'foreign policy metadata remains computable');
});

test('publisher native probe executes the shared protected runtime outside the application payload', { timeout: 180_000 }, async () => {
  const capture = await ownedRuntimeHome('pp-'), root = capture.root;
  const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'publisher-fixture' };
  let cleanupPath: string | undefined, closed: (() => void) | undefined;
  capture.trackResource(new Promise<void>(resolve => { closed = resolve; }));
  try {
    const { createRun } = await import('../../../scripts/test-harness/context.mjs');
    const { withRun } = await import('../../../scripts/test-harness/process.mjs');
    const run = createRun(root, { mode: 'build' });
    cleanupPath = join(run.workspace, 'cleanup.json');
    await withRun(run, async scope => {
      const home = root, probe = join(root, 'app');
      const context = await preparePublisherRuntime(run, await archiveFixture(), home, target);
      const runtime = await privateRuntimePaths(context.location, context.identity);
      mkdirSync(join(probe, 'native'), { recursive: true, mode: 0o700 }); writeFileSync(join(probe, 'package.json'), '{"type":"module"}');
      symlinkSync(fileURLToPath(new URL('../../../node_modules', import.meta.url)), join(probe, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir'); capture.allowFixtureSymlink(join(probe, 'node_modules'));
      copyFileSync('out/installer/native/control.node', join(probe, 'native/control.node'));
      assert.equal(lstatSync(context.location.home).uid, process.getuid?.());
      assert.equal(lstatSync(runtime.node).mode & 0o7777, 0o555);
      assert.equal(probe.startsWith(runtime.directory + '/'), false); assert.equal(readFileSync(join(probe, 'package.json'), 'utf8'), '{"type":"module"}');
      await probePayload(run, scope, probe, target, context);
      context.cleanup();
      assert.equal(lstatSync(runtime.node).isFile(), true, 'candidate cleanup has no shared-runtime ownership');
      assert.equal(lstatSync(context.location.home).isDirectory(), true);
    });
    const cleanup = JSON.parse(readFileSync(join(run.workspace, 'cleanup.json'), 'utf8'));
    assert.equal(cleanup.confirmedClosed, true); assert.equal(cleanup.closureMode, 'owned-groups');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'resource-close-uncertain' || ((cause as Error).cause as NodeJS.ErrnoException | undefined)?.code === 'resource-close-uncertain') capture.retain(cause);
    throw cause;
  } finally {
    try {
      if (!cleanupPath) throw Error('Publisher run never acquired qualified closure evidence');
      const cleanup = JSON.parse(readFileSync(cleanupPath, 'utf8'));
      if (cleanup.confirmedClosed !== true || cleanup.closureMode !== 'owned-groups' || cleanup.cancellationErrors.length || cleanup.evidenceErrors.length) throw Error('Publisher probe actor closure is unconfirmed');
      closed?.();
    } catch (cause) { capture.retain(cause); }
    await capture.cleanup();
  }
});
