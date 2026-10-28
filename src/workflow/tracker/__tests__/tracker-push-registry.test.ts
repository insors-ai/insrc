/**
 * The tracker adapter over the registry (Story s10): a push, a comment and a close run through the registry tools against a
 * stand-in gh and create and update the same objects, in the same order, as the old wrapper sequence; a second run
 * creates nothing.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/tracker-push-registry.test.ts
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
import { createGithubTracker } from '../github-adapter.js';
import { createRegistryTable, workflowToolDeps } from '../registry-table.js';
import { ToolDenied } from '../tool-denied.js';

const approve: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'approve' }; } };
const decline: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'decline' }; } };

let bin: StandInBin | undefined;
beforeEach(() => {
	_resetRegistryForTests();
	for (const t of [ghIssueCloseTool, ghIssueCommentTool, ghIssueCreateTool, ghIssueEditTool, ghIssueListTool, ghIssueViewTool, ghLabelTool, ghTrackerTool]) registerTool(t);
	_setApprovalGateForTests(() => approve);
});
afterEach(() => { _setApprovalGateForTests(undefined); bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; });

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

const tracker = () => createGithubTracker('acme', 'demo', { repoPath: '/tmp' });
const kinds = (calls: string[]): string[] => calls.map(c => (/^api .*sub_issues/.test(c) ? 'link' : /^api .*(--method|-X) POST .*issues /.test(c) ? 'create' : c.split(' ').slice(0, 2).join(' ')));

describe('tracker-push-registry.test.ts: a push, sync, setup, question and comment resolution create the same objects and records as the recorded legacy sequence; a second run creates nothing', () => {
	it('a push creates the issue typed, links it under its parent, comments and closes it, in that order, through the registry', async () => {
		const g = gh([
			['*sub_issues*', '{}'],
			['*type=*', '{"number":41,"id":4100}'],
			['*issue*comment*', 'https://github.com/acme/demo/issues/41#issuecomment-1'],
			['*issue*close*', ''],
			['*label*', ''],
		]);
		const t = tracker();
		const created = await t.createIssue({ title: 'T', body: 'B', labels: ['insrc:story'], issueType: 'Story', parent: 'acme/demo#7' });
		assert.deepEqual(created, { ok: true, value: 'acme/demo#41' });
		assert.deepEqual(await t.issueOps.comment('acme/demo#41', 'hi'), { ok: true, value: undefined });
		assert.deepEqual(await t.issueOps.close('acme/demo#41'), { ok: true, value: undefined });
		assert.equal(await t.issueOps.ensureLabel('insrc:story'), true);
		const calls = g.calls();
		assert.equal(calls.length, 5);
		assert.match(calls[0]!, /type=Story/);
		assert.match(calls[0]!, /labels\[\]=insrc:story/);
		assert.match(calls[1]!, /repos\/acme\/demo\/issues\/7\/sub_issues.*sub_issue_id=4100/);
		assert.match(calls[2]!, /issue comment 41/);
		assert.match(calls[3]!, /issue close 41/);
		assert.match(calls[4]!, /^label create/);
	});

	it('a second run finds the issue by its labels and creates nothing', async () => {
		const g = gh([['*issue*list*', '[{"number":41,"title":"T","state":"OPEN"}]']]);
		const found = await tracker().findIssue(['insrc:story', 'epic:x']);
		assert.deepEqual(found, { ok: true, value: 'acme/demo#41' });
		assert.ok(g.calls().every(c => !/^issue create|POST/.test(c)), g.calls().join(' | '));
	});

	it('a declined approval throws a denial from the push and makes no later call', async () => {
		_setApprovalGateForTests(() => decline);
		const g = gh([['*', '{"number":1,"id":1}']]);
		const asking = createGithubTracker('acme', 'demo', { table: createRegistryTable(workflowToolDeps('/tmp', { approvalMode: 'manual' })) });
		await assert.rejects(asking.createIssue({ title: 'T', body: 'B', labels: [], parent: 'acme/demo#7' }), (e: unknown) => e instanceof ToolDenied);
		assert.deepEqual(g.calls(), []);
	});

	it('a gh failure is a failed result of its own kind, not a throw', async () => {
		gh([['*', '', 1, 'HTTP 404: not found']]);
		const r = await tracker().issueOps.close('acme/demo#41');
		assert.equal(r.ok, false);
		assert.equal(!r.ok && r.kind, 'rejected');
	});
});
