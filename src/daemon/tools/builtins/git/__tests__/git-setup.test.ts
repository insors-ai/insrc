/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s8/t7: git init in an existing repository reinitialises it without losing anything and reports
 * it; clone refuses a url that would run a command or be read as an option.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-setup.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';

import { executeTool } from '../../../executor.js';
import { git, newRepo, registerForTests, toolDeps } from './_repo.js';
import { join } from 'node:path';

test('git-setup.test.ts: init in an existing repository reinitialises and reports it', async () => {
	registerForTests();
	const repo = newRepo();
	try {
		writeFileSync(join(repo, 'f.txt'), 'f'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'keep');
		const before = git(repo, 'rev-parse', 'HEAD').trim();
		const r = await executeTool('git_setup', { cwd: repo, op: 'init' }, toolDeps(repo));
		assert.equal(r.success, true, r.output);
		assert.equal((r.data as { reinitialised: boolean }).reinitialised, true);
		assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), before, 'nothing was lost');
		assert.equal(git(repo, 'log', '-1', '--format=%s').trim(), 'keep');

		for (const url of ['--upload-pack=touch /tmp/x', 'ext::sh -c true']) {
			const refused = await executeTool('git_setup', { cwd: repo, op: 'clone', url }, toolDeps(repo));
			assert.equal(refused.success, false, url);
			assert.equal(refused.failure?.kind, 'rejected');
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
