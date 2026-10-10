/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Executor walker tests.
 *
 * Pure helpers + end-to-end via stub TemplateRuntimes (no LLM).
 * The stub runtimes are registered per-test against an isolated
 * runtime registry, returning deterministic outputs.
 *
 * Covers:
 *   - Pure helpers: unmetDependencies / projectUpstream / checkOutputShape
 *   - Registry: missing runtime -> ExecutorRuntimeMissingError surfaces
 *     as task status='failed' / reason='runtime-missing'
 *   - Output shape: extra or missing produces -> 'output-shape-mismatch'
 *   - Dependency cascade: failed producer -> consumer skipped with
 *     'skipped-dependency-unavailable'
 *   - Persistence: every task record lands at
 *     ~/.insrc/analyze/<runId>/tasks/<taskId>.json
 *   - Aggregator's `report` becomes finalReport
 *   - Planner-template tasks: child plan's aggregator output
 *     materialized as the parent's `report` output
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/executor/__tests__/walker.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import {
	_checkOutputShapeForTest,
	_projectUpstreamForTest,
	_unmetDependenciesForTest,
} from '../walker.js';
import {
	purgeAllTaskOutputs,
	purgeTaskOutput,
	readTaskOutput,
	registerTemplateRuntime,
	runExecutor,
	taskOutputPathFor,
	_resetRuntimeRegistryForTests,
} from '../index.js';
import type {
	PlanTask,
	PlannedTask,
	TemplateRuntime,
} from '../types.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { PlanTreeNode } from '../../planner/recursive.js';
import { collectPlanSources } from '../plan-sources.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueRunId(label: string): string {
	const suffix = Math.floor(Math.random() * 1e9).toString(16);
	return `executor-test-${label}-${suffix}`;
}

const SAMPLE_INTENT: ClassifiedIntent = {
	target:    'code',
	scope:     'XS',
	focused:   false,
	scopeRef:  { kind: 'repo', value: '/r' },
	reasoning: 'executor test fixture',
};

function mkTask(over: Partial<PlannedTask> & { taskId: string }): PlannedTask {
	return {
		taskId:    over.taskId,
		template:  'demo.leaf',
		kind:      'leaf',
		params:    {},
		produces:  ['out'],
		rationale: 'demo task fixture for executor tests',
		...over,
	};
}

function mkPlan(tasks: PlannedTask[]): PlanTask {
	return {
		planId:    'p-test',
		goal:      'executor test',
		target:    'code',
		scope:     'XS',
		reasoning: 'fixture plan used to test the executor walker',
		tasks,
	};
}

function mkNode(plan: PlanTask, children = new Map<string, PlanTreeNode>()): PlanTreeNode {
	return { plan, children, childErrors: new Map() };
}

/** A stand-in runtime's record: it returns everything it has. */
const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });

function stubRuntime(templateId: string, outputs: Record<string, unknown>): TemplateRuntime {
	return {
		templateId,
		execute: async () => ({
			outputs: new Map(Object.entries(outputs)),
			completeness: WHOLE,
		}),
	};
}

function throwingRuntime(templateId: string, errMessage: string): TemplateRuntime {
	return {
		templateId,
		execute: async () => { throw new Error(errMessage); },
	};
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('unmetDependencies: no consumes -> null', () => {
	const task = mkTask({ taskId: 't01', consumes: undefined });
	assert.equal(_unmetDependenciesForTest(task, new Map(), new Set()), null);
});

test('unmetDependencies: every consume present -> null', () => {
	const task = mkTask({ taskId: 't02', consumes: ['x', 'y'] });
	const outputs = new Map<string, unknown>([['x', 1], ['y', 2]]);
	assert.equal(_unmetDependenciesForTest(task, outputs, new Set()), null);
});

test('unmetDependencies: first missing name reported', () => {
	const task = mkTask({ taskId: 't02', consumes: ['x', 'y', 'z'] });
	const outputs = new Map<string, unknown>([['x', 1]]);
	// First missing is 'y'.
	assert.equal(_unmetDependenciesForTest(task, outputs, new Set()), 'y');
});

test('projectUpstream: limits to consumed names only', () => {
	const task = mkTask({ taskId: 't02', consumes: ['x'] });
	const outputs = new Map<string, unknown>([['x', 1], ['y', 2], ['z', 3]]);
	const proj = _projectUpstreamForTest(task, outputs);
	assert.deepEqual(Array.from(proj.entries()), [['x', 1]]);
});

test('checkOutputShape: exact match -> null', () => {
	const task = mkTask({ taskId: 't01', produces: ['a', 'b'] });
	const result = { outputs: new Map<string, unknown>([['a', 1], ['b', 2]]) };
	assert.equal(_checkOutputShapeForTest(task, result), null);
});

test('checkOutputShape: missing name reported', () => {
	const task = mkTask({ taskId: 't01', produces: ['a', 'b'] });
	const result = { outputs: new Map<string, unknown>([['a', 1]]) };
	const err = _checkOutputShapeForTest(task, result);
	assert.notEqual(err, null);
	assert.deepEqual([...err!.missing], ['b']);
});

test('checkOutputShape: extra name reported', () => {
	const task = mkTask({ taskId: 't01', produces: ['a'] });
	const result = { outputs: new Map<string, unknown>([['a', 1], ['z', 9]]) };
	const err = _checkOutputShapeForTest(task, result);
	assert.notEqual(err, null);
	assert.deepEqual([...err!.extra], ['z']);
});

// ---------------------------------------------------------------------------
// End-to-end: 2-task happy path (discovery -> aggregator)
// ---------------------------------------------------------------------------

test('runExecutor: 2-task happy path -- discovery + aggregator', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(stubRuntime('demo.discovery', { items: ['a', 'b', 'c'] }));
	registerTemplateRuntime(stubRuntime('demo.aggregator', { report: { summary: 'final' } }));

	const runId = uniqueRunId('happy');
	const plan = mkPlan([
		mkTask({ taskId: 't01', template: 'demo.discovery',  produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'demo.aggregator', produces: ['report'], consumes: ['items'] }),
	]);

	try {
		const result = await runExecutor({
			tree: mkNode(plan),
			intent: SAMPLE_INTENT,
			runId,
		});

		assert.equal(result.root.tasksCompleted, 2);
		assert.equal(result.root.tasksFailed.length, 0);
		assert.deepEqual(result.root.finalReport, { summary: 'final' });

		// Per-task persistence: both files exist.
		assert.ok(existsSync(taskOutputPathFor(runId, 't01')));
		assert.ok(existsSync(taskOutputPathFor(runId, 't02')));

		const t01 = readTaskOutput(runId, 't01');
		assert.equal(t01?.status, 'ok');
		assert.deepEqual(t01?.outputs, { items: ['a', 'b', 'c'] });

		const t02 = readTaskOutput(runId, 't02');
		assert.equal(t02?.status, 'ok');
		assert.deepEqual(t02?.outputs, { report: { summary: 'final' } });
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

// ---------------------------------------------------------------------------
// Runtime missing
// ---------------------------------------------------------------------------

test('runExecutor: missing runtime -> task fails; downstream cascades', async () => {
	_resetRuntimeRegistryForTests();
	// 'demo.missing' is intentionally NOT registered.
	registerTemplateRuntime(stubRuntime('demo.aggregator', { report: 'r' }));

	const runId = uniqueRunId('missing');
	const plan = mkPlan([
		mkTask({ taskId: 't01', template: 'demo.missing',    produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'demo.aggregator', produces: ['report'], consumes: ['items'] }),
	]);

	try {
		const result = await runExecutor({
			tree: mkNode(plan),
			intent: SAMPLE_INTENT,
			runId,
		});

		assert.equal(result.root.tasksCompleted, 0);
		assert.equal(result.root.tasksFailed.length, 2);

		const t01 = result.root.perTask.get('t01');
		assert.equal(t01?.status, 'failed');
		assert.match(t01?.error ?? '', /No runtime registered/);

		const t02 = result.root.perTask.get('t02');
		assert.equal(t02?.status, 'skipped-dependency-unavailable');
		assert.match(t02?.error ?? '', /dependency-unavailable: items/);

		assert.equal(result.root.finalReport, undefined);
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

// ---------------------------------------------------------------------------
// Runtime throws
// ---------------------------------------------------------------------------

test('runExecutor: runtime throws -> failed status with reason; cascade', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(throwingRuntime('demo.broken', 'BOOM'));
	registerTemplateRuntime(stubRuntime('demo.aggregator', { report: 'r' }));

	const runId = uniqueRunId('throws');
	const plan = mkPlan([
		mkTask({ taskId: 't01', template: 'demo.broken',     produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'demo.aggregator', produces: ['report'], consumes: ['items'] }),
	]);

	try {
		const result = await runExecutor({
			tree: mkNode(plan),
			intent: SAMPLE_INTENT,
			runId,
		});

		const t01 = result.root.perTask.get('t01');
		assert.equal(t01?.status, 'failed');
		assert.match(t01?.error ?? '', /runtime-threw: BOOM/);
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

// ---------------------------------------------------------------------------
// Output shape mismatch
// ---------------------------------------------------------------------------

test('runExecutor: runtime returns extra/missing produces -> output-shape-mismatch', async () => {
	_resetRuntimeRegistryForTests();
	// Runtime returns { surprise: 1 } when task.produces = ['items'].
	registerTemplateRuntime(stubRuntime('demo.misshapen', { surprise: 1 }));
	registerTemplateRuntime(stubRuntime('demo.aggregator', { report: 'r' }));

	const runId = uniqueRunId('shape');
	const plan = mkPlan([
		mkTask({ taskId: 't01', template: 'demo.misshapen',  produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'demo.aggregator', produces: ['report'] }),
	]);

	try {
		const result = await runExecutor({
			tree: mkNode(plan),
			intent: SAMPLE_INTENT,
			runId,
		});

		const t01 = result.root.perTask.get('t01');
		assert.equal(t01?.status, 'failed');
		assert.match(t01?.error ?? '', /output-shape-mismatch/);
		assert.match(t01?.error ?? '', /Missing: items/);
		assert.match(t01?.error ?? '', /Extra: surprise/);
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

// ---------------------------------------------------------------------------
// Planner-template task -- child plan's aggregator output flows up
// ---------------------------------------------------------------------------

test('runExecutor: planner-template task materialises child report as parent.report', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(stubRuntime('demo.discovery',     { items: ['x'] }));
	registerTemplateRuntime(stubRuntime('demo.aggregator',    { report: { from: 'root-agg' } }));
	registerTemplateRuntime(stubRuntime('child.discovery',    { items: ['cx'] }));
	registerTemplateRuntime(stubRuntime('child.aggregator',   { report: { from: 'child-agg' } }));

	const runId = uniqueRunId('planner');

	const childPlan = mkPlan([
		mkTask({ taskId: 't01', template: 'child.discovery',  produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'child.aggregator', produces: ['report'], consumes: ['items'] }),
	]);

	const rootPlan = mkPlan([
		mkTask({ taskId: 't01', template: 'demo.discovery', produces: ['items'] }),
		mkTask({
			taskId:    't02',
			template:  'code.subrun.deep-dive',  // any planner-kind template id; runtime not invoked
			kind:      'planner',
			params:    {},
			produces:  ['report'],
			rationale: 'recursive child plan via the executor',
		}),
		mkTask({ taskId: 't03', template: 'demo.aggregator', produces: ['report'], consumes: ['items', 'report'] }),
	]);

	const rootNode: PlanTreeNode = {
		plan:        rootPlan,
		children:    new Map([['t02', mkNode(childPlan)]]),
		childErrors: new Map(),
	};

	try {
		const result = await runExecutor({
			tree: rootNode,
			intent: SAMPLE_INTENT,
			runId,
		});

		// Root plan: 3 tasks completed.
		assert.equal(result.root.tasksCompleted, 3);
		assert.equal(result.root.tasksFailed.length, 0);

		// Planner task's output is the child plan's aggregator output.
		const t02 = result.root.perTask.get('t02');
		assert.equal(t02?.status, 'ok');
		assert.deepEqual(t02?.outputs, { report: { from: 'child-agg' } });

		// Child plan was also executed end-to-end.
		const childResult = result.children.get('t02');
		assert.ok(childResult);
		assert.equal(childResult!.root.tasksCompleted, 2);
		assert.deepEqual(childResult!.root.finalReport, { from: 'child-agg' });

		// Root's final aggregator (t03) ran with both `items` (from t01)
		// and `report` (from t02 = child report) injected.
		const t03 = result.root.perTask.get('t03');
		assert.equal(t03?.status, 'ok');
		assert.deepEqual(t03?.outputs, { report: { from: 'root-agg' } });
		// Root's finalReport = root aggregator's report.
		assert.deepEqual(result.root.finalReport, { from: 'root-agg' });
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

// ---------------------------------------------------------------------------
// Planner-template task with no child in tree (child plan build failed)
// ---------------------------------------------------------------------------

test('runExecutor: planner task whose child build failed -> child-plan-unavailable + cascade', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(stubRuntime('demo.discovery',  { items: ['x'] }));
	registerTemplateRuntime(stubRuntime('demo.aggregator', { report: 'r' }));

	const runId = uniqueRunId('child-fail');
	const rootPlan = mkPlan([
		mkTask({ taskId: 't01', template: 'demo.discovery', produces: ['items'] }),
		mkTask({
			taskId:    't02',
			template:  'code.subrun.deep-dive',
			kind:      'planner',
			params:    {},
			produces:  ['report'],
			rationale: 'planner task whose child plan failed to build',
		}),
		mkTask({ taskId: 't03', template: 'demo.aggregator', produces: ['report'], consumes: ['report'] }),
	]);
	// Tree has the planner task but NO child plan -- childError set
	// instead (simulating runRecursivePlanner's failed-subtree path).
	const rootNode: PlanTreeNode = {
		plan:        rootPlan,
		children:    new Map(),
		childErrors: new Map([['t02', new Error('synthetic child-build failure for the test')]]),
	};

	try {
		const result = await runExecutor({
			tree: rootNode,
			intent: SAMPLE_INTENT,
			runId,
		});

		const t02 = result.root.perTask.get('t02');
		assert.equal(t02?.status, 'failed');
		assert.match(t02?.error ?? '', /child-plan-unavailable/);
		assert.match(t02?.error ?? '', /synthetic child-build failure/);

		// t03 cascades.
		const t03 = result.root.perTask.get('t03');
		assert.equal(t03?.status, 'skipped-dependency-unavailable');
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

// ---------------------------------------------------------------------------
// Persistence path layout
// ---------------------------------------------------------------------------

test('taskOutputPathFor: lands under ~/.insrc/analyze/<runId>/tasks/<taskId>.json', () => {
	const path = taskOutputPathFor('rid-x', 't42');
	assert.match(path, /[/\\]analyze[/\\]rid-x[/\\]tasks[/\\]t42\.json$/);
});

test('readTaskOutput: miss returns null', () => {
	assert.equal(readTaskOutput('does-not-exist', 't01'), null);
});

test('purgeTaskOutput on a missing slot is a silent no-op', () => {
	assert.doesNotThrow(() => purgeTaskOutput('nope', 'also-nope'));
});

// ---------------------------------------------------------------------------
// S2: per-task event emission via RunExecutorArgs.onTaskEvent
// ---------------------------------------------------------------------------

import type { TaskExecutionEvent } from '../types.js';
import { buildCompleteness } from '../../completeness.js';

test('onTaskEvent: 2-task happy path emits started+completed per task in plan order', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(stubRuntime('demo.discovery', { items: ['a'] }));
	registerTemplateRuntime(stubRuntime('demo.aggregator', { report: { x: 1 } }));

	const runId = uniqueRunId('evt-happy');
	const plan = mkPlan([
		mkTask({ taskId: 't01', template: 'demo.discovery',  produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'demo.aggregator', produces: ['report'], consumes: ['items'] }),
	]);

	const events: TaskExecutionEvent[] = [];
	try {
		await runExecutor({
			tree: mkNode(plan),
			intent: SAMPLE_INTENT,
			runId,
			onTaskEvent: (e) => events.push(e),
		});

		assert.equal(events.length, 4, `expected 4 events (2 started + 2 completed); got ${events.length}`);
		const e0 = events[0]!;
		const e1 = events[1]!;
		const e2 = events[2]!;
		const e3 = events[3]!;
		assert.equal(e0.type, 'task-started');    assert.equal(e0.taskId, 't01');
		assert.equal(e1.type, 'task-completed');  assert.equal(e1.taskId, 't01');
		assert.equal(e2.type, 'task-started');    assert.equal(e2.taskId, 't02');
		assert.equal(e3.type, 'task-completed');  assert.equal(e3.taskId, 't02');
		if (e0.type === 'task-started') {
			assert.equal(e0.index, 1);
			assert.equal(e0.total, 2);
			assert.equal(e0.parentTaskPath, undefined);
		}
		if (e1.type === 'task-completed') {
			assert.equal(e1.status, 'ok');
			assert.equal(e1.parentTaskPath, undefined);
		}
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

test('onTaskEvent: failed task emits started + completed with status="failed"', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(throwingRuntime('demo.broken', 'BOOM'));
	registerTemplateRuntime(stubRuntime('demo.aggregator', { report: 'r' }));

	const runId = uniqueRunId('evt-fail');
	const plan = mkPlan([
		mkTask({ taskId: 't01', template: 'demo.broken',     produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'demo.aggregator', produces: ['report'], consumes: ['items'] }),
	]);
	const events: TaskExecutionEvent[] = [];
	try {
		await runExecutor({
			tree: mkNode(plan),
			intent: SAMPLE_INTENT,
			runId,
			onTaskEvent: (e) => events.push(e),
		});

		// t01: started + completed (failed). t02: started + completed (skipped).
		assert.equal(events.length, 4);
		const t01Completed = events[1]! as { type: string; status: string };
		assert.equal(t01Completed.type, 'task-completed');
		assert.equal(t01Completed.status, 'failed');
		const t02Completed = events[3]! as { type: string; status: string };
		assert.equal(t02Completed.type, 'task-completed');
		assert.equal(t02Completed.status, 'skipped-dependency-unavailable');
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

test('onTaskEvent: planner-template task -- child plan events fire BETWEEN parent started + completed, with parentTaskPath set', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(stubRuntime('root.discovery',  { items: ['x'] }));
	registerTemplateRuntime(stubRuntime('root.aggregator', { report: { r: 'root' } }));
	registerTemplateRuntime(stubRuntime('child.discovery',  { items: ['c'] }));
	registerTemplateRuntime(stubRuntime('child.aggregator', { report: { r: 'child' } }));

	const runId = uniqueRunId('evt-planner');
	const childPlan = mkPlan([
		mkTask({ taskId: 'c01', template: 'child.discovery',  produces: ['items'] }),
		mkTask({ taskId: 'c02', template: 'child.aggregator', produces: ['report'], consumes: ['items'] }),
	]);
	const rootPlan = mkPlan([
		mkTask({ taskId: 't01', template: 'root.discovery', produces: ['items'] }),
		mkTask({
			taskId:    't02',
			template:  'code.subrun.deep-dive',
			kind:      'planner',
			params:    {},
			produces:  ['report'],
			rationale: 'planner-template test',
		}),
		mkTask({ taskId: 't03', template: 'root.aggregator', produces: ['report'], consumes: ['items', 'report'] }),
	]);
	const rootNode = {
		plan:        rootPlan,
		children:    new Map([['t02', mkNode(childPlan)]]),
		childErrors: new Map(),
	};

	const events: TaskExecutionEvent[] = [];
	try {
		await runExecutor({
			tree: rootNode,
			intent: SAMPLE_INTENT,
			runId,
			onTaskEvent: (e) => events.push(e),
		});

		// Sequence: t01 started/completed, t02 started, c01 started/completed,
		// c02 started/completed, t02 completed, t03 started/completed.
		// 10 events total.
		assert.equal(events.length, 10, `expected 10 events; got ${events.length}: ` +
			events.map(e => `${e.type}:${e.taskId}`).join(','));

		const typesAndIds = events.map(e => `${e.type}:${e.taskId}`);
		assert.deepEqual(typesAndIds, [
			'task-started:t01',  'task-completed:t01',
			'task-started:t02',
				'task-started:c01',  'task-completed:c01',
				'task-started:c02',  'task-completed:c02',
			'task-completed:t02',
			'task-started:t03',  'task-completed:t03',
		]);

		// Child events MUST carry parentTaskPath='t02'.
		const c01Started = events[3]! as Extract<TaskExecutionEvent, { type: 'task-started' }>;
		assert.equal(c01Started.parentTaskPath, 't02');
		assert.equal(c01Started.index, 1);
		assert.equal(c01Started.total, 2);

		const c02Completed = events[6]! as Extract<TaskExecutionEvent, { type: 'task-completed' }>;
		assert.equal(c02Completed.parentTaskPath, 't02');

		// Root events MUST NOT carry parentTaskPath.
		const t02Started = events[2]! as Extract<TaskExecutionEvent, { type: 'task-started' }>;
		assert.equal(t02Started.parentTaskPath, undefined);
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

test('onTaskEvent: throwing subscriber does not crash the executor', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(stubRuntime('demo.discovery',  { items: ['a'] }));
	registerTemplateRuntime(stubRuntime('demo.aggregator', { report: 'r' }));

	const runId = uniqueRunId('evt-throw');
	const plan = mkPlan([
		mkTask({ taskId: 't01', template: 'demo.discovery',  produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'demo.aggregator', produces: ['report'], consumes: ['items'] }),
	]);

	try {
		const result = await runExecutor({
			tree: mkNode(plan),
			intent: SAMPLE_INTENT,
			runId,
			onTaskEvent: () => { throw new Error('subscriber broke'); },
		});
		// Run must still complete successfully.
		assert.equal(result.root.tasksCompleted, 2);
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

test('SINGLE-PASS: child plan tasks execute exactly once (regression for the executePlanNode double-walk)', async () => {
	let discoveryCallCount = 0;
	let aggregatorCallCount = 0;
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime({
		templateId: 'child.discovery',
		execute: async () => {
			discoveryCallCount++;
			return { outputs: new Map([['items', ['x']]]), completeness: WHOLE };
		},
	});
	registerTemplateRuntime({
		templateId: 'child.aggregator',
		execute: async () => {
			aggregatorCallCount++;
			return { outputs: new Map([['report', { r: 'child' }]]), completeness: WHOLE };
		},
	});
	registerTemplateRuntime(stubRuntime('root.aggregator', { report: 'root' }));

	const runId = uniqueRunId('single-pass');
	const childPlan = mkPlan([
		mkTask({ taskId: 'c01', template: 'child.discovery',  produces: ['items'] }),
		mkTask({ taskId: 'c02', template: 'child.aggregator', produces: ['report'], consumes: ['items'] }),
	]);
	const rootPlan = mkPlan([
		mkTask({
			taskId:    't02',
			template:  'code.subrun.deep-dive',
			kind:      'planner',
			params:    {},
			produces:  ['report'],
			rationale: 'planner-template test',
		}),
		mkTask({ taskId: 't03', template: 'root.aggregator', produces: ['report'], consumes: ['report'] }),
	]);
	const rootNode = {
		plan:        rootPlan,
		children:    new Map([['t02', mkNode(childPlan)]]),
		childErrors: new Map(),
	};

	try {
		const result = await runExecutor({
			tree: rootNode,
			intent: SAMPLE_INTENT,
			runId,
		});
		// Before S2's refactor, executePlanNode would walk node.children
		// AFTER executePlannerTask had already walked them once, leading
		// to TWO calls into each child task's runtime. Pin the fix:
		assert.equal(discoveryCallCount, 1,
			`child.discovery runtime called ${discoveryCallCount} times; expected 1`);
		assert.equal(aggregatorCallCount, 1,
			`child.aggregator runtime called ${aggregatorCallCount} times; expected 1`);

		// Child result still surfaces in result.children for callers that
		// want it.
		const childResult = result.children.get('t02');
		assert.ok(childResult);
		assert.equal(childResult!.root.tasksCompleted, 2);
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

// ---------------------------------------------------------------------------
// Completeness: the walk copies the runtime's record; a result without one fails
// ---------------------------------------------------------------------------

test('the plan walk copies the record to the task record, and a runtime that returns none is recorded as failed', async () => {
	_resetRuntimeRegistryForTests();
	const record = buildCompleteness({
		returned: 3, basis: 'filesystem',
		limited: [{ what: 'files walked', limit: 5000, scope: 'source', reason: 'the walk stopped' }],
	});
	registerTemplateRuntime({
		templateId: 'x.with-record',
		execute: async () => ({ outputs: new Map<string, unknown>([['items', [1, 2, 3]]]), completeness: record }),
	});
	// A runtime as one was written before the change. It no longer compiles as a
	// TemplateRuntime, but a stand-in or a plug-in can still behave this way.
	registerTemplateRuntime({
		templateId: 'x.without-record',
		execute: async () => ({ outputs: new Map<string, unknown>([['other', [1]]]) }),
	} as unknown as TemplateRuntime);
	registerTemplateRuntime(stubRuntime('x.aggregate', { report: 'r' }));

	const runId = uniqueRunId('completeness');
	const plan = mkPlan([
		mkTask({ taskId: 't01', template: 'x.with-record',    produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'x.without-record', produces: ['other'] }),
		mkTask({ taskId: 't03', template: 'x.aggregate',      produces: ['report'], consumes: ['items'] }),
	]);
	try {
		const result = await runExecutor({ tree: mkNode(plan), intent: SAMPLE_INTENT, runId });
		const t01 = result.root.perTask.get('t01')!;
		const t02 = result.root.perTask.get('t02')!;

		assert.equal(t01.status, 'ok');
		assert.deepEqual(t01.completeness, record, "the runtime's record is on the task record");
		// ...and in the record written for the run, which is what a later reader has.
		assert.deepEqual(readTaskOutput(runId, 't01')?.completeness, record);

		assert.equal(t02.status, 'failed', 'a result that does not state its completeness is not counted as complete');
		assert.match(t02.error ?? '', /^no-completeness-record: /);
		assert.equal(t02.completeness, undefined);
		assert.equal(t02.outputs, undefined, 'its outputs are not passed on');
		assert.deepEqual(result.root.tasksFailed.map(f => f.taskId), ['t02']);

		assert.deepEqual(result.root.perTask.get('t03')!.completeness, WHOLE);
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

// ---------------------------------------------------------------------------
// Story s7, task t3: a refused scope is a coded failure on the task record
// ---------------------------------------------------------------------------

test("a runtime that throws each typed scope error is a failed task with that code and no 'runtime-threw:' prefix; any other error has no code (mutation: drop the class check)", async () => {
	const { ScopeKindTargetMismatchError, ScopeNotIndexedError, ScopeRefUnresolvedError } = await import('../../context/invariants.js');
	const { readTaskOutput } = await import('../cache.js');
	const thrown: ReadonlyArray<readonly [string, Error, string | undefined]> = [
		['t01', new ScopeNotIndexedError('/r/app/src', undefined, 'no registered repo contains the scope path'), 'scope-not-indexed'],
		['t02', new ScopeRefUnresolvedError("kind='symbol': no stored entity named 'x' in '/r/app/a.ts'."), 'scope-ref-unresolved'],
		['t03', new ScopeKindTargetMismatchError('symbol', 'docs', ['repo', 'module', 'file', 'workspace']), 'scope-ref-kind-target-mismatch'],
		['t04', new Error('BOOM'), undefined],
		// A class that only LOOKS like one of them by name is not one.
		['t05', Object.assign(new Error('not really'), { name: 'ScopeNotIndexedError' }), undefined],
	];
	_resetRuntimeRegistryForTests();
	for (const [taskId, err] of thrown) {
		registerTemplateRuntime({ templateId: `demo.${taskId}`, execute: async () => { throw err; } });
	}
	registerTemplateRuntime(stubRuntime('demo.aggregator', { report: 'r' }));

	const runId = uniqueRunId('scope-codes');
	const plan = mkPlan([
		...thrown.map(([taskId]) => mkTask({ taskId, template: `demo.${taskId}`, produces: [`out-${taskId}`] })),
		mkTask({ taskId: 't06', template: 'demo.aggregator', produces: ['report'], consumes: thrown.map(([taskId]) => `out-${taskId}`) }),
	]);
	try {
		const result = await runExecutor({ tree: mkNode(plan), intent: SAMPLE_INTENT, runId });
		for (const [taskId, err, code] of thrown) {
			const rec = result.root.perTask.get(taskId)!;
			assert.equal(rec.status, 'failed', taskId);
			if (code !== undefined) {
				// The scope error's code, and its own message with nothing in front.
				assert.equal(rec.code, code, taskId);
				assert.equal(rec.error, err.message, taskId);
				assert.ok(!rec.error!.includes('runtime-threw'), taskId);
			} else {
				assert.ok(!('code' in rec), `${taskId}: no code key`);
				assert.equal(rec.error, `runtime-threw: ${err.message}`, taskId);
			}
			// The record on disk says the same.
			const stored = readTaskOutput(runId, taskId) as { code?: string; error?: string } | null;
			assert.deepEqual([stored?.code, stored?.error], [rec.code, rec.error], `${taskId} on disk`);
		}
		// The plan's list of failed tasks carries the code, entry by entry.
		assert.deepEqual(result.root.tasksFailed.slice(0, 5), [
			{ taskId: 't01', reason: thrown[0]![1].message, code: 'scope-not-indexed' },
			{ taskId: 't02', reason: thrown[1]![1].message, code: 'scope-ref-unresolved' },
			{ taskId: 't03', reason: thrown[2]![1].message, code: 'scope-ref-kind-target-mismatch' },
			{ taskId: 't04', reason: 'runtime-threw: BOOM' },
			{ taskId: 't05', reason: 'runtime-threw: not really' },
		]);
		// A task skipped for a missing input has no code.
		assert.ok(!('code' in result.root.tasksFailed[5]!));
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

test('the plan walk imports nothing from the run driver', async () => {
	const { readFileSync } = await import('node:fs');
	const { fileURLToPath } = await import('node:url');
	const src = readFileSync(fileURLToPath(new URL('../walker.ts', import.meta.url)), 'utf8');
	const imports = [...src.matchAll(/^import[^;]*?from\s+'([^']+)';/gms)].map(m => m[1]!);
	assert.ok(imports.includes('../context/invariants.js'), 'the shared mapping comes from beside the error classes');
	assert.deepEqual(imports.filter(i => i.includes('orchestrator')), []);
});

// ---------------------------------------------------------------------------
// A plan tree's records and a failed child's cause
// ---------------------------------------------------------------------------

function plannerTask(taskId: string): PlannedTask {
	return mkTask({
		taskId,
		template:  'code.subrun.deep-dive',
		kind:      'planner',
		produces:  ['report'],
		rationale: 'planner task fixture whose child plan the walk executes',
	});
}

test('every task of every plan in a tree keeps its own record', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(stubRuntime('root.discovery',  { items: ['root'] }));
	registerTemplateRuntime(stubRuntime('root.aggregator', { report: { from: 'root-agg' } }));
	registerTemplateRuntime(stubRuntime('a.discovery',     { items: ['a'] }));
	registerTemplateRuntime(stubRuntime('a.aggregator',    { report: { from: 'a-agg' } }));
	registerTemplateRuntime(stubRuntime('b.discovery',     { items: ['b'] }));
	registerTemplateRuntime(stubRuntime('b.aggregator',    { report: { from: 'b-agg' } }));

	// The root and both children each have a t01 and a t02.
	const child = (family: string): PlanTreeNode => mkNode(mkPlan([
		mkTask({ taskId: 't01', template: `${family}.discovery`,  produces: ['items'] }),
		mkTask({ taskId: 't02', template: `${family}.aggregator`, produces: ['report'], consumes: ['items'] }),
	]));
	const rootNode = mkNode(mkPlan([
		mkTask({ taskId: 't01', template: 'root.discovery', produces: ['items'] }),
		plannerTask('t02'),
		plannerTask('t03'),
		mkTask({ taskId: 't04', template: 'root.aggregator', produces: ['report'], consumes: ['items', 'report'] }),
	]), new Map([['t02', child('a')], ['t03', child('b')]]));

	const runId = uniqueRunId('tree-records');
	try {
		const result = await runExecutor({ tree: rootNode, intent: SAMPLE_INTENT, runId });
		assert.equal(result.root.tasksFailed.length, 0);

		// The root's records are where they were, and are the root's own.
		assert.deepEqual(readTaskOutput(runId, 't01')?.outputs, { items: ['root'] });
		assert.equal(readTaskOutput(runId, 't02')?.kind, 'planner');
		assert.deepEqual(readTaskOutput(runId, 't02')?.outputs, { report: { from: 'a-agg' } });
		assert.deepEqual(readTaskOutput(runId, 't03')?.outputs, { report: { from: 'b-agg' } });

		// Each child's records are apart from the root's and from its sibling's.
		assert.deepEqual(readTaskOutput(runId, 't01', 't02')?.outputs, { items: ['a'] });
		assert.deepEqual(readTaskOutput(runId, 't02', 't02')?.outputs, { report: { from: 'a-agg' } });
		assert.deepEqual(readTaskOutput(runId, 't01', 't03')?.outputs, { items: ['b'] });
		assert.deepEqual(readTaskOutput(runId, 't02', 't03')?.outputs, { report: { from: 'b-agg' } });

		const paths = [
			taskOutputPathFor(runId, 't01'), taskOutputPathFor(runId, 't02'),
			taskOutputPathFor(runId, 't01', 't02'), taskOutputPathFor(runId, 't02', 't02'),
			taskOutputPathFor(runId, 't01', 't03'), taskOutputPathFor(runId, 't02', 't03'),
		];
		assert.equal(new Set(paths).size, paths.length);
		assert.match(taskOutputPathFor(runId, 't01', 't02'), /tasks\/t02\/tasks\/t02\.t01\.json$/);
		assert.match(taskOutputPathFor('rid', 't01', 't02.t05'), /tasks\/t02\/tasks\/t02\.t05\/tasks\/t02\.t05\.t01\.json$/);

		// Removing the run's records removes the children's too.
		purgeAllTaskOutputs(runId);
		for (const path of paths) assert.equal(existsSync(path), false, path);
	} finally {
		purgeAllTaskOutputs(runId);
	}
});

test('a planner task whose child produced no report fails with the child\'s cause', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(stubRuntime('demo.discovery',      { items: ['x'] }));
	registerTemplateRuntime(stubRuntime('demo.aggregator',     { report: 'r' }));
	registerTemplateRuntime(throwingRuntime('child.aggregator', 'Prompt is too long'));
	registerTemplateRuntime(throwingRuntime('child.broken',     'BOOM'));

	const rootPlan = mkPlan([
		plannerTask('t01'),
		mkTask({ taskId: 't02', template: 'demo.aggregator', produces: ['report'], consumes: ['report'] }),
	]);

	// The child's aggregate task itself fails.
	const aggregateFails = mkNode(rootPlan, new Map([['t01', mkNode(mkPlan([
		mkTask({ taskId: 't01', template: 'demo.discovery',   produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'child.aggregator', produces: ['report'], consumes: ['items'] }),
	]))]]));
	const runId = uniqueRunId('child-cause');
	try {
		const result = await runExecutor({ tree: aggregateFails, intent: SAMPLE_INTENT, runId });
		const expected = 'child-plan-unavailable: child aggregator produced no report: '
			+ 'its aggregate task t01.t02 (child.aggregator) failed: runtime-threw: Prompt is too long';
		assert.equal(result.root.perTask.get('t01')?.error, expected);
		assert.deepEqual(result.root.tasksFailed[0], { taskId: 't01', reason: expected });
		assert.equal(readTaskOutput(runId, 't01')?.error, expected);
		assert.equal(collectPlanSources(aggregateFails, result)[0]?.failure, expected);
	} finally {
		purgeAllTaskOutputs(runId);
	}

	// The child's aggregate task is skipped because the task before it failed.
	const producerFails = mkNode(rootPlan, new Map([['t01', mkNode(mkPlan([
		mkTask({ taskId: 't01', template: 'child.broken',     produces: ['items'] }),
		mkTask({ taskId: 't02', template: 'child.aggregator', produces: ['report'], consumes: ['items'] }),
	]))]]));
	const runId2 = uniqueRunId('child-cause-skipped');
	try {
		const result = await runExecutor({ tree: producerFails, intent: SAMPLE_INTENT, runId: runId2 });
		assert.equal(
			result.root.perTask.get('t01')?.error,
			'child-plan-unavailable: child aggregator produced no report: '
			+ 'its aggregate task t01.t02 (child.aggregator) was skipped: dependency-unavailable: items; '
			+ 'other tasks of the child plan that did not complete: t01.t01: runtime-threw: BOOM',
		);
	} finally {
		purgeAllTaskOutputs(runId2);
	}
});
