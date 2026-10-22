/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The repo.convert daemon method: a bare call previews and writes nothing; a missing repo or a bad mode says why.
 *
 * Run: npx tsx --test src/daemon/__tests__/repo-convert.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleRepoConvert } from '../repo-convert.js';

const listing = (dir: string): string[] => readdirSync(dir, { recursive: true }).map(String).sort();

test('repo-convert.test.ts: a bare repo.convert call runs a preview and writes nothing', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-repo-convert-'));
	try {
		execFileSync('git', ['init', '-q'], { cwd: repo });
		const before = listing(repo);
		const bare = await handleRepoConvert({ repo }, undefined);
		assert.ok(!('error' in bare), JSON.stringify(bare));
		assert.equal('error' in bare ? undefined : bare.mode, 'preview');
		assert.equal('error' in bare ? undefined : bare.result, undefined, 'a preview applies nothing');
		assert.deepEqual(listing(repo), before, 'and writes nothing');

		assert.match(JSON.stringify(await handleRepoConvert({}, undefined)), /repo is required/);
		assert.match(JSON.stringify(await handleRepoConvert({ repo: join(repo, 'nope') }, undefined)), /not a repository directory/);
		assert.match(JSON.stringify(await handleRepoConvert({ repo, mode: 'dry' }, undefined)), /unknown mode dry/);
		assert.equal((await handleRepoConvert(undefined, repo) as { mode: string }).mode, 'preview', 'the daemon repo is the fallback');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
