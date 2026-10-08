/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The plan tree's result carries the answer report (LLD-b9d5c5c40df5a574-s1, task t16).
 *
 * The plans are executed by the real plan walk against stand-in runtimes (no
 * model); the run records are written and read back through the real store,
 * and resumed through runAnalyze.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	buildCompleteness,
	renderCompletenessLine,
	RUN_COMPLETENESS_NOT_RECORDED,
	type AnswerReport,
	type Completeness,
} from '../../completeness.js';
import {
	collectPlanSources,
	purgeAllTaskOutputs,
	registerTemplateRuntime,
	runExecutor,
	_resetRuntimeRegistryForTests,
} from '../../executor/index.js';
import type { PlanTask, PlannedTask, TemplateRuntime } from '../../executor/types.js';
import type { PlanTreeNode } from '../../planner/recursive.js';
import { aggregateReportCompleteness } from '../../runtimes/shared/aggregator.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { _shapeTerminalFrameForTest as shapeTerminalFrame } from '../../../daemon/analyze-rpc.js';
import { completeRun, concludeRun, runAnalyze } from '../driver.js';
import { purgeRunForTests, readRunRecord, writeRunRecord } from '../persistence.js';
import type { RunRecord } from '../types.js';

const INTENT: ClassifiedIntent = {
	target: 'code', scope: 'XS', focused: false, scopeRef: { kind: 'repo', value: '/r' }, reasoning: 'run report fixture',
};

function uniqueRunId(label: string): string {
	return `run-report-${label}-${Math.floor(Math.random() * 1e9).toString(16)}`;
}

function task(over: Partial<PlannedTask> & { taskId: string }): PlannedTask {
	return { template: 'demo.leaf', kind: 'leaf', params: {}, produces: ['out'], rationale: 'fixture task for the run report tests', ...over };
}

function plan(tasks: PlannedTask[]): PlanTask {
	return { planId: 'p', goal: 'g', target: 'code', scope: 'XS', reasoning: 'fixture plan for the run report tests', tasks };
}

function node(p: PlanTask, children = new Map<string, PlanTreeNode>()): PlanTreeNode {
	return { plan: p, children, childErrors: new Map() };
}

function runtime(templateId: string, outputs: Record<string, unknown>, completeness: Completeness): TemplateRuntime {
	return { templateId, execute: async () => ({ outputs: new Map(Object.entries(outputs)), completeness }) };
}

const WHOLE = buildCompleteness({ returned: 3, basis: 'filesystem' });
const LIMITED = buildCompleteness({
	returned: 200, basis: 'filesystem',
	limited: [{ what: 'files', limit: 200, scope: 'overall', reason: 'the walk stops at 200 files' }],
});
/** A record no real aggregate task returns: were it read as a source, the report would name it. */
const WOULD_BE_NAMED = buildCompleteness({ returned: 1, basis: 'model-directed', notEstablished: true });

const SUMMARY = 'The model wrote this summary from the tasks it was given.';
const FINAL = { summary: SUMMARY, findings: [{ title: 't', detail: 'd', sources: ['t01'] }], metadata: { target: 'code', scope: 'XS', runId: 'r', tasksAnalyzed: 1 } };

const CONTEXT_WHOLE: AnswerReport = { completeness: { complete: true, incomplete: [], failed: [] } };

test("a run with one failed task and one limited task returns a report naming both, and its final report's text starts with the completeness line", async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(runtime('demo.limited', { files: ['a'] }, LIMITED));
	registerTemplateRuntime({ templateId: 'demo.broken', execute: async () => { throw new Error('the graph store is closed'); } });
	registerTemplateRuntime(runtime('demo.needs-broken', { derived: 1 }, WHOLE));
	registerTemplateRuntime(runtime('demo.whole', { other: 1 }, WHOLE));
	registerTemplateRuntime(runtime('demo.aggregate', { report: FINAL }, aggregateReportCompleteness()));

	const tree = node(plan([
		task({ taskId: 't01', template: 'demo.limited', produces: ['files'] }),
		task({ taskId: 't02', template: 'demo.broken', produces: ['symbols'] }),
		task({ taskId: 't03', template: 'demo.needs-broken', produces: ['derived'], consumes: ['symbols'] }),
		task({ taskId: 't04', template: 'demo.whole', produces: ['other'] }),
		task({ taskId: 't05', template: 'demo.aggregate', produces: ['report'], consumes: ['files', 'other'] }),
	]));
	const runId = uniqueRunId('failed-limited');
	try {
		const executed = await runExecutor({ tree, intent: INTENT, runId });
		assert.deepEqual(executed.root.finalReport, FINAL, 'the aggregate task ran');

		const { report, finalReport } = concludeRun(tree, executed, CONTEXT_WHOLE);
		assert.equal(report.completeness.complete, false);
		assert.deepEqual(report.completeness.incomplete, [
			{ sourceId: 't01', sourceKind: 'plan-task', reason: 'limit of 200 files reached (the walk stops at 200 files)' },
		]);
		// The failed task, and the task skipped because it depends on it.
		assert.deepEqual(report.completeness.failed.map(f => f.sourceId), ['t02', 't03']);
		assert.match(report.completeness.failed[0]?.reason ?? '', /the graph store is closed/);
		assert.match(report.completeness.failed[1]?.reason ?? '', /symbols/);
		assert.ok(report.completeness.failed.every(f => f.sourceKind === 'plan-task'));

		// The final report's text starts with the line, written by code; the rest is as the model wrote it.
		const line = renderCompletenessLine(report);
		assert.match(line, /^Incomplete: 1 incomplete: t01 — .*2 failed: t02 — .* \| t03 — /);
		assert.deepEqual(finalReport, { ...FINAL, summary: `${line}\n\n${SUMMARY}` });
		assert.equal((finalReport as typeof FINAL).summary.split('\n')[0], line);
		assert.deepEqual(executed.root.finalReport, FINAL, 'the executed plan is not changed');

		// The run context's own report is part of the run's: its sources are named as the run context's.
		const contextLimited: AnswerReport = {
			completeness: {
				complete: false,
				incomplete: [{ sourceId: 'search.text [e2]', sourceKind: 'lookup', reason: 'limit of 30 hits reached' }],
				failed: [{ sourceId: 'symbol.locate [e3]', sourceKind: 'lookup', reason: 'closed' }],
				basisNotes: ['a note'],
			},
		};
		const both = concludeRun(tree, executed, contextLimited).report;
		assert.deepEqual(both.completeness.incomplete.map(n => n.sourceId), ['run context / search.text [e2]', 't01']);
		assert.deepEqual(both.completeness.failed.map(n => n.sourceId), ['run context / symbol.locate [e3]', 't02', 't03']);
		assert.deepEqual(both.completeness.basisNotes, ['a note']);

		// A run context with no report does not count as complete.
		const unknown = concludeRun(tree, executed, undefined).report;
		assert.deepEqual(unknown.completeness.incomplete[0], {
			sourceId: 'run context / bundle', sourceKind: 'lookup', reason: 'completeness was not recorded for the run context',
		});
	} finally {
		purgeAllTaskOutputs(runId);
	}

	// Every task complete and the run context complete: the report says so.
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(runtime('demo.whole', { other: 1 }, WHOLE));
	registerTemplateRuntime(runtime('demo.aggregate', { report: FINAL }, aggregateReportCompleteness()));
	const wholeTree = node(plan([
		task({ taskId: 't01', template: 'demo.whole', produces: ['other'] }),
		task({ taskId: 't02', template: 'demo.aggregate', produces: ['report'], consumes: ['other'] }),
	]));
	const wholeRun = uniqueRunId('whole');
	try {
		const done = concludeRun(wholeTree, await runExecutor({ tree: wholeTree, intent: INTENT, runId: wholeRun }), CONTEXT_WHOLE);
		assert.deepEqual(done.report, { completeness: { complete: true, incomplete: [], failed: [] } });
		assert.equal((done.finalReport as typeof FINAL).summary, `Complete.\n\n${SUMMARY}`);
		// The same tasks with a run context that is not complete: the run is not complete.
		const ctx: AnswerReport = { completeness: { complete: false, incomplete: [{ sourceId: 'x [e1]', sourceKind: 'lookup', reason: 'r' }], failed: [] } };
		assert.equal(concludeRun(wholeTree, await runExecutor({ tree: wholeTree, intent: INTENT, runId: wholeRun }), ctx).report.completeness.complete, false);
	} finally {
		purgeAllTaskOutputs(wholeRun);
	}
});

test('a run with a nested plan names an incomplete child task by its path; the planner-kind task and the aggregate-report task are not sources', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(runtime('demo.whole', { items: ['x'] }, WHOLE));
	registerTemplateRuntime(runtime('child.limited', { files: ['a'] }, LIMITED));
	registerTemplateRuntime(runtime('child.whole', { more: 1 }, WHOLE));
	// Both aggregate tasks return a record that WOULD be named were it read as a source.
	registerTemplateRuntime(runtime('child.aggregate', { report: { summary: 'child summary', findings: [] } }, WOULD_BE_NAMED));
	registerTemplateRuntime(runtime('demo.aggregate', { report: FINAL }, WOULD_BE_NAMED));

	const child = plan([
		task({ taskId: 't01', template: 'child.limited', produces: ['files'] }),
		task({ taskId: 't02', template: 'child.whole', produces: ['more'] }),
		task({ taskId: 't03', template: 'child.aggregate', produces: ['report'], consumes: ['files', 'more'] }),
	]);
	const root = plan([
		task({ taskId: 't01', template: 'demo.whole', produces: ['items'] }),
		task({ taskId: 't02', template: 'code.subrun.deep-dive', kind: 'planner', produces: ['report'] }),
		task({ taskId: 't03', template: 'demo.aggregate', produces: ['final'], consumes: ['items', 'report'] }),
	]);
	// The root's aggregate task is its last; name its output as the walk expects.
	const rootPlan = plan([root.tasks[0]!, root.tasks[1]!, { ...root.tasks[2]!, produces: ['report'], consumes: ['items'] }]);
	const tree: PlanTreeNode = { plan: rootPlan, children: new Map([['t02', node(child)]]), childErrors: new Map() };

	const runId = uniqueRunId('nested');
	try {
		const executed = await runExecutor({ tree, intent: INTENT, runId });
		assert.equal(executed.root.perTask.get('t02')?.kind, 'planner');
		assert.equal(executed.root.perTask.get('t02')?.status, 'ok');
		assert.equal(executed.root.perTask.get('t02')?.completeness, undefined, 'a planner-kind task has no record of its own');

		// The sources: the root's own task, then the child plan's two tasks by path.
		const sources = collectPlanSources(tree, executed);
		assert.deepEqual(sources.map(s => s.sourceId), ['t01', 't02.t01', 't02.t02']);
		assert.ok(sources.every(s => s.sourceKind === 'plan-task' && s.failure === undefined));

		const { report } = concludeRun(tree, executed, CONTEXT_WHOLE);
		assert.deepEqual(report.completeness.incomplete, [
			{ sourceId: 't02.t01', sourceKind: 'plan-task', reason: 'limit of 200 files reached (the walk stops at 200 files)' },
		]);
		assert.deepEqual(report.completeness.failed, []);
	} finally {
		purgeAllTaskOutputs(runId);
	}

	// A planner-kind task with no child plan failed: it is one failed source.
	const orphan: PlanTreeNode = { plan: rootPlan, children: new Map(), childErrors: new Map() };
	const orphanRun = uniqueRunId('orphan');
	try {
		const executed = await runExecutor({ tree: orphan, intent: INTENT, runId: orphanRun });
		const sources = collectPlanSources(orphan, executed);
		assert.deepEqual(sources.map(s => s.sourceId), ['t01', 't02']);
		assert.match(sources[1]?.failure ?? '', /child-plan-unavailable/);
	} finally {
		purgeAllTaskOutputs(orphanRun);
	}
});

function storedRecord(runId: string, extra: Partial<RunRecord>): RunRecord {
	return {
		runId,
		createdAt: '2026-10-08T00:00:00.000Z',
		updatedAt: '2026-10-08T00:00:05.000Z',
		userPrompt: 'p',
		initialScopeRef: { kind: 'repo', value: '/r' },
		stage: 'done',
		status: 'ok',
		intent: INTENT,
		tasksCompleted: 2,
		tasksFailed: [],
		...extra,
	};
}

test('a run record written after the change resumes with its report (mutation: leave `report` out of the resume literal)', async () => {
	const report: AnswerReport = {
		completeness: {
			complete: false,
			incomplete: [{ sourceId: 't02.t01', sourceKind: 'plan-task', reason: 'limit of 200 files reached (the walk stops at 200 files)' }],
			failed: [{ sourceId: 't03', sourceKind: 'plan-task', reason: 'the graph store is closed' }],
		},
	};
	const line = renderCompletenessLine(report);
	const finalReport = { ...FINAL, summary: `${line}\n\n${SUMMARY}` };
	const runId = uniqueRunId('resume-with');
	try {
		writeRunRecord(storedRecord(runId, { finalReport, report }));
		assert.deepEqual(readRunRecord(runId)?.report, report, 'the record stores the report');

		const result = await runAnalyze({ runId, userPrompt: 'ignored on resume', scopeRef: { kind: 'repo', value: '/r' } });
		assert.ok(result.ok);
		assert.deepEqual(result.report, report);
		// The text already starts with the line; it is not added a second time.
		assert.deepEqual(result.finalReport, finalReport);
		// The daemon's response carries the report too.
		assert.deepEqual(shapeTerminalFrame(result), {
			ok: true, runId, intent: INTENT, finalReport, tasksCompleted: 2, tasksFailed: [], durationMs: 0, report,
		});
	} finally {
		purgeRunForTests(runId);
	}
});

test('a run record written without a report resumes with none and its text form carries the not-recorded line', async () => {
	const runId = uniqueRunId('resume-without');
	try {
		writeRunRecord(storedRecord(runId, { finalReport: FINAL }));

		const result = await runAnalyze({ runId, userPrompt: 'ignored on resume', scopeRef: { kind: 'repo', value: '/r' } });
		assert.ok(result.ok);
		// No report is invented for it.
		assert.equal('report' in result, false);
		assert.equal('report' in shapeTerminalFrame(result), false);
		// The not-recorded line stands at the head of the text, in the report's place.
		assert.equal(RUN_COMPLETENESS_NOT_RECORDED, 'Completeness was not recorded for this run.');
		assert.deepEqual(result.finalReport, { ...FINAL, summary: `Completeness was not recorded for this run.\n\n${SUMMARY}` });
		// The stored record is left as it was.
		assert.deepEqual(readRunRecord(runId)?.finalReport, FINAL);
		assert.equal(readRunRecord(runId)?.report, undefined);

		// A final report with no text is returned as it is.
		writeRunRecord(storedRecord(runId, { finalReport: { from: 'old-shape' } }));
		const other = await runAnalyze({ runId, userPrompt: 'ignored', scopeRef: { kind: 'repo', value: '/r' } });
		assert.ok(other.ok);
		assert.deepEqual(other.finalReport, { from: 'old-shape' });
	} finally {
		purgeRunForTests(runId);
	}
});

test('a run that completes stores its report in the run record, and resuming from that record returns the same report and the same text', async () => {
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime(runtime('demo.limited', { files: ['a'] }, LIMITED));
	registerTemplateRuntime(runtime('demo.aggregate', { report: FINAL }, aggregateReportCompleteness()));
	const tree = node(plan([
		task({ taskId: 't01', template: 'demo.limited', produces: ['files'] }),
		task({ taskId: 't02', template: 'demo.aggregate', produces: ['report'], consumes: ['files'] }),
	]));
	const runId = uniqueRunId('complete');
	const contextReport: AnswerReport = {
		completeness: { complete: false, incomplete: [], failed: [{ sourceId: 'symbol.locate [e3]', sourceKind: 'lookup', reason: 'closed' }] },
	};
	try {
		const executed = await runExecutor({ tree, intent: INTENT, runId });
		// The record as it stands while the plan is being executed.
		const inProgress = storedRecord(runId, { stage: 'execute', status: 'in-progress', tasksCompleted: undefined, tasksFailed: undefined });

		const result = completeRun({ record: inProgress, intent: INTENT, tree, executed, contextReport, start: Date.now() });
		assert.ok(result.ok);
		assert.deepEqual(result.report?.completeness.incomplete.map(n => n.sourceId), ['t01']);
		assert.deepEqual(result.report?.completeness.failed.map(n => n.sourceId), ['run context / symbol.locate [e3]']);
		const line = renderCompletenessLine(result.report!);
		assert.equal((result.finalReport as typeof FINAL).summary, `${line}\n\n${SUMMARY}`);
		assert.equal(result.tasksCompleted, 2);

		// The stored record is done, and holds the same report and the same final report.
		const stored = readRunRecord(runId);
		assert.equal(stored?.stage, 'done');
		assert.equal(stored?.status, 'ok');
		assert.deepEqual(stored?.report, result.report);
		assert.deepEqual(stored?.finalReport, result.finalReport);
		assert.equal(stored?.tasksCompleted, 2);

		// Resumed from that record, the run returns what it returned.
		const resumed = await runAnalyze({ runId, userPrompt: 'ignored on resume', scopeRef: { kind: 'repo', value: '/r' } });
		assert.ok(resumed.ok);
		assert.deepEqual(resumed.report, result.report);
		assert.deepEqual(resumed.finalReport, result.finalReport);
	} finally {
		purgeAllTaskOutputs(runId);
		purgeRunForTests(runId);
	}
});
