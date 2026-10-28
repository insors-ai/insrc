/**
 * The tracked check of attach.ts over the registry's git tools (Story s10): a tracked file passes; an untracked file and a file with
 * changes are told apart; the last commit that touched the file is read.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/attach-tracked-check.test.ts
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { createRegistryTable, workflowToolDeps } from '../registry-table.js';

let repo: string;
const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
beforeEach(() => {
	_resetRegistryForTests();
	repo = mkdtempSync(join(tmpdir(), 'insrc-tracked-'));
	git('init', '-q'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'a');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('attach-tracked-check.test.ts: a tracked file passes and an untracked file is refused with the old reason', () => {
	it('a tracked clean file is tracked, has no changes and names its last commit; an untracked one is not tracked; an edited one has changes', async () => {
		const t = createRegistryTable(workflowToolDeps(repo));
		writeFileSync(join(repo, 'tracked.md'), 'v1\n');
		writeFileSync(join(repo, 'loose.md'), 'v1\n');
		git('add', 'tracked.md'); git('commit', '-q', '-m', 'one');
		const sha = git('rev-parse', 'HEAD');
		assert.equal(await t.gitIsTracked(repo, 'tracked.md'), true);
		assert.equal(await t.gitHasChanges(repo, 'tracked.md'), false);
		assert.equal(await t.gitLastCommitOf(repo, 'tracked.md'), sha);
		assert.equal(await t.gitIsTracked(repo, 'loose.md'), false);
		assert.equal(await t.gitHasChanges(repo, 'loose.md'), true, 'an untracked file shows as a change, as git status --porcelain did');
		writeFileSync(join(repo, 'tracked.md'), 'v2\n');
		assert.equal(await t.gitHasChanges(repo, 'tracked.md'), true);
		assert.equal(await t.gitLastCommitOf(repo, 'loose.md'), '', 'a file no commit touched has no last commit');
	});
});
