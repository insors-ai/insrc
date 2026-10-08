/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A CLI that exits with a non-zero code says why, in its own words and in
 * full (ISSUE-7a3ab8dc4b9d39ea). The message used to hold the first 600
 * characters of the CLI's output, which ended before the envelope's `result`:
 * the API's error and the usage-limit sentence were both cut away.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CLI_OUTPUT_INLINE_CHARS, cliFailureMessage, isTransientCliError } from '../cli-provider.js';

/** The envelope the claude CLI wrote for the planner's refused call, with the usage figures ahead of the result. */
function envelope(result: string, padding = 700): string {
	return JSON.stringify({
		type: 'result', subtype: 'success', is_error: true, duration_api_ms: 0,
		usage: { filler: 'u'.repeat(padding) }, terminal_reason: 'api_error',
		result,
	});
}

const SCHEMA_REFUSED = 'API Error: 400 tools.8.custom.input_schema: JSON schema is invalid. It must match JSON Schema draft 2020-12';
const LIMIT = "You've hit your session limit · resets 4:40pm (Asia/Calcutta)";

test("the message of a failed claude call gives the CLI's own error text first and in full, wherever it stands in the output", () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-cli-fail-'));
	try {
		for (const said of [SCHEMA_REFUSED, LIMIT]) {
			const stdout = envelope(said);
			// The result stands after the first 600 characters, where the old message stopped.
			assert.ok(stdout.indexOf(said) > 600);
			const msg = cliFailureMessage('claude', 1, stdout, '', dir);
			assert.ok(msg.startsWith(`claude exited with 1. ${said} `), msg.slice(0, 200));
			// The whole output follows: nothing of it is cut.
			assert.ok(msg.endsWith(`stderr= stdout=${stdout}`));
		}
		assert.deepEqual(readdirSync(dir), [], 'a short output is not written to a file');

		// Output that is not an envelope: all of it, as it is.
		assert.equal(cliFailureMessage('claude', -1, '', '\nspawn error: spawn claude ENOENT', dir), 'claude exited with -1. stderr=\nspawn error: spawn claude ENOENT stdout=');
		assert.equal(cliFailureMessage('codex', 2, '', 'boom', dir), 'codex exited with 2. stderr=boom stdout=');
		// An envelope with no result text adds nothing of its own.
		assert.equal(cliFailureMessage('claude', 1, '{"is_error":true}', 'x', dir), 'claude exited with 1. stderr=x stdout={"is_error":true}');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a long CLI output is written whole to a file the message names, and is never cut', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-cli-fail-'));
	try {
		const stdout = envelope(SCHEMA_REFUSED, 50_000);
		const stderr = 'e'.repeat(3_000);
		const msg = cliFailureMessage('claude', 1, stdout, stderr, dir);

		const files = readdirSync(dir);
		assert.equal(files.length, 1);
		const path = join(dir, files[0]!);
		// The cause is still in the message itself; the output is in the file.
		assert.equal(msg, `claude exited with 1. ${SCHEMA_REFUSED} The CLI's full output (${`stderr=${stderr} stdout=${stdout}`.length} characters, nothing cut) is in ${path}`);
		assert.ok(msg.length < 600, 'the message stays short');
		assert.equal(readFileSync(path, 'utf8'), `--- stderr ---\n${stderr}\n--- stdout ---\n${stdout}\n`);

		// At the limit the output stays in the message; one character more and it goes to a file.
		const fit = 's'.repeat(CLI_OUTPUT_INLINE_CHARS - 'stderr= stdout='.length);
		assert.equal(cliFailureMessage('codex', 3, fit, '', dir), `codex exited with 3. stderr= stdout=${fit}`);
		assert.equal(readdirSync(dir).length, 1);
		assert.match(cliFailureMessage('codex', 3, `${fit}s`, '', dir), /^codex exited with 3\. The CLI's full output \(2001 characters, nothing cut\) is in /);
		assert.equal(readdirSync(dir).length, 2);

		// The file cannot be written (its directory is a file): the whole output stays in the message.
		const notADir = join(dir, 'plain-file');
		writeFileSync(notADir, 'x');
		const kept = cliFailureMessage('claude', 1, stdout, stderr, join(notADir, 'sub'));
		assert.equal(kept, `claude exited with 1. ${SCHEMA_REFUSED} stderr=${stderr} stdout=${stdout}`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the API's refusal of a request is not retried as transient; an overloaded or rate-limited call still is", () => {
	const refused = cliFailureMessage('claude', 1, envelope(SCHEMA_REFUSED), '');
	assert.equal(isTransientCliError(refused), false, 'a 400 is the same on every attempt');
	for (const code of [401, 403, 404, 422]) {
		assert.equal(isTransientCliError(`claude exited with 1. API Error: ${code} no`), false, String(code));
	}
	for (const said of ['API Error: 429 too many requests', 'API Error: 408 request timeout', 'API Error: 529 Overloaded', 'API Error: 500 internal', 'API Error: Connection closed mid-response', 'overloaded']) {
		assert.equal(isTransientCliError(`claude exited with 1. ${said}`), true, said);
	}
});
