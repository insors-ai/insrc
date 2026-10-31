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
	REVIEW_SESSION_READ_TOOLS, ReviewSessionTimeoutError, CliStallError, CODEX_FIRST_OUTPUT_MS, InputTooLargeError,
} from '../cli-provider.js';

import { admitReviewBudget, createReviewBudgetPolicy, ReviewBudgetError } from '../../../workflow/review-pipeline/budget.js';
import { envelopeSchema } from '../../../workflow/review-pipeline/envelope.js';
import { reviewWireSchemaJson } from '../review-budget.js';
import type { ReviewExecutionBudget } from '../../../shared/review-budget.js';

const SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } };

/**
 * A fake CLI. Each run appends `{ argv, cwd }` to `calls.jsonl` beside it, then
 * acts on the next entry of `script.json` (the last entry repeats):
 *   { out }            print `out` and exit 0
 *   { fail, code? }    print `fail` to stderr and exit `code` (default 1)
 *   { sleepMs, ... }   wait first
 *   { pre, ... }       print `pre` before waiting (a run that starts and then goes silent)
 *   { drip, ... }      print each `{ ms, text }` after waiting `ms` (a run that keeps printing)
 */
const FAKE = `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let stdin = '';
for await (const c of process.stdin) stdin += c;
const calls = join(here, 'calls.jsonl');
const argv = process.argv.slice(2);
const schemaIndex = argv.indexOf('--output-schema');
const wireSchema = schemaIndex >= 0 ? readFileSync(argv[schemaIndex + 1], 'utf8') : argv[argv.indexOf('--json-schema') + 1];
appendFileSync(calls, JSON.stringify({ argv, cwd: process.cwd(), stdin, wireSchema }) + '\\n');
const n = readFileSync(calls, 'utf8').trim().split('\\n').length;
const script = JSON.parse(readFileSync(join(here, 'script.json'), 'utf8'));
const step = script[Math.min(n - 1, script.length - 1)];
if (step.pre) process.stdout.write(step.pre);
for (const d of step.drip ?? []) { await new Promise(r => setTimeout(r, d.ms)); process.stdout.write(d.text); }
if (step.sleepMs) await new Promise(r => setTimeout(r, step.sleepMs));
if (step.fail !== undefined) { process.stderr.write(step.fail); process.exit(step.code ?? 1); }
process.stdout.write(step.out);
`;

interface Call { argv: string[]; cwd: string; stdin: string; wireSchema?: string | undefined }

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

// --- a codex run that never starts answering (ISSUE-d4b2cd1c) -------------------

/** What a stalled codex run printed on 2026-10-19 before going silent. */
const codexSilent = (id: string): string =>
	JSON.stringify({ type: 'thread.started', thread_id: id }) + '\n' + JSON.stringify({ type: 'turn.started' }) + '\n';

test('a codex reviewer session that produces no model output is killed early and retried once as a fresh run', async () => {
	const f = fakeCli([{ pre: codexSilent('t-silent'), sleepMs: 30_000, out: '' }, { out: codexOk(JSON.stringify({ ok: true })) }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: f.bin, codexFirstOutputMs: 1_000 });
		const t0 = Date.now();
		const answer = await p.runReviewSession<{ ok: boolean }>('P', SCHEMA, { cwd: f.dir, deadlineMs: 20_000 });
		assert.deepEqual(answer, { ok: true });
		assert.equal(f.calls().length, 2, 'the silent run was replaced by a fresh one');
		assert.ok(Date.now() - t0 < 10_000, `the stall was noticed at the first-output limit, not the deadline (took ${Date.now() - t0}ms)`);
	} finally { f.cleanup(); }
});

test('a codex run silent twice fails with its session named, and a run that is answering is never cut by the stall limit', async () => {
	const twice = fakeCli([{ pre: codexSilent('t-again'), sleepMs: 30_000, out: '' }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: twice.bin, codexFirstOutputMs: 1_000 });
		await assert.rejects(
			p.runReviewSession('P', SCHEMA, { cwd: twice.dir, deadlineMs: 20_000 }),
			(e: unknown) => e instanceof CliStallError && e.sessionId === 't-again',
		);
		assert.equal(twice.calls().length, 2, 'retried once, not more');
	} finally { twice.cleanup(); }
	// Model output printed early, then a long silence: not a stall.
	const slow = fakeCli([{ pre: codexSilent('t-slow') + JSON.stringify({ type: 'item.started', item: { type: 'reasoning' } }) + '\n', sleepMs: 2_500, out: codexOk(JSON.stringify({ ok: true })) }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: slow.bin, codexFirstOutputMs: 1_000 });
		assert.deepEqual(await p.runReviewSession('P', SCHEMA, { cwd: slow.dir, deadlineMs: 20_000 }), { ok: true });
		assert.equal(slow.calls().length, 1);
	} finally { slow.cleanup(); }
	assert.ok(CODEX_FIRST_OUTPUT_MS < 600_000, 'the default first-output limit is well under the 10-minute call limit');
});

test('only the reviewer session is watched: a one-shot codex call that is silent at first is not cut by the stall limit', async () => {
	const f = fakeCli([{ pre: codexSilent('t-oneshot'), sleepMs: 2_500, out: codexOk(JSON.stringify({ ok: true })) }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: f.bin, codexFirstOutputMs: 1_000 });
		assert.deepEqual(await p.completeStructured([{ role: 'user', content: 'hi' }], SCHEMA), { ok: true });
		assert.equal(f.calls().length, 1);
	} finally { f.cleanup(); }
});

// --- the silence limit of a structured codex call (ISSUE-562b1bb5) -------------

const MSGS = [{ role: 'user' as const, content: 'hi' }];
const reasoningStarted = JSON.stringify({ type: 'item.started', item: { type: 'reasoning' } }) + '\n';

test('a structured codex call with stallMs kills a run that prints no output and throws CliStallError', async () => {
	const f = fakeCli([{ sleepMs: 30_000, out: '' }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: f.bin });
		const t0 = Date.now();
		await assert.rejects(
			p.completeStructured(MSGS, SCHEMA, { stallMs: 1_000, timeoutMs: 20_000, internalRetry: false }),
			(e: unknown) => e instanceof CliStallError,
		);
		assert.ok(Date.now() - t0 < 10_000, `killed at the silence limit, not the call limit (took ${Date.now() - t0}ms)`);
		assert.equal(f.calls().length, 1);
	} finally { f.cleanup(); }
});

test('a structured codex call with stallMs kills a run that prints an item event and then goes silent, stallMs after its last output', async () => {
	const f = fakeCli([{ pre: codexSilent('t-late'), drip: [{ ms: 600, text: reasoningStarted }], sleepMs: 30_000, out: '' }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: f.bin });
		const t0 = Date.now();
		await assert.rejects(
			p.completeStructured(MSGS, SCHEMA, { stallMs: 1_000, timeoutMs: 20_000, internalRetry: false }),
			(e: unknown) => e instanceof CliStallError && e.sessionId === 't-late',
		);
		const took = Date.now() - t0;
		assert.ok(took >= 1_500, `the limit restarted at the item event, 600 ms in (took ${took}ms)`);
		assert.ok(took < 10_000, `killed at the silence limit, not the call limit (took ${took}ms)`);
	} finally { f.cleanup(); }
});

test('a structured codex call that keeps printing within stallMs completes, and without stallMs no watchdog is armed', async () => {
	const drip = [1, 2, 3, 4].map(() => ({ ms: 600, text: reasoningStarted }));
	const busy = fakeCli([{ pre: codexSilent('t-busy'), drip, out: codexOk(JSON.stringify({ ok: true })) }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: busy.bin });
		assert.deepEqual(await p.completeStructured(MSGS, SCHEMA, { stallMs: 1_000, timeoutMs: 20_000, internalRetry: false }), { ok: true });
	} finally { busy.cleanup(); }
	const quiet = fakeCli([{ pre: codexSilent('t-quiet'), sleepMs: 2_500, out: codexOk(JSON.stringify({ ok: true })) }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: quiet.bin, codexFirstOutputMs: 1_000 });
		assert.deepEqual(await p.completeStructured(MSGS, SCHEMA, { timeoutMs: 20_000, internalRetry: false }), { ok: true });
		assert.equal(quiet.calls().length, 1);
	} finally { quiet.cleanup(); }
});

test('claude ignores stallMs and reviewer sessions keep the first-output watchdog', async () => {
	const claude = fakeCli([{ sleepMs: 2_500, out: claudeOk({ ok: true }) }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: claude.bin });
		assert.deepEqual(await p.completeStructured(MSGS, SCHEMA, { stallMs: 1_000, timeoutMs: 20_000, internalRetry: false }), { ok: true });
	} finally { claude.cleanup(); }
	// A reviewer session that printed an item early and then went quiet is still answering, not stalled.
	const session = fakeCli([{ pre: codexSilent('t-session') + reasoningStarted, sleepMs: 2_500, out: codexOk(JSON.stringify({ ok: true })) }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: session.bin, codexFirstOutputMs: 1_000 });
		assert.deepEqual(await p.runReviewSession('P', SCHEMA, { cwd: session.dir, deadlineMs: 20_000 }), { ok: true });
		assert.equal(session.calls().length, 1);
	} finally { session.cleanup(); }
});

// --- the silence limit of a reviewer session (ISSUE-562b1bb5) ------------------

test('a codex reviewer session given stallMs is killed after that much stdout silence, also after an early item event, and throws CliStallError', async () => {
	// Silent from the start: killed at stallMs, though the first-output limit is a minute.
	const silent = fakeCli([{ sleepMs: 30_000, out: '' }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: silent.bin, codexFirstOutputMs: 60_000 });
		const t0 = Date.now();
		await assert.rejects(
			p.runReviewSession('P', SCHEMA, { cwd: silent.dir, deadlineMs: 20_000, stallMs: 1_000, internalRetry: false }),
			(e: unknown) => e instanceof CliStallError,
		);
		assert.ok(Date.now() - t0 < 10_000, `killed at the silence limit, not the deadline (took ${Date.now() - t0}ms)`);
		assert.equal(silent.calls().length, 1);
	} finally { silent.cleanup(); }
	// Model output early, then silence: the first-output watchdog would let it run; the silence limit does not.
	const late = fakeCli([{ pre: codexSilent('t-session-late') + reasoningStarted, drip: [{ ms: 600, text: reasoningStarted }], sleepMs: 30_000, out: '' }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: late.bin, codexFirstOutputMs: 60_000 });
		const t0 = Date.now();
		await assert.rejects(
			p.runReviewSession('P', SCHEMA, { cwd: late.dir, deadlineMs: 20_000, stallMs: 1_000, internalRetry: false }),
			(e: unknown) => e instanceof CliStallError && e.sessionId === 't-session-late',
		);
		const took = Date.now() - t0;
		assert.ok(took >= 1_500, `the limit restarted at the later item event, 600 ms in (took ${took}ms)`);
		assert.ok(took < 10_000, `killed at the silence limit, not the deadline (took ${took}ms)`);
	} finally { late.cleanup(); }
	// A session that keeps printing within stallMs answers.
	const busy = fakeCli([{ pre: codexSilent('t-session-busy'), drip: [1, 2, 3, 4].map(() => ({ ms: 600, text: reasoningStarted })), out: codexOk(JSON.stringify({ ok: true })) }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: busy.bin, codexFirstOutputMs: 60_000 });
		assert.deepEqual(await p.runReviewSession('P', SCHEMA, { cwd: busy.dir, deadlineMs: 20_000, stallMs: 1_000, internalRetry: false }), { ok: true });
	} finally { busy.cleanup(); }
});

test('a codex reviewer session without stallMs keeps the first-output watchdog: model output printed early then a long silence is not a stall', async () => {
	const slow = fakeCli([{ pre: codexSilent('t-first') + reasoningStarted, sleepMs: 2_500, out: codexOk(JSON.stringify({ ok: true })) }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: slow.bin, codexFirstOutputMs: 1_000 });
		assert.deepEqual(await p.runReviewSession('P', SCHEMA, { cwd: slow.dir, deadlineMs: 20_000, internalRetry: false }), { ok: true });
		assert.equal(slow.calls().length, 1);
	} finally { slow.cleanup(); }
	const silent = fakeCli([{ pre: codexSilent('t-first-silent'), sleepMs: 30_000, out: '' }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: silent.bin, codexFirstOutputMs: 1_000 });
		const t0 = Date.now();
		await assert.rejects(
			p.runReviewSession('P', SCHEMA, { cwd: silent.dir, deadlineMs: 20_000, internalRetry: false }),
			(e: unknown) => e instanceof CliStallError,
		);
		assert.ok(Date.now() - t0 < 10_000, `no model output is still cut at the first-output limit (took ${Date.now() - t0}ms)`);
	} finally { silent.cleanup(); }
});

test('a size refusal in a claude session envelope is now an InputTooLargeError, and a codex session refusal still is', async () => {
	const refusal = 'Error: turn/start: turn/start failed: Input exceeds the maximum length of 1048576 characters. (code -32602), data: {"input_error_code":"input_too_large","max_chars":1048576,"actual_chars":1247701}';
	// claude: an is_error envelope saying the prompt is too long.
	const claude = fakeCli([{ out: JSON.stringify({ type: 'result', is_error: true, result: 'Prompt is too long' }) }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: claude.bin });
		const err = await p.runReviewSession('P', SCHEMA, { cwd: claude.dir, deadlineMs: 20_000 }).then(() => null, (e: unknown) => e);
		assert.ok(err instanceof InputTooLargeError, `claude: got ${String(err)}`);
		assert.equal(claude.calls().length, 1, 'a size refusal is never resent');
	} finally { claude.cleanup(); }
	// codex: an error event carrying the refusal.
	const codex = fakeCli([{ out: `${JSON.stringify({ type: 'thread.started', thread_id: 't-big' })}\n${JSON.stringify({ type: 'error', message: refusal })}\n` }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: codex.bin });
		const err = await p.runReviewSession('P', SCHEMA, { cwd: codex.dir, deadlineMs: 20_000 }).then(() => null, (e: unknown) => e);
		assert.ok(err instanceof InputTooLargeError, `codex: got ${String(err)}`);
		assert.equal(err.maxChars, 1048576);
		assert.equal(codex.calls().length, 1, 'a size refusal is never resent');
	} finally { codex.cleanup(); }
});

// --- reasoning effort (Story a27df028 S001) -------------------------------------

test('with effort, claude invocations carry --effort <e> and codex invocations carry -c model_reasoning_effort=<e>, in complete, structured, edit session and both review sessions', async () => {
	const c = fakeCli([{ out: claudeOk({ ok: true }) }]);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: c.bin, model: 'opus', effort: 'high' });
		await p.complete([{ role: 'user', content: 'hi' }]);
		await p.completeStructured([{ role: 'user', content: 'hi' }], SCHEMA);
		await p.runEditSession('edit', { cwd: c.dir });
		await p.runReviewSession('P', SCHEMA, { cwd: c.dir, deadlineMs: 20_000 });
		const argvs = c.calls().map(x => x.argv);
		assert.equal(argvs.length, 4);
		for (const argv of argvs) assert.deepEqual(argv.slice(-4), ['--model', 'opus', '--effort', 'high'], argv.join(' '));
		assert.deepEqual(argvs[3], claudeReviewSessionArgs(SCHEMA, ['--model', 'opus', '--effort', 'high']));
	} finally { c.cleanup(); }

	const x = fakeCli([{ out: codexOk('{"ok":true}') }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: x.bin, model: 'gpt-6.1-sol', effort: 'medium' });
		await p.complete([{ role: 'user', content: 'hi' }]);
		await p.completeStructured([{ role: 'user', content: 'hi' }], SCHEMA);
		await p.runEditSession('edit', { cwd: x.dir });
		await p.runReviewSession('P', SCHEMA, { cwd: x.dir, deadlineMs: 20_000 });
		const argvs = x.calls().map(y => y.argv);
		assert.equal(argvs.length, 4);
		for (const argv of argvs) assert.deepEqual(argv.slice(-4), ['--model', 'gpt-6.1-sol', '-c', 'model_reasoning_effort=medium'], argv.join(' '));
		assert.deepEqual(argvs[3]!.slice(0, 2), ['exec', '--output-schema']);
	} finally { x.cleanup(); }
});

test("without effort every argv is byte-identical to today's", async () => {
	const x = fakeCli([{ out: codexOk('{"ok":true}') }]);
	try {
		const p = new CliProvider({ kind: 'codex', binPath: x.bin, model: 'gpt-6.1-sol' });
		await p.complete([{ role: 'user', content: 'hi' }]);
		await p.runEditSession('edit', { cwd: x.dir });
		const [complete, edit] = x.calls().map(y => y.argv);
		assert.deepEqual(complete, ['exec', '--json', '--model', 'gpt-6.1-sol']);
		assert.deepEqual(edit, ['exec', '--json', '--full-auto', '--model', 'gpt-6.1-sol']);
	} finally { x.cleanup(); }
	// No model and no effort: no extra arguments at all.
	const c = fakeCli([{ out: claudeOk({ ok: true }) }]);
	try {
		await new CliProvider({ kind: 'claude', binPath: c.bin }).complete([{ role: 'user', content: 'hi' }]);
		assert.deepEqual(c.calls()[0]!.argv, ['--print', '--output-format', 'json']);
	} finally { c.cleanup(); }
});


test('provider profile and normalized enveloped wire schema agree before planning and dispatch without config writes', async () => {
	const schema = envelopeSchema('budget-call', SCHEMA);
	const originalSchema = JSON.stringify(schema);
	const answer = { callId: 'budget-call', answer: { ok: true } };
	for (const kind of ['claude', 'codex'] as const) {
		for (const executionKind of ['structured', 'reviewer-session'] as const) {
			const f = fakeCli([{ out: kind === 'claude' ? claudeOk(answer) : codexOk(JSON.stringify(answer)) }]);
			try {
				const provider = new CliProvider({ kind, binPath: f.bin, model: 'fixture' });
				const profile = provider.getReviewBudgetProfile(executionKind);
				assert.ok(Object.isFrozen(profile));
				assert.equal(profile.qualification, 'reserved-native');
				assert.equal(profile.inspectionReserveTokens, executionKind === 'reviewer-session' ? 24576 : 0);
				const policy = createReviewBudgetPolicy(profile, executionKind);
				const wireSchema = reviewWireSchemaJson(profile, schema);
				if (kind === 'codex') assert.equal(JSON.parse(wireSchema).additionalProperties, false);
				const budget: ReviewExecutionBudget = {
					policy, admitted: admitReviewBudget(policy, { promptChars: 6, wireSchemaJson: wireSchema, phase: 'planning' }),
					outputAllowanceTokens: 8192, reviewId: 'budget-review', callId: 'budget-call', stage: 'review', role: 'single', attempt: 1,
				};
				const missingProfile = { ...budget, policy: { ...policy, profile: undefined } } as unknown as ReviewExecutionBudget;
				await assert.rejects(() => provider.completeStructured([{ role: 'user', content: 'review' }], schema, { reviewBudget: missingProfile, internalRetry: false }), e => e instanceof ReviewBudgetError && e.code === 'native-budget-unqualified');
				await assert.rejects(() => provider.runReviewSession('review', schema, { cwd: f.dir, deadlineMs: 5000, reviewBudget: missingProfile, internalRetry: false }), e => e instanceof ReviewBudgetError && e.code === 'native-budget-unqualified');
				assert.equal(f.calls().length, 0, 'missing production profile never spawns a CLI');
				const config = join(f.dir, 'config.json');
				writeFileSync(config, '{"unchanged":true}');
				if (executionKind === 'structured') {
					assert.deepEqual(await provider.completeStructured([{ role: 'user', content: 'review' }], schema, { cwd: f.dir, reviewBudget: budget, internalRetry: false }), answer);
				} else {
					assert.deepEqual(await provider.runReviewSession('review', schema, { cwd: f.dir, deadlineMs: 5000, reviewBudget: budget, internalRetry: false }), answer);
				}
				assert.equal(f.calls().length, 1);
				assert.equal(f.calls()[0]!.wireSchema, wireSchema, 'the actual CLI wire schema is the planned representation');
				assert.equal(f.calls()[0]!.stdin, 'review');
				assert.equal(readFileSync(config, 'utf8'), '{"unchanged":true}');
				assert.ok(!f.calls()[0]!.argv.some(a => /model_context_window|auto_compact/.test(a)));
				const mismatched = { ...budget, policy: { ...policy, profile: { ...profile, transportVersion: 'other-version' } } };
				await assert.rejects(() => provider.completeStructured([{ role: 'user', content: 'review' }], schema, { reviewBudget: mismatched, internalRetry: false }), e => e instanceof ReviewBudgetError && e.code === 'budget-profile-mismatch');
				assert.equal(f.calls().length, 1, 'profile mismatch never spawns a CLI');
				const tinyPolicy = createReviewBudgetPolicy(profile, executionKind, 1);
				await assert.rejects(() => provider.runReviewSession('review', schema, { cwd: f.dir, deadlineMs: 5000, reviewBudget: { ...budget, policy: tinyPolicy, admitted: { ...budget.admitted, limitTokens: 1 } }, internalRetry: false }), e => e instanceof ReviewBudgetError);
				assert.equal(f.calls().length, 1, 'overflow never spawns a CLI');
				assert.equal(JSON.stringify(schema), originalSchema, 'strict conversion never mutates the caller schema');
			} finally { f.cleanup(); }
		}
	}
});

test('review-scoped provider and driver logs redact sentinel content on all failure paths', async () => {
	const { getLogger } = await import('../../../shared/logger.js');
	const { createReviewJob } = await import('../../../workflow/review-pipeline/job.js');
	const { runReviewJob } = await import('../../../workflow/review-pipeline/driver.js');
	const { toyAdapter, toySnapshot, atom } = await import('../../../workflow/review-pipeline/__tests__/toy-adapter.js');
	const sentinel = 'PRIVATE_SOURCE_SCHEMA_CREDENTIAL_UNKNOWN_ID';
	const cases = [
		{ kind: 'codex' as const, mode: 'structured' as const, step: { fail: `API Error: overloaded ${sentinel.repeat(100)}` } },
		{ kind: 'codex' as const, mode: 'structured' as const, step: { out: JSON.stringify({ type: 'turn.failed', error: { message: sentinel.repeat(100) } }) + '\n' } },
		{ kind: 'codex' as const, mode: 'structured' as const, step: { out: codexOk(sentinel.repeat(100)) } },
		{ kind: 'codex' as const, mode: 'reviewer-session' as const, step: { pre: JSON.stringify({ type: 'thread.started', thread_id: sentinel }) + '\n', sleepMs: 400, out: codexOk('{}') } },
		{ kind: 'claude' as const, mode: 'structured' as const, step: { out: JSON.stringify({ is_error: true, result: sentinel.repeat(100), modelUsage: { [sentinel]: {} } }) } },
		{ kind: 'claude' as const, mode: 'reviewer-session' as const, step: { out: JSON.stringify({ is_error: true, result: sentinel.repeat(100) }) } },
	];
	const captured: unknown[] = [];
	const restore: (() => void)[] = [];
	for (const name of ['cli-provider', 'review-pipeline:driver', 'review-pipeline:job', 'providers:structured-output']) {
		const logger = getLogger(name) as unknown as Record<string, (...args: unknown[]) => void>;
		for (const level of ['info', 'warn', 'debug']) {
			const original = logger[level]!;
			logger[level] = (...args) => { captured.push(args); };
			restore.push(() => { logger[level] = original; });
		}
	}
	const oldTmp = process.env['TMPDIR'];
	try {
		for (const c of cases) {
			if (oldTmp === undefined) delete process.env['TMPDIR']; else process.env['TMPDIR'] = oldTmp;
			const f = fakeCli([c.step]);
			try {
				process.env['TMPDIR'] = f.dir;
				const provider = new CliProvider({ kind: c.kind, binPath: f.bin, model: 'fixture' });
				const policy = createReviewBudgetPolicy(provider.getReviewBudgetProfile(c.mode), c.mode);
				const source = { ...atom(1), text: sentinel.repeat(10) };
				const snapshot = toySnapshot([source]);
				const adapter = toyAdapter(snapshot, { execution: c.mode === 'reviewer-session'
					? { mode: 'reviewer-session', cwd: f.dir, deadlineMs: 5000, stallMs: 100, tools: 'read-only' }
					: { mode: 'structured', cwd: f.dir } });
				const job = createReviewJob(adapter, 'daemon', snapshot, 384000, { budgetPolicy: policy });
				await assert.rejects(() => runReviewJob(job, adapter, provider), e => {
					assert.ok(e instanceof Error); assert.ok(!e.message.includes(sentinel)); return true;
				});
				assert.ok(f.calls().length >= 1);
				assert.ok(!existsSync(join(f.dir, 'insrc-cli-failures')), 'review output is not persisted in raw CLI failure files');
			} finally { f.cleanup(); }
		}

  for (const mode of ['cancel', 'refuse'] as const) {
   if (oldTmp === undefined) delete process.env['TMPDIR']; else process.env['TMPDIR'] = oldTmp;
   const f = fakeCli([{sleepMs:1000,out:codexOk('{}')}]);
   try {
    const provider = new CliProvider({kind:'codex',binPath:f.bin,model:'fixture'});
    const policy=createReviewBudgetPolicy(provider.getReviewBudgetProfile('structured'),'structured');
    const snapshot=toySnapshot([{...atom(1),text:sentinel}]);
    const adapter=toyAdapter(snapshot);
    const job=createReviewJob(adapter,'daemon',snapshot,384000,{budgetPolicy:policy});
    const controller=new AbortController();
    const input=mode==='refuse'?{...job,pending:job.pending.map(call=>({...call,messages:[{role:'user' as const,content:sentinel.repeat(20000)}]}))}:job;
    await assert.rejects(()=>runReviewJob(input,adapter,provider,{signal:controller.signal,onCall:()=>{if(mode==='cancel')controller.abort();}}));
   } finally {f.cleanup();}
  }
		assert.ok(captured.length > 0);
		assert.ok(!JSON.stringify(captured).includes(sentinel), 'provider/driver/structured retry logs contain no source, output, credentials or native session IDs');
		// Non-review error reporting keeps its established full-output behavior.
		if (oldTmp === undefined) delete process.env['TMPDIR']; else process.env['TMPDIR'] = oldTmp;
		const f = fakeCli([{ fail: sentinel.repeat(100) }]);
		try {
			process.env['TMPDIR'] = f.dir;
			const provider = new CliProvider({ kind: 'codex', binPath: f.bin });
			await assert.rejects(() => provider.completeStructured([{ role: 'user', content: 'normal call' }], SCHEMA, { internalRetry: false }));
			assert.ok(existsSync(join(f.dir, 'insrc-cli-failures')));
		} finally { f.cleanup(); }
	} finally {
		if (oldTmp === undefined) delete process.env['TMPDIR']; else process.env['TMPDIR'] = oldTmp;
		for (const reset of restore.reverse()) reset();
	}
});


test('code-task command grants reach the native CLI without changing later design sessions', async () => {
 const f = fakeCli([{ out: claudeOk({ ok: true }) }]);
 try {
  const provider = new CliProvider({ kind: 'claude', binPath: f.bin });
  await provider.runReviewSession('Inspect pinned code and tests', SCHEMA, { cwd: f.dir, deadlineMs: 300000, stallMs: 300000, internalRetry: false, codeTaskCommands: ['git show aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:source.ts', 'node --test test.ts'] });
  await provider.runReviewSession('Inspect design', SCHEMA, { cwd: f.dir, deadlineMs: 300000, internalRetry: false });
  const [code, design] = f.calls();
  assert.equal(code!.argv[code!.argv.indexOf('--tools') + 1], 'Read,Grep,Glob,Bash');
  assert.match(code!.argv[code!.argv.indexOf('--allowedTools') + 1]!, /Bash\(node --test test.ts\)/);
  assert.equal(design!.argv[design!.argv.indexOf('--tools') + 1], 'Read,Grep,Glob');
  assert.ok(!design!.argv.join(' ').includes('Bash('));
 } finally { f.cleanup(); }
});
