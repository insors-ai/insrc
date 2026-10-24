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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runShell, setShellTimeoutScaleForTests } from '../../../shell-helper.js';
import type { ShellResult } from '../../../shell-helper.js';
import type { Tool, ToolDeps, ToolResult } from '../../../types.js';
import { conflictFailure, fail, failureKind, rejectInput, spawnFail, UNKNOWN_OUTCOME, withFailure, withFailureNet } from '../helpers.js';
import { gitAmendTool } from '../amend.js';
import { gitBlameTool } from '../blame.js';
import { gitBranchTool } from '../branch.js';
import { gitCheckoutTool } from '../checkout.js';
import { gitCherryPickTool } from '../cherry-pick.js';
import { gitCommitTool } from '../commit.js';
import { gitDiffTool, setGitDiffShellForTests } from '../diff.js';
import { gitFetchTool } from '../fetch.js';
import { gitLogTool } from '../log.js';
import { gitMergeTool } from '../merge.js';
import { gitPullTool } from '../pull.js';
import { gitPushTool } from '../push.js';
import { gitRebaseTool } from '../rebase.js';
import { gitRemoteTool } from '../remote.js';
import { gitResetTool } from '../reset.js';
import { gitRevertTool } from '../revert.js';
import { gitShowTool } from '../show.js';
import { gitStageTool } from '../stage.js';
import { gitStashTool } from '../stash.js';
import { gitStatusTool } from '../status.js';
import { gitTagTool } from '../tag.js';
import { gitWorktreeTool } from '../worktree.js';

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

/** One call of each of the 22 existing tools that reaches git (or its own input check) outside a repository. */
const EVERY_TOOL: readonly (readonly [Tool, Record<string, unknown>])[] = [
	[gitStatusTool, {}], [gitLogTool, {}], [gitDiffTool, {}], [gitShowTool, { ref: 'HEAD' }],
	[gitBlameTool, { path: 'x' }], [gitBranchTool, { op: 'list' }], [gitStageTool, { op: 'stage', paths: ['x'] }],
	[gitCommitTool, { message: 'm', allowDetached: true }], [gitAmendTool, { mode: 'message', message: 'm' }],
	[gitPushTool, { remote: 'origin', ref: 'main' }], [gitPullTool, { remote: 'origin', ref: 'main' }],
	[gitFetchTool, {}], [gitCheckoutTool, { mode: 'ref', ref: 'main' }], [gitMergeTool, { ref: 'main' }],
	[gitRebaseTool, { onto: 'main' }], [gitStashTool, { op: 'list' }], [gitResetTool, { ref: 'HEAD', mode: 'mixed' }],
	[gitRevertTool, { refs: ['HEAD'] }], [gitCherryPickTool, { refs: ['HEAD'] }], [gitTagTool, { op: 'list' }],
	[gitRemoteTool, { op: 'list' }], [gitWorktreeTool, { op: 'list' }],
];

test('the legacy output and error text of every existing failure path is unchanged', async () => {
	assert.equal(rejectInput('git_branch', 'missing name for create').output, '[git_branch] failed: missing name for create');
	assert.equal(rejectInput('git_branch', 'missing name for create').error, 'missing name for create');
	assert.equal(rejectInput('git_branch', 'x').failure?.kind, 'rejected');
	assert.equal(EVERY_TOOL.length, 22);

	const dir = mkdtempSync(join(tmpdir(), 'insrc-gitfail-nogit-'));
	const savedPath = process.env['PATH'];
	try {
		// Outside a repository: '[label] failed: <message>' with error the same message.
		for (const [tool, input] of EVERY_TOOL) {
			const res = await tool.execute({ ...input, cwd: dir }, deps(dir));
			assert.equal(res.success, false, tool.id);
			assert.equal(res.format, 'text', tool.id);
			assert.match(res.output, /^\[git[:_][a-z-]+\] failed: /, `${tool.id}: ${res.output}`);
			assert.equal(res.output.endsWith(res.error ?? '\u0000'), true, `${tool.id}: error is the output's message`);
			assert.equal(res.failure?.kind, 'rejected', tool.id);
		}
		// The labels the status, diff and stage tools print are the legacy ones.
		assert.match((await gitStatusTool.execute({ cwd: dir }, deps(dir))).output, /^\[git:status\] failed: .*not a git repository/i);
		assert.match((await gitDiffTool.execute({ cwd: dir }, deps(dir))).output, /^\[git:diff\] failed: /);
		assert.match((await gitStageTool.execute({ cwd: dir, op: 'stage', paths: ['x'] }, deps(dir))).output, /^\[git:stage\] failed: /);

		// With git missing: '[label] cannot spawn git -- ...' with error 'git not found' (or the tool's own input check first).
		process.env['PATH'] = join(dir, 'nowhere');
		for (const [tool, input] of EVERY_TOOL) {
			const res = await tool.execute({ ...input, cwd: dir }, deps(dir));
			assert.equal(res.success, false, tool.id);
			assert.match(res.output, /^\[git[:_][a-z-]+\] (cannot spawn git -- |failed: )/, `${tool.id}: ${res.output}`);
			if (res.output.includes('cannot spawn git')) {
				assert.equal(res.error, 'git not found', tool.id);
				assert.equal(res.failure?.kind, 'missing-tool', tool.id);
			}
		}
		assert.equal((await gitStatusTool.execute({ cwd: dir }, deps(dir))).output.startsWith('[git:status] cannot spawn git -- '), true);
	} finally {
		process.env['PATH'] = savedPath;
		rmSync(dir, { recursive: true, force: true });
	}
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

		// A git tool whose command passes its time limit: git_diff's shell is the one a test may replace.
		const slow = await runShell(['sleep', '5'], { timeoutMs: 50 });
		assert.equal(slow.timedOut, true);
		setGitDiffShellForTests(async () => slow);
		try {
			const res = await gitDiffTool.execute({ cwd: dir }, deps(dir));
			assert.equal(res.success, false);
			assert.equal(res.failure?.kind, 'timed-out');
		} finally { setGitDiffShellForTests(undefined); }
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

test('a timed-out mutating call carries kind timed-out and the unknown-outcome sentence in failure.message', async () => {
	// A real mutating tool whose git command never finishes: a fake git on PATH that sleeps, with the time limits scaled down.
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gitfail-slow-'));
	const savedPath = process.env['PATH'];
	try {
		const bin = join(dir, 'bin');
		mkdirSync(bin);
		writeFileSync(join(bin, 'git'), '#!/bin/sh\nsleep 5\n', { mode: 0o755 });
		process.env['PATH'] = `${bin}:${savedPath ?? ''}`;
		setShellTimeoutScaleForTests(0.002);
		const res = await gitStageTool.execute({ cwd: dir, op: 'stage', paths: ['x'] }, deps(dir));
		assert.equal(res.success, false);
		assert.equal(res.failure?.kind, 'timed-out');
		assert.ok(res.failure?.message.includes(UNKNOWN_OUTCOME), res.failure?.message);
		assert.ok(!res.output.includes(UNKNOWN_OUTCOME), 'output keeps today\'s text');
		assert.ok(!(res.error ?? '').includes(UNKNOWN_OUTCOME), 'error keeps today\'s text');

		// the same through a read: no unknown-outcome sentence
		const read = await gitStatusTool.execute({ cwd: dir }, deps(dir));
		assert.equal(read.failure?.kind, 'timed-out');
		assert.ok(!read.failure?.message.includes(UNKNOWN_OUTCOME));
	} finally {
		setShellTimeoutScaleForTests(undefined);
		process.env['PATH'] = savedPath;
		rmSync(dir, { recursive: true, force: true });
	}

	// a conflicted merge, rebase, revert or cherry-pick that timed out says so too
	const t: ShellResult = { ...shell({ code: null }), timedOut: true };
	const conflict = conflictFailure({ output: 'o', format: 'markdown', success: false, error: 'merge conflict', data: {} }, t);
	assert.equal(conflict.failure?.kind, 'timed-out');
	assert.ok(conflict.failure?.message.includes(UNKNOWN_OUTCOME));
	assert.equal(conflict.error, 'merge conflict');
});

test('the helper reads of amend and reset keep git\'s documented answers apart from process failures', async () => {
	const repo = newRepo();
	const savedPath = process.env['PATH'];
	try {
		writeFileSync(join(repo, 'f.txt'), 'a\n');
		git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');
		writeFileSync(join(repo, 'f.txt'), 'b\n');
		git(repo, 'commit', '-q', '-am', 'two');

		// No upstream configured (git exits 128) is the answer false: both calls run.
		const amended = await gitAmendTool.execute({ cwd: repo, mode: 'message', message: 'two again' }, deps(repo));
		assert.equal(amended.success, true, amended.output);
		assert.equal((amended.data as { requiresForcePush: boolean }).requiresForcePush, false);
		const reset = await gitResetTool.execute({ cwd: repo, ref: 'HEAD~1', mode: 'hard' }, deps(repo));
		assert.equal(reset.success, true, reset.output);
		assert.equal((reset.data as { requiresForcePush: boolean }).requiresForcePush, false);

		// A read that cannot run is not an answer: the call fails before anything changes.
		process.env['PATH'] = join(repo, 'nowhere');
		const blocked = await gitAmendTool.execute({ cwd: repo, mode: 'message', message: 'x' }, deps(repo));
		assert.equal(blocked.success, false);
		assert.equal(blocked.failure?.kind, 'missing-tool');
		assert.equal(blocked.output.startsWith('[git_amend] cannot spawn git -- '), true, blocked.output);
		assert.equal(blocked.error, 'git not found');
	} finally {
		process.env['PATH'] = savedPath;
		rmSync(repo, { recursive: true, force: true });
	}
});
