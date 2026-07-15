/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the shared tracker module (pure — no gh, no fs mutate).
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/tracker.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseGithubRemoteUrl } from '../github.js';
import { parseIssueRef, buildRef, issueUrl, trackerRefLine } from '../refs.js';
import { renderEpicBody, renderStoryBody, updateEpicTaskList, mapIssueStatus } from '../conventions.js';
import type { DefineArtifact, DefineStory } from '../../artifacts/define.js';

const SLUG = 'demo-feature';

// ---------------------------------------------------------------------------
// git remote parse — dotted repo names must survive (regression)
// ---------------------------------------------------------------------------

test('parseGithubRemoteUrl handles ssh + https + .git suffix', () => {
	assert.deepEqual(parseGithubRemoteUrl('git@github.com:foo/bar.git'), { owner: 'foo', repo: 'bar' });
	assert.deepEqual(parseGithubRemoteUrl('git@github.com:foo/bar'),     { owner: 'foo', repo: 'bar' });
	assert.deepEqual(parseGithubRemoteUrl('https://github.com/foo/bar.git'), { owner: 'foo', repo: 'bar' });
	assert.deepEqual(parseGithubRemoteUrl('https://github.com/foo/bar'),     { owner: 'foo', repo: 'bar' });
});

test('parseGithubRemoteUrl keeps dots in repo names', () => {
	assert.deepEqual(parseGithubRemoteUrl('git@github.com:acme/react.dev.git'), { owner: 'acme', repo: 'react.dev' });
	assert.deepEqual(parseGithubRemoteUrl('https://github.com/acme/react.dev'), { owner: 'acme', repo: 'react.dev' });
	assert.deepEqual(parseGithubRemoteUrl('https://github.com/acme/docs.github.com.git'), { owner: 'acme', repo: 'docs.github.com' });
});

test('parseGithubRemoteUrl rejects non-github urls', () => {
	assert.equal(parseGithubRemoteUrl('https://gitlab.com/foo/bar.git'), null);
	assert.equal(parseGithubRemoteUrl('not a url'), null);
});

// ---------------------------------------------------------------------------
// refs
// ---------------------------------------------------------------------------

test('ref parse/build/url/line', () => {
	assert.deepEqual(parseIssueRef('acme/demo#42'), { owner: 'acme', repo: 'demo', number: '42' });
	assert.equal(buildRef('acme', 'demo', 42), 'acme/demo#42');
	assert.equal(issueUrl('acme/demo#42'), 'https://github.com/acme/demo/issues/42');
	assert.equal(trackerRefLine('acme/demo#42'), '**Tracker:** [acme/demo#42](https://github.com/acme/demo/issues/42)');
	assert.throws(() => parseIssueRef('no-hash'));
});

// ---------------------------------------------------------------------------
// status map
// ---------------------------------------------------------------------------

test('mapIssueStatus follows the convention (closed overrides)', () => {
	assert.equal(mapIssueStatus('open', []), 'open');
	assert.equal(mapIssueStatus('OPEN', ['insrc:in-progress']), 'in-progress');
	assert.equal(mapIssueStatus('open', ['insrc:blocked']), 'blocked');
	assert.equal(mapIssueStatus('closed', ['insrc:in-progress']), 'closed');
});

// ---------------------------------------------------------------------------
// body renderers — slug-based doc links (the regression fix)
// ---------------------------------------------------------------------------

function makeDefine(): DefineArtifact {
	return {
		meta: { workflow: 'define', runId: 'r', repoPath: '/repo', focus: 'demo', epicHash: 'a1b2c3d4e5f60718', epicSlug: SLUG, createdAt: '', schemaVersion: 1 },
		body: {
			flavor: 'new-capability',
			problem: 'Users cannot filter results. This blocks onboarding.',
			nonGoals: [{ text: 'Redesign UI', rationale: 'Out of scope' }],
			assumptions: [],
			constraints: [{ id: 'c1', text: 'Respect auth', type: 'invariant', source: 'c-01' }],
			stories: [{ id: 's1', title: 'Add filter field', userValue: 'type a filter', acceptanceCriteria: [], sizeEstimate: 'S' }],
			openQuestions: [],
		},
		citations: [],
	} as unknown as DefineArtifact;
}

test('renderEpicBody links slug-based docs (not hash)', () => {
	const body = renderEpicBody(makeDefine(), SLUG);
	assert.match(body, /## Stories/);
	assert.match(body, /- \[ \] s1: Add filter field \(S\)/);
	assert.match(body, new RegExp(`docs/designs/HLD-${SLUG}\\.md`));
	assert.match(body, new RegExp(`docs/defines/DEF-${SLUG}\\.md`));
	assert.doesNotMatch(body, /HLD-a1b2c3d4e5f60718\.md/);   // never the hash path
});

test('renderStoryBody back-refs the Epic + links the slug LLD', () => {
	const story: DefineStory = { id: 's3', title: 'Third', userValue: 'v3', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: [] }], sizeEstimate: 'M' };
	const body = renderStoryBody('acme/demo#42', story, SLUG);
	assert.match(body, /^\*\*Epic:\*\* #42$/m);
	assert.match(body, /- \*\*ac1:\*\* Given x, when y, then z\./);
	assert.match(body, new RegExp(`docs/designs/LLD-${SLUG}-s3\\.md`));
	assert.match(body, /Size: M/);
});

test('updateEpicTaskList splices the link + is idempotent', () => {
	const before = ['## Stories', '', '- [ ] s1: Add filter field (S)', '- [ ] s2: Persist', ''].join('\n');
	const linked = updateEpicTaskList(before, 's1', 'acme/demo#7', 'Add filter field');
	assert.match(linked, /- \[ \] #7 — s1: Add filter field \(S\)/);
	assert.match(linked, /- \[ \] s2: Persist/);
	assert.equal(updateEpicTaskList(linked, 's1', 'acme/demo#7', 'Add filter field'), linked);   // idempotent
});
