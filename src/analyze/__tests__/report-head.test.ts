/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The measure in the answer report and at the head of an answer
 * (LLD-b9d5c5c40df5a574-s2, task t4). Every writer of an answer's head is
 * called here with a report that has a measure and with one that has none.
 * The plan tree's part runs the real plan walk against stand-in runtimes and
 * the real run-record store. No model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { AnalyzeGroundingFailedError, _flattenBundleForTest as flattenBundle } from '../../daemon/workflow-rpc.js';
import { prepareAnswerTurn } from '../../mcp/analyze-step/answer-turn.js';
import { renderAnalyzeFailure, renderBundleAsMarkdown } from '../../mcp/bundle-md.js';
import type { AnalyzeContextBundle, ClassifiedIntent } from '../../shared/analyze-types.js';
import {
	buildCompleteness, completenessHeadLine, isAnswerReport, renderCompletenessLine, renderMeasureLine, renderReportHead,
} from '../completeness.js';
import type { AnswerReport } from '../completeness.js';
import { assembleMarkdown } from '../context/bundle.js';
import { _setSynthesizerPromptPathForTest } from '../context/synthesizer.js';
import { purgeAllTaskOutputs, registerTemplateRuntime, runExecutor, _resetRuntimeRegistryForTests } from '../executor/index.js';
import type { PlanTask, PlannedTask } from '../executor/types.js';
import { reportFromLookups } from '../explore/answer-report.js';
import type { ExecutedExploration, ExecutedPlan } from '../explore/types.js';
import type { RequestMeasure } from '../measure.js';
import { completeRun, concludeRun, runAnalyze } from '../orchestrator/driver.js';
import { purgeRunForTests, readRunRecord, writeRunRecord } from '../orchestrator/persistence.js';
import type { RunRecord } from '../orchestrator/types.js';
import type { PlanTreeNode } from '../planner/recursive.js';
import { aggregateReportCompleteness } from '../runtimes/shared/aggregator.js';

const AREA: RequestMeasure = { source: 'named-area', items: 18330, files: 1204, characters: null, size: 'L', determined: true, sizeHint: 'S' };
const LOOKUPS: RequestMeasure = { source: 'lookup-results', items: 12, files: 4, characters: 5120, size: 'S', determined: true };
const AREA_LINE = 'Size: L, measured from the area the request names: 1,204 files, 18,330 entities. The caller asked for S.';
const LOOKUPS_LINE = 'Size: S, measured from what the lookups returned: 4 files, 12 items, 5,120 characters.';

const INCOMPLETE: AnswerReport = {
	completeness: { complete: false, incomplete: [{ sourceId: 'search.text [e2]', sourceKind: 'lookup', reason: 'limit of 30 hits reached' }], failed: [] },
};
const INCOMPLETE_LINE = 'Incomplete: 1 incomplete: search.text [e2] — limit of 30 hits reached.';

const INTENT: ClassifiedIntent = { target: 'code', scope: 'XS', focused: false, scopeRef: { kind: 'repo', value: '/r' }, reasoning: 'report head fixture' };

const bundleWith = (report: AnswerReport | undefined): AnalyzeContextBundle => ({
	system: 'SYSTEM LAYER', focus: 'FOCUS LAYER', summary: 'SUMMARY LAYER', structure: '', surface: '', artefacts: '', upstream: '',
	...(report !== undefined ? { report } : {}),
}) as unknown as AnalyzeContextBundle;

/** The first lines of a text, up to its first empty line. */
const headOf = (text: string): string[] => text.split('\n\n')[0]!.split('\n');

const SUMMARY = 'The model wrote this summary from the tasks it was given.';
const FINAL = { summary: SUMMARY, findings: [], metadata: { target: 'code', scope: 'XS', runId: 'r', tasksAnalyzed: 1 } };

function task(over: Partial<PlannedTask> & { taskId: string }): PlannedTask {
	return { template: 'demo.leaf', kind: 'leaf', params: {}, produces: ['out'], rationale: 'fixture task for the report head test', ...over };
}
function tree(): PlanTreeNode {
	const plan: PlanTask = {
		planId: 'p', goal: 'g', target: 'code', scope: 'XS', reasoning: 'fixture plan for the report head test',
		tasks: [
			task({ taskId: 't01', template: 'demo.whole', produces: ['other'] }),
			task({ taskId: 't02', template: 'demo.aggregate', produces: ['report'], consumes: ['other'] }),
		],
	};
	return { plan, children: new Map(), childErrors: new Map() };
}
function record(runId: string, extra: Partial<RunRecord>): RunRecord {
	return {
		runId, createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:05.000Z', userPrompt: 'p',
		initialScopeRef: { kind: 'repo', value: '/r' }, stage: 'done', status: 'ok', intent: INTENT, tasksCompleted: 2, tasksFailed: [],
		...extra,
	};
}

test("every writer of an answer's head (the run context's markdown, both writers of the bundle's markdown, the step tool's answer turn, both writers of the workflow runner, and the plan tree's final report) carries the measure line under the completeness line; the plan tree's merged report carries the run's measure; and a report or a run record stored before the change is read as it is", async () => {
	const withMeasure: AnswerReport = { ...INCOMPLETE, measure: AREA };
	assert.equal(renderMeasureLine(AREA), AREA_LINE);

	// --- The one function: the completeness line alone, or both lines. ---
	assert.equal(renderReportHead(INCOMPLETE), INCOMPLETE_LINE);
	assert.equal(renderReportHead(INCOMPLETE), renderCompletenessLine(INCOMPLETE));
	assert.equal(renderReportHead(withMeasure), `${INCOMPLETE_LINE}\n${AREA_LINE}`);
	assert.equal(completenessHeadLine(withMeasure, 'nothing'), `${INCOMPLETE_LINE}\n${AREA_LINE}`);
	assert.equal(completenessHeadLine(INCOMPLETE, 'say-not-recorded'), INCOMPLETE_LINE);
	// The completeness line itself is unchanged by a measure.
	assert.equal(renderCompletenessLine(withMeasure), INCOMPLETE_LINE);

	// The module that writes the head loads no store: the agent tools' process reads the head and opens none.
	// It takes the measure's TYPE from the measuring module, whose own imports load the graph store.
	const completenessSource = readFileSync(fileURLToPath(new URL('../completeness.ts', import.meta.url)), 'utf8');
	assert.deepEqual(completenessSource.split('\n').filter(l => /^(import|export) .* from /.test(l)), ["import type { RequestMeasure } from './measure.js';"]);

	// --- The report builder: a given measure goes in; without one the report is exactly as before. ---
	const lookups: ExecutedExploration[] = [{
		exploration: { id: 'e1', type: 'search.text', params: {} },
		output: { type: 'search.text', hits: [], completeness: buildCompleteness({ returned: 0, basis: 'filesystem' }) },
		durationMs: 1, cached: false,
	} as unknown as ExecutedExploration];
	const bare = reportFromLookups(lookups);
	assert.deepEqual(bare, { completeness: { complete: true, incomplete: [], failed: [] } });
	assert.ok(!('measure' in bare));
	assert.deepEqual(reportFromLookups(lookups, LOOKUPS), { ...bare, measure: LOOKUPS });
	assert.ok(isAnswerReport(bare) && isAnswerReport({ ...bare, measure: LOOKUPS }));

	// --- 1. The run context's markdown (it goes into the classifier's and the planner's prompts). ---
	assert.deepEqual(headOf(assembleMarkdown(bundleWith(withMeasure))), [INCOMPLETE_LINE, AREA_LINE]);
	assert.deepEqual(headOf(assembleMarkdown(bundleWith(INCOMPLETE))), [INCOMPLETE_LINE]);
	assert.ok(!assembleMarkdown(bundleWith(undefined)).includes('Size:'));

	// --- 2 and 3. Both writers of the bundle's markdown: the answer, and a failure after the lookups ran. ---
	assert.deepEqual(headOf(renderBundleAsMarkdown(bundleWith(withMeasure), { includeMeta: false })), [INCOMPLETE_LINE, AREA_LINE]);
	assert.deepEqual(headOf(renderBundleAsMarkdown(bundleWith(INCOMPLETE), { includeMeta: false })), [INCOMPLETE_LINE]);
	const failure = { code: 'answer-step-failed', message: 'the model returned nothing' };
	assert.deepEqual(headOf(renderAnalyzeFailure({ ...failure, data: { report: withMeasure, reason: 'timeout' } })), [INCOMPLETE_LINE, AREA_LINE]);
	assert.deepEqual(headOf(renderAnalyzeFailure({ ...failure, data: { report: INCOMPLETE } })), [INCOMPLETE_LINE]);

	// --- 4. The step tool's answer turn, when the answer prompt is missing after the lookups ran. ---
	_setSynthesizerPromptPathForTest('code', '/no/such/dir/answer-prompt.md');
	try {
		const executed: ExecutedPlan = { plan: { answerType: 'how-does-it-work', synthesisHint: 'h', explorations: [] } as never, results: lookups, totalMs: 1, totalCached: 0 };
		const measured = prepareAnswerTurn({ intent: INTENT, executed, target: 'code', measure: LOOKUPS });
		assert.ok(!measured.ok);
		assert.deepEqual(measured.message.split('\n').slice(0, 2), ['Complete.', LOOKUPS_LINE]);
		assert.match(measured.message.split('\n')[2]!, /^The answer could not be written: /);
		assert.deepEqual(measured.data.report, { ...bare, measure: LOOKUPS }, 'the error carries the report with its measure');
		const unmeasured = prepareAnswerTurn({ intent: INTENT, executed, target: 'code' });
		assert.ok(!unmeasured.ok);
		assert.match(unmeasured.message, /^Complete\.\nThe answer could not be written: /);
		assert.deepEqual(unmeasured.data.report, bare);
	} finally {
		_setSynthesizerPromptPathForTest('code', undefined);
	}

	// --- 5 and 6. Both writers of the workflow runner: the grounding text, and a grounding that failed. ---
	assert.deepEqual(flattenBundle(bundleWith(withMeasure)).split('\n\n').slice(0, 2), [`${INCOMPLETE_LINE}\n${AREA_LINE}`, 'SYSTEM LAYER']);
	assert.equal(flattenBundle(bundleWith(INCOMPLETE)).split('\n\n')[0], INCOMPLETE_LINE);
	assert.equal(flattenBundle(bundleWith(undefined)).split('\n\n')[0], 'SYSTEM LAYER');
	const grounding = new AnalyzeGroundingFailedError('context.assemble', { ...failure, data: { report: withMeasure } });
	assert.deepEqual(grounding.message.split('\n').slice(0, 2), [INCOMPLETE_LINE, AREA_LINE]);
	assert.match(grounding.message.split('\n')[2]!, /^workflow\.run: analyze grounding failed for step 'context\.assemble'/);
	assert.deepEqual(grounding.report, withMeasure);
	assert.match(new AnalyzeGroundingFailedError('context.assemble', { ...failure, data: { report: INCOMPLETE } }).message,
		/^Incomplete: [^\n]*\nworkflow\.run: /);

	// --- 7. The plan tree's final report, and the merged report. ---
	_resetRuntimeRegistryForTests();
	registerTemplateRuntime({ templateId: 'demo.whole', execute: async () => ({ outputs: new Map([['other', 1]]), completeness: buildCompleteness({ returned: 3, basis: 'filesystem' }) }) });
	registerTemplateRuntime({ templateId: 'demo.aggregate', execute: async () => ({ outputs: new Map([['report', FINAL]]), completeness: aggregateReportCompleteness() }) });
	const runId = `report-head-${Math.floor(Math.random() * 1e9).toString(16)}`;
	const oldRunId = `${runId}-old`;
	try {
		const t = tree();
		const executed = await runExecutor({ tree: t, intent: INTENT, runId });
		// The run context's report has a measure of its own (of its lookups). The merge drops it: the run's measure
		// is the one the driver adds after the merge.
		const contextReport: AnswerReport = { ...INCOMPLETE, measure: LOOKUPS };
		const concluded = concludeRun(t, executed, contextReport, AREA);
		assert.deepEqual(concluded.report.measure, AREA, "the merged report carries the run's measure");
		assert.deepEqual(concluded.report.completeness.incomplete.map(n => n.sourceId), ['run context / search.text [e2]']);
		const runLine = renderCompletenessLine(concluded.report);
		assert.equal((concluded.finalReport as typeof FINAL).summary, `${runLine}\n${AREA_LINE}\n\n${SUMMARY}`);
		// With no measure given, the report and the final report are exactly as before.
		const plain = concludeRun(t, executed, contextReport);
		assert.ok(!('measure' in plain.report));
		assert.equal((plain.finalReport as typeof FINAL).summary, `${runLine}\n\n${SUMMARY}`);

		// The run is completed with the measure: the result, the stored record and a resumed run all carry it.
		const result = completeRun({ record: record(runId, { stage: 'execute', status: 'in-progress' }), intent: INTENT, tree: t, executed, contextReport, measure: AREA, start: Date.now() });
		assert.ok(result.ok);
		assert.deepEqual(result.report, concluded.report);
		assert.deepEqual(result.finalReport, concluded.finalReport);
		assert.deepEqual(readRunRecord(runId)?.report, concluded.report, 'the stored report carries the measure');
		const resumed = await runAnalyze({ runId, userPrompt: 'ignored on resume', scopeRef: { kind: 'repo', value: '/r' } });
		assert.ok(resumed.ok);
		assert.deepEqual(resumed.report?.measure, AREA);
		assert.deepEqual(resumed.finalReport, concluded.finalReport);

		// --- A report and a run record stored before the change are read as they are. ---
		const oldReport = JSON.parse(JSON.stringify(INCOMPLETE)) as unknown;
		assert.ok(isAnswerReport(oldReport));
		assert.equal(renderReportHead(oldReport), INCOMPLETE_LINE);
		const oldFinal = { summary: `${INCOMPLETE_LINE}\n\n${SUMMARY}`, findings: [] };
		writeRunRecord(record(oldRunId, { report: INCOMPLETE, finalReport: oldFinal }));
		const stored = readRunRecord(oldRunId);
		assert.deepEqual(stored?.report, INCOMPLETE);
		assert.ok(stored?.report !== undefined && !('measure' in stored.report));
		const old = await runAnalyze({ runId: oldRunId, userPrompt: 'ignored on resume', scopeRef: { kind: 'repo', value: '/r' } });
		assert.ok(old.ok);
		assert.deepEqual(old.report, INCOMPLETE);
		assert.deepEqual(old.finalReport, oldFinal, 'no measure line is added to a text stored before the change');
	} finally {
		purgeAllTaskOutputs(runId);
		purgeRunForTests(runId);
		purgeRunForTests(oldRunId);
	}
});
