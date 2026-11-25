import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstallerError } from '../contracts.js';
import type { DependencyPort } from '../peer-contracts.js';
import { createDependencyOperationContext, requireDependencyOperation } from '../dependency-context.js';
import { createOllamaOffer, dependencyAttemptIdentity, ollamaPolicySha256, parseOllamaPolicy } from '../ollama-policy.js';
import type { OllamaPolicy } from '../ollama-policy.js';
import { resolveInstallationLocation } from '../location.js';
import { parseInstaller } from '../schemas.js';

const absence = { binary: 'missing', endpoint: 'refused', destination: 'absent', searchSha256: '1'.repeat(64) };
const location = resolveInstallationLocation('policy-test', { home: '/tmp/依存 home', os: 'linux' });
function policy(): OllamaPolicy {
  return { schemaVersion: 1, target: { os: 'linux', arch: 'arm64', baseline: 'fixture' }, version: '0.0.1-fixture',
    asset: { url: 'https://github.com/ollama/ollama/releases/download/v0.0.1-fixture/ollama-linux-arm64.tar.zst', bytes: 100, sha256: 'a'.repeat(64), format: 'tar.zst' },
    limits: { expandedBytes: 1000, fileBytes: 500, files: 10, windowBytes: 1024 },
    layout: { executable: 'bin/ollama', requiredFiles: ['bin/ollama'], aliases: [] }, endpoint: 'http://127.0.0.1:11434',
    modelsRelativePath: 'deps/ollama/data/models', logsRelativePath: 'deps/ollama/logs/server', start: true };
}
/** Fixture metadata is not shipped policy or real native qualification. */
function qualified(p = policy()): OllamaPolicy {
  return { ...p, qualification: { policySha256: ollamaPolicySha256(p), native: true, evidence: 'fixtures/not-native-evidence.json',
    checks: { version: true, readiness: true, reuse: true, decline: true, userOnly: true } } };
}
const invalid = (fn: () => unknown) => assert.throws(fn, error => error instanceof InstallerError);

test('dependency-policy-and-offer-bind-exact-target-home-destination-and-side-effects', () => {
  const input = qualified(), parsed = parseOllamaPolicy(input), offer = createOllamaOffer(location, parsed, absence)!;
  assert.ok(offer); assert.match(offer.id, /^[a-f0-9]{64}$/);
  assert.ok(offer.destination.startsWith(location.home + '/deps/ollama/'));
  assert.ok(Object.isFrozen(parsed.asset)); assert.ok(Object.isFrozen(offer.target));
  input.asset.sha256 = 'b'.repeat(64); assert.equal(parsed.asset.sha256, 'a'.repeat(64));
  assert.equal(createOllamaOffer(location, policy(), absence), undefined);
  assert.equal(createOllamaOffer(location, qualified(), absence)!.id, offer.id);
  for (const change of [
    (p: OllamaPolicy) => { p.target.baseline = 'other-native-baseline'; },
    (p: OllamaPolicy) => { p.endpoint = 'http://127.0.0.1:11435'; },
    (p: OllamaPolicy) => { p.modelsRelativePath = 'deps/ollama/data/other-models'; },
    (p: OllamaPolicy) => { p.logsRelativePath = 'deps/ollama/logs/other-log'; },
    (p: OllamaPolicy) => { p.limits.files++; },
    (p: OllamaPolicy) => { p.asset.sha256 = 'c'.repeat(64); },
  ]) {
    const changed = policy(); change(changed);
    assert.notEqual(createOllamaOffer(location, qualified(changed), absence)!.id, offer.id);
  }
  assert.notEqual(createOllamaOffer({ ...location, installationId: 'other-installation' }, qualified(), absence)!.id, offer.id);
  assert.notEqual(createOllamaOffer({ ...location, home: '/tmp/other-home' }, qualified(), absence)!.id, offer.id);
  assert.notEqual(createOllamaOffer(location, qualified(), { ...absence, searchSha256: '2'.repeat(64) })!.id, offer.id);
  for (const change of [
    (p: OllamaPolicy) => { p.asset.url = p.asset.url.replace('github.com', 'untrusted.example'); },
    (p: OllamaPolicy) => { p.asset.url += '?secret=not-accepted'; },
    (p: OllamaPolicy) => { p.asset.url = p.asset.url.replace('/v0.0.1-fixture/', '/latest/'); },
    (p: OllamaPolicy) => { p.asset.url = p.asset.url.replace('/ollama-linux', '/nested/ollama-linux'); },
    (p: OllamaPolicy) => { p.asset.bytes = 1e20; },
    (p: OllamaPolicy) => { p.limits.windowBytes = 2 ** 26; },
    (p: OllamaPolicy) => { p.layout.executable = '../foreign'; },
    (p: OllamaPolicy) => { p.layout.requiredFiles = ['bin/ollama', 'BIN/ollama']; },
    (p: OllamaPolicy) => { p.modelsRelativePath = 'graph.lmdb'; },
    (p: OllamaPolicy) => { p.endpoint = 'http://192.168.0.2:11434'; },
    (p: OllamaPolicy) => { p.endpoint = 'http://user:secret@127.0.0.1:11434'; },
    (p: OllamaPolicy) => { p.asset.sha256 = 'd'.repeat(64); },
    (p: OllamaPolicy) => { p.layout.aliases = [{ path: 'a', target: 'b', kind: 'file' }, { path: 'b', target: 'a', kind: 'file' }]; },
  ]) { const bad = qualified(); change(bad); invalid(() => createOllamaOffer(location, bad, absence)); }
  invalid(() => createOllamaOffer(location, { ...qualified(), unknown: true }, absence));
  invalid(() => createOllamaOffer(location, qualified(), { ...absence, endpoint: 'unavailable' }));
  const windows = policy(); windows.target = { os: 'win32', arch: 'x64', baseline: 'fixture' }; windows.asset.format = 'zip';
  windows.asset.url = windows.asset.url.replace('linux-arm64.tar.zst', 'windows-amd64.zip');
  windows.layout = { executable: 'ollama.exe', requiredFiles: ['ollama.exe'], aliases: [] };
  const winLocation = resolveInstallationLocation('policy-test', { home: 'C:\\Users\\User Name\\.insrc', os: 'win32', userSid: 'S-1-5-21-123' });
  assert.match(createOllamaOffer(winLocation, qualified(windows), absence)!.destination, /^C:\\Users\\User Name\\.insrc\\deps\\ollama\\/);
});

test('private-context-preserves-public-wire-shapes-and-rejects-unowned-install', async () => {
  const report = { runtimeReady: true, ollama: 'missing' as const, agents: { claude: false, codex: true, vibe: false }, recommendations: [], blockers: ['Ollama unavailable'] };
  // Existing two-method fixtures still work without knowing about the new context.
  const legacy: DependencyPort = { async inspect() { return report; }, async decide() { return report; } };
  assert.equal(await legacy.inspect(location), report);
  assert.deepEqual(parseInstaller('dependencyReport', report), report);
  assert.deepEqual(parseInstaller('dependencyDecision', { offerId: 'offer', choice: 'decline' }), { offerId: 'offer', choice: 'decline' });
  invalid(() => parseInstaller('dependencyReport', { ...report, context: {} }));
  invalid(() => parseInstaller('dependencyDecision', { offerId: 'offer', choice: 'start' }));
  invalid(() => parseInstaller('managerRequest', { protocolVersion: 1, operationId: 'operation', installationId: location.installationId, action: 'start', context: {} }));
  const p = qualified(), offer = createOllamaOffer(location, p, absence)!;
  invalid(() => dependencyAttemptIdentity(location, p, offer));
  const abort = new AbortController(); let held = true; const progress: string[] = [];
  const input = { operationId: 'operation', attemptNonce: 'n'.repeat(32), signal: abort.signal,
    assertCurrent() { if (!held) throw new InstallerError('owner-lost', 'Owner released'); },
    progress(stage: string, detail: string) { progress.push(stage + ': ' + detail); } };
  invalid(() => dependencyAttemptIdentity(location, p, offer, input));
  const context = createDependencyOperationContext(location, 'linux', input);
  assert.ok(Object.isFrozen(context)); assert.deepEqual(Object.keys(context).sort(), ['assertCurrent', 'attemptNonce', 'operationId', 'progress', 'signal']);
  const attempt = dependencyAttemptIdentity(location, p, offer, context);
  assert.equal(attempt.installationId, location.installationId); assert.equal(attempt.offerId, offer.id);
  assert.equal(attempt.stageRelativePath, 'deps/ollama/.staging/operation/' + 'n'.repeat(32));
  assert.notEqual(attempt.payloadRelativePath, attempt.recordRelativePath);
  invalid(() => requireDependencyOperation({ ...location, home: '/tmp/foreign' }, context));
  invalid(() => requireDependencyOperation({ ...location, installationId: 'foreign' }, context));
  invalid(() => dependencyAttemptIdentity(location, p, { ...offer, destination: '/tmp/foreign' }, context));
  context.progress('preparing', 'Preparing dependency'); assert.deepEqual(progress, ['preparing: Preparing dependency']);
  invalid(() => context.progress('preparing', '\u001b[31munsafe'));
  invalid(() => context.progress('preparing', 'x'.repeat(2049)));
  input.operationId = 'mutated'; assert.equal(context.operationId, 'operation');
  held = false; invalid(() => requireDependencyOperation(location, context)); held = true;
  abort.abort(); invalid(() => context.progress('ready', 'Must not emit')); assert.equal(progress.length, 1);
});
