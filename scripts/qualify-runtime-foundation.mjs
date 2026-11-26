/** Explicit native foundation qualification, never a release-enablement receipt.
 * Runs against a fresh isolated home; no daemon, Ollama or fixture peers. Build
 * the checkout with the canonical coordinator before invoking with Node 22.
 */
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir, release } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRun } from './test-harness/context.mjs';
import { withRun } from './test-harness/process.mjs';
import { bundleControlEntrypoint } from './package-installer.mjs';

const source = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const load = name => import(pathToFileURL(join(source, 'out/installer', `${name}.js`)).href);
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const contained = (parent, child) => { const part = relative(parent, child); return part === '' || (part !== '..' && !part.startsWith('../') && !part.startsWith('..\\') && !isAbsolute(part)); };

export async function qualifyRuntimeFoundation({ parent = realpathSync(tmpdir()), baseline = 'native-foundation' } = {}) {
  assert.match(process.version, /^v22\./, 'Use a Node 22 development orchestrator');
  assert.ok(['darwin', 'linux', 'win32'].includes(process.platform));
  assert.ok(['arm64', 'x64'].includes(process.arch));
  if (process.platform !== 'win32') assert.ok(process.getuid() > 0, 'Run qualification as an ordinary user');
  assert.match(baseline, /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
  const target = { os: process.platform, arch: process.arch, baseline };
  const [{ ControllerStore }, { resolveInstallationLocation }, { controlBinding }, { privateRuntimeIdentity, privateRuntimePaths },
    { ownedDevGit }, { devDelivery }, { parseDevPreparation }, { verifyDevPayload }, { devWorkerPaths, readVerifiedDevSourceResult },
    { resolveInstalledControl }] = await Promise.all([
    load('controller-store'), load('location'), load('native'), load('runtime-policy'), load('dev-git'), load('dev-delivery'),
    load('dev'), load('dev-payload'), load('dev-worker'), load('installed-receipt'),
  ]);
  const root = mkdtempSync(join(realpathSync(parent), 'iq-')), home = join(root, 'h');
  const native = controlBinding();
  if (process.platform === 'win32') native.protect(root);
  mkdirSync(home, { mode: 0o700 }); if (process.platform === 'win32') native.protect(home);
  const location = resolveInstallationLocation('native-qualification', { home,
    ...(process.platform === 'win32' ? { userSid: native.userSid() } : {}) });
  const identity = privateRuntimeIdentity(target);
  const binary = `node_modules/@esbuild/${target.os}-${target.arch}/${target.os === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`;
  mkdirSync(dirname(join(root, binary)), { recursive: true }); copyFileSync(join(source, binary), join(root, binary));
  mkdirSync(join(root, 'native')); copyFileSync(join(source, 'out/installer/native/control.node'), join(root, 'native/control.node'));
  const base = createRun(root, { mode: 'build', budgets: { buildMs: 3_600_000, fileMs: 3_600_000, runMs: 7_200_000 } });
  const run = { ...base, environment: () => ({ ...base.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1',
    ONNXRUNTIME_NODE_INSTALL_CUDA: process.env.ONNXRUNTIME_NODE_INSTALL_CUDA ?? 'skip' }) };
  const report = { schemaVersion: 1, kind: 'native-runtime-foundation', target, platformRelease: release(),
    orchestrator: { executable: realpathSync(process.execPath), version: process.version }, root, home, runId: run.runId,
    startedAt: new Date().toISOString(), releaseEnablement: false, status: 'running' };
  const resultFile = join(root, 'result.json');
  const save = () => writeFileSync(resultFile, JSON.stringify(report, null, 2) + '\n');
  const cancellation = new AbortController(), cancel = () => cancellation.abort(new Error('Qualification interrupted'));
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  process.stdout.write(`Native qualification evidence: ${resultFile}\n`); save();
  try {
    await withRun(run, async scope => {
      const git = ownedDevGit(run, scope, cancellation.signal);
      const head = (await git(['rev-parse', '--verify', 'HEAD'], source)).text.trim();
      // The source worker builds the actual committed checkout. Dirty compiler
      // inputs must never be silently excluded from the qualifying source.
      const { BUILD_INPUTS } = await import('./test-harness/build.mjs');
      assert.equal((await git(['status', '--porcelain', '--untracked-files=all', '--', ...BUILD_INPUTS], source)).text.trim(), '', 'Commit build inputs first');
      report.sourceCommit = head;
      let store = ControllerStore.acquire(location), runtime;
      try {
        assert.equal(existsSync(join(home, 'runtimes')), false, 'First acquisition needs an empty home');
        // Deliberately no injected transport, cached archive or runtime fixture.
        runtime = await store.ensureRuntime(identity, { signal: cancellation.signal });
      } finally { store.close(); }
      assert.ok(!contained(runtime.directory, realpathSync(process.execPath)), 'Publication stage must not contain the running Node');
      assert.ok(!contained(runtime.directory, realpathSync(join(source, 'out/installer/native/control.node'))), 'Publication stage must not contain the loaded control library');
      const before = lstatSync(runtime.node), nodePath = realpathSync(runtime.node);
      const resolved = await privateRuntimePaths(location, identity, { signal: cancellation.signal });
      assert.equal(resolved.node, nodePath);
      let networkRequests = 0;
      store = ControllerStore.acquire(location);
      try {
        const reused = await store.ensureRuntime(identity, { signal: cancellation.signal, transport: async () => {
          networkRequests++; throw new Error('Offline reuse attempted network access');
        } });
        assert.equal(reused.node, nodePath); assert.equal(lstatSync(reused.node).ino, before.ino);
      } finally { store.close(); }
      assert.equal(networkRequests, 0);
      const binding = pathToFileURL(join(source, 'out/installer/runtime-binding.js')).href;
      const runtimeProbe = await scope.start(runtime.node, ['--input-type=module', '-e',
        `import{resolveControlRuntime}from ${JSON.stringify(binding)};await resolveControlRuntime(${JSON.stringify(location)},${JSON.stringify(identity)});process.stdout.write(JSON.stringify({version:process.version,executable:process.execPath}));`],
      { env: { ...run.environment(), PATH: '', NODE_OPTIONS: '', NODE_PATH: '' } });
      assert.equal(runtimeProbe.code, 0, readFileSync(runtimeProbe.log, 'utf8'));
      const npm = await scope.start(runtime.node, [runtime.npmCli, '--version'], { env: { ...run.environment(), NODE_OPTIONS: '', NODE_PATH: '' } });
      assert.equal(npm.code, 0, readFileSync(npm.log, 'utf8')); assert.equal(readFileSync(npm.log, 'utf8').trim(), '10.9.4');
      assert.ok(existsSync(join(runtime.headers, 'include/node/node.h')));
      if (target.os === 'win32') {
        assert.ok(existsSync(runtime.nodeLib)); assert.match(location.daemonEndpoint.address, /^\\\\\.\\pipe\\insrc-/);
        assert.equal(native.safePath(home, true, true), true);
        assert.equal(native.safePath(runtime.directory, true, true), true);
      }
      report.runtime = { identity, directory: runtime.directory, executable: nodePath, inventorySha256: runtime.inventorySha256,
        liveFirstAcquisition: true, offlineNetworkRequests: networkRequests, sameExecutableInode: true,
        bindingProbeLog: runtimeProbe.log, npmVersion: '10.9.4', nodeLib: runtime.nodeLib,
        publicationOutsideRunningNodeAndLoadedControl: true, ...(target.os === 'win32' ? { userSid: native.userSid(), privateAcl: true, endpoint: location.daemonEndpoint } : {}) };
      save();
      const bare = join(root, 'source.git');
      await git(['init', '--quiet', '--bare', `--object-format=${head.length === 64 ? 'sha256' : 'sha1'}`, bare]);
      await git(['--git-dir', bare, 'fetch', '--quiet', '--depth=1', '--no-tags', '--no-recurse-submodules', source, `${head}:refs/heads/qualification`]);
      const bootstrap = join(root, 'bootstrap.mjs');
      await bundleControlEntrypoint(run, scope, join(source, 'src/installer/terminal-entry.ts'), bootstrap, target);
      const environment = () => run.environment(), port = devDelivery(target, { workerEntrypoint: bootstrap, environment });
      const delivery = { mode: 'dev', repository: bare, branch: 'qualification' }, offered = await port.resolve(delivery);
      assert.equal(offered.sourceCommit, head);
      const operationId = 'native-preparation';
      store = ControllerStore.acquire(location);
      let candidate, record;
      try {
        store.commit({ schemaVersion: 1, revision: 0,
          installation: { schemaVersion: 1, installationId: location.installationId, dataHome: home, delivery, operationId },
          operation: { operationId, phase: 'preparing' } }, null);
        // This validation-only client owns only the preparation seam. It does
        // not compose fake lifecycle/migration ports or claim daemon readiness.
        const readCheckpoint = () => { const value = store.readOperationData(operationId, 'dev-preparation'); return value === undefined ? undefined : parseDevPreparation(value); };
        candidate = await port.prepare(store, offered, { operationId, signal: cancellation.signal, readCheckpoint,
          checkpoint: input => {
            store.assertHeld(); const value = parseDevPreparation(input);
            assert.equal(value.operationId, operationId); assert.deepEqual(value.sourceOffer, offered);
            store.writeOperationData(operationId, 'dev-preparation', value, readCheckpoint() !== undefined);
          } });
        record = readCheckpoint(); assert.equal(record.stage, 'prepared');
        assert.equal(store.inspect().snapshot.operation.phase, 'preparing');
      } finally { store.close(); }
      assert.equal((await readVerifiedDevSourceResult(home, record)).outcome, 'prepared');
      const { receipt, inventory } = await verifyDevPayload(candidate.directory, target, location, { signal: cancellation.signal });
      assert.equal(receipt.sourceOffer.sourceCommit, head); assert.equal(receipt.schemaVersion, 2);
      assert.equal(inventory.files.some(file => /^(tools\/node|runtime|ollama)\//.test(file.path)), false);
      for (const path of ['out/bin/insrc-mcp.js', 'node_modules/@insrc/project-memory/dist/index.js']) assert.ok(inventory.files.some(file => file.path === path));
      const selected = await resolveInstalledControl(location, candidate.releaseId, target);
      assert.equal(selected.runtime.node, runtime.node);
      const probeLock = join(run.workspace, 'native-probe.lock');
      const program = `const{createRequire}=require('node:module');const r=createRequire(process.cwd()+'/package.json');for(const n of ['lmdb','@lancedb/lancedb','@duckdb/node-api','tree-sitter','onnxruntime-node','@parcel/watcher'])r(n);const c=r('./native/control.node'),h=c.acquire(${JSON.stringify(probeLock)});if(!c.held(h))throw Error('native lock');c.close(h);process.stdout.write(JSON.stringify({version:process.version,executable:process.execPath,sharedObjects:process.report.getReport().sharedObjects}));`;
      const probe = await scope.start(runtime.node, ['-e', program], { cwd: candidate.directory, env: { ...run.environment(), PATH: '', NODE_OPTIONS: '', NODE_PATH: '' } });
      assert.equal(probe.code, 0, readFileSync(probe.log, 'utf8'));
      const request = { protocolVersion: 1, installationId: location.installationId, operationId: 'fresh-inspect', action: 'inspect' };
      const inspected = await scope.start(runtime.node, [join(candidate.directory, 'manager.mjs'), '--home', home, '--installation-id', location.installationId],
        { env: { ...run.environment(), PATH: '', NODE_OPTIONS: '', NODE_PATH: '' }, ownerChannel: { initial: JSON.stringify(request) + '\n', connect: channel => channel.end() } });
      assert.equal(inspected.code, 0, readFileSync(inspected.log, 'utf8'));
      const event = JSON.parse(readFileSync(inspected.log, 'utf8').trim().split('\n').at(-1));
      assert.equal(event.kind, 'result'); assert.equal(event.state.phase, 'preparing');
      const policy = read(join(devWorkerPaths(home, record).workspace, 'dev-build-policy.json'));
      assert.equal(policy.nodeVersion, '22.22.1'); assert.equal(policy.npmVersion, '10.9.4');
      report.application = { releaseId: candidate.releaseId, sourceCommit: receipt.manifest.sourceCommit,
        files: inventory.files.length, payloadBytes: inventory.files.reduce((sum, file) => sum + file.bytes, 0),
        receiptVersion: receipt.schemaVersion, privateBuildPolicy: policy, nativeProbeLog: probe.log, freshManagerLog: inspected.log,
        controllerPhase: 'preparing', daemonActivationTested: false, ollamaInstalledOrStarted: false };
      cancellation.signal.throwIfAborted();
    });
    const cleanup = read(join(run.workspace, 'cleanup.json'));
    assert.equal(cleanup.confirmedClosed, true); assert.equal(cleanup.closureMode, 'owned-groups');
    assert.deepEqual(cleanup.evidenceErrors, []); assert.deepEqual(cleanup.cancellationErrors, []);
    assert.equal(existsSync(run.active), false);
    report.status = 'pass'; report.confirmedClosed = true;
  } catch (error) {
    report.status = 'fail'; report.error = { message: error.message, code: error.code };
    throw error;
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    report.finishedAt = new Date().toISOString(); save();
  }
  return resultFile;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    assert.ok(['--parent', '--baseline'].includes(args[index]) && args[index + 1], 'Expected --parent PATH or --baseline LABEL');
    options[args[index].slice(2)] = args[index + 1];
  }
  qualifyRuntimeFoundation(options).catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
}
