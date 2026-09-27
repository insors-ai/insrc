/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the FR-id minter/parser (sc1 — S001, Task t1): mintFrId /
 * parseFrId / isFrId in `../id.ts`, which mirror the story/task sequence scheme.
 *
 * Run: npx tsx --test src/workflow/__tests__/fr-id.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mintFrId, parseFrId, isFrId } from '../id.js';

const EPIC = '185807ba9a6b35d3';
const ISO  = '2026-07-17T07:42:28.275Z';
// The epic segment these inputs derive to (E<YYYYMMDD><hash8>).
const SEG  = 'E20260717185807ba';

test('mintFrId emits the doc-level canonical form', () => {
	assert.equal(mintFrId(EPIC, ISO, 1), `${SEG}:FR001`);
	assert.equal(mintFrId(EPIC, ISO, 42), `${SEG}:FR042`);
});

test('mintFrId emits the per-item canonical form nested under a story', () => {
	assert.equal(mintFrId(EPIC, ISO, 3, 's2'), `${SEG}:S002:FR003`);
	// accepts the uppercase S<nnn> story form too (via storyIdToOrdinal)
	assert.equal(mintFrId(EPIC, ISO, 3, 'S002'), `${SEG}:S002:FR003`);
});

test('mintFrId is byte-stable for identical inputs', () => {
	assert.equal(mintFrId(EPIC, ISO, 7, 's1'), mintFrId(EPIC, ISO, 7, 's1'));
});

test('mintFrId keeps full width for an ordinal >= 1000 (padOrdinal not truncated)', () => {
	assert.equal(mintFrId(EPIC, ISO, 1000), `${SEG}:FR1000`);
	assert.equal(mintFrId(EPIC, ISO, 12345), `${SEG}:FR12345`);
});

test('mintFrId throws via the shared guards on a bad epicHash or invalid date', () => {
	assert.throws(() => mintFrId('NOTHEX', ISO, 1), /epicHash/);
	assert.throws(() => mintFrId(EPIC, 'not-a-date', 1), /createdAt/);
});

test('mintFrId throws on a non-positive ordinal', () => {
	assert.throws(() => mintFrId(EPIC, ISO, 0), /ordinal/);
	assert.throws(() => mintFrId(EPIC, ISO, -1), /ordinal/);
});

test('parseFrId round-trips every mintFrId output (doc-level and per-item)', () => {
	const doc = mintFrId(EPIC, ISO, 5);
	assert.deepEqual(parseFrId(doc), { date: '20260717', hash8: '185807ba', fr: 5 });

	const item = mintFrId(EPIC, ISO, 5, 's2');
	assert.deepEqual(parseFrId(item), { date: '20260717', hash8: '185807ba', story: 2, fr: 5 });
});

test('parseFrId accepts the dash slug form', () => {
	assert.deepEqual(parseFrId(`${SEG}-S002-FR003`), { date: '20260717', hash8: '185807ba', story: 2, fr: 3 });
	assert.deepEqual(parseFrId(`${SEG}-FR003`), { date: '20260717', hash8: '185807ba', fr: 3 });
});

test('parseFrId returns null on non-FR strings', () => {
	assert.equal(parseFrId(''), null);
	assert.equal(parseFrId('E20260717185807ba:S002'), null);      // a story id, not an FR id
	assert.equal(parseFrId('E20260717185807ba:S002:T003'), null); // a task id
	assert.equal(parseFrId('random'), null);
	// @ts-expect-error — defensive: non-string input returns null, never throws
	assert.equal(parseFrId(undefined), null);
});

test('isFrId is the boolean guard over parseFrId', () => {
	assert.equal(isFrId(mintFrId(EPIC, ISO, 1)), true);
	assert.equal(isFrId(mintFrId(EPIC, ISO, 1, 's3')), true);
	assert.equal(isFrId('E20260717185807ba:S002:T003'), false);
});
