/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The record-folder helpers take an explicit intent (s1/t6): a read never invents
 * an anchor; a write may root it on the record's own time when nothing anchors.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/record-intent.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { MissingAnchorError, type PathIntent } from '../../../artifact-ids.js';
import { buildRecordFolderArgs, storyRecordFolderArgs } from '../../../storage.js';
import { buildRecordPathsFor, persistBuildRecord, type BuildRecord } from '../standalone-record.js';
import { persistTestRecordTask, testRecordPaths } from '../test-record.js';
import { storyWorkflowFiles } from '../own-files.js';

const HASH = 'c4d5e6f708192a3b';
const T0 = '2026-10-01T10:00:00.000Z';
const T3 = '2026-10-04T10:00:00.000Z';
const HEAD = '2026-09-20T08:00:00.000Z';
const READ: PathIntent = { kind: 'read' };
const writeAt = (createdAt: string): PathIntent => ({ kind: 'write', root: { createdAt } });

function tempRepo(): { repo: string; seed: (id: string, meta: Record<string, unknown>) => void; done: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-intent-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	return {
		repo,
		seed: (id, meta) => writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify({ meta, body: {} })),
		done: () => rmSync(repo, { recursive: true, force: true }),
	};
}

function buildRecord(createdAt: string): BuildRecord {
	return {
		meta: { workflow: 'build', epicHash: HASH, storyId: 's1', createdAt, updatedAt: createdAt, standalone: true },
		body: { tasks: [{ id: 't1', passed: true }] },
	} as unknown as BuildRecord;
}

test('read intent raises MissingAnchorError and write intent uses the root, preferring a persisted stamp or a head', () => {
	// nothing anchors: a read refuses, a write roots on the record's own time
	let r = tempRepo();
	try {
		assert.throws(() => buildRecordFolderArgs(r.repo, HASH, 's1', true, READ), MissingAnchorError);
		assert.throws(() => storyRecordFolderArgs(r.repo, HASH, 's1', {}, READ), MissingAnchorError);
		assert.throws(() => testRecordPaths(r.repo, HASH, 's1', { now: T0 }, READ), MissingAnchorError);
		assert.throws(() => buildRecordPathsFor(r.repo, buildRecord(T0), READ), MissingAnchorError);
		assert.equal(buildRecordFolderArgs(r.repo, HASH, 's1', true, writeAt(T0)).epicCreatedAt, T0);
		assert.equal(storyRecordFolderArgs(r.repo, HASH, 's1', {}, writeAt(T0)).epicCreatedAt, T0);
		assert.match(testRecordPaths(r.repo, HASH, 's1', { now: T0 }, writeAt(T0)).md, /E20261001c4d5e6f7\/S001\/TESTS\.md$/);
		assert.ok(storyWorkflowFiles(r.repo, buildRecord(T0), writeAt(T0)).length >= 3);
		// a write that brings no time is refused too
		assert.throws(() => buildRecordFolderArgs(r.repo, HASH, 's1', true, { kind: 'write', root: { createdAt: '' } }), MissingAnchorError);
	} finally { r.done(); }

	// a head anchors: both intents read it, and a write's root is not used
	r = tempRepo();
	try {
		r.seed(`ISSUE-${HASH}`, { issueHash: HASH, createdAt: HEAD, epicSlug: 'an-issue', standalone: true });
		assert.equal(buildRecordFolderArgs(r.repo, HASH, 's1', true, READ).epicCreatedAt, HEAD);
		assert.equal(buildRecordFolderArgs(r.repo, HASH, 's1', true, writeAt(T3)).epicCreatedAt, HEAD);
	} finally { r.done(); }

	// a persisted stamp anchors, the BUILD stamp before the TESTS stamp, both before a head
	r = tempRepo();
	try {
		r.seed(`ISSUE-${HASH}`, { issueHash: HASH, createdAt: HEAD, epicSlug: 'an-issue', standalone: true });
		r.seed(`TESTS-${HASH}-s1`, { epicHash: HASH, storyId: 's1', createdAt: T3, epicCreatedAt: T3 });
		assert.equal(storyRecordFolderArgs(r.repo, HASH, 's1', {}, READ).epicCreatedAt, T3, 'the TESTS stamp wins over the head');
		r.seed(`BUILD-${HASH}-s1`, { epicHash: HASH, storyId: 's1', createdAt: T0, epicCreatedAt: T0 });
		assert.equal(storyRecordFolderArgs(r.repo, HASH, 's1', {}, READ).epicCreatedAt, T0, 'the BUILD stamp wins over the TESTS stamp');
		assert.equal(storyRecordFolderArgs(r.repo, HASH, 's1', {}, writeAt('2027-01-01T00:00:00.000Z')).epicCreatedAt, T0);
	} finally { r.done(); }
});

test('the first TESTS write stamps the anchor and a later BUILD files in the same folder', () => {
	const r = tempRepo();
	try {
		// no head, no LLD: the first headless validate turn writes the test record first
		const task = { taskId: 't1', ranAt: T0, testsPassed: true, tests: [], files: [] };
		const tests = persistTestRecordTask(r.repo, { epicHash: HASH, storyId: 's1', now: T0, standalone: true }, task);
		const testsJson = JSON.parse(readFileSync(tests.json, 'utf8')) as { meta: { epicCreatedAt?: string } };
		assert.equal(testsJson.meta.epicCreatedAt, T0, 'the first write stamps the anchor');

		// three days later the BUILD record is written: it reads the stamp, not its own day
		const build = persistBuildRecord(r.repo, buildRecord(T3));
		assert.equal(dirname(build.md), dirname(tests.md), 'BUILD.md and TESTS.md share one folder');
		const buildJson = JSON.parse(readFileSync(build.json, 'utf8')) as { meta: { epicCreatedAt?: string } };
		assert.equal(buildJson.meta.epicCreatedAt, T0);
		assert.match(build.md, /E20261001c4d5e6f7\/S001\/BUILD\.md$/);
	} finally { r.done(); }
});
