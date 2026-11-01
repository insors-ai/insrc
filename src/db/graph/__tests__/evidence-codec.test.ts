/**
 * Epic c2ba6fa6, Story s7, t1 -- the evidence byte of a relationship row. Every
 * value round-trips; an empty value (what every row written before s7 holds),
 * 0x00 and a byte no value uses read 'unknown'; a string that is not a value is
 * stored empty and reported invalid, never refused.
 *
 * Run: npx tsx --test src/db/graph/__tests__/evidence-codec.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodeEvidence, encodeEvidence } from '../codec.js';
import type { RelationEvidence, RelationRead } from '../../../shared/types.js';

const VALUES: readonly RelationEvidence[] = ['unknown', 'extracted', 'inferred', 'chosen', 'model'];

test('s7 t1: every evidence value round-trips through the edge-row codec; unknown is the empty value and the others are one distinct byte', () => {
	const bytes = new Set<number>();
	for (const evidence of VALUES) {
		const { value, valid } = encodeEvidence(evidence);
		assert.equal(valid, true, evidence);
		assert.equal(decodeEvidence(value), evidence);
		if (evidence === 'unknown') assert.equal(value.length, 0);
		else { assert.equal(value.length, 1); bytes.add(value[0]!); }
	}
	assert.equal(bytes.size, 4, 'four distinct bytes');
	assert.deepEqual(encodeEvidence(undefined), { value: Buffer.alloc(0), valid: true }, 'no evidence is stored empty');

	// The read shape names a relationship and its evidence (sc3).
	const read: RelationRead = { from: 'a', kind: 'CALLS', to: 'b', evidence: 'inferred' };
	assert.equal(read.evidence, 'inferred');
});

test('s7 t1: an empty value, 0x00 and a byte no value uses decode to unknown; a string that is not a value encodes empty and is reported invalid', () => {
	assert.equal(decodeEvidence(Buffer.alloc(0)), 'unknown');
	assert.equal(decodeEvidence(undefined), 'unknown');
	assert.equal(decodeEvidence(Buffer.from([0x00])), 'unknown');
	assert.equal(decodeEvidence(Buffer.from([0xff])), 'unknown');
	assert.equal(decodeEvidence(Buffer.from([0x05])), 'unknown');

	const invalid = encodeEvidence('guessed');
	assert.equal(invalid.valid, false);
	assert.equal(invalid.value.length, 0);
	assert.equal(decodeEvidence(invalid.value), 'unknown');
});
