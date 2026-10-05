/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The read-only reviewer session on the CLI provider, driven against FAKE
 * `claude` / `codex` binaries (the real CLIs are covered by the live test).
 * (LLD-f2f08ccf89f8ab25-S001, plan task t4.)
 */

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
	claudeReviewSessionArgs, CliProvider, codexReviewSessionArgs, REVIEW_SESSION_ANALYZE_TOOLS,
	REVIEW_SESSION_READ_TOOLS, ReviewSessionTimeoutError,
} from '../cli-provider.js';

const SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } };

/**
 * A fake CLI. Each run appends `{ argv, cwd }` to `calls.jsonl` beside it, then
 * acts on the next entry of `script.json` (the last entry repeats):
 *   { out }            print `out` and exit 0
 *   { fail, code? }    print `fail` to stderr and exit `code` (default 1)
 *   { sleepMs, ... }   wait first
 */
const FAKE = `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let stdin = '';
for await (const c of process.stdin) stdin += c;
const calls = join(here, 'calls.jsonl');
appendFileSync(calls, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), stdin }) + '\\n');
const n = readFileSync(calls, 'utf8').trim().split('\\n').length;
const script = JSON.parse(readFileSync(join(here, 'script.json'), 'utf8'));
const step = script[Math.min(n - 1, script.length - 1)];
if (step.sleepMs) await new Promise(r => setTimeout(r, step.sleepMs));
if (step.fail !== undefined) { process.stderr.write(step.fail); process.exit(step.code ?? 1); }
process.stdout.write(step.out);
`;

interface Call { argv: string[]; cwd: string; stdin: string }

function fakeCli(script: readonly Record<string, unknown>[]): { bin: string; dir: string; calls: () => Call[]; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-cli-'));
	const bin = join(dir, 'fake.mjs');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	writeFileSync(join(dir, 'script.json'), JSON.stringify(script));
	const callsPath = join(dir, 'calls.jsonl');
	return {
		bin, dir,
		calls: () => (existsSync(callsPath) ? readFileSync(callsPath, 'utf8').trim().split('\n').map(l => JSON.parse(l) as Call) : []),
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

const claudeOk = (structured: unknown): string => JSON.stringify({ is_error: false, result: '', structured_output: structured });
const codexOk = (...messages: string[]): string =>
	messages.map(text => JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } })).join('\n') + '\n';

// --- arguments -----------------------------------------------------------------

test('claude reviewer-session arguments allow reading and insrc analyze only', () => {
	const args = claudeReviewSessionArgs(SCHEMA, ['--model', 'opus']);
	assert.deepEqual(args, [
		'--print', '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA),
		'--tools', 'Read,Grep,Glob',
		'--allowedTools', 'Read,Grep,Glob,mcp__insrc__insrc_analyze,mcp__insrc__insrc_analyze_step',
		'--model', 'opus',
	]);
	assert.ok(!args.includes('--permission-mode') && !args.includes('acceptEdits'), 'no edit permission');
	for (const t of ['Write', 'Edit', 'Bash']) assert.ok(!REVIEW_SESSION_READ_TOOLS.includes(t), `${t} is not offered`);
	assert.deepEqual([...REVIEW_SESSION_ANALYZE_TOOLS], ['mcp__insrc__insrc_analyze', 'mcp__insrc__insrc_analyze_step']);
});

test('codex reviewer-session arguments use a read-only sandbox', () => {
	const args = codexReviewSessionArgs('/tmp/s.json', '/repo', []);
	assert.deepEqual(args, ['exec', '--output-schema', '/tmp/s.json', '--json', '--sandbox', 'read-only', '-C', '/repo']);
	assert.ok(!args.includes('--full-auto'));
});

// --- a session -----------------------------------------------------------------

test('a claude reviewer session runs in the repo with the session arguments and returns the checked answer', async () => {
	const f = fakeCli([{ out: claudeOk({ ok: true }) }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin, model: 'opus' });
		const res = await p.runReviewSession<{ ok: boolean }>('THE PROMPT', SCHEMA, { cwd: f.dir, deadlineMs: 20_000 });
		assert.deepEqual(res, { ok: true });
		const calls = f.calls();
		assert.equal(calls.length, 1);
		assert.deepEqual(calls[0]!.argv, claudeReviewSessionArgs(SCHEMA, ['--model', 'opus']));
		assert.equal(realpathSync(calls[0]!.cwd), realpathSync(f.dir));
		assert.equal(calls[0]!.stdin, 'THE PROMPT');
	} finally { f.cleanup(); }
});

test('a codex reviewer session takes the LAST message as the answer', async () => {
	const f = fakeCli([{ out: codexOk('I will read the file first.', '{"ok":true}') }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: f.bin });
		const res = await p.runReviewSession<{ ok: boolean }>('P', SCHEMA, { cwd: f.dir, deadlineMs: 20_000 });
		assert.deepEqual(res, { ok: true });
		const argv = f.calls()[0]!.argv;
		assert.deepEqual([argv[0], argv[1], argv[3], argv[4], argv[5], argv[6], argv[7]], ['exec', '--output-schema', '--json', '--sandbox', 'read-only', '-C', f.dir]);
	} finally { f.cleanup(); }
});

test('a session with no checked answer fails', async () => {
	const f = fakeCli([{ out: JSON.stringify({ is_error: false, result: 'prose only' }) }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin });
		await assert.rejects(p.runReviewSession('P', SCHEMA, { cwd: f.dir, deadlineMs: 20_000 }), /no structured_output/);
		assert.equal(f.calls().length, 1);
	} finally { f.cleanup(); }
});

// --- retry and deadline --------------------------------------------------------

test('a transient CLI error is retried once', async () => {
	const f = fakeCli([{ fail: 'API Error: overloaded' }, { out: claudeOk({ ok: true }) }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin });
		assert.deepEqual(await p.runReviewSession('P', SCHEMA, { cwd: f.dir, deadlineMs: 20_000 }), { ok: true });
		assert.equal(f.calls().length, 2);
	} finally { f.cleanup(); }
});

test('a transient CLI error is never retried more than once', async () => {
	const f = fakeCli([{ fail: 'rate limit exceeded' }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin });
		await assert.rejects(p.runReviewSession('P', SCHEMA, { cwd: f.dir, deadlineMs: 20_000 }), /rate limit/);
		assert.equal(f.calls().length, 2, 'two attempts, not the provider\'s usual three');
	} finally { f.cleanup(); }
});

test('an error that is not transient is not retried', async () => {
	const f = fakeCli([{ fail: 'unknown option --tools' }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin });
		await assert.rejects(p.runReviewSession('P', SCHEMA, { cwd: f.dir, deadlineMs: 20_000 }), /unknown option/);
		assert.equal(f.calls().length, 1);
	} finally { f.cleanup(); }
});

test('a session is stopped at its deadline and that is not retried', async () => {
	const f = fakeCli([{ sleepMs: 30_000, out: claudeOk({ ok: true }) }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin });
		const t0 = Date.now();
		await assert.rejects(
			p.runReviewSession('P', SCHEMA, { cwd: f.dir, deadlineMs: 1500 }),
			(e: unknown) => e instanceof ReviewSessionTimeoutError && e.deadlineMs === 1500 && /time limit of 2s/.test(e.message),
		);
		const took = Date.now() - t0;
		assert.ok(took >= 1400 && took < 6000, `stopped at the deadline (took ${took}ms)`);
		assert.equal(f.calls().length, 1, 'a timeout is not a transient error');
	} finally { f.cleanup(); }
});

test('the retry gets only the time that remains', async () => {
	// First attempt fails transiently after ~1.2s; the retry would need 30s but only ~1.3s is left.
	const f = fakeCli([{ sleepMs: 1200, fail: 'service unavailable' }, { sleepMs: 30_000, out: claudeOk({ ok: true }) }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin });
		const t0 = Date.now();
		await assert.rejects(p.runReviewSession('P', SCHEMA, { cwd: f.dir, deadlineMs: 2500 }), ReviewSessionTimeoutError);
		const took = Date.now() - t0;
		assert.equal(f.calls().length, 2);
		// Given a fresh 2.5s the retry would end near 3.7s; given what remains it ends near 2.5s.
		assert.ok(took >= 2300 && took < 3200, `both attempts fit inside one deadline (took ${took}ms)`);
	} finally { f.cleanup(); }
});

test('no attempt starts once the deadline has passed', async () => {
	// The binary does not exist: starting it would fail with a spawn error, so a
	// timeout error here proves nothing was started.
	const p = new CliProvider({ kind: 'claude', binPath: join(tmpdir(), 'insrc-no-such-cli-binary') });
	await assert.rejects(p.runReviewSession('P', SCHEMA, { cwd: tmpdir(), deadlineMs: 0 }), ReviewSessionTimeoutError);
	await assert.rejects(p.runReviewSession('P', SCHEMA, { cwd: tmpdir(), deadlineMs: -5 }), ReviewSessionTimeoutError);
	// With time on the clock the same provider does try to start it, and fails differently.
	await assert.rejects(
		p.runReviewSession('P', SCHEMA, { cwd: tmpdir(), deadlineMs: 5000 }),
		(e: unknown) => e instanceof Error && !(e instanceof ReviewSessionTimeoutError),
	);
});

// --- the other calls are untouched ----------------------------------------------

test('one-shot calls and the edit session build the same arguments as before', async () => {
	const f = fakeCli([{ out: claudeOk({ ok: true }) }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin, model: 'opus' });
		await p.complete([{ role: 'user', content: 'hi' }]);
		await p.completeStructured([{ role: 'user', content: 'hi' }], SCHEMA);
		await p.runEditSession('edit', { cwd: f.dir });
		const [complete, structured, edit] = f.calls().map(c => c.argv);
		assert.deepEqual(complete, ['--print', '--output-format', 'json', '--model', 'opus']);
		assert.deepEqual(structured, ['--print', '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA), '--model', 'opus']);
		assert.deepEqual(edit, ['--print', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--model', 'opus']);
	} finally { f.cleanup(); }
});
