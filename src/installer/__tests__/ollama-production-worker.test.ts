import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateRuntimeTest } from './_private-runtime-test.js';
import { ollamaFixture } from './_ollama-fixture.js';
import { prepareOllama } from '../ollama-prepare.js';
import { startOllamaService } from '../ollama-service.js';
import { servicePaths } from '../ollama-service-records.js';
import { dependencyPort } from '../dependencies.js';
import { createDependencyOperationContext } from '../dependency-context.js';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { bundleControlEntrypoint } from '../../../scripts/package-installer.mjs';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

const out = fileURLToPath(new URL('../../../out/installer/', import.meta.url));
const serve = Buffer.from(`const {createServer}=require('node:http');const {existsSync,mkdirSync,writeFileSync}=require('node:fs');const {join}=require('node:path');
const state=join(process.env.HOME,'fixture-state');mkdirSync(state,{recursive:true});
writeFileSync(join(state,'arguments.json'),JSON.stringify({script:process.argv[1],argv:process.argv.slice(2),cwd:process.cwd(),
credential:['ANTHROPIC_API_KEY','OPENAI_API_KEY','MISTRAL_API_KEY'].some(k=>process.env[k]!==undefined),nodeOptions:process.env.NODE_OPTIONS!==undefined,nodePath:process.env.NODE_PATH!==undefined,
home:process.env.HOME,models:process.env.OLLAMA_MODELS,endpoint:process.env.OLLAMA_HOST}));
const url=new URL('http://'+process.env.OLLAMA_HOST),server=createServer((req,res)=>res.end('{"version":"0.0.1-fixture"}'));
server.listen(Number(url.port),url.hostname.replace(/^\\[|\\]$/g,''));
const timer=setInterval(()=>{if(!existsSync(join(state,'stop')))return;clearInterval(timer);server.closeAllConnections();server.close();},20);
`);

privateRuntimeTest(import.meta.url, 'production-worker-dispatch-argv-path-and-sanitized-environment-with-seeded-sentinels', async () => {
  // A real private Node binary acts as the native fixture CLI and runs the
  // controlled `serve` file. This is not native Ollama qualification.
  const f = await ollamaFixture('worker-fixture', { executable: readFileSync(process.execPath), files: [{ path: 'serve', bytes: serve, mode: 0o644 }], prefix: 'iop space Ω-' });
  const workers: ChildProcess[] = [], keys = ['NODE_OPTIONS', 'NODE_PATH', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MISTRAL_API_KEY'], saved = keys.map(key => process.env[key]);
  let state: string | undefined;
  try {
    const input = await f.input(), prepared = await prepareOllama(f.location, input.policy, input.offer, f.context(), { recheck: f.recheck, transport: f.transport });
    state = join(dirname(prepared.offer.modelsDirectory), 'fixture-state');
    const binaryPath = `node_modules/@esbuild/${process.platform}-${process.arch}/${process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild'}`;
    const binary = join(f.root, binaryPath); mkdirSync(dirname(binary), { recursive: true }); copyFileSync(fileURLToPath(new URL(`../../../${binaryPath}`, import.meta.url)), binary);
    const directory = join(f.root, 'control space Ω'), bootstrap = join(directory, 'bootstrap.mjs'); mkdirSync(join(directory, 'native'), { recursive: true }); copyFileSync(join(out, 'native/control.node'), join(directory, 'native/control.node'));
    const run = createRun(f.root, { mode: 'build' });
    await withRun(run, async scope => { await bundleControlEntrypoint(run, scope, join(out, 'terminal-entry.js'), bootstrap, f.target); });
    for (const key of keys) process.env[key] = key === 'NODE_OPTIONS' ? '--no-warnings' : 'harmless-test-sentinel';
    const report = await startOllamaService(f.location, prepared, f.context(), { workerEntrypoint: bootstrap, recheck: f.recheck, readinessMs: 8000,
      workerStarted: child => { child.ref(); workers.push(child); } }); // The test positively joins this intentionally unref'ed production worker.
    assert.equal(report.ollama, 'ready'); assert.equal(workers.length, 1);
    assert.deepEqual(workers[0]!.spawnargs, [process.execPath, bootstrap, '--ollama-service-worker', f.home, f.location.installationId, prepared.identity.recordRelativePath]);
    assert.equal(workers[0]!.exitCode, null); const args = JSON.parse(readFileSync(join(state, 'arguments.json'), 'utf8'));
    assert.equal(args.script, join(prepared.directory, 'serve')); assert.deepEqual(args.argv, []); assert.equal(args.cwd, prepared.directory);
    assert.equal(args.credential, false); assert.equal(args.nodeOptions, false); assert.equal(args.nodePath, false);
    assert.equal(args.home, dirname(prepared.offer.modelsDirectory)); assert.equal(args.models, prepared.offer.modelsDirectory); assert.equal(args.endpoint, new URL(f.endpoint).host);
    assert.equal((await dependencyPort(f.target, f.location, f.options).inspect(f.location)).ollama, 'ready');
    const closed = once(workers[0]!, 'close'); writeFileSync(join(state, 'stop'), 'close owned native fixture'); assert.deepEqual(await closed, [0, null]);
    const exit = JSON.parse(readFileSync(servicePaths(join(f.home, prepared.identity.recordRelativePath)).exit, 'utf8'));
    assert.equal(exit.state, 'closed'); assert.equal(exit.code, 0); assert.equal(exit.signal, null);
  } finally {
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
    if (state && existsSync(state)) writeFileSync(join(state, 'stop'), 'close owned fixture');
    for (const child of workers) if (child.exitCode === null && child.signalCode === null) await once(child, 'close');
    // These are the production launcher's captured retained children, not
    // spawnFixture-owned actors. Their close events above are the evidence.
    assert.ok(workers.every(child => child.exitCode !== null || child.signalCode !== null)); await f.cleanup();
  }
});

privateRuntimeTest(import.meta.url, 'supervisor-control-entrypoint-link-check-is-identical-before-and-after-admission', async () => {
  const f = await ollamaFixture(); let launched = 0;
  try {
    const input = await f.input(), prepared = await prepareOllama(f.location, input.policy, input.offer, f.context(), { recheck: f.recheck, transport: f.transport });
    const entry = join(f.root, 'control.mjs'), alias = join(f.root, 'control-alias.mjs'), paths = servicePaths(join(f.home, prepared.identity.recordRelativePath));
    writeFileSync(entry, 'throw new Error("unsafe control must not execute");'); linkSync(entry, alias);
    const options = { workerEntrypoint: entry, recheck: f.recheck, workerStarted: () => { launched++; } };
    await assert.rejects(startOllamaService(f.location, prepared, f.context(), options), { code: 'dependency-uncertain' });
    assert.equal(existsSync(paths.admission), false); unlinkSync(alias);
    const context = createDependencyOperationContext(f.location, f.target.os, { ...f.context(), progress(stage) { if (stage === 'ollama-service-admitted') linkSync(entry, alias); } });
    await assert.rejects(startOllamaService(f.location, prepared, context, options), { code: 'dependency-uncertain' });
    assert.equal(existsSync(paths.admission), true); assert.equal(JSON.parse(readFileSync(paths.result, 'utf8')).state, 'not-started');
    assert.equal(JSON.parse(readFileSync(paths.diagnostic, 'utf8')).stage, 'pre-spawn'); assert.equal(launched, 0); assert.equal(existsSync(paths.launch), false);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'supervisor-death-does-not-imply-retained-service-death-or-authorize-replay', async () => {
  const f = await ollamaFixture(), children: ChildProcess[] = []; let service: ChildProcess | undefined;
  const state = join(f.root, 'service-state');
  try {
    const input = await f.input(), prepared = await prepareOllama(f.location, input.policy, input.offer, f.context(), { recheck: f.recheck, transport: f.transport });
    const record = join(f.home, prepared.identity.recordRelativePath), paths = servicePaths(record);
    // The installer has already positively closed its finite handoff. Only the
    // distinct retained supervisor below will die in this scenario.
    await startOllamaService(f.location, prepared, f.context(), { workerEntrypoint: 'trusted-fixture', recheck: f.recheck, readinessMs: 30, launch: async () => ({ started: true }) });
    const file = join(f.root, 'supervisor-input.json'); writeFileSync(file, JSON.stringify({ root: f.root, bin: f.bin, location: f.location, target: f.target,
      policy: input.policy, runtimeDirectory: f.options.runtimeDirectory, mode: 'supervisor', prepared }));
    const child = spawnFixture(process.execPath, [fileURLToPath(new URL('./ollama-signal-fixture.mjs', import.meta.url)), file], { stdio: ['pipe', 'ignore', 'pipe', 'ipc'] }); children.push(child);
    child.stderr!.resume(); let reached!: () => void, available!: () => void;
    const boundary = new Promise<void>(resolve => { reached = resolve; }), ready = new Promise<void>(resolve => { available = resolve; });
    child.on('message', (message: { type: string; environment?: NodeJS.ProcessEnv }) => {
      if (message.type === 'boundary') reached();
      if (message.type !== 'launch-service') return;
      service = spawnFixture(process.execPath, [fileURLToPath(new URL('./ollama-process-fixture.mjs', import.meta.url)), 'serve'], {
        env: { ...message.environment, INSRC_TEST_SERVICE_STATE: state, INSRC_TEST_SERVICE_MODE: 'silent' }, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(service);
      service.stderr!.resume(); service.stdout!.on('data', bytes => { if (bytes.toString().includes('fixture-ready')) available(); });
      service.once('spawn', () => { if (child.connected) child.send({ type: 'service-spawned' }); });
    });
    const closed = once(child, 'close'); await Promise.race([Promise.all([boundary, ready]), closed.then(result => { throw new Error(`supervisor ended before death boundary: ${result}`); })]);
    assert.equal(child.kill('SIGKILL'), true); assert.deepEqual(await closed, [null, 'SIGKILL']);
    assert.ok(service); assert.equal(service.exitCode, null); assert.equal(existsSync(paths.exit), false);
    const launch = readFileSync(paths.launch), running = readFileSync(paths.running); let replays = 0;
    assert.equal((await dependencyPort(f.target, f.location, f.options).inspect(f.location)).ollama, 'ready');
    const report = await startOllamaService(f.location, prepared, f.context(), { workerEntrypoint: 'trusted-fixture', recheck: f.recheck,
      launch: async () => { replays++; throw new Error('dead supervisor cannot authorize replay'); } });
    assert.equal(report.ollama, 'ready'); assert.equal(replays, 0); assert.deepEqual(readFileSync(paths.launch), launch); assert.deepEqual(readFileSync(paths.running), running);
    assert.equal(existsSync(paths.exit), false); assert.equal(existsSync(prepared.directory), true);
    const serviceClosed = once(service, 'close'); writeFileSync(join(state, 'stop'), 'close retained test service'); assert.deepEqual(await serviceClosed, [0, null]);
    assert.equal(existsSync(paths.exit), false, 'only the dead supervisor could have certified this service close');
    assert.equal((await dependencyPort(f.target, f.location, f.options).inspect(f.location)).ollama, 'unavailable');
  } finally {
    mkdirSync(state, { recursive: true }); writeFileSync(join(state, 'stop'), 'close owned fixture');
    if (service && service.exitCode === null && service.signalCode === null) await once(service, 'close');
    await stopOwnedChildren(children); await f.cleanup();
  }
});
