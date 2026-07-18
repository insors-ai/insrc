/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the sc6 `BuildRunProgress` / `BuildHaltInfo` projection
 * (Story s4, t5). Proves it is a PURE deterministic read-time fold over the
 * accumulated `BuildTaskOutcome[]` plus the live approved-plan DEPENDS_ON graph
 * (winning alt a1): runState / completedTaskIds / inFlightTaskId / halt /
 * filesTouchedSoFar are all derivable, deterministic, and never disagree with
 * the persisted rows. Also covers every thrown invariant error and the s5 edge
 * cases.
 *
 * Fixtures follow the src/workflow/__tests__/plan-artifact.test.ts task-shaped
 * idiom (a local `planTask` helper) — NOT the src/analyze/** mkTask helpers,
 * which are out of scope (invariant c5).
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/progress.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	BuildProgressError,
	decodeOutcomeEnvelope,
	projectBuildRunProgress,
	transitiveDependents,
} from '../progress.js';
import type { PlanTask } from '../../../artifacts/plan.js';
import type {
	BuildTaskInFlight,
	BuildTaskOutcome,
	BuildTaskReached,
	BuildTaskStatus,
	BuildTaskUnreached,
} from '../schemas.js';

// ---------------------------------------------------------------------------
// Fixtures — plan-artifact.test.ts task idiom (NOT mkTask).
// ---------------------------------------------------------------------------

function planTask(id: string, order: number, dependsOn: string[] = []): PlanTask {
	return {
		id, title: `Task ${id}`, summary: `do ${id}`, size: 'M', order,
		dependsOn, acceptanceChecks: ['ok'], derivedFrom: ['c1'],
		tests: [{ level: 'unit', name: `unit: ${id}` }],
	};
}

function reached(taskId: string, status: 'completed' | 'failed', files: string[] = [], summary = status): BuildTaskReached {
	return {
		taskId, title: `Task ${taskId}`, dependsOn: [], status,
		filesTouched: files,
		testVerdict: { command: `unit: ${taskId}`, passed: status === 'completed', exitCode: status === 'completed' ? 0 : 1, summary },
		attempts: 1,
	};
}

function unreached(taskId: string, status: 'blocked' | 'not-reached'): BuildTaskUnreached {
	return { taskId, title: `Task ${taskId}`, dependsOn: [], status };
}

function running(taskId: string): BuildTaskInFlight {
	return { taskId, title: `Task ${taskId}`, dependsOn: [], status: 'running' };
}

// A linear chain t1 -> t2 -> t3 -> t4 (each depends on the previous).
function chain(n: number): PlanTask[] {
	const tasks: PlanTask[] = [];
	for (let i = 1; i <= n; i += 1) tasks.push(planTask(`t${i}`, i, i > 1 ? [`t${i - 1}`] : []));
	return tasks;
}

// A diamond: t1 -> {t2, t3} -> t4.
function diamond(): PlanTask[] {
	return [
		planTask('t1', 1),
		planTask('t2', 2, ['t1']),
		planTask('t3', 3, ['t1']),
		planTask('t4', 4, ['t2', 't3']),
	];
}

// ---------------------------------------------------------------------------
// runState — running / halted / complete
// ---------------------------------------------------------------------------

test('runState is complete when every Task is terminal (completed) and none failed', () => {
	const tasks = chain(3);
	const outcomes: BuildTaskOutcome[] = [reached('t1', 'completed'), reached('t2', 'completed'), reached('t3', 'completed')];
	const p = projectBuildRunProgress(outcomes, tasks, 's4');
	assert.equal(p.runState, 'complete');
	assert.equal(p.halt, undefined);
	assert.equal(p.inFlightTaskId, undefined);
	assert.deepEqual(p.completedTaskIds, ['t1', 't2', 't3']);
	assert.equal(p.totalTasks, 3);
});

test('runState is halted iff exactly one outcome has status failed', () => {
	const tasks = chain(3);
	const outcomes: BuildTaskOutcome[] = [reached('t1', 'completed'), reached('t2', 'failed', [], 'tests FAILED (exit 1)'), unreached('t3', 'not-reached')];
	const p = projectBuildRunProgress(outcomes, tasks, 's4');
	assert.equal(p.runState, 'halted');
	assert.ok(p.halt !== undefined);
	assert.equal(p.halt.failedTaskId, 't2');
});

test('runState is running while a Task is mid-flight and none has failed', () => {
	const tasks = chain(3);
	// t1 done, t2 in flight, t3 not present yet.
	const outcomes: BuildTaskOutcome[] = [reached('t1', 'completed'), running('t2')];
	const p = projectBuildRunProgress(outcomes, tasks, 's4');
	assert.equal(p.runState, 'running');
	assert.equal(p.inFlightTaskId, 't2');
	assert.equal(p.halt, undefined);
});

test('runState is running when some Task has no outcome row yet (not all terminal)', () => {
	const tasks = chain(3);
	const outcomes: BuildTaskOutcome[] = [reached('t1', 'completed')];   // t2/t3 absent
	const p = projectBuildRunProgress(outcomes, tasks, 's4');
	assert.equal(p.runState, 'running');
	assert.equal(p.inFlightTaskId, undefined);
});

// ---------------------------------------------------------------------------
// inFlightTaskId — the single 'running' slot
// ---------------------------------------------------------------------------

test('inFlightTaskId is re-derived from the single running slot', () => {
	const tasks = chain(2);
	const p = projectBuildRunProgress([running('t1')], tasks, 's4');
	assert.equal(p.inFlightTaskId, 't1');
	assert.equal(p.runState, 'running');
});

test('more than one running row throws multiple-running (concurrency is structurally impossible)', () => {
	const tasks = chain(2);
	assert.throws(
		() => projectBuildRunProgress([running('t1'), running('t2')], tasks, 's4'),
		(e: unknown) => e instanceof BuildProgressError && e.code === 'multiple-running',
	);
});

// ---------------------------------------------------------------------------
// filesTouchedSoFar — deduped set-union of completed rows
// ---------------------------------------------------------------------------

test('filesTouchedSoFar is the deduped set-union of completed rows filesTouched', () => {
	const tasks = chain(2);
	const outcomes: BuildTaskOutcome[] = [
		reached('t1', 'completed', ['a.ts', 'b.ts']),
		reached('t2', 'completed', ['b.ts', 'c.ts']),   // b.ts overlaps
	];
	const p = projectBuildRunProgress(outcomes, tasks, 's4');
	assert.deepEqual(p.filesTouchedSoFar, ['a.ts', 'b.ts', 'c.ts']);   // exactly once each
});

test('a completed row with empty filesTouched contributes nothing and is not a failure', () => {
	const tasks = chain(1);
	const p = projectBuildRunProgress([reached('t1', 'completed', [])], tasks, 's4');
	assert.deepEqual(p.completedTaskIds, ['t1']);
	assert.deepEqual(p.filesTouchedSoFar, []);
	assert.equal(p.runState, 'complete');
});

// ---------------------------------------------------------------------------
// blockedTaskIds — recomputed transitive DEPENDS_ON closure of the failed Task
// ---------------------------------------------------------------------------

test('halt.blockedTaskIds is the transitive dependent closure of the failed Task (recomputed from the graph)', () => {
	const tasks = diamond();
	// t1 fails; t2, t3 depend on t1; t4 depends on t2 & t3. All blocked.
	const outcomes: BuildTaskOutcome[] = [
		reached('t1', 'failed', [], 'tests FAILED'),
		unreached('t2', 'blocked'), unreached('t3', 'blocked'), unreached('t4', 'not-reached'),
	];
	const p = projectBuildRunProgress(outcomes, tasks, 's4');
	assert.ok(p.halt !== undefined);
	assert.deepEqual(p.halt.blockedTaskIds, ['t2', 't3', 't4']);   // sorted by plan order
});

test('a failed Task with no DEPENDS_ON dependents yields blockedTaskIds === [] and is still fully reported', () => {
	// Two independent tasks; t2 fails and nothing depends on it.
	const tasks = [planTask('t1', 1), planTask('t2', 2)];
	const outcomes: BuildTaskOutcome[] = [reached('t1', 'completed'), reached('t2', 'failed', [], 'boom')];
	const p = projectBuildRunProgress(outcomes, tasks, 's4');
	assert.ok(p.halt !== undefined);
	assert.deepEqual(p.halt.blockedTaskIds, []);
	assert.equal(p.halt.failedTaskId, 't2');
	assert.equal(p.halt.failedTaskTitle, 'Task t2');
	assert.equal(p.halt.reason, 'boom');           // daemon test-verdict summary, not a bare exit code
	assert.equal(p.runState, 'halted');
});

test('edge: the failed plan root blocks every other Task; completedTaskIds === [] and runState === halted', () => {
	const tasks = chain(4);
	const outcomes: BuildTaskOutcome[] = [
		reached('t1', 'failed', [], 'root fails'),
		unreached('t2', 'not-reached'), unreached('t3', 'not-reached'), unreached('t4', 'not-reached'),
	];
	const p = projectBuildRunProgress(outcomes, tasks, 's4');
	assert.equal(p.runState, 'halted');
	assert.deepEqual(p.completedTaskIds, []);
	assert.ok(p.halt !== undefined);
	assert.deepEqual(p.halt.blockedTaskIds, ['t2', 't3', 't4']);
});

test('blockedTaskIds is recomputed from the plan graph, NOT read off the outcome rows (a1 single source of truth)', () => {
	// The outcome rows LIE: they omit any 'blocked' status for t2/t3 (they are
	// 'not-reached'), yet the projection still names them blocked because it
	// walks the live plan graph — proving progress can't skew from row labels.
	const tasks = diamond();
	const outcomes: BuildTaskOutcome[] = [
		reached('t1', 'failed', [], 'fail'),
		unreached('t2', 'not-reached'), unreached('t3', 'not-reached'), unreached('t4', 'not-reached'),
	];
	const p = projectBuildRunProgress(outcomes, tasks, 's4');
	assert.ok(p.halt !== undefined);
	assert.deepEqual(p.halt.blockedTaskIds, ['t2', 't3', 't4']);
});

test('transitiveDependents walks the reverse graph and excludes the root', () => {
	assert.deepEqual(transitiveDependents('t1', diamond()), ['t2', 't3', 't4']);
	assert.deepEqual(transitiveDependents('t2', diamond()), ['t4']);
	assert.deepEqual(transitiveDependents('t4', diamond()), []);
});

// ---------------------------------------------------------------------------
// Edge cases — empty plan
// ---------------------------------------------------------------------------

test('edge: an empty plan is complete vacuously with empty sets and no halt/inFlight', () => {
	const p = projectBuildRunProgress([], [], 's4');
	assert.equal(p.runState, 'complete');
	assert.equal(p.totalTasks, 0);
	assert.deepEqual(p.completedTaskIds, []);
	assert.deepEqual(p.filesTouchedSoFar, []);
	assert.equal(p.inFlightTaskId, undefined);
	assert.equal(p.halt, undefined);
});

// ---------------------------------------------------------------------------
// Determinism — a recompute cannot disagree with itself (pure fold)
// ---------------------------------------------------------------------------

test('two reads with no intervening outcome write return an identical frame (deterministic pure fold)', () => {
	const tasks = diamond();
	const outcomes: BuildTaskOutcome[] = [
		reached('t1', 'completed', ['a.ts']),
		reached('t2', 'failed', ['b.ts'], 'nope'),
		unreached('t3', 'blocked'), unreached('t4', 'not-reached'),
	];
	const a = projectBuildRunProgress(outcomes, tasks, 's4');
	const b = projectBuildRunProgress(outcomes, tasks, 's4');
	assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// Thrown invariant errors — never fabricate a frame
// ---------------------------------------------------------------------------

test('error: more than one failed row throws multiple-failed', () => {
	const tasks = chain(3);
	const outcomes: BuildTaskOutcome[] = [reached('t1', 'failed'), reached('t2', 'failed')];
	assert.throws(
		() => projectBuildRunProgress(outcomes, tasks, 's4'),
		(e: unknown) => e instanceof BuildProgressError && e.code === 'multiple-failed',
	);
});

test('error: a failed row whose taskId is absent from the plan graph throws plan-outcome-drift', () => {
	const tasks = chain(2);
	const outcomes: BuildTaskOutcome[] = [reached('t9', 'failed')];   // t9 not in plan
	assert.throws(
		() => projectBuildRunProgress(outcomes, tasks, 's4'),
		(e: unknown) => e instanceof BuildProgressError && e.code === 'plan-outcome-drift',
	);
});

test('error: a non-failed row whose taskId is absent from the plan graph throws plan-outcome-drift', () => {
	const tasks = chain(2);
	const outcomes: BuildTaskOutcome[] = [reached('t1', 'completed'), reached('t9', 'completed')];
	assert.throws(
		() => projectBuildRunProgress(outcomes, tasks, 's4'),
		(e: unknown) => e instanceof BuildProgressError && e.code === 'plan-outcome-drift',
	);
});

test('error: a row with an out-of-union status string throws unknown-status', () => {
	const tasks = chain(1);
	const bad = { taskId: 't1', title: 'Task t1', dependsOn: [], status: 'weird' as unknown as BuildTaskStatus } as BuildTaskOutcome;
	assert.throws(
		() => projectBuildRunProgress([bad], tasks, 's4'),
		(e: unknown) => e instanceof BuildProgressError && e.code === 'unknown-status',
	);
});

test('error: an undecodable / missing persisted outcome envelope throws undecodable-outcomes', () => {
	assert.throws(() => decodeOutcomeEnvelope(undefined), (e: unknown) => e instanceof BuildProgressError && e.code === 'undecodable-outcomes');
	assert.throws(() => decodeOutcomeEnvelope('not json{'), (e: unknown) => e instanceof BuildProgressError && e.code === 'undecodable-outcomes');
	assert.throws(() => decodeOutcomeEnvelope('{"not":"an array"}'), (e: unknown) => e instanceof BuildProgressError && e.code === 'undecodable-outcomes');
	// A well-formed array round-trips.
	const arr = decodeOutcomeEnvelope(JSON.stringify([reached('t1', 'completed')]));
	assert.equal(arr.length, 1);
	assert.equal(arr[0]!.taskId, 't1');
});
