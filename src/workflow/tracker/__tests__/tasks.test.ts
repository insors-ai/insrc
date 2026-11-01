/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the read-side task query/list handlers — driven against a
 * fake `gh` via `installExecStandIn`. No network, no real repo.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/tasks.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createRegistryTable, workflowToolDeps } from '../registry-table.js';
import { installExecStandIn, installNoPrograms } from '../../__tests__/helpers/exec-stand-in.js';

afterEach(() => installExecStandIn());

/** The registry-backed table: the one way the tracker reaches gh. */
const table = () => createRegistryTable(workflowToolDeps('/tmp'));
const queryTasks = (...a: Parameters<ReturnType<typeof table>['queryTasks']>) => table().queryTasks(...a);
const listMyOpenTasks = (...a: Parameters<ReturnType<typeof table>['listMyOpenTasks']>) => table().listMyOpenTasks(...a);
const ghCurrentLogin = () => table().ghCurrentLogin();

/** A fake `gh` that records argv and returns a canned graphql search page. */
function fakeGh(searchResult: unknown, opts: { login?: string } = {}) {
	const calls: string[][] = [];
	const fn = ((cmd: string, args: readonly string[]) => {
		calls.push([cmd, ...args]);
		const a = args.join(' ');
		if (a === 'api user') return JSON.stringify({ login: opts.login ?? 'octocat' });
		if (a.startsWith('api graphql')) return JSON.stringify({ data: { search: searchResult } });
		return '';
	}) as Parameters<typeof installExecStandIn>[0];
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

test('queryTasks: projects a GitHub issue into a TrackerTask (epic/story from labels)', async () => {
	const { fn } = fakeGh(ONE_ISSUE);
	installExecStandIn(fn);
	const page = await queryTasks('acme', 'demo', {});
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

test('queryTasks: surfaces hasNextPage/endCursor + total (no silent truncation)', async () => {
	const { fn } = fakeGh({ issueCount: 57, pageInfo: { hasNextPage: true, endCursor: 'CUR2' }, nodes: [] });
	installExecStandIn(fn);
	const page = await queryTasks('acme', 'demo', {});
	assert.equal(page.pageInfo.hasNextPage, true);
	assert.equal(page.pageInfo.endCursor, 'CUR2');
	assert.equal(page.total, 57);
});

test('queryTasks: first page omits `after`; a cursor page passes it', async () => {
	const { fn: fn1, calls: c1 } = fakeGh(ONE_ISSUE);
	installExecStandIn(fn1);
	await queryTasks('acme', 'demo', {});
	assert.ok(!c1.some(c => c.some(a => a.startsWith('after='))), 'first page must not send after=');

	const { fn: fn2, calls: c2 } = fakeGh(ONE_ISSUE);
	installExecStandIn(fn2);
	await queryTasks('acme', 'demo', {}, { cursor: 'CUR1' });
	assert.ok(c2.some(c => c.includes('after=CUR1')), 'cursor page must send after=<cursor>');
});

// ---------------------------------------------------------------------------
// filter → search-query translation
// ---------------------------------------------------------------------------

test('queryTasks: default state is open; repo + is:issue always scoped', async () => {
	const { fn, calls } = fakeGh(ONE_ISSUE);
	installExecStandIn(fn);
	await queryTasks('acme', 'demo', {});
	const q = searchQueryArg(calls);
	assert.ok(q.includes('repo:acme/demo'), q);
	assert.ok(q.includes('is:issue'), q);
	assert.ok(q.includes('is:open'), q);
});

test('queryTasks: state:all emits no state qualifier', async () => {
	const { fn, calls } = fakeGh(ONE_ISSUE);
	installExecStandIn(fn);
	await queryTasks('acme', 'demo', { state: 'all' });
	const q = searchQueryArg(calls);
	assert.ok(!q.includes('is:open') && !q.includes('is:closed'), q);
});

test('queryTasks: owner → assignee:, epic/story → label qualifiers', async () => {
	const { fn, calls } = fakeGh(ONE_ISSUE);
	installExecStandIn(fn);
	await queryTasks('acme', 'demo', { owner: 'bob', epic: 'epic:tag-filtering', story: 'story:S001', state: 'closed' });
	const q = searchQueryArg(calls);
	assert.ok(q.includes('assignee:bob'), q);
	assert.ok(q.includes('label:"epic:tag-filtering"'), q);
	assert.ok(q.includes('label:"story:S001"'), q);
	assert.ok(q.includes('is:closed'), q);
});

test('queryTasks: bare story id is normalised to a story: label', async () => {
	const { fn, calls } = fakeGh(ONE_ISSUE);
	installExecStandIn(fn);
	await queryTasks('acme', 'demo', { story: 'S001' });
	assert.ok(searchQueryArg(calls).includes('label:"story:S001"'));
});

// ---------------------------------------------------------------------------
// current user + listMyOpenTasks
// ---------------------------------------------------------------------------

test('ghCurrentLogin: reads gh api user .login', async () => {
	const { fn } = fakeGh(ONE_ISSUE, { login: 'subhagho' });
	installExecStandIn(fn);
	assert.equal(await ghCurrentLogin(), 'subhagho');
});

test('ghCurrentLogin still throws for empty output', async () => {
	installExecStandIn(((cmd: string, args: readonly string[]) => '') as Parameters<typeof installExecStandIn>[0]);
	await assert.rejects(ghCurrentLogin(), /current user/);
});

test('listMyOpenTasks: resolves the current login → assignee:<me> is:open', async () => {
	const { fn, calls } = fakeGh(ONE_ISSUE, { login: 'subhagho' });
	installExecStandIn(fn);
	const page = await listMyOpenTasks('acme', 'demo');
	assert.equal(page.tasks.length, 1);
	const q = searchQueryArg(calls);
	assert.ok(q.includes('assignee:subhagho'), q);
	assert.ok(q.includes('is:open'), q);
});

// ---------------------------------------------------------------------------
// listMyOpenTasks login failures and queryTasks (s1/t9)
// ---------------------------------------------------------------------------

test('listMyOpenTasks propagates a classified or empty login failure before any search call', async () => {
	const cases: Array<[string, (calls: string[][]) => void, RegExp]> = [
		['missing tool', () => installNoPrograms(), /gh CLI not on PATH/],
		['missing sign-in', calls => installLogin(calls, () => { throw Object.assign(new Error('Command failed'), { stderr: 'To get started with GitHub CLI, please run:  gh auth login' }); }), /gh auth login/],
		['timeout', calls => installLogin(calls, () => { throw Object.assign(new Error('Command failed'), { stderr: 'dial tcp: i/o timeout' }); }), /timeout/],
		['empty login', calls => installLogin(calls, () => ''), /current user/],
	];
	/** A gh whose `api user` answers with `login()`; every call is recorded. */
	const installLogin = (calls: string[][], login: () => string): void => installExecStandIn((cmd, args) => {
		calls.push([cmd, ...args]);
		if (args.join(' ') === 'api user') return login();
		return '';
	});
	for (const [name, install, message] of cases) {
		const calls: string[][] = [];
		install(calls);
		await assert.rejects(listMyOpenTasks('acme', 'demo'), (e: unknown) => e instanceof Error && message.test(e.message), name);
		assert.equal(calls.some(c => c.includes('graphql')), false, `${name}: no search call is made`);
	}
});

test('queryTasks keeps its current execution path and results', async () => {
	installExecStandIn(((_cmd: string, args: readonly string[]) => {
		if (args.join(' ').startsWith('api graphql')) return JSON.stringify({ data: { search: ONE_ISSUE } });
		return '';
	}) as Parameters<typeof installExecStandIn>[0]);
	const page = await queryTasks('acme', 'demo', {});
	assert.equal(page.tasks.length, 1);
	assert.equal(page.tasks[0]?.number, 42);
	installExecStandIn(() => { throw Object.assign(new Error('Command failed'), { stderr: 'dial tcp: i/o timeout' }); });
	// the registry tool classifies the failure (the old plain path did not)
	await assert.rejects(queryTasks('acme', 'demo', {}), (e: unknown) => e instanceof Error && e.name === 'GhCommandError');
});
