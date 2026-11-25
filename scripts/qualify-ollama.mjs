/** Native dependency-only qualification driver, never a consumer installer.
 * Candidate admission metadata is confined to the disposable test machine;
 * release catalog eligibility is written only after observed native success. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { dependencyPort, probeOllamaVersion } from '../out/installer/dependencies.js';
import { productionPeers, controlRuntimeDirectory } from '../out/installer/production-peers.js';
import { createDependencyOperationContext } from '../out/installer/dependency-context.js';
import { parseOllamaPolicy, ollamaPolicySha256 } from '../out/installer/ollama-policy.js';
import { closedOllamaAttempts, verifyPreparedOllama } from '../out/installer/ollama-prepare.js';
import { parseServiceFrame, servicePaths } from '../out/installer/ollama-service-records.js';
import { ollamaServiceEnvironment } from '../out/installer/ollama-service-worker.js';
import { ControllerStore } from '../out/installer/controller-store.js';
import { resolveInstallationLocation } from '../out/installer/location.js';
import { canonicalJson } from '../out/installer/release-descriptor.js';

const [phase, specPath] = process.argv.slice(2), spec = JSON.parse(readFileSync(resolve(specPath), 'utf8'));
assert.ok(['decline', 'install', 'inspect', 'benchmark'].includes(phase));
const policy = parseOllamaPolicy(spec.policy), location = resolveInstallationLocation(spec.installationId, { home: spec.home });
assert.equal(process.getuid() > 0, true, 'qualification install must be unprivileged');
const runtimeDirectory = controlRuntimeDirectory(policy.target);
function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name), info = lstatSync(path);
    assert.equal(info.isSymbolicLink(), false, path);
    return info.isDirectory() ? files(path) : [{ path, bytes: info.size, mode: info.mode & 0o777, uid: info.uid, nlink: info.nlink }];
  });
}
function snapshot(directory) {
  return files(directory).map(file => [file.path, file.bytes, createHash('sha256').update(readFileSync(file.path)).digest('hex')]);
}
function save(name, value) {
  writeFileSync(join(dirname(specPath), name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({ kind: name, status: value.status, elapsedMs: value.elapsedMs, ollama: value.report?.ollama }) + '\n');
}
const port = dependencyPort(policy.target, location, { runtimeDirectory, policies: [policy], service: { workerEntrypoint: spec.bootstrap } });
if (phase === 'benchmark') {
  const attempts = await closedOllamaAttempts(location), attempt = attempts[0]; assert.ok(attempt);
  const started = performance.now(), verified = await verifyPreparedOllama(location, policy, join(location.home, attempt.identity.payloadRelativePath));
  save('verification-benchmark.json', { status: 'measured', elapsedMs: performance.now() - started, inventorySha256: verified.inventorySha256,
    bytes: verified.files.reduce((sum, file) => sum + file.bytes, 0) });
} else if (phase === 'inspect') {
  const before = snapshot(join(location.home, 'deps/ollama/.attempts')), started = performance.now();
  const report = await productionPeers(policy.target, location).dependencies.inspect(location);
  assert.equal(report.ollama, 'ready', JSON.stringify(report)); assert.equal(report.runtimeReady, true);
  assert.deepEqual(snapshot(join(location.home, 'deps/ollama/.attempts')), before);
  save('fresh-inspection.json', { status: 'pass', elapsedMs: performance.now() - started, report, attemptsUnchanged: true });
} else {
  const store = ControllerStore.acquire(location);
  try {
    if (store.inspect().kind === 'missing') store.commit({ schemaVersion: 1, revision: 0,
      installation: { schemaVersion: 1, installationId: location.installationId, dataHome: location.home, delivery: { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' }, operationId: spec.operationId },
      operation: { operationId: spec.operationId, phase: 'preparing' } }, null);
    const context = createDependencyOperationContext(location, policy.target.os, { operationId: spec.operationId, attemptNonce: spec.attemptNonce,
      signal: AbortSignal.timeout(25 * 60 * 1000), assertCurrent() {
        store.assertHeld(); const current = store.inspect(); assert.equal(current.kind, 'present');
        assert.equal(current.snapshot.operation.operationId, spec.operationId); assert.equal(current.snapshot.operation.phase, 'preparing');
      }, progress(stage, detail) { process.stdout.write(JSON.stringify({ kind: 'progress', stage, detail }) + '\n'); } });
    const report = await port.inspect(location, context); assert.equal(report.runtimeReady, true, JSON.stringify(report));
    assert.equal(report.ollama, 'missing', JSON.stringify(report)); assert.ok(report.ollamaInstallOffer, JSON.stringify(report));
    const before = snapshot(join(location.home, 'deps')), marker = join(location.home, 'application-data');
    if (!existsSync(marker)) writeFileSync(marker, 'qualification application data remains unchanged', { mode: 0o600 });
    const markerBytes = readFileSync(marker);
    if (phase === 'decline') {
      const declined = await port.decide(location, { offerId: report.ollamaInstallOffer.id, choice: 'decline' }, context);
      assert.equal(declined.ollama, 'missing'); assert.ok(declined.blockers.length); assert.deepEqual(snapshot(join(location.home, 'deps')), before);
      save('decline.json', { status: 'pass', report: declined, dependencyFilesUnchanged: true, uid: process.getuid() });
    } else {
      const started = performance.now(), result = await port.decide(location, { offerId: report.ollamaInstallOffer.id, choice: 'install' }, context);
      assert.equal(result.ollama, 'ready', JSON.stringify(result));
      const attempts = await closedOllamaAttempts(location); assert.equal(attempts.length, 1);
      const attempt = attempts[0], record = join(location.home, attempt.identity.recordRelativePath), paths = servicePaths(record);
      const frame = parseServiceFrame(JSON.parse(readFileSync(paths.frame, 'utf8'))), payload = join(location.home, attempt.identity.payloadRelativePath);
      const verified = await verifyPreparedOllama(location, policy, payload);
      assert.equal(verified.inventorySha256, frame.admission.inventorySha256);
      const executable = join(payload, policy.layout.executable), env = ollamaServiceEnvironment(frame, process.env);
      const version = spawnSync(executable, ['--version'], { env, encoding: 'utf8', maxBuffer: 65536, timeout: 15000 });
      assert.equal(version.status, 0, version.stderr); assert.ok((version.stdout + version.stderr).includes(policy.version));
      const availability = await probeOllamaVersion(policy.endpoint, AbortSignal.timeout(3000));
      assert.deepEqual(availability, { state: 'ready', version: policy.version });
      const observed = [];
      for (const name of readdirSync('/proc').filter(name => /^\d+$/.test(name))) {
        try {
          if (readlinkSync(`/proc/${name}/exe`) !== executable) continue;
          const argv = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0').filter(Boolean);
          const actualEnv = Object.fromEntries(readFileSync(`/proc/${name}/environ`, 'utf8').split('\0').filter(Boolean).map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)]; }));
          assert.deepEqual(argv, [executable, 'serve']);
          for (const key of ['HOME', 'USERPROFILE', 'OLLAMA_HOST', 'OLLAMA_MODELS', 'PATH', 'TMPDIR', 'TMP', 'TEMP']) assert.equal(actualEnv[key], env[key], key);
          assert.equal(actualEnv.NODE_OPTIONS, undefined); assert.equal(actualEnv.ANTHROPIC_API_KEY, undefined);
          observed.push({ executable, argv, environment: Object.fromEntries(['HOME', 'OLLAMA_HOST', 'OLLAMA_MODELS', 'PATH', 'TMPDIR'].map(key => [key, actualEnv[key]])) });
        } catch (error) { if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error; }
      }
      assert.equal(observed.length, 1, 'exactly one accepted native CLI, without using a PID as control/closure evidence');
      assert.equal(files(join(location.home, policy.modelsRelativePath)).length, 0, 'no model download');
      const logs = files(join(location.home, policy.logsRelativePath)); assert.ok(logs.length <= 2);
      for (const file of logs) { assert.ok(file.bytes <= 1024 * 1024); assert.equal(file.mode, 0o600); assert.equal(file.uid, process.getuid()); }
      const evidence = snapshot(join(location.home, 'deps/ollama/.attempts'));
      const reused = await port.inspect(location); assert.equal(reused.ollama, 'ready', JSON.stringify(reused));
      assert.deepEqual(snapshot(join(location.home, 'deps/ollama/.attempts')), evidence); assert.deepEqual(readFileSync(marker), markerBytes);
      assert.equal(existsSync(join(location.home, 'releases')), false, 'no full daemon installation is claimed');
      save('native-install.json', { status: 'pass', policySha256: ollamaPolicySha256(policy), asset: policy.asset, target: policy.target,
        node: { version: process.version, executable: process.execPath }, uid: process.getuid(), elapsedMs: performance.now() - started,
        version: version.stdout + version.stderr, availability, files: verified.files.length, materializedBytes: verified.files.reduce((total, file) => total + file.bytes, 0),
        inventorySha256: verified.inventorySha256, observed, logs, modelFiles: 0, reusedWithoutMutation: true, applicationDataUnchanged: true,
        finiteEvidence: files(join(location.home, 'deps/ollama/.attempts')).map(file => ({ ...file, content: JSON.parse(readFileSync(file.path, 'utf8') || '{}') })),
        retainedService: true, endpointOwnership: 'unproven', fullDaemonInstallation: false });
    }
  } finally { store.close(); }
}
