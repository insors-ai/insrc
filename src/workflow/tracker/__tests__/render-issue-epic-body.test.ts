/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f9d4ab4c90c0b4c s1/t2 unit test: renderIssueEpicBody renders the ISSUE
 * body sections (title / Reproduction / Root cause / Fix intent / one implied
 * story) without any DEF-only fields (Problem / Non-goals / Constraints /
 * HLD+Define doc links), matching the single-issue ISSUE push contract.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/render-issue-epic-body.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderIssueEpicBody, idMarker } from '../conventions.js';
import { IMPLIED_ISSUE_STORY_ID } from '../../storage.js';
import { issueArtifactId } from '../../storage.js';
import type { IssueArtifact } from '../../artifacts/issue.js';

const HASH = '5f9d4ab4c90c0b4c';
const SLUG = 'issue-anchored-item';

function issueFixture(): IssueArtifact {
	return {
		meta: { workflow: 'issue', runId: 'i1', repoPath: '/r', createdAt: '2026-11-16T07:14:04.399Z', epicCreatedAt: '2026-11-16T07:14:04.399Z', epicHash: HASH, epicSlug: SLUG, issueHash: HASH, standalone: true, schemaVersion: 1 },
		body: { title: 'Tracker push must handle an ISSUE head', reproduction: 'run push on a bugfix item', rootCause: 'DEF-only read', fixIntent: 'branch on head kind' },
		citations: [],
	} as unknown as IssueArtifact;
}

test('src/workflow/tracker/conventions.ts renderIssueEpicBody — renders ISSUE body sections without DEF-only fields', () => {
	const issue = issueFixture();
	const md = renderIssueEpicBody(issue, SLUG, undefined, issueArtifactId(HASH));

	const lines = md.split('\n');
	assert.equal(lines[0], idMarker(issueArtifactId(HASH)), 'artifact id marker first');
	assert.ok(md.includes('# Tracker push must handle an ISSUE head'));
	assert.ok(md.includes('## Reproduction\n\nrun push on a bugfix item'));
	assert.ok(md.includes('## Root cause\n\nDEF-only read'));
	assert.ok(md.includes('## Fix intent\n\nbranch on head kind'));
	assert.ok(md.includes(`- [ ] ${IMPLIED_ISSUE_STORY_ID}: Tracker push must handle an ISSUE head`), 'single implied story task-list line');
	assert.ok(md.trimEnd().endsWith(`_epic slug: ${SLUG}_`), 'epic slug footer');

	// no DEF-only sections or doc links
	for (const banned of ['## Problem', '## Non-goals', '## Constraints', '## Design references', 'HLD', 'Define', '**Epic:**']) {
		assert.ok(!md.includes(banned), `must not contain DEF-only '${banned}'`);
	}
	// exactly one story line
	assert.equal(md.split('\n').filter(l => l.startsWith('- [ ]')).length, 1);

	// without an artifactId there is no marker line
	const bare = renderIssueEpicBody(issue, SLUG);
	assert.ok(!bare.startsWith('<!--'), 'no marker without artifactId');
	assert.ok(bare.startsWith('# Tracker push must handle an ISSUE head'));
});
