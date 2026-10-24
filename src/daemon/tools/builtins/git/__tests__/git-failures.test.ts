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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runShell, setShellTimeoutScaleForTests } from '../../../shell-helper.js';
import type { ShellResult } from '../../../shell-helper.js';
import type { Tool, ToolDeps, ToolResult } from '../../../types.js';
import { executeTool } from '../../../executor.js';
import { _resetRegistryForTests } from '../../../registry.js';
import { registerGitTools } from '../index.js';
import { conflictFailure, fail, failureKind, rejectInput, spawnFail, UNKNOWN_OUTCOME, withFailure, withFailureNet } from '../helpers.js';
import { FAILURE_CALLS } from './fixtures/failure-calls.js';
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

const TOOLS = new Map<string, Tool>([
	gitStatusTool, gitLogTool, gitDiffTool, gitShowTool, gitBlameTool, gitBranchTool, gitStageTool, gitCommitTool, gitAmendTool,
	gitPushTool, gitPullTool, gitFetchTool, gitCheckoutTool, gitMergeTool, gitRebaseTool, gitStashTool, gitResetTool, gitRevertTool,
	gitCherryPickTool, gitTagTool, gitRemoteTool, gitWorktreeTool,
].map(t => [t.id, t] as const));

/**
 * What each call of FAILURE_CALLS returned before this Story, recorded from the commit before it: `<phase>|<tool>|<input>`
 * to [output, error], where phase is 'repoless' (outside a repository) or 'nogit' (git missing from PATH).
 */
const BASELINE = JSON.parse(readFileSync(new URL('./fixtures/failure-baseline.json', import.meta.url), 'utf8')) as Record<string, [string, string | null]>;

/**
 * The calls whose failure the Story changes on purpose (LLD 3.5): a precondition read that cannot run now fails the call
 * before anything is changed, with the kind of the failed read, instead of being read as an answer ('detached HEAD',
 * 'nothing staged'). Their text is pinned to the new behaviour instead.
 */
const CHANGED = new Set<string>([
	...['repoless', 'nogit'].flatMap(ph => [
		`${ph}|git_commit|${JSON.stringify({ message: 'm', allowDetached: true })}`,
		`${ph}|git_commit|${JSON.stringify({ message: 'm', allowEmpty: true, allowDetached: true })}`,
		`${ph}|git_push|${JSON.stringify({ remote: 'origin' })}`,
	]),
]);
const GIT_MESSAGE = /^(fatal|warning|error|usage): /i;

test('the legacy output and error text of every existing failure path is unchanged', async () => {
	assert.equal(rejectInput('git_branch', 'missing name for create').output, '[git_branch] failed: missing name for create');
	assert.equal(rejectInput('git_branch', 'missing name for create').error, 'missing name for create');
	assert.equal(rejectInput('git_branch', 'x').failure?.kind, 'rejected');
	assert.equal(FAILURE_CALLS.length * 2, Object.keys(BASELINE).length);
	assert.equal(new Set(FAILURE_CALLS.map(([id]) => id)).size, 22, 'every one of the 22 tools is called');

	const dir = mkdtempSync(join(tmpdir(), 'insrc-gitfail-nogit-'));
	const savedPath = process.env['PATH'];
	try {
		for (const phase of ['repoless', 'nogit'] as const) {
			if (phase === 'nogit') { process.env['PATH'] = join(dir, 'nowhere'); }
			for (const [id, input] of FAILURE_CALLS) {
				const key = `${phase}|${id}|${JSON.stringify(input)}`;
				const [wantOut, wantErr] = BASELINE[key]!;
				const res = await TOOLS.get(id)!.execute({ ...input, cwd: dir }, deps(dir));
				const out = res.output.split(dir).join('<DIR>');
				const err = res.error?.split(dir).join('<DIR>') ?? null;
				assert.equal(res.success, false, key);
				assert.ok(res.failure !== undefined, `${key}: has a failure`);
				if (CHANGED.has(key)) {
					assert.equal(res.failure.kind, phase === 'nogit' ? 'missing-tool' : 'rejected', key);
					assert.match(out, phase === 'nogit' ? /^\[git_[a-z]+\] cannot spawn git -- / : /^\[git_[a-z]+\] failed: fatal: /, key);
					continue;
				}
				if (phase === 'repoless' && wantErr !== null && GIT_MESSAGE.test(wantErr) && wantOut.endsWith(wantErr)) {
					// git's own message: the text before it is the tool's, and it is also the error
					assert.ok(err !== null && GIT_MESSAGE.test(err), `${key}: ${err}`);
					assert.equal(out, wantOut.slice(0, wantOut.length - wantErr.length) + err, key);
				} else {
					assert.equal(out, wantOut, key);
					assert.equal(err, wantErr, key);
				}
				assert.equal(res.failure.kind, err === 'git not found' ? 'missing-tool' : 'rejected', key);
			}
		}
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
		writeFileSync(join(bin, 'git'), '#!/bin/sh\nexec sleep 5\n', { mode: 0o755 });
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

test('git_commit and git_push keep their legacy refusals in a repository and fail before any change when a precondition read cannot run', async () => {
	const repo = newRepo();
	const savedPath = process.env['PATH'];
	try {
		writeFileSync(join(repo, 'f.txt'), 'a\n');
		git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');

		// nothing staged: the legacy refusal
		const empty = await gitCommitTool.execute({ cwd: repo, message: 'm' }, deps(repo));
		assert.equal(empty.output, '[git_commit] failed: nothing staged -- run git:stage first, or pass allowEmpty:true for an empty commit');
		assert.equal(empty.failure?.kind, 'rejected');

		// detached HEAD: the legacy refusals, not a read failure
		git(repo, 'checkout', '-q', '--detach');
		const detached = await gitCommitTool.execute({ cwd: repo, message: 'm' }, deps(repo));
		assert.equal(detached.output, '[git_commit] failed: refusing to commit on detached HEAD -- rerun with allowDetached:true to override');
		const push = await gitPushTool.execute({ cwd: repo }, deps(repo));
		assert.equal(push.output, '[git_push] failed: detached HEAD -- supply an explicit ref');

		// a read that cannot run: the call fails before anything changes
		writeFileSync(join(repo, 'g.txt'), 'b\n');
		const head = git(repo, 'rev-parse', 'HEAD');
		process.env['PATH'] = join(repo, 'nowhere');
		const blocked = await gitCommitTool.execute({ cwd: repo, message: 'm', allowDetached: true, allowEmpty: true }, deps(repo));
		assert.equal(blocked.failure?.kind, 'missing-tool');
		process.env['PATH'] = savedPath;
		assert.equal(git(repo, 'rev-parse', 'HEAD'), head);
	} finally {
		process.env['PATH'] = savedPath;
		rmSync(repo, { recursive: true, force: true });
	}
});

/** A `git` on PATH that fails one named read of git_show (the diff, or the numstat) and otherwise runs the real git. */
function fakeGit(dir: string, realGit: string): string {
	const bin = join(dir, 'bin');
	mkdirSync(bin, { recursive: true });
	writeFileSync(join(bin, 'git'), [
		'#!/bin/sh', 'mode=other',
		'for a in "$@"; do [ "$a" = "--numstat" ] && mode=numstat; done',
		'if [ "$mode" = other ]; then for a in "$@"; do [ "$a" = "--pretty=format:" ] && mode=diff; done; fi',
		'if [ "$mode" = "$FAKE_FAIL" ]; then echo "$mode boom" >&2; exit 1; fi',
		`exec ${realGit} "$@"`, '',
	].join('\n'), { mode: 0o755 });
	return bin;
}

test('a failing git_show diff read is a failure and a failing numstat read is a warning', async () => {
	const repo = newRepo();
	const savedPath = process.env['PATH'];
	try {
		writeFileSync(join(repo, 'f.txt'), 'a\n');
		git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');
		const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
		process.env['PATH'] = `${fakeGit(repo, realGit)}:${savedPath ?? ''}`;

		// the diff is the answer: a failing read fails the call, with the kind of the failure
		process.env['FAKE_FAIL'] = 'diff';
		const diffFailed = await gitShowTool.execute({ cwd: repo, ref: 'HEAD' }, deps(repo));
		assert.equal(diffFailed.success, false);
		assert.equal(diffFailed.failure?.kind, 'rejected');
		assert.equal(diffFailed.output, '[git:show] failed: diff boom');

		// a diff that cannot be spawned or times out is a failure too
		process.env['FAKE_FAIL'] = '';
		setShellTimeoutScaleForTests(0.0001);
		try {
			const sleepGit = join(repo, 'bin2');
			mkdirSync(sleepGit);
			writeFileSync(join(sleepGit, 'git'), '#!/bin/sh\nexec sleep 5\n', { mode: 0o755 });
			process.env['PATH'] = `${sleepGit}:${savedPath ?? ''}`;
			const slow = await gitShowTool.execute({ cwd: repo, ref: 'HEAD' }, deps(repo));
			assert.equal(slow.success, false);
			assert.equal(slow.failure?.kind, 'timed-out');
		} finally { setShellTimeoutScaleForTests(undefined); }
		process.env['PATH'] = `${join(repo, 'bin')}:${savedPath ?? ''}`;

		// the file list only adds detail: the diff is returned without it, with a warning
		process.env['FAKE_FAIL'] = 'numstat';
		const warned = await gitShowTool.execute({ cwd: repo, ref: 'HEAD' }, deps(repo));
		assert.equal(warned.success, true, warned.output);
		const data = warned.data as { files: unknown[]; totalInsertions: number; warnings?: string[] };
		assert.deepEqual(data.files, []);
		assert.equal(data.totalInsertions, 0);
		assert.equal(data.warnings?.length, 1);
		assert.match(data.warnings?.[0] ?? '', /numstat rejected/);

		// neither failing: no warnings at all
		process.env['FAKE_FAIL'] = '';
		const ok = await gitShowTool.execute({ cwd: repo, ref: 'HEAD' }, deps(repo));
		assert.equal(ok.success, true);
		assert.equal((ok.data as { warnings?: string[] }).warnings, undefined);
		assert.equal((ok.data as { files: unknown[] }).files.length, 1);
	} finally {
		delete process.env['FAKE_FAIL'];
		process.env['PATH'] = savedPath;
		rmSync(repo, { recursive: true, force: true });
	}
});

test('git_diff exclude and git_stage empty paths fail with the executor\'s message through executeTool and with the legacy text directly', async () => {
	_resetRegistryForTests();
	registerGitTools();
	const repo = newRepo();
	try {
		writeFileSync(join(repo, 'f.txt'), 'a\n');
		git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');

		// through the executor the schema refuses a malformed list before git runs, naming the field
		for (const input of [{ exclude: [''] }, { exclude: ['ok', ''] }, { paths: [''] }, { paths: [] }]) {
			const r = await executeTool('git_diff', { cwd: repo, ...input }, deps(repo));
			assert.equal(r.success, false, JSON.stringify(input));
			assert.equal(r.failure?.kind, 'rejected');
			assert.match(r.failure?.message ?? '', /does not fit its input schema/);
			assert.match(r.failure?.message ?? '', /exclude|paths/);
		}
		// called directly, the tool keeps its legacy invalid-input text
		const direct = await gitDiffTool.execute({ cwd: repo, exclude: [''] }, deps(repo));
		assert.equal(direct.output, '[git:diff] invalid-input: `exclude` must be an array of non-empty strings');
		assert.equal(direct.error, 'invalid-input');
		assert.equal(direct.failure?.kind, 'rejected');

		// path together with paths is not expressible in the schema: the legacy failure stays, through the executor too
		const both = await executeTool('git_diff', { cwd: repo, path: 'f.txt', paths: ['f.txt'] }, deps(repo));
		assert.equal(both.success, false);
		assert.match(both.output, /cannot be combined with `path`/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
