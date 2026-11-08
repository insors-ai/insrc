import '../../orchestrator/__tests__/private-paths.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * An aggregate failure is kept whole in the stored task record (LLD-b9d5c5c40df5a574-s3, task t10).
 * The real docs aggregate runtime, the real plan walk and the real task-record store; the model is a stand-in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ModelCallFailedError, ModelResponseShapeError } from '../../../agent/providers/model-call-error.js';
import { readTaskOutput } from '../../executor/cache.js';
import { purgeAllTaskOutputs, registerTemplateRuntime, runExecutor, _resetRuntimeRegistryForTests } from '../../executor/index.js';
import type { UpstreamOutput } from '../../executor/types.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import { docsAggregateReportRuntime } from '../docs/aggregate-report.js';
import {
	WHOLE, big, intent, leaf, model, node, plan, respond, routing, runAggregate, runIdOf, task,
} from './aggregate-fixtures.js';

test('real aggregator, walker and stored task record keep failureData, original cause, upstream values with producer identities and each failed part\'s cause chain', async () => {
	// A divided call in which every part's call fails: typed, with the upstream values and each part's cause chain.
	const runId = runIdOf('typed');
	try {
		const value = { files: ['docs/a.md'], text: `body0 ${'x'.repeat(30_000)}` };
		const { record, stored } = await runAggregate('L', value, model(() => new ModelCallFailedError('claude exited with 1.', { cause: new Error('socket closed') }), 20_000), runId);
		assert.equal(record.status, 'failed');
		const data = record.data as { kind: string; reason: string; upstream: UpstreamOutput[]; partFailures: Array<{ kind: string; cause?: { message: string; cause?: { message: string } } }>; found: { results: unknown[] } };
		assert.equal(data.kind, 'answer-step');
		assert.equal(data.reason, 'model-failed');
		assert.deepEqual(data.found.results, []);
		assert.deepEqual(data.upstream.map(u => [u.taskId, u.template, u.params]), [['t01', 'demo.leaf', { dir: 'docs' }]]);
		assert.deepEqual(data.upstream[0]?.value, value, 'the upstream value is kept whole');
		assert.ok(data.partFailures.length >= 1);
		for (const p of data.partFailures) {
			assert.equal(p.kind, 'call-failed');
			assert.match(p.cause?.message ?? '', /claude exited with 1\./);
			assert.equal(p.cause?.cause?.message, 'socket closed', 'the outer and the inner message of each part');
		}
		// The record is stored as JSON and read back unchanged.
		assert.deepEqual(stored?.data, JSON.parse(JSON.stringify(record.data)));
		assert.equal(stored?.status, 'failed');
	} finally { purgeAllTaskOutputs(runId); }

	// A single pass: the prefixed error is the record's error, and the data keeps the original as the cause.
	const single = runIdOf('single');
	try {
		const failure = new ModelCallFailedError('vibe exited with 1.', { cause: new Error('connection reset') });
		const { record, stored } = await runAggregate('S', { files: ['a.md'] }, model(() => failure), single);
		assert.match(record.error ?? '', /aggregator-llm-unavailable: /);
		const data = record.data as { kind: string; name: string; message: string; cause?: { name: string; message: string; cause?: { message: string } } };
		assert.equal(data.kind, 'error');
		assert.match(data.message, /^aggregator-llm-unavailable: /);
		assert.match(data.cause?.message ?? '', /vibe exited with 1\./, 'the original error is the cause');
		assert.equal(data.cause?.cause?.message, 'connection reset');
		assert.deepEqual(stored?.data, JSON.parse(JSON.stringify(record.data)));
	} finally { purgeAllTaskOutputs(single); }

	// Every reply invalid on a divided call: the reason is kept as invalid-answer, with the parts' causes.
	const invalidId = runIdOf('invalid');
	try {
		const { record } = await runAggregate('L', { text: `body0 ${'x'.repeat(30_000)}` }, model(() => new ModelResponseShapeError('reply failed validation', ['not JSON']), 20_000), invalidId);
		const data = record.data as { reason: string; partFailures: Array<{ kind: string }> };
		assert.equal(data.reason, 'invalid-answer');
		assert.ok(data.partFailures.every(p => p.kind === 'invalid-reply'));
	} finally { purgeAllTaskOutputs(invalidId); }

	// An upstream output whose own envelope leaves no room: nothing can be admitted, the reason is input-does-not-fit and nothing is sent.
	const budgetId = runIdOf('budget');
	try {
		_resetRuntimeRegistryForTests();
		registerTemplateRuntime(leaf({ text: 'x'.repeat(50) }));
		registerTemplateRuntime(docsAggregateReportRuntime);
		const tree = node(plan('L', [
			task({ taskId: 't01', params: { blob: 'p'.repeat(15_000) }, produces: ['inventory'] }),
			task({ taskId: 't02', template: 'docs.aggregate.report', produces: ['report'], consumes: ['inventory'] }),
		]));
		const run = model(respond, 20_000);
		const executed = await runWithRoutingContext(routing(run), () => runExecutor({ tree, intent: intent('L'), runId: budgetId }));
		const data = executed.root.perTask.get('t02')?.data as { reason: string; upstream: Array<{ params: { blob: string } }> };
		assert.equal(data.reason, 'input-does-not-fit');
		assert.equal(data.upstream[0]?.params.blob.length, 15_000, 'the upstream inputs are kept whole');
		assert.equal(run.prompts.length, 0);
	} finally { purgeAllTaskOutputs(budgetId); }
});

