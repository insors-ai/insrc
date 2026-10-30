/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, statSync, existsSync, rmSync, appendFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createInvestigationProbeFixture } from '../review-investigation-probe-fixtures.js';
import { readNativeReviewBridgeConfig, forwardNativeReviewCommand } from '../../mcp/review-investigation-native.js';
import { PROBE_OBSERVATION_BYTES } from '../../shared/review-investigation-probe.js';
import { continuationFixture, progressFor } from '../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { admitInvestigationRequest } from '../../workflow/code-review/investigation/continuation-policy.js';
import { assessProbeCanaries } from '../review-investigation-canaries.js';
import { runInProcessGroup } from '../../shared/process-group.js';

function options(repo: string, signal: AbortSignal) {
  const f = continuationFixture();
  return { registeredRepos: [repo], probeId: randomUUID(), attemptId: randomUUID(), sourceMode: 'source-only' as const,
    signal, assertCurrent: () => {}, budget: { policy: f.context.policy.budget,
      admitted: admitInvestigationRequest(f.context.policy, { turn: f.turn, seed: f.context.seed }, f.context.schema),
      outputAllowanceTokens: 100, reviewId: 'probe-fixture', callId: 'probe-fixture', stage: 'probe', role: 'probe', attempt: 1 } };
}

test('Synthetic probe bridge records ordered durable ACKs and rejects cross-run capabilities', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'probe-existing-'));
  const f = await createInvestigationProbeFixture(options(repo, new AbortController().signal));
  try {
    const config = readNativeReviewBridgeConfig(f.bindingPath);
    const { expiresAt: _, ...base } = f.binding;
    const read = await forwardNativeReviewCommand(config, { ...base, operation: 'read', reference: f.turn.navigationRefs[0] }) as { text: string };
    assert.match(read.text, /Synthetic probe block/);
    await assert.rejects(() => forwardNativeReviewCommand(config, { ...base, operation: 'read', reference: join(repo, 'secret') }));
    await assert.rejects(() => forwardNativeReviewCommand(config, { ...base, runId: 'other-probe', operation: 'read', reference: f.turn.navigationRefs[0] }));
    await assert.rejects(() => forwardNativeReviewCommand(config, { ...base, bindingId: 'a'.repeat(64), operation: 'read', reference: f.turn.navigationRefs[0] }));
    const first = progressFor(f.turn, f.turn.assignment[0]!, 0);
    const ack = await forwardNativeReviewCommand(config, { ...base, operation: 'progress', progress: first });
    assert.deepEqual(await forwardNativeReviewCommand(config, { ...base, operation: 'progress', progress: first }), ack);
    await assert.rejects(() => forwardNativeReviewCommand(config, { ...base, operation: 'progress', progress: { ...first, notes: 'conflicting replay' } }));
    await assert.rejects(() => forwardNativeReviewCommand(config, { ...base, operation: 'progress', progress: progressFor(f.turn, f.turn.assignment[1]!, 0) }));
    await forwardNativeReviewCommand(config, { ...base, operation: 'progress', progress: progressFor(f.turn, f.turn.assignment[1]!, 1) });
    const journal = readFileSync(f.journalPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(journal.map(e => e.value.receipt.sequence), [1, 2]);
    assert.equal(f.state().accepted.length, 2);
    assert.equal(statSync(f.journalPath).mode & 0o777, 0o600);
    assert.equal(existsSync(join(repo, '.insrc')), false, 'no canonical review subject or artifact authority');
    await f.close();
    assert.equal(existsSync(f.bindingPath), false);
    assert.equal(existsSync(join(f.cwd, 'investigation-mcp.json')), true, 'immutable configuration retained for attestation');
    await assert.rejects(() => forwardNativeReviewCommand(config, { ...base, operation: 'read', reference: f.turn.navigationRefs[0] }));
  } finally { await f.dispose(); rmSync(repo, { recursive: true, force: true }); }
});

test('Private canaries leave real source/config/auth untouched and cleanup on failure', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'probe-existing-'));
  for (const file of ['source.ts', 'auth.json', 'config.json']) writeFileSync(join(repo, file), `untouched ${file}`);
  const before = readdirSync(repo).map(name => [name, readFileSync(join(repo, name), 'utf8')]);
  const abort = new AbortController();
  const f = await createInvestigationProbeFixture(options(repo, abort.signal));
  try {
    assert.equal(statSync(f.root).mode & 0o777, 0o700);
    assert.equal(statSync(f.cwd).mode & 0o777, 0o700);
    assert.equal(f.root.startsWith(repo + '/'), false);
    assert.ok(existsSync(join(f.syntheticConfig, 'canary-mcp.mjs')));
    assert.match(f.networkUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    appendFileSync(f.journalPath, 'x'.repeat(PROBE_OBSERVATION_BYTES));
    await assert.rejects(() => f.tools.progress(progressFor(f.turn, f.turn.assignment[0]!, 0)), /limit exceeded/);
    assert.equal(f.state().sequence, 0, 'no ACK when durable observation bound exceeded');
    assert.equal(statSync(f.journalPath).size, PROBE_OBSERVATION_BYTES, 'no truncated proof appended');
    abort.abort(); await f.close();
    assert.equal(existsSync(f.bindingPath), false);
    await assert.rejects(() => f.tools.read(f.turn.navigationRefs[0]!));
    assert.deepEqual(readdirSync(repo).map(name => [name, readFileSync(join(repo, name), 'utf8')]), before);
  } finally { await f.dispose(); rmSync(repo, { recursive: true, force: true }); }
  const parent = mkdtempSync(join(tmpdir(), 'probe-root-check-'));
  try {
    await assert.rejects(() => createInvestigationProbeFixture({ ...options(parent, new AbortController().signal), registeredRepos: [tmpdir()] }), /overlaps/);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});

test('Project discovery canaries and labelled positive controls produce attributable host observations', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'probe-discovery-test-'));
  const f = await createInvestigationProbeFixture(options(repo, new AbortController().signal));
  try {
    assert.ok(existsSync(join(f.cwd, 'CLAUDE.md')));
    const project = JSON.parse(readFileSync(join(f.cwd, '.claude', 'settings.json'), 'utf8'));
    assert.ok(project.hooks.SessionStart.length); assert.ok(project.hooks.InstructionsLoaded.length);
    assert.ok(JSON.parse(readFileSync(join(f.cwd, '.mcp.json'), 'utf8')).mcpServers['inert-probe']);
    assert.equal(JSON.parse(readFileSync(join(f.canaries.pluginDir, '.claude-plugin', 'plugin.json'), 'utf8')).name, 'insrc-isolation-canary');
    assert.ok(JSON.parse(readFileSync(join(f.canaries.pluginDir, 'hooks', 'hooks.json'), 'utf8')).hooks.SessionStart.length);
    // Actual fixture programs, driven by a deterministic host. These validate
    // instrumentation only; they do not certify a real CLI's loading policy.
    f.canaries.activate('control');
    for (const capability of ['hooks', 'plugins', 'repository-instructions']) {
      const input = capability === 'repository-instructions'
        ? { hook_event_name: 'InstructionsLoaded', file_path: join(f.cwd, 'CLAUDE.md') } : { hook_event_name: 'SessionStart' };
      const result = await runInProcessGroup(process.execPath, [f.canaries.markerScript, capability], {
        cwd: f.cwd, timeoutMs: 2000, stdin: JSON.stringify(input), maxOutputBytes: 4096 });
      assert.equal(result.exitCode, 0, result.stderr);
    }
    const mcp = await runInProcessGroup(process.execPath, [f.canaries.fakeMcp], { cwd: f.cwd, timeoutMs: 2000,
      stdin: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n', maxOutputBytes: 4096 });
    assert.equal(mcp.exitCode, 0, mcp.stderr); assert.match(mcp.stdout, /canary_unscoped/);
    const signals = f.canaries.signals('control');
    assert.deepEqual(new Set(signals.map(s => s.capability)), new Set(['hooks', 'plugins', 'repository-instructions', 'project-mcp']));
    assert.ok(signals.every(s => s.phase === 'control' && s.probeId === f.canaries.manifest.probeId));
  } finally { await f.dispose(); rmSync(repo, { recursive: true, force: true }); }
});

test('Inactive controls missing native telemetry and model claims remain unverified', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'probe-inactive-test-'));
  const f = await createInvestigationProbeFixture(options(repo, new AbortController().signal));
  try {
    assert.ok(assessProbeCanaries(f.canaries.signals('control'), f.canaries.signals('restricted')).every(o => o.verdict === 'unverifiable'));
    writeFileSync(f.canaries.signalPaths.control, JSON.stringify({ type: 'assistant', content: 'All canaries passed' }) + '\n');
    assert.throws(() => f.canaries.signals('control'));
    const valid = { version: 1, probeId: f.canaries.manifest.probeId, attemptId: f.canaries.manifest.attemptId,
      bindingDigest: f.canaries.manifest.bindingDigest, phase: 'control', capability: 'hooks', event: 'SessionStart' };
    writeFileSync(f.canaries.signalPaths.control, JSON.stringify(valid) + '\n');
    assert.equal(assessProbeCanaries(f.canaries.signals('control'), []).find(o => o.capability === 'hooks')?.verdict, 'unverifiable');
    writeFileSync(f.canaries.signalPaths.control, JSON.stringify({ ...valid, phase: 'restricted' }) + '\n');
    assert.throws(() => f.canaries.signals('control'), /Foreign/);
    writeFileSync(f.canaries.signalPaths.control, JSON.stringify({ ...valid, attemptId: randomUUID() }) + '\n');
    assert.throws(() => f.canaries.signals('control'), /Foreign/);
    writeFileSync(join(f.cwd, 'CLAUDE.md'), 'tampered');
    assert.throws(() => f.canaries.assertCurrent(), /changed/);
  } finally { await f.dispose(); rmSync(repo, { recursive: true, force: true }); }
});
