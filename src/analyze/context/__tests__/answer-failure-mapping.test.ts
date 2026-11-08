/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The two places that turn an answer-step failure into a run failure (LLD-b9d5c5c40df5a574-s3, task t12):
 * the daemon's mapping and the plan tree's. Both carry the results and the report, and for a divided call each failed
 * part's kind and cause chain and the upstream inputs, JSON-safe. Pure: no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { _classifyShaperErrorForTest as daemonMapping } from '../../../daemon/analyze-rpc.js';
import type { AnswerReport } from '../../completeness.js';
import { _classifyShaperErrorForTest as planTreeMapping } from '../../orchestrator/driver.js';
import { HandlingBudgetError, ShaperAnswerStepFailedError } from '../driver.js';
import type { AnswerStepFound } from '../driver.js';
import { causeOf } from '../failure-data.js';
import type { PartFailure } from '../failure-data.js';

const report: AnswerReport = {
	completeness: { complete: false, incomplete: [], failed: [{ sourceId: 'answer step / part 2', sourceKind: 'lookup', reason: 'model-failed' }] },
	handling: { method: 'partitioned', parts: 2, notCovered: [{ part: 'part 2', reason: 'model-failed' }], budgets: [] },
};
const found: AnswerStepFound = { results: [{ exploration: { id: 'e1', type: 'search.text', purpose: 'p', params: {} }, output: { type: 'failed' }, cached: false, elapsedMs: 1 }] as never, report };
const mappings = { daemon: daemonMapping, 'plan tree': planTreeMapping } as const;

test('HandlingBudgetError carries results and report through the daemon and plan-tree mappings', () => {
	const err = new HandlingBudgetError('no part of the input fits a call', found);
	for (const [name, map] of Object.entries(mappings)) {
		const failure = map(err);
		assert.equal(failure.code, 'answer-step-failed', name);
		assert.equal(failure.message, err.message, name);
		const data = failure.data as { reason: string; results: unknown[]; report: AnswerReport };
		assert.equal(data.reason, 'input-does-not-fit', name);
		assert.equal(data.results.length, 1, name);
		assert.equal(data.report.handling?.method, 'partitioned', name);
		assert.equal(data.report.answerFailure !== undefined, true, `${name}: the report says the answer step failed`);
	}
});

test('both mappings carry partFailures with distinct outer and inner cause messages through a JSON round trip, and a failure without partFailures maps as before', () => {
	const parts: PartFailure[] = [
		{ part: 'part 1: docs/a', kind: 'call-failed', reason: 'claude exited with 1.', cause: causeOf(new Error('claude exited with 1.', { cause: new Error('socket closed') })) },
		{ part: 'part 2: docs/b', kind: 'invalid-reply', reason: 'reply failed validation', cause: causeOf(new Error('reply failed validation', { cause: new Error('Unexpected token s in JSON')})) },
		{ part: 'part 3: docs/c', kind: 'unadmittable', reason: 'the envelope is too large' },
	];
	const upstream = [{ taskId: 't01', template: 'docs.discovery.inventory', params: { dir: 'docs' }, value: { files: ['docs/a.md'] } }];
	const err = new ShaperAnswerStepFailedError('model-failed', 'three parts were not covered', found, { partFailures: parts, upstream });
	for (const [name, map] of Object.entries(mappings)) {
		const failure = map(err);
		const data = JSON.parse(JSON.stringify(failure.data)) as { partFailures: PartFailure[]; upstream: typeof upstream; reason: string };
		assert.equal(data.reason, 'model-failed', name);
		assert.deepEqual(data.partFailures.map(p => [p.part, p.kind]), [['part 1: docs/a', 'call-failed'], ['part 2: docs/b', 'invalid-reply'], ['part 3: docs/c', 'unadmittable']], name);
		// Distinct outer and inner messages, part by part.
		assert.deepEqual(data.partFailures.map(p => [p.cause?.message, p.cause?.cause?.message]), [
			['claude exited with 1.', 'socket closed'], ['reply failed validation', 'Unexpected token s in JSON'], [undefined, undefined],
		], name);
		assert.deepEqual(data.upstream, upstream, name);
	}
	assert.deepEqual(daemonMapping(err).data, planTreeMapping(err).data, 'the two mappings agree');

	// A failure without partFailures (the lookup path) maps exactly as before: the same three fields, nothing added.
	const plain = new ShaperAnswerStepFailedError('invalid-answer', 'the answer-writing output was invalid', found);
	for (const [name, map] of Object.entries(mappings)) {
		const failure = map(plain);
		assert.deepEqual(Object.keys(failure.data as object).sort(), ['report', 'reason', 'results'].sort(), name);
		assert.equal('partFailures' in (failure.data as object), false, name);
		assert.equal('upstream' in (failure.data as object), false, name);
	}
});
