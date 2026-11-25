import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, lstatSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ollamaFixture } from './_ollama-fixture.js';
import { prepareOllama, closedOllamaAttempts } from '../ollama-prepare.js';
import { startOllamaService } from '../ollama-service.js';
import { serviceAdmission, servicePaths } from '../ollama-service-records.js';
import { dependencyPort } from '../dependencies.js';
import { canonicalJson, digest } from '../release-descriptor.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import { completeNode22Fixture } from './_runtime-fixture.js';

// The tracked gate may use the host Node. Execute the unchanged production
// runtime checks in the complete verified Node fixture, never weaken them.
function serviceTest(title: string, run: () => Promise<void>): void {
  test(title, async () => {
    if (process.version === 'v22.22.1') return run();
    const runtime = await completeNode22Fixture(), children: ChildProcess[] = [];
    try {
      const child = spawnFixture(runtime.executable, ['--import', 'tsx', '--test', '--test-name-pattern', `^${title}$`, fileURLToPath(import.meta.url)],
        { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
      children.push(child); let output = '';
      for (const stream of [child.stdout!, child.stderr!]) stream.on('data', bytes => { output = (output + String(bytes)).slice(-32768); });
      assert.deepEqual(await once(child, 'close'), [0, null], output);
      assert.match(output, /^# pass 1$/m);
    } finally { await stopOwnedChildren(children); runtime.cleanup(); }
  });
}

const driver = fileURLToPath(new URL('./ollama-service-worker-fixture.mjs', import.meta.url));
const inspector = fileURLToPath(new URL('./ollama-inspect-fixture.mjs', import.meta.url));
async function until(check: () => boolean, budget = 5000) {
  const end = performance.now() + budget;
  while (!check()) { if (performance.now() > end) throw new Error('owned service fixture did not reach its recorded state'); await delay(10); }
}
async function fixture() {
  const base = await ollamaFixture(), children: ChildProcess[] = [];
  const input = await base.input(), prepared = await prepareOllama(base.location, input.policy, input.offer, base.context(), { recheck: base.recheck, transport: base.transport });
  const record = join(base.home, prepared.identity.recordRelativePath), paths = servicePaths(record), state = join(base.root, 'service-state');
  let launches = 0;
  const launch = async (_frame: unknown, file: string, mode = 'ready') => {
    assert.equal(existsSync(paths.admission), true, 'durable admission precedes any retained process');
    launches++; const child = spawnFixture(process.execPath, [driver, base.home, file, mode], { stdio: ['ignore', 'ignore', 'pipe'] }); children.push(child);
    let diagnostic = ''; child.stderr!.on('data', (bytes: Buffer) => { diagnostic = (diagnostic + bytes.toString()).slice(-8192); });
    child.on('error', () => {}); await once(child, 'spawn');
    return { started: true, diagnostic };
  };
  const stop = async () => {
    if (children.some(child => child.exitCode === null && child.signalCode === null)) { mkdirSync(state, { recursive: true }); writeFileSync(join(state, 'stop'), 'close owned fixture'); }
    for (const child of children) if (child.exitCode === null && child.signalCode === null) await once(child, 'close');
  };
  const inspectFresh = async (framePath = paths.frame) => {
    const child = spawnFixture(process.execPath, [inspector, framePath], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
    let result = '', diagnostic = ''; child.stdout!.on('data', (data: Buffer) => { result += data.toString(); assert.ok(result.length <= 16384); }); child.stderr!.on('data', (data: Buffer) => { diagnostic = (diagnostic + data.toString()).slice(-8192); });
    assert.deepEqual(await once(child, 'close'), [0, null], diagnostic); return JSON.parse(result) as { ollama: string; recommendations: string[] };
  };
  return { ...base, prepared, record, paths, state, children, launch, count: () => launches, stop, inspectFresh,
    service: { workerEntrypoint: driver, recheck: base.recheck, readinessMs: 3000, launch },
    async cleanup() { try { await stop(); } finally { await stopOwnedChildren(children); await base.cleanup(); } } };
}
function attemptBytes(root: string): unknown {
  return readdirSync(root).sort().map(name => { const file = join(root, name); return [name, lstatSync(file).isDirectory() ? attemptBytes(file) : readFileSync(file).toString('base64')]; });
}
function replacePayload(f: Awaited<ReturnType<typeof fixture>>): () => void {
  const inventoryFile = join(f.prepared.directory, 'inventory.json'), receiptFile = join(f.prepared.directory, '.ollama-receipt.json'), dataFile = join(f.prepared.directory, 'lib/data.dat');
  const inventoryBytes = readFileSync(inventoryFile), receiptBytes = readFileSync(receiptFile), dataBytes = readFileSync(dataFile);
  const inventory = JSON.parse(inventoryBytes.toString()), changed = Buffer.alloc(dataBytes.length, 2);
  inventory.files.find((file: { path: string }) => file.path === 'lib/data.dat').sha256 = digest(changed);
  const replacedInventory = canonicalJson(inventory), receipt = JSON.parse(receiptBytes.toString()); receipt.inventorySha256 = digest(replacedInventory);
  writeFileSync(dataFile, changed); writeFileSync(inventoryFile, replacedInventory); writeFileSync(receiptFile, canonicalJson(receipt));
  return () => { writeFileSync(dataFile, dataBytes); writeFileSync(inventoryFile, inventoryBytes); writeFileSync(receiptFile, receiptBytes); };
}

serviceTest('service-admission-is-durable-and-distinct-from-finite-preparation-drain', async () => {
  const f = await fixture();
  try {
    const report = await startOllamaService(f.location, f.prepared, f.context(), f.service); assert.equal(report.ollama, 'ready'); assert.equal(f.count(), 1);
    assert.equal((await closedOllamaAttempts(f.location)).length, 1, 'retained service is not an unclosed preparation actor');
    assert.equal(f.children[0]!.exitCode, null); assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain');
    const launch = JSON.parse(readFileSync(join(f.root, 'launch-arguments.json'), 'utf8'));
    assert.equal(launch.executable, join(f.prepared.directory, f.prepared.policy.layout.executable)); assert.deepEqual(launch.argv, ['serve']);
    const args = JSON.parse(readFileSync(join(f.state, 'arguments.json'), 'utf8'));
    assert.deepEqual(args.argv, ['serve']); assert.equal(args.credential, false); assert.equal(args.nodeOptions, false);
    assert.equal(args.environment.OLLAMA_MODELS, f.prepared.offer.modelsDirectory); assert.equal(args.environment.HOME, dirname(f.prepared.offer.modelsDirectory));
    assert.equal(args.environment.OLLAMA_HOST, new URL(f.endpoint).host);
    await f.stop(); // inspect a closed log epoch, outside the atomic rotation window
    const logs = f.prepared.offer.logsDirectory;
    const files = readdirSync(logs); assert.equal(files.length, 2); let bytes = 0;
    for (const file of files) { const size = lstatSync(join(logs, file)).size; assert.ok(size <= 1024 * 1024); bytes += size; }
    assert.ok(bytes <= 2 * 1024 * 1024); assert.equal(readFileSync(join(f.state, 'last-request'), 'utf8'), 'GET /api/version');
    assert.equal(existsSync(join(f.home, 'releases')), false);
  } finally { await f.cleanup(); }
});

serviceTest('interrupted-attempt-reconciles-existing-receipt-without-duplicate-download-or-spawn', async () => {
  const f = await fixture();
  try {
    const restore = replacePayload(f);
    assert.equal((await dependencyPort(f.target, f.location, f.options).inspect(f.location)).ollama, 'unavailable', 'published preparation must match its closed inventory before admission');
    restore();
    assert.equal((await dependencyPort(f.target, f.location, { ...f.options, policies: [] }).inspect(f.location)).ollama, 'unavailable', 'missing original policy cannot bypass published payload verification');
    await startOllamaService(f.location, f.prepared, f.context(), f.service);
    const before = attemptBytes(join(f.home, 'deps/ollama/.attempts'));
    const fresh = dependencyPort(f.target, f.location, f.options);
    assert.equal((await f.inspectFresh()).ollama, 'ready');
    assert.deepEqual(attemptBytes(join(f.home, 'deps/ollama/.attempts')), before); assert.equal(f.count(), 1);
    const launch = readFileSync(f.paths.launch); unlinkSync(f.paths.launch);
    assert.equal((await f.inspectFresh()).ollama, 'unavailable', 'running fact without durable launch admission is not trusted');
    writeFileSync(f.paths.launch, launch, { mode: 0o600, flag: 'wx' });
    const restoreAdmitted = replacePayload(f);
    assert.equal((await f.inspectFresh()).ollama, 'unavailable', 'a self-consistent replacement tree cannot replace the admitted inventory');
    restoreAdmitted();
    const reused = await startOllamaService(f.location, f.prepared, f.context(), { ...f.service, launch: async () => { throw new Error('must not replay a retained launch'); } });
    assert.equal(reused.ollama, 'ready'); assert.equal(f.count(), 1);
    await f.stop(); await until(() => existsSync(f.paths.exit));
    const stopped = await f.inspectFresh(); assert.equal(stopped.ollama, 'installed-not-running');
    assert.ok(stopped.recommendations.some(item => item.startsWith('Start Ollama manually'))); assert.equal(f.count(), 1);
    const frame = readFileSync(f.paths.frame); writeFileSync(f.paths.frame, frame.toString().replace(/"nonce":"[a-f0-9]{64}"/, `"nonce":"${'0'.repeat(64)}"`));
    const invalid = await f.inspectFresh(); assert.equal(invalid.ollama, 'unavailable'); assert.equal(f.count(), 1);
    writeFileSync(f.paths.frame, frame);
  } finally { await f.cleanup(); }
  const interrupted = await fixture();
  try {
    const report = await startOllamaService(interrupted.location, interrupted.prepared, interrupted.context(), { ...interrupted.service,
      readinessMs: 40, launch: async () => ({ started: true }) });
    assert.equal(report.ollama, 'unavailable');
    const fresh = dependencyPort(interrupted.target, interrupted.location, interrupted.options); assert.equal((await fresh.inspect(interrupted.location)).ollama, 'unavailable');
    assert.equal((await startOllamaService(interrupted.location, interrupted.prepared, interrupted.context(), { ...interrupted.service, launch: async () => { throw new Error('ambiguous launch replayed'); } })).ollama, 'unavailable');
    assert.equal(interrupted.count(), 0);
  } finally { await interrupted.cleanup(); }
});

serviceTest('owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener', async () => {
  for (const mode of ['existing', 'race', 'slow'] as const) {
    const f = await fixture();
    try {
      const listen = async () => { f.server.listen(f.port, '127.0.0.1'); await once(f.server, 'listening'); };
      if (mode === 'existing') await listen();
      const result = await startOllamaService(f.location, f.prepared, f.context(), { ...f.service, readinessMs: mode === 'slow' ? 300 : 3000,
        launch: async (frame, record) => { if (mode === 'race') await listen(); return f.launch(frame, record, mode === 'slow' ? 'slow' : 'ready'); } });
      if (mode === 'slow') {
        assert.equal(result.ollama, 'unavailable'); assert.equal(f.children[0]!.exitCode, null);
        assert.equal((await dependencyPort(f.target, f.location, f.options).inspect(f.location)).ollama, 'unavailable');
      } else {
        assert.equal(result.ollama, 'ready'); assert.equal(f.server.listening, true);
        assert.equal(f.count(), mode === 'existing' ? 0 : 1);
        if (mode === 'existing') assert.equal(existsSync(f.paths.admission), false);
        else { await until(() => existsSync(f.paths.exit)); assert.equal(JSON.parse(readFileSync(f.paths.exit, 'utf8')).endpointOwnership, 'unproven'); }
      }
    } finally { await f.cleanup(); }
  }
});

serviceTest('service-admission-cancellation-retains-only-explicitly-accepted-service-intent', async () => {
  const before = await fixture();
  try {
    const cancel = new AbortController(), owner = before.context('a'.repeat(64), cancel.signal); cancel.abort();
    await assert.rejects(startOllamaService(before.location, before.prepared, owner, before.service), { code: 'cancelled' });
    assert.equal(before.count(), 0); assert.equal(existsSync(before.paths.admission), false);
  } finally { await before.cleanup(); }
  const stalled = await fixture(); let release: (() => void) | undefined;
  try {
    const cancel = new AbortController(), owner = stalled.context('a'.repeat(64), cancel.signal);
    const check = await stalled.recheck(new AbortController().signal);
    let entered = false;
    const pending = startOllamaService(stalled.location, stalled.prepared, owner, { ...stalled.service, cleanupMs: 20,
      recheck: async () => { entered = true; await new Promise<void>(resolve => { release = resolve; }); return check; } });
    const rejected = assert.rejects(pending, { code: 'dependency-uncertain' });
    await until(() => entered); cancel.abort(); await rejected;
    assert.equal(existsSync(stalled.paths.admission), false); assert.equal(stalled.count(), 0);
    const input = join(stalled.root, 'inspection-input.json'), attempt = JSON.parse(readFileSync(stalled.record, 'utf8'));
    writeFileSync(input, canonicalJson({ schemaVersion: 1, location: stalled.location, policy: stalled.prepared.policy, attempt,
      admission: serviceAdmission(attempt, stalled.prepared.inventorySha256, 'e'.repeat(64)) }));
    assert.equal((await stalled.inspectFresh(input)).ollama, 'unavailable', 'a new process cannot bypass the unclosed finite handoff');
    await assert.rejects(startOllamaService(stalled.location, stalled.prepared, stalled.context(), stalled.service), { code: 'dependency-uncertain' });
    assert.equal(stalled.count(), 0);
    release();
    const directory = dirname(stalled.record);
    await until(() => readdirSync(directory).some(name => /\.handoff-[a-f0-9]{32}\.closed\.json$/.test(name)));
    assert.equal((await stalled.inspectFresh(input)).ollama, 'installed-not-running', 'only positive late closure clears the finite-work block');
  } finally { release?.(); await stalled.cleanup(); }
  const after = await fixture();
  try {
    const cancel = new AbortController();
    await assert.rejects(startOllamaService(after.location, after.prepared, after.context('a'.repeat(64), cancel.signal), { ...after.service,
      launch: async (frame, record) => { cancel.abort(); return after.launch(frame, record); } }), { code: 'cancelled' });
    assert.equal(after.count(), 1); await until(() => existsSync(join(after.state, 'ready')) && existsSync(after.paths.running));
    assert.equal(after.children[0]!.exitCode, null); assert.equal((await dependencyPort(after.target, after.location, after.options).inspect(after.location)).ollama, 'ready');
    assert.equal(JSON.parse(readFileSync(after.paths.result, 'utf8')).state, 'unverified');
    assert.equal(JSON.parse(readFileSync(after.paths.admission, 'utf8')).retained, true);
    assert.equal(canonicalJson(JSON.parse(readFileSync(after.paths.admission, 'utf8'))), readFileSync(after.paths.admission, 'utf8'));
  } finally { await after.cleanup(); }
});
