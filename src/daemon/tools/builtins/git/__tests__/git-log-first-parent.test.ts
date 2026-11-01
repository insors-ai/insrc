/** g7 of the s9 audit: git_log firstParent. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git, newRepo, toolDeps } from './_repo.js';

import { gitLogTool } from '../log.js';

test('git-log-first-parent.test.ts: git_log firstParent leaves out the commits merged in from a side branch', async () => {
	const repo = newRepo();
	writeFileSync(join(repo, 'a.txt'), '1\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'base');
	git(repo, 'checkout', '-q', '-b', 'side');
	writeFileSync(join(repo, 'b.txt'), 'b\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'side work');
	git(repo, 'checkout', '-q', 'main');
	writeFileSync(join(repo, 'c.txt'), 'c\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'main work');
	git(repo, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');

	const subjects = async (extra: Record<string, unknown>) =>
		((await gitLogTool.execute({ cwd: repo, ...extra }, toolDeps(repo))).data as { commits: { subject: string }[] }).commits.map(c => c.subject);
	assert.deepEqual((await subjects({})).sort(), ['base', 'main work', 'merge side', 'side work']);
	assert.deepEqual(await subjects({ firstParent: true }), ['merge side', 'main work', 'base']);
});
