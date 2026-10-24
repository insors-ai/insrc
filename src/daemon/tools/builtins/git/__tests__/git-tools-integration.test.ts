/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The git tools through executeTool against a real temporary repository (Story s4). Going through the executor is
 * what checks a tool's input and its data against its declared schemas.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import type { ApprovalGate, ApprovalRequest } from '../../../types.js';
import { git, newRepo, registerForTests, toolDeps } from './_repo.js';

test('every git read tool\'s result fits its declared outputSchema', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n');
		writeFileSync(join(repo, '-dash.txt'), 'dash\n');
		git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'first', '-m', 'body');
		writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\n');
		git(repo, 'commit', '-q', '-am', 'second');
		writeFileSync(join(repo, 'a.txt'), 'changed\n');
		writeFileSync(join(repo, 'new file.txt'), 'n\n');

		const d = toolDeps(repo);
		const status = await executeTool('git_status', { cwd: repo }, d);
		assert.equal(status.success, true, status.output);
		assert.deepEqual((status.data as { unstaged: { path: string }[] }).unstaged.map(e => e.path), ['a.txt']);
		assert.deepEqual((status.data as { untracked: string[] }).untracked, ['new file.txt']);

		const log = await executeTool('git_log', { cwd: repo, limit: 5 }, d);
		assert.equal(log.success, true, log.output);
		assert.deepEqual((log.data as { commits: { subject: string }[] }).commits.map(c => c.subject), ['second', 'first']);

		const diff = await executeTool('git_diff', { cwd: repo }, d);
		assert.equal(diff.success, true, diff.output);
		assert.equal((diff.data as { files: unknown[] }).files.length, 1);
		const range = await executeTool('git_diff', { cwd: repo, from: 'HEAD~1', to: 'HEAD' }, d);
		assert.equal(range.success, true, range.output);

		const show = await executeTool('git_show', { cwd: repo, ref: 'HEAD~1' }, d);
		assert.equal(show.success, true, show.output);
		assert.equal((show.data as { subject: string }).subject, 'first');
		assert.equal((show.data as { warnings?: string[] }).warnings, undefined);

		const blame = await executeTool('git_blame', { cwd: repo, path: 'a.txt', ref: 'HEAD' }, d);
		assert.equal(blame.success, true, blame.output);
		assert.equal((blame.data as { lines: unknown[] }).lines.length, 3);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

/** A gate that records every request and answers all of them the same way. */
function gate(answer: 'declined' | 'approve'): ApprovalRequest[] {
	const requests: ApprovalRequest[] = [];
	const g: ApprovalGate = { async ask(r) { requests.push(r); return answer === 'approve' ? { requestId: r.requestId, decision: 'approve' } : 'declined'; } };
	_setApprovalGateForTests(() => g);
	return requests;
}

/** A repository with two commits, a branch b, a tag t, one stash entry, a linked worktree and a dirty a.txt. */
function richRepo(): { repo: string; wt: string; remote: string } {
	const repo = newRepo();
	writeFileSync(join(repo, 'a.txt'), 'one\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'first');
	writeFileSync(join(repo, 'a.txt'), 'two\n');
	git(repo, 'commit', '-q', '-am', 'second');
	git(repo, 'branch', 'b'); git(repo, 'tag', 't');
	writeFileSync(join(repo, 'a.txt'), 'stashed\n');
	git(repo, 'stash', 'push', '-q');
	const wt = mkdtempSync(join(tmpdir(), 'insrc-wt-')) + '/linked';
	git(repo, 'worktree', 'add', '-q', '-b', 'wtb', wt);
	writeFileSync(join(repo, 'a.txt'), 'dirty\n');
	const remote = mkdtempSync(join(tmpdir(), 'insrc-remote-'));
	git(remote, 'init', '-q', '--bare', '-b', 'main');
	git(repo, 'remote', 'add', 'origin', remote);
	git(repo, 'push', '-q', 'origin', 'main', 'b');
	return { repo, wt, remote };
}

test('destructive git calls ask through the executor and are not run when declined', async () => {
	registerForTests();
	const { repo, wt, remote } = richRepo();
	try {
		const requests = gate('declined');
		const auto = { ...toolDeps(repo), approvalMode: 'auto' as const };
		const head = git(repo, 'rev-parse', 'HEAD').trim();
		const calls: [string, Record<string, unknown>][] = [
			['git_reset', { cwd: repo, mode: 'hard', ref: 'HEAD~1' }],
			['git_push', { cwd: repo, remote: 'origin', ref: 'main', force: true }],
			['git_branch', { cwd: repo, op: 'delete', name: 'b' }],
			['git_branch', { cwd: repo, op: 'delete', name: 'b', force: true }],
			['git_tag', { cwd: repo, op: 'delete', name: 't' }],
			['git_stash', { cwd: repo, op: 'drop' }],
			['git_stash', { cwd: repo, op: 'clear' }],
			['git_worktree', { cwd: repo, op: 'remove', path: wt, force: true }],
			['git_checkout', { cwd: repo, mode: 'path', paths: ['a.txt'], ref: 'HEAD' }],
			['git_checkout', { cwd: repo, mode: 'ref', ref: 'b', discard: true }],
		];
		for (const [id, input] of calls) {
			const r = await executeTool(id, input, auto);
			assert.equal(r.success, false, `${id} ${JSON.stringify(input)}`);
			assert.equal(r.failure?.kind, 'denied', id);
			assert.equal(r.failure?.denial, 'declined', id);
		}
		// every one asked, even in auto mode, and named the repository and the exact arguments
		assert.equal(requests.length, calls.length);
		assert.ok(requests.every(r => r.approvalClass === 'destructive' && r.repoPath === repo));
		assert.equal(requests[0]?.arguments['mode'], 'hard');

		// nothing ran: the repository is as it was
		assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), head);
		assert.match(git(repo, 'branch', '--list', 'b'), /b/);
		assert.match(git(repo, 'tag', '--list', 't'), /t/);
		assert.equal(git(repo, 'stash', 'list').trim().split('\n').length, 1);
		assert.match(git(repo, 'worktree', 'list'), /linked/);
		assert.equal(readFileSync(join(repo, 'a.txt'), 'utf8'), 'dirty\n');
		assert.match(git(remote, 'rev-parse', 'refs/heads/main'), /^[0-9a-f]{40}/);

		// an ordinary mutation asks only under the common setting: in auto mode it runs without asking
		const before = requests.length;
		const soft = await executeTool('git_reset', { cwd: repo, mode: 'soft', ref: 'HEAD~1' }, auto);
		assert.equal(soft.success, true, soft.output);
		const created = await executeTool('git_branch', { cwd: repo, op: 'create', name: 'newb' }, auto);
		assert.equal(created.success, true, created.output);
		assert.equal(requests.length, before, 'auto mode asked for nothing');
		// and it does ask when the mode is manual
		const manual = await executeTool('git_branch', { cwd: repo, op: 'create', name: 'other' }, { ...toolDeps(repo), approvalMode: 'manual' as const });
		assert.equal(manual.failure?.kind, 'denied');
		assert.equal(requests.length, before + 1);
		assert.equal(requests.at(-1)?.approvalClass, 'common');

		// approved, the destructive call runs
		gate('approve');
		const done = await executeTool('git_tag', { cwd: repo, op: 'delete', name: 't' }, auto);
		assert.equal(done.success, true, done.output);
		assert.equal(git(repo, 'tag', '--list', 't').trim(), '');
	} finally {
		_setApprovalGateForTests(undefined);
		rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); rmSync(dirname(wt), { recursive: true, force: true });
	}
});

test('git_push \':dev\' asks in auto mode and is not run when declined', async () => {
	registerForTests();
	const { repo, wt, remote } = richRepo();
	try {
		git(repo, 'push', '-q', 'origin', 'b:dev');
		const devBefore = git(remote, 'rev-parse', 'refs/heads/dev').trim();
		const requests = gate('declined');
		const auto = { ...toolDeps(repo), approvalMode: 'auto' as const };
		for (const ref of [':dev', '+main', '+b:dev']) {
			const r = await executeTool('git_push', { cwd: repo, remote: 'origin', ref }, auto);
			assert.equal(r.failure?.kind, 'denied', ref);
		}
		assert.equal(requests.length, 3);
		assert.equal(git(remote, 'rev-parse', 'refs/heads/dev').trim(), devBefore, 'the remote ref is still there');

		// a plain push is not asked in auto mode and works
		const plain = await executeTool('git_push', { cwd: repo, remote: 'origin', ref: 'b' }, auto);
		assert.equal(plain.success, true, plain.output);
		assert.equal(requests.length, 3);

		// approved, the deletion goes through
		gate('approve');
		const del = await executeTool('git_push', { cwd: repo, remote: 'origin', ref: ':dev' }, auto);
		assert.equal(del.success, true, del.output);
		assert.equal(git(remote, 'branch', '--list', 'dev').trim(), '');
	} finally {
		_setApprovalGateForTests(undefined);
		rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); rmSync(dirname(wt), { recursive: true, force: true });
	}
});

test('an existing tool called with its old input returns what it returned before', async () => {
	registerForTests();
	const { repo, wt, remote } = richRepo();
	try {
		const auto = { ...toolDeps(repo), approvalMode: 'auto' as const };
		const sha = (rev: string): string => git(repo, 'rev-parse', '--short', rev).trim();

		const list = await executeTool('git_branch', { cwd: repo, op: 'list' }, auto);
		assert.equal(list.success, true, list.output);
		assert.equal(list.format, 'markdown');
		assert.ok(list.output.startsWith(`# git branches -- \`${repo}\``));
		assert.deepEqual((list.data as { branches: { name: string }[] }).branches.map(b => b.name).sort(), ['b', 'main', 'wtb']);

		const head = sha('HEAD'); const parent = sha('HEAD~1');
		const mixed = await executeTool('git_reset', { cwd: repo, mode: 'mixed', ref: 'HEAD~1' }, auto);
		assert.equal(mixed.success, true, mixed.output);
		assert.ok(mixed.output.startsWith(`Reset mixed on **main**: \`${head}\` -> \`${parent}\`.`), mixed.output);
		assert.equal((mixed.data as { mode: string; requiresForcePush: boolean }).mode, 'mixed');

		git(repo, 'checkout', '-q', '--', 'a.txt'); git(repo, 'commit', '-q', '--allow-empty', '-m', 'third');
		const pushed = await executeTool('git_push', { cwd: repo, remote: 'origin', ref: 'b' }, auto);
		assert.equal(pushed.success, true, pushed.output);
		assert.ok(pushed.output.startsWith(`Pushed \`b\` -> \`origin\` at \`${sha('b')}\`.`), pushed.output);
		assert.deepEqual({ ...(pushed.data as object) }, { remote: 'origin', ref: 'b', pushed: true, shortSha: sha('b'), forceMode: 'none' });

		const side = git(repo, 'rev-parse', 'b').trim();
		git(repo, 'checkout', '-q', '-b', 'pick', 'main~1');
		const pick = await executeTool('git:cherry-pick', { cwd: repo, refs: [side] }, auto);
		assert.equal(pick.success, true, pick.output);
		assert.equal(pick.output, 'Cherry-picked 1 ref on **pick**.');
		assert.deepEqual(pick.data, { op: 'start', refs: [side], inConflict: false, conflicts: [] });
	} finally {
		_setApprovalGateForTests(undefined);
		rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); rmSync(dirname(wt), { recursive: true, force: true });
	}
});

test('git_fetch depth 0 and 0.5 are rejected and git_fetch depth 1 runs as before', async () => {
	registerForTests();
	const { repo, wt, remote } = richRepo();
	try {
		const d = toolDeps(repo);
		for (const depth of [0, 0.5, -1]) {
			const r = await executeTool('git_fetch', { cwd: repo, depth }, d);
			assert.equal(r.success, false, String(depth));
			assert.equal(r.failure?.kind, 'rejected');
			assert.match(r.failure?.message ?? '', /depth/);
		}
		git(repo, 'remote', 'set-url', 'origin', `file://${remote}`);
		const ok = await executeTool('git_fetch', { cwd: repo, depth: 1 }, d);
		assert.equal(ok.success, true, ok.output);
		assert.equal((ok.data as { remote: string }).remote, 'origin');
		assert.match(ok.output, /^Fetched from `origin`/);
		assert.equal((await executeTool('git_fetch', { cwd: repo }, d)).success, true);
	} finally {
		rmSync(repo, { recursive: true, force: true }); rmSync(remote, { recursive: true, force: true }); rmSync(dirname(wt), { recursive: true, force: true });
	}
});
