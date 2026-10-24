/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Typed failures of the git tools (Story s4, task t1): the failure kind of every failed result,
 * the legacy output and error text, and the registration net.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runShell } from '../../../shell-helper.js';
import type { ShellResult } from '../../../shell-helper.js';
import type { Tool, ToolDeps, ToolResult } from '../../../types.js';
import { fail, failureKind, rejectInput, spawnFail, UNKNOWN_OUTCOME, withFailure, withFailureNet } from '../helpers.js';
import { gitMergeTool } from '../merge.js';
import { gitStatusTool } from '../status.js';

const shell = (over: Partial<ShellResult> = {}): ShellResult =>
	({ stdout: '', stderr: '', code: 1, spawnError: false, timedOut: false, stdoutTruncated: false, ...over });

function git(repo: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function newRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gitfail-'));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'user.email', 't@example.com');
	git(repo, 'config', 'user.name', 't');
	git(repo, 'config', 'commit.gpgsign', 'false');
	return repo;
}

const deps = (repo: string): ToolDeps => ({ sessionId: 'test', repoPath: repo, send: () => {}, requestId: 0 });

test('spawnFail and fail return the failure kind from the process outcome and git\'s message and keep output, format, success and error', () => {
	const sp = spawnFail('git_x', ' ENOENT ');
	assert.equal(sp.output, '[git_x] cannot spawn git -- ENOENT');
	assert.equal(sp.error, 'git not found');
	assert.equal(sp.format, 'text');
	assert.equal(sp.success, false);
	assert.equal(sp.failure?.kind, 'missing-tool');

	const f = fail('git_x', shell({ stderr: 'fatal: bad\n' }));
	assert.equal(f.output, '[git_x] failed: fatal: bad');
	assert.equal(f.error, 'fatal: bad');
	assert.equal(f.format, 'text');
	assert.equal(f.success, false);
	assert.deepEqual(f.failure, { kind: 'rejected', message: 'fatal: bad', original: 'fatal: bad' });

	assert.equal(fail('git_x', shell({ stderr: '', stdout: '', code: 3 })).error, 'exit 3');
	assert.equal(fail('git_push', shell({ stderr: 'fatal: Authentication failed for x' }), { network: true }).failure?.kind, 'missing-signin');
	assert.equal(fail('git_fetch', shell({ stderr: 'fatal: unable to access x: Could not resolve host: h' }), { network: true }).failure?.kind, 'unreachable');
	// the same text from a local command is just a rejection
	assert.equal(fail('git_log', shell({ stderr: 'fatal: Authentication failed' })).failure?.kind, 'rejected');
});

test('failureKind maps a ShellResult to missing-tool, timed-out, missing-signin, unreachable or rejected, and withFailure leaves output, format, success, error and data untouched', () => {
	assert.equal(failureKind(shell({ spawnError: true, code: null })), 'missing-tool');
	assert.equal(failureKind(shell({ timedOut: true, code: null })), 'timed-out');
	assert.equal(failureKind(shell({ stderr: 'fatal: nope' })), 'rejected');
	assert.equal(failureKind(shell({ stderr: 'Permission denied (publickey).' }), { network: true }), 'missing-signin');
	assert.equal(failureKind(shell({ stderr: 'fatal: Could not resolve host' }), { network: true }), 'unreachable');
	// a timeout wins over a message
	assert.equal(failureKind(shell({ timedOut: true, stderr: 'Authentication failed' }), { network: true }), 'timed-out');

	const legacy: ToolResult = { output: 'o', format: 'markdown', success: false, error: 'e', data: { a: 1 } };
	const r = withFailure(legacy, 'rejected', 'orig');
	assert.equal(r.output, 'o'); assert.equal(r.format, 'markdown'); assert.equal(r.success, false);
	assert.equal(r.error, 'e'); assert.deepEqual(r.data, { a: 1 });
	assert.deepEqual(r.failure, { kind: 'rejected', message: 'e', original: 'orig' });
	assert.equal(legacy.failure, undefined, 'the input result is not changed');
	assert.equal(withFailure(legacy, 'timed-out', undefined, 'm').failure?.message, 'm');
});

test('the registration wrapper adds kind rejected to an unsuccessful result without a failure and leaves a set failure untouched', async () => {
	const make = (result: ToolResult): Tool => ({
		id: 'git_fake', description: 'd', inputSchema: { type: 'object' },
		async execute() { return result; },
	});
	const bare = await withFailureNet(make({ output: 'x', format: 'text', success: false, error: 'boom' })).execute({}, deps('/tmp'));
	assert.deepEqual(bare.failure, { kind: 'rejected', message: 'boom' });
	assert.equal(bare.output, 'x');

	const set = withFailure({ output: 'x', format: 'text', success: false, error: 'boom' }, 'timed-out');
	assert.equal((await withFailureNet(make(set)).execute({}, deps('/tmp'))).failure?.kind, 'timed-out');

	const ok: ToolResult = { output: 'fine', format: 'text', success: true };
	assert.equal(await withFailureNet(make(ok)).execute({}, deps('/tmp')), ok);
});

test('the legacy output and error text of every existing failure path is unchanged', async () => {
	assert.equal(rejectInput('git_branch', 'missing name for create').output, '[git_branch] failed: missing name for create');
	assert.equal(rejectInput('git_branch', 'missing name for create').error, 'missing name for create');
	assert.equal(rejectInput('git_branch', 'x').failure?.kind, 'rejected');

	const dir = mkdtempSync(join(tmpdir(), 'insrc-gitfail-nogit-'));
	try {
		const res = await gitStatusTool.execute({ cwd: dir }, deps(dir));
		assert.equal(res.success, false);
		assert.match(res.output, /^\[git:status\] failed: .*not a git repository/i);
		assert.equal(res.output, `[git:status] failed: ${res.error}`);
		assert.equal(res.format, 'text');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a git tool in a directory that is not a repository, with git missing from PATH, and past its time limit returns a failure of the right kind', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gitfail-nogit-'));
	try {
		const notRepo = await gitStatusTool.execute({ cwd: dir }, deps(dir));
		assert.equal(notRepo.failure?.kind, 'rejected');

		const savedPath = process.env['PATH'];
		process.env['PATH'] = join(dir, 'nowhere');
		try {
			const noGit = await gitStatusTool.execute({ cwd: dir }, deps(dir));
			assert.equal(noGit.failure?.kind, 'missing-tool');
			assert.equal(noGit.error, 'git not found');
		} finally { process.env['PATH'] = savedPath; }

		const slow = await runShell(['sleep', '5'], { timeoutMs: 50 });
		assert.equal(slow.timedOut, true);
		assert.equal(fail('git_x', slow).failure?.kind, 'timed-out');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('git_merge with a conflict keeps its data and its merge conflict error and carries failure kind rejected', async () => {
	const repo = newRepo();
	try {
		writeFileSync(join(repo, 'f.txt'), 'base\n');
		git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'base');
		git(repo, 'checkout', '-q', '-b', 'other');
		writeFileSync(join(repo, 'f.txt'), 'other\n');
		git(repo, 'commit', '-q', '-am', 'other');
		git(repo, 'checkout', '-q', 'main');
		writeFileSync(join(repo, 'f.txt'), 'main\n');
		git(repo, 'commit', '-q', '-am', 'main');

		const res = await gitMergeTool.execute({ cwd: repo, ref: 'other' }, deps(repo));
		assert.equal(res.success, false);
		assert.equal(res.error, 'merge conflict');
		assert.deepEqual((res.data as { conflicts: string[] }).conflicts, ['f.txt']);
		assert.equal((res.data as { inConflict: boolean }).inConflict, true);
		assert.equal(res.failure?.kind, 'rejected');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a timed-out mutating call carries kind timed-out and the unknown-outcome sentence in failure.message', () => {
	const t = shell({ timedOut: true, code: null, stderr: 'partial' });
	const mutating = fail('git_push', t, { network: true, mutating: true });
	assert.equal(mutating.failure?.kind, 'timed-out');
	assert.ok(mutating.failure?.message.includes(UNKNOWN_OUTCOME));
	assert.equal(mutating.output, '[git_push] failed: partial');
	assert.equal(mutating.error, 'partial');

	const read = fail('git_log', t);
	assert.equal(read.failure?.kind, 'timed-out');
	assert.ok(!read.failure?.message.includes(UNKNOWN_OUTCOME));
});
