/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t5: the backend's vibe call sites
 * (complete / completeStructuredVibe / readOnlySessionOnce) rewired onto the
 * adapter, runVibe/vibeArgs deleted. Driven against a scripted fake `vibe`
 * binary matching the real installed binary's own output shapes (confirmed
 * live during t2) -- no app-server transport.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/cli-provider-vibe-adapter.test.ts
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider } from '../cli-provider.js';
import { VibeReadOnlyUnavailableError } from '../../../shared/vibe-adapter.js';

/**
 * A fake `vibe`: records every invocation (argv, stdin) as a JSON line in
 * <dir>/calls.jsonl, writes export.json to --output-dir, then behaves per
 * <dir>/mode:
 *   text               — prints plain text, exit 0
 *   json               — prints the real journal-entry array shape, exit 0
 *   json-bad           — prints a journal array whose assistant text is NOT
 *                        valid JSON, exit 0 (every attempt)
 *   no-assistant       — prints a journal array with NO assistant message at
 *                        all (just the echoed user turn), exit 0
 *   transient-then-ok  — exit 2 with a transient-looking stderr on the FIRST
 *                        invocation, succeed (text) from the second on
 *   deterministic-fail — exit 1 with a non-transient stderr, every time
 */
const FAKE = `#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let stdin = '';
for await (const c of process.stdin) stdin += c;
const args = process.argv.slice(2);
appendFileSync(join(here, 'calls.jsonl'), JSON.stringify({ args, stdin }) + '\\n');
const calls = readFileSync(join(here, 'calls.jsonl'), 'utf8').trim().split('\\n').length;
const mode = readFileSync(join(here, 'mode'), 'utf8').trim();
const outputDirIdx = args.indexOf('--output-dir');
const outputDir = outputDirIdx >= 0 ? args[outputDirIdx + 1] : undefined;
if (outputDir !== undefined) { mkdirSync(outputDir, { recursive: true }); writeFileSync(join(outputDir, 'export.json'), JSON.stringify({ outcome: 'finished', stop_reason: null, config: {} })); }
function assistantEntry(text) {
  return { sessionId: 'fixture-session', type: 'message', role: 'assistant', content: [{ type: 'text', text }] };
}
if (mode === 'transient-then-ok') {
  if (calls === 1) { process.stderr.write('API Error: 503 service unavailable\\n'); process.exit(2); }
  process.stdout.write('OK\\n');
  process.exit(0);
}
if (mode === 'deterministic-fail') {
  process.stderr.write('Error: invalid request\\n');
  process.exit(1);
}
if (mode === 'json-bad') {
  process.stdout.write(JSON.stringify([assistantEntry('not valid json {{{')]));
  process.exit(0);
}
if (mode === 'no-assistant') {
  process.stdout.write(JSON.stringify([{ sessionId: 'fixture-session', type: 'message', role: 'user', content: [{ type: 'text', text: 'q' }] }]));
  process.exit(0);
}
if (mode === 'json') {
  process.stdout.write(JSON.stringify([assistantEntry('{"ok":true}')]));
  process.exit(0);
}
process.stdout.write('plain text answer\\n');
process.exit(0);
`;

function makeFakeVibe(mode: string): { readonly dir: string; readonly bin: string; readonly calls: () => Array<{ args: readonly string[]; stdin: string }> } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-vibe-adapter-'));
	const bin = join(dir, 'vibe');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	writeFileSync(join(dir, 'mode'), mode);
	writeFileSync(join(dir, 'calls.jsonl'), '');
	return {
		dir, bin,
		calls: () => readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as { args: readonly string[]; stdin: string }),
	};
}

test("provider.complete for kind 'vibe' builds a single VibeTurnRequest and consumes the adapter -- no private argv path remains", () => {
	const source = readFileSync(join(import.meta.dirname, '..', 'cli-provider.ts'), 'utf8');
	assert.doesNotMatch(source, /\bvibeArgs\(/);
	assert.doesNotMatch(source, /\brunVibe\(/);
	assert.match(source, /createVibeAdapter/);
});

test("the backend vibe request path spawns exactly one subprocess per turn through the adapter", async () => {
	const fixture = makeFakeVibe('text');
	try {
		const provider = new CliProvider({ kind: 'vibe', binPath: fixture.bin, timeoutMs: 10_000 });
		const result = await provider.complete([{ role: 'user', content: 'hello' }]);
		assert.equal(result.text, 'plain text answer');
		assert.equal(fixture.calls().length, 1);
	} finally {
		rmSync(fixture.dir, { recursive: true, force: true });
	}
});

// The LLD's own acceptance wording for this test named "two attempts" and a
// typed ModelResponseShapeError; neither held even before this Story (verified
// against cli-provider.ts as it stood immediately before t5's rewire, commit
// 82ae9340e~1: withStructuredRetry's own maxAttempts arg here was already
// `opts?.internalRetry === false ? 1 : 3`, byte-identical, and its own
// exhaustion path -- structured-output.ts, a file this Story never touches --
// has only ever thrown a generic Error, never ModelResponseShapeError (that
// class is thrown elsewhere, by validateAgainstSchema's own caller in
// cli-provider.ts and by review-round/security-schema.ts, never by
// withStructuredRetry's exhaustion branch). Review finding r2-4 renamed this
// test to describe the real, pre-existing, verified-unrelated-to-this-Story
// behavior instead of the LLD's inaccurate original title.
test('completeStructuredVibe keeps the local three-attempt ajv validation loop (the pre-existing, unchanged internalRetry bound) -- a first invalid answer retries, exhaustion raises a generic Error naming every attempt\'s validation errors', async () => {
	const fixture = makeFakeVibe('json-bad');
	try {
		const provider = new CliProvider({ kind: 'vibe', binPath: fixture.bin, timeoutMs: 10_000 });
		await assert.rejects(
			provider.completeStructured([{ role: 'user', content: 'hello' }], { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }),
			(err: unknown) => err instanceof Error && err.name !== 'ModelResponseShapeError' && /validation failed after 3 attempts/.test(err.message),
		);
		assert.equal(fixture.calls().length, 3, 'the default internal retry bound (3 attempts)');
	} finally {
		rmSync(fixture.dir, { recursive: true, force: true });
	}
});

test('the schema note rides the prompt -- the prompt passed to the spawn seam contains the output contract', async () => {
	const fixture = makeFakeVibe('json');
	try {
		const provider = new CliProvider({ kind: 'vibe', binPath: fixture.bin, timeoutMs: 10_000 });
		await provider.completeStructured([{ role: 'user', content: 'hello' }], { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] });
		assert.match(fixture.calls()[0]?.stdin ?? '', /## Output contract/);
	} finally {
		rmSync(fixture.dir, { recursive: true, force: true });
	}
});

test('withTransientRetry still wraps every vibe path -- a transient error text retries a fresh invocation, a deterministic failure re-throws on attempt 1, bounded at the existing max', async () => {
	const transient = makeFakeVibe('transient-then-ok');
	try {
		const provider = new CliProvider({ kind: 'vibe', binPath: transient.bin, timeoutMs: 10_000 });
		const result = await provider.complete([{ role: 'user', content: 'hello' }]);
		assert.equal(result.text, 'OK');
		assert.equal(transient.calls().length, 2, 'retried once after the transient failure');
	} finally {
		rmSync(transient.dir, { recursive: true, force: true });
	}
	const deterministic = makeFakeVibe('deterministic-fail');
	try {
		const provider = new CliProvider({ kind: 'vibe', binPath: deterministic.bin, timeoutMs: 10_000 });
		await assert.rejects(provider.complete([{ role: 'user', content: 'hello' }]));
		assert.equal(deterministic.calls().length, 1, 'a deterministic failure is never retried');
	} finally {
		rmSync(deterministic.dir, { recursive: true, force: true });
	}
});

test("readOnlySessionOnce's request uses the adapter's sc2 allowlist and is refused once live qualification against a cold cache cannot confirm it, with the same ReadOnlyUnavailableError-shaped surfaced reason as today's refusal", async () => {
	// Review finding 1: a cold cache must no longer refuse instantly with zero
	// spawns -- readOnlySessionOnce now runs the live qualification suite first
	// (qualifyReadOnlyCapability), bounded by this call's own deadline. This
	// fixture's export.json carries no enabled_tools catalog at all, so every
	// bounded attempt (3, the suite's default) reports unavailable and retries;
	// startTurn then refuses on the still-unqualified cache without a 4th spawn.
	const fixture = makeFakeVibe('json');
	try {
		const provider = new CliProvider({ kind: 'vibe', binPath: fixture.bin, timeoutMs: 10_000 });
		await assert.rejects(
			provider.runReadOnlySession('hello', { type: 'object', properties: {} }, { cwd: fixture.dir, deadlineMs: 10_000 }),
			(err: unknown) => err instanceof VibeReadOnlyUnavailableError,
		);
		assert.equal(fixture.calls().length, 3, 'the live qualification suite spends its 3 bounded attempts before startTurn refuses on an unqualified cache, spawning no further process of its own');
	} finally {
		rmSync(fixture.dir, { recursive: true, force: true });
	}
});

test('a successfully-exited process whose json output carries no assistant message at all is a retryable validation failure, not an immediate VibeTurnError refusal (review finding 6)', async () => {
	const f = makeFakeVibe('no-assistant');
	try {
		const provider = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		await assert.rejects(
			provider.completeStructured([{ role: 'user', content: 'give a number' }], { type: 'object', properties: { answer: { type: 'number' } }, required: ['answer'] }),
			(err: unknown) => err instanceof Error && err.name !== 'VibeTurnError' && /validation failed after 3 attempts/.test(err.message),
		);
		assert.equal(f.calls().length, 3, 'the extraction-phase failure got the full retry budget, exactly like a shape/content error');
	} finally {
		rmSync(f.dir, { recursive: true, force: true });
	}
});

test("an edit session's dispatch-uncertain failure is never replayed against the (possibly already-mutated) checkout, even when the failure text LOOKS transient; a read/generate-only call's same-looking failure still retries (review finding 3)", async () => {
	// 'transient-then-ok' would SUCCEED on a second attempt -- calls().length
	// staying at 1 (not 2, and the rejection standing) proves the edit session's
	// own uncertain-dispatch guard blocked the replay, not mere bad luck.
	const edit = makeFakeVibe('transient-then-ok');
	try {
		const provider = new CliProvider({ kind: 'vibe', binPath: edit.bin, timeoutMs: 10_000 });
		await assert.rejects(provider.runEditSession('fix the thing', { cwd: edit.dir }));
		assert.equal(edit.calls().length, 1, 'an edit session never replays once dispatch is uncertain, even for a transient-looking message');
	} finally {
		rmSync(edit.dir, { recursive: true, force: true });
	}
	const read = makeFakeVibe('transient-then-ok');
	try {
		const provider = new CliProvider({ kind: 'vibe', binPath: read.bin, timeoutMs: 10_000 });
		const result = await provider.complete([{ role: 'user', content: 'hi' }]);
		assert.equal(result.text, 'OK');
		assert.equal(read.calls().length, 2, 'a read/generate-only call (no approval) still retries the same-looking transient failure');
	} finally {
		rmSync(read.dir, { recursive: true, force: true });
	}
});
