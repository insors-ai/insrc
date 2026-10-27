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
import { ghTrackerTool } from '../../../daemon/tools/builtins/gh/tracker.js';
import { _setApprovalGateForTests } from '../../../daemon/tools/executor.js';
import { _resetRegistryForTests, registerTool } from '../../../daemon/tools/registry.js';
import type { ApprovalGate } from '../../../daemon/tools/types.js';
import { cleanup } from '../../../daemon/tools/__tests__/_proc.js';
import { installStandInBin } from '../../../daemon/tools/__tests__/_bin.js';
import type { StandInBin } from '../../../daemon/tools/__tests__/_bin.js';
import { GhCommandError } from '../github.js';
import { createRegistryTable, workflowToolDeps } from '../registry-table.js';
import { ToolDenied } from '../tool-denied.js';

const OK = workflowToolDeps('/tmp', { approvalMode: 'auto' });
const approve: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'approve' }; } };
const decline: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'decline' }; } };

let bin: StandInBin | undefined;
beforeEach(() => {
	_resetRegistryForTests();
	for (const t of [ghIssueCloseTool, ghIssueCommentTool, ghIssueCreateTool, ghIssueEditTool, ghIssueListTool, ghIssueViewTool, ghLabelTool, ghTrackerTool]) registerTool(t);
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

	it('a conversion failure or a schema mismatch throws a rejected error even in a best-effort row', async () => {
		// the issue list answers a number as a string: the output schema check fails (schema-mismatch)
		gh([['*issue*list*', '[{"number":"12","title":"t","state":"OPEN"}]']]);
		await assert.rejects(table().ghFindIssueByLabels('o', 'r', ['a']), rejectedGh());
		// an answer the tool itself refuses is a plain rejected failure, which a best-effort row may swallow
		gh([['*milestones*', '{"nope":true}']]);
		await table().ghEnsureMilestone('o', 'r', 'M');
	});
});
