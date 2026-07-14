/**
 * Tests for daemon/db/drivers/shape-common.ts -- recursive shape
 * inference shared across KV / RDBMS-JSON / file families.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { inferShape } from '../drivers/shape-common.js';

describe('inferShape', () => {
	it('reports types + nullability + frequency across a batch', () => {
		const report = inferShape([
			{ name: 'a', age: 10 },
			{ name: 'b', age: null },
			{ name: 'c', age: 20, nick: 'x' },
		]);
		const byPath = new Map(report.fields.map(f => [f.path, f]));
		assert.deepEqual(byPath.get('name')?.types, ['string']);
		assert.equal(byPath.get('name')?.nullable, false);
		assert.equal(byPath.get('name')?.frequency, 1);

		assert.deepEqual([...(byPath.get('age')?.types ?? [])].sort(), ['null', 'number']);
		assert.equal(byPath.get('age')?.nullable, true);

		assert.equal(byPath.get('nick')?.frequency, 1 / 3);
	});

	it('collapses arrays onto the []-suffixed path', () => {
		const report = inferShape([
			{ tags: ['a', 'b'] },
			{ tags: ['c'] },
		]);
		const byPath = new Map(report.fields.map(f => [f.path, f]));
		assert.ok(byPath.has('tags.[]'));
		assert.deepEqual(byPath.get('tags.[]')?.types, ['string']);
	});

	it('recognises binary values via Uint8Array', () => {
		const report = inferShape([{ data: new Uint8Array([1, 2, 3]) }]);
		const byPath = new Map(report.fields.map(f => [f.path, f]));
		assert.deepEqual(byPath.get('data')?.types, ['binary']);
	});
});
