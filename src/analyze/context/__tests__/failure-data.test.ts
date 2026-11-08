/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What an answer-writing failure keeps (LLD-b9d5c5c40df5a574-s3, task t2).
 * Pure: no store, no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AnswerReport, HandlingReport } from '../../completeness.js';
import { HandlingBudgetError, ShaperAnswerStepFailedError } from '../driver.js';
import type { AnswerStepFound } from '../driver.js';
import { causeOf, failureData } from '../failure-data.js';
import type { AggregateInputRecord, PartFailure } from '../failure-data.js';

const handling: HandlingReport = {
	method: 'partitioned', parts: 2, partitionedBy: 'directory', notCovered: [{ part: 'part 1', reason: 'r' }], budgets: [],
};
const report: AnswerReport = { completeness: { complete: true, incomplete: [], failed: [] }, handling };
const found: AnswerStepFound = { results: [], report };

const upstream: AggregateInputRecord[] = [
	{ taskId: 't2', template: 'doc.constraint.enumerate', params: { path: 'docs/' }, value: { constraints: ['a'] } },
	{ taskId: 't1', template: 'concept.resolve', params: {}, value: { anchor: 'x' } },
];

function chain(depth: number): Error {
	let err: Error = new Error(`level ${depth}`);
	for (let i = depth - 1; i >= 1; i--) err = new Error(`level ${i}`, { cause: err });
	return err;
}

test('typed and plain shapes, 3-level cause bound, non-Error cause as string, JSON round trip, upstream and partFailures kept in order', () => {
	const parts: PartFailure[] = [
		{ part: 'part 2', kind: 'invalid-reply', reason: 'bad json', cause: causeOf(chain(2)) },
		{ part: 'part 1', kind: 'call-failed', reason: 'vibe exited with 1.', cause: causeOf(new Error('outer', { cause: new Error('inner') })) },
	];
	const typed = new ShaperAnswerStepFailedError('model-failed', 'all parts', found, { upstream, partFailures: parts });
	const data = failureData(typed);
	assert.equal(data.kind, 'answer-step');
	if (data.kind !== 'answer-step') return;
	assert.equal(data.reason, 'model-failed');
	assert.deepEqual(data.upstream.map(u => u.taskId), ['t2', 't1']);
	assert.deepEqual(data.partFailures.map(p => p.part), ['part 2', 'part 1']);
	assert.equal(data.partFailures[1]?.cause?.message, 'outer');
	assert.equal(data.partFailures[1]?.cause?.cause?.message, 'inner');
	assert.deepEqual(data.handling, handling);
	assert.match(data.found.report.answerFailure ?? '', /answer writing failed/);

	// HandlingBudgetError is the same shape with its own reason.
	const budget = failureData(new HandlingBudgetError('no room', found));
	assert.equal(budget.kind === 'answer-step' ? budget.reason : '', 'input-does-not-fit');

	// A plain Error: name, message, cause nested at most 3 levels.
	const plain = failureData(chain(6));
	assert.equal(plain.kind, 'error');
	if (plain.kind !== 'error') return;
	assert.equal(plain.message, 'level 1');
	assert.equal(plain.cause?.message, 'level 2');
	assert.equal(plain.cause?.cause?.message, 'level 3');
	assert.equal(plain.cause?.cause?.cause?.cause, undefined);
	assert.equal(plain.cause?.cause?.cause?.message, 'level 4');

	// A non-Error cause is recorded as its string.
	const odd = failureData(new Error('top', { cause: 'plain text' }));
	assert.deepEqual(odd.kind === 'error' ? odd.cause : undefined, { name: 'non-error', message: 'plain text' });
	assert.deepEqual(failureData('thrown string'), { kind: 'error', name: 'non-error', message: 'thrown string' });

	// JSON round trip: no Error, function or cycle survives, and nothing is lost.
	const cyclic: Record<string, unknown> = { name: 'loop' };
	cyclic['self'] = cyclic;
	const withCycle = new ShaperAnswerStepFailedError('invalid-answer', 'd', found, {
		upstream: [{ taskId: 't9', template: 'x', params: { cyclic }, value: { fn: () => 1, err: new Error('boom') } }],
		partFailures: parts,
	});
	for (const d of [data, plain, odd, failureData(withCycle)]) {
		const text = JSON.stringify(d);
		assert.deepEqual(JSON.parse(text), d);
	}
});
