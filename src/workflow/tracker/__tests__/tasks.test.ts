/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the read-side task query/list handlers — driven against a
 * fake `gh` via `_setTrackerExecForTests`. No network, no real repo.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/tasks.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
	_setTrackerExecForTests,
	ghCurrentLogin,
	listMyOpenTasks,
	queryTasks,
} from '../github.js';

afterEach(() => _setTrackerExecForTests());

/** A fake `gh` that records argv and returns a canned graphql search page. */
function fakeGh(searchResult: unknown, opts: { login?: string } = {}) {
	const calls: string[][] = [];
	const fn = ((cmd: string, args: readonly string[]) => {
		calls.push([cmd, ...args]);
		const a = args.join(' ');
		if (a.startsWith('api user')) return opts.login ?? 'octocat';
		if (a.startsWith('api graphql')) return JSON.stringify({ data: { search: searchResult } });
		return '';
	}) as Parameters<typeof _setTrackerExecForTests>[0];
	return { fn, calls };
}

/** The `q=` search-query argument the handler passed to `gh`. */
function searchQueryArg(calls: string[][]): string {
	const gql = calls.find(c => c.includes('graphql'));
	assert.ok(gql, 'expected a gh api graphql call');
	const q = gql.find(a => a.startsWith('q='));
	assert.ok(q, 'expected a q= arg');
	return q.slice('q='.length);
}

const ONE_ISSUE = {
	issueCount: 1,
	pageInfo: { hasNextPage: false, endCursor: 'CUR1' },
	nodes: [{
		number: 42, title: 'Fix the thing', state: 'OPEN', url: 'https://github.com/acme/demo/issues/42',
		author: { login: 'alice' },
		assignees: { nodes: [{ login: 'bob' }] },
		labels: { nodes: [{ name: 'epic:tag-filtering' }, { name: 'story:S001' }, { name: 'insrc:in-progress' }] },
		milestone: { title: 'v1' },
	}],
};

// ---------------------------------------------------------------------------
// projection
// ---------------------------------------------------------------------------

test('queryTasks: projects a GitHub issue into a TrackerTask (epic/story from labels)', () => {
	const { fn } = fakeGh(ONE_ISSUE);
	_setTrackerExecForTests(fn);
	const page = queryTasks('acme', 'demo', {});
	assert.equal(page.tasks.length, 1);
	const t = page.tasks[0]!;
	assert.equal(t.number, 42);
	assert.equal(t.state, 'open');
	assert.equal(t.author, 'alice');
	assert.deepEqual(t.assignees, ['bob']);
	assert.equal(t.milestone, 'v1');
	assert.equal(t.epic, 'tag-filtering');   // 'epic:' prefix stripped
	assert.equal(t.story, 'S001');           // 'story:' prefix stripped
	assert.equal(t.url, 'https://github.com/acme/demo/issues/42');
});

// ---------------------------------------------------------------------------
// pagination — the whole reason TaskPage is a first-class object
// ---------------------------------------------------------------------------

test('queryTasks: surfaces hasNextPage/endCursor + total (no silent truncation)', () => {
	const { fn } = fakeGh({ issueCount: 57, pageInfo: { hasNextPage: true, endCursor: 'CUR2' }, nodes: [] });
	_setTrackerExecForTests(fn);
	const page = queryTasks('acme', 'demo', {});
	assert.equal(page.pageInfo.hasNextPage, true);
	assert.equal(page.pageInfo.endCursor, 'CUR2');
	assert.equal(page.total, 57);
});

test('queryTasks: first page omits `after`; a cursor page passes it', () => {
	const { fn: fn1, calls: c1 } = fakeGh(ONE_ISSUE);
	_setTrackerExecForTests(fn1);
	queryTasks('acme', 'demo', {});
	assert.ok(!c1.some(c => c.some(a => a.startsWith('after='))), 'first page must not send after=');

	const { fn: fn2, calls: c2 } = fakeGh(ONE_ISSUE);
	_setTrackerExecForTests(fn2);
	queryTasks('acme', 'demo', {}, { cursor: 'CUR1' });
	assert.ok(c2.some(c => c.includes('after=CUR1')), 'cursor page must send after=<cursor>');
});

// ---------------------------------------------------------------------------
// filter → search-query translation
// ---------------------------------------------------------------------------

test('queryTasks: default state is open; repo + is:issue always scoped', () => {
	const { fn, calls } = fakeGh(ONE_ISSUE);
	_setTrackerExecForTests(fn);
	queryTasks('acme', 'demo', {});
	const q = searchQueryArg(calls);
	assert.ok(q.includes('repo:acme/demo'), q);
	assert.ok(q.includes('is:issue'), q);
	assert.ok(q.includes('is:open'), q);
});

test('queryTasks: state:all emits no state qualifier', () => {
	const { fn, calls } = fakeGh(ONE_ISSUE);
	_setTrackerExecForTests(fn);
	queryTasks('acme', 'demo', { state: 'all' });
	const q = searchQueryArg(calls);
	assert.ok(!q.includes('is:open') && !q.includes('is:closed'), q);
});

test('queryTasks: owner → assignee:, epic/story → label qualifiers', () => {
	const { fn, calls } = fakeGh(ONE_ISSUE);
	_setTrackerExecForTests(fn);
	queryTasks('acme', 'demo', { owner: 'bob', epic: 'epic:tag-filtering', story: 'story:S001', state: 'closed' });
	const q = searchQueryArg(calls);
	assert.ok(q.includes('assignee:bob'), q);
	assert.ok(q.includes('label:"epic:tag-filtering"'), q);
	assert.ok(q.includes('label:"story:S001"'), q);
	assert.ok(q.includes('is:closed'), q);
});

test('queryTasks: bare story id is normalised to a story: label', () => {
	const { fn, calls } = fakeGh(ONE_ISSUE);
	_setTrackerExecForTests(fn);
	queryTasks('acme', 'demo', { story: 'S001' });
	assert.ok(searchQueryArg(calls).includes('label:"story:S001"'));
});

// ---------------------------------------------------------------------------
// current user + listMyOpenTasks
// ---------------------------------------------------------------------------

test('ghCurrentLogin: reads gh api user .login', () => {
	const { fn } = fakeGh(ONE_ISSUE, { login: 'subhagho' });
	_setTrackerExecForTests(fn);
	assert.equal(ghCurrentLogin(), 'subhagho');
});

test('ghCurrentLogin: throws when no login is returned', () => {
	_setTrackerExecForTests(((cmd: string, args: readonly string[]) => (args.join(' ').startsWith('api user') ? '' : '')) as Parameters<typeof _setTrackerExecForTests>[0]);
	assert.throws(() => ghCurrentLogin(), /no login/);
});

test('listMyOpenTasks: resolves the current login → assignee:<me> is:open', () => {
	const { fn, calls } = fakeGh(ONE_ISSUE, { login: 'subhagho' });
	_setTrackerExecForTests(fn);
	const page = listMyOpenTasks('acme', 'demo');
	assert.equal(page.tasks.length, 1);
	const q = searchQueryArg(calls);
	assert.ok(q.includes('assignee:subhagho'), q);
	assert.ok(q.includes('is:open'), q);
});
