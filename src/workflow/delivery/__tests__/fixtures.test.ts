/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S001 / t3 — test fixtures. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REAL_STORE, amdRecord, defRecord, issueRecord, realRecords, recordFromFile, recordSet } from './fixtures.js';

test('every real-shape fixture builds a valid ArtifactRecord with its identity fields intact', () => {
	const records = realRecords();
	assert.equal(records.length, Object.keys(REAL_STORE).length);
	const byId = new Map(records.map(r => [r.artifactId, r]));
	const get = (id: string) => {
		const r = byId.get(id);
		assert.ok(r, `missing ${id}`);
		return r;
	};

	// The S001/s001 pair: one ordinal, two raw spellings; LLD standalone without epicCreatedAt.
	const lld = get('LLD-dfc0371b7200f5b5-S001');
	const plan = get('PLAN-dfc0371b7200f5b5-s001');
	assert.equal(lld.storyIdRaw, 'S001');
	assert.equal(plan.storyIdRaw, 's001');
	assert.equal(lld.storyOrdinal, 1);
	assert.equal(plan.storyOrdinal, 1);
	assert.equal(lld.meta['standalone'], true);
	assert.equal(lld.epicCreatedAt, null);
	assert.equal(plan.epicCreatedAt, '2026-09-26T11:54:35.996Z');
	assert.deepEqual((plan.body as { tasks: { id: string }[] }).tasks.map(t => t.id), ['t1', 't2', 't3', 't4', 't5']);
	assert.equal(get('BUILD-dfc0371b7200f5b5-S001').meta['standalone'], false);
	assert.equal(get('CR-dfc0371b7200f5b5-S001').workItemHash, 'dfc0371b7200f5b5');

	// ISSUEs key on issueHash and keep every parentRef form.
	const selfSlug = get('ISSUE-0855311b6b32eb72');
	assert.equal(selfSlug.workItemHash, '0855311b6b32eb72');
	assert.deepEqual(selfSlug.meta['parentRef'], { slug: 'bug-build-record-triage-routed-small' });
	assert.equal(selfSlug.meta['epicSlug'], 'bug-build-record-triage-routed-small');
	assert.deepEqual(get('ISSUE-2d9e9e694a94116b').meta['parentRef'], { slug: 'vs-code-editor-dev-chat-ui' });
	assert.deepEqual(get('ISSUE-57446545909fe95c').meta['parentRef'], { slug: 'add-daemon-driven-code-review-stage', storyId: 's1' });
	assert.deepEqual(get('ISSUE-095906bac5bbacaf').meta['parentRef'], { slug: 'd5a433047dc3439f', storyId: 's1' });

	// A story-level BUILD task id, and a trivial BUILD with its CR.
	assert.deepEqual((get('BUILD-0855311b6b32eb72-S001').body as { tasks: { id: string }[] }).tasks.map(t => t.id), ['S001']);
	assert.equal(get('BUILD-d5a433047dc3439f-S001').meta['sizeClass'], 'trivial');
	assert.equal((get('CR-d5a433047dc3439f-S001').body as { verdict: string }).verdict, 'warn');

	// Standalone LLD with no head and no epicCreatedAt, and its BUILD.
	const d880 = get('LLD-d88062a6e63aa312-S001');
	assert.equal(d880.meta['standalone'], true);
	assert.equal(d880.epicCreatedAt, null);
	assert.equal(d880.createdAt, '2026-08-04T19:09:56.031Z');
	assert.equal(get('BUILD-d88062a6e63aa312-S001').approval.state, 'approved');

	// Flat AMD: hash from top-level epicHash, approval from top-level fields, body is the amendment.
	const amd = get('AMD-761a43a6fa645815-1');
	assert.equal(amd.workItemHash, '761a43a6fa645815');
	assert.equal(amd.approval.state, 'approved');
	assert.equal(amd.approval.approvedAt, '2026-08-05T05:03:58.498Z');
	assert.equal(amd.createdAt, '2026-08-05T04:47:34.061Z');
	assert.equal((amd.body as { storyId: string }).storyId, 's9');
	assert.equal('amendment' in amd.meta, false);

	const ext = get('EXT-761a43a6fa645815-s9');
	assert.equal(ext.storyOrdinal, 9);
	assert.equal(ext.approval.state, 'approved');
});

test('builders fabricate records the same way recordFromFile lifts them', () => {
	const def = defRecord('aaaaaaaaaaaaaaaa', ['s1', 's2']);
	assert.equal(def.kind, 'DEF');
	assert.equal(def.workItemHash, 'aaaaaaaaaaaaaaaa');
	assert.equal(def.approval.state, 'pending');

	const issue = issueRecord('bbbbbbbbbbbbbbbb', { slug: 'some-epic', storyId: 's2' });
	assert.equal(issue.workItemHash, 'bbbbbbbbbbbbbbbb');
	assert.deepEqual(issue.meta['parentRef'], { slug: 'some-epic', storyId: 's2' });

	const amd = amdRecord('aaaaaaaaaaaaaaaa', 1, 's3');
	assert.equal(amd.artifactId, 'AMD-aaaaaaaaaaaaaaaa-1');
	assert.equal(amd.approval.state, 'pending');

	const bad = recordFromFile('LLD-aaaaaaaaaaaaaaaa-x.json', { meta: { epicHash: 'aaaaaaaaaaaaaaaa', storyId: 'x' }, body: {} });
	assert.equal(bad.storyIdRaw, 'x');
	assert.equal(bad.storyOrdinal, null);

	const set = recordSet([issue, def]);
	assert.deepEqual(set.records.map(r => r.artifactId), ['DEF-aaaaaaaaaaaaaaaa', 'ISSUE-bbbbbbbbbbbbbbbb']);
});
