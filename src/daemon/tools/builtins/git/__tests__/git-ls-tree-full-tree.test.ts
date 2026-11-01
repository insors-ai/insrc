/** g6 of the s9 audit: git_ls_tree fullTree. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, newRepo, toolDeps } from './_repo.js';

import { gitLsTreeTool } from '../ls-tree.js';

test('git-ls-tree-full-tree.test.ts: git_ls_tree fullTree lists from the repository root when cwd is a subdirectory', async () => {
	const repo = newRepo();
	mkdirSync(join(repo, 'sub'), { recursive: true });
	writeFileSync(join(repo, 'root.txt'), 'r\n');
	writeFileSync(join(repo, 'sub/in.txt'), 'i\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'init');
	const cwd = join(repo, 'sub');

	const relative = await gitLsTreeTool.execute({ cwd, rev: 'HEAD', nameOnly: true }, toolDeps(repo));
	assert.deepEqual((relative.data as { names: string[] }).names, ['in.txt'], 'without fullTree the listing is relative to cwd');
	const full = await gitLsTreeTool.execute({ cwd, rev: 'HEAD', nameOnly: true, fullTree: true }, toolDeps(repo));
	assert.deepEqual((full.data as { names: string[] }).names.sort(), ['root.txt', 'sub']);
	const path = await gitLsTreeTool.execute({ cwd, rev: 'HEAD', nameOnly: true, fullTree: true, paths: ['root.txt'] }, toolDeps(repo));
	assert.deepEqual((path.data as { names: string[] }).names, ['root.txt'], 'a path is read from the root too');
});
