/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateUnsignedProbeExport } from '../review-investigation-probe-export.js';
import { PROBE_REQUIRED_CHECKS, probeExportSchema } from '../../shared/review-investigation-probe.js';
import { investigationFileDigest, createQualifiedInvestigationBinding } from '../../agent/providers/investigation-session.js';

function report() {
  return { version: 1, kind: 'review-investigation-probe-observations', origin: 'unsigned-installed-observations',
    sourceCommit: 'a'.repeat(40), sourceDigest: 'b'.repeat(64), status: { version: 1, probeId: randomUUID(), requestId: randomUUID(), attemptId: randomUUID(),
      repo: '/synthetic-repo', sourceMode: 'source-only', state: 'unsupported', identity: null, startedAt: 1, endedAt: 2,
      missingEvidence: ['effective-inventory'], observations: [], usage: { modelCalls: null, inputTokens: null, outputTokens: null, latencyMs: null } } };
}

test('Unsigned export validates every required observation and never signs, approves or changes config', () => {
  const directory = mkdtempSync(join(tmpdir(), 'probe-export-no-writes-'));
  try {
    const config = join(directory, 'config.json'); writeFileSync(config, '{"codeReview":{"engine":"legacy"}}');
    const before = readFileSync(config, 'utf8'), files = readdirSync(directory);
    const partial = validateUnsignedProbeExport(report());
    assert.equal(partial.candidate, undefined); assert.equal(Object.hasOwn(partial, 'signature'), false);
    const hash = 'a'.repeat(64), identity = { kind: 'claude', adapterVersion: 'claude-scoped-v1', binaryVersion: 'nonqualifying-fixture',
      binary: { path: '/synthetic/bin', digest: hash }, runtimeFiles: [], profileDigest: hash, catalogDigest: hash, launchDigest: hash };
    const base = report();
    const complete = { ...base, status: { ...base.status, state: 'completed', identity, missingEvidence: [],
      observations: PROBE_REQUIRED_CHECKS.map(check => ({ check, verdict: check === 'durable-progress' || check === 'cancellation-exit' ? 'observed-allowed' : 'observed-denied',
        attemptId: base.status.attemptId, launchDigest: hash, effectiveDigest: hash, observationDigest: hash, provenance: 'runtime-event', detail: 'explicit synthetic schema fixture', at: 1 })) },
      candidate: { version: 1, identity, effective: { cwd: '/synthetic', configFiles: [{ path: '/synthetic/config', digest: hash }], builtinTools: [], inheritedConfigSources: [],
        mcpServers: ['insrc-scoped-review'], plugins: [], hooks: [], repositoryInstructions: [], credentialCopies: [], auth: 'existing-cli-oauth', catalog: [] },
        trace: { effectiveDigest: hash, events: [] }, validUntil: 1 } };
    assert.equal(probeExportSchema.safeParse(complete).success, true, 'schema fixture is not qualification');
    for (const check of PROBE_REQUIRED_CHECKS) {
      const changed = { ...complete, status: { ...complete.status, observations: complete.status.observations.filter(o => o.check !== check) } };
      assert.throws(() => validateUnsignedProbeExport(changed));
    }
    assert.throws(() => validateUnsignedProbeExport({ ...complete, status: { ...complete.status, state: 'failed' } }));
    assert.throws(() => validateUnsignedProbeExport({ ...complete, signature: 'self-signed' }));
    assert.throws(() => createQualifiedInvestigationBinding(partial as never, {} as never, {} as never), /not issued/);
    assert.equal(readFileSync(config, 'utf8'), before); assert.deepEqual(readdirSync(directory), files);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Unsigned raw evidence export rejects changed bytes and foreign fixture roots', () => {
  const directory = mkdtempSync(join(tmpdir(), 'insrc-p-'));
  try {
    const path = join(directory, 'native-output.json'); writeFileSync(path, '{}', { mode: 0o600 });
    const input = { ...report(), evidenceFiles: [{ kind: 'native-output', path, digest: investigationFileDigest(path), bytes: statSync(path).size }] };
    assert.equal(validateUnsignedProbeExport(input).candidate, undefined);
    writeFileSync(path, '{"changed":true}'); assert.throws(() => validateUnsignedProbeExport(input), /stale or unsafe/);
    assert.throws(() => validateUnsignedProbeExport({ ...input, evidenceFiles: [{ ...input.evidenceFiles[0], path: '/etc/passwd' }] }), /stale or unsafe/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('IPC-only operator client reports runtime isolation and approval prerequisites without signing keys', async () => {
  const { runProbeOperator } = await import('../../../scripts/review-investigation-probe.mjs');
  const calls: string[] = [];
  const call = async (method: string, params: unknown) => {
    calls.push(method);
    assert.ok(['codeReview.investigation.capabilities', 'codeReview.investigation.probe'].includes(method));
    return method.endsWith('capabilities') ? { activation: 'requires-verified-readiness', defaultEngine: 'legacy' } : { kind: 'investigation-probe', next: 'accepted', command: params };
  };
  const prerequisites = await runProbeOperator(['prerequisites', '--repo', '/registered'], call);
  assert.equal(prerequisites.activationReady, false); assert.equal(prerequisites.verification, 'not-established-by-this-client');
  assert.ok(prerequisites.required.includes('verified-installed-runtime-isolation-evidence'));
  assert.ok(prerequisites.required.includes('approved-mode-specific-probe-record'));
  assert.ok(prerequisites.required.includes('actual-production-acceptance-and-activation-signoff'));
  assert.equal(prerequisites.required.some((item: string) => /attestation|trust-anchor|signing-key/.test(item)), false);
  const requestId = randomUUID();
  const first = await runProbeOperator(['start', '--repo', '/registered', '--mode', 'source-only', '--request-id', requestId], call);
  assert.equal(first.command.requestId, requestId);
  await assert.rejects(() => runProbeOperator(['start', '--repo', '/registered', '--mode', 'source-only'], call));
  await assert.rejects(() => runProbeOperator(['start', '--repo', '/registered', '--request-id', requestId, '--mode', 'source-only', '--prompt', 'unsafe'], call));
  assert.deepEqual(calls, ['codeReview.investigation.capabilities', 'codeReview.investigation.probe']);
});
