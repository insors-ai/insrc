import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

import type { Tool } from '../../../types.js';
import * as issue from '../issue.js';
import * as pr from '../pr.js';
import { ghApprovalClass } from '../helpers.js';
import { installFakeGh } from './_fakegh.js';

/** A failed result carries no data, so it is checked against the failure shape every tool shares. */
const FailedResult = Type.Object({
	success: Type.Literal(false), output: Type.String(), error: Type.String(),
	failure: Type.Object({ kind: Type.String(), message: Type.String() }),
});

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };

const ISSUE = { number: 7, title: 'a | b', state: 'OPEN', author: { login: 'x' }, assignees: [{ login: 'y' }], labels: [{ name: 'bug' }], body: 'text', url: 'https://github.com/o/r/issues/7', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', comments: [{ author: { login: 'z' }, body: 'c', createdAt: '2026-01-01T00:00:00Z' }] };
const PR = { number: 3, title: 't', state: 'OPEN', isDraft: false, author: { login: 'x' }, reviewRequests: [{ login: 'r' }], labels: [{ name: 'l' }], baseRefName: 'main', headRefName: 'f', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', body: 'b', url: 'u', additions: 1, deletions: 2, changedFiles: 1 };
const URL_OUT = 'https://github.com/o/r/pull/3\n';

/** tool, an input that satisfies it, and what the fake gh prints */
const CASES: Array<[Tool, Record<string, unknown>, string]> = [
	[issue.ghIssueListTool, {}, JSON.stringify([ISSUE])],
	[issue.ghIssueViewTool, { number: 7 }, JSON.stringify(ISSUE)],
	[issue.ghIssueCreateTool, { title: 't' }, URL_OUT],
	[issue.ghIssueCommentTool, { number: 7, body: 'b' }, URL_OUT],
	[issue.ghIssueEditTool, { number: 7, title: 't' }, ''],
	[issue.ghIssueCloseTool, { number: 7 }, ''],
	[issue.ghIssueReopenTool, { number: 7 }, ''],
	[issue.ghIssueLinkTool, { number: 7, target: '#8' }, URL_OUT],
	[pr.ghPrListTool, {}, JSON.stringify([PR])],
	[pr.ghPrViewTool, { number: 3 }, JSON.stringify(PR)],
	[pr.ghPrDiffTool, { number: 3 }, 'diff --git a/x b/x\n+y\n'],
	[pr.ghPrChecksTool, { number: 3 }, JSON.stringify({ number: 3, statusCheckRollup: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }] })],
	[pr.ghPrFilesTool, { number: 3 }, JSON.stringify({ files: [{ path: 'a.ts', additions: 1, deletions: 0 }] })],
	[pr.ghPrCreateTool, { title: 't' }, URL_OUT],
	[pr.ghPrEditTool, { number: 3, title: 't' }, ''],
	[pr.ghPrCommentTool, { number: 3, body: 'b' }, URL_OUT],
	[pr.ghPrReviewTool, { number: 3, event: 'approve' }, ''],
	[pr.ghPrMergeTool, { number: 3, method: 'squash' }, 'merged'],
	[pr.ghPrCloseTool, { number: 3 }, ''],
	[pr.ghPrReadyTool, { number: 3 }, ''],
];

test('gh-output-schemas.test.ts: issue and pr tool results validate against their output schemas for success and failure', async () => {
	assert.equal(CASES.length, 20);
	for (const [tool] of CASES) {
		// the class a tool declares is the one ghApprovalClass gives its id
		assert.equal(tool.approval, tool.approval === undefined ? undefined : ghApprovalClass(tool.id, {}), tool.id);
	}
	for (const [tool, input, stdout] of CASES) {
		const ok = installFakeGh('ok', stdout);
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, true, `${tool.id}: ${r.output}`);
			assert.ok(Value.Check(tool.outputSchema!, r.data), `${tool.id} data ${JSON.stringify(r.data)} does not match its output schema`);
		} finally { ok.restore(); }

		const bad = installFakeGh('fail404');
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, false, tool.id);
			assert.equal(r.failure?.kind, 'rejected', tool.id);
			// the legacy text stays in output and error
			assert.equal(r.error, 'HTTP 404: not found', tool.id);
			assert.equal(r.output, `[${tool.id}] HTTP 404: not found`, tool.id);
			assert.equal(r.data, undefined, tool.id);
			assert.ok(Value.Check(FailedResult, r), `${tool.id} failed result ${JSON.stringify(r)} does not match the failure shape`);
		} finally { bad.restore(); }
	}
});
