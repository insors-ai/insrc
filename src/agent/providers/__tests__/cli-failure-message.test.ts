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
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	CLI_FAILURE_FILE_MAX_AGE_MS,
	CLI_OUTPUT_INLINE_CHARS,
	cliExitError,
	CliExitError,
	cliFailureMessage,
	CliProvider,
	isTransientCliError,
	transienceText,
} from '../cli-provider.js';

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

test('a long output with no envelope keeps the error output in the message, and the file is private and old files are removed', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-cli-fail-'));
	try {
		// codex writes JSON lines, not an envelope: its error output is the only statement of the cause.
		const stdout = '{"type":"item.completed"}\n'.repeat(400);
		const err = cliExitError('codex', 1, stdout, 'stream error: rate limit exceeded', dir);
		const [file] = readdirSync(dir);
		const path = join(dir, file!);
		assert.equal(err.message, `codex exited with 1. stderr=stream error: rate limit exceeded The CLI's full output (${`stderr=stream error: rate limit exceeded stdout=${stdout}`.length} characters, nothing cut) is in ${path}`);
		assert.equal(err.said, 'stream error: rate limit exceeded');
		assert.equal(isTransientCliError(transienceText(err)), true, 'a rate limit on the error output is still retried');

		// Only the owner can read the file, and a directory this code creates.
		assert.equal(statSync(path).mode & 0o777, 0o600);
		const created = join(dir, 'made-here');
		cliExitError('codex', 1, stdout, '', created);
		assert.equal(statSync(created).mode & 0o777, 0o700);
		rmSync(created, { recursive: true, force: true });

		// A file of an earlier failure past the age limit is removed by the next write; a recent one and a foreign file stay.
		const old = join(dir, 'claude-exit-old.txt');
		const recent = join(dir, 'codex-exit-recent.txt');
		const foreign = join(dir, 'notes.txt');
		for (const f of [old, recent, foreign]) writeFileSync(f, 'x');
		const past = new Date(Date.now() - CLI_FAILURE_FILE_MAX_AGE_MS - 60_000);
		utimesSync(old, past, past);
		utimesSync(foreign, past, past);
		cliExitError('codex', 1, stdout, '', dir);
		assert.equal(existsSync(old), false);
		assert.equal(existsSync(recent), true);
		assert.equal(existsSync(foreign), true, 'a file this code did not write is left alone');
		assert.equal(existsSync(path), true);

		// An error output too long for the message is in the file, not cut into the message.
		const longErr = 'e'.repeat(CLI_OUTPUT_INLINE_CHARS + 1);
		const both = cliExitError('codex', 1, stdout, longErr, dir);
		assert.match(both.message, /^codex exited with 1\. The CLI's full output \(\d+ characters, nothing cut\) is in /);
		assert.equal(both.said, longErr);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('whether a failure is retried is decided on what the CLI said, not on figures elsewhere in its output', () => {
	// The envelope's usage figures hold numbers that look like status codes.
	const stdout = JSON.stringify({ is_error: true, usage: { input_tokens: 500, output_tokens: 429 }, duration_ms: 503, result: LIMIT });
	const err = cliExitError('claude', 1, stdout, '');
	assert.ok(err instanceof CliExitError);
	assert.equal(err.said, LIMIT);
	assert.equal(isTransientCliError(err.message), true, 'the whole message would be misread as transient');
	assert.equal(isTransientCliError(transienceText(err)), false, 'a usage limit is not retried');

	// A transient reason the CLI states is still retried.
	const overloaded = cliExitError('claude', 1, JSON.stringify({ is_error: true, result: 'API Error: 529 Overloaded' }), '');
	assert.equal(isTransientCliError(transienceText(overloaded)), true);
	// With nothing said, the message is all there is to judge on.
	const silent = cliExitError('claude', -9, '', '');
	assert.equal(transienceText(silent), 'claude exited with -9. stderr= stdout=');
	assert.equal(transienceText(new Error('plain')), 'plain');
});

test('the provider itself throws that error for a claude and a codex CLI that exit non-zero, once, with a long output in the default directory', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-cli-fake-'));
	const written: string[] = [];
	try {
		const spawns = join(dir, 'spawns');
		// A stand-in CLI: reads its prompt, counts the call, writes an envelope whose result follows 3,000 characters of usage, exits 1.
		const fake = (name: string, stdout: string, stderrText: string): string => {
			const out = join(dir, `${name}.out`);
			writeFileSync(out, stdout);
			const bin = join(dir, name);
			writeFileSync(bin, `#!/bin/sh\ncat > /dev/null\necho x >> "${spawns}"\ncat "${out}"\nprintf '%s' "${stderrText}" >&2\nexit 1\n`);
			chmodSync(bin, 0o755);
			return bin;
		};
		const claudeOut = envelope(SCHEMA_REFUSED, 3_000);
		const claude = new CliProvider({ kind: 'claude', model: 'm', binPath: fake('claude', claudeOut, '') });
		const claudeErr = await claude.complete([{ role: 'user', content: 'hi' }]).then(() => null, (e: unknown) => e);
		assert.ok(claudeErr instanceof CliExitError, `got ${String(claudeErr)}`);
		assert.equal(claudeErr.said, SCHEMA_REFUSED);
		const m = /^claude exited with 1\. (.*) The CLI's full output \((\d+) characters, nothing cut\) is in (.+)$/s.exec(claudeErr.message);
		assert.ok(m !== null, claudeErr.message.slice(0, 300));
		assert.equal(m[1], SCHEMA_REFUSED);
		written.push(m[3]!);
		// The default directory, and the whole output in the file.
		assert.equal(m[3]!.startsWith(join(tmpdir(), 'insrc-cli-failures')), true);
		assert.ok(readFileSync(m[3]!, 'utf8').includes(claudeOut.trim()));
		// A refused request is not retried: the CLI was started once.
		assert.equal(readFileSync(spawns, 'utf8').trim().split('\n').length, 1);

		// A usage limit, in an envelope whose figures look like status codes: said once, not retried.
		rmSync(spawns, { force: true });
		const limited = JSON.stringify({ is_error: true, usage: { input_tokens: 500, output_tokens: 429 }, duration_ms: 503, result: LIMIT });
		const atLimit = new CliProvider({ kind: 'claude', model: 'm', binPath: fake('claude-limit', limited, '') });
		const limitErr = await atLimit.complete([{ role: 'user', content: 'hi' }]).then(() => null, (e: unknown) => e);
		assert.ok(limitErr instanceof CliExitError);
		assert.equal(limitErr.said, LIMIT);
		assert.ok(limitErr.message.startsWith(`claude exited with 1. ${LIMIT} `));
		assert.equal(readFileSync(spawns, 'utf8').trim().split('\n').length, 1, 'the CLI was started once');

		rmSync(spawns, { force: true });
		const codex = new CliProvider({ kind: 'codex', model: 'm', binPath: fake('codex', '{"type":"thread.started"}', 'model not found') });
		const codexErr = await codex.complete([{ role: 'user', content: 'hi' }]).then(() => null, (e: unknown) => e);
		assert.ok(codexErr instanceof CliExitError, `got ${String(codexErr)}`);
		assert.equal(codexErr.said, 'model not found');
		assert.match(codexErr.message, /^codex exited with 1\. stderr=model not found stdout=\{"type":"thread\.started"\}/);
		assert.equal(readFileSync(spawns, 'utf8').trim().split('\n').length, 1);
	} finally {
		for (const f of written) rmSync(f, { force: true });
		rmSync(dir, { recursive: true, force: true });
	}
});
