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

import { CliProvider, type OllamaTarget } from '../cli-provider.js';
import { OllamaTargetError } from '../ollama-target.js';

const VARS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'INSRC_ACTIVITY_SENTINEL'] as const;
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
	for (const [k, v] of [['CLAUDE_CODE_OAUTH_TOKEN', 'vendor-token'], ['ANTHROPIC_BASE_URL', 'https://vendor.example'], ['CLAUDE_CODE_USE_BEDROCK', '1'], ['INSRC_ACTIVITY_SENTINEL', 'daemon-env']] as const) {
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

test('T3-ollama-activity-preflight-rejects-before-spawn: a failed checkOllama throws OllamaTargetError and spawns no child', async () => {
	rmSync(callsPath, { force: true });
	const p = new CliProvider({ kind: 'claude', binPath: bin, model: 'glm-5.3:cloud', ollama: TARGET, ollamaCheck: failing, timeoutMs: 20_000 });
	await assert.rejects(p.runReviewSession('review the repo', SCHEMA, activityOpts()), (e: unknown) => e instanceof OllamaTargetError && e.cause === 'ollama-unreachable');
	assert.equal(calls().length, 0, 'no child process was spawned');
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
