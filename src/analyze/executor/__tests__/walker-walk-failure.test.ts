/**
 * A failure outside a task's runtime fails that task, not the walk
 * (Story s7, task t11).
 *
 * Writing a task's record is the walk's own work. When it fails, the task is
 * recorded as failed with the error's message and the walk goes on. An error
 * that is not tied to a task still propagates out of the walk.
 *
 * The real plan walk and the real record writer: the write is made to fail by
 * a directory standing where the record's file goes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, statSync } from 'node:fs';

import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { buildCompleteness } from '../../completeness.js';
import type { PlanTreeNode } from '../../planner/recursive.js';
import { aggregateReportCompleteness } from '../../runtimes/shared/aggregator.js';
import {
	collectPlanSources,
	purgeAllTaskOutputs,
	readTaskOutput,
	registerTemplateRuntime,
	runExecutor,
	taskOutputPathFor,
	_resetRuntimeRegistryForTests,
} from '../index.js';
import type { AbsentInput, PlanTask, PlannedTask, TaskExecutionEvent, TemplateExecuteArgs } from '../types.js';

const INTENT: ClassifiedIntent = {
	target: 'code', scope: 'XS', focused: false, scopeRef: { kind: 'repo', value: '/r' }, reasoning: 'walk failure fixture',
};
const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });
const REPORT = { summary: 'written from what exists', findings: [] };
const uniqueRunId = (label: string): string => `walker-walk-failure-${label}-${Math.floor(Math.random() * 1e9).toString(16)}`;

function task(over: Partial<PlannedTask> & { taskId: string }): PlannedTask {
	return { template: 'demo.ok', kind: 'leaf', params: {}, produces: ['out'], rationale: 'fixture task for the walk failure tests', ...over };
}
function plan(tasks: PlannedTask[]): PlanTask {
	return { planId: 'p', goal: 'g', target: 'code', scope: 'XS', reasoning: 'fixture plan for the walk failure tests', tasks };
}
function node(p: PlanTask, children = new Map<string, PlanTreeNode>()): PlanTreeNode {
	return { plan: p, children, childErrors: new Map() };
}

let ran: string[] = [];
let absentSeen: readonly AbsentInput[] | undefined;
let upstreamSeen: Record<string, unknown> = {};

function register(): void {
	_resetRuntimeRegistryForTests();
	ran = [];
	absentSeen = undefined;
	upstreamSeen = {};
	registerTemplateRuntime({
		templateId: 'demo.ok',
		execute: async (args: TemplateExecuteArgs) => {
			ran.push(args.task.taskId);
			return { outputs: new Map(args.task.produces.map(n => [n, `${n} from ${args.task.taskId}`])), completeness: WHOLE };
		},
	});
	registerTemplateRuntime({
		templateId: 'demo.broken',
		execute: async (args: TemplateExecuteArgs) => { ran.push(args.task.taskId); throw new Error('the graph store is closed'); },
	});
	registerTemplateRuntime({
		templateId: 'demo.aggregate',
		execute: async (args: TemplateExecuteArgs) => {
			ran.push(args.task.taskId);
			absentSeen = args.absentInputs;
			upstreamSeen = Object.fromEntries(args.upstreamOutputs);
			return { outputs: new Map([['report', REPORT]]), completeness: aggregateReportCompleteness() };
		},
	});
}

/** Make the write of one task's record fail: a directory stands where its file goes. */
function blockRecord(runId: string, taskId: string): string {
	const path = taskOutputPathFor(runId, taskId);
	mkdirSync(path, { recursive: true });
	return path;
}

test('a writing failure while the walk handles one task fails that task and the walk goes on; an error not tied to a task propagates', async () => {
	// --- the record of a task that RAN cannot be written ---
	register();
	const runId = uniqueRunId('unwritable');
	const tree = node(plan([
		task({ taskId: 't01', produces: ['modules'] }),
		task({ taskId: 't02', produces: ['module-tree'] }),
		task({ taskId: 't03', produces: ['derived'], consumes: ['module-tree'] }),
		task({ taskId: 't04', produces: ['entrypoints'] }),
		task({ taskId: 't05', template: 'demo.aggregate', produces: ['report'], consumes: ['modules', 'module-tree', 'entrypoints'] }),
	]));
	try {
		const blocked = blockRecord(runId, 't02');
		const events: TaskExecutionEvent[] = [];
		const executed = await runExecutor({ tree, intent: INTENT, runId, onTaskEvent: e => { events.push(e); } });

		// The task ran, and is failed with the write's own message.
		assert.ok(ran.includes('t02'));
		const t02 = executed.root.perTask.get('t02')!;
		assert.equal(t02.status, 'failed');
		assert.match(t02.error ?? '', /^task-record-unwritable: .*(EISDIR|ENOTEMPTY|EPERM|EEXIST|directory)/i);
		assert.ok((t02.error ?? '').includes(blocked) || /rename|open/.test(t02.error ?? ''), `the message is the error's own: ${t02.error}`);
		assert.equal(t02.outputs, undefined, 'its outputs are not kept');
		// The plan's result holds the failure, although no record of it could be written.
		assert.deepEqual(executed.root.tasksFailed.map(f => f.taskId), ['t02', 't03']);
		assert.equal(executed.root.tasksFailed[0]!.reason, t02.error);
		assert.ok(statSync(blocked).isDirectory(), 'nothing was written where the record goes');
		assert.equal(readTaskOutput(runId, 't02'), null);
		// Its output is not handed on: the task that consumes it is skipped ...
		assert.deepEqual([executed.root.perTask.get('t03')?.status, executed.root.perTask.get('t03')?.error], ['skipped-dependency-unavailable', 'dependency-unavailable: module-tree']);
		// ... and the walk goes on: the tasks after it run, and their records are written.
		assert.deepEqual(ran, ['t01', 't02', 't04', 't05']);
		assert.equal(executed.root.perTask.get('t04')?.status, 'ok');
		assert.equal(readTaskOutput(runId, 't04')?.status, 'ok');
		assert.equal(readTaskOutput(runId, 't03')?.status, 'skipped-dependency-unavailable');
		// The aggregate task runs on what exists and is told of the failed task.
		assert.deepEqual(executed.root.finalReport, REPORT);
		assert.deepEqual(upstreamSeen, { modules: 'modules from t01', entrypoints: 'entrypoints from t04' });
		assert.deepEqual(absentSeen, [
			{ name: 'module-tree', producedBy: 't02', reason: t02.error },
			{ name: 'derived', producedBy: 't03', reason: 'dependency-unavailable: module-tree' },
		]);
		// Its progress is reported as a failure, and the answer report names it.
		assert.deepEqual(events.filter(e => e.type === 'task-completed').map(e => `${e.taskId}:${e.status}`),
			['t01:ok', 't02:failed', 't03:skipped-dependency-unavailable', 't04:ok', 't05:ok']);
		assert.deepEqual(collectPlanSources(tree, executed).filter(s => s.failure !== undefined).map(s => s.sourceId), ['t02', 't03']);
	} finally {
		purgeAllTaskOutputs(runId);
	}

	// --- the record of a task that FAILED, and of one that was SKIPPED, cannot be written:
	//     each keeps its own reason, and the walk goes on ---
	register();
	const runId2 = uniqueRunId('unwritable-failed');
	try {
		blockRecord(runId2, 't01');
		blockRecord(runId2, 't02');
		const executed = await runExecutor({
			tree: node(plan([
				task({ taskId: 't01', template: 'demo.broken', produces: ['modules'] }),
				task({ taskId: 't02', produces: ['module-tree'], consumes: ['modules'] }),
				task({ taskId: 't03', produces: ['entrypoints'] }),
				task({ taskId: 't04', template: 'demo.aggregate', produces: ['report'], consumes: ['entrypoints'] }),
			])), intent: INTENT, runId: runId2,
		});
		assert.deepEqual(executed.root.tasksFailed, [
			{ taskId: 't01', reason: 'runtime-threw: the graph store is closed' },
			{ taskId: 't02', reason: 'dependency-unavailable: modules' },
		]);
		assert.deepEqual(ran, ['t01', 't03', 't04']);
		assert.deepEqual(executed.root.finalReport, REPORT);
	} finally {
		purgeAllTaskOutputs(runId2);
	}

	// --- the record of the AGGREGATE task cannot be written: the plan has no final report ---
	register();
	const runId3 = uniqueRunId('unwritable-aggregate');
	try {
		blockRecord(runId3, 't02');
		const executed = await runExecutor({
			tree: node(plan([
				task({ taskId: 't01', produces: ['modules'] }),
				task({ taskId: 't02', template: 'demo.aggregate', produces: ['report'], consumes: ['modules'] }),
			])), intent: INTENT, runId: runId3,
		});
		assert.equal(executed.root.finalReport, undefined);
		assert.deepEqual(executed.root.tasksFailed.map(f => f.taskId), ['t02']);
		assert.match(executed.root.tasksFailed[0]!.reason, /^task-record-unwritable: /);
	} finally {
		purgeAllTaskOutputs(runId3);
	}

	// --- an error that is not tied to a task propagates out of the walk ---
	register();
	// The plan itself cannot be read: no task is being handled yet.
	const unreadable = { ...plan([]), get tasks(): PlannedTask[] { throw new Error('the plan could not be read'); } } as PlanTask;
	const runId4 = uniqueRunId('untied');
	await assert.rejects(runExecutor({ tree: node(unreadable), intent: INTENT, runId: runId4 }), /^Error: the plan could not be read$/);
	assert.deepEqual(ran, []);
	// The same inside a child plan: it is the child WALK that failed, not a task of it.
	const parent = node(plan([
		task({ taskId: 't01', produces: ['items'] }),
		task({ taskId: 't02', template: 'code.subrun.deep-dive', kind: 'planner', produces: ['deep'] }),
		task({ taskId: 't03', template: 'demo.aggregate', produces: ['report'], consumes: ['items', 'deep'] }),
	]), new Map([['t02', node(unreadable)]]));
	const runId5 = uniqueRunId('untied-child');
	try {
		await assert.rejects(runExecutor({ tree: parent, intent: INTENT, runId: runId5 }), /^Error: the plan could not be read$/);
		assert.deepEqual(ran, ['t01'], 'the walk stopped: the tasks after it did not run');
		assert.equal(existsSync(taskOutputPathFor(runId5, 't03')), false);
	} finally {
		purgeAllTaskOutputs(runId5);
	}
});
