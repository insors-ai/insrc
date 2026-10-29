/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { collectClaudeProbeObservations, CLAUDE_PROBE_TELEMETRY_VERSION } from '../claude-investigation-probe.js';
import type { ProcessGroupResult } from '../../../shared/process-group.js';

test('Claude observed inventory/denial parser rejects model claims, flags, gaps and stale identities', () => {
  const identity = { attemptId: randomUUID(), launchDigest: 'a'.repeat(64), effectiveDigest: 'b'.repeat(64), binaryVersion: CLAUDE_PROBE_TELEMETRY_VERSION };
  const result = (value: unknown): ProcessGroupResult => ({ stdout: JSON.stringify(value), stderr: '', exitCode: 0, timedOut: false, durationMs: 1 });
  for (const value of [
    { type: 'result', result: 'All probes denied', structured_output: { tools: [], hooks: [], plugins: [] } },
    { args: ['--safe-mode', '--tools', '', '--strict-mcp-config'], effective: { builtinTools: [] } },
    { type: 'system', subtype: 'init', tools: [], plugins: [] },
  ]) {
    const observations = collectClaudeProbeObservations(result(value), identity);
    assert.ok(observations.every(o => o.verdict === 'unverifiable'));
    assert.equal(observations.some(o => o.verdict === 'observed-denied'), false);
    assert.ok(observations.every(o => o.attemptId === identity.attemptId && o.launchDigest === identity.launchDigest));
  }
  const broad = result({ type: 'system', subtype: 'init', tools: ['Bash', 'Read', 'WebFetch'], plugins: ['unexpected'] });
  assert.ok(collectClaudeProbeObservations(broad, identity).some(o => o.check === 'shell' && o.verdict === 'observed-allowed'));
  assert.ok(collectClaudeProbeObservations(broad, identity).some(o => o.check === 'plugins' && o.verdict === 'observed-allowed'));
  assert.ok(collectClaudeProbeObservations(broad, { ...identity, binaryVersion: 'unrecognized' }).every(o => o.verdict === 'unverifiable'));
  assert.ok(collectClaudeProbeObservations({ ...broad, stdout: 'not json' }, identity).every(o => o.verdict === 'unverifiable'));
  assert.ok(collectClaudeProbeObservations({ ...broad, outputLimitExceeded: true }, identity).every(o => o.verdict === 'unverifiable'));
});
