/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The exact-token issue-title lookup on the tracker port (s1/t10): the matcher, the GitHub
 * adapter over a stubbed gh boundary, and an in-memory fake that agrees with it.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/title-token.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { createGithubTracker } from '../github-adapter.js';
import { _setTrackerExecForTests } from '../github.js';
import { titleMatchesToken, type IssueRef, type PortResult } from '../port.js';

afterEach(() => _setTrackerExecForTests());

const H = '2f27754d4ad00b8e';
const ISSUES: ReadonlyArray<{ readonly number: number; readonly title: string }> = [
	{ number: 9, title: `STORY-${H}-s10 — the tenth story` },
	{ number: 3, title: `STORY-${H}-s1 — the first story` },
	{ number: 4, title: `TASK-${H}-s1-t10 — a later task` },
	{ number: 5, title: `TASK-${H}-s1-t1 — the first task` },
	{ number: 6, title: `STORY-${H}-s1` },
	{ number: 7, title: `Story STORY-${H}-s1 mentioned mid-title` },
	{ number: 8, title: `STORY-${H}-s1-extra — not the same id` },
	{ number: 2, title: `STORY-${H}-s1: a colon, not a dash` },
];

/** The in-memory counterpart: the same listing, filtered by the shared matcher. */
function fakeFind(token: string): PortResult<IssueRef[]> {
	return { ok: true, value: ISSUES.filter(i => titleMatchesToken(i.title, token)).map(i => i.number).sort((a, b) => a - b).map(n => `acme/demo#${n}`) };
}

test('the exact-token matcher accepts the token and the token followed by an em dash and not a longer id', () => {
	const story = `STORY-${H}-s1`;
	assert.equal(titleMatchesToken(story, story), true);
	assert.equal(titleMatchesToken(`${story} — a title`, story), true);
	assert.equal(titleMatchesToken(`STORY-${H}-s10`, story), false, 's10 is not s1');
	assert.equal(titleMatchesToken(`STORY-${H}-s10 — a title`, story), false);
	assert.equal(titleMatchesToken(`${story}-extra`, story), false);
	assert.equal(titleMatchesToken(`${story}: a title`, story), false, 'only the em dash separates a title');
	assert.equal(titleMatchesToken(`${story} - a hyphen`, story), false);
	assert.equal(titleMatchesToken(`about ${story}`, story), false, 'a token in the middle does not match');
	const task = `TASK-${H}-s1-t1`;
	assert.equal(titleMatchesToken(`TASK-${H}-s1-t10 — later`, task), false, 't10 is not t1');
	assert.equal(titleMatchesToken(`${task} — first`, task), true);
	assert.equal(titleMatchesToken('anything', ''), false, 'an empty token matches nothing');
});

test('findIssuesByTitleToken in the GitHub adapter over a stubbed gh boundary and in the fake agree and a failed call is a failed result', () => {
	// gh api returns every issue, newest first, one JSON object per line (what the -q filter prints)
	_setTrackerExecForTests((_cmd, args) => {
		assert.ok(args.includes('--paginate'), 'the listing covers every page');
		return ISSUES.map(i => JSON.stringify(i)).join('\n') + '\n';
	});
	const tracker = createGithubTracker('acme', 'demo');
	for (const token of [`STORY-${H}-s1`, `STORY-${H}-s10`, `TASK-${H}-s1-t1`, `TASK-${H}-s1-t10`, `STORY-${H}-s2`]) {
		const viaGh = tracker.findIssuesByTitleToken(token);
		assert.deepEqual(viaGh, fakeFind(token), token);
	}
	assert.deepEqual(tracker.findIssuesByTitleToken(`STORY-${H}-s1`), { ok: true, value: ['acme/demo#3', 'acme/demo#6'] });
	assert.deepEqual(tracker.findIssuesByTitleToken(`TASK-${H}-s1-t1`), { ok: true, value: ['acme/demo#5'] });
	assert.deepEqual(tracker.findIssuesByTitleToken(`STORY-${H}-s2`), { ok: true, value: [] });

	// a failed call is a failed result, never an empty list
	_setTrackerExecForTests(() => { throw Object.assign(new Error('Command failed'), { stderr: 'HTTP 502: Bad Gateway' }); });
	const failed = tracker.findIssuesByTitleToken(`STORY-${H}-s1`);
	assert.equal(failed.ok, false);
	if (!failed.ok) assert.match(failed.reason, /502/);

	// an answer the adapter cannot read is a failure too
	_setTrackerExecForTests(() => 'not json\n');
	assert.equal(tracker.findIssuesByTitleToken(`STORY-${H}-s1`).ok, false);
});
