/** t2 of Story s9: git_merge_tree. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, newRepo, toolDeps } from './_repo.js';

import { gitMergeTreeTool } from '../merge-tree.js';

test('git-merge-tree.test.ts: git_merge_tree reports a clean and a conflicting merge in a real temporary repository', async () => {
	const repo = newRepo();
	writeFileSync(join(repo, 'a.txt'), 'base\n');
	writeFileSync(join(repo, 'b.txt'), 'base\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'base');
	git(repo, 'checkout', '-q', '-b', 'side');
	writeFileSync(join(repo, 'a.txt'), 'side\n');
	git(repo, 'commit', '-q', '-am', 'side a');
	git(repo, 'checkout', '-q', 'main');
	writeFileSync(join(repo, 'b.txt'), 'main\n');
	git(repo, 'commit', '-q', '-am', 'main b');

	const clean = await gitMergeTreeTool.execute({ cwd: repo, a: 'main', b: 'side' }, toolDeps(repo));
	assert.equal(clean.success, true, clean.output);
	const c = clean.data as { tree: string; clean: boolean };
	assert.equal(c.clean, true);
	assert.equal(git(repo, 'show', `${c.tree}:a.txt`), 'side\n', 'the merged tree holds both changes');
	assert.equal(git(repo, 'show', `${c.tree}:b.txt`), 'main\n');
	assert.equal(git(repo, 'status', '--porcelain'), '', 'the work tree and the index are untouched');

	git(repo, 'checkout', '-q', '-b', 'clash', 'main~1');
	writeFileSync(join(repo, 'b.txt'), 'clash\n');
	git(repo, 'commit', '-q', '-am', 'clash b');
	const conflict = await gitMergeTreeTool.execute({ cwd: repo, a: 'main', b: 'clash' }, toolDeps(repo));
	assert.equal(conflict.success, true, conflict.output);
	assert.equal((conflict.data as { clean: boolean }).clean, false);
	assert.match((conflict.data as { tree: string }).tree, /^[0-9a-f]{40,64}$/);
	const bad = await gitMergeTreeTool.execute({ cwd: repo, a: 'main', b: 'no-such-rev' }, toolDeps(repo));
	assert.equal(bad.success, false);
});
