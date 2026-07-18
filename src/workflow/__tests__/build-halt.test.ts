/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Halt-and-report integration for the `build` stage (Story s4, t3/t4/t7).
 *
 *  - t3: the per-Task drive loop halts on the FIRST unrepairable Task
 *        (daemon test verdict), starts no dependent, and publishes exactly
 *        one in-flight `'running'` slot before driving each reached Task.
 *  - t4: a halted run still finalizes into a ChainReport-carried record via
 *        the existing storage.ts/hash.ts/slug.ts artifact-writer envelope —
 *        no second, parallel result store.
 *  - t7: `driveBuildStage` surfaces the sc6 `BuildRunProgress` halt frame
 *        (runState 'halted' + failed Task + recomputed blockedTaskIds) and the
 *        accumulated `BuildTaskOutcome[]` is checkpointed per Task boundary.
 *
 * A stub sc5 `TaskImplementerAdapter` + stub verifier drive a chosen Task's
 * daemon verdict to 'failed' — the daemon's OWN give-up decision, not an
 * adapter self-report.
 *
 * Run: npx tsx --test src/workflow/__tests__/build-halt.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { driveBuildStage, type BuildStageDeps } from '../runners/build/index.js';
import { sequenceBuildTasks } from '../runners/build/sequencer.js';
import { finalizeArtifact } from '../orchestrator.js';
import { approveArtifactByJsonPath } from '../gates.js';
import { planArtifactPaths, lldArtifactPaths, buildArtifactPaths } from '../storage.js';
import type { PlanTask } from '../artifacts/plan.js';
import type { BuildArtifact } from '../artifacts/build.js';
import type { TaskVerifier, DaemonVerification } from '../runners/build/verifier.js';
import type {
	BuildTaskOutcome,
	BuildTaskReached,
	TaskImplementerAdapter,
	TaskImplementerRequest,
	TaskImplementerReport,
} from '../runners/build/schemas.js';
import type { WorkflowIntent } from '../types.js';

const HASH = 'a3f4b8c9d1e2f3a4';

// ---------------------------------------------------------------------------
// Fixtures — a 3-Task plan (t2 depends on t1, t3 depends on t2) written
// through the real storage writers; a stub adapter + verifier.
// ---------------------------------------------------------------------------

function planTask(id: string, order: number, dependsOn: string[] = []): PlanTask {
	return {
		id, title: `Task ${id}`, summary: `do ${id}`, size: 'M', order,
		dependsOn, acceptanceChecks: ['ok'], derivedFrom: ['c1'],
		tests: [{ level: 'unit', name: `unit: ${id}` }],
	};
}

const PLAN_TASKS: PlanTask[] = [planTask('t1', 1), planTask('t2', 2, ['t1']), planTask('t3', 3, ['t2'])];

function seedPlan(repo: string): void {
	const pp = planArtifactPaths(repo, HASH, 's4');
	mkdirSync(dirname(pp.json), { recursive: true });
	writeFileSync(pp.json, JSON.stringify({
		meta: {
			workflow: 'plan', runId: 'plan-run-1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'build-halt', storyId: 's4',
			lldRunId: 'lld-run-1', lldEffectiveHash: 'deadbeef',
		},
		body: {
			tasks: PLAN_TASKS,
			testStrategyCoverage: PLAN_TASKS.map(t => ({ lldStrategyItem: `unit: ${t.id}`, coveredByTaskIds: [t.id] })),
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s4' }],
	}, null, 2));
	approveArtifactByJsonPath(pp.json);
}

function seedLld(repo: string): void {
	const lp = lldArtifactPaths(repo, HASH, 's4');
	mkdirSync(dirname(lp.json), { recursive: true });
	writeFileSync(lp.json, JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'build-halt', storyId: 's4',
			hldBaseRunId: 'hld-run-1', hldEffectiveHash: 'deadbeef', hldAmendmentsApplied: [],
			approvedAt: '2026-07-18T00:00:00.000Z',
		},
		body: {}, citations: [],
	}, null, 2));
}

/** Stub adapter — records call order; never rejects. */
function stubAdapter(): TaskImplementerAdapter & { readonly calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		async implement(req: TaskImplementerRequest): Promise<TaskImplementerReport> {
			calls.push(req.task.id);
			return { claimedComplete: true, narrative: `implemented ${req.task.id}` };
		},
	};
}

/** Stub verifier — the daemon's OWN verdict; `failFor` chooses which Task's
 *  verdict is 'failed' (all others pass). */
function stubVerifier(failFor: string, files: readonly string[] = ['x.ts']): TaskVerifier {
	return {
		resolveTestCommand(task: PlanTask): string { return `unit: ${task.id}`; },
		async verify(task: PlanTask): Promise<DaemonVerification> {
			const passed = task.id !== failFor;
			return {
				verdict: { command: `unit: ${task.id}`, passed, exitCode: passed ? 0 : 1, summary: passed ? 'tests passed (exit 0)' : `tests FAILED (exit 1) for ${task.id}` },
				filesTouched: files,
			};
		},
	};
}

function deps(failFor: string): BuildStageDeps {
	return { adapter: stubAdapter(), verifier: stubVerifier(failFor) };
}

// ---------------------------------------------------------------------------
// t3 — the per-Task drive loop halts + publishes a single in-flight slot
// ---------------------------------------------------------------------------

test('t3: the drive loop halts on the first failed Task, starts no dependent, and the invariant runState==halted iff a failed row holds', async () => {
	const adapter = stubAdapter();
	const inFlightSnapshots: BuildTaskOutcome[][] = [];
	const outcomes = await sequenceBuildTasks(PLAN_TASKS, {
		adapter,
		verifier: stubVerifier('t2'),           // t2's daemon verdict fails
		repoRoot: '/tmp/scratch', storyDesignMarkdown: 'd', planMarkdown: 'p', maxAttempts: 1,
		onInFlight: (o) => inFlightSnapshots.push([...o]),
	});
	const byId = new Map(outcomes.map(o => [o.taskId, o]));
	assert.equal(byId.get('t1')!.status, 'completed');
	assert.equal(byId.get('t2')!.status, 'failed');       // halts here
	assert.equal(byId.get('t3')!.status, 'blocked');      // dependent of failed t2 — never started
	assert.deepEqual(adapter.calls, ['t1', 't2']);        // t3's implementer never ran

	// Each reached Task published EXACTLY ONE 'running' slot before driving.
	for (const snap of inFlightSnapshots) {
		assert.equal(snap.filter(o => o.status === 'running').length, 1, 'exactly one in-flight running slot');
	}
	// t1 and t2 were reached (t3 was blocked, never in-flight).
	assert.deepEqual(inFlightSnapshots.map(s => s[s.length - 1]!.taskId), ['t1', 't2']);
});

// ---------------------------------------------------------------------------
// t7 — driveBuildStage surfaces the halted progress frame + per-boundary checkpoints
// ---------------------------------------------------------------------------

test('t7: driveBuildStage on a halted run surfaces a BuildRunProgress halt frame and checkpoints per Task boundary', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-halt-'));
	try {
		seedPlan(repo);
		seedLld(repo);
		const checkpoints: number[] = [];
		const result = await driveBuildStage(
			{ repoPath: repo, epicHash: HASH, storyId: 's4', maxAttempts: 1, onCheckpoint: (o) => checkpoints.push(o.length) },
			deps('t2'),
		);
		assert.equal(result.admitted, true);
		assert.ok(result.progress !== undefined);
		assert.equal(result.progress.runState, 'halted');
		assert.equal(result.progress.totalTasks, 3);
		assert.deepEqual(result.progress.completedTaskIds, ['t1']);
		assert.ok(result.progress.halt !== undefined);
		assert.equal(result.progress.halt.failedTaskId, 't2');
		assert.match(result.progress.halt.reason, /tests FAILED/);          // daemon verdict summary
		assert.deepEqual(result.progress.halt.blockedTaskIds, ['t3']);      // recomputed transitive dependent
		// Per-Task-boundary checkpoints grew by one each time (3 boundaries).
		assert.deepEqual(checkpoints, [1, 2, 3]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// t4 — a halted run still finalizes into a ChainReport record via storage.ts
// ---------------------------------------------------------------------------

test('t4: a halted run finalizes into a ChainReport-carried BuildArtifact via storage.ts/hash.ts/slug.ts (no parallel store)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-halt-'));
	try {
		seedPlan(repo);
		seedLld(repo);
		const result = await driveBuildStage(
			{ repoPath: repo, epicHash: HASH, storyId: 's4', maxAttempts: 1 },
			deps('t2'),
		);
		assert.equal(result.progress?.runState, 'halted');

		// Finalize the run through the SAME carrier the sibling stages use.
		const intent: WorkflowIntent = {
			workflow: 'build', focus: 'build s4', repoPath: repo, repoIndexedAt: null,
			params: { epicHash: HASH, storyId: 's4' },
		};
		const synthBody = {
			body: { summary: 'halted on t2', taskOutcomes: result.taskOutcomes },
			citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'Plan s4' }],
		};
		const fin = finalizeArtifact(intent, { s2: { taskOutcomes: result.taskOutcomes } }, 'build-run-1', 10, synthBody);
		assert.equal(fin.ok, true, JSON.stringify(fin));
		if (!fin.ok) return;
		const artifact = fin.finalized.artifact as BuildArtifact;
		// The finalized record carries the halted run's outcomes, including the
		// 'failed' Task — a reviewable record, not an untracked side-effect. The
		// flat s5 shape carries taskOutcomes DIRECTLY on the record (no body).
		const failed = artifact.taskOutcomes.find(o => o.status === 'failed') as BuildTaskReached | undefined;
		assert.ok(failed !== undefined && failed.taskId === 't2');
		assert.equal(artifact.runState, 'halted');            // re-projected once at finalize (sc6)
		assert.ok(artifact.halt !== undefined && artifact.halt.failedTaskId === 't2');
		assert.equal(artifact.meta.workflow, 'build');
		assert.equal(artifact.meta.storyId, 's4');

		// The record persists at the canonical storage-writer path (same
		// envelope as define/design.epic/design.story/plan).
		const paths = buildArtifactPaths(repo, HASH, 's4', artifact.meta.epicSlug);
		assert.match(paths.json, /BUILD-a3f4b8c9d1e2f3a4-s4\.json$/);
		// renderedJson round-trips back to the same outcomes.
		const roundTrip = JSON.parse(fin.finalized.renderedJson) as BuildArtifact;
		assert.equal(roundTrip.taskOutcomes.length, result.taskOutcomes.length);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
