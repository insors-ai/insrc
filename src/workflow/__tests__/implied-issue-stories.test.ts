/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-149283b0d0455a43 / s1 / t1 — the ONE implied-story rule, stated in one
 * place. `IMPLIED_ISSUE_STORY_ID` + `impliedIssueStories` live in storage.ts;
 * the tracker resolver's story-existence check reads the same constant, so the
 * two cannot diverge (the divergence is what this Story fixes).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IMPLIED_ISSUE_STORY_ID, impliedIssueStories } from '../storage.js';
import { resolveWorkflowRef } from '../tracker/resolve.js';

const HASH = 'de2b586f80943e39';
const CREATED = '2026-11-16T08:00:00.000Z';

function seedIssueOnlyRepo(): { repo: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-implied-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(repo, '.insrc', 'artifacts', `ISSUE-${HASH}.json`), JSON.stringify({
		meta: {
			workflow: 'issue', runId: 'i1', repoPath: repo, issueHash: HASH,
			epicSlug: 'implied-rule', createdAt: CREATED, standalone: true,
			magnitude: 'sized', schemaVersion: 1,
		},
		body: { title: 'A defect title', reproduction: 'x', rootCause: 'x', fixIntent: 'x' },
		citations: [],
	}));
	return { repo, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

test('impliedIssueStories returns exactly one entry with id IMPLIED_ISSUE_STORY_ID and the ISSUE title', () => {
	const stories = impliedIssueStories({ body: { title: 'A defect title' } });
	assert.equal(stories.length, 1);
	assert.equal(stories[0]!.id, IMPLIED_ISSUE_STORY_ID);
	assert.equal(IMPLIED_ISSUE_STORY_ID, 's1');
	assert.equal(stories[0]!.title, 'A defect title');
});

test('the tracker resolver answers implied for s1 and null for s2 from the shared constant', () => {
	const s = seedIssueOnlyRepo();
	try {
		const s1 = resolveWorkflowRef(s.repo, IMPLIED_ISSUE_STORY_ID, { epicHash: HASH });
		assert.notEqual(s1, null, 'the implied s1 must resolve on an ISSUE-only repo');
		assert.equal(s1!.epicHash, HASH);
		assert.equal(s1!.storyId, IMPLIED_ISSUE_STORY_ID);
		const s2 = resolveWorkflowRef(s.repo, 's2', { epicHash: HASH });
		assert.equal(s2, null, 'no story beyond the implied ordinal 1 exists on an ISSUE');
	} finally { s.cleanup(); }
});
