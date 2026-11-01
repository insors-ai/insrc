/** t2 of Story s9: the optional type of git_hash_object and gitPath of git_rev_parse. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, newRepo, toolDeps } from './_repo.js';

import { gitHashObjectTool } from '../hash-object.js';
import { gitRevParseTool } from '../rev-parse.js';

test('git-added-inputs.test.ts: the optional type of git_hash_object and gitPath of git_rev_parse leave existing calls unchanged', async () => {
	const repo = newRepo();
	writeFileSync(join(repo, 'a.txt'), 'one\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');
	const d = toolDeps(repo);

	const blob = await gitHashObjectTool.execute({ cwd: repo, path: 'a.txt' }, d);
	assert.deepEqual(blob.data, { sha: git(repo, 'hash-object', 'a.txt').trim() }, 'no type hashes a blob, as before');
	const empty = await gitHashObjectTool.execute({ cwd: repo, path: '/dev/null', type: 'tree' }, d);
	assert.deepEqual(empty.data, { sha: git(repo, 'hash-object', '-t', 'tree', '/dev/null').trim() });
	assert.equal((empty.data as { sha: string }).sha, git(repo, 'hash-object', '-t', 'tree', '/dev/null').trim());

	const head = await gitRevParseTool.execute({ cwd: repo, rev: 'HEAD' }, d);
	assert.deepEqual(head.data, { values: [git(repo, 'rev-parse', 'HEAD').trim()] }, 'a rev call is unchanged');
	const path = await gitRevParseTool.execute({ cwd: repo, gitPath: 'SQUASH_MSG' }, d);
	assert.deepEqual(path.data, { values: [git(repo, 'rev-parse', '--git-path', 'SQUASH_MSG').trim()] });
	const none = await gitRevParseTool.execute({ cwd: repo }, d);
	assert.equal(none.success, false, 'a call with nothing to ask is still refused');
});
