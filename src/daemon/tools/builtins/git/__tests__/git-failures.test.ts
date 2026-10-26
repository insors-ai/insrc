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
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
import { gitForEachRefTool } from '../for-each-ref.js';
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

		// git_stage with no paths: the schema refuses it before git runs; called directly the tool keeps its legacy text
		for (const paths of [[], undefined]) {
			const r = await executeTool('git_stage', { cwd: repo, op: 'stage', ...(paths ? { paths } : {}) }, deps(repo));
			assert.equal(r.success, false);
			assert.equal(r.failure?.kind, 'rejected');
			assert.match(r.failure?.message ?? '', /does not fit its input schema/);
			assert.match(r.failure?.message ?? '', /paths/);
		}
		const emptyDirect = await gitStageTool.execute({ cwd: repo, op: 'stage', paths: [] }, deps(repo));
		assert.equal(emptyDirect.output, '[git:stage] paths is empty');
		assert.equal(emptyDirect.error, 'no paths');
		assert.equal(emptyDirect.failure?.kind, 'rejected');
		// a path made only of empty strings is also empty to the tool
		assert.equal((await gitStageTool.execute({ cwd: repo, op: 'stage', paths: [''] }, deps(repo))).error, 'no paths');
		// a real stage works through the executor and returns data that fits its schema
		writeFileSync(join(repo, 'g.txt'), 'g\n');
		const staged = await executeTool('git_stage', { cwd: repo, op: 'stage', paths: ['g.txt'] }, deps(repo));
		assert.equal(staged.success, true, staged.output);
		assert.deepEqual((staged.data as { indexAfter: string[] }).indexAfter, ['g.txt']);

		// path together with paths is not expressible in the schema: the legacy failure stays, through the executor too
		const both = await executeTool('git_diff', { cwd: repo, path: 'f.txt', paths: ['f.txt'] }, deps(repo));
		assert.equal(both.success, false);
		assert.match(both.output, /cannot be combined with `path`/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});


// ---------------------------------------------------------------------------
// Secondary lookups, precondition reads and the audit
// ---------------------------------------------------------------------------

/**
 * A `git` on PATH that fails the commands whose arguments contain FAKE_FAIL_ARGS (after letting FAKE_FAIL_SKIP of them
 * through) and runs the real git for everything else.
 */
function argFakeGit(dir: string, realGit: string): string {
	const bin = join(dir, 'argbin');
	mkdirSync(bin, { recursive: true });
	writeFileSync(join(bin, 'git'), [
		'#!/bin/sh',
		'if [ -n "$FAKE_FAIL_ARGS" ]; then',
		'  case "$*" in',
		'    *"$FAKE_FAIL_ARGS"*)',
		'      n=$(cat "$FAKE_COUNTER" 2>/dev/null || echo 0); echo $((n+1)) > "$FAKE_COUNTER"',
		'      if [ "$n" -ge "${FAKE_FAIL_SKIP:-0}" ]; then',
		'        if [ "$FAKE_FAIL_MODE" = sleep ]; then exec sleep 5; fi',
		'        echo "fake failure of: $*" >&2; exit 1',
		'      fi ;;',
		'  esac',
		'fi',
		`exec ${realGit} "$@"`, '',
	].join('\n'), { mode: 0o755 });
	return bin;
}

/** Run `body` with the fake git first on PATH, failing the commands that contain `args` after `skip` matches. */
async function withFailingRead<T>(_repo: string, args: string, skip: number, body: () => Promise<T>, mode: 'exit' | 'sleep' = 'exit'): Promise<T> {
	const savedPath = process.env['PATH'];
	const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
	// outside the repository, so that `git add -A` never stages the fake
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fakegit-'));
	const counter = join(dir, 'counter');
	process.env['PATH'] = `${argFakeGit(dir, realGit)}:${savedPath ?? ''}`;
	process.env['FAKE_FAIL_ARGS'] = args; process.env['FAKE_FAIL_SKIP'] = String(skip); process.env['FAKE_COUNTER'] = counter; process.env['FAKE_FAIL_MODE'] = mode;
	if (mode === 'sleep') { setShellTimeoutScaleForTests(0.002); }
	try { return await body(); }
	finally {
		rmSync(dir, { recursive: true, force: true });
		process.env['PATH'] = savedPath;
		setShellTimeoutScaleForTests(undefined);
		delete process.env['FAKE_FAIL_ARGS']; delete process.env['FAKE_FAIL_SKIP']; delete process.env['FAKE_COUNTER']; delete process.env['FAKE_FAIL_MODE'];
	}
}

/** A repository with commits `one`, `two` on main, a branch b one commit ahead of main, and a bare remote origin. */
function seedRepo(): { repo: string; remote: string } {
	const repo = newRepo();
	writeFileSync(join(repo, 'f.txt'), '1\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');
	writeFileSync(join(repo, 'f.txt'), '2\n');
	git(repo, 'commit', '-q', '-am', 'two');
	git(repo, 'checkout', '-q', '-b', 'b');
	writeFileSync(join(repo, 'g.txt'), 'g\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'on b');
	git(repo, 'checkout', '-q', 'main');
	const remote = mkdtempSync(join(tmpdir(), 'insrc-secondary-remote-'));
	git(remote, 'init', '-q', '--bare', '-b', 'main');
	git(repo, 'remote', 'add', 'origin', remote);
	return { repo, remote };
}

interface Lookup { name: string; tool: Tool; input: (repo: string) => Record<string, unknown>; fail: string; skip?: number; prep?: (repo: string) => void; warning: RegExp }

/** The inventory of secondary lookups of the git tools (LLD 3.5): each keeps a placeholder, returns success and warns. */
const INVENTORY: readonly Lookup[] = [
	{ name: 'git_show numstat', tool: gitShowTool, input: repo => ({ cwd: repo }), fail: 'show --no-color --numstat', warning: /numstat/ },
	{ name: 'git_branch previous branch', tool: gitBranchTool, input: repo => ({ cwd: repo, op: 'switch', name: 'b' }), fail: 'rev-parse --abbrev-ref HEAD', warning: /previous branch/ },
	{ name: 'git_rebase head', tool: gitRebaseTool, input: repo => ({ cwd: repo, onto: 'main' }), prep: repo => git(repo, 'checkout', '-q', 'b'), fail: 'rev-parse --short HEAD', warning: /short sha/ },
	{ name: 'git_rebase branch label', tool: gitRebaseTool, input: repo => ({ cwd: repo, onto: 'main' }), prep: repo => git(repo, 'checkout', '-q', 'b'), fail: 'symbolic-ref --short HEAD', skip: 1, warning: /branch is shown/ },
	{ name: 'git_commit sha', tool: gitCommitTool, input: repo => ({ cwd: repo, message: 'm' }), prep: repo => { writeFileSync(join(repo, 'h.txt'), 'h'); git(repo, 'add', '-A'); }, fail: 'rev-parse HEAD', warning: /the sha is empty/ },
	{ name: 'git_commit short sha', tool: gitCommitTool, input: repo => ({ cwd: repo, message: 'm' }), prep: repo => { writeFileSync(join(repo, 'h.txt'), 'h'); git(repo, 'add', '-A'); }, fail: 'rev-parse --short HEAD', warning: /short sha is empty/ },
	{ name: 'git_commit numstat', tool: gitCommitTool, input: repo => ({ cwd: repo, message: 'm' }), prep: repo => { writeFileSync(join(repo, 'h.txt'), 'h'); git(repo, 'add', '-A'); }, fail: 'show --numstat --format= HEAD', warning: /numstat/ },
	{ name: 'git_amend sha', tool: gitAmendTool, input: repo => ({ cwd: repo, mode: 'message', message: 'again' }), fail: 'rev-parse HEAD', skip: 1, warning: /the sha is empty/ },
	{ name: 'git_amend short sha', tool: gitAmendTool, input: repo => ({ cwd: repo, mode: 'message', message: 'again' }), fail: 'rev-parse --short HEAD', warning: /short sha is empty/ },
	{ name: 'git_amend message', tool: gitAmendTool, input: repo => ({ cwd: repo, mode: 'message', message: 'again' }), fail: 'log -1 --pretty=%B HEAD', warning: /the message is the one supplied/ },
	{ name: 'git_reset previous short sha', tool: gitResetTool, input: repo => ({ cwd: repo, mode: 'soft', ref: 'HEAD~1' }), fail: 'rev-parse --short HEAD', warning: /previous short sha/ },
	{ name: 'git_reset after short sha', tool: gitResetTool, input: repo => ({ cwd: repo, mode: 'soft', ref: 'HEAD~1' }), fail: 'rev-parse --short HEAD', skip: 1, warning: /new short sha/ },
	{ name: 'git_merge branch label', tool: gitMergeTool, input: repo => ({ cwd: repo, ref: 'b' }), fail: 'symbolic-ref --short HEAD', warning: /branch is shown/ },
	{ name: 'git_push short sha', tool: gitPushTool, input: repo => ({ cwd: repo, remote: 'origin', ref: 'b' }), fail: 'rev-parse --short b', warning: /short sha is empty/ },
	{ name: 'git_stage index after', tool: gitStageTool, input: repo => ({ cwd: repo, op: 'stage', paths: ['h.txt'] }), prep: repo => { writeFileSync(join(repo, 'h.txt'), 'h'); git(repo, 'add', '-A'); }, fail: 'diff --cached --name-only', warning: /index listing is empty/ },
	{ name: 'git_revert branch label', tool: gitRevertTool, input: repo => ({ cwd: repo, refs: ['HEAD'] }), fail: 'symbolic-ref --short HEAD', warning: /branch is shown/ },
	{ name: 'git:cherry-pick branch label', tool: gitCherryPickTool, input: repo => ({ cwd: repo, refs: ['b'] }), fail: 'symbolic-ref --short HEAD', skip: 1, warning: /branch is shown/ },
];

test('a failing git_commit numstat read after a successful commit is a success with a warning', async () => {
	const { repo, remote } = seedRepo();
	try {
		writeFileSync(join(repo, 'h.txt'), 'h\n');
		git(repo, 'add', '-A');
		const res = await withFailingRead(repo, 'show --numstat --format= HEAD', 0, () => gitCommitTool.execute({ cwd: repo, message: 'three' }, deps(repo)));
		assert.equal(res.success, true, res.output);
		const data = res.data as { filesChanged: number; insertions: number; sha: string; warnings?: string[] };
		assert.equal(data.filesChanged, 0, 'the file counts are empty, as an unparsable read gives');
		assert.equal(data.insertions, 0);
		assert.match(data.sha, /^[0-9a-f]{40}$/);
		assert.equal(data.warnings?.length, 1);
		assert.match(data.warnings?.[0] ?? '', /git show --numstat HEAD rejected/);
		assert.equal(git(repo, 'log', '-1', '--format=%s').trim(), 'three', 'the commit was made');

		// with the read working, the counts are there and there is no warning
		writeFileSync(join(repo, 'i.txt'), 'i\n');
		git(repo, 'add', '-A');
		const ok = await gitCommitTool.execute({ cwd: repo, message: 'four' }, deps(repo));
		assert.equal((ok.data as { filesChanged: number }).filesChanged, 1);
		assert.equal((ok.data as { warnings?: string[] }).warnings, undefined);
	} finally { rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); }
});

test('every secondary lookup in the git tools is in the inventory and warns on failure', async () => {
	for (const l of INVENTORY) {
		const { repo, remote } = seedRepo();
		try {
			l.prep?.(repo);
			const res = await withFailingRead(repo, l.fail, l.skip ?? 0, () => l.tool.execute(l.input(repo), deps(repo)));
			assert.equal(res.success, true, `${l.name}: ${res.output}`);
			const warnings = (res.data as { warnings?: string[] } | undefined)?.warnings ?? [];
			assert.ok(warnings.some(w => l.warning.test(w)), `${l.name}: warnings ${JSON.stringify(warnings)}`);
			assert.ok(warnings.every(w => /rejected|timed-out|missing-tool|cut/.test(w)), `${l.name}: each warning names the kind`);
		} finally { rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); }
	}
	// the inventory has no tool twice under one name, and covers every tool the LLD names
	assert.equal(new Set(INVENTORY.map(l => l.name)).size, INVENTORY.length);
	for (const tool of ['git_show', 'git_branch', 'git_rebase', 'git_commit', 'git_amend', 'git_reset', 'git_merge', 'git_push', 'git_stage', 'git_revert', 'git:cherry-pick']) {
		assert.ok(INVENTORY.some(l => l.tool.id === tool), `${tool} has a lookup in the inventory`);
	}
});


test('a failing precondition read fails the call before any change, and no runShell or helper result is used outside failureKind, a warning or a listed placeholder', async () => {
	const { repo, remote } = seedRepo();
	try {
		git(repo, 'push', '-q', 'origin', 'main');
		const headBefore = git(repo, 'rev-parse', 'HEAD').trim();
		const remoteBefore = git(remote, 'rev-parse', 'refs/heads/main').trim();
		writeFileSync(join(repo, 'h.txt'), 'h\n');
		git(repo, 'add', '-A');

		// the current branch cannot be read: commit, push without a ref and pull without a branch stop before changing anything
		for (const [name, run] of [
			['git_commit', () => gitCommitTool.execute({ cwd: repo, message: 'x' }, deps(repo))],
			['git_push', () => gitPushTool.execute({ cwd: repo, remote: 'origin' }, deps(repo))],
			['git_pull', () => gitPullTool.execute({ cwd: repo, remote: 'origin' }, deps(repo))],
		] as const) {
			const r = await withFailingRead(repo, 'symbolic-ref --short HEAD', 0, run);
			assert.equal(r.success, false, name);
			assert.equal(r.failure?.kind, 'rejected', name);
			assert.match(r.output, /fake failure of: symbolic-ref/, name);
		}
		// the staged count cannot be read: commit stops
		const noCount = await withFailingRead(repo, 'diff --cached --name-only', 0, () => gitCommitTool.execute({ cwd: repo, message: 'x' }, deps(repo)));
		assert.equal(noCount.success, false);
		assert.match(noCount.output, /fake failure of: diff --cached --name-only/);
		// a read that times out is a timed-out failure, not "nothing staged"
		const slow = await withFailingRead(repo, 'diff --cached --name-only', 0, () => gitCommitTool.execute({ cwd: repo, message: 'x' }, deps(repo)), 'sleep');
		assert.equal(slow.failure?.kind, 'timed-out');

		assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), headBefore, 'no commit was made');
		assert.equal(git(remote, 'rev-parse', 'refs/heads/main').trim(), remoteBefore, 'nothing was pushed');
		assert.match(git(repo, 'status', '--porcelain'), /h\.txt/, 'the index is as it was');
	} finally { rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); }

	audit();
});

/**
 * The audit of the git tool sources. A result of runShell is used only after it went through failureKind (directly or
 * through fail, spawnFail, readFailure, conflictFailure or ranToExit); a helper that swallows a failure (currentBranch,
 * stagedCount, revParse) is used only where it is listed, and a listed use is a preview.
 */
function scanSources(sources: Record<string, string>): { offenders: string[]; lookups: string[]; helperUses: string[]; readHelpers: string[] } {
	const offenders: string[] = [];
	const lookups: string[] = [];
	const helperUses: string[] = [];
	const readHelpers: string[] = [];
	for (const [file, src] of Object.entries(sources)) {
		for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*await\s+runShell(?:Bytes)?\(/g)) {
			const name = m[1]!;
			const checked = new RegExp(`(?:ranToExit|failureKind|readFailure|conflictFailure)\\(\\s*${name}\\b|(?:fail|spawnFail)\\([^)]*\\b${name}\\b`).test(src);
			if (!checked) { offenders.push(`${file}: ${name}`); }
			// the command that is the tool's answer ends in fail(); any other result is a lookup and must be listed
			if (!new RegExp(`(?:fail|spawnFail|readFailure|conflictFailure)\\([^)]*\\b${name}\\b`).test(src)) { lookups.push(`${file}: ${name}`); }
		}
		for (const m of src.matchAll(/\b(currentBranch|stagedCount|revParse)\(/g)) { helperUses.push(`${file}: ${m[1]}`); }
		// reads made through the typed helpers: each call is a lookup (secondary) or a precondition and is listed with its count
		const counts = new Map<string, number>();
		for (const m of src.matchAll(/\b(readBranch|readStagedCount|readShortSha|branchForReport)\(/g)) { counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1); }
		for (const [h, n] of counts) { readHelpers.push(`${file}: ${h} x${n}`); }
	}
	return { offenders, lookups, helperUses, readHelpers };
}

/** Every lookup the tools make, by what it is: the audit fails for a read that is not listed here. */
const KNOWN_LOOKUPS: Record<string, 'secondary' | 'precondition' | 'preview'> = {
	'amend.ts: long': 'secondary', 'amend.ts: msgRes': 'secondary', 'amend.ts: head': 'precondition', 'amend.ts: upstream': 'precondition', 'amend.ts: merge': 'precondition',
	'branch.ts: head': 'secondary', 'commit.ts: sha': 'secondary', 'commit.ts: short': 'secondary', 'commit.ts: stat': 'secondary',
	'merge.ts: rev': 'preview', 'rebase.ts: count': 'preview', 'rebase.ts: head': 'secondary',
	'reset.ts: priorShort': 'secondary', 'reset.ts: afterShort': 'secondary', 'show.ts: stat': 'secondary', 'stage.ts: post': 'secondary',
};
/** Reads through the typed helpers, with their number of calls per file. */
const KNOWN_HELPER_READS: Record<string, 'secondary' | 'precondition'> = {
	'amend.ts: branchForReport x1': 'secondary', 'amend.ts: readShortSha x1': 'secondary',
	'checkout.ts: readBranch x1': 'precondition', 'cherry-pick.ts: branchForReport x1': 'secondary', 'cherry-pick.ts: readBranch x1': 'precondition', 'rebase.ts: readBranch x1': 'precondition',
	'commit.ts: readBranch x1': 'precondition', 'commit.ts: readStagedCount x1': 'precondition',
	'merge.ts: branchForReport x2': 'secondary', 'pull.ts: readBranch x1': 'precondition',
	'push.ts: readBranch x2': 'precondition', 'push.ts: readShortSha x1': 'secondary',
	'rebase.ts: branchForReport x2': 'secondary', 'reset.ts: branchForReport x1': 'secondary', 'revert.ts: branchForReport x1': 'secondary',
};
/** The helpers that swallow a failure are used only for the preview of an approval request, where a failure is a placeholder. */
const KNOWN_SWALLOWING = ['merge.ts: currentBranch', 'pull.ts: currentBranch', 'rebase.ts: currentBranch', 'reset.ts: currentBranch'];
const TOOL_OF_FILE: Record<string, string> = { 'amend.ts': 'git_amend', 'branch.ts': 'git_branch', 'cherry-pick.ts': 'git:cherry-pick', 'commit.ts': 'git_commit', 'merge.ts': 'git_merge', 'push.ts': 'git_push', 'rebase.ts': 'git_rebase', 'reset.ts': 'git_reset', 'revert.ts': 'git_revert', 'show.ts': 'git_show', 'stage.ts': 'git_stage' };

/**
 * The problems of the git tool sources: a runShell result whose process flags are never looked at, a lookup or a typed-helper
 * read that is not listed, a call of a helper that swallows a failure that is not a listed preview, and a secondary read whose
 * tool has no INVENTORY entry (the entry proves it keeps its placeholder, succeeds and warns).
 */
function auditProblems(sources: Record<string, string>): string[] {
	const { offenders, lookups, helperUses, readHelpers } = scanSources(sources);
	const problems: string[] = offenders.map(o => `a runShell result whose process flags are never looked at: ${o}`);
	const diff = (found: string[], known: string[], what: string): void => {
		for (const f of found) { if (!known.includes(f)) { problems.push(`${what} that is not listed: ${f}`); } }
		for (const k of known) { if (!found.includes(k)) { problems.push(`${what} listed but not found: ${k}`); } }
	};
	diff(lookups, Object.keys(KNOWN_LOOKUPS), 'a lookup');
	diff(readHelpers, Object.keys(KNOWN_HELPER_READS), 'a read through a typed helper');
	diff(helperUses, KNOWN_SWALLOWING, 'a call of a helper that swallows a failure');
	for (const [key, kind] of [...Object.entries(KNOWN_LOOKUPS), ...Object.entries(KNOWN_HELPER_READS)]) {
		const tool = TOOL_OF_FILE[key.split(':')[0]!];
		if (kind === 'secondary' && !INVENTORY.some(l => l.tool.id === tool)) { problems.push(`${key} is secondary: ${tool} needs an INVENTORY entry`); }
	}
	return problems;
}

function audit(): void {
	const dir = dirname(fileURLToPath(import.meta.url)) + '/..';
	const skip = new Set(['helpers.ts', 'parsers.ts', 'index.ts', 'schemas.ts', 'coverage.ts']);
	const sources = Object.fromEntries(readdirSync(dir).filter(n => n.endsWith('.ts') && !skip.has(n)).map(n => [n, readFileSync(join(dir, n), 'utf8')]));

	// the scan itself, on planted sources
	const planted = scanSources({
		'x.ts': "const r = await runShell(['git', 'status']);\nif (r.code !== 0) { return undefined; }\nconst b = await currentBranch(cwd);\n"
			+ "const l = await runShell(['git', 'log']);\nconst ok = ranToExit(l);\nconst main = await runShell(['git', 'push']);\nif (main.code !== 0) { return fail('git_x', main); }\n",
	});
	assert.deepEqual(planted.offenders, ['x.ts: r']);
	assert.deepEqual(planted.lookups, ['x.ts: r', 'x.ts: l']);
	assert.deepEqual(planted.helperUses, ['x.ts: currentBranch']);
	const plantedHelpers = scanSources({ 'y.ts': "const ignored = await readShortSha(cwd, 'HEAD');\nawait branchForReport(cwd, w, 'x');\nawait branchForReport(cwd, w, 'x');\n" });
	assert.deepEqual(plantedHelpers.readHelpers, ['y.ts: readShortSha x1', 'y.ts: branchForReport x2']);

	// the tools as they are pass the audit ...
	assert.deepEqual(auditProblems(sources), []);

	// ... and each kind of unlisted, ignored lookup added to a real tool fails it
	const withLookup = auditProblems({ ...sources, 'merge.ts': `${sources['merge.ts']}\nconst extra = await runShell(['git', 'log', '-1'], { cwd });\nconst extraOk = ranToExit(extra);\n` });
	assert.deepEqual(withLookup, ['a lookup that is not listed: merge.ts: extra']);
	const withHelper = auditProblems({ ...sources, 'merge.ts': `${sources['merge.ts']}\nconst ignored = await readShortSha(cwd, 'HEAD');\n` });
	assert.deepEqual(withHelper, ['a read through a typed helper that is not listed: merge.ts: readShortSha x1']);
	const moreOfAListed = auditProblems({ ...sources, 'merge.ts': `${sources['merge.ts']}\nawait branchForReport(cwd, [], 'x');\n` });
	assert.equal(moreOfAListed.length, 2, 'a further call of a listed helper changes the count and fails');
	const withSwallowing = auditProblems({ ...sources, 'tag.ts': `${sources['tag.ts']}\nconst b = await currentBranch(cwd);\n` });
	assert.deepEqual(withSwallowing, ['a call of a helper that swallows a failure that is not listed: tag.ts: currentBranch']);
	const unchecked = auditProblems({ ...sources, 'tag.ts': `${sources['tag.ts']}\nconst raw = await runShell(['git', 'tag'], { cwd });\nconst n = raw.stdout.length;\n` });
	assert.ok(unchecked.includes('a runShell result whose process flags are never looked at: tag.ts: raw'));
}

test('git_amend wasPushed, git_reset willNeedForcePush and git_merge listConflicts keep their expected non-zero answers and fail or warn on process failures', async () => {
	const { repo, remote } = seedRepo();
	try {
		git(repo, 'push', '-q', '-u', 'origin', 'main');

		// wasPushed: HEAD is an ancestor of the upstream (exit 0) -> true; not an ancestor (exit 1) -> false
		const pushed = await gitAmendTool.execute({ cwd: repo, mode: 'message', message: 'a' }, deps(repo));
		assert.equal(pushed.success, true, pushed.output);
		assert.equal((pushed.data as { requiresForcePush: boolean }).requiresForcePush, true, 'HEAD was in the upstream before the amend');
		// the amended HEAD is no ancestor of the upstream (exit 1): the answer is false, not a failure
		const diverged = await gitAmendTool.execute({ cwd: repo, mode: 'message', message: 'b' }, deps(repo));
		assert.equal(diverged.success, true, diverged.output);
		assert.equal((diverged.data as { requiresForcePush: boolean }).requiresForcePush, false);
		git(repo, 'reset', '-q', '--hard', 'origin/main');
		// an amend whose merge-base read times out stops before changing anything
		const headBefore = git(repo, 'rev-parse', 'HEAD').trim();
		const amendSlow = await withFailingRead(repo, 'merge-base --is-ancestor', 0, () => gitAmendTool.execute({ cwd: repo, mode: 'message', message: 'c' }, deps(repo)), 'sleep');
		assert.equal(amendSlow.success, false);
		assert.equal(amendSlow.failure?.kind, 'timed-out');
		assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), headBefore);

		// willNeedForcePush: the target is an ancestor of the upstream (exit 0) -> true; a process failure is not an answer
		const soft = await gitResetTool.execute({ cwd: repo, mode: 'soft', ref: 'HEAD~1' }, deps(repo));
		assert.equal((soft.data as { requiresForcePush: boolean }).requiresForcePush, true);
		git(repo, 'reset', '-q', '--hard', 'origin/main');
		const hardSlow = await withFailingRead(repo, 'merge-base --is-ancestor', 0, () => gitResetTool.execute({ cwd: repo, mode: 'hard', ref: 'HEAD~1' }, deps(repo)), 'sleep');
		assert.equal(hardSlow.success, false, 'a hard reset does not run on an unknown answer');
		assert.equal(hardSlow.failure?.kind, 'timed-out');
		assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), headBefore);
		for (const mode of ['soft', 'mixed']) {
			const slow = await withFailingRead(repo, 'merge-base --is-ancestor', 0, () => gitResetTool.execute({ cwd: repo, mode, ref: 'HEAD~1' }, deps(repo)), 'sleep');
			assert.equal(slow.success, false, `a ${mode} reset does not run on an unknown answer either`);
			assert.equal(slow.failure?.kind, 'timed-out');
			assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), headBefore);
		}

		// listConflicts: a real conflict is listed; an enumeration that cannot run is named in the failure
		git(repo, 'reset', '-q', '--hard', 'origin/main');
		git(repo, 'checkout', '-q', '-b', 'x', 'main~1');
		writeFileSync(join(repo, 'f.txt'), 'x side\n'); git(repo, 'commit', '-q', '-am', 'x');
		git(repo, 'checkout', '-q', 'main');
		const conflict = await gitMergeTool.execute({ cwd: repo, ref: 'x' }, deps(repo));
		assert.equal(conflict.error, 'merge conflict');
		assert.deepEqual((conflict.data as { conflicts: string[] }).conflicts, ['f.txt']);
		git(repo, 'merge', '--abort');
		const unknown = await withFailingRead(repo, 'diff --name-only --diff-filter=U', 0, () => gitMergeTool.execute({ cwd: repo, ref: 'x' }, deps(repo)), 'sleep');
		assert.equal(unknown.success, false);
		assert.match(unknown.failure?.message ?? '', /could not tell whether the merge left conflicts: timed-out/);
		assert.equal(unknown.error?.includes('conflict'), true);
	} finally { rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); }
});


test('git_amend with no upstream, a non-ancestor and a timed-out upstream read; git_reset hard with an unknown force-push state; git_merge with a failing conflict enumeration; and git_for_each_ref noMerged', async () => {
	const { repo, remote } = seedRepo();
	try {
		const head = (): string => git(repo, 'rev-parse', 'HEAD').trim();

		// amend, no upstream configured (git's exit 128 on @{upstream}): the answer is "not pushed", and the amend runs
		const noUpstream = await gitAmendTool.execute({ cwd: repo, mode: 'message', message: 'no upstream' }, deps(repo));
		assert.equal(noUpstream.success, true, noUpstream.output);
		assert.equal((noUpstream.data as { requiresForcePush: boolean }).requiresForcePush, false);

		// amend, HEAD not an ancestor of the upstream (exit 1): not pushed, the amend runs
		git(repo, 'push', '-q', '-u', 'origin', 'main');
		writeFileSync(join(repo, 'ahead.txt'), 'a'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'ahead of upstream');
		const ahead = await gitAmendTool.execute({ cwd: repo, mode: 'message', message: 'ahead, amended' }, deps(repo));
		assert.equal(ahead.success, true, ahead.output);
		assert.equal((ahead.data as { requiresForcePush: boolean }).requiresForcePush, false, 'a commit that is not in the upstream is not pushed');

		// amend, the upstream read times out: no answer, so the call stops before the amend
		const before = head();
		const slowUpstream = await withFailingRead(repo, 'rev-parse @{upstream}', 0, () => gitAmendTool.execute({ cwd: repo, mode: 'message', message: 'never' }, deps(repo)), 'sleep');
		assert.equal(slowUpstream.success, false);
		assert.equal(slowUpstream.failure?.kind, 'timed-out');
		assert.equal(head(), before);

		// reset --hard with an unknown force-push state: the call stops before the reset, and the worktree is untouched
		writeFileSync(join(repo, 'f.txt'), 'uncommitted work\n');
		const hard = await withFailingRead(repo, 'merge-base --is-ancestor', 0, () => gitResetTool.execute({ cwd: repo, mode: 'hard', ref: 'HEAD~1' }, deps(repo)), 'sleep');
		assert.equal(hard.success, false);
		assert.equal(hard.failure?.kind, 'timed-out');
		assert.equal(readFileSync(join(repo, 'f.txt'), 'utf8'), 'uncommitted work\n', 'the uncommitted work is still there');
		assert.equal(head(), before);
		git(repo, 'checkout', '-q', '--', 'f.txt');

		// merge, a conflict whose enumeration cannot run: the failure says so and keeps the merge's own kind
		git(repo, 'checkout', '-q', '-b', 'x', 'main~2');
		writeFileSync(join(repo, 'f.txt'), 'x side\n'); git(repo, 'commit', '-q', '-am', 'x');
		git(repo, 'checkout', '-q', 'main');
		const unknown = await withFailingRead(repo, 'diff --name-only --diff-filter=U', 0, () => gitMergeTool.execute({ cwd: repo, ref: 'x' }, deps(repo)), 'sleep');
		assert.equal(unknown.success, false);
		assert.equal(unknown.failure?.kind, 'rejected');
		assert.match(unknown.failure?.message ?? '', /could not tell whether the merge left conflicts/);
		git(repo, 'merge', '--abort');

		// for-each-ref --no-merged selects what main does not contain
		const noMerged = await gitForEachRefTool.execute({ cwd: repo, pattern: ['refs/heads'], fields: ['refname:short'], noMerged: 'main' }, deps(repo));
		assert.deepEqual((noMerged.data as { refs: Record<string, string>[] }).refs.map(r => r['refname:short']).sort(), ['b', 'x']);
	} finally { rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); }
});

test('git_commit, git_push, git_rebase and git_checkout fail before changing anything when the current-branch or staged-count read cannot run or times out', async () => {
	const { repo, remote } = seedRepo();
	try {
		git(repo, 'push', '-q', '-u', 'origin', 'main');
		git(repo, 'checkout', '-q', '-b', 'topic'); git(repo, 'commit', '-q', '--allow-empty', '-m', 'topic');
		git(repo, 'checkout', '-q', 'main');
		writeFileSync(join(repo, 'h.txt'), 'h'); git(repo, 'add', '-A');
		const state = (): string => [git(repo, 'rev-parse', 'HEAD'), git(repo, 'symbolic-ref', 'HEAD'), git(repo, 'status', '--porcelain'), git(repo, 'branch', '--list'),
			execFileSync('git', ['rev-parse', 'refs/heads/main'], { cwd: remote, encoding: 'utf8' })].join('|');
		const before = state();

		const calls: [string, () => Promise<ToolResult>, string][] = [
			['git_commit', () => gitCommitTool.execute({ cwd: repo, message: 'm' }, deps(repo)), 'symbolic-ref --short HEAD'],
			['git_commit', () => gitCommitTool.execute({ cwd: repo, message: 'm' }, deps(repo)), 'diff --cached --name-only'],
			['git_push', () => gitPushTool.execute({ cwd: repo, remote: 'origin' }, deps(repo)), 'symbolic-ref --short HEAD'],
			['git_rebase', () => gitRebaseTool.execute({ cwd: repo, onto: 'topic' }, deps(repo)), 'symbolic-ref --short HEAD'],
			['git_rebase', () => gitRebaseTool.execute({ cwd: repo, op: 'abort' }, deps(repo)), 'symbolic-ref --short HEAD'],
			['git_checkout', () => gitCheckoutTool.execute({ cwd: repo, mode: 'ref', ref: 'topic' }, deps(repo)), 'symbolic-ref --short HEAD'],
			['git:cherry-pick', () => gitCherryPickTool.execute({ cwd: repo, refs: ['topic'] }, deps(repo)), 'symbolic-ref --short HEAD'],
		];
		for (const [name, run, failing] of calls) {
			// the read cannot run (exit 1 with a diagnostic) ...
			const failed = await withFailingRead(repo, failing, 0, run);
			assert.equal(failed.success, false, `${name} / ${failing}`);
			assert.equal(failed.failure?.kind, 'rejected', `${name} / ${failing}`);
			assert.match(failed.output, /fake failure of/, `${name} / ${failing}`);
			assert.equal(state(), before, `${name} / ${failing}: nothing changed`);
			// ... or times out: a timed-out failure, not "nothing staged" or "detached HEAD"
			const slow = await withFailingRead(repo, failing, 0, run, 'sleep');
			assert.equal(slow.success, false, `${name} / ${failing} (slow)`);
			assert.equal(slow.failure?.kind, 'timed-out', `${name} / ${failing} (slow)`);
			assert.equal(state(), before, `${name} / ${failing} (slow): nothing changed`);
		}
		// with the reads working the same calls run
		assert.equal((await gitCheckoutTool.execute({ cwd: repo, mode: 'ref', ref: 'topic' }, deps(repo))).success, true);
		assert.notEqual(state(), before);
	} finally { rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); }
});
