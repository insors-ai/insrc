/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Driving-surface mirror + halt-and-report end-to-end for the `build` stage
 * (Story s4, t6/t7). Proves a developer drives a HALTED build run through the
 * IDENTICAL stage-agnostic insrc_workflow_step surface every earlier stage
 * uses — no bespoke IPC method, no new output union member:
 *
 *   start → emit_plan → (s1 context.assemble llm-pause) → emit_step
 *         → step (emit BuildContext) → runs s2 tasks.sequence deterministically
 *         → emit_synthesize whose prompt embeds the s2 step output carrying the
 *           sc6 BuildRunProgress halt frame (runState 'halted', failedTaskId,
 *           filesTouchedSoFar) → synthesize → done (BuildArtifact written).
 *
 * The registered `tasks.sequence` runner drives a stub sc5 adapter + verifier
 * (via `_setBuildStageDepsForTests`) whose daemon verdict is 'failed' for the
 * chosen Task — the daemon's OWN give-up decision, no live provider, no git.
 *
 * Run: npx tsx --test src/mcp/workflow-step/__tests__/build-progress-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleWorkflowStep } from '../handler.js';
import { registerWorkflowRunners } from '../../../workflow/index.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';
import { _setBuildStageDepsForTests, type BuildStageDeps } from '../../../workflow/runners/build/index.js';
import { approveArtifactByJsonPath } from '../../../workflow/gates.js';
import { lldArtifactPaths, planArtifactPaths, buildArtifactPaths } from '../../../workflow/storage.js';
import type { PlanTask } from '../../../workflow/artifacts/plan.js';
import type { TaskVerifier, DaemonVerification } from '../../../workflow/runners/build/verifier.js';
import type {
	TaskImplementerAdapter,
	TaskImplementerReport,
	TaskImplementerRequest,
} from '../../../workflow/runners/build/schemas.js';

const HASH = 'a3f4b8c9d1e2f3a4';

interface Envelope { readonly content: readonly { readonly type: 'text'; readonly text: string }[]; readonly isError?: boolean }
function payload(env: Envelope): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first !== undefined);
	return JSON.parse(first.text) as Record<string, unknown>;
}

const PLAN_TASKS: PlanTask[] = [
	{ id: 't1', title: 'Task t1', summary: 'do t1', size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['ok'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: t1' }] },
	{ id: 't2', title: 'Task t2', summary: 'do t2', size: 'M', order: 2, dependsOn: ['t1'], acceptanceChecks: ['ok'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: t2' }] },
];

function seedPlan(repo: string): void {
	const pp = planArtifactPaths(repo, HASH, 's4');
	mkdirSync(dirname(pp.json), { recursive: true });
	writeFileSync(pp.json, JSON.stringify({
		meta: { workflow: 'plan', runId: 'plan-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'build-halt', storyId: 's4', lldRunId: 'lld-run-1', lldEffectiveHash: 'deadbeef' },
		body: { tasks: PLAN_TASKS, testStrategyCoverage: PLAN_TASKS.map(t => ({ lldStrategyItem: `unit: ${t.id}`, coveredByTaskIds: [t.id] })) },
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s4' }],
	}, null, 2));
	approveArtifactByJsonPath(pp.json);
}

function seedLld(repo: string): void {
	const lp = lldArtifactPaths(repo, HASH, 's4');
	mkdirSync(dirname(lp.json), { recursive: true });
	writeFileSync(lp.json, JSON.stringify({
		meta: { workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'build-halt', storyId: 's4', hldBaseRunId: 'hld-run-1', hldEffectiveHash: 'deadbeef', hldAmendmentsApplied: [], approvedAt: '2026-07-18T00:00:00.000Z' },
		body: {}, citations: [],
	}, null, 2));
}

/** Stub deps: t1's daemon verdict is 'failed'; the adapter records who it ran. */
function haltingDeps(): { deps: BuildStageDeps; calls: string[] } {
	const calls: string[] = [];
	const adapter: TaskImplementerAdapter = {
		async implement(req: TaskImplementerRequest): Promise<TaskImplementerReport> {
			calls.push(req.task.id);
			return { claimedComplete: true, narrative: `ran ${req.task.id}` };
		},
	};
	const verifier: TaskVerifier = {
		resolveTestCommand(task: PlanTask): string { return `unit: ${task.id}`; },
		async verify(task: PlanTask): Promise<DaemonVerification> {
			const passed = task.id !== 't1';
			return { verdict: { command: `unit: ${task.id}`, passed, exitCode: passed ? 0 : 1, summary: passed ? 'tests passed (exit 0)' : 'tests FAILED (exit 1) for t1' }, filesTouched: ['src/t.ts'] };
		},
	};
	return { deps: { adapter, verifier }, calls };
}

const BUILD_STEPS = [
	{ id: 's1', runner: 'context.assemble', params: {} },
	{ id: 's2', runner: 'tasks.sequence',   params: {} },
];

/** Extract the first ```json fenced block from a prompt userTurn. */
function fencedJson(userTurn: string): Record<string, unknown> {
	const m = /```json\n([\s\S]*?)\n```/.exec(userTurn);
	assert.ok(m !== null, `no fenced json block in userTurn: ${userTurn.slice(0, 200)}`);
	return JSON.parse(m[1]!) as Record<string, unknown>;
}

test('t6/t7: a halted build run surfaces BuildRunProgress halt frame through the standard insrc_workflow_step surface and finalizes to done', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const { deps, calls } = haltingDeps();
	_setBuildStageDepsForTests(deps);
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-prog-'));
	try {
		seedPlan(repo);
		seedLld(repo);

		// start → emit_plan
		const startOut = payload(await handleWorkflowStep({
			phase: 'start', workflow: 'build', focus: 'build s4', repo, params: { epicHash: HASH, storyId: 's4' },
		}));
		assert.equal(startOut['next'], 'emit_plan', JSON.stringify(startOut));

		// plan → emit_step (s1 context.assemble pauses for an LLM turn)
		const planOut = payload(await handleWorkflowStep({
			phase: 'plan', plan: { workflow: 'build', steps: BUILD_STEPS }, state: startOut['state'] as string,
		}));
		assert.equal(planOut['next'], 'emit_step', JSON.stringify(planOut));
		assert.equal(planOut['stepId'], 's1');

		// step (emit BuildContext) → runs s2 tasks.sequence → emit_synthesize
		const stepOut = payload(await handleWorkflowStep({
			phase: 'step', stepId: 's1', response: { taskCount: 2, summary: 'two tasks' }, state: planOut['state'] as string,
		}));
		assert.equal(stepOut['next'], 'emit_synthesize', JSON.stringify(stepOut).slice(0, 300));

		// The synthesize prompt embeds the s2 step output — the sc6 halt frame is
		// carried through the SAME surface, no bespoke IPC/output member (t6).
		const s2 = fencedJson(stepOut['userTurn'] as string);
		const progress = s2['progress'] as Record<string, unknown>;
		assert.ok(progress !== undefined, 's2 output must carry progress');
		assert.equal(progress['runState'], 'halted');
		assert.equal(progress['totalTasks'], 2);
		const halt = progress['halt'] as Record<string, unknown>;
		assert.equal(halt['failedTaskId'], 't1');
		assert.match(String(halt['reason']), /tests FAILED/);
		assert.deepEqual(halt['blockedTaskIds'], ['t2']);
		assert.deepEqual(progress['filesTouchedSoFar'], []);   // t1 failed (not completed) ⇒ no completed files

		// The daemon started no dependent Task — only the failed t1 was driven
		// (repeated across its repair budget); the dependent t2 never ran.
		assert.ok(calls.every(id => id === 't1'), `only t1 should run; got ${calls.join(',')}`);
		assert.ok(!calls.includes('t2'), 'the dependent t2 must never be started');

		// synthesize → done: the halted run finalizes into a BuildArtifact via
		// the standard storage writers (ac3) — echoing the s2 taskOutcomes.
		const doneOut = payload(await handleWorkflowStep({
			phase: 'synthesize',
			artifact: { body: { summary: 'halted on t1', taskOutcomes: s2['taskOutcomes'] }, citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'Plan s4' }] },
			state: stepOut['state'] as string,
		}));
		assert.equal(doneOut['next'], 'done', JSON.stringify(doneOut).slice(0, 300));
		assert.ok(existsSync(buildArtifactPaths(repo, HASH, 's4', 'build-halt').json), 'BuildArtifact JSON written via storage.ts');
	} finally {
		_setBuildStageDepsForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});
