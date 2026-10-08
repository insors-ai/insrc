/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A request whose answer step failed after its lookups ran ends with
 * 'answer-step-failed'. Three callers pass what the lookups found on: the
 * daemon's response, the one-shot tool's message and the workflow runner's
 * step failure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCompleteness, renderCompletenessLine } from '../../analyze/completeness.js';
import { ShaperAnswerStepFailedError, ShaperLlmUnavailableError } from '../../analyze/context/driver.js';
import { reportFromLookups } from '../../analyze/explore/answer-report.js';
import type { ExecutedExploration } from '../../analyze/explore/types.js';
import { renderAnalyzeFailure } from '../../mcp/bundle-md.js';
import { _invokeForTest as invoke, type AnalyzeRpcResponse } from '../analyze-rpc.js';
import { AnalyzeGroundingFailedError, _groundingForTest as groundingFor } from '../workflow-rpc.js';

const RESULTS = [
	{
		exploration: { id: 'e1', type: 'search.text', purpose: 'p', params: {} },
		output: {
			type: 'search.text',
			completeness: buildCompleteness({
				returned: 30, basis: 'text-search',
				limited: [{ what: 'hits', limit: 30, scope: 'overall', reason: 'the search stops at 30 hits' }],
			}),
		},
		cached: false, elapsedMs: 0,
	},
	{
		exploration: { id: 'e2', type: 'symbol.locate', purpose: 'p', params: {} },
		output: { type: 'failed', requested: 'symbol.locate', errorCode: 'runtime-error', message: 'the graph store is closed' },
		cached: false, elapsedMs: 0,
	},
] as unknown as readonly ExecutedExploration[];

const FAILED = new ShaperAnswerStepFailedError('model-failed', 'codex exited with 2', { results: RESULTS, report: reportFromLookups(RESULTS) });

/** The run handler's response for a request whose answer step failed. */
async function failedResponse(err: Error = FAILED): Promise<Extract<AnalyzeRpcResponse, { ok: false }>> {
	const res = await invoke(async () => { throw err; }, 'run', 'r1');
	assert.equal(res.ok, false);
	return res as Extract<AnalyzeRpcResponse, { ok: false }>;
}

test("the daemon's error payload, the one-shot tool's message and the workflow runner's step failure carry the report and the reason", async () => {
	// The daemon's response.
	const res = await failedResponse();
	assert.equal(res.error.code, 'answer-step-failed');
	assert.equal(res.error.data?.['reason'], 'model-failed');
	assert.equal(res.error.data?.['results'], RESULTS);
	assert.deepEqual(res.error.data?.['report'], FAILED.found.report);
	// It crosses the socket as JSON with nothing lost.
	const wire = JSON.parse(JSON.stringify(res)) as typeof res;
	assert.deepEqual(wire.error.data?.['report'], FAILED.found.report);
	assert.equal((wire.error.data?.['results'] as unknown[]).length, 2);

	const line = renderCompletenessLine(FAILED.found.report);
	assert.match(line, /^Incomplete: the answer could not be written \(the model call for answer writing failed: codex exited with 2\)/);
	assert.match(line, /search\.text \[e1\]/);
	assert.match(line, /symbol\.locate \[e2\]/);

	// The one-shot tool: the completeness line, the reason, then the code and message.
	const text = renderAnalyzeFailure(wire.error);
	assert.deepEqual(text.split('\n\n'), [
		line,
		'The answer step failed: model-failed.',
		`analyze.context.buildRun failed: answer-step-failed -- ${FAILED.message}`,
	]);

	// The workflow runner: the step fails with the cause and the report.
	await assert.rejects(
		() => groundingFor('context.assemble', { runId: 'r1' }, async () => res),
		(err: unknown) => {
			assert.ok(err instanceof AnalyzeGroundingFailedError, `got ${(err as Error).name}`);
			assert.equal(err.code, 'answer-step-failed');
			assert.equal(err.reason, 'model-failed');
			assert.deepEqual(err.report, FAILED.found.report);
			assert.equal(err.message.split('\n')[0], line);
			assert.match(err.message, /analyze grounding failed for step 'context\.assemble' \(answer-step-failed\): /);
			return true;
		},
	);
});

test('a failure with no report is passed on as before: its code and message, and nothing about completeness', async () => {
	const planning = new ShaperLlmUnavailableError('claude exited with 1', 'planning');
	const res = await failedResponse(planning);
	assert.deepEqual(res.error, { code: 'shaper-llm-unavailable', message: planning.message });

	assert.equal(renderAnalyzeFailure(res.error), `analyze.context.buildRun failed: shaper-llm-unavailable -- ${planning.message}`);

	await assert.rejects(
		() => groundingFor('scope.assess', { runId: 'r1' }, async () => res),
		(err: unknown) => {
			assert.ok(err instanceof AnalyzeGroundingFailedError);
			assert.equal(err.code, 'shaper-llm-unavailable');
			assert.equal(err.reason, undefined);
			assert.equal(err.report, undefined);
			assert.equal(err.message, `workflow.run: analyze grounding failed for step 'scope.assess' (shaper-llm-unavailable): ${planning.message}`);
			return true;
		},
	);
});

test('a grounded step gets the flattened findings of a successful request', async () => {
	const bundle = { system: 'sys', focus: 'foc', summary: 'sum', structure: '', surface: '', artefacts: 'art', upstream: '' };
	const text = await groundingFor('context.assemble', { runId: 'r1' }, async () => ({ ok: true, bundle }) as AnalyzeRpcResponse);
	assert.equal(text, 'sys\n\nfoc\n\nsum\n\nart');
});
