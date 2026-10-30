/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeInvestigationArgs, claudeInvestigationControlArgs, claudeInvestigationAdapter, CLAUDE_INVESTIGATION_SETTINGS } from '../claude-investigation-session.js';
import { collectClaudeProbeObservations, CLAUDE_PROBE_TELEMETRY_VERSION } from '../claude-investigation-probe.js';
import { readClaudeSourcePolicyDiagnostics } from '../claude-investigation-policy.js';
import { scopedReviewToolCatalog } from '../../../shared/review-investigation-catalog.js';
import { InvestigationReplySchema } from '../../../shared/review-investigation.js';
import { CAPABILITY_BOUNDARY, CLAUDE_V2_ADAPTER, ISOLATION_CHECKS, isolationBasisFor, boundaryEvidenceValid, REVIEW_PROTOCOL_SCHEMA_DIGEST } from '../../../shared/review-isolation-evidence.js';
import type { ProcessGroupResult } from '../../../shared/process-group.js';

const native = { type: 'system', subtype: 'init', session_id: 'native-fixture', claude_code_version: '2.1.310',
  tools: ['StructuredOutput', ...scopedReviewToolCatalog(false).map(t => `mcp__insrc-scoped-review__${t.name}`)],
  plugins: [], skills: [], slash_commands: [], permissionMode: 'dontAsk',
  mcp_servers: [{ name: 'insrc-scoped-review', status: 'connected', source: 'dynamic' }] };
const identity = { attemptId: 'test', launchDigest: 'a'.repeat(64), effectiveDigest: 'b'.repeat(64),
  binaryVersion: CLAUDE_PROBE_TELEMETRY_VERSION, sourceMode: 'source-only' as const, adapterVersion: CLAUDE_V2_ADAPTER,
  schemaDigest: REVIEW_PROTOCOL_SCHEMA_DIGEST };
const result = (value: unknown): ProcessGroupResult => ({ stdout: JSON.stringify(value) + '\n', stderr: '', exitCode: -1,
  timedOut: false, durationMs: 1, aborted: true, exitSignal: 'SIGKILL' });
// Only non-sensitive native messages from the actual 2.1.310 feasibility run.
const diagnosticMessages = [
  'Broken symlink or missing file encountered for settings.json at path: /etc/claude-code/managed-settings.json',
  'Found 4 plugins (0 enabled, 4 disabled)',
  'cc-plugin-sec-default@builtin not seated: no managed settings and not a Team or Enterprise organization (max)',
  'Registered 0 hooks from 0 plugins', 'Initialized versioned plugins system with 0 plugins',
];
const diagnostics = (messages = diagnosticMessages) => messages.map(m => `2026-10-30T09:33:20.000Z [DEBUG] ${m}`).join('\n') + '\n';

test('Claude v2 launch disables plugins hooks instructions and memory without breaking OAuth or scoped MCP', () => {
  const cwd = '/tmp/private/cwd', args = claudeInvestigationArgs(InvestigationReplySchema, [], cwd, false);
  assert.equal(claudeInvestigationAdapter.version, CLAUDE_V2_ADAPTER);
  assert.ok(args.includes('--restricted')); assert.ok(args.includes('--no-chrome'));
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--allowedTools') + 1], scopedReviewToolCatalog(false).map(t => `mcp__insrc-scoped-review__${t.name}`).join(','));
  for (const forbidden of ['--safe-mode', '--bare', '--dangerously-skip-permissions']) assert.ok(!args.includes(forbidden));
  const config = claudeInvestigationAdapter.configuration(cwd, false);
  assert.deepEqual(config[cwd + '/investigation-settings.json'], CLAUDE_INVESTIGATION_SETTINGS);
  assert.deepEqual(CLAUDE_INVESTIGATION_SETTINGS.enabledPlugins, {'cc-plugin-agents-md@builtin':false,'cc-plugin-telemetry@builtin':false,'cc-plugin-plugin-authoring@builtin':false});
  assert.equal(CLAUDE_INVESTIGATION_SETTINGS.disableAllHooks, true); assert.equal(CLAUDE_INVESTIGATION_SETTINGS.autoMemoryEnabled, false);
  assert.deepEqual(CLAUDE_INVESTIGATION_SETTINGS.claudeMdExcludes, ['**']);
  const control = claudeInvestigationControlArgs([], cwd, false);
  assert.ok(!control.includes('--restricted'), 'positive controls must be able to run synthetic hooks');
  assert.equal(control[control.indexOf('--settings') + 1], '/tmp/private/canary-control-settings.json');
  assert.notEqual(control[control.indexOf('--debug-file') + 1], args[args.indexOf('--debug-file') + 1]);
});

test('StructuredOutput is schema-bound protocol only and every unknown duplicate malformed or contradictory native capability refuses', () => {
  const good = collectClaudeProbeObservations(result(native), identity);
  assert.ok(good.some(o => o.check === 'builtin-tools' && o.verdict === 'observed-denied'));
  for (const tool of ['Bash', 'Read', 'WebFetch', 'mcp__insrc-scoped-review__shell', 'StructuredOutputX']) {
    const observations = collectClaudeProbeObservations(result({ ...native, tools: [...native.tools, tool] }), identity);
    assert.ok(observations.some(o => o.check === 'builtin-tools' && o.verdict === 'observed-allowed'), tool);
  }
  for (const changed of [{ ...native, tools: [...native.tools, native.tools[0]] },
    { ...native, plugins: [{ name: 'cc-plugin-agents-md', source: 'cc-plugin-agents-md@builtin' }] }])
    assert.ok(collectClaudeProbeObservations(result(changed), identity).some(o => o.verdict === 'observed-allowed'));
  for (const changed of [{ ...native, tools: [null] }, { ...native, permissionMode: 'bypassPermissions' },
    { ...native, mcp_servers: [{ name: 'insrc-scoped-review', status: 'connected', source: 'user' }] }, { ...native, skills: ['foreign'] }])
    assert.ok(!collectClaudeProbeObservations(result(changed), identity).some(o => o.verdict === 'observed-denied'));
  assert.ok(!collectClaudeProbeObservations(result(native), { ...identity, schemaDigest: '0'.repeat(64) }).some(o => o.verdict === 'observed-denied'));
  assert.ok(!collectClaudeProbeObservations(result({ type: 'assistant', message: native }), identity).some(o => o.verdict === 'observed-denied'));
});

test('Missing or managed policy provenance cannot become an empty effective inventory', () => {
  assert.equal(readClaudeSourcePolicyDiagnostics(diagnostics(), identity.binaryVersion)?.noManagedOrganization, true);
  for (let i = 0; i < diagnosticMessages.length; i++) assert.equal(readClaudeSourcePolicyDiagnostics(diagnostics(diagnosticMessages.filter((_, n) => n !== i)), identity.binaryVersion), undefined);
  for (const text of [diagnostics() + diagnostics(), diagnostics() + 'partial',
    diagnostics().replace('(0 enabled, 4 disabled)', '(1 enabled, 3 disabled)'),
    diagnostics().replace('Registered 0 hooks', 'Registered 1 hooks'),
    diagnostics().replace('organization (max)', 'organization (enterprise)'),
    diagnostics() + diagnostics(['Loaded managed settings from remote policy']),
    JSON.stringify({ message: diagnostics() })]) assert.equal(readClaudeSourcePolicyDiagnostics(text, identity.binaryVersion), undefined);
  assert.equal(readClaudeSourcePolicyDiagnostics(diagnostics(), 'future-version'), undefined);
  const boundary = { boundary: CAPABILITY_BOUNDARY, protocolTools: [{ name: 'StructuredOutput', schemaDigest: identity.schemaDigest }],
    evidenceBasis: ISOLATION_CHECKS.map(check => ({ check, basis: isolationBasisFor(check), policyVersion: 1, rawDigests: ['a'.repeat(64)] })) };
  assert.ok(boundaryEvidenceValid(CLAUDE_V2_ADAPTER, boundary));
  assert.ok(!boundaryEvidenceValid('claude-scoped-v1', boundary));
  assert.ok(boundaryEvidenceValid('claude-scoped-v1', {}));
  assert.ok(!boundaryEvidenceValid(CLAUDE_V2_ADAPTER, {}));
  assert.ok(!boundaryEvidenceValid(CLAUDE_V2_ADAPTER, { ...boundary, evidenceBasis: boundary.evidenceBasis.slice(1) }));
  assert.ok(!boundaryEvidenceValid(CLAUDE_V2_ADAPTER, { ...boundary, evidenceBasis: boundary.evidenceBasis.map(b => ({ ...b, basis: 'native-catalog' })) }));
});
