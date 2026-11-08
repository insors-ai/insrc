/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The handling report in the answer report and at the head of an answer
 * (LLD-b9d5c5c40df5a574-s3, task t1). Pure functions: no store, no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	applyHandling, mergeAnswerReports, mergeHandling, parseHandling, renderReportHead,
} from '../completeness.js';
import type { AnswerReport, HandlingBudget, HandlingReport } from '../completeness.js';

const BYTES: HandlingBudget = { unit: 'bytes', limit: 10240, source: 'context-window', basis: 'bytes-bound', inputSize: 12000 };
const CHARS: HandlingBudget = { unit: 'chars', limit: 44000, source: 'provider', basis: 'declared', inputSize: 50000 };

const single: HandlingReport = { method: 'single-pass', parts: 1, notCovered: [], budgets: [BYTES] };
const divided: HandlingReport = {
	method: 'partitioned', parts: 3, partitionedBy: 'directory', trigger: 'fit', combineStages: 1,
	notCovered: [{ part: 'part 2: docs/a', reason: 'model-failed' }], budgets: [BYTES],
};

function report(extra: Partial<AnswerReport> = {}): AnswerReport {
	return { completeness: { complete: true, incomplete: [], failed: [] }, ...extra };
}

test('parseHandling reads {} and malformed values as absent and accepts a record with and without trigger', () => {
	assert.equal(parseHandling({}), undefined);
	assert.equal(parseHandling(undefined), undefined);
	assert.equal(parseHandling('x'), undefined);
	assert.equal(parseHandling([]), undefined);
	assert.equal(parseHandling({ ...single, parts: 'one' }), undefined);
	assert.equal(parseHandling({ ...single, notCovered: [{ part: 1 }] }), undefined);
	assert.equal(parseHandling({ ...single, budgets: [{ unit: 'tokens' }] }), undefined);
	assert.equal(parseHandling({ ...divided, trigger: 'never' }), undefined);
	assert.equal(parseHandling({ ...single, parts: Number.NaN }), undefined);
	assert.equal(parseHandling({ ...single, parts: -1 }), undefined);
	assert.equal(parseHandling({ ...divided, combineStages: Number.POSITIVE_INFINITY }), undefined);
	assert.equal(parseHandling({ ...single, budgets: [{ ...BYTES, limit: Number.NaN }] }), undefined);
	assert.equal(parseHandling({ ...single, budgets: [{ ...BYTES, inputSize: Number.POSITIVE_INFINITY }] }), undefined);
	assert.deepEqual(parseHandling(single), single);
	assert.deepEqual(parseHandling(divided), divided);
	assert.deepEqual(parseHandling(JSON.parse(JSON.stringify(divided))), divided);
});

test('mergeHandling keeps units apart, de-duplicates budgets, sums combineStages, gives \'mixed\' and keeps plan-qualified part ids distinct', () => {
	assert.equal(mergeHandling(undefined, undefined), undefined);
	assert.equal(mergeHandling(single, undefined), single);
	assert.equal(mergeHandling(undefined, divided), divided);

	assert.deepEqual(mergeHandling(divided, undefined, 'plan a / ')?.notCovered, [{ part: 'plan a / part 2: docs/a', reason: 'model-failed' }]);
	assert.equal(mergeHandling(undefined, divided, 'plan a / ')?.notCovered[0]?.part, 'part 2: docs/a');

	const root = mergeHandling(single, divided);
	assert.equal(root?.method, 'partitioned');
	assert.equal(root?.parts, 4);
	assert.equal(root?.partitionedBy, 'directory');

	const other: HandlingReport = {
		...divided, partitionedBy: 'file', combineStages: 2, trigger: 'size',
		budgets: [{ ...BYTES, inputSize: 20000 }, CHARS],
	};
	const merged = mergeHandling(divided, other, 'plan a / ');
	assert.equal(merged?.partitionedBy, 'mixed');
	assert.equal(merged?.combineStages, 3);
	assert.equal(merged?.trigger, 'both');
	assert.equal(merged?.budgets.length, 2);
	assert.equal(merged?.budgets.find(b => b.unit === 'bytes')?.inputSize, 20000);
	assert.ok(merged?.budgets.some(b => b.unit === 'chars' && b.limit === 44000));
	assert.deepEqual(merged?.notCovered.map(n => n.part), ['plan a / part 2: docs/a', 'part 2: docs/a']);
});

test('applyHandling sets complete false, adds one \'answer step / <part id>\' note per uncovered part and does not mutate its input', () => {
	const input = report();
	const frozen = JSON.stringify(input);
	const out = applyHandling(input, divided);
	assert.equal(JSON.stringify(input), frozen);
	assert.equal(out.completeness.complete, false);
	assert.deepEqual(out.completeness.incomplete, [
		{ sourceId: 'answer step / part 2: docs/a', sourceKind: 'lookup', reason: 'model-failed' },
	]);
	assert.deepEqual(out.handling, divided);

	const kept = applyHandling(input, single);
	assert.equal(kept.completeness.complete, true);
	assert.equal(kept.completeness.incomplete.length, 0);
	assert.deepEqual(kept.handling, single);

	const was = applyHandling(report({ completeness: { complete: false, incomplete: [], failed: [] } }), single);
	assert.equal(was.completeness.complete, false);

	const combine = applyHandling(input, { ...divided, notCovered: [{ part: 'combine', reason: 'not admitted' }] });
	assert.equal(combine.completeness.complete, false);
	assert.equal(combine.completeness.incomplete[0]?.sourceId, 'answer step / combine');
});

test('renderReportHead is unchanged without handling and adds one line with it; mergeAnswerReports keeps its binary signature', () => {
	const bare = report();
	assert.equal(renderReportHead(bare).split('\n').length, 1);
	assert.equal(renderReportHead(report({ handling: {} as never })), renderReportHead(bare));

	const withHandling = renderReportHead(report({ handling: divided })).split('\n');
	assert.equal(withHandling.length, 2);
	const line = withHandling[1] ?? '';
	assert.match(line, /divided into 3 parts by directory \(fit\)/);
	assert.match(line, /10240 bytes/);
	assert.match(line, /Not covered: part 2: docs\/a \(model-failed\)/);
	assert.match(renderReportHead(report({ handling: single })), /single pass/);
	const multiline = { ...divided, notCovered: [{ part: 'part\n2:\tdocs/a', reason: 'model\nfailed' }] };
	const lines = renderReportHead(report({ handling: multiline })).split('\n');
	assert.equal(lines.length, 2);
	assert.match(lines[1] ?? '', /Not covered: part 2: docs\/a \(model failed\)/);

	const merged = mergeAnswerReports(report({ handling: single }), report({ handling: divided }), 'root / ');
	assert.equal(merged.handling?.parts, 4);
	assert.equal(merged.handling?.method, 'partitioned');
	const noHandling = mergeAnswerReports(bare, bare);
	assert.equal('handling' in noHandling, false);
	assert.equal(mergeAnswerReports.length, 2); // the third parameter has a default
});
