/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S002 (provenance/feedback) t2/t3 — the shared git changed-file seam.
 *
 * `changedFiles` is the extracted, behaviour-preserving body of the code-review
 * resolver's former `realChangedFiles` — exercised here against a real tmp git
 * repo (a staged new file appears in the changed set). `collectBuildChangeLog`
 * maps the changed set into a file-level change-log and SWALLOWS a derivation
 * failure to `[]`.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/changed-files.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { changedFiles, collectBuildChangeLog, NoBuildChangesError } from '../changed-files.js';

// ---------------------------------------------------------------------------
// t2 — changedFiles (real git): a staged new file is in the changed set
// ---------------------------------------------------------------------------

test('changedFiles: derives the staged changed set from a real git repo (extraction is behaviour-preserving)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-changed-files-'));
	try {
		execFileSync('git', ['init', '-q'], { cwd: repo });
		writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
		execFileSync('git', ['add', 'a.ts'], { cwd: repo });
		const files = await changedFiles(repo);
		assert.ok(files.includes('a.ts'), `expected a.ts in the changed set, got ${JSON.stringify(files)}`);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('changedFiles: throws NoBuildChangesError on a non-git directory', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-non-git-'));
	try {
		await assert.rejects(() => changedFiles(dir), (e: unknown) => e instanceof NoBuildChangesError);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// t3 — collectBuildChangeLog (stubbed changedFiles seam)
// ---------------------------------------------------------------------------

test('collectBuildChangeLog: one file-level entry per changed path (segment omitted), stamped author/timestamp', async () => {
	const cl = await collectBuildChangeLog(
		'/repo',
		{ author: 'insrc-build', timestamp: '2026-09-28T00:00:00.000Z' },
		async () => ['src/a.ts', 'src/b.ts'],
	);
	assert.deepEqual([...cl], [
		{ target: { file: 'src/a.ts' }, author: 'insrc-build', timestamp: '2026-09-28T00:00:00.000Z' },
		{ target: { file: 'src/b.ts' }, author: 'insrc-build', timestamp: '2026-09-28T00:00:00.000Z' },
	]);
	// segment is never set (file-level).
	assert.ok(cl.every(e => e.target.segment === undefined));
});

test('collectBuildChangeLog: version is threaded onto target when supplied', async () => {
	const cl = await collectBuildChangeLog(
		'/repo',
		{ author: 'insrc-build', timestamp: '2026-09-28T00:00:00.000Z', version: 'deadbeef' },
		async () => ['src/a.ts'],
	);
	assert.deepEqual(cl[0]!.target, { file: 'src/a.ts', version: 'deadbeef' });
});

test('collectBuildChangeLog: an empty changed set → []', async () => {
	const cl = await collectBuildChangeLog('/repo', { author: 'insrc-build', timestamp: 't' }, async () => []);
	assert.deepEqual([...cl], []);
});

test('collectBuildChangeLog: a git derivation failure is SWALLOWED → [] (never throws out)', async () => {
	const cl = await collectBuildChangeLog(
		'/repo',
		{ author: 'insrc-build', timestamp: 't' },
		async () => { throw new NoBuildChangesError('not a git repo'); },
	);
	assert.deepEqual([...cl], []);
});
