import './private-paths.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A failed nested aggregate under a succeeding root aggregate (LLD-b9d5c5c40df5a574-s3, task t11). The real plan walk
 * against stand-in runtimes; no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCompleteness } from '../../completeness.js';
import type { AnswerReport, HandlingReport } from '../../completeness.js';
import {
	purgeAllTaskOutputs, registerTemplateRuntime, runExecutor, _resetRuntimeRegistryForTests,
} from '../../executor/index.js';
import type { PlanTask, PlannedTask, TemplateRuntime } from '../../executor/types.js';
import type { PlanTreeNode } from '../../planner/recursive.js';
import { aggregateReportCompleteness } from '../../runtimes/shared/aggregator.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { concludeRun } from '../driver.js';
import { HandlingBudgetError } from '../../context/answer-step-error.js';
import { renderReportHead } from '../../completeness.js';

const INTENT: ClassifiedIntent = {
	target: 'code', scope: 'XS', focused: false, scopeRef: { kind: 'repo', value: '/r' }, reasoning: 'nested aggregate fixture',
};
const WHOLE = buildCompleteness({ returned: 3, basis: 'filesystem' });
const CONTEXT_WHOLE: AnswerReport = { completeness: { complete: true, incomplete: [], failed: [] } };
const SUMMARY = 'The model wrote this summary from the tasks it was given.';
const uniqueRunId = (label: string): string => `${label}-${Math.floor(Math.random() * 1e9).toString(16)}`;

function task(over: Partial<PlannedTask> & { taskId: string }): PlannedTask {
	return { template: 'demo.leaf', kind: 'leaf', params: {}, produces: ['out'], rationale: 'fixture task for the nested aggregate tests', ...over };
}
function plan(tasks: PlannedTask[]): PlanTask {
	return { planId: 'p', goal: 'g', target: 'code', scope: 'XS', reasoning: 'fixture plan for the nested aggregate tests', tasks };
}
const node = (p: PlanTask, children = new Map<string, PlanTreeNode>()): PlanTreeNode => ({ plan: p, children, childErrors: new Map() });
const leaf: TemplateRuntime = { templateId: 'demo.leaf', execute: async a => ({ outputs: new Map(a.task.produces.map(n => [n, `${n} from ${a.task.taskId}`])), completeness: WHOLE }) };
/** An aggregate stand-in whose report says how it was written. */
const reporting = (templateId: string, handling: HandlingReport | undefined): TemplateRuntime => ({
	templateId, execute: async () => ({
		outputs: new Map([['report', { summary: SUMMARY, findings: [], metadata: { target: 'code', scope: 'XS', runId: 'r', tasksAnalyzed: 1, ...(handling !== undefined ? { handling } : {}) } }]]),
		completeness: aggregateReportCompleteness(),
	}),
});

test('a failed nested aggregate under a succeeding root makes the run incomplete and names it, with no run failure raised', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(leaf);
	registerTemplateRuntime({ templateId: 'demo.aggregate-broken', execute: async () => { throw new Error('every part of the nested report failed'); } });
	registerTemplateRuntime(reporting('demo.aggregate', undefined));
	const child = node(plan([
		task({ taskId: 't01', produces: ['files'] }),
		task({ taskId: 't02', template: 'demo.aggregate-broken', produces: ['report'], consumes: ['files'] }),
	]));
	const root = node(plan([
		task({ taskId: 't01', produces: ['items'] }),
		task({ taskId: 't02', template: 'demo.subrun', kind: 'planner', produces: ['deep'] }),
		task({ taskId: 't03', template: 'demo.aggregate', produces: ['report'], consumes: ['items'] }),
	]), new Map([['t02', child]]));
	const runId = uniqueRunId('nested-aggregate-failure');
	try {
		const executed = await runExecutor({ tree: root, intent: INTENT, runId });
		// The root aggregate succeeded from the sibling output: the run has a final report and raises no failure.
		assert.ok(executed.root.finalReport !== undefined);
		assert.deepEqual(executed.root.tasksFailed.map(f => f.taskId), ['t02']);
		// The nested aggregate's failure is kept whole on its record, and its executed child is kept.
		const nested = executed.children.get('t02')!;
		assert.equal(nested.root.perTask.get('t02')?.status, 'failed');
		assert.deepEqual(nested.root.perTask.get('t02')?.data, { kind: 'error', name: 'Error', message: 'every part of the nested report failed' });

		const { report, finalReport } = concludeRun(root, executed, CONTEXT_WHOLE);
		assert.equal(report.completeness.complete, false, 'the run is incomplete');
		const failed = report.completeness.failed.map(f => f.sourceId);
		assert.ok(failed.includes('t02'), 'the planner task that stood for the nested plan');
		assert.ok(failed.includes('t02.t02'), 'the nested aggregate itself, by its path');
		assert.match(report.completeness.failed.find(f => f.sourceId === 't02.t02')?.reason ?? '', /every part of the nested report failed/);
		assert.ok(!failed.includes('t02.t01'), 'a nested task that ran is not named');
		assert.match((finalReport as { summary: string }).summary.split('\n')[0]!, /^Incomplete: .*t02\.t02/);
	} finally { purgeAllTaskOutputs(runId); }
});

test('a failed nested aggregate with typed handling keeps its budgets and uncovered parts in the delivered report', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(leaf);
	const handling: HandlingReport = {
		method: 'partitioned', parts: 2, partitionedBy: 'section', trigger: 'size',
		notCovered: [{ part: 'part 2', reason: 'the part did not fit' }],
		budgets: [{ unit: 'chars', limit: 60_000, source: 'default', basis: 'default', inputSize: 90_000 }],
	};
	registerTemplateRuntime({
		templateId: 'demo.aggregate-typed',
		execute: async () => { throw new HandlingBudgetError('no part of the input fits a call', { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] }, handling } }, { partFailures: [{ part: 'part 2', kind: 'unadmittable', reason: 'the part did not fit' }] }); },
	});
	registerTemplateRuntime(reporting('demo.aggregate', undefined));
	const child = node(plan([
		task({ taskId: 't01', produces: ['files'] }),
		task({ taskId: 't02', template: 'demo.aggregate-typed', produces: ['report'], consumes: ['files'] }),
	]));
	const root = node(plan([
		task({ taskId: 't01', produces: ['items'] }),
		task({ taskId: 't02', template: 'demo.subrun', kind: 'planner', produces: ['deep'] }),
		task({ taskId: 't03', template: 'demo.aggregate', produces: ['report'], consumes: ['items'] }),
	]), new Map([['t02', child]]));
	const runId = uniqueRunId('nested-aggregate-typed');
	try {
		const executed = await runExecutor({ tree: root, intent: INTENT, runId });
		const { report } = concludeRun(root, executed, CONTEXT_WHOLE);
		assert.equal(report.completeness.complete, false);
		assert.equal(report.handling?.method, 'partitioned');
		assert.deepEqual(report.handling?.notCovered.map(n => n.part), ['t02 / part 2'], 'the uncovered part is named by the nested plan');
		assert.equal(report.handling?.budgets[0]?.inputSize, 90_000, 'the budget survives');
		assert.match(renderReportHead(report), /Handling: /, 'the head shows the handling line');
	} finally { purgeAllTaskOutputs(runId); }
});
