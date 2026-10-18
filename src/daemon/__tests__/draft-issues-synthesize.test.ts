/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ac18: the draft hook's readiness reaches the author on every path that writes a
 * draft. The synthesize phase (insrc_workflow_step) and the daemon's workflow.run
 * path each run the hook right after the draft pair is written, and carry
 * issueReadiness and notice on their result; a repo without a team policy sees
 * neither field. The hook itself is replaced here (see draft-issues.test.ts for
 * its behaviour): this test is about what happens to its answer at each hop.
 *
 * Run: npx tsx --test src/daemon/__tests__/draft-issues-synthesize.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleWorkflowStep } from '../steps/workflow-step/handler.js';
import { _clearWorkflowStateStoreForTests } from '../steps/workflow-step/state-store.js';
import { runWorkflowServerSide, workflowDoneData } from '../workflow-rpc.js';
import { registerWorkflowRunners } from '../../workflow/index.js';
import { _setDraftHookForTests, type IssueReadiness } from '../../workflow/draft-issues.js';
import type { LLMProvider, LLMMessage, StructuredSchema } from '../../shared/types.js';
import type { WorkflowIntent } from '../../workflow/types.js';

const READY: IssueReadiness = { status: 'ready', units: [{ unit: 'epic', issue: 'acme/demo#1', created: true }] };
const NOT_READY: IssueReadiness = {
	status: 'not-ready', unit: 'epic', kind: 'missing-signin', outcomeKnown: true, reason: 'gh is not signed in', readyUnits: [],
	message: 'cannot be claimed yet: no issue was created for epic because gh is not signed in',
};
const NOT_APPLICABLE: IssueReadiness = { status: 'not-applicable', reason: 'no-team-policy' };

const STUB_ARTIFACT = {
	body: { title: 'Stub demo', summary: 'The stub walked end-to-end [[c1]].', bulletList: ['first point [[c1]]'] },
	citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
};
const STUB_PLAN = { workflow: 'stub', steps: [{ id: 's1', runner: 'echo.a', params: {} }, { id: 's2', runner: 'echo.b', params: {} }, { id: 's3', runner: 'echo.c', params: {} }] };

function payload(env: { content: readonly { text: string }[] }): Record<string, any> {
	return JSON.parse(env.content[0]!.text) as Record<string, any>;
}

/** Walk the stub workflow through the step handler to its `done` result. */
async function stepToDone(repo: string): Promise<Record<string, any>> {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const start = payload(await handleWorkflowStep({ phase: 'start', workflow: 'stub', focus: 'demo the stub', repo }) as never);
	const plan = payload(await handleWorkflowStep({
		phase: 'plan', state: start['state'],
		plan: { workflow: 'stub', steps: [
			{ id: 's1', runner: 'echo.a', params: { seed: 'alpha' } },
			{ id: 's2', runner: 'echo.b', params: { fromA: '$s1.echoed' } },
			{ id: 's3', runner: 'echo.c', params: { fromA: '$s1.marker', fromB: '$s2.marker' } },
		] },
	} as never) as never);
	assert.equal(plan['next'], 'emit_synthesize');
	return payload(await handleWorkflowStep({
		phase: 'synthesize', state: plan['state'],
		artifact: {
			body: { title: 'Stub demo', summary: 'The stub walked end-to-end [[c1]] [[c2]] [[c3]].', bulletList: ['s1 [[c1]]', 's2 [[c2]]', 's3 [[c3]]'] },
			citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }, { id: 'c2', kind: 'step-output', ref: 's2' }, { id: 'c3', kind: 'step-output', ref: 's3' }],
		},
	} as never) as never);
}

class FakeProvider implements LLMProvider {
	private readonly queue: unknown[];
	constructor(responses: unknown[]) { this.queue = [...responses]; }
	readonly supportsTools = false;
	get capabilities() { return { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false }; }
	async complete(): Promise<never> { throw new Error('unused'); }
	async *stream(): AsyncIterable<string> { throw new Error('unused'); }
	async embed(): Promise<number[]> { return []; }
	async completeStructured<T>(_m: LLMMessage[], _s: StructuredSchema): Promise<T> { return this.queue.shift() as T; }
}

const intent = (repo: string): WorkflowIntent => ({ workflow: 'stub', focus: 'demo stub run', repoPath: repo, repoIndexedAt: null, params: {} });

test('the synthesize result carries readiness for a team repo, a notice when not ready, and nothing without a policy', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-draft-synth-'));
	try {
		// ready: the field is carried, no notice
		_setDraftHookForTests(() => READY);
		const ready = await stepToDone(repo);
		assert.equal(ready['next'], 'done');
		assert.deepEqual(ready['issueReadiness'], READY);
		assert.equal('notice' in ready, false);

		// not ready (the tracker cannot be reached): the draft files still exist and the notice gives the reason
		_setDraftHookForTests(() => NOT_READY);
		const bad = await stepToDone(repo);
		assert.equal(bad['next'], 'done');
		assert.ok(existsSync(bad['path']), 'the draft markdown stays');
		assert.ok(existsSync((bad['path'] as string).replace(/\.md$/, '.json')), 'the draft json stays');
		assert.deepEqual(bad['issueReadiness'], NOT_READY);
		assert.match(bad['notice'], /cannot be claimed yet: no issue was created for epic because gh is not signed in/);
		assert.ok(bad['pendingApproval'] !== undefined, 'the rest of the result is unchanged');

		// a repo without a policy (the real hook, no override): neither field, and no tracker command
		_setDraftHookForTests();
		const plain = await stepToDone(repo);
		assert.equal('issueReadiness' in plain, false);
		assert.equal('notice' in plain, false);
		_setDraftHookForTests(() => NOT_APPLICABLE);
		const na = await stepToDone(repo);
		assert.equal('issueReadiness' in na, false);
	} finally { _setDraftHookForTests(); rmSync(repo, { recursive: true, force: true }); }
});

test('the whole workflow.run path carries readiness at every hop, including the emitted done frame', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-draft-run-'));
	try {
		const run = async (id: string) => runWorkflowServerSide(intent(repo), new FakeProvider([STUB_PLAN, STUB_ARTIFACT]), {
			runId: id, epicKey: `demo-${id}`, modelLabel: 'ollama:test', review: false,
		});

		// hop 1: RunWorkflowResult; hop 2: the data of the done frame runStart sends
		_setDraftHookForTests(() => NOT_READY);
		const bad = await run('wf-bad');
		assert.deepEqual(bad.issueReadiness, NOT_READY);
		assert.equal(bad.notice, NOT_READY.status === 'not-ready' ? NOT_READY.message : '');
		assert.ok(existsSync(bad.path), 'the draft stays');
		const frame = workflowDoneData(bad);
		assert.deepEqual(frame['issueReadiness'], NOT_READY);
		assert.equal(frame['notice'], bad.notice);
		assert.equal(frame['path'], bad.path);

		_setDraftHookForTests(() => READY);
		const ready = await run('wf-ready');
		assert.deepEqual(workflowDoneData(ready)['issueReadiness'], READY);
		assert.equal('notice' in workflowDoneData(ready), false);

		// no policy: neither field on the result nor on the frame
		_setDraftHookForTests();
		const plain = await run('wf-plain');
		assert.equal('issueReadiness' in plain, false);
		assert.equal('notice' in plain, false);
		assert.deepEqual(Object.keys(workflowDoneData(plain)).sort(), ['artifact', 'model', 'path', 'runId']);
		assert.ok(readFileSync(plain.path, 'utf8').length > 0);
	} finally { _setDraftHookForTests(); rmSync(repo, { recursive: true, force: true }); }
});
