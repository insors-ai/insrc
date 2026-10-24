/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The git tools through executeTool against a real temporary repository (Story s4). Going through the executor is
 * what checks a tool's input and its data against its declared schemas.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { executeTool } from '../../../executor.js';
import { git, newRepo, registerForTests, toolDeps } from './_repo.js';

test('every git read tool\'s result fits its declared outputSchema', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n');
		writeFileSync(join(repo, '-dash.txt'), 'dash\n');
		git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'first', '-m', 'body');
		writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\n');
		git(repo, 'commit', '-q', '-am', 'second');
		writeFileSync(join(repo, 'a.txt'), 'changed\n');
		writeFileSync(join(repo, 'new file.txt'), 'n\n');

		const d = toolDeps(repo);
		const status = await executeTool('git_status', { cwd: repo }, d);
		assert.equal(status.success, true, status.output);
		assert.deepEqual((status.data as { unstaged: { path: string }[] }).unstaged.map(e => e.path), ['a.txt']);
		assert.deepEqual((status.data as { untracked: string[] }).untracked, ['new file.txt']);

		const log = await executeTool('git_log', { cwd: repo, limit: 5 }, d);
		assert.equal(log.success, true, log.output);
		assert.deepEqual((log.data as { commits: { subject: string }[] }).commits.map(c => c.subject), ['second', 'first']);

		const diff = await executeTool('git_diff', { cwd: repo }, d);
		assert.equal(diff.success, true, diff.output);
		assert.equal((diff.data as { files: unknown[] }).files.length, 1);
		const range = await executeTool('git_diff', { cwd: repo, from: 'HEAD~1', to: 'HEAD' }, d);
		assert.equal(range.success, true, range.output);

		const show = await executeTool('git_show', { cwd: repo, ref: 'HEAD~1' }, d);
		assert.equal(show.success, true, show.output);
		assert.equal((show.data as { subject: string }).subject, 'first');
		assert.equal((show.data as { warnings?: string[] }).warnings, undefined);

		const blame = await executeTool('git_blame', { cwd: repo, path: 'a.txt', ref: 'HEAD' }, d);
		assert.equal(blame.success, true, blame.output);
		assert.equal((blame.data as { lines: unknown[] }).lines.length, 3);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
