/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-aef82b03 S001/t1 — through the real provider: a size refusal on any CLI
 * failure path (a codex error event, a codex non-zero exit, a claude is_error
 * envelope) surfaces as an InputTooLargeError from completeStructured after the
 * CLI ran once, even when its text also reads as transient. Fake CLIs stand in
 * for claude and codex, counting their runs.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/input-too-large-cli.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CliProvider, InputTooLargeError, isTransientCliError } from '../cli-provider.js';

const CODEX_REFUSAL = 'Error: turn/start: turn/start failed: Input exceeds the maximum length of 1048576 characters. (code -32602), data: {"input_error_code":"input_too_large","max_chars":1048576,"actual_chars":1247701}';
const SCHEMA = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } };

/** A fake CLI: reads its prompt, counts the run, prints `stdout`, `stderr`, exits `code`. */
function fakeCli(dir: string, name: string, stdout: string, stderrText: string, code: number): { bin: string; runs: () => number } {
	const out = join(dir, `${name}.out`), err = join(dir, `${name}.err`), spawns = join(dir, `${name}.spawns`);
	writeFileSync(out, stdout);
	writeFileSync(err, stderrText);
	const bin = join(dir, name);
	writeFileSync(bin, `#!/bin/sh\ncat > /dev/null\necho x >> "${spawns}"\ncat "${out}"\ncat "${err}" >&2\nexit ${code}\n`);
	chmodSync(bin, 0o755);
	return { bin, runs: () => existsSync(spawns) ? readFileSync(spawns, 'utf8').trim().split('\n').length : 0 };
}

async function refusalOf(p: CliProvider): Promise<unknown> {
	return p.completeStructured([{ role: 'user', content: 'review this' }], SCHEMA as never).then(() => null, (e: unknown) => e);
}

test('a fake codex emitting an input_too_large error event, or exiting non-zero with it on stderr, and a fake claude returning an is_error Prompt is too long envelope each surface an InputTooLargeError from completeStructured after one run', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-too-large-cli-'));
	try {
		const event = fakeCli(dir, 'codex-event', `${JSON.stringify({ type: 'thread.started' })}\n${JSON.stringify({ type: 'error', message: CODEX_REFUSAL })}\n`, '', 1);
		const exit = fakeCli(dir, 'codex-exit', JSON.stringify({ type: 'thread.started' }), CODEX_REFUSAL, 1);
		const claude = fakeCli(dir, 'claude-envelope', JSON.stringify({ type: 'result', is_error: true, result: 'Prompt is too long' }), '', 0);
		// A generic first error event does not hide the refusal in a later event, or on stderr.
		const generic = JSON.stringify({ type: 'error', message: 'turn/start failed' });
		const later = fakeCli(dir, 'codex-later-event', `${generic}\n${JSON.stringify({ type: 'turn.failed', error: { message: CODEX_REFUSAL } })}\n`, '', 1);
		const behind = fakeCli(dir, 'codex-event-and-stderr', `${generic}\n`, CODEX_REFUSAL, 1);
		for (const [fake, kind] of [[event, 'codex'], [exit, 'codex'], [claude, 'claude'], [later, 'codex'], [behind, 'codex']] as const) {
			const err = await refusalOf(new CliProvider({ kind, model: 'm', binPath: fake.bin }));
			assert.ok(err instanceof InputTooLargeError, `${fake.bin}: got ${String(err)}`);
			assert.equal(fake.runs(), 1, `${fake.bin}: the CLI ran once`);
			if (kind === 'codex') {
				assert.equal(err.maxChars, 1048576);
				assert.equal(err.actualChars, 1247701);
			}
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a size refusal whose text also matches the transient classifier (API Error: Prompt is too long) runs the CLI once', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-too-large-transient-'));
	try {
		const said = 'API Error: Prompt is too long';
		assert.equal(isTransientCliError(said), true, 'the text alone would be retried as transient');
		const claude = fakeCli(dir, 'claude-transient', JSON.stringify({ type: 'result', is_error: true, result: said }), '', 1);
		const err = await refusalOf(new CliProvider({ kind: 'claude', model: 'm', binPath: claude.bin }));
		assert.ok(err instanceof InputTooLargeError, `got ${String(err)}`);
		assert.equal(claude.runs(), 1, 'the CLI ran once: not retried as transient');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
