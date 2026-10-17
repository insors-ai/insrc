/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the classified, timed gh runner and the GitHub adapter built on it.
 * Everything runs against a fake exec seam — no gh, no network.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/github-adapter.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { GH_TIMEOUT_MS, GhCommandError, ghCreateIssueTyped, ghGetIssueBody, runGh, _setTrackerExecForTests } from '../github.js';

afterEach(() => _setTrackerExecForTests());

function execError(props: Record<string, unknown>, message = 'Command failed'): Error {
	return Object.assign(new Error(message), props);
}

function failWith(err: Error): void {
	_setTrackerExecForTests(() => { throw err; });
}

function kindOf(fn: () => unknown): GhCommandError {
	try { fn(); } catch (e) {
		assert.ok(e instanceof GhCommandError, `expected GhCommandError, got ${String(e)}`);
		return e;
	}
	assert.fail('expected runGh to throw');
}

// ---------------------------------------------------------------------------
// runGh
// ---------------------------------------------------------------------------

test('runGh classifies ENOENT, authentication failure, timeout and other failures', () => {
	failWith(execError({ code: 'ENOENT' }, 'spawnSync gh ENOENT'));
	const missingTool = kindOf(() => runGh(['api', 'user']));
	assert.equal(missingTool.kind, 'missing-tool');
	assert.match(missingTool.reason, /gh CLI is not installed/);

	failWith(execError({ stderr: 'You are not logged in to any GitHub hosts. Run gh auth login to authenticate.' }));
	const signin = kindOf(() => runGh(['api', 'user']));
	assert.equal(signin.kind, 'missing-signin');
	assert.match(signin.reason, /gh auth login/);

	failWith(execError({ code: 'ETIMEDOUT' }));
	assert.equal(kindOf(() => runGh(['api', 'user'])).kind, 'unreachable');

	failWith(execError({ killed: true, signal: 'SIGTERM' }));
	const killed = kindOf(() => runGh(['api', 'user']));
	assert.equal(killed.kind, 'unreachable');
	assert.match(killed.reason, /timed out after 10 s/);

	// Only a timeout is 'unreachable'; any other failure (a network error included)
	// is 'rejected' and carries gh's own message.
	failWith(execError({ stderr: 'dial tcp: lookup api.github.com: could not resolve host' }));
	const network = kindOf(() => runGh(['api', 'user']));
	assert.equal(network.kind, 'rejected');
	assert.match(network.reason, /could not resolve host/);

	failWith(execError({ stderr: 'HTTP 422: Validation Failed' }));
	const other = kindOf(() => runGh(['api', 'user']));
	assert.equal(other.kind, 'rejected');
	assert.equal(other.reason, 'HTTP 422: Validation Failed');
	assert.equal(other.message, other.reason);
});

test('runGh passes the 10 s timeout option to the exec seam', () => {
	const seen: Array<{ cmd: string; args: readonly string[]; opts: Record<string, unknown> | undefined }> = [];
	_setTrackerExecForTests((cmd, args, opts) => {
		seen.push({ cmd, args, opts: opts as Record<string, unknown> | undefined });
		return ' octo \n';
	});

	assert.equal(GH_TIMEOUT_MS, 10_000);
	assert.equal(runGh(['api', 'user', '-q', '.login']), 'octo');
	assert.equal(runGh(['issue', 'close', '1'], { discardOutput: true }), '');

	assert.equal(seen.length, 2);
	assert.equal(seen[0]?.cmd, 'gh');
	assert.deepEqual(seen[0]?.args, ['api', 'user', '-q', '.login']);
	assert.equal(seen[0]?.opts?.['timeout'], 10_000);
	assert.equal(seen[0]?.opts?.['encoding'], 'utf8');
	assert.equal(seen[1]?.opts?.['timeout'], 10_000);
	assert.deepEqual(seen[1]?.opts?.['stdio'], ['ignore', 'ignore', 'pipe']);
});

// ---------------------------------------------------------------------------
// Migrated wrappers (compatibility exceptions 1 and 2)
// ---------------------------------------------------------------------------

const hasType = (args: readonly string[]): boolean => args.some(a => a.startsWith('type='));

test('compatibility exception 1, a failed typed create is not retried untyped unless the type is rejected', () => {
	const failures: Array<[string, Error]> = [
		['timeout', execError({ code: 'ETIMEDOUT' })],
		['missing tool', execError({ code: 'ENOENT' })],
		['missing sign-in', execError({ stderr: 'gh auth login required' })],
		['non-type rejection', execError({ stderr: 'HTTP 403: Resource not accessible' })],
		['422 about an unknown type elsewhere', execError({ stderr: 'HTTP 422: Validation Failed: labels has unknown type' })],
		['422 about another field', execError({ stderr: 'HTTP 422: Validation Failed: title must be of type string' })],
	];
	for (const [label, err] of failures) {
		let posts = 0;
		_setTrackerExecForTests((_cmd, args) => { if (args.includes('POST')) posts += 1; throw err; });
		assert.throws(() => ghCreateIssueTyped('o', 'r', 't', 'b', ['x'], 'Task'), GhCommandError, label);
		assert.equal(posts, 1, `${label}: exactly one POST`);
	}
});

test('a typed create rejected as an unknown issue type is retried once untyped and reports typed false', () => {
	for (const stderr of ['HTTP 422: Validation Failed: issue type not enabled', 'HTTP 422: Unprocessable Entity: unknown issue type "Task"']) {
		const seen: boolean[] = [];
		_setTrackerExecForTests((_cmd, args) => {
			seen.push(hasType(args));
			if (hasType(args)) throw execError({ stderr });
			return JSON.stringify({ number: 7, id: 700 });
		});
		const r = ghCreateIssueTyped('o', 'r', 't', 'b', ['x'], 'Task');
		assert.deepEqual(seen, [true, false], stderr);
		assert.equal(r.typed, false);
		assert.equal(r.id, 700);
	}
});

test('compatibility exception 2, a migrated operation passes the 10 s timeout and a timeout is reported as unreachable', () => {
	let opts: Record<string, unknown> | undefined;
	_setTrackerExecForTests((_cmd, _args, o) => { opts = o as Record<string, unknown> | undefined; throw execError({ code: 'ETIMEDOUT' }); });
	assert.equal(kindOf(() => ghGetIssueBody('o', 'r', 'o/r#1')).kind, 'unreachable');
	assert.equal(opts?.['timeout'], GH_TIMEOUT_MS);
});
