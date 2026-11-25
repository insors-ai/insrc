import { privateRuntimeTest } from './_private-runtime-test.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { dependencyPort, dependencyReadIo, executableCandidates, inspectDependencies } from '../dependencies.js';
import type { DependencyOptions, DependencyReadIo } from '../dependencies.js';
import type { Target } from '../contracts.js';
import { resolveInstallationLocation } from '../location.js';
import { ollamaPolicySha256 } from '../ollama-policy.js';
import type { OllamaPolicy } from '../ollama-policy.js';

const target: Target = { os: process.platform as Target['os'], arch: process.arch as Target['arch'], baseline: 'fixture' };
const runtimeDirectory = target.os === 'win32' ? dirname(realpathSync(process.execPath)) : dirname(dirname(realpathSync(process.execPath)));
const errno = (code: string) => Object.assign(new Error(code), { code });
type Handler = (request: IncomingMessage, response: ServerResponse) => void;
async function fixture(handler?: Handler) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'idp-')), home = join(root, 'h'), bin = join(root, 'bin');
  mkdirSync(home); mkdirSync(bin);
  const location = resolveInstallationLocation('dependencies', { home });
  const requests: string[] = [], server = createServer((req, res) => { requests.push(`${req.method} ${req.url}`); (handler ?? ((_req, response) => response.end('{"version":"0.5.1"}')))(req, res); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}`;
  writeFileSync(join(home, 'config.json'), JSON.stringify({ models: { local: { host: endpoint } } }));
  // Detection fixtures cannot discover host Applications/PATH binaries.
  const io: DependencyReadIo = { ...dependencyReadIo, async stat(file) {
    if (!file.startsWith(root + '/')) throw errno('ENOENT'); return dependencyReadIo.stat(file);
  } };
  const options: DependencyOptions = { runtimeDirectory, environment: { PATH: bin }, userHome: root, io };
  let closed = false;
  const closeServer = async () => { if (!closed) { closed = true; const end = once(server, 'close'); server.closeAllConnections(); server.close(); await end; } };
  const executable = (name: string, mode = 0o755) => {
    const file = join(bin, name); writeFileSync(file, `#!/bin/sh\nprintf spawned > '${join(root, 'spawned')}'\n`, { mode }); return file;
  };
  const policy = (): OllamaPolicy => {
    const value: OllamaPolicy = { schemaVersion: 1, target, version: '0.0.1-fixture',
      asset: { url: `https://github.com/ollama/ollama/releases/download/v0.0.1-fixture/ollama.${target.os === 'linux' ? 'tar.zst' : 'zip'}`,
        sha256: 'a'.repeat(64), bytes: 100, format: target.os === 'linux' ? 'tar.zst' : 'zip' },
      limits: { expandedBytes: 1000, fileBytes: 500, files: 10, windowBytes: 1024 }, layout: { executable: 'bin/ollama', requiredFiles: ['bin/ollama'], aliases: [] },
      endpoint, modelsRelativePath: 'deps/ollama/data/models', logsRelativePath: 'deps/ollama/logs/server', start: true };
    // Only deterministic fixture metadata; never added to shipped target policy.
    value.qualification = { policySha256: ollamaPolicySha256(value), native: true, evidence: 'fixtures/not-native-evidence.json',
      checks: { version: true, readiness: true, reuse: true, decline: true, userOnly: true } }; return value;
  };
  return { root, home, bin, location, endpoint, requests, server, options, executable, policy, closeServer,
    async cleanup() { await closeServer(); rmSync(root, { recursive: true, force: true }); } };
}
function tree(root: string): unknown[] {
  return readdirSync(root).sort().map(name => { const file = join(root, name), stat = lstatSync(file);
    return stat.isDirectory() ? [name, tree(file)] : [name, stat.isSymbolicLink() ? 'link' : readFileSync(file).toString('base64'), stat.mode]; });
}

privateRuntimeTest(import.meta.url, 'dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable', async () => {
  for (const kind of ['missing', 'stopped', 'ready', 'malformed', 'redirect', 'oversized', 'slow', 'permission', 'configuration'] as const) {
    const f = await fixture((req, res) => {
      if (kind === 'slow') return;
      if (kind === 'redirect') { res.writeHead(302, { location: 'http://external.invalid/model' }); res.end(); }
      else if (kind === 'oversized') res.end('x'.repeat(16385));
      else res.end(kind === 'malformed' ? '{"version":null}' : '{"version":"0.5.1"}');
    });
    try {
      if (kind === 'missing' || kind === 'stopped' || kind === 'permission') await f.closeServer();
      if (kind === 'stopped') f.executable('ollama');
      if (kind === 'configuration') { f.executable('claude'); writeFileSync(join(f.home, 'config.json'), '{"models":{"local":{"host":"http://external.invalid:11434"}}}'); }
      const io = kind === 'permission' ? { ...f.options.io!, stat: async (file: string) => { if (file === join(f.bin, 'ollama')) throw errno('EACCES'); return f.options.io!.stat(file); } } : f.options.io;
      const started = performance.now();
      const result = await inspectDependencies(f.location, target, { ...f.options, policies: [f.policy()], io, budgetMs: kind === 'slow' ? 80 : 3000 });
      assert.equal(result.report.ollama, kind === 'missing' ? 'missing' : kind === 'stopped' ? 'installed-not-running' : kind === 'ready' ? 'ready' : 'unavailable', kind);
      assert.equal(result.report.runtimeReady, true, kind);
      assert.equal(!!result.report.ollamaInstallOffer, kind === 'missing', kind);
      if (kind !== 'ready') assert.ok(result.report.blockers.length, kind);
      if (kind === 'slow') assert.ok(performance.now() - started < 700, 'aggregate deadline must bound the whole inspection');
      if (kind === 'configuration') { assert.equal(result.report.agents.claude, true); assert.deepEqual(f.requests, []); }
      assert.ok(f.requests.every(request => request === 'GET /api/version'));
      assert.equal(existsSync(join(f.root, 'spawned')), false);
    } finally { await f.cleanup(); }
  }
});

privateRuntimeTest(import.meta.url, 'healthy-service-without-path-binary-is-reused', async () => {
  const f = await fixture();
  try {
    const result = await inspectDependencies(f.location, target, { ...f.options, policies: [f.policy()] });
    assert.equal(result.report.ollama, 'ready'); assert.equal(result.executable, undefined);
    assert.equal(result.offer, undefined); assert.equal(result.report.ollamaInstallOffer, undefined); assert.deepEqual(result.report.blockers, []);
    assert.deepEqual(f.requests, ['GET /api/version']); assert.equal(existsSync(join(f.home, 'deps')), false);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'inspect-and-decline-have-zero-mutation-or-process-side-effects', async () => {
  const f = await fixture();
  try {
    await f.closeServer(); for (const name of ['claude', 'codex', 'vibe']) f.executable(name);
    const before = tree(f.root), port = dependencyPort(target, f.location, { ...f.options, policies: [f.policy()] });
    const report = await port.inspect(f.location); assert.equal(report.ollama, 'missing'); assert.ok(report.ollamaInstallOffer);
    const declined = await port.decide(f.location, { offerId: report.ollamaInstallOffer.id, choice: 'decline' });
    assert.equal(declined.ollama, 'missing'); assert.ok(declined.blockers.length);
    assert.deepEqual(tree(f.root), before); assert.equal(existsSync(join(f.root, 'spawned')), false);
    await assert.rejects(port.decide(f.location, { offerId: report.ollamaInstallOffer.id, choice: 'install' }), { code: 'dependency-context-invalid' });
    await assert.rejects(port.inspect({ ...f.location, home: join(f.root, 'foreign') }), { code: 'identity-mismatch' });
    const original = f.options.io!, slow: DependencyReadIo = { ...original, async stat(file) { await delay(100); return original.stat(file); } };
    const timed = await inspectDependencies(f.location, target, { ...f.options, io: slow, budgetMs: 20 });
    const saved = structuredClone(timed); await delay(130); assert.deepEqual(timed, saved, 'late reads cannot mutate a returned report');
    assert.deepEqual(tree(f.root), before);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'stopped-existing-ollama-has-manual-guidance-without-start-action', async () => {
  const f = await fixture();
  try {
    await f.closeServer(); const file = f.executable('ollama');
    const result = await inspectDependencies(f.location, target, f.options);
    assert.equal(result.report.ollama, 'installed-not-running'); assert.equal(result.report.ollamaInstallOffer, undefined);
    assert.ok(result.report.recommendations.some(line => line.includes(file) && line.includes('serve')));
    assert.equal(existsSync(join(f.root, 'spawned')), false);
    rmSync(file); mkdirSync(join(f.home, 'deps')); symlinkSync(join(f.root, 'outside'), join(f.home, 'deps/ollama'));
    const linked = await inspectDependencies(f.location, target, { ...f.options, policies: [f.policy()] });
    assert.equal(linked.report.ollama, 'unavailable'); assert.equal(linked.offer, undefined);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'agent-zero-one-many-detection-never-spawns-auth-model-or-install', async () => {
  const f = await fixture();
  try {
    let report = (await inspectDependencies(f.location, target, f.options)).report;
    assert.deepEqual(report.agents, { claude: false, codex: false, vibe: false }); assert.ok(report.recommendations.some(line => line.includes('at least one')));
    f.executable('claude'); report = (await inspectDependencies(f.location, target, f.options)).report;
    assert.deepEqual(report.agents, { claude: true, codex: false, vibe: false });
    f.executable('codex'); f.executable('vibe'); report = (await inspectDependencies(f.location, target, f.options)).report;
    assert.deepEqual(report.agents, { claude: true, codex: true, vibe: true }); assert.equal(existsSync(join(f.root, 'spawned')), false);
    assert.ok(f.requests.every(request => request === 'GET /api/version'));
    const windows = executableCandidates('codex', { Path: 'C:\\Tools;D:\\Other Tools', PATHEXT: '.EXE;.CMD;.PS1' }, 'win32', 'C:\\Users\\Engineer');
    assert.ok(windows.paths.includes('D:\\Other Tools\\codex.cmd')); assert.ok(windows.paths.includes('C:\\Tools\\codex.ps1'));
    assert.ok(executableCandidates('vibe', { PATH: '.:/absolute' }, 'linux', '/home/user').diagnostics.length);
    const denied = join(f.root, 'denied'), io: DependencyReadIo = { ...f.options.io!, async stat(file) {
      if (file.startsWith(denied + '/')) throw errno('EACCES'); return f.options.io!.stat(file);
    } };
    report = (await inspectDependencies(f.location, target, { ...f.options, io, environment: { PATH: `${denied}:${f.bin}` } })).report;
    assert.equal(report.agents.codex, true); assert.ok(report.recommendations.some(line => line.includes('codex') && line.includes('could not be inspected')));
    // App presence alone is not CLI presence. The actual packaged CLI path is
    // independently exercised as a filesystem fixture, not native Mac evidence.
    const app = join(f.root, 'Applications/ChatGPT.app/Contents'); mkdirSync(join(app, 'MacOS'), { recursive: true });
    writeFileSync(join(app, 'MacOS/ChatGPT'), 'GUI only', { mode: 0o755 });
    const darwin = { ...target, os: 'darwin' as const }, noPath = { ...f.options, environment: { PATH: '' } };
    assert.equal((await inspectDependencies(f.location, darwin, noPath)).report.agents.codex, false);
    mkdirSync(join(app, 'Resources/codex-cli/bin'), { recursive: true });
    writeFileSync(join(app, 'Resources/codex-cli/bin/codex'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
    assert.equal((await inspectDependencies(f.location, darwin, noPath)).report.agents.codex, true);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'private-runtime-provenance-rejects-path-node-and-wrong-target', async () => {
  const f = await fixture();
  try {
    f.executable('node'); f.executable('npm');
    assert.equal((await inspectDependencies(f.location, target, f.options)).report.runtimeReady, true);
    assert.equal((await inspectDependencies(f.location, target, { ...f.options, runtimeDirectory: f.bin })).report.runtimeReady, false);
    const wrong = { ...target, arch: target.arch === 'arm64' ? 'x64' as const : 'arm64' as const };
    assert.equal((await inspectDependencies(f.location, wrong, f.options)).report.runtimeReady, false);
    for (const bad of ['npm', 'headers']) {
      const io: DependencyReadIo = { ...f.options.io!, async read(file, limit, signal) {
        if (bad === 'npm' && file.endsWith('/npm/package.json')) return Buffer.from('{"version":"99.0.0"}');
        if (bad === 'headers' && file.endsWith('/node_version.h')) return Buffer.from('#define NODE_MAJOR_VERSION 99');
        return f.options.io!.read(file, limit, signal);
      } };
      assert.equal((await inspectDependencies(f.location, target, { ...f.options, io })).report.runtimeReady, false, bad);
    }
    let readsAfterSlowRuntime = 0;
    const delayed: DependencyReadIo = { ...f.options.io!, async realpath(file) { await delay(100); return f.options.io!.realpath(file); },
      async read(file, limit, signal) { readsAfterSlowRuntime++; return f.options.io!.read(file, limit, signal); } };
    const start = performance.now();
    assert.equal((await inspectDependencies(f.location, target, { ...f.options, io: delayed, budgetMs: 20 })).report.runtimeReady, false);
    assert.ok(performance.now() - start < 300, 'runtime verification itself must obey the aggregate deadline');
    await delay(120); assert.equal(readsAfterSlowRuntime, 0, 'no later reads are admitted after a timed-out runtime identity lookup');
    const cancel = new AbortController(); cancel.abort();
    await assert.rejects(inspectDependencies(f.location, target, f.options, { signal: cancel.signal }), { code: 'cancelled' });
    assert.equal(existsSync(join(f.root, 'spawned')), false);
  } finally { await f.cleanup(); }
});
