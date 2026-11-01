/** g10 of the s9 audit: git_diff againstWorktree. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, newRepo, toolDeps } from './_repo.js';

import { gitDiffTool } from '../diff.js';

test('git-diff-against-worktree.test.ts: git_diff againstWorktree compares a rev with the working tree', async () => {
	const repo = newRepo();
	writeFileSync(join(repo, 'a.txt'), '1\n');
	writeFileSync(join(repo, 'b.txt'), '1\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');
	writeFileSync(join(repo, 'a.txt'), 'staged\n');
	git(repo, 'add', 'a.txt');
	writeFileSync(join(repo, 'b.txt'), 'unstaged\n');
	writeFileSync(join(repo, 'c.txt'), 'untracked\n');

	const r = await gitDiffTool.execute({ cwd: repo, from: 'HEAD', againstWorktree: true }, toolDeps(repo));
	assert.equal(r.success, true, r.output);
	const data = r.data as { mode: string; files: { path: string }[] };
	assert.equal(data.mode, 'worktree');
	assert.deepEqual(data.files.map(f => f.path).sort(), ['a.txt', 'b.txt'], 'staged and unstaged changes of tracked files, not the untracked one');
	const both = await gitDiffTool.execute({ cwd: repo, from: 'HEAD', to: 'HEAD', againstWorktree: true }, toolDeps(repo));
	assert.equal(both.success, false, 'a to is refused');
});

test('git-diff-against-worktree.test.ts: git_diff and git_show excludeDeleted leave out deleted files and keep an edit that only removes lines', async () => {
	const { gitShowTool } = await import('../show.js');
	const repo = newRepo();
	writeFileSync(join(repo, 'gone.txt'), 'one\ntwo\n');
	writeFileSync(join(repo, 'shrunk.txt'), 'one\ntwo\n');
	writeFileSync(join(repo, 'kept.txt'), 'one\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'base');
	const base = git(repo, 'rev-parse', 'HEAD').trim();
	git(repo, 'rm', '-q', 'gone.txt');
	writeFileSync(join(repo, 'shrunk.txt'), 'one\n');           // only removes a line: its change label reads 'deleted'
	writeFileSync(join(repo, 'kept.txt'), 'one\nmore\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'change');

	const paths = (r: { data?: unknown }): string[] => (r.data as { files: { path: string }[] }).files.map(f => f.path).sort();
	assert.deepEqual(paths(await gitDiffTool.execute({ cwd: repo, from: base, to: 'HEAD' }, toolDeps(repo))), ['gone.txt', 'kept.txt', 'shrunk.txt']);
	assert.deepEqual(paths(await gitDiffTool.execute({ cwd: repo, from: base, to: 'HEAD', excludeDeleted: true }, toolDeps(repo))), ['kept.txt', 'shrunk.txt']);
	assert.deepEqual(paths(await gitShowTool.execute({ cwd: repo, ref: 'HEAD', excludeDeleted: true }, toolDeps(repo))), ['kept.txt', 'shrunk.txt']);
});
