/**
 * The five aggregate-report runtimes hand absentInputs to the aggregator
 * (Story s7, task t9). A stand-in model keeps the prompt each one sends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { LLMProvider } from '../../../shared/types.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import type { AbsentInput, PlannedTask, TemplateExecuteArgs, TemplateRuntime, UpstreamOutput } from '../../executor/types.js';
import { codeAggregateReportRuntime } from '../code/aggregate-report.js';
import { dataAggregateReportRuntime } from '../data/aggregate-report.js';
import { docsAggregateReportRuntime } from '../docs/aggregate-report.js';
import { genericAggregateReportRuntime } from '../generic/aggregate-report.js';
import { infraAggregateReportRuntime } from '../infra/aggregate-report.js';
import { _renderUpstreamSectionForTest } from '../shared/aggregator.js';

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
		task, intent, upstreamOutputs: new Map([['t01', [{ taskId: 't01', template: 'demo.ok', params: {}, value: { found: ['pay'] } }]]]), runId: 'r1',
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

test('each of the five aggregate-report runtimes hands every output of a name to the shared aggregate code, and the count of tasks analysed is the number of outputs', async () => {
	const upstreamOutputs = new Map<string, UpstreamOutput[]>([
		['functional-surface', [
			{ taskId: 't02', template: 'code.surface.functional', params: { module: 'src/pay' },    value: { symbols: ['settle'] } },
			{ taskId: 't03', template: 'code.surface.functional', params: { module: 'src/refund' }, value: { symbols: ['refund'] } },
			{ taskId: 't04', template: 'code.surface.functional', params: { module: 'src/ledger' }, value: { symbols: ['post'] } },
		]],
		['modules', [{ taskId: 't01', template: 'code.discovery.modules', params: {}, value: ['pay', 'refund', 'ledger'] }]],
	]);
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: true, focus: 'refunds', scopeRef: { kind: 'repo', value: '/work/app' }, reasoning: 'test' };
	for (const runtime of RUNTIMES) {
		const id = runtime.templateId;
		const task = { taskId: 't09', template: id, kind: 'leaf', params: {}, produces: ['report'], rationale: 'test' } as unknown as PlannedTask;
		prompts = [];
		const result = await runWithRoutingContext(routing, () => runtime.execute({ task, intent, upstreamOutputs, runId: 'r1' }));
		assert.equal(prompts.length, 1, id);
		const prompt = prompts[0]!;
		// Every output of the name is in the prompt, each under its own task, in the order given.
		const at = ['pay', 'refund', 'ledger'].map((dir, i) => prompt.indexOf(
			`#### functional-surface from task t0${i + 2} (code.surface.functional)\nparams: {"module":"src/${dir}"}\n\`\`\`json\n{\n  "symbols": [\n    "${dir === 'pay' ? 'settle' : dir === 'ledger' ? 'post' : 'refund'}"\n  ]\n}\n\`\`\``));
		assert.ok(at.every(i => i > 0), `${id}: each of the three outputs, whole: ${at.join(',')}`);
		assert.deepEqual([...at].sort((a, b) => a - b), at, `${id}: in the order given`);
		assert.ok(prompt.includes('### functional-surface (3 outputs, one per task)\n\n#### functional-surface from task t02 '), id);
		assert.ok(prompt.includes('### modules\n```json\n['), id);
		// The count is of outputs, not of names.
		const report = result.outputs.get('report') as { metadata: { tasksAnalyzed: number } };
		assert.equal(report.metadata.tasksAnalyzed, 4, id);
	}
});

test('each of the five aggregate prompts describes the block as it is rendered and no longer says one section per task id', () => {
	const prompts = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'prompts', 'analyze');
	// The headings as the code renders them, with the placeholders the prompts use in place of the values.
	const one = _renderUpstreamSectionForTest(new Map([['<output name>', [{ taskId: '<taskId>', template: '<template>', params: {}, value: 1 }]]]));
	const several = _renderUpstreamSectionForTest(new Map([['<output name>', [
		{ taskId: '<taskId>', template: '<template>', params: {}, value: 1 },
		{ taskId: '<taskId>', template: '<template>', params: {}, value: 2 },
	]]]));
	const [title, nameHeading] = one.split('\n\n')[0] === 'Upstream task outputs:' ? ['Upstream task outputs:', one.split('\n')[2]!] : ['', ''];
	const [, countHeading, sub] = several.split('\n\n');
	const subHeading = sub!.split('\n')[0]!;
	const paramsLine = sub!.split('\n')[1]!;
	assert.deepEqual([title, nameHeading, countHeading, subHeading, paramsLine], [
		'Upstream task outputs:', '### <output name>', '### <output name> (2 outputs, one per task)',
		'#### <output name> from task <taskId> (<template>)', 'params: {}',
	]);

	for (const family of ['code', 'data', 'docs', 'generic', 'infra']) {
		// Whitespace is folded: four of the five files wrap their lines.
		const text = readFileSync(join(prompts, `${family}.aggregate.system.md`), 'utf8').replace(/\s+/g, ' ');
		assert.ok(!text.includes('### <taskId>'), `${family}: no longer one section per task id`);
		assert.ok(!text.includes('section per prior task'), family);
		assert.ok(text.includes(`A block titled \`${title}\` with one \`${nameHeading}\` section per output name.`), `${family}: the name section`);
		assert.ok(text.includes(`\`${countHeading.replace('2', '<n>')}\``), `${family}: the heading of a name several tasks produced`);
		assert.ok(text.includes(`one \`${subHeading}\` sub-section per task`), `${family}: the per-task sub-section`);
		assert.ok(text.includes(`a \`${paramsLine.slice(0, 'params:'.length)}\` line`), `${family}: the params line`);
		assert.ok(text.includes('The report must cover every sub-section'), family);
	}
});
