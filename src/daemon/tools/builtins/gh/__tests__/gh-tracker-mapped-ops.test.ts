/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t9: the closed table of tracker wrappers that map to an EXISTING op. Each mapping is run
 * through executeTool against a fake gh printing a recording of what the wrapper's gh command prints today, and must
 * give the fields the wrapper reads. A mapping that fails is a defect of the design to raise, not a gap to fill with
 * a new op: no op is added to make this pass.
 * Run: npx tsx --test src/daemon/tools/builtins/gh/__tests__/gh-tracker-mapped-ops.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { _resetRegistryForTests } from '../../../registry.js';
import type { ToolDeps } from '../../../types.js';
import { registerGhTools } from '../index.js';
import { installFakeGh } from './_fakegh.js';

afterEach(() => { _setApprovalGateForTests(undefined); _resetRegistryForTests(); });
const deps: ToolDeps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, approvalMode: 'auto' };

const ISSUE = { number: 7, title: 'T', state: 'OPEN', author: { login: 'a' }, assignees: [], labels: [{ name: 'status:planned' }, { name: 'epic:x' }], body: 'the body', url: 'https://github.com/o/r/issues/7', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', comments: [] };

interface Mapping {
	/** The wrapper in src/workflow/tracker/github.ts or setup.ts */
	wrapper: string;
	tool: string;
	input: Record<string, unknown>;
	/** The argv gh is called with after `gh` */
	argv: string;
	/** What gh prints today for the wrapper's command */
	stdout: string;
	/** Fields the wrapper reads, and their expected values in the tool's data (undefined: the wrapper reads only success) */
	reads?: Record<string, unknown>;
	json?: string;
}

const MAPPINGS: Mapping[] = [
	{ wrapper: 'ghCreateLabel', tool: 'gh_label', input: { op: 'create', name: 'epic:x', repo: 'o/r', force: true }, argv: 'label create epic:x -f -R o/r', stdout: '' },
	{ wrapper: 'ghCreateIssue', tool: 'gh_issue_create', input: { repo: 'o/r', title: 'T', body: 'B', labels: ['a', 'b'] }, argv: 'issue create -t T -b B -R o/r -l a,b', stdout: 'https://github.com/o/r/issues/12\n', reads: { url: 'https://github.com/o/r/issues/12' } },
	{ wrapper: 'ghGetIssueBody', tool: 'gh_issue_view', input: { repo: 'o/r', number: 7 }, argv: 'issue view 7 --json number,title,state,author,assignees,labels,url,createdAt,updatedAt,body,comments -R o/r', stdout: JSON.stringify(ISSUE), json: JSON.stringify(ISSUE), reads: { body: 'the body' } },
	{ wrapper: 'ghGetIssueState', tool: 'gh_issue_view', input: { repo: 'o/r', number: 7 }, argv: 'issue view 7 --json number,title,state,author,assignees,labels,url,createdAt,updatedAt,body,comments -R o/r', stdout: JSON.stringify(ISSUE), json: JSON.stringify(ISSUE), reads: { state: 'OPEN', labels: [{ name: 'status:planned' }, { name: 'epic:x' }] } },
	{ wrapper: 'ghEditIssueBody', tool: 'gh_issue_edit', input: { repo: 'o/r', number: 7, body: 'new' }, argv: 'issue edit 7 -b new -R o/r', stdout: 'https://github.com/o/r/issues/7\n' },
	{ wrapper: 'ghAttachMilestone', tool: 'gh_issue_edit', input: { repo: 'o/r', number: 7, milestone: 'M1' }, argv: 'issue edit 7 -m M1 -R o/r', stdout: 'https://github.com/o/r/issues/7\n' },
	{ wrapper: 'ghComment', tool: 'gh_issue_comment', input: { repo: 'o/r', number: 7, body: 'hello' }, argv: 'issue comment 7 -b hello -R o/r', stdout: 'https://github.com/o/r/issues/7#issuecomment-1\n' },
	{ wrapper: 'ghCloseIssue', tool: 'gh_issue_close', input: { repo: 'o/r', number: 7 }, argv: 'issue close 7 -R o/r', stdout: '' },
	{ wrapper: 'ghFindIssueByLabels / ghListRepoIssueUrls', tool: 'gh_issue_list', input: { repo: 'o/r', state: 'all', labels: ['epic:x'], limit: 5 }, argv: 'issue list --json number,title,state,author,assignees,labels,url,createdAt,updatedAt -R o/r -s all -L 5 -l epic:x', stdout: JSON.stringify([ISSUE]), json: JSON.stringify([ISSUE]), reads: { 'issues.0.number': 7, 'issues.0.url': 'https://github.com/o/r/issues/7' } },
	{ wrapper: 'ghFindProjectByTitle', tool: 'gh_project_list', input: { owner: 'my-org', limit: 200 }, argv: 'project list --format json --owner my-org -L 200', stdout: JSON.stringify({ projects: [{ number: 1, title: 'Roadmap', url: 'u1', closed: true }, { number: 2, title: 'Roadmap', url: 'u2', closed: false }], totalCount: 2 }), reads: { 'projects.0.closed': true, 'projects.1.number': 2, 'projects.1.title': 'Roadmap', 'projects.1.url': 'u2', 'projects.1.closed': false } },
	{ wrapper: 'ghAddProjectSingleSelectField', tool: 'gh_project_manage', input: { op: 'field-create', number: 2, owner: 'my-org', name: 'Size', dataType: 'SINGLE_SELECT', singleSelectOptions: ['XS', 'S', 'M'] }, argv: 'project field-create 2 --owner my-org --name Size --data-type SINGLE_SELECT --single-select-options XS --single-select-options S --single-select-options M --format json', stdout: '{"id":"F1"}' },
	{ wrapper: 'ghAddProjectItem', tool: 'gh:project:item-add', input: { number: 2, owner: 'my-org', url: 'https://github.com/o/r/issues/7' }, argv: 'project item-add 2 --url https://github.com/o/r/issues/7 --owner my-org', stdout: '{"id":"I1"}' },
];

const at = (data: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], data);

test('gh-tracker-mapped-ops.test.ts: every mapped wrapper gets, from the existing op, the success and the fields it reads', async () => {
	registerGhTools();
	_setApprovalGateForTests(() => ({ async ask(r) { return { requestId: r.requestId, decision: 'approve' as const }; } }));
	for (const m of MAPPINGS) {
		const gh = installFakeGh('ok', m.stdout, m.json !== undefined ? { json: m.json } : undefined);
		try {
			const r = await executeTool(m.tool, m.input, deps);
			assert.equal(r.success, true, `${m.wrapper} via ${m.tool}: ${r.output}`);
			assert.deepEqual(gh.calls(), [m.argv], m.wrapper);
			for (const [path, expected] of Object.entries(m.reads ?? {})) {
				assert.deepEqual(at(r.data, path), expected, `${m.wrapper}: the data carries ${path}`);
			}
		} finally { gh.restore(); }
	}
	assert.equal(MAPPINGS.length, 12, 'the table is closed: eleven wrappers on existing ops (two share gh_issue_list)');
});

test('gh-tracker-mapped-ops.test.ts: no mapped wrapper is served by the tracker family, and the family holds exactly its fifteen ops', async () => {
	const { ghTrackerTool } = await import('../tracker.js');
	for (const m of MAPPINGS) assert.notEqual(m.tool, 'gh_tracker', m.wrapper);
	assert.equal(ghTrackerTool.ops.length, 15);
});
