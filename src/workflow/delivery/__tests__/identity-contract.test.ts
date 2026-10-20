/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E1 / S001 / t5 — identity contract: every id the graph mints equals the
 * path scheme's own board id (workItemBoardId) over the same anchor inputs, and the
 * real ones equal the folder segments already on disk (pinned as literals).
 * The delivery reader reads its ordinals from the identity module (ArtifactIds).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ArtifactIds } from '../../artifact-ids.js';
import { workItemBoardId } from '../../path-scheme.js';
import { ARTIFACTS_DIR } from '../../storage.js';
import { loadArtifactRecordSet } from '../load.js';
import { storyOrdinalOf, taskOrdinalOf } from '../read.js';
import { buildWorkItemGraph } from '../graph.js';
import { defRecord, issueRecord, lldRecord, stampedRealRecords, recordSet } from './fixtures.js';

test('epic, standalone and issue ids equal the path scheme board id over the anchor inputs and pinned folder segments, including a sized-bugfix LLD dated a different day from its ISSUE', () => {
	const graph = buildWorkItemGraph(recordSet([
		...stampedRealRecords([
			'LLD-d88062a6e63aa312-s1.json',
			'LLD-dfc0371b7200f5b5-s1.json',
			'ISSUE-0855311b6b32eb72.json', 'BUILD-0855311b6b32eb72-s1.json',
			'BUILD-d5a433047dc3439f-s1.json',
			'ISSUE-2d9e9e694a94116b.json',
		]),
		defRecord('761a43a6fa645815', ['s9'], { createdAt: '2026-08-03T06:51:25.695Z' }),
		// A sized bugfix: the ISSUE on the 1st, its standalone LLD written on the 2nd and stamped with the ISSUE's day.
		issueRecord('9999999999999999', { slug: 'some-other-work' }, { createdAt: '2026-10-01T23:30:00.000Z', magnitude: 'sized' }),
		lldRecord('9999999999999999', 's1', { standalone: true, createdAt: '2026-10-02T08:00:00.000Z', epicCreatedAt: '2026-10-01T23:30:00.000Z' }),
	]));

	const expected: [id: string, hash: string, anchor: string, storyId?: string][] = [
		['E20260804d88062a6:S001', 'd88062a6e63aa312', '2026-08-04T19:09:56.031Z', 's1'],
		['E20260926dfc0371b:S001', 'dfc0371b7200f5b5', '2026-09-26T11:44:45.049Z', 's1'],
		['E202610040855311b',      '0855311b6b32eb72', '2026-10-04T09:33:18.527Z'],
		['E202610040855311b:S001', '0855311b6b32eb72', '2026-10-04T09:33:18.527Z', 's1'],
		['E20260930d5a43304:S001', 'd5a433047dc3439f', '2026-09-30T10:41:27.663Z', 's1'],
		['E202609292d9e9e69',      '2d9e9e694a94116b', '2026-09-29T07:46:38.613Z'],
		['E20260803761a43a6',      '761a43a6fa645815', '2026-08-03T06:51:25.695Z'],
		['E20261001' + '99999999', '9999999999999999', '2026-10-01T23:30:00.000Z'],
		['E20261001' + '99999999' + ':S001', '9999999999999999', '2026-10-01T23:30:00.000Z', 's1'],
	];
	for (const [id, hash, anchor, storyId] of expected) {
		assert.equal(workItemBoardId({ epicHash: hash, epicCreatedAt: anchor, ...(storyId !== undefined ? { story: storyId } : {}) }), id);
		assert.ok(graph.items.has(id), `graph has no item ${id}`);
	}

	// The folder segments those work items already use on disk.
	const pinnedSegments = [
		'E20260804d88062a6', 'E20260926dfc0371b', 'E202610040855311b',
		'E20260930d5a43304', 'E202609292d9e9e69', 'E20260803761a43a6',
	];
	for (const segment of pinnedSegments) {
		assert.ok([...graph.items.keys()].some(id => id === segment || id.startsWith(`${segment}:`)), `no item in folder ${segment}`);
	}

	// The sized bugfix's story is dated by its ISSUE, the day the folder resolver files it under, not by the day its LLD was written.
	assert.ok(graph.items.has('E2026100199999999:S001'));
	assert.equal(graph.items.has('E2026100299999999:S001'), false);
});

test('the delivery reader loads a lowercase repository with ordinals from the identity module', () => {
	const hash = 'a1b2c3d4e5f60718';
	const created = '2026-10-12T09:00:00.000Z';
	const repo = mkdtempSync(join(tmpdir(), 'insrc-delivery-identity-'));
	try {
		const dir = join(repo, ARTIFACTS_DIR);
		mkdirSync(dir, { recursive: true });
		const put = (name: string, doc: unknown): void => writeFileSync(join(dir, name), JSON.stringify(doc));
		put(`DEF-${hash}.json`, { meta: { epicHash: hash, epicSlug: 'demo', createdAt: created, epicCreatedAt: created }, body: { stories: [{ id: 's1' }, { id: 's12' }] } });
		put(`LLD-${hash}-s1.json`, { meta: { epicHash: hash, epicSlug: 'demo', storyId: 's1', createdAt: created, epicCreatedAt: created }, body: {} });
		put(`PLAN-${hash}-s12.json`, { meta: { epicHash: hash, epicSlug: 'demo', storyId: 's12', createdAt: created, epicCreatedAt: created }, body: { tasks: [{ id: 't1' }, { id: 't10' }] } });
		const set = loadArtifactRecordSet(repo);
		assert.deepEqual(set.failures, [], 'every lowercase file loads');
		assert.equal(set.records.length, 3);

		const graph = buildWorkItemGraph(set);
		const folder = 'E20261012a1b2c3d4';
		assert.deepEqual([...graph.items.keys()].filter(id => id.startsWith(`${folder}:`)).sort(),
			[`${folder}:S001`, `${folder}:S012`, `${folder}:S012:T001`, `${folder}:S012:T010`], 'ordinals read from the s<n> and t<n> text');

		// the ordinal readers are the identity module's
		for (const story of ['s1', 's12', 'S1', 'S001', 's01', 'x1', '']) assert.equal(storyOrdinalOf(story), ArtifactIds.storyOrdinal(story), story);
		for (const task of ['t1', 't10', 'T1', 't01', '']) assert.equal(taskOrdinalOf(task), ArtifactIds.taskOrdinal(task), task);
		assert.deepEqual(['s1', 's12', 'S001', 's01'].map(storyOrdinalOf), [1, 12, null, null]);

		// and the delivery module no longer imports the removed work-item id module
		for (const file of ['graph.ts', 'read.ts']) {
			assert.doesNotMatch(readFileSync(join(import.meta.dirname, '..', file), 'utf8'), /from '\.\.\/id\.js'/, `${file} must not import id.js`);
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
