/** g5 of the s9 audit: git_status paths and untrackedFiles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, newRepo, toolDeps } from './_repo.js';

import { gitStatusTool } from '../status.js';

test('git-status-paths.test.ts: git_status limits its result to the given paths and lists each untracked file with untrackedFiles all', async () => {
	const repo = newRepo();
	mkdirSync(join(repo, 'docs/sub'), { recursive: true });
	writeFileSync(join(repo, 'keep.txt'), 'k\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'init');
	writeFileSync(join(repo, 'docs/a.md'), 'a\n');
	writeFileSync(join(repo, 'docs/sub/b.md'), 'b\n');
	writeFileSync(join(repo, 'other.txt'), 'o\n');
	writeFileSync(join(repo, 'keep.txt'), 'changed\n');

	const plain = await gitStatusTool.execute({ cwd: repo }, toolDeps(repo));
	const base = plain.data as { untracked: string[]; unstaged: { path: string }[] };
	assert.ok(base.untracked.includes('docs/'), 'the default collapses a directory of untracked files');
	assert.ok(base.unstaged.some(e => e.path === 'keep.txt'));

	const all = await gitStatusTool.execute({ cwd: repo, untrackedFiles: 'all' }, toolDeps(repo));
	assert.deepEqual((all.data as { untracked: string[] }).untracked.sort(), ['docs/a.md', 'docs/sub/b.md', 'other.txt']);

	const limited = await gitStatusTool.execute({ cwd: repo, paths: ['docs'], untrackedFiles: 'all' }, toolDeps(repo));
	const d = limited.data as { untracked: string[]; unstaged: unknown[] };
	assert.deepEqual(d.untracked.sort(), ['docs/a.md', 'docs/sub/b.md']);
	assert.equal(d.unstaged.length, 0, 'keep.txt is outside the paths');
});
