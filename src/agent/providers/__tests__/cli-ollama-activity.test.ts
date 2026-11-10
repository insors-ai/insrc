/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Activity-mode review spawn of an Ollama-targeted provider (ISSUE-738d62b848fd173f,
 * Story 3ec4189b758be646 s1 / t1): activityReview must run the same checkOllama()
 * preflight and withOllama() per-child env as the bounded claude path, passing it
 * as runInProcessGroup's opts.env — and never spawn a child when the preflight
 * rejects. A plain provider's activity child env stays byte-identical (no env key).
 *
 * A fake `claude` binary records its argv and the endpoint/vendor variables per run,
 * then prints one accepted streaming frame set + a success result.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/cli-ollama-activity.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CliProvider, claudeReviewSessionArgs, type OllamaTarget } from '../cli-provider.js';
import { OllamaTargetError } from '../ollama-target.js';
import { ReviewOutputFailureError, type ReviewDiagnosticSnapshot } from '../../../shared/review-diagnostics.js';

const VARS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'INSRC_ACTIVITY_SENTINEL'] as const;
/* t2 locks the withOllama contract at the activity call site: endpoint + auth from the
 * target, API key blanked, all three vendor keys stripped even when the daemon env
 * carries them, the rest of the daemon env untouched. */
const SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } }, additionalProperties: false };

interface Run { readonly args: string[]; readonly env: Record<string, string | null>; readonly hasEnvKey: boolean }

let dir: string;
let bin: string;
let callsPath: string;
const calls = (): Run[] => existsSync(callsPath)
	? readFileSync(callsPath, 'utf8').trim().split('\n').map(l => JSON.parse(l) as Run)
	: [];

const saved: Record<string, string | undefined> = {};
before(() => {
	dir = mkdtempSync(join(tmpdir(), 'cli-ollama-activity-'));
	bin = join(dir, 'claude.mjs');
	callsPath = join(dir, 'calls.jsonl');
	// The fake claude records argv + the endpoint/vendor vars, then streams one
	// accepted StructuredOutput candidate and a success result frame.
	writeFileSync(bin, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
let stdin = ''; for await (const c of process.stdin) stdin += c;
const env = {}; for (const k of ${JSON.stringify(VARS)}) env[k] = process.env[k] ?? null;
appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ args, env, hasEnvKey: true }) + '\\n');
const frames = [
  { type: 'assistant', uuid: 'a1', message: { content: [{ type: 'tool_use', id: 'out1', name: 'StructuredOutput', input: { ok: true } }] } },
  { type: 'result', subtype: 'success', is_error: false, structured_output: { ok: true } },
];
for (const f of frames) process.stdout.write(JSON.stringify(f) + '\\n');
`);
	chmodSync(bin, 0o755);
	// The daemon's environment carries a vendor login, a stray base URL and a sentinel.
	for (const [k, v] of [['CLAUDE_CODE_OAUTH_TOKEN', 'vendor-token'], ['ANTHROPIC_BASE_URL', 'https://vendor.example'], ['ANTHROPIC_API_KEY', 'vendor-key'], ['CLAUDE_CODE_USE_BEDROCK', '1'], ['CLAUDE_CODE_USE_VERTEX', '1'], ['INSRC_ACTIVITY_SENTINEL', 'daemon-env']] as const) {
		saved[k] = process.env[k];
		process.env[k] = v;
	}
});
after(() => {
	for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
	rmSync(dir, { recursive: true, force: true });
});

const TARGET: OllamaTarget = { host: 'http://ollama.test:11555', hosting: 'cloud' };
const passing = async (): Promise<void> => {};
const failing = async (target: OllamaTarget, model: string): Promise<void> => {
	throw new OllamaTargetError('ollama-unreachable', target.host, model, 'Ollama is not running');
};
const activityOpts = () => ({
	mode: 'activity' as const, cwd: dir, signal: new AbortController().signal, inactivityMs: 1_800_000, internalRetry: false,
	onActivity: () => {}, onDiagnostic: () => {}, onCandidate: async () => ({ accepted: true as const }),
});

test('T1-ollama-activity-child-env: the activity child of an ollama-claude provider gets the Ollama endpoint env and no vendor login', async () => {
	rmSync(callsPath, { force: true });
	const p = new CliProvider({ kind: 'claude', binPath: bin, model: 'glm-5.3:cloud', effort: 'high', ollama: TARGET, ollamaCheck: passing, timeoutMs: 20_000 });
	const value = await p.runReviewSession('review the repo', SCHEMA, activityOpts());
	assert.deepEqual(value, { ok: true });
	const runs = calls();
	assert.equal(runs.length, 1, 'exactly one child spawn');
	const env = runs[0]!.env;
	assert.equal(env['ANTHROPIC_BASE_URL'], TARGET.host, 'child points at the Ollama server');
	assert.equal(env['ANTHROPIC_AUTH_TOKEN'], 'ollama');
	assert.equal(env['ANTHROPIC_API_KEY'], '', 'the vendor api key is blanked, not inherited');
	assert.equal(env['CLAUDE_CODE_OAUTH_TOKEN'], null, 'the vendor login is stripped');
	assert.equal(env['CLAUDE_CODE_USE_BEDROCK'], null, 'Bedrock mode is stripped');
	assert.equal(env['CLAUDE_CODE_USE_VERTEX'], null, 'Vertex mode is stripped');
	assert.equal(env['INSRC_ACTIVITY_SENTINEL'], 'daemon-env', 'the rest of the daemon environment is kept');
});

test('T2-ollama-activity-no-vendor-inherit: the activity env carries the Ollama endpoint, a blank API key and none of the three vendor keys', async () => {
	rmSync(callsPath, { force: true });
	const p = new CliProvider({ kind: 'claude', binPath: bin, model: 'glm-5.3:cloud', effort: 'high', ollama: TARGET, ollamaCheck: passing, timeoutMs: 20_000 });
	await p.runReviewSession('review the repo', SCHEMA, activityOpts());
	const env = calls()[0]!.env;
	assert.equal(env['ANTHROPIC_BASE_URL'], TARGET.host, 'endpoint comes from the Ollama target, not the daemon env');
	assert.equal(env['ANTHROPIC_AUTH_TOKEN'], 'ollama');
	assert.equal(env['ANTHROPIC_API_KEY'], '', 'the inherited vendor API key is blanked');
	assert.equal(env['CLAUDE_CODE_OAUTH_TOKEN'], null, 'OAuth token stripped even though the daemon env has one');
	assert.equal(env['CLAUDE_CODE_USE_BEDROCK'], null, 'Bedrock stripped even though the daemon env sets it');
	assert.equal(env['CLAUDE_CODE_USE_VERTEX'], null, 'Vertex stripped even though the daemon env sets it');
	assert.equal(env['INSRC_ACTIVITY_SENTINEL'], 'daemon-env', 'non-vendor daemon env survives');
});

test('T5-claude-codex-activity-args-unchanged: activity argv matches the documented arg construction for both kinds, only opts.env was added', async () => {
	const commands = ['npm run build'];
	// claude: claudeReviewSessionArgs with stream-json substituted for json, then --verbose --include-partial-messages.
	rmSync(callsPath, { force: true });
	const claude = new CliProvider({ kind: 'claude', binPath: bin, model: 'claude-sonnet-5', effort: 'high', timeoutMs: 20_000 });
	const opts = { ...activityOpts(), codeTaskCommands: commands };
	await claude.runReviewSession('review the repo', SCHEMA, opts);
	const claudeOriginal = claudeReviewSessionArgs(SCHEMA, ['--model', 'claude-sonnet-5', '--effort', 'high'], commands);
	const expectedClaude = [...claudeOriginal.map((v, i) => i > 0 && claudeOriginal[i - 1] === '--output-format' ? 'stream-json' : v), '--verbose', '--include-partial-messages'];
	assert.deepEqual(calls()[0]!.args, expectedClaude);
	// codex: exec --output-schema <tmp>/schema.json --json --sandbox read-only -C <cwd> + model args; the tmp path is the only variable.
	rmSync(callsPath, { force: true });
	const codexBin = join(dir, 'codex.mjs');
	writeFileSync(codexBin, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
let stdin = ''; for await (const c of process.stdin) stdin += c;
appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ args: process.argv.slice(2), env: {}, hasEnvKey: true }) + '\\n');
const frames = [
  { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ ok: true }) } },
  { type: 'turn.completed' },
];
for (const f of frames) process.stdout.write(JSON.stringify(f) + '\\n');
`);
	chmodSync(codexBin, 0o755);
	const codex = new CliProvider({ kind: 'codex', binPath: codexBin, model: 'gpt-6.1', effort: 'low', timeoutMs: 20_000 });
	await codex.runReviewSession('review the repo', SCHEMA, opts);
	const codexArgs = calls()[0]!.args;
	const expectedPrefix = ['exec', '--output-schema'];
	assert.deepEqual(codexArgs.slice(0, 2), expectedPrefix);
	assert.match(codexArgs[2]!, /^.*codex-activity-schema-.*schema\.json$/, 'the schema is written to the session tmp dir');
	assert.deepEqual(codexArgs.slice(3), ['--json', '--sandbox', 'read-only', '-C', dir, '--model', 'gpt-6.1', '-c', 'model_reasoning_effort=low']);
});

test('T3-ollama-activity-preflight-rejects-before-spawn: a failed checkOllama throws OllamaTargetError and spawns no child', async () => {
	rmSync(callsPath, { force: true });
	const p = new CliProvider({ kind: 'claude', binPath: bin, model: 'glm-5.3:cloud', ollama: TARGET, ollamaCheck: failing, timeoutMs: 20_000 });
	await assert.rejects(p.runReviewSession('review the repo', SCHEMA, activityOpts()), (e: unknown) =>
		e instanceof ReviewOutputFailureError && e.diagnostic.terminal?.reason === 'ollama_preflight' && /Ollama is not running/.test(e.diagnostic.terminal.message ?? ''),
		'a failed checkOllama rejects before any child, wrapped so its diagnostic is persistable');
	assert.equal(calls().length, 0, 'no child process was spawned');
});

test('T3b-ollama-activity-preflight-diagnostic-carries-backend-cause: the preflight rejection reaches onDiagnostic as a ReviewOutputFailureError snapshot with the real cause', async () => {
	rmSync(callsPath, { force: true });
	const p = new CliProvider({ kind: 'claude', binPath: bin, model: 'glm-5.3:cloud', effort: 'high', ollama: TARGET, ollamaCheck: failing, timeoutMs: 20_000 });
	const snapshots: ReviewDiagnosticSnapshot[] = [];
	const opts = { ...activityOpts(), onDiagnostic: (s: ReviewDiagnosticSnapshot) => { snapshots.push(s); } };
	const err = await p.runReviewSession('review the repo', SCHEMA, opts).then(() => null, (e: unknown) => e);
	assert.ok(err instanceof ReviewOutputFailureError, 'the preflight rejection is a ReviewOutputFailureError so coordinators persist its diagnostic');
	assert.equal(err.diagnostic.terminal?.reason, 'ollama_preflight');
	assert.match(err.diagnostic.terminal?.message ?? '', /Ollama is not running/, 'the real backend cause is in the terminal message');
	assert.ok(snapshots.some(s => s.terminal?.reason === 'ollama_preflight' && /Ollama is not running/.test(s.terminal.message ?? '')), 'onDiagnostic saw the backend detail');
	assert.ok(snapshots.every(s => s.provider === 'claude'));
	assert.equal(calls().length, 0, 'still no child spawned');
});

test('T4-plain-provider-activity-env-unchanged: without an Ollama target the activity child inherits the daemon env verbatim', async () => {
	rmSync(callsPath, { force: true });
	const p = new CliProvider({ kind: 'claude', binPath: bin, model: 'claude-sonnet-5', effort: 'high', timeoutMs: 20_000 });
	const value = await p.runReviewSession('review the repo', SCHEMA, activityOpts());
	assert.deepEqual(value, { ok: true });
	const runs = calls();
	assert.equal(runs.length, 1);
	const env = runs[0]!.env;
	assert.equal(env['ANTHROPIC_BASE_URL'], 'https://vendor.example', 'the daemon env is inherited unchanged');
	assert.equal(env['CLAUDE_CODE_OAUTH_TOKEN'], 'vendor-token');
	assert.equal(env['CLAUDE_CODE_USE_BEDROCK'], '1');
	assert.equal(env['INSRC_ACTIVITY_SENTINEL'], 'daemon-env');
});

test('T1-ollama-activity-coordinator-dispatch-env-capture: the coordinator mode:\'activity\' envelope reaches the ollama-claude activity child with the endpoint env', async () => {
	// design-review/coordinator.ts:379 and task-review/coordinator.ts:223 both call
	// provider.runReviewSession(prompt, schema, { mode:'activity', cwd, inactivityMs,
	// signal, internalRetry:false, onActivity, onCandidate }). This test drives
	// exactly that envelope through a real ollama-claude CliProvider against the
	// fake binary, which records the child's endpoint/vendor env per spawn.
	rmSync(callsPath, { force: true });
	const p = new CliProvider({ kind: 'claude', binPath: bin, model: 'glm-5.3:cloud', effort: 'high', ollama: TARGET, ollamaCheck: passing, timeoutMs: 20_000 });
	const activities: string[] = [];
	const value = await p.runReviewSession('review the artifact', SCHEMA, {
		mode: 'activity', cwd: dir, signal: new AbortController().signal, inactivityMs: 1_800_000, internalRetry: false,
		onActivity: e => { activities.push(e.kind); },
		onDiagnostic: () => {},
		onCandidate: async v => ({ accepted: (v as { ok?: boolean }).ok === true }),
	});
	assert.deepEqual(value, { ok: true }, 'the accepted candidate returns through the coordinator envelope');
	const runs = calls();
	assert.equal(runs.length, 1, 'exactly one activity child spawned through the coordinator envelope');
	assert.equal(runs[0]!.env['ANTHROPIC_BASE_URL'], TARGET.host, 'the coordinator-dispatched child points at Ollama');
	assert.equal(runs[0]!.env['ANTHROPIC_AUTH_TOKEN'], 'ollama');
	assert.equal(runs[0]!.env['CLAUDE_CODE_OAUTH_TOKEN'], null, 'vendor login stripped on the coordinator path too');
	assert.ok(activities.includes('session_started') && activities.includes('model_output'), 'activity events flow through onActivity');
});
