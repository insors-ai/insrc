/** g8 of the s9 audit: git_rev_list parents. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, newRepo, toolDeps } from './_repo.js';

import { gitRevListTool } from '../rev-list.js';

test('git-rev-list-parents.test.ts: git_rev_list parents returns each commit with its parent shas', async () => {
	const repo = newRepo();
	writeFileSync(join(repo, 'a.txt'), '1\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');
	const one = git(repo, 'rev-parse', 'HEAD').trim();
	writeFileSync(join(repo, 'a.txt'), '2\n');
	git(repo, 'commit', '-q', '-am', 'two');
	const two = git(repo, 'rev-parse', 'HEAD').trim();

	const plain = await gitRevListTool.execute({ cwd: repo, rev: 'HEAD' }, toolDeps(repo));
	assert.deepEqual(plain.data, { commits: [two, one] }, 'a call without parents returns what it returned before');
	const withParents = await gitRevListTool.execute({ cwd: repo, rev: 'HEAD', parents: true }, toolDeps(repo));
	assert.deepEqual(withParents.data, { commits: [two, one], parents: [[one], []] });
	const bad = await gitRevListTool.execute({ cwd: repo, rev: 'HEAD', parents: true, count: true }, toolDeps(repo));
	assert.equal(bad.success, false, 'parents with count is refused');
});
