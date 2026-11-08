/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The handling report against the contract (LLD-b9d5c5c40df5a574-s3, task t1):
 * the HLD's sc4 sketch plus the additive fields, and the bundle schema's
 * open handling object.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseHandling } from '../completeness.js';
import type { AnswerReport, HandlingReport } from '../completeness.js';
import { ANALYZE_CONTEXT_BUNDLE_SCHEMA } from '../context/schema.js';

test('HandlingReport against the sc4 sketch plus additive fields, bundle schema open handling object still valid', () => {
	// The sc4 sketch: method, parts, partitionedBy (optional), notCovered.
	const sketch = {
		method: 'partitioned', parts: 2, partitionedBy: 'section',
		notCovered: [{ part: 'part 1', reason: 'r' }],
	};
	const read = parseHandling(sketch);
	assert.equal(read?.method, 'partitioned');
	assert.equal(read?.partitionedBy, 'section');
	assert.deepEqual(read?.budgets, []);

	// The additive fields, with and without trigger, budgets in their own units.
	const withTrigger: HandlingReport = {
		method: 'partitioned', parts: 2, partitionedBy: 'mixed', notCovered: [], trigger: 'both', combineStages: 2,
		budgets: [
			{ unit: 'chars', limit: 44000, source: 'provider', basis: 'declared', inputSize: 1 },
			{ unit: 'bytes', limit: 10240, source: 'default', basis: 'default', inputSize: 2 },
		],
	};
	const without: HandlingReport = { method: 'single-pass', parts: 1, notCovered: [], budgets: [] };
	assert.deepEqual(parseHandling(JSON.parse(JSON.stringify(withTrigger))), withTrigger);
	assert.deepEqual(parseHandling(JSON.parse(JSON.stringify(without))), without);

	// AnswerReport.handling is typed (this line fails to compile otherwise).
	const typed: AnswerReport = { completeness: { complete: true, incomplete: [], failed: [] }, handling: withTrigger };
	assert.equal(typed.handling?.trigger, 'both');

	// The bundle schema leaves handling open: it accepts any object.
	const schema = ANALYZE_CONTEXT_BUNDLE_SCHEMA as unknown as { properties: { report: { properties: Record<string, unknown> } } };
	assert.deepEqual(schema.properties.report.properties['handling'], {});
});
