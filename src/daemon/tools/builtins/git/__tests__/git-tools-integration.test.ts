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

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolveApprovalClass } from '../../../approval-policy.js';
import { listTools } from '../../../registry.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { gitCatFileTool } from '../cat-file.js';
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


/** A repository holding a binary file, a text file with a non-ASCII character, and a bigger file. */
function binaryRepo(): { repo: string; bytes: Buffer; sha: Record<string, string> } {
	const repo = newRepo();
	const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
	writeFileSync(join(repo, 'bin.bin'), bytes);
	writeFileSync(join(repo, 't.txt'), 'h\u00e9llo\n');
	writeFileSync(join(repo, 'big.txt'), 'x'.repeat(5000));
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'files');
	const sha = (rev: string): string => git(repo, 'rev-parse', rev).trim();
	return { repo, bytes, sha: { bin: sha('HEAD:bin.bin'), txt: sha('HEAD:t.txt'), head: sha('HEAD') } };
}

/** A `git` on PATH that runs `body` (a shell script) instead of git. */
function scriptedGit(dir: string, body: string): string {
	const bin = join(dir, 'scripted-bin');
	mkdirSync(bin, { recursive: true });
	writeFileSync(join(bin, 'git'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
	return bin;
}

test('every new read tool returns data that fits its outputSchema', async () => {
	registerForTests();
	const { repo } = binaryRepo();
	const unborn = newRepo();
	try {
		git(repo, 'branch', 'side'); git(repo, 'tag', 'v1');
		const d = toolDeps(repo);
		const calls: [string, Record<string, unknown>, (data: any) => void][] = [
			['git_rev_parse', { rev: 'HEAD' }, data => assert.match(data.values[0], /^[0-9a-f]{40}$/)],
			['git_rev_parse', { rev: 'HEAD', short: true }, data => assert.match(data.values[0], /^[0-9a-f]{7,}$/)],
			['git_rev_parse', { rev: 'HEAD', abbrevRef: true }, data => assert.deepEqual(data.values, ['main'])],
			['git_rev_parse', { rev: 'v1', verify: true }, data => assert.equal(data.values.length, 1)],
			['git_rev_parse', { showToplevel: true, isInsideWorkTree: true }, data => assert.equal(data.values[1], 'true')],
			['git_rev_parse', { isShallow: true }, data => assert.deepEqual(data.values, ['false'])],
			['git_rev_parse', { gitDir: true }, data => assert.match(data.values[0], /\.git$/)],
			['git_rev_list', { rev: 'HEAD' }, data => assert.equal(data.commits.length, 1)],
			['git_rev_list', { rev: 'HEAD', count: true }, data => assert.equal(data.count, 1)],
			['git_rev_list', { rev: 'HEAD', maxParents: 0, firstParent: true, limit: 5 }, data => assert.equal(data.commits.length, 1)],
			['git_ls_files', {}, data => assert.deepEqual(data.files.sort(), ['big.txt', 'bin.bin', 't.txt'])],
			['git_ls_files', { paths: ['t.txt'] }, data => assert.deepEqual(data.files, ['t.txt'])],
			['git_ls_files', { others: true }, data => assert.deepEqual(data.files, [])],
			['git_ls_tree', { rev: 'HEAD' }, data => assert.equal(data.entries.length, 3)],
			['git_ls_tree', { rev: 'HEAD', nameOnly: true, recursive: true }, data => assert.equal(data.names.length, 3)],
			['git_ls_tree', { rev: 'HEAD', paths: ['bin.bin'] }, data => assert.equal(data.entries[0].path, 'bin.bin')],
			['git_cat_file', { rev: 'HEAD:t.txt' }, data => assert.equal(data.objects[0].content, 'h\u00e9llo\n')],
			['git_cat_file', { rev: 'HEAD:t.txt', exists: true }, data => assert.deepEqual(data, { exists: true })],
			['git_cat_file', { rev: 'HEAD:t.txt', type: true }, data => assert.deepEqual(data, { type: 'blob', size: 7 })],
			['git_show_ref', {}, data => assert.deepEqual(data.refs.map((r: { name: string }) => r.name).sort(), ['refs/heads/main', 'refs/heads/side', 'refs/tags/v1'])],
			['git_show_ref', { ref: 'refs/heads/main', verify: true }, data => assert.equal(data.refs.length, 1)],
			['git_show_ref', { ref: 'refs/heads/main', exists: true }, data => assert.equal(data.refs[0].name, 'refs/heads/main')],
			['git_show_ref', { ref: 'refs/heads/gone', exists: true }, data => assert.deepEqual(data.refs, [])],
			['git_show_ref', { ref: 'nomatch' }, data => assert.deepEqual(data.refs, [])],
			['git_merge_base', { a: 'HEAD', b: 'side' }, data => assert.equal(data.bases.length, 1)],
			['git_merge_base', { a: 'side', b: 'HEAD', isAncestor: true }, data => assert.deepEqual(data, { isAncestor: true })],
			['git_hash_object', { path: 'bin.bin' }, data => assert.match(data.sha, /^[0-9a-f]{40}$/)],
			['git_symbolic_ref', { ref: 'HEAD', op: 'get' }, data => assert.deepEqual(data, { target: 'refs/heads/main' })],
			['git_path_history', { path: 't.txt' }, data => assert.equal(data.commits.length, 1)],
			['git_path_history', {}, data => assert.match(data.commits[0].committerTime, /^\d{4}-\d\d-\d\dT/)],
			['git_for_each_ref', {}, data => assert.deepEqual(data.refs.map((r: Record<string, string>) => r['refname']).sort(), ['refs/heads/main', 'refs/heads/side', 'refs/tags/v1'])],
			['git_for_each_ref', { pattern: ['refs/tags'], fields: ['refname:short', 'objecttype'] }, data => assert.deepEqual(data.refs, [{ 'refname:short': 'v1', objecttype: 'commit' }])],
		];
		for (const [id, input, check] of calls) {
			const r = await executeTool(id, { cwd: repo, ...input }, d);
			assert.equal(r.success, true, `${id} ${JSON.stringify(input)}: ${r.output}`);
			check(r.data);
		}

		// a detached HEAD
		git(repo, 'checkout', '-q', '--detach');
		const detached = await executeTool('git_rev_parse', { cwd: repo, rev: 'HEAD', abbrevRef: true }, d);
		assert.deepEqual((detached.data as { values: string[] }).values, ['HEAD']);
		assert.equal((await executeTool('git_rev_list', { cwd: repo, rev: 'HEAD', count: true }, d)).success, true);

		// an unborn branch: the tools that can answer do, the others fail with a failure rather than invalid data
		const u = toolDeps(unborn);
		assert.deepEqual((await executeTool('git_ls_files', { cwd: unborn }, u)).data, { files: [] });
		assert.deepEqual((await executeTool('git_for_each_ref', { cwd: unborn }, u)).data, { refs: [] });
		assert.equal((await executeTool('git_rev_parse', { cwd: unborn, gitDir: true }, u)).success, true);
		for (const [id, input] of [['git_rev_list', { rev: 'HEAD' }], ['git_ls_tree', { rev: 'HEAD' }], ['git_rev_parse', { rev: 'HEAD', verify: true }], ['git_cat_file', { rev: 'HEAD:x' , type: true }]] as const) {
			const r = await executeTool(id, { cwd: unborn, ...input }, u);
			assert.equal(r.success, false, id);
			assert.ok(r.failure !== undefined, id);
		}

		// unsafe arguments are refused before git runs, and every new tool is a read
		for (const [id, input] of [['git_rev_parse', { rev: '--exec-path' }], ['git_rev_list', { rev: '--all' }], ['git_ls_tree', { rev: '-r' }], ['git_cat_file', { rev: '--batch-all-objects' }],
			['git_for_each_ref', { contains: '--help' }], ['git_ls_files', { paths: ['a\0b'] }]] as const) {
			const r = await executeTool(id, { cwd: repo, ...input }, d);
			assert.equal(r.success, false, id);
			assert.match(r.output, /unsafe/, id);
		}
	} finally { rmSync(repo, { recursive: true, force: true }); rmSync(unborn, { recursive: true, force: true }); }
});

test('git_cat_file returns a binary blob unchanged in base64, batches several revs through stdin, ignores a replacement ref when isolated, rejects an object over maxBytes and stops on cancellation', async () => {
	registerForTests();
	const { repo, bytes, sha } = binaryRepo();
	const savedPath = process.env['PATH'];
	try {
		const d = toolDeps(repo);
		// binary: lossless as base64, an error as utf8
		const b64 = await executeTool('git_cat_file', { cwd: repo, rev: 'HEAD:bin.bin', encoding: 'base64' }, d);
		const obj = (b64.data as { objects: { contentBase64: string; sha: string; size: number; type: string }[] }).objects[0]!;
		assert.deepEqual(Buffer.from(obj.contentBase64, 'base64'), bytes);
		assert.equal(obj.sha, sha['bin']);
		assert.deepEqual([obj.type, obj.size], ['blob', 256]);
		const asText = await executeTool('git_cat_file', { cwd: repo, rev: 'HEAD:bin.bin' }, d);
		assert.equal(asText.success, false);
		assert.match(asText.output, /not valid UTF-8/);

		// several revs in one process, a missing one in the middle, and a path applied to each
		const batch = await executeTool('git_cat_file', { cwd: repo, revs: ['HEAD:t.txt', 'HEAD:nope.txt', sha['head']!, 'HEAD'], encoding: 'base64' }, d);
		const objects = (batch.data as { objects: { rev: string; exists: boolean; type?: string; contentBase64?: string }[] }).objects;
		assert.deepEqual(objects.map(o => [o.rev, o.exists, o.type]), [['HEAD:t.txt', true, 'blob'], ['HEAD:nope.txt', false, undefined], [sha['head'], true, 'commit'], ['HEAD', true, 'commit']]);
		assert.equal(Buffer.from(objects[0]!.contentBase64!, 'base64').toString('utf8'), 'h\u00e9llo\n');
		const withPath = await executeTool('git_cat_file', { cwd: repo, revs: ['HEAD', 'HEAD~0'], path: 't.txt' }, d);
		assert.deepEqual((withPath.data as { objects: { content: string }[] }).objects.map(o => o.content), ['h\u00e9llo\n', 'h\u00e9llo\n']);

		// exists, type and size
		assert.deepEqual((await executeTool('git_cat_file', { cwd: repo, rev: 'HEAD:nope.txt', exists: true }, d)).data, { exists: false });
		assert.deepEqual((await executeTool('git_cat_file', { cwd: repo, rev: 'HEAD:bin.bin', size: true }, d)).data, { type: 'blob', size: 256 });
		const noType = await executeTool('git_cat_file', { cwd: repo, rev: 'HEAD:nope.txt', type: true }, d);
		assert.equal(noType.success, false);

		// a replacement ref changes what a plain read sees and does not change an isolated one
		const replacement = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: repo, input: 'replaced\n', encoding: 'utf8' }).trim();
		git(repo, 'replace', sha['txt']!, replacement);
		const isolated = await executeTool('git_cat_file', { cwd: repo, rev: sha['txt']! }, d);
		assert.equal((isolated.data as { objects: { content: string }[] }).objects[0]?.content, 'h\u00e9llo\n', 'isolated: the original object');
		const plain = await executeTool('git_cat_file', { cwd: repo, rev: sha['txt']!, isolated: false }, d);
		assert.equal((plain.data as { objects: { content: string }[] }).objects[0]?.content, 'replaced\n', 'not isolated: the replacement');

		// inherited configuration does not reach an isolated read
		process.env['GIT_NO_REPLACE_OBJECTS'] = '';
		process.env['GIT_DIR'] = '/nonexistent-git-dir';
		try {
			const viaEnv = await executeTool('git_cat_file', { cwd: repo, rev: 'HEAD:t.txt' }, d);
			assert.equal(viaEnv.success, true, `GIT_DIR in the environment is ignored: ${viaEnv.output}`);
		} finally { delete process.env['GIT_DIR']; delete process.env['GIT_NO_REPLACE_OBJECTS']; }

		// an object over maxBytes, and a read cut by the whole-call budget, fail
		const big = await executeTool('git_cat_file', { cwd: repo, rev: 'HEAD:big.txt', maxBytes: 100 }, d);
		assert.equal(big.success, false);
		assert.match(big.output, /5000 bytes, over maxBytes 100/);
		assert.equal((await executeTool('git_cat_file', { cwd: repo, rev: 'HEAD:big.txt', maxBytes: 5000 }, d)).success, true);
		const cut = await executeTool('git_cat_file', { cwd: repo, rev: 'HEAD:big.txt', stdoutLimit: 100 }, d);
		assert.equal(cut.success, false);
		assert.match(cut.output, /byte limit/);

		// cancellation kills the process
		process.env['PATH'] = `${scriptedGit(repo + '-fake', 'exec sleep 5')}:${savedPath ?? ''}`;
		const ctl = new AbortController();
		setTimeout(() => ctl.abort(), 100);
		const started = Date.now();
		const cancelled = await gitCatFileTool.execute({ cwd: repo, rev: 'HEAD' }, { ...d, signal: ctl.signal });
		assert.equal(cancelled.success, false);
		assert.match(cancelled.output, /cancelled/);
		assert.ok(Date.now() - started < 4000, 'the process was killed, not waited for');
	} finally {
		process.env['PATH'] = savedPath;
		rmSync(repo, { recursive: true, force: true }); rmSync(repo + '-fake', { recursive: true, force: true });
	}
});

test('git_for_each_ref contains, merged, pointsAt and noMerged select the right refs', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		writeFileSync(join(repo, 'a'), '1'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'c1');
		const c1 = git(repo, 'rev-parse', 'HEAD').trim();
		git(repo, 'branch', 'old'); git(repo, 'tag', 'v1');
		writeFileSync(join(repo, 'a'), '2'); git(repo, 'commit', '-q', '-am', 'c2');
		git(repo, 'checkout', '-q', '-b', 'feat');
		writeFileSync(join(repo, 'b'), 'b'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'f1');
		const f1 = git(repo, 'rev-parse', 'HEAD').trim();
		git(repo, 'checkout', '-q', 'main');
		const d = toolDeps(repo);
		const names = async (input: Record<string, unknown>): Promise<string[]> => {
			const r = await executeTool('git_for_each_ref', { cwd: repo, pattern: ['refs/heads'], fields: ['refname:short'], ...input }, d);
			assert.equal(r.success, true, r.output);
			return (r.data as { refs: Record<string, string>[] }).refs.map(x => x['refname:short']!).sort();
		};
		assert.deepEqual(await names({ contains: c1 }), ['feat', 'main', 'old']);
		assert.deepEqual(await names({ contains: f1 }), ['feat']);
		assert.deepEqual(await names({ merged: 'main' }), ['main', 'old']);
		assert.deepEqual(await names({ noMerged: 'main' }), ['feat']);
		assert.deepEqual(await names({ merged: 'feat' }), ['feat', 'main', 'old']);
		assert.deepEqual(await names({ noMerged: 'feat' }), []);
		assert.deepEqual(await names({ pointsAt: c1 }), ['old']);
		assert.deepEqual(await names({ pointsAt: f1 }), ['feat']);
		assert.deepEqual(await names({ merged: 'main', contains: c1 }), ['main', 'old']);
		// remote-tracking refs and tags through patterns
		const remote = mkdtempSync(join(tmpdir(), 'insrc-feremote-'));
		git(remote, 'init', '-q', '--bare', '-b', 'main');
		git(repo, 'remote', 'add', 'origin', remote); git(repo, 'push', '-q', 'origin', 'main', 'feat');
		const tracking = await names({ pattern: ['refs/remotes/origin'], contains: f1 });
		assert.deepEqual(tracking, ['origin/feat']);
		assert.deepEqual(await names({ pattern: ['refs/tags'], pointsAt: c1 }), ['v1']);
		rmSync(remote, { recursive: true, force: true });
		// sort and count
		const sorted = await executeTool('git_for_each_ref', { cwd: repo, pattern: ['refs/heads'], fields: ['refname:short'], sort: '-refname', count: 2 }, d);
		assert.deepEqual((sorted.data as { refs: Record<string, string>[] }).refs.map(x => x['refname:short']), ['old', 'main']);
		// bad input
		for (const input of [{ sort: 'x;y' }, { fields: ['nope'] }, { count: 0 }, { merged: '--all' }, { pattern: ['-x'] }]) {
			const r = await executeTool('git_for_each_ref', { cwd: repo, ...input }, d);
			assert.equal(r.success, false, JSON.stringify(input));
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('git_cat_file reports git diagnostics exceed byte limit when stderr passes its limit', async () => {
	registerForTests();
	const repo = newRepo();
	const savedPath = process.env['PATH'];
	try {
		process.env['PATH'] = `${scriptedGit(repo + '-fake', 'yes diagnostics >&2')}:${savedPath ?? ''}`;
		const r = await gitCatFileTool.execute({ cwd: repo, rev: 'HEAD', stderrLimit: 100 }, toolDeps(repo));
		assert.equal(r.success, false);
		assert.equal(r.output, '[git_cat_file] failed: git diagnostics exceed byte limit');
		assert.equal(r.failure?.kind, 'rejected');
	} finally {
		process.env['PATH'] = savedPath;
		rmSync(repo, { recursive: true, force: true }); rmSync(repo + '-fake', { recursive: true, force: true });
	}
});


test('git_merge_base answers all, unrelated and isAncestor cases with data that fits its schema', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		const commit = (name: string): string => { writeFileSync(join(repo, name), name); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', name); return git(repo, 'rev-parse', 'HEAD').trim(); };
		const x = commit('x');
		git(repo, 'branch', 'A'); git(repo, 'branch', 'B');
		git(repo, 'checkout', '-q', 'A'); const a1 = commit('a1');
		git(repo, 'checkout', '-q', 'B'); const b1 = commit('b1');
		// a criss-cross: A merges B's tip and B merges A's tip, so A2 and B2 have two best common ancestors
		git(repo, 'checkout', '-q', 'A'); git(repo, 'merge', '-q', '--no-ff', '-m', 'A2', b1);
		git(repo, 'checkout', '-q', 'B'); git(repo, 'merge', '-q', '--no-ff', '-m', 'B2', a1);
		const d = toolDeps(repo);
		const run = async (input: Record<string, unknown>) => executeTool('git_merge_base', { cwd: repo, ...input }, d);

		const one = await run({ a: 'main', b: 'A' });
		assert.deepEqual((one.data as { bases: string[] }).bases, [x]);
		const all = await run({ a: 'A', b: 'B', all: true });
		assert.deepEqual([...(all.data as { bases: string[] }).bases].sort(), [a1, b1].sort(), 'every best common ancestor');
		assert.equal(((await run({ a: 'A', b: 'B' })).data as { bases: string[] }).bases.length, 1, 'without all, one');

		// unrelated histories: no bases, and the call succeeds
		git(repo, 'checkout', '-q', '--orphan', 'orphan'); git(repo, 'rm', '-rfq', '.');
		writeFileSync(join(repo, 'o'), 'o'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'orphan');
		const none = await run({ a: 'main', b: 'orphan' });
		assert.equal(none.success, true, none.output);
		assert.deepEqual(none.data, { bases: [] });
		assert.deepEqual((await run({ a: 'main', b: 'orphan', all: true })).data, { bases: [] });

		// isAncestor: exit 0 is true, exit 1 is false, anything else is a failure
		assert.deepEqual((await run({ a: x, b: 'A', isAncestor: true })).data, { isAncestor: true });
		assert.deepEqual((await run({ a: 'A', b: x, isAncestor: true })).data, { isAncestor: false });
		assert.deepEqual((await run({ a: 'main', b: 'orphan', isAncestor: true })).data, { isAncestor: false });
		const bad = await run({ a: 'nosuchrev', b: 'A', isAncestor: true });
		assert.equal(bad.success, false);
		assert.equal(bad.failure?.kind, 'rejected');
		const badBase = await run({ a: 'nosuchrev', b: 'A' });
		assert.equal(badBase.success, false);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('git_symbolic_ref sets, reads and deletes refs/remotes/origin/HEAD with the classes none, common and destructive', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		writeFileSync(join(repo, 'a'), '1'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'c1');
		git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
		git(repo, 'branch', 'other');
		const d = toolDeps(repo);
		const requests: string[] = [];
		_setApprovalGateForTests(() => ({ async ask(r) { requests.push(`${r.toolId}:${r.approvalClass}`); return { requestId: r.requestId, decision: 'approve' as const }; } }));
		const auto = { ...d, approvalMode: 'auto' as const };
		const symref = 'refs/remotes/origin/HEAD';
		const run = (input: Record<string, unknown>) => executeTool('git_symbolic_ref', { cwd: repo, ...input }, auto);

		// get is a read: no question; set is common: none in auto mode; delete is destructive: asks in every mode
		assert.deepEqual((await run({ ref: 'HEAD', op: 'get' })).data, { target: 'refs/heads/main' });
		assert.deepEqual(requests, []);
		const set = await run({ ref: symref, op: 'set', target: 'refs/remotes/origin/main' });
		assert.equal(set.success, true, set.output);
		assert.deepEqual(set.data, { target: 'refs/remotes/origin/main' });
		assert.deepEqual(requests, [], 'a set asks only under the common setting');
		assert.equal(git(repo, 'symbolic-ref', symref).trim(), 'refs/remotes/origin/main');
		assert.deepEqual((await run({ ref: symref, op: 'get' })).data, { target: 'refs/remotes/origin/main' });

		// a ref that is not symbolic: a failure, or null with quiet
		const plain = await run({ ref: 'refs/heads/main', op: 'get' });
		assert.equal(plain.success, false);
		assert.deepEqual((await run({ ref: 'refs/heads/main', op: 'get', quiet: true })).data, { target: null });

		// set moves HEAD itself
		assert.equal((await run({ ref: 'HEAD', op: 'set', target: 'refs/heads/other' })).success, true);
		assert.equal(git(repo, 'symbolic-ref', '--short', 'HEAD').trim(), 'other');
		assert.equal((await executeTool('git_symbolic_ref', { cwd: repo, ref: 'HEAD', op: 'set', target: 'refs/heads/main' }, { ...d, approvalMode: 'manual' as const })).success, true);
		assert.deepEqual(requests, ['git_symbolic_ref:common']);

		// delete asks, and is not run when declined
		_setApprovalGateForTests(() => ({ async ask(r) { requests.push(`${r.toolId}:${r.approvalClass}`); return 'declined' as const; } }));
		const declined = await run({ ref: symref, op: 'delete' });
		assert.equal(declined.failure?.kind, 'denied');
		assert.equal(git(repo, 'symbolic-ref', symref).trim(), 'refs/remotes/origin/main', 'still there');
		assert.equal(requests.at(-1), 'git_symbolic_ref:destructive');
		_setApprovalGateForTests(() => ({ async ask(r) { return { requestId: r.requestId, decision: 'approve' as const }; } }));
		const deleted = await run({ ref: symref, op: 'delete' });
		assert.equal(deleted.success, true, deleted.output);
		assert.deepEqual(deleted.data, { target: null });
		assert.deepEqual((await run({ ref: symref, op: 'get', quiet: true })).data, { target: null });

		// bad input
		assert.equal((await run({ ref: 'HEAD', op: 'set' })).success, false);
		assert.equal((await run({ ref: '-d', op: 'get' })).success, false);
		assert.equal((await run({ ref: 'HEAD', op: 'set', target: '--x' })).success, false);
	} finally { _setApprovalGateForTests(undefined); rmSync(repo, { recursive: true, force: true }); }
});

test('git_fetch_refs applies the policy-refresh and maintenance fetches and is destructive for a forced refspec that targets a local branch', async () => {
	registerForTests();
	const remote = mkdtempSync(join(tmpdir(), 'insrc-fr-remote-'));
	const repo = newRepo();
	const savedPath = process.env['PATH'];
	try {
		git(remote, 'init', '-q', '--bare', '-b', 'main');
		writeFileSync(join(repo, 'a'), '1'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'c1');
		git(repo, 'tag', 'v1');
		git(repo, 'remote', 'add', 'origin', remote);
		git(repo, 'push', '-q', 'origin', 'main', 'v1');
		git(repo, 'checkout', '-q', '-b', 'other'); writeFileSync(join(repo, 'b'), '2'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'c2');
		git(repo, 'push', '-q', 'origin', 'other');
		git(repo, 'checkout', '-q', 'main');
		const mainSha = git(repo, 'rev-parse', 'main').trim();
		const clone = mkdtempSync(join(tmpdir(), 'insrc-fr-clone-'));
		git(clone, 'init', '-q', '-b', 'main'); git(clone, 'remote', 'add', 'origin', remote);
		const d = toolDeps(clone);

		// the classes: remote-tracking destinations are none even when forced; another ref is common, destructive when forced
		const classOf = (refspecs: string[]): string => resolveApprovalClass(listTools().find(t => t.id === 'git_fetch_refs')!, { remote: 'origin', refspecs });
		assert.equal(classOf(['+refs/heads/main:refs/remotes/origin/main']), 'none');
		assert.equal(classOf(['refs/heads/main:refs/remotes/origin/main', '+refs/heads/o:refs/remotes/origin/o']), 'none');
		assert.equal(classOf(['refs/heads/a:refs/heads/b']), 'common');
		assert.equal(classOf(['+refs/heads/a:refs/heads/b']), 'destructive');
		assert.equal(classOf(['+refs/heads/a:refs/tags/t']), 'destructive');
		assert.equal(classOf(['+refs/heads/main:refs/remotes/origin/main', '+refs/heads/a:refs/heads/b']), 'destructive');
		assert.equal(classOf(['refs/heads/main']), 'destructive', 'not an explicit pair: unknown destination');

		// the policy-refresh fetch: only the named ref, no tags, no FETCH_HEAD, an empty refmap
		const refresh = await executeTool('git_fetch_refs', {
			cwd: clone, remote: 'origin', refspecs: ['+refs/heads/main:refs/remotes/origin/main'],
			noTags: true, noWriteFetchHead: true, noRecurseSubmodules: true, noPrune: true, refmap: '',
		}, { ...d, approvalMode: 'auto' as const });
		assert.equal(refresh.success, true, refresh.output);
		assert.deepEqual(refresh.data, { updated: [{ ref: 'refs/remotes/origin/main', old: '0'.repeat(40), new: mainSha }] });
		assert.equal(git(clone, 'for-each-ref', '--format=%(refname)', 'refs/remotes').trim(), 'refs/remotes/origin/main', 'only the named ref was fetched');
		assert.equal(git(clone, 'tag', '--list').trim(), '', 'no tags');
		assert.equal(existsSync(join(clone, '.git', 'FETCH_HEAD')), false, 'no FETCH_HEAD');

		// the maintenance fetch of another branch; fetching it again updates nothing
		const maintenance = await executeTool('git_fetch_refs', { cwd: clone, remote: 'origin', refspecs: ['+refs/heads/other:refs/remotes/origin/other'] }, d);
		assert.equal(maintenance.success, true, maintenance.output);
		assert.equal((maintenance.data as { updated: { ref: string }[] }).updated[0]?.ref, 'refs/remotes/origin/other');
		const again = await executeTool('git_fetch_refs', { cwd: clone, remote: 'origin', refspecs: ['+refs/heads/other:refs/remotes/origin/other'] }, d);
		assert.deepEqual(again.data, { updated: [] });

		// a forced refspec into a local branch asks in every mode and is not run when declined
		const requests: string[] = [];
		_setApprovalGateForTests(() => ({ async ask(r) { requests.push(r.approvalClass); return 'declined' as const; } }));
		const auto = { ...d, approvalMode: 'auto' as const };
		const forced = await executeTool('git_fetch_refs', { cwd: clone, remote: 'origin', refspecs: ['+refs/heads/main:refs/heads/main'] }, auto);
		assert.equal(forced.failure?.kind, 'denied');
		assert.deepEqual(requests, ['destructive']);
		assert.equal(git(clone, 'branch', '--list', 'main').trim(), '', 'no local branch was written');
		_setApprovalGateForTests(undefined);

		// failures keep their kind: an unreachable remote, a refused sign-in, input that is not an explicit pair
		const unreachable = await executeTool('git_fetch_refs', { cwd: clone, remote: '/nonexistent/remote', refspecs: ['+a:refs/remotes/x/a'] }, d);
		assert.equal(unreachable.success, false);
		assert.equal(unreachable.failure?.kind, 'unreachable');
		const bin = join(clone + '-fake', 'bin'); mkdirSync(bin, { recursive: true });
		writeFileSync(join(bin, 'git'), '#!/bin/sh\necho "fatal: Authentication failed for https://example.invalid/x.git/" >&2\nexit 128\n', { mode: 0o755 });
		process.env['PATH'] = `${bin}:${savedPath ?? ''}`;
		const signin = await executeTool('git_fetch_refs', { cwd: clone, remote: 'origin', refspecs: ['+a:refs/remotes/x/a'] }, d);
		assert.equal(signin.failure?.kind, 'missing-signin');
		process.env['PATH'] = savedPath;
		assert.equal((await executeTool('git_fetch_refs', { cwd: clone, remote: 'origin', refspecs: ['refs/heads/main'] }, auto)).success, false);
		rmSync(clone, { recursive: true, force: true }); rmSync(clone + '-fake', { recursive: true, force: true });
	} finally {
		process.env['PATH'] = savedPath; _setApprovalGateForTests(undefined);
		rmSync(remote, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true });
	}
});
