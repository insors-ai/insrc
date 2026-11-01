/** t2 of Story s9: git_diff_tree. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, newRepo, toolDeps } from './_repo.js';

import { gitDiffTreeTool } from '../diff-tree.js';

test('git-diff-tree.test.ts: git_diff_tree lists the changed paths of a commit in a real temporary repository', async () => {
	const repo = newRepo();
	writeFileSync(join(repo, 'a.txt'), '1\n');
	writeFileSync(join(repo, 'name with space.txt'), '1\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'root');
	const root = git(repo, 'rev-parse', 'HEAD').trim();
	writeFileSync(join(repo, 'a.txt'), '2\n');
	writeFileSync(join(repo, 'new\nline.txt'), 'x\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'second');

	const second = await gitDiffTreeTool.execute({ cwd: repo, rev: 'HEAD' }, toolDeps(repo));
	assert.deepEqual((second.data as { paths: string[] }).paths.sort(), ['a.txt', 'new\nline.txt'], 'names come back exactly');
	const plainRoot = await gitDiffTreeTool.execute({ cwd: repo, rev: root }, toolDeps(repo));
	assert.deepEqual(plainRoot.data, { paths: [] }, 'a root commit lists nothing without root');
	const withRoot = await gitDiffTreeTool.execute({ cwd: repo, rev: root, root: true }, toolDeps(repo));
	assert.deepEqual((withRoot.data as { paths: string[] }).paths.sort(), ['a.txt', 'name with space.txt']);
	const bad = await gitDiffTreeTool.execute({ cwd: repo, rev: 'no-such-rev' }, toolDeps(repo));
	assert.equal(bad.success, false);
	assert.equal(bad.failure?.kind, 'rejected');
});
