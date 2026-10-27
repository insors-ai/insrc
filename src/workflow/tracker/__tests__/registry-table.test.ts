/**
 * The replacement table over the registry (Story s10): one case per row, each against a stand-in gh on PATH.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/registry-table.test.ts
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ghIssueCloseTool, ghIssueCommentTool, ghIssueCreateTool, ghIssueEditTool, ghIssueListTool, ghIssueViewTool } from '../../../daemon/tools/builtins/gh/issue.js';
import { ghLabelTool } from '../../../daemon/tools/builtins/gh/resources.js';
import { ghProjectManageTool } from '../../../daemon/tools/builtins/gh/manage.js';
import { ghProjectItemAddTool, ghProjectListTool } from '../../../daemon/tools/builtins/gh/project.js';
import { ghTrackerTool } from '../../../daemon/tools/builtins/gh/tracker.js';
import { _setApprovalGateForTests } from '../../../daemon/tools/executor.js';
import { _resetRegistryForTests, registerTool } from '../../../daemon/tools/registry.js';
import type { ApprovalGate } from '../../../daemon/tools/types.js';
import { cleanup } from '../../../daemon/tools/__tests__/_proc.js';
import { installStandInBin } from '../../../daemon/tools/__tests__/_bin.js';
import type { StandInBin } from '../../../daemon/tools/__tests__/_bin.js';
import { GhCommandError } from '../github.js';
import { createRegistryTable, soft, workflowToolDeps } from '../registry-table.js';
import { ToolDenied } from '../tool-denied.js';

const OK = workflowToolDeps('/tmp', { approvalMode: 'auto' });
const approve: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'approve' }; } };
const decline: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'decline' }; } };

let bin: StandInBin | undefined;
beforeEach(() => {
	_resetRegistryForTests();
	for (const t of [ghIssueCloseTool, ghIssueCommentTool, ghIssueCreateTool, ghIssueEditTool, ghIssueListTool, ghIssueViewTool, ghLabelTool, ghTrackerTool, ghProjectManageTool, ghProjectItemAddTool, ghProjectListTool]) registerTool(t);
	_setApprovalGateForTests(() => approve);
});
afterEach(() => { _setApprovalGateForTests(undefined); bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; });

/** A gh that answers by argument pattern: [glob, stdout, exitCode?, stderr?]; the first matching entry wins. */
function gh(answers: Array<[string, string, number?, string?]>): StandInBin {
	let body = 'case "$*" in\n';
	const files: Array<[string, string]> = [];
	answers.forEach(([glob, stdout, code, stderr], i) => {
		files.push([`out${i}`, stdout]);
		body += `  ${glob}) ${stderr !== undefined ? `echo '${stderr}' >&2; ` : ''}cat "$(dirname "$0")/out${i}"; exit ${code ?? 0};;\n`;
	});
	body += '  *) echo "unexpected: $*" >&2; exit 9;;\nesac';
	bin = installStandInBin('gh', body);
	for (const [name, text] of files) writeFileSync(join(bin.dir, name), text);
	return bin;
}
const fail404 = (glob = '*'): [string, string, number, string] => [glob, '', 1, 'HTTP 404: not found'];
const table = (deps = OK) => createRegistryTable(deps);
const rejectedGh = (kind = 'rejected') => (err: unknown) => err instanceof GhCommandError && err.kind === kind;

describe('registry-table.test.ts: one case per issue, comment, label, milestone and task-query row, including best-effort rows and the rule that a denial is thrown, never swallowed', () => {
	it('ghCreateLabel: creates with force and answers true; false on a gh failure', async () => {
		const g = gh([['*label*create*', '']]);
		assert.equal(await table().ghCreateLabel('o', 'r', 'epic:x'), true);
		assert.match(g.calls()[0]!, /^label create epic:x .*--force|^label create .*epic:x/);
		gh([fail404()]);
		assert.equal(await table().ghCreateLabel('o', 'r', 'epic:x'), false);
	});

	it('ghCreateIssue: the ref from the printed url; an unrecognized url throws; a gh failure throws', async () => {
		const g = gh([['*issue*create*', 'https://github.com/o/r/issues/42\n']]);
		assert.equal(await table().ghCreateIssue('o', 'r', 'T', 'B', ['a', 'b']), 'o/r#42');
		assert.match(g.calls()[0]!, /issue create/);
		assert.match(g.calls()[0]!, /--label a,b|-l a,b/);
		gh([['*issue*create*', 'oops']]);
		await assert.rejects(table().ghCreateIssue('o', 'r', 'T', 'B', []), /unrecognized URL: 'oops'/);
		gh([fail404()]);
		await assert.rejects(table().ghCreateIssue('o', 'r', 'T', 'B', []), rejectedGh());
	});

	it('ghCreateIssueTyped: typed, then untyped once only when the type is rejected; any other failure throws without a second POST', async () => {
		let g = gh([['*type=*', '{"number":7,"id":700}']]);
		assert.deepEqual(await table().ghCreateIssueTyped('o', 'r', 'T', 'B', ['x'], 'Task'), { ref: 'o/r#7', id: 700, typed: true });
		g = gh([['*type=*', '', 1, 'HTTP 422: Validation Failed: issue type is not enabled'], ['*', '{"number":8,"id":800}']]);
		assert.deepEqual(await table().ghCreateIssueTyped('o', 'r', 'T', 'B', [], 'Task'), { ref: 'o/r#8', id: 800, typed: false });
		assert.equal(g.calls().length, 2);
		g = gh([['*', '', 1, 'HTTP 500: boom']]);
		await assert.rejects(table().ghCreateIssueTyped('o', 'r', 'T', 'B', [], 'Task'), rejectedGh());
		assert.equal(g.calls().length, 1);
		gh([['*', '{"number":9,"id":900}']]);
		assert.deepEqual(await table().ghCreateIssueTyped('o', 'r', 'T', 'B', []), { ref: 'o/r#9', id: 900, typed: false });
	});

	it('ghLinkSubIssue, ghGetIssueId: the sub-issue link and the REST id, with a malformed ref refused', async () => {
		const g = gh([['*sub_issues*', '{}'], ['*issues/5', '{"id":555}']]);
		await table().ghLinkSubIssue('o', 'r', 'o/r#5', 99);
		assert.match(g.calls()[0]!, /repos\/o\/r\/issues\/5\/sub_issues/);
		assert.equal(await table().ghGetIssueId('o', 'r', 'o/r#5'), 555);
		await assert.rejects(table().ghGetIssueId('o', 'r', 'o/r#0'), /malformed issue reference/);
		gh([fail404()]);
		await assert.rejects(table().ghGetIssueId('o', 'r', 'o/r#5'), rejectedGh());
	});

	it('ghGetIssueBody, ghEditIssueBody, ghComment, ghCloseIssue, ghAttachMilestone: the issue tools with the repo and the number', async () => {
		const g = gh([
			['*issue*view*', '{"number":3,"title":"t","state":"OPEN","body":"  hello \\n"}'],
			['*issue*edit*', '{}'], ['*issue*comment*', 'https://github.com/o/r/issues/3#issuecomment-1'], ['*issue*close*', ''],
		]);
		const t = table();
		assert.equal(await t.ghGetIssueBody('o', 'r', 'o/r#3'), 'hello');
		await t.ghEditIssueBody('o', 'r', 'o/r#3', 'new body');
		await t.ghComment('o', 'r', 'o/r#3', 'hi');
		await t.ghCloseIssue('o', 'r', 'o/r#3');
		await t.ghAttachMilestone('o', 'r', 'o/r#3', 'M1');
		const calls = g.calls();
		assert.ok(calls.some(c => /issue edit 3/.test(c) && / -b new body /.test(c)));
		assert.ok(calls.some(c => /issue edit 3/.test(c) && / -m M1 /.test(c)));
		assert.ok(calls.some(c => /issue comment 3/.test(c) && / -b hi /.test(c)));
		assert.ok(calls.some(c => /issue close 3/.test(c)));
		gh([fail404()]);
		await assert.rejects(t.ghComment('o', 'r', 'o/r#3', 'hi'), rejectedGh());
	});

	it('ghListIssueComments: every comment ascending by time and id, with since; a bad line throws and is never read as no comments', async () => {
		const lines = [
			{ id: 11, author: 'b', text: 'second', at: '2026-10-02T00:00:00Z', url: 'u2' },
			{ id: 10, author: 'a', text: 'first', at: '2026-10-01T00:00:00Z' },
			{ id: 9, author: 'a', text: 'same time lower id', at: '2026-10-02T00:00:00Z' },
		].map(l => JSON.stringify(l)).join('\n');
		const g = gh([['*comments*', lines]]);
		const got = await table().ghListIssueComments('o', 'r', 'o/r#3', '2026-09-30T00:00:00Z');
		assert.deepEqual(got.map(c => c.externalId), ['10', '9', '11']);
		assert.equal(got[2]!.url, 'u2');
		assert.equal('url' in got[0]!, false);
		assert.match(g.calls()[0]!, /since=2026-09-30T00%3A00%3A00Z/);
		gh([['*comments*', 'not json']]);
		await assert.rejects(table().ghListIssueComments('o', 'r', 'o/r#3'), rejectedGh());
		gh([fail404()]);
		await assert.rejects(table().ghListIssueComments('o', 'r', 'o/r#3'), rejectedGh());
	});

	it('ghPostCommentReturningId: the new comment id', async () => {
		gh([['*comments*', '{"id":123456}']]);
		assert.equal(await table().ghPostCommentReturningId('o', 'r', 'o/r#3', 'hi'), '123456');
		gh([['*comments*', '{"nope":1}']]);
		await assert.rejects(table().ghPostCommentReturningId('o', 'r', 'o/r#3', 'hi'), rejectedGh());
	});

	it('ghGetIssueState: lower-case state with the label names', async () => {
		gh([['*issue*view*', '{"number":3,"title":"t","state":"CLOSED","labels":[{"name":"a"},{"name":""},{"name":"b"}]}']]);
		assert.deepEqual(await table().ghGetIssueState('o', 'r', 'o/r#3'), { state: 'closed', labels: ['a', 'b'] });
		gh([['*issue*view*', '{"number":3,"title":"t","state":"OPEN"}']]);
		assert.deepEqual(await table().ghGetIssueState('o', 'r', 'o/r#3'), { state: 'open', labels: [] });
	});

	it('ghFindIssueByLabels and its Strict form: the first issue; none is undefined; a gh failure is undefined only for the non-strict form', async () => {
		const g = gh([['*issue*list*', '[{"number":12,"title":"t","state":"OPEN"}]']]);
		assert.equal(await table().ghFindIssueByLabels('o', 'r', ['a', 'b']), 'o/r#12');
		assert.equal(await table().ghFindIssueByLabelsStrict('o', 'r', ['a', 'b']), 'o/r#12');
		assert.match(g.calls()[0]!, /issue list/);
		assert.match(g.calls()[0]!, /-s all -L 1 -l a,b/);
		gh([['*issue*list*', '[]']]);
		assert.equal(await table().ghFindIssueByLabels('o', 'r', ['a']), undefined);
		assert.equal(await table().ghFindIssueByLabelsStrict('o', 'r', ['a']), undefined);
		gh([fail404()]);
		assert.equal(await table().ghFindIssueByLabels('o', 'r', ['a']), undefined);
		await assert.rejects(table().ghFindIssueByLabelsStrict('o', 'r', ['a']), rejectedGh());
	});

	it('ghListIssuesByLabelsStrict and ghListIssuesByTitleTokenStrict: ascending refs; the title filter keeps the token and the token followed by a dash only', async () => {
		gh([['*issues*labels=*', '9\n3\n5\n']]);
		assert.deepEqual(await table().ghListIssuesByLabelsStrict('o', 'r', ['a', 'b']), ['o/r#3', 'o/r#5', 'o/r#9']);
		gh([['*issues*', ['{"number":8,"title":"LLD-x-s1 — t"}', '{"number":2,"title":"LLD-x-s1"}', '{"number":4,"title":"LLD-x-s10 — t"}'].join('\n')]]);
		assert.deepEqual(await table().ghListIssuesByTitleTokenStrict('o', 'r', 'LLD-x-s1'), ['o/r#2', 'o/r#8']);
		gh([fail404()]);
		await assert.rejects(table().ghListIssuesByLabelsStrict('o', 'r', ['a']), rejectedGh());
		await assert.rejects(table().ghListIssuesByTitleTokenStrict('o', 'r', 't'), rejectedGh());
	});

	it('ghEnsureMilestone: best effort, a gh failure (including already exists) is swallowed', async () => {
		const g = gh([['*milestones*', '{"number":1}']]);
		await table().ghEnsureMilestone('o', 'r', 'M1');
		assert.match(g.calls()[0]!, /repos\/o\/r\/milestones/);
		gh([['*milestones*', '', 1, 'HTTP 422: already_exists']]);
		await table().ghEnsureMilestone('o', 'r', 'M1');
	});

	it('queryTasks and listMyOpenTasks: the search string, the page size cap, the cursor, the task projection and the current login', async () => {
		const answer = JSON.stringify({ data: { search: {
			issueCount: 2, pageInfo: { hasNextPage: true, endCursor: 'CUR' },
			nodes: [
				{ number: 1, title: 'a', state: 'OPEN', url: 'u1', author: { login: 'me' }, assignees: { nodes: [{ login: 'me' }] }, labels: { nodes: [{ name: 'epic:e1' }, { name: 'story:s1' }] }, milestone: { title: 'M' } },
				{ number: 2, title: 'b', state: 'CLOSED', url: 'u2', labels: { nodes: [] } },
			],
		} } });
		let g = gh([['*graphql*', answer]]);
		const page = await table().queryTasks('o', 'r', { state: 'all', epic: 'e1', story: 's1', owner: 'me' }, { size: 500, cursor: 'PREV' });
		assert.deepEqual(page.tasks.map(t => [t.number, t.state, t.epic, t.story, t.milestone]), [[1, 'open', 'e1', 's1', 'M'], [2, 'closed', undefined, undefined, undefined]]);
		assert.deepEqual(page.pageInfo, { hasNextPage: true, endCursor: 'CUR' });
		assert.equal(page.total, 2);
		assert.match(g.calls()[0]!, /first=100/);
		assert.match(g.calls()[0]!, /after=PREV/);
		assert.match(g.calls()[0]!, /repo:o\/r is:issue assignee:me label:"epic:e1" label:"story:s1"/);
		g = gh([['*api*user*', '{"login":"octo"}'], ['*graphql*', answer]]);
		await table().listMyOpenTasks('o', 'r');
		assert.ok(g.calls().some(c => /assignee:octo/.test(c) && /is:open/.test(c)));
		gh([['*graphql*', '{"data":{}}']]);
		await assert.rejects(table().queryTasks('o', 'r', {}), rejectedGh());
	});

	it('every row, on a gh failure, gives its old failure: a thrown GhCommandError of the right kind, or its best-effort result; void rows resolve to undefined on success', async () => {
		const t = table();
		const hard: Array<[string, () => Promise<unknown>]> = [
			['ghCreateIssue', () => t.ghCreateIssue('o', 'r', 'T', 'B', [])],
			['ghCreateIssueTyped', () => t.ghCreateIssueTyped('o', 'r', 'T', 'B', [], 'Task')],
			['ghLinkSubIssue', () => t.ghLinkSubIssue('o', 'r', 'o/r#1', 2)],
			['ghGetIssueId', () => t.ghGetIssueId('o', 'r', 'o/r#1')],
			['ghGetIssueBody', () => t.ghGetIssueBody('o', 'r', 'o/r#1')],
			['ghEditIssueBody', () => t.ghEditIssueBody('o', 'r', 'o/r#1', 'b')],
			['ghComment', () => t.ghComment('o', 'r', 'o/r#1', 'b')],
			['ghListIssueComments', () => t.ghListIssueComments('o', 'r', 'o/r#1')],
			['ghPostCommentReturningId', () => t.ghPostCommentReturningId('o', 'r', 'o/r#1', 'b')],
			['ghCloseIssue', () => t.ghCloseIssue('o', 'r', 'o/r#1')],
			['ghGetIssueState', () => t.ghGetIssueState('o', 'r', 'o/r#1')],
			['ghFindIssueByLabelsStrict', () => t.ghFindIssueByLabelsStrict('o', 'r', ['a'])],
			['ghListIssuesByLabelsStrict', () => t.ghListIssuesByLabelsStrict('o', 'r', ['a'])],
			['ghListIssuesByTitleTokenStrict', () => t.ghListIssuesByTitleTokenStrict('o', 'r', 'x')],
			['ghAttachMilestone', () => t.ghAttachMilestone('o', 'r', 'o/r#1', 'M')],
			['queryTasks', () => t.queryTasks('o', 'r', {})],
			['listMyOpenTasks', () => t.listMyOpenTasks('o', 'r')],
		];
		for (const [kind, stderr] of [['rejected', 'HTTP 404: not found'], ['missing-signin', 'gh auth login'], ['rejected', 'HTTP 500: boom']] as const) {
			gh([['*', '', 1, stderr]]);
			for (const [name, call] of hard) await assert.rejects(call(), rejectedGh(kind), `${name} on ${stderr}`);
		}
		// best-effort rows give their old fallback for every gh failure
		gh([fail404()]);
		assert.equal(await t.ghCreateLabel('o', 'r', 'x'), false);
		assert.equal(await t.ghFindIssueByLabels('o', 'r', ['a']), undefined);
		assert.equal(await t.ghEnsureMilestone('o', 'r', 'M'), undefined);
		// the void rows resolve to undefined on success
		gh([['*', '{"number":1,"title":"t","state":"OPEN","id":5,"linked":true,"url":"https://github.com/o/r/issues/1#c"}']]);
		assert.equal(await t.ghLinkSubIssue('o', 'r', 'o/r#1', 2), undefined);
		assert.equal(await t.ghEditIssueBody('o', 'r', 'o/r#1', 'b'), undefined);
		assert.equal(await t.ghComment('o', 'r', 'o/r#1', 'b'), undefined);
		assert.equal(await t.ghCloseIssue('o', 'r', 'o/r#1'), undefined);
		assert.equal(await t.ghAttachMilestone('o', 'r', 'o/r#1', 'M'), undefined);
	});

	it('a denial is thrown, never swallowed, in every kind of row (best effort or not)', async () => {
		gh([['*', '{}']]);
		_setApprovalGateForTests(() => decline);
		const denied = workflowToolDeps('/tmp', { approvalMode: 'manual' });   // common calls ask in manual mode
		const t = table(denied);
		const isDenied = (err: unknown) => err instanceof ToolDenied && err.reason === 'declined';
		await assert.rejects(t.ghCreateLabel('o', 'r', 'x'), isDenied);            // best effort
		await assert.rejects(t.ghEnsureMilestone('o', 'r', 'M'), isDenied);        // best effort
		await assert.rejects(t.ghCreateIssue('o', 'r', 'T', 'B', []), isDenied);
		await assert.rejects(t.ghCreateIssueTyped('o', 'r', 'T', 'B', [], 'Task'), isDenied);   // no untyped retry after a denial
		await assert.rejects(t.ghComment('o', 'r', 'o/r#1', 'x'), isDenied);
		await assert.rejects(t.ghPostCommentReturningId('o', 'r', 'o/r#1', 'x'), isDenied);
		await assert.rejects(t.ghCloseIssue('o', 'r', 'o/r#1'), isDenied);
		// with no client attached the default gate denies as no-client
		_setApprovalGateForTests(undefined);
		await assert.rejects(t.ghEditIssueBody('o', 'r', 'o/r#1', 'x'), (err: unknown) => err instanceof ToolDenied);
	});

	it('a schema mismatch throws a rejected error even in a best-effort row (no row of this table converts text, so conversion-failed cannot arise here)', async () => {
		// the issue list answers a number as a string: the output schema check fails (schema-mismatch)
		gh([['*issue*list*', '[{"number":"12","title":"t","state":"OPEN"}]']]);
		await assert.rejects(table().ghFindIssueByLabels('o', 'r', ['a']), rejectedGh());
		// an answer the tool itself refuses is a plain rejected failure, which a best-effort row may swallow
		gh([['*milestones*', '{"nope":true}']]);
		await table().ghEnsureMilestone('o', 'r', 'M');
	});
});

describe('registry-table.test.ts: one case per organisation, project, scope, login and url row, with null, false and [] only for gh failures', () => {
	const manual = workflowToolDeps('/tmp', { approvalMode: 'manual' });
	const isDenied = (err: unknown) => err instanceof ToolDenied && err.reason === 'declined';

	it('ghTokenScopes: the scopes from the header, an absent header is an empty list, a gh failure is ok:false with the old reason', async () => {
		gh([['*api*-i*', 'HTTP/2.0 200 OK\nX-Oauth-Scopes: repo, read:org , project\n\n{}']]);
		assert.deepEqual(await table().ghTokenScopes(), { ok: true, scopes: ['repo', 'read:org', 'project'] });
		gh([['*api*-i*', 'HTTP/2.0 200 OK\n\n{}']]);
		assert.deepEqual(await table().ghTokenScopes(), { ok: true, scopes: [] });
		gh([fail404()]);
		assert.deepEqual(await table().ghTokenScopes(), { ok: false, reason: 'could not read token scopes (`gh api -i /user` failed)' });
	});

	it('ghCurrentLogin: the login; a gh failure throws; an empty answer throws', async () => {
		gh([['*api*user*', '{"login":"octo"}']]);
		assert.equal(await table().ghCurrentLogin(), 'octo');
		gh([['*api*user*', '{"login":""}']]);
		await assert.rejects(table().ghCurrentLogin(), rejectedGh());
		gh([fail404()]);
		await assert.rejects(table().ghCurrentLogin(), rejectedGh());
	});

	it('ghListOrgIssueTypes: the names; [] only when gh fails', async () => {
		gh([['*graphql*', '{"data":{"organization":{"issueTypes":{"nodes":[{"name":"Task"},{"name":""},{"name":"Bug"}]}}}}']]);
		assert.deepEqual(await table().ghListOrgIssueTypes('org'), ['Task', 'Bug']);
		gh([['*graphql*', '{"data":{"organization":null}}']]);
		assert.deepEqual(await table().ghListOrgIssueTypes('org'), []);
		gh([fail404()]);
		assert.deepEqual(await table().ghListOrgIssueTypes('org'), []);
	});

	it('ghCreateOrgIssueType: true; false only when gh fails; a denial is thrown', async () => {
		const g = gh([['*issue-types*', '{}']]);
		assert.equal(await table().ghCreateOrgIssueType('org', 'Task', 'blue', 'd'), true);
		assert.match(g.calls()[0]!, /orgs\/org\/issue-types/);
		gh([fail404()]);
		assert.equal(await table().ghCreateOrgIssueType('org', 'Task', 'blue', 'd'), false);
		gh([['*', '{}']]); _setApprovalGateForTests(() => decline);
		await assert.rejects(table(manual).ghCreateOrgIssueType('org', 'Task', 'blue', 'd'), isDenied);
	});

	it('ghCreateProject: number and url; null only when gh fails; a denial is thrown', async () => {
		const g = gh([['*project*create*', '{"number":4,"url":"https://github.com/orgs/o/projects/4"}']]);
		assert.deepEqual(await table().ghCreateProject('o', 'Board'), { number: 4, url: 'https://github.com/orgs/o/projects/4' });
		assert.match(g.calls()[0]!, /--title Board/);
		gh([['*project*create*', '{"number":5}']]);
		assert.deepEqual(await table().ghCreateProject('o', 'Board'), { number: 5, url: '' });
		gh([fail404()]);
		assert.equal(await table().ghCreateProject('o', 'Board'), null);
		gh([['*', '{}']]); _setApprovalGateForTests(() => decline);
		await assert.rejects(table(manual).ghCreateProject('o', 'Board'), isDenied);
	});

	it('ghFindProjectByTitle: the open board with the exact title; null when none or when gh fails; a schema failure throws (the listing is a read, so it is never asked for approval)', async () => {
		const list = JSON.stringify({ projects: [{ number: 1, title: 'Board', closed: true, url: 'u1' }, { number: 2, title: 'Board', url: 'u2' }, { number: 3, title: 'Other', url: 'u3' }] });
		const g = gh([['*project*list*', list]]);
		assert.deepEqual(await table().ghFindProjectByTitle('o', 'Board'), { number: 2, url: 'u2' });
		assert.match(g.calls()[0]!, /--owner o/);
		assert.match(g.calls()[0]!, /-L 200/);
		assert.equal(await table().ghFindProjectByTitle('o', 'Missing'), null);
		gh([fail404()]);
		assert.equal(await table().ghFindProjectByTitle('o', 'Board'), null);
		// a number that is not a number fails the output schema: thrown, not null
		gh([['*project*list*', JSON.stringify({ projects: [{ number: '2', title: 'Board' }] })]]);
		await assert.rejects(table().ghFindProjectByTitle('o', 'Board'), rejectedGh());
	});

	it('ghAddProjectSingleSelectField: true; false only when gh fails; a denial is thrown', async () => {
		const g = gh([['*project*field-create*', '{}']]);
		assert.equal(await table().ghAddProjectSingleSelectField('o', 4, 'Size', ['XS', 'S']), true);
		assert.match(g.calls()[0]!, /field-create 4/);
		assert.match(g.calls()[0]!, /--data-type SINGLE_SELECT/);
		assert.match(g.calls()[0]!, /--single-select-options XS/);
		gh([fail404()]);
		assert.equal(await table().ghAddProjectSingleSelectField('o', 4, 'Size', ['XS']), false);
		gh([['*', '{}']]); _setApprovalGateForTests(() => decline);
		await assert.rejects(table(manual).ghAddProjectSingleSelectField('o', 4, 'Size', ['XS']), isDenied);
	});

	it('ghListRepoIssueUrls: the urls up to the limit; [] only when gh fails', async () => {
		const g = gh([['*issue*list*', JSON.stringify([{ number: 1, title: 'a', state: 'OPEN', url: 'https://x/1' }, { number: 2, title: 'b', state: 'OPEN' }, { number: 3, title: 'c', state: 'OPEN', url: ' https://x/3 ' }])]]);
		assert.deepEqual(await table().ghListRepoIssueUrls('o', 'r', 50), ['https://x/1', 'https://x/3']);
		assert.match(g.calls()[0]!, /-L 50/);
		await table().ghListRepoIssueUrls('o', 'r', 100000);
		assert.match(g.calls()[1]!, /-L 500/);
		gh([fail404()]);
		assert.deepEqual(await table().ghListRepoIssueUrls('o', 'r', 50), []);
	});

	it('ghAddProjectItem: true; false only when gh fails; a denial is thrown', async () => {
		const g = gh([['*project*item-add*', '{}']]);
		assert.equal(await table().ghAddProjectItem('o', 4, 'https://x/1'), true);
		assert.match(g.calls()[0]!, /item-add 4 --url https:\/\/x\/1 --owner o/);
		gh([fail404()]);
		assert.equal(await table().ghAddProjectItem('o', 4, 'https://x/1'), false);
		gh([['*', '{}']]); _setApprovalGateForTests(() => decline);
		await assert.rejects(table(manual).ghAddProjectItem('o', 4, 'https://x/1'), isDenied);
	});

	it('the best-effort helper turns only gh failures into the fallback: a denial, a conversion failure and a schema mismatch throw', () => {
		const call = (kind: 'rejected' | 'denied' | 'conversion-failed' | 'schema-mismatch' | 'timed-out' | 'unreachable' | 'missing-tool' | 'missing-signin') =>
			({ ok: false as const, toolId: 't', failure: { kind, message: 'm', ...(kind === 'denied' ? { denial: 'no-client' as const } : {}) } });
		for (const k of ['rejected', 'timed-out', 'unreachable', 'missing-tool', 'missing-signin'] as const) assert.equal(soft(call(k), 'fallback'), 'fallback', k);
		assert.throws(() => soft(call('denied'), 'fallback'), (e: unknown) => e instanceof ToolDenied);
		assert.throws(() => soft(call('conversion-failed'), 'fallback'), rejectedGh());
		assert.throws(() => soft(call('schema-mismatch'), 'fallback'), rejectedGh());
	});
});
