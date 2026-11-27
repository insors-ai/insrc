/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The vibe kind of CliProvider, driven against a FAKE `vibe` binary (the same
 * pattern as cli-subprocess.test.ts) -- re-pointed for Epic
 * unify-vibe-one-plain-cli-adapter, s1/t6: every vibe call now dispatches
 * through src/shared/vibe-adapter.ts (createVibeAdapter/startTurn), not a
 * private argv path or the deleted app-server transport. Verifies the
 * headless arg shape (now including --output-dir), the prompt on stdin, the
 * session-message JSON parse, the structured retry, the edit-session flag,
 * the read-only mode's fail-closed refusal (k1, s1 -- no qualification exists
 * yet), and transient-vs-deterministic retry classification.
 *
 * The OLD app-server-specific fixture and its four tests (uncertain-dispatch
 * replay protection, live JSON-RPC tool-policy verification before dispatch)
 * are deleted outright, not re-pointed: that whole protocol (session/start,
 * turn/start-and-wait, runtime/read tool-policy verification) no longer
 * exists on any code path -- every vibe dispatch is now a single, stateless,
 * one-shot plain-CLI invocation with no persistent session to verify or
 * leave in an uncertain state, and the read-only mode refuses before any
 * dispatch at all (s1) until a later Story's live qualification lands (s2).
 *
 * Run: npx tsx --test src/agent/providers/__tests__/cli-vibe.test.ts
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider, vibeLastAssistantText } from '../cli-provider.js';
import { VibeReadOnlyUnavailableError } from '../../../shared/vibe-adapter.js';

/**
 * A fake `vibe`: records every invocation (args minus --output-dir's
 * non-deterministic temp path, stdin) as a JSON line in <dir>/calls.jsonl,
 * writes export.json to --output-dir same as the real binary, then behaves
 * per <dir>/mode:
 *   text      — prints a plain answer on stdout, exit 0
 *   json      — prints the real journal-entry array shape whose last
 *               assistant message carries the JSON payload in <dir>/payload
 *   flaky     — call 1: assistant text is NOT JSON; later calls: like json
 *   fail      — exit 2 with a transient-looking stderr message
 */
const FAKE = `#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let stdin = '';
for await (const c of process.stdin) stdin += c;
const args = process.argv.slice(2);
const outputDirIdx = args.indexOf('--output-dir');
const outputDir = outputDirIdx >= 0 ? args[outputDirIdx + 1] : undefined;
const recordedArgs = outputDirIdx >= 0 ? [...args.slice(0, outputDirIdx), ...args.slice(outputDirIdx + 2)] : args;
if (outputDir !== undefined) { mkdirSync(outputDir, { recursive: true }); writeFileSync(join(outputDir, 'export.json'), JSON.stringify({ outcome: 'finished', stop_reason: null, config: {} })); }
const mode = readFileSync(join(here, 'mode'), 'utf8').trim();
appendFileSync(join(here, 'calls.jsonl'), JSON.stringify({ args: recordedArgs, stdin }) + '\\n');
const calls = readFileSync(join(here, 'calls.jsonl'), 'utf8').trim().split('\\n').length;
if (mode === 'fail') {
  process.stderr.write('API Error: 503 service unavailable\\n');
  process.exit(2);
}
if (mode === 'text') {
  process.stdout.write('the final answer\\n');
  process.exit(0);
}
// json / flaky: the real journal-entry array shape; the last assistant message carries the payload.
const payload = readFileSync(join(here, 'payload'), 'utf8');
const bad = mode === 'flaky' && calls === 1;
const entries = [
  { sessionId: 'fixture-session', type: 'message', role: 'user', content: [{ type: 'text', text: 'q' }] },
  { sessionId: 'fixture-session', type: 'message', role: 'assistant', content: [{ type: 'text', text: bad ? 'sure! here is some prose, not json' : payload }] },
];
process.stdout.write(JSON.stringify(entries));
process.exit(0);
`;

interface FakeVibe {
	readonly bin: string;
	readonly calls: () => Array<{ args: string[]; stdin: string }>;
	readonly cleanup: () => void;
}

function fakeVibe(mode: string, payload = ''): FakeVibe {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-vibe-'));
	const bin = join(dir, 'fake-vibe.mjs');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	writeFileSync(join(dir, 'mode'), mode);
	writeFileSync(join(dir, 'payload'), payload);
	writeFileSync(join(dir, 'calls.jsonl'), '');
	return {
		bin,
		calls: () => readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').filter(l => l.length > 0).map(l => JSON.parse(l) as { args: string[]; stdin: string }),
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

const SCHEMA = { type: 'object', properties: { answer: { type: 'number' } }, required: ['answer'], additionalProperties: false } as const;

test('vibeLastAssistantText: bare array, wrapped messages, string content, no assistant', () => {
	assert.equal(vibeLastAssistantText(JSON.stringify([
		{ role: 'user', content: [{ type: 'text', text: 'q' }] },
		{ role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
	])), 'hello');
	assert.equal(vibeLastAssistantText(JSON.stringify({ messages: [
		{ role: 'assistant', content: 'plain string content' },
	] })), 'plain string content');
	// tool-call-only assistant messages are skipped; an earlier text wins
	assert.equal(vibeLastAssistantText(JSON.stringify([
		{ role: 'assistant', content: [{ type: 'text', text: 'first' }] },
		{ role: 'assistant', content: [{ type: 'tool_call' }] },
	])), 'first');
	assert.throws(() => vibeLastAssistantText('not json'), /not parseable JSON/);
	assert.throws(() => vibeLastAssistantText(JSON.stringify([{ role: 'user', content: 'x' }])), /no assistant text/);
	assert.throws(() => vibeLastAssistantText(JSON.stringify({ nope: 1 })), /did not print a message array/);
});

test("complete() runs `vibe -p --output text --approval-policy ask` with the prompt on stdin -- the explicit 'ask' policy (review finding r2-1) denies every tool call outright in headless mode instead of inheriting the installed CLI's own (accept-edits-by-default) config", async () => {
	const f = fakeVibe('text');
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const r = await p.complete([{ role: 'system', content: 'be terse' }, { role: 'user', content: 'hi there' }]);
		assert.equal(r.text, 'the final answer');
		const calls = f.calls();
		assert.equal(calls.length, 1);
		assert.deepEqual(calls[0]!.args, ['-p', '--output', 'text', '--approval-policy', 'ask']);
		assert.match(calls[0]!.stdin, /## System\nbe terse/);
		assert.match(calls[0]!.stdin, /hi there/);
	} finally { f.cleanup(); }
});

test('complete() without a model adds no --model/--thinking flags (the CLI default applies)', async () => {
	const f = fakeVibe('text');
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		await p.complete([{ role: 'user', content: 'hi' }]);
		assert.ok(!f.calls()[0]!.args.includes('--model'));
		assert.ok(!f.calls()[0]!.args.includes('--thinking'));
	} finally { f.cleanup(); }
});

test("completeStructured() parses the last assistant message of the json output and validates it against the schema", async () => {
	const f = fakeVibe('json', JSON.stringify({ answer: 42 }));
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const out = await p.completeStructured<{ answer: number }>([{ role: 'user', content: 'give a number' }], SCHEMA);
		assert.deepEqual(out, { answer: 42 });
		const calls = f.calls();
		assert.equal(calls.length, 1, 'one run when the first answer validates');
		assert.deepEqual(calls[0]!.args, ['-p', '--output', 'json', '--approval-policy', 'ask']);
		assert.match(calls[0]!.stdin, /## Output contract/, 'the schema travels in the prompt');
		assert.match(calls[0]!.stdin, /"required":\["answer"\]/);
	} finally { f.cleanup(); }
});

test('completeStructured() retries with a feedback note when the answer is not valid JSON, then succeeds', async () => {
	const f = fakeVibe('flaky', JSON.stringify({ answer: 7 }));
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const out = await p.completeStructured<{ answer: number }>([{ role: 'user', content: 'give a number' }], SCHEMA);
		assert.deepEqual(out, { answer: 7 });
		const calls = f.calls();
		assert.equal(calls.length, 2, 'a second run after the unparseable first answer');
		assert.match(calls[1]!.stdin, /could not be parsed/, 'the retry carries the feedback note');
	} finally { f.cleanup(); }
});

test('completeStructured() surfaces a stable error after retries are exhausted', async () => {
	const f = fakeVibe('flaky', 'still not json at all');
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		await assert.rejects(
			p.completeStructured([{ role: 'user', content: 'x' }], SCHEMA, { internalRetry: false }),
			/could not be parsed|validation failed/,
		);
		assert.equal(f.calls().length, 1, 'internalRetry:false makes a single attempt');
	} finally { f.cleanup(); }
});

test('runEditSession() runs headless with --auto-approve inside the repo cwd', async () => {
	const f = fakeVibe('text');
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const dir = mkdtempSync(join(tmpdir(), 'insrc-vibe-edit-'));
		try {
			const r = await p.runEditSession('fix the thing', { cwd: dir });
			assert.equal(r.text, 'the final answer');
			const c = f.calls()[0]!;
			assert.deepEqual(c.args, ['-p', '--output', 'text', '--auto-approve']);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	} finally { f.cleanup(); }
});

test("runReadOnlySession() refuses once live qualification against a cold cache cannot confirm it -- the adapter's fail-closed read-only mode (k1)", async () => {
	// Review finding 1: a cold cache now runs the live qualification suite first
	// (qualifyReadOnlyCapability) rather than refusing instantly with zero spawns.
	// This fixture's export.json carries no enabled_tools catalog at all, so every
	// bounded attempt (3, the suite's default) reports unavailable and retries;
	// runReadOnlySession's own startTurn call then refuses on the still-unqualified
	// cache without a 4th spawn of its own.
	const f = fakeVibe('json', JSON.stringify({ verdict: 'holds' }));
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const dir = mkdtempSync(join(tmpdir(), 'insrc-vibe-review-'));
		try {
			const reviewSchema = { type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'], additionalProperties: false } as const;
			await assert.rejects(
				p.runReadOnlySession<{ verdict: string }>('review this', reviewSchema, { cwd: dir, deadlineMs: 30_000 }),
				(err: unknown) => err instanceof VibeReadOnlyUnavailableError,
			);
			assert.equal(f.calls().length, 3, 'the live qualification suite spends its 3 bounded attempts before startTurn refuses on an unqualified cache, spawning no further process of its own');
		} finally { rmSync(dir, { recursive: true, force: true }); }
	} finally { f.cleanup(); }
});

test('a non-zero vibe exit is a VibeTurnError carrying the CLI\'s own stderr text; a transient 503 is retried on a fresh run', async () => {
	const f = fakeVibe('fail');
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		await assert.rejects(p.complete([{ role: 'user', content: 'hi' }]), /service unavailable/);
		// A transient 503 text is retried: three attempts before the error surfaces.
		assert.equal(f.calls().length, 3);
	} finally { f.cleanup(); }
});

test('Vibe structured completion retains strict original nullable semantics without Codex transport decoding', async () => {
	const schema = { type: 'object', required: ['verdict'], additionalProperties: false, properties: { verdict: { type: 'string' }, error: { type: 'string' } } };
	for (const nullable of [false, true]) {
		const input = nullable ? { ...schema, properties: { ...schema.properties, error: { type: ['string', 'null'] } } } : schema;
		const f = fakeVibe('json', JSON.stringify({ verdict: 'holds', error: null }));
		try {
			const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
			const call = () => p.completeStructured([{ role: 'user', content: 'strict review' }], input, { internalRetry: false });
			if (nullable) assert.deepEqual(await call(), { verdict: 'holds', error: null });
			else await assert.rejects(call(), /validation failed/);
		} finally { f.cleanup(); }
	}
});
