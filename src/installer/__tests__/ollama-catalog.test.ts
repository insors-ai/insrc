import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ollamaPolicies } from '../ollama-catalog.js';
import { ollamaPolicySha256, parseOllamaPolicy } from '../ollama-policy.js';
import { dependencyPort } from '../dependencies.js';
import { ollamaFixture } from './_ollama-fixture.js';
import { privateRuntimeTest } from './_private-runtime-test.js';

test('enabled-target-policy-requires-matching-native-evidence-and-mandatory-linux-route', () => {
  assert.deepEqual(ollamaPolicies.map(policy => policy.target), [{ os: 'linux', arch: 'arm64', baseline: 'glibc-2.35' }]);
  for (const policy of ollamaPolicies) {
    assert.equal(Object.isFrozen(policy), true); assert.equal(Object.isFrozen(policy.layout), true);
    const qualified = parseOllamaPolicy(policy).qualification; assert.ok(qualified);
    const evidence = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../${qualified.evidence}`, import.meta.url)), 'utf8'));
    assert.equal(evidence.status, 'pass'); assert.equal(evidence.catalogEnabled, true);
    assert.equal(evidence.machine.native, true); assert.equal(evidence.machine.translated, false);
    assert.equal(evidence.machine.arch, policy.target.arch); assert.equal(evidence.machine.glibc, '2.35'); assert.equal(evidence.machine.uid, 501);
    assert.equal(evidence.policySha256, ollamaPolicySha256(policy)); assert.equal(qualified.policySha256, evidence.policySha256);
    assert.deepEqual(evidence.asset, policy.asset); assert.equal(evidence.observed.privateNode, '22.22.1');
    assert.equal(evidence.observed.executableVersion, policy.version); assert.equal(evidence.observed.apiVersion, policy.version);
    assert.equal(evidence.observed.modelFiles, 0); assert.equal(evidence.observed.declinePreservedDependencyFiles, true);
    assert.equal(evidence.observed.reusePreservedAttemptRecords, true); assert.equal(evidence.observed.finitePreparationAndHandoffClosed, true);
    assert.ok(evidence.observed.coldFreshInspectionMs < 3000); assert.ok(evidence.observed.inspectionReadCharacters < 16 * 1024 * 1024);
    assert.equal(evidence.targets.length, 6);
    assert.deepEqual(evidence.targets.filter((target: { status: string }) => target.status === 'qualified').map((target: { os: string; arch: string }) => `${target.os}/${target.arch}`), ['linux/arm64']);
    for (const target of evidence.targets) if (target.status !== 'qualified') {
      assert.equal(target.status, 'pending'); assert.ok(target.reason);
      assert.match(target.manualGuidance, /user-owned|~\/Applications|LOCALAPPDATA/);
      assert.ok(target.manualGuidance.includes('serve'));
    }
    assert.throws(() => parseOllamaPolicy({ ...policy, version: '0.0.0' }), { code: 'dependency-policy-invalid' });
  }
});

privateRuntimeTest(import.meta.url, 'manual-user-level-guidance-preserves-disabled-target-status', async () => {
  const f = await ollamaFixture();
  try {
    const report = await dependencyPort(f.target, f.location, { ...f.options, policies: [] }).inspect(f.location);
    assert.equal(report.ollama, 'missing'); assert.equal(report.ollamaInstallOffer, undefined);
    const text = report.recommendations.join('\n');
    assert.match(text, /https:\/\/github.com\/ollama\/ollama\/releases/);
    assert.match(text, /serve/); assert.match(text, /not native auto-install qualification/);
    assert.match(text, process.platform === 'darwin' ? /~\/Applications/ : process.platform === 'win32' ? /LOCALAPPDATA/ : /user-owned/);
  } finally { await f.cleanup(); }
});
