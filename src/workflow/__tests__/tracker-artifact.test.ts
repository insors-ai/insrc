/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tracker artifact runtime guards + renderer.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/tracker-artifact.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	isTrackerChecklistResult,
	isTrackerPostRefs,
	isTrackerPushRefs,
	isTrackerSyncRefs,
	renderTrackerMarkdown,
	type TrackerArtifact,
	type TrackerPushRefs,
	type TrackerSyncRefs,
	type TrackerPostRefs,
} from '../artifacts/tracker.js';

test('isTrackerPushRefs accepts valid push refs', () => {
	const v: TrackerPushRefs = { epicRef: 'a/b#1', storyRefs: { s1: 'a/b#2' }, labelsCreated: ['insrc:epic'] };
	assert.equal(isTrackerPushRefs(v), true);
});

test('isTrackerPushRefs rejects missing epicRef', () => {
	assert.equal(isTrackerPushRefs({ storyRefs: {}, labelsCreated: [] }), false);
});

test('isTrackerSyncRefs accepts valid sync refs', () => {
	const v: TrackerSyncRefs = { storyStatus: { s1: 'open' }, epicStatus: 'open', syncedAt: 'now' };
	assert.equal(isTrackerSyncRefs(v), true);
});

test('isTrackerPostRefs accepts valid post refs', () => {
	const v: TrackerPostRefs = { targetKind: 'hld', targetIssue: 'a/b#1', commentId: 'c1' };
	assert.equal(isTrackerPostRefs(v), true);
});

test('isTrackerChecklistResult validates shape', () => {
	assert.equal(isTrackerChecklistResult({ items: [], failedCount: 0 }), true);
	assert.equal(isTrackerChecklistResult({ items: [], failedCount: 'zero' }), false);
});

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

test('renderTrackerMarkdown for push shows refs + labels + all-passed checklist', () => {
	const a: TrackerArtifact = {
		meta: {
			workflow: 'tracker.push', runId: 'r-1', repoPath: '/', createdAt: '2026-07-12T00:00:00Z',
			model: 'client', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1, epicSlug: 'my-epic',
		},
		body: {
			workflow: 'tracker.push', epicSlug: 'my-epic', ghOwner: 'myorg', ghRepo: 'myrepo',
			refs: { epicRef: 'myorg/myrepo#42', storyRefs: { s1: 'myorg/myrepo#43', s2: 'myorg/myrepo#44' }, labelsCreated: ['insrc:epic'] },
			checklist: { items: [{ itemId: 'epicLabelled', verdict: 'passed' }], failedCount: 0 },
		},
		citations: [] as const,
	};
	const md = renderTrackerMarkdown(a);
	assert.ok(md.includes('# Tracker run: tracker.push'));
	assert.ok(md.includes('myorg/myrepo#42'));
	assert.ok(md.includes('myorg/myrepo#43'));
	assert.ok(md.includes('All 1 items passed'));
});

test('renderTrackerMarkdown for sync shows per-story status', () => {
	const a: TrackerArtifact = {
		meta: {
			workflow: 'tracker.sync', runId: 'r-2', repoPath: '/', createdAt: '2026-07-12T00:00:00Z',
			model: 'client', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1, epicSlug: 'my-epic',
		},
		body: {
			workflow: 'tracker.sync', epicSlug: 'my-epic', ghOwner: 'myorg', ghRepo: 'myrepo',
			refs: { storyStatus: { s1: 'in-progress', s2: 'closed' }, epicStatus: 'in-progress', syncedAt: '2026-07-12T01:00:00Z' },
			checklist: { items: [{ itemId: 'storyMapping', verdict: 'passed' }], failedCount: 0 },
		},
		citations: [] as const,
	};
	const md = renderTrackerMarkdown(a);
	assert.ok(md.includes('**Epic:** in-progress'));
	assert.ok(md.includes('**s1:** in-progress'));
	assert.ok(md.includes('**s2:** closed'));
});

test('renderTrackerMarkdown surfaces failed checklist items with notes', () => {
	const a: TrackerArtifact = {
		meta: {
			workflow: 'tracker.push', runId: 'r-3', repoPath: '/', createdAt: '2026-07-12T00:00:00Z',
			model: 'client', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1, epicSlug: 'my-epic',
		},
		body: {
			workflow: 'tracker.push', epicSlug: 'my-epic', ghOwner: 'myorg', ghRepo: 'myrepo',
			refs: { epicRef: 'myorg/myrepo#1', storyRefs: {}, labelsCreated: [] },
			checklist: {
				items: [{ itemId: 'taskList', verdict: 'failed', notes: 'no task list in Epic body' }],
				failedCount: 1,
			},
		},
		citations: [] as const,
	};
	const md = renderTrackerMarkdown(a);
	assert.ok(md.includes('1 of 1 items FAILED'));
	assert.ok(md.includes('taskList'));
	assert.ok(md.includes('no task list in Epic body'));
});
