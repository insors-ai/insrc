/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The TESTS record is signoff-covered (sc3): each persisted mapping mints a
 * revision; a failed document write puts the earlier json (and its revision)
 * back; when that restore also fails the caller is told the record may be
 * inconsistent.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/test-record-revision.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { persistTestRecordTask, TestRecordInconsistentError } from '../test-record.js';

const HASH = '5a6b7c8d9e0f1a2b';
const ANCHOR = '2026-10-01T09:00:00.000Z';
const ident = (now: string) => ({ epicHash: HASH, storyId: 's1', now });
const task = (taskId: string, commit: string) => ({ taskId, commit, ranAt: ANCHOR, testsPassed: true, tests: [], files: [] });

async function withRepo(fn: (repo: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-tests-revision-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`), JSON.stringify({ meta: { workflow: 'design.story', epicHash: HASH, storyId: 's1', createdAt: ANCHOR, epicCreatedAt: ANCHOR, epicSlug: 'tests-rev', standalone: true }, body: {} }, null, 2) + '\n');
	try { await fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

const revisionOf = (json: string): unknown => (JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown> }).meta['revision'];

/** Make the document path unwritable: a non-empty directory cannot be renamed over. */
function blockDocument(md: string): void {
	rmSync(md, { force: true });
	mkdirSync(join(md, 'in-the-way'), { recursive: true });
}

test('a second persisted mapping bumps the revision, a rollback restores bytes and revision, and a failed restore is reported as inconsistent', async () => {
	await withRepo(async repo => {
		const { json, md } = await persistTestRecordTask(repo, ident('2026-10-02T00:00:00.000Z'), task('t1', 'aaa1111'));
		assert.equal(revisionOf(json), 1, 'the first record is revision 1');
		await persistTestRecordTask(repo, ident('2026-10-03T00:00:00.000Z'), task('t2', 'bbb2222'));
		assert.equal(revisionOf(json), 2, 'a second mapping mints the next revision');

		// the document write fails, the restore succeeds: bytes and revision are as before
		const before = readFileSync(json, 'utf8');
		blockDocument(md);
		await assert.rejects(async () => await persistTestRecordTask(repo, ident('2026-10-04T00:00:00.000Z'), task('t3', 'ccc3333')), (e: unknown) => !(e instanceof TestRecordInconsistentError));
		assert.equal(readFileSync(json, 'utf8'), before, 'the json bytes are put back');
		assert.equal(revisionOf(json), 2, 'and so is the revision');

		// the document write fails and the restore fails too: the caller is told
		let caught: unknown;
		try {
			await persistTestRecordTask(repo, ident('2026-10-05T00:00:00.000Z'), task('t4', 'ddd4444'), { restore: () => { throw new Error('disk gone'); } });
		} catch (e) { caught = e; }
		assert.ok(caught instanceof TestRecordInconsistentError, 'the failure names the possible inconsistency');
		assert.match((caught as Error).message, /may be inconsistent/);
		assert.match((caught as Error).message, /disk gone/);
		assert.equal((caught as TestRecordInconsistentError).jsonPath, json);
	});
});
