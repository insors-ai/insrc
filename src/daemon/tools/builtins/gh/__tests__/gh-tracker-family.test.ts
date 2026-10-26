/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t9: the gh_tracker family (fifteen ops): exact argv, schemas, class and limit of each op,
 * multi-page, empty and malformed output of the paginated listings, the task query's page info, and project_create.
 * Run: npx tsx --test src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Value } from '@sinclair/typebox/value';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import {
	ghListIssueComments, ghListIssuesByLabelsStrict, ghListIssuesByTitleTokenStrict, queryTasks,
} from '../../../../../workflow/tracker/github.js';
import { ghApprovalClass, ghTimeoutMs, parseJsonLines } from '../helpers.js';
import { COMMENTS_FILTER, ISSUE_NUMBERS_FILTER, ISSUE_TITLES_FILTER, ghTrackerTool } from '../tracker.js';
import type { ApprovalClass, ToolDeps, ToolResult } from '../../../types.js';
import { installFakeGh } from './_fakegh.js';

const deps: ToolDeps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, approvalMode: 'auto' };
const GQL_ISSUE_TYPES = 'query($owner:String!){organization(login:$owner){issueTypes(first:25){nodes{name}}}}';

/** Run one op against a fake gh that prints `stdout`; returns the result and the argv gh was called with. */
async function run(input: Record<string, unknown>, stdout: string): Promise<{ r: ToolResult; calls: string[] }> {
	const gh = installFakeGh('ok', stdout);
	try { return { r: await ghTrackerTool.execute(input, deps), calls: gh.calls() }; } finally { gh.restore(); }
}

interface Row { input: Record<string, unknown>; argv: string; stdout: string; data: Record<string, unknown>; cls: ApprovalClass; limit: number }
const ROWS: Row[] = [
	{ input: { op: 'issue_create_typed', owner: 'o', repo: 'r', title: 'T', body: 'B', labels: ['a', 'b'], type: 'Bug' }, argv: 'api -X POST repos/o/r/issues -f title=T -f body=B -f labels[]=a -f labels[]=b -f type=Bug', stdout: '{"number":7,"id":99,"extra":1}', data: { op: 'issue_create_typed', number: 7, id: 99 }, cls: 'common', limit: 60 },
	{ input: { op: 'issue_create_typed', owner: 'o', repo: 'r', title: 'T', body: '' }, argv: 'api -X POST repos/o/r/issues -f title=T -f body=', stdout: '{"number":8,"id":100}', data: { op: 'issue_create_typed', number: 8, id: 100 }, cls: 'common', limit: 60 },
	{ input: { op: 'sub_issue_link', owner: 'o', repo: 'r', number: 5, subIssueId: 99 }, argv: 'api -X POST repos/o/r/issues/5/sub_issues -F sub_issue_id=99', stdout: '{}', data: { op: 'sub_issue_link', linked: true }, cls: 'common', limit: 30 },
	{ input: { op: 'issue_id', owner: 'o', repo: 'r', number: 5 }, argv: 'api repos/o/r/issues/5', stdout: '{"id":123456,"number":5}', data: { op: 'issue_id', id: 123456 }, cls: 'none', limit: 30 },
	{ input: { op: 'comments_list', owner: 'o', repo: 'r', number: 5 }, argv: `api --paginate repos/o/r/issues/5/comments?per_page=100 -q ${COMMENTS_FILTER}`, stdout: '{"id":1,"author":"x","text":"t","at":"2026-01-01T00:00:00Z","url":"u"}\n', data: { op: 'comments_list', comments: [{ id: '1', author: 'x', text: 't', at: '2026-01-01T00:00:00Z', url: 'u' }] }, cls: 'none', limit: 60 },
	{ input: { op: 'comments_list', owner: 'o', repo: 'r', number: 5, since: '2026-10-26T00:00:00Z' }, argv: `api --paginate repos/o/r/issues/5/comments?per_page=100&since=2026-10-26T00%3A00%3A00Z -q ${COMMENTS_FILTER}`, stdout: '', data: { op: 'comments_list', comments: [] }, cls: 'none', limit: 60 },
	{ input: { op: 'comment_post', owner: 'o', repo: 'r', number: 5, body: 'hello' }, argv: 'api -X POST repos/o/r/issues/5/comments -f body=hello', stdout: '{"id":4567}', data: { op: 'comment_post', id: '4567' }, cls: 'common', limit: 30 },
	{ input: { op: 'issues_by_labels', owner: 'o', repo: 'r', labels: ['a', 'b c'] }, argv: `api --paginate repos/o/r/issues?state=all&per_page=100&labels=a,b%20c -q ${ISSUE_NUMBERS_FILTER}`, stdout: '3\n5\n', data: { op: 'issues_by_labels', numbers: [3, 5] }, cls: 'none', limit: 60 },
	{ input: { op: 'issues_titles', owner: 'o', repo: 'r' }, argv: `api --paginate repos/o/r/issues?state=all&per_page=100 -q ${ISSUE_TITLES_FILTER}`, stdout: '{"number":1,"title":"EP-1 — a"}\n', data: { op: 'issues_titles', issues: [{ number: 1, title: 'EP-1 — a' }] }, cls: 'none', limit: 60 },
	{ input: { op: 'milestone_create', owner: 'o', repo: 'r', title: 'M1' }, argv: 'api -X POST repos/o/r/milestones -f title=M1', stdout: '{"number":3}', data: { op: 'milestone_create', number: 3 }, cls: 'common', limit: 30 },
	{ input: { op: 'token_scopes' }, argv: 'api -i /user', stdout: 'HTTP/2.0 200 OK\nX-Oauth-Scopes: repo, project\n\n{"login":"me"}', data: { op: 'token_scopes', scopes: ['repo', 'project'] }, cls: 'none', limit: 30 },
	{ input: { op: 'token_scopes' }, argv: 'api -i /user', stdout: 'HTTP/2.0 200 OK\n\n{"login":"me"}', data: { op: 'token_scopes', scopes: [] }, cls: 'none', limit: 30 },
	{ input: { op: 'org_issue_types_list', org: 'my-org' }, argv: `api graphql -f query=${GQL_ISSUE_TYPES} -f owner=my-org`, stdout: '{"data":{"organization":{"issueTypes":{"nodes":[{"name":"Epic"},{"name":"Story"},{}]}}}}', data: { op: 'org_issue_types_list', names: ['Epic', 'Story'] }, cls: 'none', limit: 30 },
	{ input: { op: 'org_issue_type_create', org: 'my-org', name: 'Epic', color: 'blue', description: 'd' }, argv: 'api -X POST orgs/my-org/issue-types -f name=Epic -F is_enabled=true -f color=blue -f description=d', stdout: '{}', data: { op: 'org_issue_type_create', created: true }, cls: 'common', limit: 30 },
	{ input: { op: 'current_login' }, argv: 'api user', stdout: '{"login":"me","id":1}', data: { op: 'current_login', login: 'me' }, cls: 'none', limit: 30 },
	{ input: { op: 'user_by_host', host: 'github.example.com:8443', login: 'octo' }, argv: 'api --hostname github.example.com:8443 users/octo', stdout: '{"login":"octo","node_id":"U_1"}', data: { op: 'user_by_host', login: 'octo', node_id: 'U_1' }, cls: 'none', limit: 30 },
	{ input: { op: 'project_create', owner: 'my-org', title: 'Roadmap' }, argv: 'project create --title Roadmap --owner my-org --format json', stdout: '{"number":7,"url":"https://github.com/orgs/my-org/projects/7"}', data: { op: 'project_create', number: 7, url: 'https://github.com/orgs/my-org/projects/7' }, cls: 'common', limit: 60 },
];

test('gh-tracker-family.test.ts: each of the 15 ops builds its exact argv, accepts its input schema, returns the data of the fixture that fits its output schema, and has its class and limit', async () => {
	const seen = new Set<string>();
	for (const row of ROWS) {
		const op = String(row.input['op']); seen.add(op);
		const label = `${op} ${row.argv}`;
		assert.ok(validateAgainstSchema(ghTrackerTool.inputSchema as unknown as StructuredSchema, row.input).ok, `${label}: the input schema accepts it`);
		assert.equal(ghApprovalClass('gh_tracker', row.input), row.cls, `${label}: class`);
		assert.equal(ghTimeoutMs({ toolId: 'gh_tracker', op }), row.limit * 1000, `${label}: limit`);
		const { r, calls } = await run(row.input, row.stdout);
		assert.equal(r.success, true, `${label}: ${r.output}`);
		assert.deepEqual(calls, [row.argv], label);
		assert.deepEqual(r.data, row.data, label);
		assert.ok(Value.Check(ghTrackerTool.outputSchema, r.data), `${label}: the data fits the output union`);
	}
	// tasks_query has its own test below; every op of the family is in this table or that one
	seen.add('tasks_query');
	assert.deepEqual([...seen].sort(), ghTrackerTool.ops.map(o => o.name).sort());
	assert.equal(ghTrackerTool.ops.length, 15);
});

test('gh-tracker-family.test.ts: owner, repo and org are name fields and numbers are positive integers; a bad value is refused by the input schema', () => {
	const ok = (input: Record<string, unknown>): boolean => validateAgainstSchema(ghTrackerTool.inputSchema as unknown as StructuredSchema, input).ok;
	assert.equal(ok({ op: 'issue_id', owner: 'my.org', repo: 'r_1', number: 1 }), true);
	for (const owner of ['a/b', '..', '.', 'x?y', 'a#b', 'caf\u00e9', '']) assert.equal(ok({ op: 'issue_id', owner, repo: 'r', number: 1 }), false, owner);
	for (const number of [0, -1, 1.5, '5']) assert.equal(ok({ op: 'issue_id', owner: 'o', repo: 'r', number }), false, String(number));
	assert.equal(ok({ op: 'org_issue_types_list', org: 'a/b' }), false);
	assert.equal(ok({ op: 'user_by_host', host: 'github.com', login: 'a/b' }), false);
	assert.equal(ok({ op: 'user_by_host', host: 'evil.com/x', login: 'a' }), false);
	// no input names an endpoint or a jq filter
	assert.equal(ok({ op: 'comments_list', owner: 'o', repo: 'r', number: 1, endpoint: '/user' }), false);
	assert.equal(ok({ op: 'comments_list', owner: 'o', repo: 'r', number: 1, filter: '.' }), false);
});

function lines(n: number, start = 0): string[] { return Array.from({ length: n }, (_, i) => JSON.stringify({ id: start + i, author: 'x', text: `c${start + i}`, at: `2026-01-${String(1 + ((start + i) % 28)).padStart(2, '0')}T00:00:00Z` })); }

test('gh-tracker-family.test.ts: the three paginated ops return every page in API order (more than 100 items), pull requests are absent, empty output is an empty list, blank lines are skipped and a malformed line is a rejected failure naming its line', async () => {
	// comments: two pages of 100 and 50, concatenated as lines (what gh prints with the fixed -q filter)
	const many = await run({ op: 'comments_list', owner: 'o', repo: 'r', number: 5 }, [...lines(100), ...lines(50, 100)].join('\n'));
	const comments = (many.r.data as { comments: Array<{ id: string }> }).comments;
	assert.equal(comments.length, 150);
	assert.deepEqual(comments.map(c => c.id), Array.from({ length: 150 }, (_, i) => String(i)), 'API order across pages');
	// numbers and titles (the jq filter removed pull requests before gh printed them)
	const nums = await run({ op: 'issues_by_labels', owner: 'o', repo: 'r', labels: ['a'] }, ['9', '3', '', '7'].join('\n'));
	assert.deepEqual((nums.r.data as { numbers: number[] }).numbers, [9, 3, 7], 'API order, blank line skipped');
	const titles = await run({ op: 'issues_titles', owner: 'o', repo: 'r' }, ['{"number":2,"title":"b"}', '{"number":1,"title":"a"}'].join('\n'));
	assert.deepEqual((titles.r.data as { issues: unknown[] }).issues, [{ number: 2, title: 'b' }, { number: 1, title: 'a' }]);
	// empty output
	for (const input of [{ op: 'comments_list', owner: 'o', repo: 'r', number: 5 }, { op: 'issues_by_labels', owner: 'o', repo: 'r', labels: ['a'] }, { op: 'issues_titles', owner: 'o', repo: 'r' }]) {
		const e = await run(input, '');
		assert.equal(e.r.success, true, String(input.op));
		assert.deepEqual(Object.values((e.r.data as Record<string, unknown>)).filter(Array.isArray), [[]], String(input.op));
	}
	// a malformed line
	for (const [input, bad] of [
		[{ op: 'comments_list', owner: 'o', repo: 'r', number: 5 }, '{"id":1,"text":"t","at":"a"}\nnot json\n'],
		[{ op: 'issues_by_labels', owner: 'o', repo: 'r', labels: ['a'] }, '1\n{oops\n'],
		[{ op: 'issues_titles', owner: 'o', repo: 'r' }, '{"number":1,"title":"a"}\n}}\n'],
	] as const) {
		const r = (await run(input, bad)).r;
		assert.equal(r.success, false, String(input.op));
		assert.equal(r.failure?.kind, 'rejected');
		assert.match(r.failure?.message ?? '', /line 2/, String(input.op));
	}
	// a row of the wrong shape is rejected too
	assert.equal((await run({ op: 'issues_by_labels', owner: 'o', repo: 'r', labels: ['a'] }, '1\nabc\n')).r.success, false);
	assert.equal((await run({ op: 'issues_titles', owner: 'o', repo: 'r' }, '{"number":"x"}\n')).r.success, false);
});

test('gh-tracker-family.test.ts: the paginated ops return the same items as the tracker wrappers do for the same gh output', async () => {
	// comments: the wrapper sorts by time, the op keeps API order
	const raw = [...lines(30), ...lines(10, 30)].join('\n');
	const gh = installFakeGh('ok', raw);
	let wrapper: ReturnType<typeof ghListIssueComments>;
	try { wrapper = ghListIssueComments('o', 'r', 'o/r#5'); } finally { gh.restore(); }
	const op = (await run({ op: 'comments_list', owner: 'o', repo: 'r', number: 5 }, raw)).r.data as { comments: Array<{ id: string; author: string; text: string; at: string }> };
	const sorted = [...op.comments].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id, undefined, { numeric: true }));
	assert.deepEqual(sorted.map(c => [c.id, c.author, c.text, c.at]), wrapper.map(c => [c.externalId, c.author, c.text, c.at]));
	// numbers
	const gh2 = installFakeGh('ok', '12\n4\n8\n');
	let refs: string[];
	try { refs = ghListIssuesByLabelsStrict('o', 'r', ['a']); } finally { gh2.restore(); }
	const numbers = ((await run({ op: 'issues_by_labels', owner: 'o', repo: 'r', labels: ['a'] }, '12\n4\n8\n')).r.data as { numbers: number[] }).numbers;
	assert.deepEqual([...numbers].sort((a, b) => a - b).map(n => `o/r#${n}`), refs);
	// titles: the wrapper keeps the ones that match the token
	const titleLines = ['{"number":1,"title":"EP-1 — one"}', '{"number":2,"title":"EP-10 — ten"}', '{"number":3,"title":"EP-1"}'].join('\n');
	const gh3 = installFakeGh('ok', titleLines);
	let titled: string[];
	try { titled = ghListIssuesByTitleTokenStrict('o', 'r', 'EP-1'); } finally { gh3.restore(); }
	const all = ((await run({ op: 'issues_titles', owner: 'o', repo: 'r' }, titleLines)).r.data as { issues: Array<{ number: number; title: string }> }).issues;
	const matching = all.filter(i => i.title === 'EP-1' || i.title.startsWith('EP-1 — ')).map(i => `o/r#${i.number}`).sort();
	assert.deepEqual(matching, titled.sort());
});

test('gh-tracker-family.test.ts: tasks_query returns pageInfo { hasNextPage: false } without endCursor when the API gives none, keeps a non-empty endCursor with hasNextPage false, and returns issueCount only when it is a number; it matches queryTasks', async () => {
	const input = { op: 'tasks_query', q: 'repo:o/r is:issue is:open', first: 30 };
	const asData = (stdout: string) => run(input, stdout).then(x => x.r.data as { issueCount?: number; pageInfo: { hasNextPage: boolean; endCursor?: string }; nodes: unknown[] });
	assert.deepEqual(await asData('{"data":{"search":{"nodes":[]}}}'), { op: 'tasks_query', pageInfo: { hasNextPage: false }, nodes: [] } as never);
	const both = await asData('{"data":{"search":{"issueCount":3,"pageInfo":{"hasNextPage":false,"endCursor":"CUR"},"nodes":[{"number":1}]}}}');
	assert.deepEqual(both.pageInfo, { hasNextPage: false, endCursor: 'CUR' });
	assert.equal(both.issueCount, 3);
	const noCount = await asData('{"data":{"search":{"issueCount":"3","pageInfo":{"hasNextPage":true,"endCursor":""},"nodes":[]}}}');
	assert.equal('issueCount' in noCount, false, 'issueCount only when a number');
	assert.deepEqual(noCount.pageInfo, { hasNextPage: true }, 'an empty cursor is left out');
	// the argv: fixed query, the variables through kv, an optional cursor last
	const withAfter = await run({ ...input, after: 'C1' }, '{"data":{"search":{"nodes":[]}}}');
	assert.match(withAfter.calls[0]!, /^api graphql -f query=query\(\$q:String!,\$first:Int!,\$after:String\)\{search.* -f q=repo:o\/r is:issue is:open -F first=30 -f after=C1$/);
	// a response without search is a rejected failure
	const none = await run(input, '{"data":{}}');
	assert.equal(none.r.success, false); assert.equal(none.r.failure?.kind, 'rejected');
	// it matches queryTasks for the same gh output
	const out = '{"data":{"search":{"issueCount":2,"pageInfo":{"hasNextPage":true,"endCursor":"E"},"nodes":[{"number":1,"title":"a","state":"OPEN","url":"u","labels":{"nodes":[{"name":"epic:x"}]}},{"number":2,"title":"b","state":"CLOSED","url":"v"}]}}}';
	const gh = installFakeGh('ok', out);
	let page: ReturnType<typeof queryTasks>;
	try { page = queryTasks('o', 'r', { state: 'open' }); } finally { gh.restore(); }
	const op = await asData(out);
	assert.equal(op.nodes.length, page.tasks.length);
	assert.deepEqual(op.pageInfo, page.pageInfo);
	assert.equal(op.issueCount, page.total);
});

test('gh-tracker-family.test.ts: project_create returns {number, url} for the JSON ghCreateProject reads and a rejected failure for a missing or non-numeric number and for non-JSON output', async () => {
	const input = { op: 'project_create', owner: 'my-org', title: 'Roadmap' };
	assert.deepEqual((await run(input, '{"number":7,"url":"https://x/7"}')).r.data, { op: 'project_create', number: 7, url: 'https://x/7' });
	assert.deepEqual((await run(input, '{"number":7}')).r.data, { op: 'project_create', number: 7, url: '' }, 'a missing url is empty, as the wrapper has it');
	for (const stdout of ['{"url":"https://x/7"}', '{"number":"7"}', '{"number":0}', 'created!', '[]', '']) {
		const r = (await run(input, stdout)).r;
		assert.equal(r.success, false, stdout);
		assert.equal(r.failure?.kind, 'rejected', stdout);
	}
});

test('gh-tracker-family.test.ts: the other single-object ops reject an answer that lacks what they must return', async () => {
	for (const [input, stdout] of [
		[{ op: 'issue_create_typed', owner: 'o', repo: 'r', title: 'T', body: 'B' }, '{"number":7}'],
		[{ op: 'issue_id', owner: 'o', repo: 'r', number: 5 }, '{"id":"abc"}'],
		[{ op: 'comment_post', owner: 'o', repo: 'r', number: 5, body: 'b' }, '{"id":"x"}'],
		[{ op: 'milestone_create', owner: 'o', repo: 'r', title: 'M' }, '{}'],
		[{ op: 'current_login' }, '{"login":""}'],
		[{ op: 'user_by_host', host: 'github.com', login: 'a' }, '{"login":"a"}'],
	] as const) {
		const r = (await run(input, stdout)).r;
		assert.equal(r.success, false, JSON.stringify(input));
		assert.equal(r.failure?.kind, 'rejected');
	}
	void parseJsonLines;
});
