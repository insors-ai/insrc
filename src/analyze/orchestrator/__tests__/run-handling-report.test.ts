import './private-paths.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Root and nested aggregates with uncovered parts (LLD-b9d5c5c40df5a574-s3, task t11): the run is incomplete, the
 * handling is merged with plan-qualified part ids, and the head shows the handling line. The real plan walk against
 * stand-in runtimes; no model.
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

const handling = (parts: number, uncovered: string[], extra: Partial<HandlingReport> = {}): HandlingReport => ({
	method: 'partitioned', parts, partitionedBy: 'file', notCovered: uncovered.map(part => ({ part, reason: `${part} failed` })),
	budgets: [{ unit: 'chars', limit: 44000, source: 'provider', basis: 'declared', inputSize: 60000 }], ...extra,
});

test('root and nested aggregates with uncovered parts make the run incomplete, handling merged and the head shows the handling line', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(leaf);
	registerTemplateRuntime(reporting('demo.aggregate', handling(3, ['part 1: docs/a'], { combineStages: 1 })));
	registerTemplateRuntime(reporting('demo.child-aggregate', handling(2, ['part 2: docs/b', 'combine'], { combineStages: 1, partitionedBy: 'directory' })));
	const child = node(plan([
		task({ taskId: 't01', produces: ['files'] }),
		task({ taskId: 't02', template: 'demo.child-aggregate', produces: ['report'], consumes: ['files'] }),
	]));
	const root = node(plan([
		task({ taskId: 't01', produces: ['items'] }),
		task({ taskId: 't02', template: 'demo.subrun', kind: 'planner', produces: ['deep'] }),
		task({ taskId: 't03', template: 'demo.aggregate', produces: ['report'], consumes: ['items', 'deep'] }),
	]), new Map([['t02', child]]));
	const runId = uniqueRunId('run-handling-report');
	try {
		const executed = await runExecutor({ tree: root, intent: INTENT, runId });
		const { report, finalReport } = concludeRun(root, executed, CONTEXT_WHOLE);
		assert.equal(report.completeness.complete, false);
		// Each uncovered part is a source named by its aggregate task's path.
		const named = report.completeness.failed.map(f => f.sourceId);
		assert.deepEqual(named, ['t02.t02 / part 2: docs/b', 't02.t02 / combine', 't03 / part 1: docs/a']);
		// The handling is merged: the root's and the nested plan's, the nested part ids qualified by the planner task's path.
		assert.equal(report.handling?.method, 'partitioned');
		assert.equal(report.handling?.parts, 5);
		assert.equal(report.handling?.combineStages, 2);
		assert.equal(report.handling?.partitionedBy, 'mixed');
		assert.deepEqual(report.handling?.notCovered.map(n => n.part), ['part 1: docs/a', 't02 / part 2: docs/b', 't02 / combine']);
		assert.equal(report.handling?.budgets.length, 1, 'identical budgets are listed once');
		// The head of the final report: the completeness line, then the one handling line naming the parts that were not covered.
		const head = (finalReport as { summary: string }).summary.split('\n\n')[0]!.split('\n');
		assert.equal(head.length, 2);
		assert.match(head[0]!, /^Incomplete: /);
		assert.match(head[1]!, /^Handling: divided into 5 parts by mixed, 2 combine stages\./);
		assert.ok(head[1]!.includes('Not covered: part 1: docs/a (part 1: docs/a failed); t02 / part 2: docs/b (part 2: docs/b failed); t02 / combine (combine failed).'));

		// A run whose aggregates ran in one pass reports that, and is complete.
		_resetRuntimeRegistryForTests();
		registerTemplateRuntime(leaf);
		registerTemplateRuntime(reporting('demo.aggregate', { method: 'single-pass', parts: 1, notCovered: [], budgets: [] }));
		registerTemplateRuntime(reporting('demo.child-aggregate', { method: 'single-pass', parts: 1, notCovered: [], budgets: [] }));
		const again = uniqueRunId('run-handling-single');
		try {
			const whole = await runExecutor({ tree: root, intent: INTENT, runId: again });
			const concluded = concludeRun(root, whole, CONTEXT_WHOLE);
			assert.equal(concluded.report.completeness.complete, true);
			assert.equal(concluded.report.handling?.method, 'single-pass');
			assert.equal(concluded.report.handling?.parts, 2);
		} finally { purgeAllTaskOutputs(again); }
	} finally { purgeAllTaskOutputs(runId); }
});
