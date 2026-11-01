/** Story s9, task t10: git_stage force stages a file a .gitignore rule matches. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, newRepo, toolDeps } from './_repo.js';
import { gitStageTool } from '../stage.js';

test('git-stage-force.test.ts: git_stage force stages an ignored file and a call without it still does not', async () => {
	const repo = newRepo();
	writeFileSync(join(repo, '.gitignore'), 'ignored.txt\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'init');
	writeFileSync(join(repo, 'ignored.txt'), 'x\n');
	const plain = await gitStageTool.execute({ cwd: repo, op: 'stage', paths: ['ignored.txt'] }, toolDeps(repo));
	assert.equal(plain.success, false, 'git add refuses an ignored file');
	const forced = await gitStageTool.execute({ cwd: repo, op: 'stage', paths: ['ignored.txt'], force: true }, toolDeps(repo));
	assert.equal(forced.success, true, forced.output);
	assert.equal(git(repo, 'diff', '--cached', '--name-only').trim(), 'ignored.txt');
});
