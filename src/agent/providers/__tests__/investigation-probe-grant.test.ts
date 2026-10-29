/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { investigationProbeCommandSchema, probeExportSchema } from '../../../shared/review-investigation-probe.js';
import type { InvestigationProbeGrant } from '../../../shared/review-investigation-probe.js';
import type { LLMProvider, QualifiedInvestigationSessionBinding } from '../../../shared/types.js';
import { issueInvestigationProbeGrant, consumeInvestigationProbeGrant, revokeInvestigationProbeGrant } from '../investigation-probe-grant.js';
import type { ProbeGrantContext } from '../investigation-probe-grant.js';
import { inspectQualifiedInvestigationBinding, createQualifiedInvestigationBinding } from '../investigation-session.js';
import { continuationFixture } from '../../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { digestValue } from '../../../workflow/code-review/investigation/identity.js';
import { admitInvestigationRequest } from '../../../workflow/code-review/investigation/continuation-policy.js';

function fixture(): ProbeGrantContext {
  const f = continuationFixture();
  return {
    origin: 'installed-probe', probeId: randomUUID(), attemptId: randomUUID(),
    repo: '/fixture/repo', cwd: '/fixture/private', sourceMode: 'source-only',
    identity: { kind: 'claude', adapterVersion: 'fixture', binaryVersion: 'fixture',
      binary: { path: '/fixture/cli', digest: 'a'.repeat(64) }, runtimeFiles: [],
      profileDigest: digestValue(f.context.policy.budget.profile), catalogDigest: 'b'.repeat(64), launchDigest: 'c'.repeat(64) },
    budget: { policy: f.context.policy.budget,
      admitted: admitInvestigationRequest(f.context.policy, { turn: f.turn, seed: f.context.seed }, f.context.schema), outputAllowanceTokens: 100,
      reviewId: 'fixture', callId: 'fixture', stage: 'probe', role: 'probe', attempt: 1 },
    deadlineAt: Date.now() + 60_000, assertCurrent: () => {}, observe: async () => {},
  };
}

test('Probe schemas reject launch overrides, forged/serialized grants and invalid observation states', () => {
  const profile = { profileVersion: 1, providerId: 'host', transport: 'controller', transportVersion: 'v1',
    schemaDialect: 'controller-json-v1', promptDialect: 'controller-frame-v1', qualification: 'controller-reserved',
    declaredToolsJson: '[]', nativeReserveTokens: 0, transportReserveTokens: 0, completionReserveTokens: 10, inspectionReserveTokens: 0 };
  const start = { version: 1, operation: 'start', requestId: randomUUID(), repo: '/fixture/repo', sourceMode: 'source-only',
    reviewBudget: { version: 1, hostContextReserveTokens: 100, profile } };
  assert.equal(investigationProbeCommandSchema.parse(start).operation, 'start');
  for (const field of ['args', 'prompt', 'cwd', 'binaryPath', 'key', 'signature', 'effective', 'grant', 'origin'])
    assert.equal(investigationProbeCommandSchema.safeParse({ ...start, [field]: 'caller authority' }).success, false);
  for (const operation of ['status', 'cancel', 'export']) {
    const command = { version: 1, operation, repo: start.repo, probeId: randomUUID() };
    assert.equal(investigationProbeCommandSchema.safeParse(command).success, true);
    assert.equal(investigationProbeCommandSchema.safeParse({ ...command, reviewBudget: start.reviewBudget }).success, false);
  }
  const context = fixture(), grant = issueInvestigationProbeGrant(context), abort = new AbortController();
  assert.throws(() => consumeInvestigationProbeGrant({ ...grant }, abort.signal), /Untrusted/);
  assert.throws(() => consumeInvestigationProbeGrant(JSON.parse(JSON.stringify(grant)), abort.signal), /Untrusted/);
  const consumed = consumeInvestigationProbeGrant(grant, abort.signal);
  assert.equal(consumed.probeId, context.probeId);
  assert.throws(() => consumeInvestigationProbeGrant(grant, abort.signal), /already consumed/);
  const scripted = issueInvestigationProbeGrant({ ...context, origin: 'scripted-fixture' });
  assert.throws(() => consumeInvestigationProbeGrant(scripted, abort.signal), /Scripted grants/);
  const status = { version: 1, probeId: context.probeId, requestId: randomUUID(), attemptId: context.attemptId,
    repo: context.repo, sourceMode: context.sourceMode, state: 'unsupported', identity: context.identity,
    startedAt: null, endedAt: null, observations: [], missingEvidence: ['inventory unavailable'],
    usage: { modelCalls: null, inputTokens: null, outputTokens: null, latencyMs: null } };
  const report = { version: 1, kind: 'review-investigation-probe-observations', origin: 'unsigned-installed-observations',
    sourceCommit: 'a'.repeat(40), sourceDigest: 'b'.repeat(64), status };
  const parsed = probeExportSchema.parse(report);
  assert.equal(parsed.status.usage.inputTokens, null);
  assert.equal(probeExportSchema.safeParse({ ...report, origin: 'installed-probe' }).success, false);
  assert.equal(probeExportSchema.safeParse({ ...report, signature: 'self-signed' }).success, false);
  assert.equal(probeExportSchema.safeParse({ ...report, status: { ...status, state: 'qualified' } }).success, false);
  const observation = { check: 'shell', verdict: 'model-says-denied', attemptId: context.attemptId,
    launchDigest: context.identity.launchDigest, effectiveDigest: 'd'.repeat(64), provenance: 'runtime-event',
    observationDigest: 'e'.repeat(64), detail: 'fixture', at: Date.now() };
  assert.equal(probeExportSchema.safeParse({ ...report, status: { ...status, observations: [observation] } }).success, false);
  assert.equal(probeExportSchema.safeParse({ ...report, status: { ...status,
    observations: [{ ...observation, verdict: 'unverifiable', attemptId: randomUUID() }] } }).success, false);
});

test('Probe capability remains optional and cannot supply production qualification', async () => {
  const provider: LLMProvider = {
    supportsTools: false, capabilities: { structuredOutput: false, toolCalling: false, vision: false, webSearch: false },
    complete: async () => { throw Error('not called'); }, stream: async function* () {},
    embed: async () => [], completeStructured: async () => { throw Error('not called'); },
  };
  assert.equal(provider.runInvestigationProbe, undefined);
  const context = fixture(), grant = issueInvestigationProbeGrant(context);
  await assert.rejects(() => inspectQualifiedInvestigationBinding(grant as unknown as QualifiedInvestigationSessionBinding, context.identity), /Untrusted/);
  assert.throws(() => createQualifiedInvestigationBinding(grant as never, {} as never, {} as never), /not issued/);
  // An unsigned output, even if structurally valid, is not a production binding.
  await assert.rejects(() => inspectQualifiedInvestigationBinding({ version: 1, grantId: randomUUID() } as unknown as QualifiedInvestigationSessionBinding, context.identity), /Untrusted/);
  revokeInvestigationProbeGrant(grant);
  assert.throws(() => consumeInvestigationProbeGrant(grant, new AbortController().signal), /Untrusted/);
});

test('Probe grants snapshot identity and budget and reject cancelled or expired authority', () => {
  const context = fixture(), grant = issueInvestigationProbeGrant(context), signal = new AbortController();
  const identity = context.identity as { binaryVersion: string };
  identity.binaryVersion = 'mutated';
  assert.equal(consumeInvestigationProbeGrant(grant, signal.signal).identity.binaryVersion, 'fixture');
  const cancelled = issueInvestigationProbeGrant(context);
  signal.abort();
  assert.throws(() => consumeInvestigationProbeGrant(cancelled, signal.signal));
  assert.throws(() => consumeInvestigationProbeGrant(cancelled, new AbortController().signal), /consumed/);
  assert.throws(() => issueInvestigationProbeGrant({ ...fixture(), deadlineAt: Date.now() - 1 }), /deadline/);
  assert.throws(() => issueInvestigationProbeGrant({ ...fixture(), deadlineAt: Date.now() + 400_000 }), /deadline/);
  const invalid = fixture();
  assert.throws(() => issueInvestigationProbeGrant({ ...invalid, budget: { ...invalid.budget,
    policy: { ...invalid.budget.policy, totalTokens: 256_000 } } }), /budget/);
  const opaque: InvestigationProbeGrant = { version: 1, grantId: randomUUID() };
  assert.throws(() => consumeInvestigationProbeGrant(opaque, new AbortController().signal), /Untrusted/);
});
