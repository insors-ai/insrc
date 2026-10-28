/**
 * The tracker adapter over the registry (Story s10): a push, a comment and a close run through the registry tools against a
 * stand-in gh and create and update the same objects, in the same order, as the old wrapper sequence; a second run
 * creates nothing.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/tracker-push-registry.test.ts
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ghIssueCloseTool, ghIssueCommentTool, ghIssueCreateTool, ghIssueEditTool, ghIssueListTool, ghIssueViewTool } from '../../../daemon/tools/builtins/gh/issue.js';
import { ghLabelTool } from '../../../daemon/tools/builtins/gh/resources.js';
import { gitRemoteTool } from '../../../daemon/tools/builtins/git/remote.js';
import { ghProjectManageTool } from '../../../daemon/tools/builtins/gh/manage.js';
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
import { runTrackerSetup } from '../setup.js';
import { syncTracker } from '../sync.js';
import { artifactJsonPath, defineArtifactId } from '../../storage.js';
import { seedBoundUnits } from '../../__tests__/helpers/task-heads.js';

const approve: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'approve' }; } };
const decline: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'decline' }; } };

let bin: StandInBin | undefined;
beforeEach(() => {
	_resetRegistryForTests();
	for (const t of [ghIssueCloseTool, ghIssueCommentTool, ghIssueCreateTool, ghIssueEditTool, ghIssueListTool, ghIssueViewTool, ghLabelTool, ghTrackerTool, gitRemoteTool, ghProjectManageTool]) registerTool(t);
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

	it('setup ensures the fixed labels through the registry and skips the steps that need scopes it was not given; the same run again ensures the same labels', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-push-setup-'));
		const prior = process.env['INSRC_GITHUB_CONFIG'];
		try {
			execFileSync('git', ['init', '-q'], { cwd: repo });
			execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/acme/demo.git'], { cwd: repo });
			process.env['INSRC_GITHUB_CONFIG'] = join(repo, 'github.json');
			const g = gh([['*label*', ''], ['*api*user*', '{"login":"me"}'], ['*', '', 1, 'HTTP 403: scopes']]);
			const first = await runTrackerSetup(repo);
			const labels = first.steps.find(s => s.key === 'labels');
			assert.equal(labels?.status, 'done', JSON.stringify(first.steps));
			const created = g.calls().filter(c => /^label create/.test(c));
			assert.deepEqual(created.map(c => c.split(' ')[2]), ['insrc:epic', 'insrc:story', 'insrc:task', ...created.slice(3).map(c => c.split(' ')[2]!)]);
			const second = await runTrackerSetup(repo);
			assert.equal(second.steps.find(s => s.key === 'labels')?.status, 'done');
			assert.equal(g.calls().filter(c => /^label create/.test(c)).length, created.length * 2);
		} finally { if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior; rmSync(repo, { recursive: true, force: true }); }
	});

	it('sync reads the Epic issue state through the registry and records its status on the Define; it writes nothing to GitHub', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'insrc-push-sync-'));
		const prior = process.env['INSRC_GITHUB_CONFIG'];
		const HASH = 'a3f4b8c9d1e2f3a4';
		const CREATED = '2026-07-17T07:42:28.275Z';
		try {
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			writeFileSync(join(repo, 'github.json'), JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
			process.env['INSRC_GITHUB_CONFIG'] = join(repo, 'github.json');
			writeFileSync(artifactJsonPath(repo, defineArtifactId(HASH)), JSON.stringify({
				meta: { workflow: 'define', runId: 'd1', repoPath: repo, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED, schemaVersion: 1 },
				body: { flavor: 'enhancement', problem: 'Users cannot filter todos by tag today. Only status filtering exists.', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 'Filter by tag', userValue: 'x', acceptanceCriteria: [] }], openQuestions: [] },
				citations: [],
			}, null, 2));
			seedBoundUnits(repo, HASH, 'acme/demo#1', { s1: 'acme/demo#2' }, CREATED);
			const g = gh([['*api*user*', '{"login":"me"}'], ['*issue*view*', '{"number":1,"title":"t","state":"CLOSED","labels":[{"name":"insrc:epic"}]}']]);
			const r = await syncTracker(repo, HASH);
			assert.equal(r.status, 'synced', JSON.stringify(r));
			assert.ok(g.calls().every(c => /^(api|issue view)/.test(c)), g.calls().join(' | '));
		} finally { if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior; rmSync(repo, { recursive: true, force: true }); }
	});

	it('a question resolution and a comment resolution post their tracker comment through the registry as one issue comment each', async () => {
		const g = gh([['api*comments*', '{"id":5}'], ['*issue*comment*', 'https://github.com/acme/demo/issues/9#issuecomment-5']]);
		const t = tracker();
		assert.deepEqual(await t.issueOps.comment('acme/demo#9', 'q1 resolved: a (because)'), { ok: true, value: undefined });
		assert.deepEqual(await t.postComment('acme/demo#9', 'comment body'), { ok: true, value: { externalId: '5' } });
		assert.equal(g.calls().filter(c => /^issue comment 9/.test(c) || /comments/.test(c)).length, 2);
	});
});
