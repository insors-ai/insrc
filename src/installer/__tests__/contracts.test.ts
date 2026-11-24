import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRIVATE_NODE_VERSION } from '../contracts.js';
import type { ReleaseManifest } from '../contracts.js';
import { parseInstaller, parseManagerRequest, parseReleaseManifest, parseTerminalLaunch } from '../schemas.js';
import { resolveInstallationLocation } from '../location.js';

const digest = 'a'.repeat(64);
function manifest(): ReleaseManifest {
  const target = { os: 'linux' as const, arch: 'arm64' as const, baseline: 'ubuntu-24.04' };
  return { schemaVersion: 1, releaseId: 'release-1', sourceCommit: 'b'.repeat(40), target,
    runtime: { version: PRIVATE_NODE_VERSION, target: { ...target }, sha256: digest, relativeExecutable: 'bin/node' },
    payloadSha256: digest, daemonEntry: 'out/daemon/index.js', managerEntry: 'control/manager.js', tuiEntry: 'out/cli/index.js',
    protocolVersion: 1, compatiblePredecessors: ['release-0'], migrations: [{ id: 'hook-1', version: '1', module: 'hooks/one.js' }] };
}

test('strict installer schemas reject invalid target runtime entrypoint hook and bridge records', () => {
  const good = manifest();
  assert.deepEqual(parseReleaseManifest(good, { target: good.target, predecessorId: 'release-0' }), good);
  const changes: Array<(m: ReleaseManifest) => void> = [
    m => { m.schemaVersion = 2 as 1; }, m => { m.runtime.version = '26.5.1'; },
    m => { m.runtime.target.arch = 'x64'; }, m => { m.runtime.target.baseline = 'other'; },
    m => { m.runtime.relativeExecutable = 'node'; }, m => { m.payloadSha256 = 'bad'; },
    m => { m.migrations.push({ ...m.migrations[0]! }); }, m => { m.migrations[0]!.module = '../outside.js'; },
    m => { m.compatiblePredecessors.push('release-0'); }, m => { m.sourceCommit = 'main'; },
  ];
  for (const change of changes) { const invalid = structuredClone(good); change(invalid); assert.throws(() => parseReleaseManifest(invalid)); }
  for (const path of ['/outside.js', 'C:/outside.js', '..\\outside.js', 'out/../escape.js', 'out/file:stream', 'out/CON.js', 'out/file.', 'out//file.js', 'out/*.js', 'out/./file.js']) {
    assert.throws(() => parseReleaseManifest({ ...good, daemonEntry: path }), path);
  }
  assert.throws(() => parseReleaseManifest(good, { target: { ...good.target, arch: 'x64' } }));
  assert.throws(() => parseReleaseManifest(good, { target: good.target, predecessorId: 'unknown' }));
  assert.throws(() => parseReleaseManifest({ ...good, extra: true }), { code: 'manifest-invalid' });
  assert.throws(() => parseInstaller('managerRequest', { protocolVersion: 1, operationId: 'op', installationId: 'home', action: 'start', source: 'bootstrap' }));
  assert.throws(() => parseInstaller('managerRequest', { protocolVersion: 1, operationId: 'op', installationId: 'home', action: 'start', message: 'x'.repeat(70_000) }));
  assert.throws(() => parseInstaller('bridgeHello', { kind: 'hello', protocolVersion: 1, sessionNonce: 'a'.repeat(32) }));
  assert.throws(() => parseInstaller('bridgeCommand', { kind: 'cancel', transportId: 'id', request: {} }));
  assert.throws(() => parseInstaller('endpoint', { kind: 'named-pipe', address: '\\\\server\\pipe\\daemon', installationId: 'home' }));
  assert.throws(() => parseInstaller('endpoint', { kind: 'unix', address: '/tmp/../other/daemon.sock', installationId: 'home' }));
});

test('install is rejected even with a forged source/bootstrap marker', () => {
  const input = { protocolVersion: 1, operationId: 'op', installationId: 'home', action: 'install' };
  for (const claim of [{}, { source: 'bootstrap' }, { bootstrap: true }, { caller: 'installer' }]) {
    assert.throws(() => parseManagerRequest({ ...input, ...claim }), { code: 'install-terminal-required' });
  }
  assert.equal(parseManagerRequest({ ...input, action: 'inspect' }).action, 'inspect');
  assert.throws(() => parseManagerRequest({ ...input, action: 'upgrade' }), { code: 'offer-required' });
  assert.throws(() => parseManagerRequest({ ...input, action: 'upgrade', acceptedOfferId: 'offer', installOllama: true }), { code: 'install-terminal-required' });
  assert.throws(() => parseManagerRequest({ ...input, action: 'start', shutdownMode: 'immediate' }));
});

test('foundation reports and snapshots validate identity without inventing readiness', () => {
  const report = { runtimeReady: true, ollama: 'missing', agents: { claude: false, codex: false, vibe: false }, recommendations: ['Install a coding CLI'], blockers: ['Ollama unavailable'] };
  assert.equal(parseInstaller('dependencyReport', report).ollama, 'missing');
  assert.throws(() => parseInstaller('dependencyReport', { ...report, agents: { codex: false } }));
  const installation = { schemaVersion: 1, installationId: 'home', dataHome: '/tmp/insrc', delivery: { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' } };
  parseInstaller('snapshot', { schemaVersion: 1, revision: 0, installation });
  assert.throws(() => parseInstaller('installation', { ...installation, dataHome: '../other' }));
  assert.throws(() => parseInstaller('snapshot', { schemaVersion: 1, revision: 0, installation, operation: { operationId: 'op', phase: 'preparing' } }));
  assert.throws(() => parseInstaller('managerEvent', { protocolVersion: 1, operationId: 'op', kind: 'result', state: { operationId: 'other', phase: 'ready' }, retryable: false }));
  parseInstaller('hookDecision', { needed: false, reason: 'No work' });
  parseInstaller('hookValidation', { passed: false, detail: 'Incomplete' });
});

test('terminal launch preserves explicit home and successful handoff contract', () => {
  const location = resolveInstallationLocation('home', { home: '/tmp/insrc' });
  const launch = { operationId: 'op', installationId: 'home', home: location.home, platform: 'posix', scriptPath: '/tmp/install script.sh', scriptVersion: '1', scriptSha256: digest, arguments: ['--home', location.home, '--installation-id', 'home', '--operation-id', 'op'], terminalName: 'Insrc Installation', onInstallSuccess: 'launch-tui' };
  assert.deepEqual(parseTerminalLaunch(launch, location), launch);
  assert.throws(() => parseTerminalLaunch({ ...launch, home: '/tmp/other' }, location));
  assert.throws(() => parseTerminalLaunch({ ...launch, installationId: 'other' }, location));
  assert.throws(() => parseTerminalLaunch({ ...launch, scriptPath: '../install.sh' }, location));
  assert.throws(() => parseTerminalLaunch({ ...launch, onInstallSuccess: 'idle-shell' }, location));
});

test('terminal invocation binds actual arguments to metadata and Windows drive aliases', () => {
  const location = resolveInstallationLocation('home', { home: '/tmp/insrc', os: 'linux' });
  const launch = { operationId: 'op', installationId: 'home', home: location.home, platform: 'posix', scriptPath: '/tmp/install.sh', scriptVersion: '1', scriptSha256: digest, arguments: ['--home', location.home, '--installation-id', 'home', '--operation-id', 'op'], terminalName: 'Insrc Installation', onInstallSuccess: 'launch-tui' };
  for (const args of [[], ['--home', location.home], ['--home', '/tmp/other', '--installation-id', 'home', '--operation-id', 'op'], ['--home', location.home, '--installation-id', 'other', '--operation-id', 'op'], ['--home', location.home, '--installation-id', 'home', '--operation-id', 'other'], ['--home', location.home, '--home', location.home, '--operation-id', 'op'], ['--home', location.home, '--installation-id', 'home', '--install-ollama', 'yes']]) {
    assert.throws(() => parseTerminalLaunch({ ...launch, arguments: args }, location));
  }
  assert.equal(parseTerminalLaunch({ ...launch, arguments: ['--operation-id', 'op', '--home', location.home, '--installation-id', 'home'] }, location).operationId, 'op');
  const windows = resolveInstallationLocation('home', { os: 'win32', home: 'C:\\Users\\person\\.insrc', userSid: 'S-1-5-21-123' });
  const alias = 'c:\\Users\\person\\.insrc';
  const ps = { ...launch, platform: 'powershell', home: alias, scriptPath: 'C:\\install.ps1', arguments: ['-HomeDirectory', alias, '-InstallationId', 'home', '-OperationId', 'op'] };
  assert.equal(parseTerminalLaunch(ps, windows).home, alias);
  assert.throws(() => parseTerminalLaunch({ ...ps, arguments: ['-HomeDirectory', alias, '-InstallationId', 'home', '-OperationId', 'other'] }, windows), { code: 'identity-mismatch' });
});
