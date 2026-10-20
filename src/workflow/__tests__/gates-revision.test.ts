/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * gates.ts is a mixed writer (sc3): the extend path changes the Define body
 * (content: mints a revision), while approve, reject and ack-stale change
 * only meta (revision and body byte-identical).
 *
 * Run: npx tsx --test src/workflow/__tests__/gates-revision.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ackStaleArtifact, appendStoryToDefine, approveArtifactByJsonPath, rejectArtifactByJsonPath } from '../gates.js';
import { defineArtifactPaths } from '../storage.js';
import type { DefineArtifact, DefineStory } from '../artifacts/define.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED = '2026-07-17T07:42:28.275Z';
const TRACKER = { adapter: 'github', epicRef: 'o/r#1', storyRefs: { s1: 'o/r#2' }, pushedAt: 'p' };

function seed(repo: string): string {
	const paths = defineArtifactPaths(repo, HASH, CREATED, 'epic', 'tag-filtering');
	mkdirSync(dirname(paths.json), { recursive: true });
	const define: DefineArtifact = {
		meta: { workflow: 'define', runId: 'r1', repoPath: repo, createdAt: CREATED, epicCreatedAt: CREATED, model: 'client', elapsedMs: 0, repoIndexedAt: 'x', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', revision: 3, tracker: TRACKER } as DefineArtifact['meta'],
		body: {
			flavor: 'enhancement', problem: 'Users cannot filter todos by tag today; only status filtering exists.', nonGoals: [], assumptions: [],
			constraints: [{ id: 'k1', text: 'Reuse sidebar', type: 'convention', source: 'c1' }],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] }],
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	};
	writeFileSync(paths.json, JSON.stringify(define, null, 2) + '\n');
	return paths.json;
}

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as { meta: Record<string, any>; body: unknown; citations: unknown };

test('appendStoryToDefine mints a revision, approve reject and ack-stale leave revision and body unchanged', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gates-rev-'));
	try {
		const json = seed(repo);
		const body0 = JSON.stringify(read(json).body);

		// meta-only: approve
		stampOtherPartyReview(json);
		const bodyAfterStamp = JSON.stringify(read(json).body);
		assert.equal(bodyAfterStamp, body0);
		approveArtifactByJsonPath(json);
		let d = read(json);
		assert.equal(d.meta['revision'], 3, 'approve does not mint a revision');
		assert.ok(d.meta['approvedAt']);
		assert.equal(JSON.stringify(d.body), body0, 'approve leaves the body byte-identical');

		// meta-only: ack-stale
		ackStaleArtifact(json, 'reviewed');
		d = read(json);
		assert.equal(d.meta['revision'], 3);
		assert.equal(JSON.stringify(d.body), body0);

		// meta-only: reject
		rejectArtifactByJsonPath(json, 'not yet');
		d = read(json);
		assert.equal(d.meta['revision'], 3);
		assert.ok(d.meta['rejectedAt']);
		assert.equal(JSON.stringify(d.body), body0);

		// content: the extend path
		stampOtherPartyReview(json);
		approveArtifactByJsonPath(json);
		const approvedAt = read(json).meta['approvedAt'];
		const story: DefineStory = { id: 's2', title: 'Filter by multiple tags', userValue: 'faster triage', acceptanceCriteria: [{ id: 'ac2', given: 'g', when: 'w', then: 't', operationalizes: [] }] };
		const next = appendStoryToDefine(repo, 'a3f4b8c9d1e2f3a4', story);
		d = read(json);
		assert.equal(d.meta['revision'], 4, 'the extend path mints a revision');
		assert.equal((d.body as { stories: unknown[] }).stories.length, 2);
		assert.deepEqual(d.meta['tracker'], TRACKER, 'the tracker block survives');
		assert.equal(d.meta['approvedAt'], approvedAt, 'the extend keeps approval, as before');
		assert.equal((next.meta as Record<string, unknown>)['revision'], 4, 'the returned object carries the minted revision');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
