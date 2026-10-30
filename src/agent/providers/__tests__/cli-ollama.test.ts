/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * CliProvider against an Ollama server (Epic b220bb61, Story s2).
 *
 * A fake `claude` records, per run, its argv and the environment variables
 * that point it at a server (ANTHROPIC_BASE_URL / AUTH_TOKEN / API_KEY,
 * CLAUDE_CODE_OAUTH_TOKEN) plus a sentinel only the daemon's full environment
 * carries, then prints a successful claude envelope. It answers `--help` with
 * the bounded-isolation flags so the tool-free path can run.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/cli-ollama.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CliProvider, type OllamaTarget } from '../cli-provider.js';

const FLAGS = '--safe-mode --no-session-persistence --system-prompt --tools --disable-slash-commands --setting-sources --strict-mcp-config --mcp-config';
const VARS = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'INSRC_TEST_SENTINEL'] as const;

interface Run { readonly args: string[]; readonly env: Record<string, string | null> }

let dir: string;
let bin: string;
const calls = (): Run[] => existsSync(join(dir, 'calls.jsonl'))
	? readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as Run)
	: [];
const reset = (): void => { rmSync(join(dir, 'calls.jsonl'), { force: true }); };

const saved: Record<string, string | undefined> = {};
before(() => {
	dir = mkdtempSync(join(tmpdir(), 'cli-ollama-'));
	bin = join(dir, 'claude.mjs');
	writeFileSync(bin, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args.includes('--help')) { process.stdout.write(${JSON.stringify(FLAGS)}); process.exit(0); }
let stdin = ''; for await (const c of process.stdin) stdin += c;
const env = {}; for (const k of ${JSON.stringify(VARS)}) env[k] = process.env[k] ?? null;
appendFileSync(${JSON.stringify(join(dir, 'calls.jsonl'))}, JSON.stringify({ args, env }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok', structured_output: { ok: true } }));
`);
	chmodSync(bin, 0o755);
	// The daemon's environment: a vendor login, a stray base URL and a sentinel only a full copy carries.
	for (const [k, v] of [['CLAUDE_CODE_OAUTH_TOKEN', 'vendor-token'], ['ANTHROPIC_BASE_URL', 'https://vendor.example'], ['INSRC_TEST_SENTINEL', 'daemon-env']] as const) {
		saved[k] = process.env[k];
		process.env[k] = v;
	}
});
after(() => {
	for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
	rmSync(dir, { recursive: true, force: true });
});

const TARGET: OllamaTarget = { host: 'http://ollama.test:11555', hosting: 'cloud' };
const schema = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } }, additionalProperties: false };
const ollamaEnv = { ANTHROPIC_BASE_URL: TARGET.host, ANTHROPIC_AUTH_TOKEN: 'ollama', ANTHROPIC_API_KEY: '', CLAUDE_CODE_OAUTH_TOKEN: null };

/** Run every claude entry point once on `p`; returns the recorded runs in call order. */
async function everyEntryPoint(p: CliProvider): Promise<Run[]> {
	reset();
	await p.complete([{ role: 'user', content: 'hello' }]);
	await p.completeStructured([{ role: 'user', content: 'hello' }], schema);
	await p.runEditSession('edit the file', { cwd: dir });
	await p.runReviewSession('review the repo', schema, { cwd: dir, deadlineMs: 20_000 });
	return calls();
}

test('cli-ollama.test.ts: every claude entry point on an Ollama-targeted provider starts claude with --model <id> and the three Ollama variables, without CLAUDE_CODE_OAUTH_TOKEN, and leaves process.env unchanged', async () => {
	const before = { ...process.env };
	const p = new CliProvider({ kind: 'claude', binPath: bin, model: 'glm-5.3:cloud', effort: 'high', ollama: TARGET, timeoutMs: 20_000 });
	const runs = await everyEntryPoint(p);
	assert.equal(runs.length, 4, 'one claude run per entry point');
	for (const [i, r] of runs.entries()) {
		assert.equal(r.args[r.args.indexOf('--model') + 1], 'glm-5.3:cloud', `run ${i}: --model`);
		assert.equal(r.args[r.args.indexOf('--effort') + 1], 'high', `run ${i}: --effort`);
		assert.deepEqual({ ...r.env, INSRC_TEST_SENTINEL: undefined }, { ...ollamaEnv, INSRC_TEST_SENTINEL: undefined }, `run ${i}: Ollama variables`);
		assert.equal(r.env['INSRC_TEST_SENTINEL'], 'daemon-env', `run ${i}: the rest of the daemon environment is kept`);
	}
	assert.deepEqual({ ...process.env }, before, 'the daemon environment is unchanged');
});

test('cli-ollama.test.ts: the bounded path on an Ollama-targeted provider gets the allow-list plus the three Ollama variables', async () => {
	reset();
	const p = new CliProvider({ kind: 'claude', binPath: bin, model: 'glm-5.3:cloud', ollama: TARGET, timeoutMs: 20_000 });
	const out = await p.completeStructured([{ role: 'user', content: 'evidence' }], schema, { boundedInput: { maxInputChars: 10_000, contextMode: 'isolated-structured' } });
	assert.deepEqual(out, { ok: true });
	const [run] = calls();
	assert.ok(run !== undefined);
	assert.deepEqual(run.env, { ...ollamaEnv, INSRC_TEST_SENTINEL: null }, 'allow-list only (no sentinel), Ollama variables set, vendor login dropped');
	for (const flag of FLAGS.split(' ')) assert.ok(run.args.includes(flag), flag);
	assert.equal(run.args[run.args.indexOf('--model') + 1], 'glm-5.3:cloud');
});

test("cli-ollama.test.ts: providers without an Ollama target (claude, codex) start with today's arguments and no Ollama variables", async () => {
	const vendor = new CliProvider({ kind: 'claude', binPath: bin, model: 'claude-sonnet-5', effort: 'high', timeoutMs: 20_000 });
	assert.equal(vendor.ollama, undefined);
	const runs = await everyEntryPoint(vendor);
	assert.equal(runs.length, 4);
	for (const r of runs) {
		assert.deepEqual(r.env, { ANTHROPIC_BASE_URL: 'https://vendor.example', ANTHROPIC_AUTH_TOKEN: null, ANTHROPIC_API_KEY: null, CLAUDE_CODE_OAUTH_TOKEN: 'vendor-token', INSRC_TEST_SENTINEL: 'daemon-env' }, 'the daemon environment, as inherited today');
		assert.equal(r.args[r.args.indexOf('--model') + 1], 'claude-sonnet-5');
	}
	// The bounded path keeps its allow-list unchanged.
	reset();
	await vendor.completeStructured([{ role: 'user', content: 'evidence' }], schema, { boundedInput: { maxInputChars: 10_000, contextMode: 'isolated-structured' } });
	assert.deepEqual(calls()[0]!.env, { ANTHROPIC_BASE_URL: null, ANTHROPIC_AUTH_TOKEN: null, ANTHROPIC_API_KEY: null, CLAUDE_CODE_OAUTH_TOKEN: 'vendor-token', INSRC_TEST_SENTINEL: null });
	// A codex provider takes no target either.
	assert.equal(new CliProvider({ kind: 'codex', model: 'gpt-x' }).ollama, undefined);
});

test('cli-ollama.test.ts: an Ollama target with kind codex or without a model is refused at construction', () => {
	assert.throws(() => new CliProvider({ kind: 'codex', model: 'gpt-x', ollama: TARGET }), /an Ollama target needs the claude CLI and a model/);
	assert.throws(() => new CliProvider({ kind: 'vibe', model: 'v', ollama: TARGET }), /an Ollama target needs the claude CLI and a model/);
	assert.throws(() => new CliProvider({ kind: 'claude', ollama: TARGET }), /an Ollama target needs the claude CLI and a model/);
	assert.throws(() => new CliProvider({ kind: 'claude', model: '', ollama: TARGET }), /an Ollama target needs the claude CLI and a model/);
	assert.deepEqual(new CliProvider({ kind: 'claude', model: 'glm-5.3:cloud', ollama: TARGET }).ollama, TARGET);
});
