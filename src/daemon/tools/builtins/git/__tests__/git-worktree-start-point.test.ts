/** g9 of the s9 audit: git_worktree add startPoint. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, newRepo, toolDeps } from './_repo.js';

import { gitWorktreeTool } from '../worktree.js';

test('git-worktree-start-point.test.ts: git_worktree add with createBranch starts the new branch at startPoint', async () => {
	const repo = newRepo();
	writeFileSync(join(repo, 'a.txt'), '1\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');
	const one = git(repo, 'rev-parse', 'HEAD').trim();
	writeFileSync(join(repo, 'a.txt'), '2\n');
	git(repo, 'commit', '-q', '-am', 'two');
	const dir = join(mkdtempSync(join(tmpdir(), 'insrc-wt-')), 'wt');

	const added = await gitWorktreeTool.execute({ cwd: repo, op: 'add', path: dir, branch: 'tmp-branch', createBranch: true, startPoint: one }, toolDeps(repo));
	assert.equal(added.success, true, added.output);
	assert.equal(git(repo, 'rev-parse', 'tmp-branch').trim(), one);
	const refused = await gitWorktreeTool.execute({ cwd: repo, op: 'add', path: join(dir, 'x'), branch: 'main', startPoint: one }, toolDeps(repo));
	assert.equal(refused.success, false, 'startPoint without createBranch or detach is refused');
});
