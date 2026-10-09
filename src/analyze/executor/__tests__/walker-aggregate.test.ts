/**
 * The aggregate-report task runs on the inputs that exist (Story s7, task t10).
 *
 * The last task of a plan is skipped only when it consumes names and none of
 * them was produced. Otherwise it runs, and when a task before it failed or
 * was skipped it is told what is absent. Every other task with a missing
 * input is skipped as before.
 *
 * The real plan walk over stand-in runtimes; no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { buildCompleteness, type AnswerReport } from '../../completeness.js';
import { concludeRun } from '../../orchestrator/driver.js';
import type { PlanTreeNode } from '../../planner/recursive.js';
import { aggregateReportCompleteness } from '../../runtimes/shared/aggregator.js';
import {
	collectPlanSources,
	purgeAllTaskOutputs,
	registerTemplateRuntime,
	runExecutor,
	_resetRuntimeRegistryForTests,
} from '../index.js';
import type { AbsentInput, PlanTask, PlannedTask, TemplateExecuteArgs, TemplateRuntime } from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const INTENT: ClassifiedIntent = {
	target: 'code', scope: 'XS', focused: false, scopeRef: { kind: 'repo', value: '/r' }, reasoning: 'aggregate rule fixture',
};
const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });
const CONTEXT_WHOLE: AnswerReport = { completeness: { complete: true, incomplete: [], failed: [] } };
const REPORT = { summary: 'written from what exists', findings: [] };

const uniqueRunId = (label: string): string => `walker-aggregate-${label}-${Math.floor(Math.random() * 1e9).toString(16)}`;

function task(over: Partial<PlannedTask> & { taskId: string }): PlannedTask {
	return { template: 'demo.ok', kind: 'leaf', params: {}, produces: ['out'], rationale: 'fixture task for the aggregate rule tests', ...over };
}
function plan(tasks: PlannedTask[]): PlanTask {
	return { planId: 'p', goal: 'g', target: 'code', scope: 'XS', reasoning: 'fixture plan for the aggregate rule tests', tasks };
}
function node(p: PlanTask, children = new Map<string, PlanTreeNode>()): PlanTreeNode {
	return { plan: p, children, childErrors: new Map() };
}

/** What an aggregate stand-in was run with, per call. */
interface Seen { readonly taskId: string; readonly upstream: Record<string, unknown>; readonly absent: readonly AbsentInput[] | undefined; readonly hasAbsentKey: boolean }
let seen: Seen[] = [];
/** How many times each stand-in ran, by task id. */
let ran: string[] = [];

/** A producer that returns each name it is planned to produce, valued by the task's id. */
const producer: TemplateRuntime = {
	templateId: 'demo.ok',
	execute: async (args: TemplateExecuteArgs) => {
		ran.push(args.task.taskId);
		return { outputs: new Map(args.task.produces.map(n => [n, `${n} from ${args.task.taskId}`])), completeness: WHOLE };
	},
};
const broken: TemplateRuntime = {
	templateId: 'demo.broken',
	execute: async (args: TemplateExecuteArgs) => { ran.push(args.task.taskId); throw new Error('the graph store is closed'); },
};
function aggregate(templateId: string, report: unknown = REPORT): TemplateRuntime {
	return {
		templateId,
		execute: async (args: TemplateExecuteArgs) => {
			ran.push(args.task.taskId);
			seen.push({
				taskId: args.task.taskId, upstream: Object.fromEntries(args.upstreamOutputs), absent: args.absentInputs, hasAbsentKey: 'absentInputs' in args,
			});
			return { outputs: new Map([['report', report]]), completeness: aggregateReportCompleteness() };
		},
	};
}

function register(...extra: TemplateRuntime[]): void {
	_resetRuntimeRegistryForTests();
	for (const r of [producer, broken, aggregate('demo.aggregate'), ...extra]) registerTemplateRuntime(r);
	seen = [];
	ran = [];
}

async function walk(tree: PlanTreeNode, label: string) {
	const runId = uniqueRunId(label);
	try { return await runExecutor({ tree, intent: INTENT, runId }); }
	finally { purgeAllTaskOutputs(runId); }
}

test('a plan in which one of three producers failed has a final report written from the two that exist, with the third named as absent (mutation: skip the aggregate task as before)', async () => {
	register();
	const tree = node(plan([
		task({ taskId: 't01', produces: ['modules'] }),
		task({ taskId: 't02', template: 'demo.broken', produces: ['module-tree'] }),
		task({ taskId: 't03', produces: ['entrypoints'] }),
		task({ taskId: 't04', template: 'demo.aggregate', produces: ['report'], consumes: ['modules', 'module-tree', 'entrypoints'] }),
	]));
	const executed = await walk(tree, 'one-of-three');

	// The aggregate task ran, once, and the plan has a final report.
	assert.equal(executed.root.perTask.get('t04')?.status, 'ok');
	assert.deepEqual(executed.root.finalReport, REPORT);
	assert.deepEqual(ran, ['t01', 't02', 't03', 't04']);
	// It was given the two outputs that exist, and nothing for the third.
	assert.deepEqual(seen[0]!.upstream, { modules: 'modules from t01', entrypoints: 'entrypoints from t03' });
	// The third is named as absent, with the task that should have produced it and its recorded reason.
	assert.deepEqual(seen[0]!.absent, [
		{ name: 'module-tree', producedBy: 't02', reason: 'runtime-threw: the graph store is closed' },
	]);
	assert.equal(executed.root.perTask.get('t02')?.error, 'runtime-threw: the graph store is closed');
	// The plan still says which task failed; the aggregate task is not among them.
	assert.deepEqual(executed.root.tasksFailed, [{ taskId: 't02', reason: 'runtime-threw: the graph store is closed' }]);
	assert.equal(executed.root.tasksCompleted, 3);
	// And the answer report names the failed task: the report it is written beside is not complete.
	const { report } = concludeRun(tree, executed, CONTEXT_WHOLE);
	assert.equal(report.completeness.complete, false);
	assert.deepEqual(report.completeness.failed.map(f => f.sourceId), ['t02']);

	// A producer that was SKIPPED is absent too, with its own reason; and a
	// failed task's every name is listed, also one the aggregate task does not consume.
	register();
	const skipped = await walk(node(plan([
		task({ taskId: 't01', template: 'demo.broken', produces: ['modules', 'module-count'] }),
		task({ taskId: 't02', produces: ['module-tree'], consumes: ['modules'] }),
		task({ taskId: 't03', produces: ['entrypoints'] }),
		task({ taskId: 't04', template: 'demo.aggregate', produces: ['report'], consumes: ['module-tree', 'entrypoints'] }),
	])), 'skipped-producer');
	assert.deepEqual(skipped.root.finalReport, REPORT);
	assert.deepEqual(seen[0]!.upstream, { entrypoints: 'entrypoints from t03' });
	assert.deepEqual(seen[0]!.absent, [
		{ name: 'modules', producedBy: 't01', reason: 'runtime-threw: the graph store is closed' },
		{ name: 'module-count', producedBy: 't01', reason: 'runtime-threw: the graph store is closed' },
		{ name: 'module-tree', producedBy: 't02', reason: 'dependency-unavailable: modules' },
	]);

	// All inputs present: the aggregate task is run exactly as before, with no absentInputs at all.
	register();
	const whole = await walk(node(plan([
		task({ taskId: 't01', produces: ['modules'] }),
		task({ taskId: 't02', template: 'demo.aggregate', produces: ['report'], consumes: ['modules'] }),
	])), 'all-present');
	assert.deepEqual(whole.root.finalReport, REPORT);
	assert.deepEqual([seen[0]!.absent, seen[0]!.hasAbsentKey], [undefined, false]);

	// A name the aggregate task consumes that no task of the plan produces: absent, with no producer.
	register();
	await walk(node(plan([
		task({ taskId: 't01', produces: ['modules'] }),
		task({ taskId: 't02', template: 'demo.aggregate', produces: ['report'], consumes: ['modules', 'adherence-report'] }),
	])), 'no-producer');
	assert.deepEqual(seen[0]!.absent, [{ name: 'adherence-report', producedBy: null, reason: 'no task of the plan produces this name' }]);
});

test('a plan in which every producer failed has no final report; a task other than the aggregate task with a missing input is still skipped; an aggregate task that throws still fails the run', async () => {
	// --- every producer the aggregate task consumes failed: it is skipped ---
	register();
	const none = await walk(node(plan([
		task({ taskId: 't01', template: 'demo.broken', produces: ['modules'] }),
		task({ taskId: 't02', template: 'demo.broken', produces: ['entrypoints'] }),
		task({ taskId: 't03', produces: ['other'] }),
		task({ taskId: 't04', template: 'demo.aggregate', produces: ['report'], consumes: ['modules', 'entrypoints'] }),
	])), 'none-produced');
	assert.equal(none.root.finalReport, undefined);
	assert.ok(!('finalReport' in none.root));
	assert.deepEqual([none.root.perTask.get('t04')?.status, none.root.perTask.get('t04')?.error], ['skipped-dependency-unavailable', 'dependency-unavailable: modules']);
	assert.deepEqual(ran, ['t01', 't02', 't03'], 'the aggregate task did not run');
	assert.deepEqual(none.root.tasksFailed.map(f => f.taskId), ['t01', 't02', 't04']);

	// --- a task that is not the aggregate task, with ONE of its two inputs missing: still skipped ---
	register();
	const mid = await walk(node(plan([
		task({ taskId: 't01', produces: ['modules'] }),
		task({ taskId: 't02', template: 'demo.broken', produces: ['module-tree'] }),
		task({ taskId: 't03', produces: ['derived'], consumes: ['modules', 'module-tree'] }),
		task({ taskId: 't04', template: 'demo.aggregate', produces: ['report'], consumes: ['modules', 'derived'] }),
	])), 'mid-task');
	assert.deepEqual([mid.root.perTask.get('t03')?.status, mid.root.perTask.get('t03')?.error], ['skipped-dependency-unavailable', 'dependency-unavailable: module-tree']);
	assert.ok(!ran.includes('t03'), 'it has one of its inputs and is skipped all the same');
	// The aggregate task, with one of ITS two inputs, runs.
	assert.deepEqual(mid.root.finalReport, REPORT);
	assert.deepEqual(seen[0]!.upstream, { modules: 'modules from t01' });
	assert.deepEqual(seen[0]!.absent, [
		{ name: 'module-tree', producedBy: 't02', reason: 'runtime-threw: the graph store is closed' },
		{ name: 'derived', producedBy: 't03', reason: 'dependency-unavailable: module-tree' },
	]);
	// An aggregate-report TEMPLATE that is not the plan's last task gets no special rule.
	register();
	const notLast = await walk(node(plan([
		task({ taskId: 't01', template: 'demo.broken', produces: ['modules'] }),
		task({ taskId: 't02', produces: ['other'] }),
		task({ taskId: 't03', template: 'demo.aggregate', produces: ['report'], consumes: ['modules', 'other'] }),
		task({ taskId: 't04', produces: ['tail'] }),
	])), 'not-last');
	assert.equal(notLast.root.perTask.get('t03')?.status, 'skipped-dependency-unavailable');
	assert.ok(!ran.includes('t03'));

	// --- an aggregate task that runs and throws: no final report ---
	register({ templateId: 'demo.aggregate-throws', execute: async (args) => { ran.push(args.task.taskId); throw new Error('aggregator-llm-unavailable: connection refused'); } });
	const tree = node(plan([
		task({ taskId: 't01', produces: ['modules'] }),
		task({ taskId: 't02', template: 'demo.broken', produces: ['entrypoints'] }),
		task({ taskId: 't03', template: 'demo.aggregate-throws', produces: ['report'], consumes: ['modules', 'entrypoints'] }),
	]));
	const thrown = await walk(tree, 'aggregate-throws');
	assert.ok(ran.includes('t03'), 'it ran');
	assert.equal(thrown.root.finalReport, undefined);
	assert.deepEqual([thrown.root.perTask.get('t03')?.status, thrown.root.perTask.get('t03')?.error], ['failed', 'runtime-threw: aggregator-llm-unavailable: connection refused']);
	assert.deepEqual(thrown.root.tasksFailed.map(f => f.taskId), ['t02', 't03']);
	// The run driver fails a run whose root plan has no final report with this
	// code, as today: its rule is unchanged, and reads the field the walk left unset.
	const driver = readFileSync(join(HERE, '..', '..', 'orchestrator', 'driver.ts'), 'utf8');
	assert.match(driver, /if \(rootPlan\.finalReport === undefined\) \{\s*const failure: RunFailure = \{\s*code: 'executor-aggregator-failed',/);
});

test('a plan whose aggregate task consumes nothing runs with and without a failed task before it (mutation: skip an aggregate task that consumes nothing)', async () => {
	// --- no failed task: it runs, as today, and is given nothing as absent ---
	for (const consumes of [undefined, [] as string[]]) {
		register();
		const ok = await walk(node(plan([
			task({ taskId: 't01', produces: ['modules'] }),
			task({ taskId: 't02', template: 'demo.aggregate', produces: ['report'], ...(consumes !== undefined ? { consumes } : {}) }),
		])), 'consumes-nothing-ok');
		assert.deepEqual(ok.root.finalReport, REPORT);
		assert.deepEqual(seen, [{ taskId: 't02', upstream: {}, absent: undefined, hasAbsentKey: false }]);
	}

	// --- a failed task and a skipped task before it: it runs, and is given both as absent ---
	for (const consumes of [undefined, [] as string[]]) {
		register();
		const some = await walk(node(plan([
			task({ taskId: 't01', template: 'demo.broken', produces: ['modules'] }),
			task({ taskId: 't02', produces: ['module-tree'], consumes: ['modules'] }),
			task({ taskId: 't03', produces: ['entrypoints'] }),
			task({ taskId: 't04', template: 'demo.aggregate', produces: ['report'], ...(consumes !== undefined ? { consumes } : {}) }),
		])), 'consumes-nothing-failed');
		assert.equal(some.root.perTask.get('t04')?.status, 'ok');
		assert.deepEqual(some.root.finalReport, REPORT);
		assert.deepEqual(seen[0]!.upstream, {}, 'it consumes nothing, so it is handed nothing');
		assert.deepEqual(seen[0]!.absent, [
			{ name: 'modules', producedBy: 't01', reason: 'runtime-threw: the graph store is closed' },
			{ name: 'module-tree', producedBy: 't02', reason: 'dependency-unavailable: modules' },
		]);
	}

	// --- every task before it failed: it still runs (it consumes nothing) ---
	register();
	const all = await walk(node(plan([
		task({ taskId: 't01', template: 'demo.broken', produces: ['modules'] }),
		task({ taskId: 't02', template: 'demo.aggregate', produces: ['report'] }),
	])), 'consumes-nothing-all-failed');
	assert.deepEqual(all.root.finalReport, REPORT);
	assert.deepEqual(seen[0]!.absent, [{ name: 'modules', producedBy: 't01', reason: 'runtime-threw: the graph store is closed' }]);
});

test("a nested plan in which one child task failed gives a root report, and the answer report names the child's task by its path", async () => {
	const CHILD_REPORT = { summary: 'child, from what exists', findings: [] };
	register(aggregate('child.aggregate', CHILD_REPORT));
	const child = plan([
		task({ taskId: 't01', produces: ['files'] }),
		task({ taskId: 't02', template: 'demo.broken', produces: ['symbols'] }),
		task({ taskId: 't03', template: 'child.aggregate', produces: ['report'], consumes: ['files', 'symbols'] }),
	]);
	const root = plan([
		task({ taskId: 't01', produces: ['items'] }),
		task({ taskId: 't02', template: 'code.subrun.deep-dive', kind: 'planner', produces: ['deep'] }),
		task({ taskId: 't03', template: 'demo.aggregate', produces: ['report'], consumes: ['items', 'deep'] }),
	]);
	const tree: PlanTreeNode = { plan: root, children: new Map([['t02', node(child)]]), childErrors: new Map() };
	const executed = await walk(tree, 'nested');

	// The child's aggregate task ran on the one output that exists, told of the other.
	const childSeen = seen.find(s => s.taskId === 't03' && 'files' in s.upstream)!;
	assert.deepEqual(childSeen.upstream, { files: 'files from t01' });
	assert.deepEqual(childSeen.absent, [{ name: 'symbols', producedBy: 't02', reason: 'runtime-threw: the graph store is closed' }]);
	const childExecuted = executed.children.get('t02')!;
	assert.deepEqual(childExecuted.root.finalReport, CHILD_REPORT);
	assert.deepEqual(childExecuted.root.tasksFailed.map(f => f.taskId), ['t02']);

	// So the planner-kind task is 'ok' and carries the child's report ...
	assert.deepEqual([executed.root.perTask.get('t02')?.kind, executed.root.perTask.get('t02')?.status], ['planner', 'ok']);
	assert.deepEqual(executed.root.perTask.get('t02')?.outputs, { deep: CHILD_REPORT });
	// ... the root's aggregate task has all its inputs, and nothing is absent AT THE ROOT ...
	const rootSeen = seen.find(s => 'items' in s.upstream)!;
	assert.deepEqual(rootSeen.upstream, { items: 'items from t01', deep: CHILD_REPORT });
	assert.deepEqual([rootSeen.absent, rootSeen.hasAbsentKey], [undefined, false]);
	// ... and the root has a final report.
	assert.deepEqual(executed.root.finalReport, REPORT);
	assert.deepEqual(executed.root.tasksFailed, []);

	// The answer report names the child's failed task by its path, so the run is not read as complete.
	const sources = collectPlanSources(tree, executed);
	assert.deepEqual(sources.map(s => [s.sourceId, s.failure]), [
		['t01', undefined], ['t02.t01', undefined], ['t02.t02', 'runtime-threw: the graph store is closed'],
	]);
	const { report } = concludeRun(tree, executed, CONTEXT_WHOLE);
	assert.equal(report.completeness.complete, false);
	assert.deepEqual(report.completeness.failed, [
		{ sourceId: 't02.t02', sourceKind: 'plan-task', reason: 'runtime-threw: the graph store is closed' },
	]);
});
