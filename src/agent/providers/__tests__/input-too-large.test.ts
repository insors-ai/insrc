/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-aef82b03 S001/t1 — a refusal of the input for its size is recognised
 * (InputTooLargeError, with the sizes the CLI reported) and never resent by the
 * structured retry.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/input-too-large.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { classifyInputTooLarge, cliExitError, CliExitError, InputTooLargeError } from '../cli-provider.js';
import { withStructuredRetry } from '../structured-output.js';

/** The codex refusal of Epic c2ba6fa6 s1's review, as the daemon logged it on 2026-10-18. */
const CODEX_REFUSAL = 'Reading prompt from stdin...\nError: turn/start: turn/start failed: Input exceeds the maximum length of 1048576 characters. (code -32602), data: {"input_error_code":"input_too_large","max_chars":1048576,"actual_chars":1247701}';

test('codex input_too_large becomes an InputTooLargeError with maxChars and actualChars; the message is unchanged', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-too-large-'));
	try {
		const stdout = '{"type":"thread.started","thread_id":"t"}';
		const err = cliExitError('codex', 1, stdout, CODEX_REFUSAL, dir);
		assert.ok(err instanceof InputTooLargeError);
		assert.ok(err instanceof CliExitError, 'still a CliExitError for every existing caller');
		assert.equal(err.maxChars, 1048576);
		assert.equal(err.actualChars, 1247701);
		assert.equal(err.message, `codex exited with 1. stderr=${CODEX_REFUSAL} stdout=${stdout}`, 'the message is the one a CLI failure always had');

		// Any other failure is a plain CliExitError, as before.
		const other = cliExitError('codex', 2, '', 'model not found', dir);
		assert.equal(other instanceof InputTooLargeError, false);
		assert.equal(other.message, 'codex exited with 2. stderr=model not found stdout=');

		// The same refusal inside a re-serialised codex event, and claude's wording.
		assert.deepEqual(classifyInputTooLarge(JSON.stringify({ type: 'error', message: CODEX_REFUSAL })), { maxChars: 1048576, actualChars: 1247701 });
		assert.deepEqual(classifyInputTooLarge('Prompt is too long'), {});
		assert.equal(classifyInputTooLarge('API Error: 500 internal server error'), undefined);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('withStructuredRetry rethrows an InputTooLargeError after one call', async () => {
	let calls = 0;
	const refusal = new InputTooLargeError('codex exited with 1. too large', CODEX_REFUSAL, { maxChars: 1048576, actualChars: 1247701 });
	await assert.rejects(
		withStructuredRetry(async () => { calls++; throw refusal; }, () => ({ ok: true, value: 1 }), 3),
		(e: unknown) => e === refusal,
	);
	assert.equal(calls, 1, 'the oversized prompt is not sent again');

	// Any other thrown error is still retried, as today.
	let other = 0;
	await assert.rejects(withStructuredRetry(async () => { other++; throw new Error('the model returned text'); }, () => ({ ok: true, value: 1 }), 3));
	assert.equal(other, 3);
});
