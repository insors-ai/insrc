import '../../orchestrator/__tests__/private-paths.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A broad docs run with an oversized terminal input and a nested aggregate completes (LLD-b9d5c5c40df5a574-s3, task t10).
 * The real docs aggregate runtime, the real plan walk and the real task-record store; the model is a stand-in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { purgeAllTaskOutputs, registerTemplateRuntime, runExecutor, _resetRuntimeRegistryForTests } from '../../executor/index.js';
import type { TemplateExecuteArgs, TemplateRuntime } from '../../executor/types.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import { docsAggregateReportRuntime } from '../docs/aggregate-report.js';
import { concludeRun } from '../../orchestrator/driver.js';
import {
	WHOLE, big, intent, leaf, model, node, plan, respond, routing, runAggregate, runIdOf, task,
} from './aggregate-fixtures.js';

test('a broad docs run with an oversized terminal input and a nested aggregate completes through the real docs aggregate runtime and walker with a final report and its handling', async () => {
	_resetRuntimeRegistryForTests();
	const inventory = (key: string): TemplateRuntime => ({
		templateId: 'demo.leaf',
		execute: async (args: TemplateExecuteArgs) => ({
			outputs: new Map(args.task.produces.map(name => [name, { files: [`docs/${key}.md`], text: `body${args.task.params['dir'] === 'docs/b' ? 1 : 0} ${'x'.repeat(args.task.params['dir'] === 'docs/c' || args.task.params['dir'] === 'docs/d' ? 12_000 : 3_000)}` }])), completeness: WHOLE,
		}),
	});
	registerTemplateRuntime(inventory('x'));
	registerTemplateRuntime(docsAggregateReportRuntime);
	// The nested plan has its own aggregate; the root aggregate reads the nested report and an oversized sibling output.
	const child = node(plan('L', [
		task({ taskId: 't01', params: { dir: 'docs/a' }, produces: ['inventory'] }),
		task({ taskId: 't02', params: { dir: 'docs/b' }, produces: ['inventory'] }),
		task({ taskId: 't03', template: 'docs.aggregate.report', produces: ['report'], consumes: ['inventory'] }),
	]));
	const root = node(plan('L', [
		task({ taskId: 't01', params: { dir: 'docs/c' }, produces: ['inventory'] }),
		task({ taskId: 't02', params: { dir: 'docs/d' }, produces: ['inventory'] }),
		task({ taskId: 't03', template: 'docs.subrun.deep-dive', kind: 'planner', produces: ['deep'] }),
		task({ taskId: 't04', template: 'docs.aggregate.report', produces: ['report'], consumes: ['inventory', 'deep'] }),
	]), new Map([['t03', child]]));
	const runId = runIdOf('docs-run');
	try {
		const run = model(respond, 20_000);
		const executed = await runWithRoutingContext(routing(run), () => runExecutor({ tree: root, intent: intent('L'), runId }));
		assert.equal(executed.root.tasksFailed.length, 0, JSON.stringify(executed.root.tasksFailed));
		const finalReport = executed.root.finalReport as { summary: string; findings: unknown[]; metadata: { handling?: { method: string; parts: number } } };
		assert.ok(finalReport !== undefined, 'a final report is delivered');
		assert.equal(finalReport.metadata.handling?.method, 'partitioned', 'the oversized terminal input was divided');
		assert.ok((finalReport.metadata.handling?.parts ?? 0) >= 2);
		assert.equal(finalReport.summary, 'the executive summary of the whole report');
		// The nested aggregate ran too, and its report is the root's input.
		const nested = executed.children.get('t03')!.root.finalReport as { metadata: { handling?: { method: string } } };
		assert.ok(nested !== undefined);
		assert.ok(['single-pass', 'partitioned'].includes(nested.metadata.handling?.method ?? ''));

		// The same run concluded as the orchestrator does: the delivered final report's head states the handling.
		const concluded = concludeRun(root, executed, { completeness: { complete: true, incomplete: [], failed: [] } });
		assert.equal(concluded.report.completeness.complete, true);
		assert.equal(concluded.report.handling?.method, 'partitioned');
		const head = (concluded.finalReport as { summary: string }).summary.split('\n\n')[0]!.split('\n');
		assert.equal(head[0], 'Complete.');
		assert.match(head[1] ?? '', /^Handling: divided into \d+ parts?/);
		assert.equal((concluded.finalReport as { summary: string }).summary.endsWith('the executive summary of the whole report'), true);
	} finally { purgeAllTaskOutputs(runId); }
});
