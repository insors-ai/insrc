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
