/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E1 / S001 / t5 — identity contract: every id the graph mints equals the
 * framework's own deriveWorkItemIdentity over the same anchor inputs, and the
 * real ones equal the folder segments already on disk (pinned as literals).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveWorkItemIdentity } from '../../id.js';
import { buildWorkItemGraph } from '../graph.js';
import { defRecord, issueRecord, lldRecord, realRecords, recordSet } from './fixtures.js';

test('epic, standalone and issue ids equal deriveWorkItemIdentity over the anchor inputs and pinned folder segments, including a sized-bugfix LLD dated a different day from its ISSUE', () => {
	const graph = buildWorkItemGraph(recordSet([
		...realRecords([
			'LLD-d88062a6e63aa312-S001.json',
			'LLD-dfc0371b7200f5b5-S001.json',
			'ISSUE-0855311b6b32eb72.json', 'BUILD-0855311b6b32eb72-S001.json',
			'BUILD-d5a433047dc3439f-S001.json',
			'ISSUE-2d9e9e694a94116b.json',
		]),
		defRecord('761a43a6fa645815', ['s9'], { createdAt: '2026-08-03T06:51:25.695Z' }),
		// A sized bugfix: the ISSUE on the 1st, its standalone LLD on the 2nd.
		issueRecord('9999999999999999', { slug: 'some-other-work' }, { createdAt: '2026-10-01T23:30:00.000Z', magnitude: 'sized' }),
		lldRecord('9999999999999999', 'S001', { standalone: true, createdAt: '2026-10-02T08:00:00.000Z' }),
	]));

	const expected: [id: string, hash: string, anchor: string, storyId?: string][] = [
		['E20260804d88062a6:S001', 'd88062a6e63aa312', '2026-08-04T19:09:56.031Z', 'S001'],
		['E20260926dfc0371b:S001', 'dfc0371b7200f5b5', '2026-09-26T11:44:45.049Z', 'S001'],
		['E202610040855311b',      '0855311b6b32eb72', '2026-10-04T09:33:18.527Z'],
		['E202610040855311b:S001', '0855311b6b32eb72', '2026-10-04T09:33:18.527Z', 'S001'],
		['E20260930d5a43304:S001', 'd5a433047dc3439f', '2026-09-30T10:41:27.663Z', 'S001'],
		['E202609292d9e9e69',      '2d9e9e694a94116b', '2026-09-29T07:46:38.613Z'],
		['E20260803761a43a6',      '761a43a6fa645815', '2026-08-03T06:51:25.695Z'],
		['E20261001' + '99999999', '9999999999999999', '2026-10-01T23:30:00.000Z'],
		['E20261002' + '99999999' + ':S001', '9999999999999999', '2026-10-02T08:00:00.000Z', 'S001'],
	];
	for (const [id, hash, anchor, storyId] of expected) {
		assert.equal(deriveWorkItemIdentity(hash, anchor, storyId).canonical, id);
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

	// The sized bugfix's story keeps its own day, not its ISSUE's.
	assert.ok(graph.items.has('E2026100299999999:S001'));
	assert.equal(graph.items.has('E2026100199999999:S001'), false);
});
