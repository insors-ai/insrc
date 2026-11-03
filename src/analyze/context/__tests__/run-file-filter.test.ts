/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One FileFilter per repository per analysis run (Epic c2ba6fa6 s6 code
 * review): the plan's RepoIgnoreFilter and the infra file walk share one
 * instance inside a run, so a run builds it once and judges by one snapshot.
 *
 * Run: npx tsx --test src/analyze/context/__tests__/run-file-filter.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRepoIgnoreFilter } from '../repo-ignore-filter.js';
import { runFileFilter, withRunFileFilters } from '../run-file-filter.js';
import { walkFiles } from '../../runtimes/infra/_shared.js';

function repo(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s6-run-filter-')));
	execFileSync('git', ['init', '-q'], { cwd: dir });
	mkdirSync(join(dir, 'src'));
	writeFileSync(join(dir, 'src', 'a.ts'), 'x\n', 'utf8');
	writeFileSync(join(dir, '.gitignore'), 'out/\n', 'utf8');
	return dir;
}

test('inside a run every consumer gets the same filter for a repository; outside, each call builds its own', async () => {
	const dir = repo();
	try {
		await withRunFileFilters(async () => {
			assert.equal(runFileFilter(dir), runFileFilter(join(dir, '.')), 'one instance per root');
			await withRunFileFilters(async () => {
				assert.equal(runFileFilter(dir), runFileFilter(dir), 'a nested run shares its caller\'s');
			});
		});
		assert.notEqual(runFileFilter(dir), runFileFilter(dir));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('the plan\'s RepoIgnoreFilter and the infra file walk judge by one snapshot inside a run, the current rules outside one', async () => {
	const dir = repo();
	try {
		await withRunFileFilters(async () => {
			assert.equal(createRepoIgnoreFilter(dir).isIncluded(join(dir, 'src', 'a.ts')), true);
			writeFileSync(join(dir, '.gitignore'), 'src/\n', 'utf8');   // a rule change part-way through the run
			const { files } = await walkFiles(dir, null);
			assert.ok(files.some(f => f.relPath === 'src/a.ts'), 'the walk reused the filter built at the start of the run');
		});
		const { files } = await walkFiles(dir, null);
		assert.ok(!files.some(f => f.relPath === 'src/a.ts'), 'a later run reads the rules again');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
