/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Coarse-handoff `tracker.push` Task tier (the path claude/codex drive).
 * Seeds an approved Define + an approved plan for s1, enables `pushTasks`,
 * and walks start → plan → execute → verify → synthesize, checking:
 *   - the execute prompt carries the TASK TIER instructions + the plan's tasks,
 *   - the approved plan's tasks reach the context (an unapproved plan does not),
 *   - synthesize persists the LLM-returned taskRefs onto the plan's meta.tracker,
 *   - with pushTasks OFF, the execute prompt has no task instructions.
 *
 * Run: npx tsx --test src/mcp/workflow-step/__tests__/tracker-tasks-coarse.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleWorkflowStep } from '../handler.js';
import { registerWorkflowRunners } from '../../../workflow/index.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';
import { approveArtifactByJsonPath } from '../../../workflow/gates.js';
import { defineArtifactPaths, planArtifactPaths } from '../../../workflow/storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';

interface Envelope { readonly content: readonly { readonly type: 'text'; readonly text: string }[] }
function payload(env: Envelope): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first !== undefined);
	return JSON.parse(first.text) as Record<string, unknown>;
}

function stubGithubConfig(pushTasks: boolean): { path: string; dispose: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gh-cfg-'));
	const path = join(dir, 'github.json');
	writeFileSync(path, JSON.stringify({ default: { type: 'github', owner: 'myorg', repo: 'myrepo', ...(pushTasks ? { pushTasks: true } : {}) } }));
	const prev = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = path;
	return { path, dispose: () => { if (prev === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prev; rmSync(dir, { recursive: true, force: true }); } };
}

function seed(repo: string, opts: { approvePlan: boolean }): void {
	const dp = defineArtifactPaths(repo, HASH);
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering' },
		body: {
			flavor: 'enhancement', problem: 'Users cannot filter todos by tag.',
			nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: [] }] }],
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	approveArtifactByJsonPath(dp.json);

	const pp = planArtifactPaths(repo, HASH, 's1');
	mkdirSync(dirname(pp.json), { recursive: true });
	writeFileSync(pp.json, JSON.stringify({
		meta: { workflow: 'plan', runId: 'p1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', lldRunId: 'l1', lldEffectiveHash: 'x' },
		body: {
			tasks: [
				{ id: 't1', title: 'Add filter input', summary: 'Wire it.', size: 'S', order: 1, dependsOn: [], acceptanceChecks: ['renders'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: input' }] },
				{ id: 't2', title: 'Filter the list', summary: 'Apply predicate.', size: 'M', order: 2, dependsOn: ['t1'], acceptanceChecks: ['filters'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: list' }] },
			],
			testStrategyCoverage: [],
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s1' }],
	}, null, 2));
	if (opts.approvePlan) approveArtifactByJsonPath(pp.json);
}

const PUSH_PLAN = { workflow: 'tracker.push', steps: [
	{ id: 's1', runner: 'context.assemble', params: {} },
	{ id: 's2', runner: 'execute',          params: {} },
	{ id: 's3', runner: 'checklist.verify', params: {} },
] };

/** Walk to the execute step; returns the s2 (execute) prompt + the live state. */
async function walkToExecutePrompt(repo: string): Promise<{ prompt: string; state: string }> {
	const startOut = payload(await handleWorkflowStep({ phase: 'start', workflow: 'tracker.push', focus: 'push', repo, params: { epicHash: HASH } }));
	assert.equal(startOut['next'], 'emit_plan', JSON.stringify(startOut));
	const planOut = payload(await handleWorkflowStep({ phase: 'plan', plan: PUSH_PLAN, state: startOut['state'] as string }));
	// s1 (context.assemble) is deterministic → executor advances to s2 (execute, llm-pause).
	assert.equal(planOut['next'], 'emit_step', JSON.stringify(planOut));
	assert.equal(planOut['stepId'], 's2');
	return { prompt: planOut['prompt'] as string, state: planOut['state'] as string };
}

test('coarse push with pushTasks: execute prompt carries the TASK TIER block + the approved plan tasks', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-coarse-tasks-'));
	const cfg = stubGithubConfig(/* pushTasks */ true);
	try {
		seed(repo, { approvePlan: true });
		const { prompt } = await walkToExecutePrompt(repo);
		assert.match(prompt, /TASK TIER/);
		assert.match(prompt, /sub_issues/);
		assert.match(prompt, /type=Task/);
		// The approved plan's tasks are embedded in the prompt.
		assert.match(prompt, /"id": "t1"/);
		assert.match(prompt, /"id": "t2"/);
	} finally { cfg.dispose(); rmSync(repo, { recursive: true, force: true }); }
});

test('coarse push with pushTasks but an UNAPPROVED plan: no TASK TIER (plan excluded)', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-coarse-tasks-'));
	const cfg = stubGithubConfig(true);
	try {
		seed(repo, { approvePlan: false });
		const { prompt } = await walkToExecutePrompt(repo);
		assert.doesNotMatch(prompt, /TASK TIER/);
	} finally { cfg.dispose(); rmSync(repo, { recursive: true, force: true }); }
});

test('coarse push with pushTasks OFF: execute prompt has no task instructions', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-coarse-tasks-'));
	const cfg = stubGithubConfig(/* pushTasks */ false);
	try {
		seed(repo, { approvePlan: true });
		const { prompt } = await walkToExecutePrompt(repo);
		assert.doesNotMatch(prompt, /TASK TIER/);
		assert.match(prompt, /Sub-issues \+ issue types \(enable with `pushTasks`/);
	} finally { cfg.dispose(); rmSync(repo, { recursive: true, force: true }); }
});

test('coarse push synthesize persists LLM-returned taskRefs onto the plan meta.tracker', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-coarse-tasks-'));
	const cfg = stubGithubConfig(true);
	try {
		seed(repo, { approvePlan: true });
		const { state: afterExecPrompt } = await walkToExecutePrompt(repo);
		// s2 execute → return refs incl. taskRefs.
		const execRefs = {
			epicRef: 'myorg/myrepo#100',
			storyRefs: { s1: 'myorg/myrepo#101' },
			labelsCreated: ['insrc:epic', 'insrc:story', 'insrc:task', 'epic:tag-filtering'],
			taskRefs: { s1: { t1: 'myorg/myrepo#201', t2: 'myorg/myrepo#202' } },
		};
		const s2Out = payload(await handleWorkflowStep({ phase: 'step', stepId: 's2', response: execRefs, state: afterExecPrompt }));
		assert.equal(s2Out['next'], 'emit_step', JSON.stringify(s2Out));
		const verify = { items: [{ itemId: 'epicLabelled', verdict: 'passed' }, { itemId: 'taskLabelled', verdict: 'passed' }], failedCount: 0 };
		const s3Out = payload(await handleWorkflowStep({ phase: 'step', stepId: 's3', response: verify, state: s2Out['state'] as string }));
		assert.equal(s3Out['next'], 'emit_synthesize', JSON.stringify(s3Out));
		const done = payload(await handleWorkflowStep({ phase: 'synthesize', artifact: { refs: execRefs, checklist: verify }, state: s3Out['state'] as string }));
		assert.equal(done['next'], 'done', JSON.stringify(done));

		// The plan artifact's meta.tracker.taskRefs was written.
		const planJson = planArtifactPaths(repo, HASH, 's1').json;
		const plan = JSON.parse(readFileSync(planJson, 'utf8')) as { meta: { tracker?: { taskRefs?: Record<string, string> } } };
		assert.deepEqual(plan.meta.tracker?.taskRefs, { t1: 'myorg/myrepo#201', t2: 'myorg/myrepo#202' });
	} finally { cfg.dispose(); rmSync(repo, { recursive: true, force: true }); }
});
