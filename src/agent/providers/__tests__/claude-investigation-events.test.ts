/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readClaudeInvestigationEvents, readClaudeInvestigationResult } from '../claude-investigation-events.js';
import { collectClaudeProbeObservations, CLAUDE_PROBE_TELEMETRY_VERSION } from '../claude-investigation-probe.js';
import { claudeInvestigationAdapter, claudeInvestigationArgs, claudeInvestigationLaunchDigest } from '../claude-investigation-session.js';
import { CliProvider } from '../cli-provider.js';
import { scopedReviewToolCatalog } from '../../../shared/review-investigation-catalog.js';
import { PROBE_OBSERVATION_BYTES } from '../../../shared/review-investigation-probe.js';
import type { ProcessGroupResult } from '../../../shared/process-group.js';

const init = { type: 'system', subtype: 'init', session_id: 'session',
  tools: scopedReviewToolCatalog(false).map(t => `mcp__insrc-scoped-review__${t.name}`), plugins: [],
  mcp_servers: [{ name: 'insrc-scoped-review', status: 'connected' }] };
const identity = { attemptId: 'test-attempt', launchDigest: 'a'.repeat(64), effectiveDigest: 'b'.repeat(64),
  binaryVersion: CLAUDE_PROBE_TELEMETRY_VERSION, sourceMode: 'source-only' as const };
const result = (stdout: string): ProcessGroupResult => ({ stdout, stderr: '', exitCode: -1, timedOut: false,
  durationMs: 10, aborted: true, exitSignal: 'SIGKILL' });

test('Native JSONL startup inventory survives cancellation; partial tail is diagnostic only', () => {
  const stdout = JSON.stringify(init) + '\n{"type":"assistant"';
  assert.equal(readClaudeInvestigationEvents(stdout, true).length, 1);
  const observations = collectClaudeProbeObservations(result(stdout), identity);
  assert.ok(observations.some(o => o.check === 'shell' && o.verdict === 'observed-denied'));
  assert.ok(observations.some(o => o.check === 'effective-inventory' && o.verdict === 'unverifiable'));
  assert.equal(observations.some(o => o.check === 'repository-instructions' && o.verdict === 'observed-denied'), false);
  assert.throws(() => readClaudeInvestigationResult(stdout));
  const args = claudeInvestigationArgs({ type: 'object' }, ['--model', 'fixture'], '/tmp/fixture', false);
  assert.equal(args[args.indexOf('--output-format') + 1], 'stream-json');
  assert.deepEqual(args, claudeInvestigationAdapter.args({ type: 'object' }, ['--model', 'fixture'], '/tmp/fixture', false));
  const old = args.filter(a => a !== '--verbose' && a !== '--include-hook-events').map(a => a === 'stream-json' ? 'json' : a);
  assert.notEqual(claudeInvestigationLaunchDigest(args, '/tmp/fixture'), claudeInvestigationLaunchDigest(old, '/tmp/fixture'));
});

test('Malformed contradictory unknown-version and oversized streams never pass isolation', () => {
  for (const stdout of [JSON.stringify(init) + '\nbad\n', JSON.stringify(init) + '\n' + JSON.stringify(init),
    JSON.stringify(init) + '\n' + JSON.stringify({ type: 'assistant', session_id: 'foreign' }),
    'x'.repeat(PROBE_OBSERVATION_BYTES + 1)]) {
    assert.ok(collectClaudeProbeObservations(result(stdout), identity).every(o => o.verdict === 'unverifiable'));
  }
  const good = JSON.stringify(init) + '\n';
  assert.ok(collectClaudeProbeObservations(result(good), { ...identity, binaryVersion: 'unknown' }).every(o => o.verdict === 'unverifiable'));
  assert.ok(collectClaudeProbeObservations({ ...result(good), observerFailed: true }, identity).every(o => o.verdict === 'unverifiable'));
  const model = JSON.stringify({ type: 'assistant', message: { content: JSON.stringify(init) } });
  assert.ok(collectClaudeProbeObservations(result(model), identity).every(o => o.verdict === 'unverifiable'));
  const hook = good + JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: 'session' }) + '\n';
  assert.ok(collectClaudeProbeObservations(result(hook), identity).some(o => o.check === 'hooks' && o.verdict === 'observed-allowed'));
});

test('Native-only terminal result validation preserves ordinary Claude buffered completions', async () => {
  const terminal = { type: 'result', is_error: false, structured_output: { ok: true }, result: 'ordinary' };
  const stream = JSON.stringify(init) + '\n' + JSON.stringify(terminal) + '\n';
  assert.deepEqual(readClaudeInvestigationResult(stream), terminal);
  for (const text of [stream + JSON.stringify(terminal), JSON.stringify(init), stream + JSON.stringify({ type: 'assistant' }),
    JSON.stringify({ ...terminal, is_error: 'false' })]) assert.throws(() => readClaudeInvestigationResult(text));
  const root = mkdtempSync(join(tmpdir(), 'claude-stream-compat-'));
  try {
    const binary = join(root, 'cli.mjs');
    writeFileSync(binary, `#!${process.execPath}\nlet stdin='';for await(const c of process.stdin)stdin+=c;const a=process.argv.slice(2);process.stdout.write(a[a.indexOf('--output-format')+1]==='stream-json'?${JSON.stringify(stream)}:${JSON.stringify(JSON.stringify(terminal))});\n`, { mode: 0o700 });
    const provider = new CliProvider({ kind: 'claude', binPath: binary });
    assert.equal((await provider.complete([{ role: 'user', content: 'fixture' }])).text, 'ordinary');
    // Exercise the private transport branch with a scripted process, not a real
    // installed qualification or provider invocation outside the abstraction.
    const transport = provider as unknown as { runClaude(args: readonly string[], prompt: string,
      exec: { nativeInvestigation: boolean; qualifiedBinPath: string; cwd: string; timeoutMs: number }): Promise<{ envelope: unknown }> };
    assert.deepEqual((await transport.runClaude(['--output-format', 'stream-json'], 'fixture',
      { nativeInvestigation: true, qualifiedBinPath: binary, cwd: root, timeoutMs: 5000 })).envelope, terminal);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
