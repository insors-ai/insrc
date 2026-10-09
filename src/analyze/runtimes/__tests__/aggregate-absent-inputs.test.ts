/**
 * The five aggregate-report runtimes hand absentInputs to the aggregator
 * (Story s7, task t9). A stand-in model keeps the prompt each one sends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { LLMProvider } from '../../../shared/types.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import type { AbsentInput, PlannedTask, TemplateExecuteArgs, TemplateRuntime } from '../../executor/types.js';
import { codeAggregateReportRuntime } from '../code/aggregate-report.js';
import { dataAggregateReportRuntime } from '../data/aggregate-report.js';
import { docsAggregateReportRuntime } from '../docs/aggregate-report.js';
import { genericAggregateReportRuntime } from '../generic/aggregate-report.js';
import { infraAggregateReportRuntime } from '../infra/aggregate-report.js';

const RUNTIMES: readonly TemplateRuntime[] = [
	codeAggregateReportRuntime, dataAggregateReportRuntime, docsAggregateReportRuntime,
	genericAggregateReportRuntime, infraAggregateReportRuntime,
];

let prompts: string[] = [];
const model = {
	completeStructured: async (messages: ReadonlyArray<{ content: unknown }>) => {
		prompts.push(String(messages[1]!.content));
		return { summary: 's', findings: [] };
	},
} as unknown as LLMProvider;
const routing = { router: { resolveProviderForRole: () => ({ provider: model }) } } as unknown as RoutingSeamContext;

async function promptOf(runtime: TemplateRuntime, absentInputs: readonly AbsentInput[] | undefined, omit = false): Promise<string> {
	const task = { taskId: 't09', template: runtime.templateId, kind: 'leaf', params: {}, produces: ['report'], rationale: 'test' } as unknown as PlannedTask;
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: true, focus: 'refunds', scopeRef: { kind: 'repo', value: '/work/app' }, reasoning: 'test' };
	const args: TemplateExecuteArgs = {
		task, intent, upstreamOutputs: new Map<string, unknown>([['t01', { found: ['pay'] }]]), runId: 'r1',
		...(omit ? {} : { absentInputs }),
	};
	prompts = [];
	const result = await runWithRoutingContext(routing, () => runtime.execute(args));
	assert.ok(result.outputs.has('report'), runtime.templateId);
	assert.equal(prompts.length, 1, runtime.templateId);
	return prompts[0]!;
}

test('each of the five aggregate-report runtimes hands absentInputs to the aggregator', async () => {
	assert.deepEqual(RUNTIMES.map(r => r.templateId), [
		'code.aggregate.report', 'data.aggregate.report', 'docs.aggregate.report', 'generic.aggregate.report', 'infra.aggregate.report',
	]);
	const absent: readonly AbsentInput[] = [
		{ name: 'module-tree', producedBy: 't02', reason: 'runtime-threw: the graph could not be read' },
		{ name: 'connections', producedBy: 't04', reason: 'skipped: its input was not produced' },
		{ name: 'adherence-report', producedBy: null, reason: 'no task of the plan produces this name' },
	];
	const section =
		'\n\nAbsent inputs (NOT available to you):\n' +
		'- module-tree: task t02 should have produced it. Reason: runtime-threw: the graph could not be read\n' +
		'- connections: task t04 should have produced it. Reason: skipped: its input was not produced\n' +
		'- adherence-report: no task of the plan produces it. Reason: no task of the plan produces this name\n\n';

	for (const runtime of RUNTIMES) {
		const id = runtime.templateId;
		// Nothing absent: no section, whether the argument is left out, undefined or empty.
		const none = await promptOf(runtime, undefined, true);
		assert.ok(!none.includes('Absent inputs'), id);
		assert.equal(await promptOf(runtime, undefined), none, id);
		assert.equal(await promptOf(runtime, []), none, id);

		// The list reaches the aggregator unchanged: every entry, in order, whole.
		const some = await promptOf(runtime, absent);
		assert.ok(some.includes(section), `${id}: the three entries, in the order given`);
		// Apart from the section, the prompt is the one without it.
		const at = some.indexOf('\n\nAbsent inputs (NOT available to you):');
		const end = some.indexOf('\n\nCompose the aggregate report.');
		assert.ok(at > 0 && end > at, id);
		assert.equal(some.slice(0, at) + some.slice(end), none, id);
	}
});
