import '../../orchestrator/__tests__/private-paths.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The aggregate-report task on the shared helper (LLD-b9d5c5c40df5a574-s3, task t10): a report written in parts keeps the absent-input section in every call.
 * The real docs aggregate runtime, the real plan walk and the real task-record store; the model is a stand-in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ShaperAnswerStepFailedError } from '../../context/driver.js';
import type { AbsentInput, UpstreamOutput } from '../../executor/types.js';
import { runAggregator } from '../shared/aggregator.js';
import {
	WHOLE, big, intent, leaf, model, node, plan, respond, routing, runAggregate, runIdOf, task,
} from './aggregate-fixtures.js';

test('aggregator divides an oversized input and keeps the absent-input section in every part and combine call', async () => {
	const absentInputs: AbsentInput[] = [{ name: 'adherence', producedBy: 't09', reason: `runtime-threw: ${'the graph could not be read '.repeat(40)}` }];
	const upstream = new Map<string, UpstreamOutput[]>([['inventory', big(6, 4_500)]]);
	const run = model(respond, 20_000);
	const report = await runAggregator({
		promptRelPath: 'prompts/analyze/docs.aggregate.system.md', target: 'docs', scope: 'L', runId: 'r', upstreamOutputs: upstream, absentInputs, provider: run.provider,
	});
	assert.equal(report.metadata.handling?.method, 'partitioned');
	assert.ok((report.metadata.handling?.parts ?? 0) >= 2);
	assert.ok(run.prompts.length >= 3, 'parts and at least one combine');
	// Every call, part or combine, carries the absent-input section whole, and none is over the limit.
	for (const prompt of run.prompts) {
		assert.ok(prompt.includes('Absent inputs (NOT available to you):'), prompt.slice(0, 80));
		assert.ok(prompt.includes(absentInputs[0]!.reason));
		assert.ok(prompt.length <= 20_000 + 8_000, 'the prompt fits the call (the system prompt is the rest)');
	}
	assert.ok(run.prompts.some(p => p.includes('Part summaries')), 'a combine call was made');
	// The findings are the parts', in ordinal order; the summary is the combine's.
	assert.equal(report.summary, 'the executive summary of the whole report');
	assert.ok(report.findings.length >= 2);
	assert.equal(report.metadata.tasksAnalyzed, 6);

	// An absent section so large it leaves no room for a section: counted in the admission, so the call fails typed, unsent.
	const huge: AbsentInput[] = [{ name: 'x', producedBy: null, reason: 'r'.repeat(20_000) }];
	const none = model(respond, 20_000);
	const err = await runAggregator({
		promptRelPath: 'prompts/analyze/docs.aggregate.system.md', target: 'docs', scope: 'L', runId: 'r', upstreamOutputs: upstream, absentInputs: huge, provider: none.provider,
	}).then(() => undefined, (e: unknown) => e);
	assert.ok(err instanceof ShaperAnswerStepFailedError);
	assert.equal(err.reason, 'input-does-not-fit');
	assert.equal(none.prompts.length, 0, 'nothing that does not fit is sent');
});

