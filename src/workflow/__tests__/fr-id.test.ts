/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the requirement-id minter/parser: RequirementIds.mint / parse /
 * isRequirementId in `../artifact-ids.ts`. A story is `s<n>`; an uppercase story is
 * rejected and a parse miss is undefined.
 *
 * Run: npx tsx --test src/workflow/__tests__/fr-id.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InvalidArtifactKeyError, RequirementIds } from '../artifact-ids.js';

const EPIC = '185807ba9a6b35d3';
const ISO  = '2026-07-17T07:42:28.275Z';
// The epic segment these inputs derive to (E<YYYYMMDD><hash8>).
const SEG  = 'E20260717185807ba';

test('RequirementIds.mint emits the doc-level canonical form', () => {
	assert.equal(RequirementIds.mint(EPIC, ISO, 1), `${SEG}:FR001`);
	assert.equal(RequirementIds.mint(EPIC, ISO, 42), `${SEG}:FR042`);
});

test('RequirementIds.mint emits the per-item canonical form nested under a story', () => {
	assert.equal(RequirementIds.mint(EPIC, ISO, 3, 's2'), `${SEG}:S002:FR003`);
});

test('RequirementIds.mint is byte-stable for identical inputs', () => {
	assert.equal(RequirementIds.mint(EPIC, ISO, 7, 's1'), RequirementIds.mint(EPIC, ISO, 7, 's1'));
});

test('RequirementIds.mint keeps full width for an ordinal >= 1000 (padOrdinal not truncated)', () => {
	assert.equal(RequirementIds.mint(EPIC, ISO, 1000), `${SEG}:FR1000`);
	assert.equal(RequirementIds.mint(EPIC, ISO, 12345), `${SEG}:FR12345`);
});

test('RequirementIds.mint throws via the shared guards on a bad epicHash or invalid date', () => {
	assert.throws(() => RequirementIds.mint('NOTHEX', ISO, 1), /epicHash/);
	assert.throws(() => RequirementIds.mint(EPIC, 'not-a-date', 1), /createdAt/);
});

test('RequirementIds.mint throws on a non-positive ordinal', () => {
	assert.throws(() => RequirementIds.mint(EPIC, ISO, 0), /ordinal/);
	assert.throws(() => RequirementIds.mint(EPIC, ISO, -1), /ordinal/);
});

test('RequirementIds.parse round-trips every mintFrId output (doc-level and per-item)', () => {
	const doc = RequirementIds.mint(EPIC, ISO, 5);
	assert.deepEqual(RequirementIds.parse(doc), { date: '20260717', hash8: '185807ba', fr: 5 });

	const item = RequirementIds.mint(EPIC, ISO, 5, 's2');
	assert.deepEqual(RequirementIds.parse(item), { date: '20260717', hash8: '185807ba', story: 2, fr: 5 });
});

test('RequirementIds.parse accepts the dash slug form', () => {
	assert.deepEqual(RequirementIds.parse(`${SEG}-S002-FR003`), { date: '20260717', hash8: '185807ba', story: 2, fr: 3 });
	assert.deepEqual(RequirementIds.parse(`${SEG}-FR003`), { date: '20260717', hash8: '185807ba', fr: 3 });
});

test('RequirementIds.parse returns undefined on non-FR strings', () => {
	assert.equal(RequirementIds.parse(''), undefined);
	assert.equal(RequirementIds.parse('E20260717185807ba:S002'), undefined);      // a story id, not an FR id
	assert.equal(RequirementIds.parse('E20260717185807ba:S002:T003'), undefined); // a task id
	assert.equal(RequirementIds.parse('random'), undefined);
	// @ts-expect-error — defensive: non-string input is a miss, never throws
	assert.equal(RequirementIds.parse(undefined), undefined);
});

test('RequirementIds.isRequirementId is the boolean guard over RequirementIds.parse', () => {
	assert.equal(RequirementIds.isRequirementId(RequirementIds.mint(EPIC, ISO, 1)), true);
	assert.equal(RequirementIds.isRequirementId(RequirementIds.mint(EPIC, ISO, 1, 's3')), true);
	assert.equal(RequirementIds.isRequirementId('E20260717185807ba:S002:T003'), false);
});

test('stored ids parse to date, hash8, story as a number and fr, uppercase mint is rejected and a miss returns undefined', () => {
	// ids as stored today, canonical and slug, with and without a story
	assert.deepEqual(RequirementIds.parse('E20260717185807ba:S002:FR005'), { date: '20260717', hash8: '185807ba', story: 2, fr: 5 });
	assert.deepEqual(RequirementIds.parse('E20260717185807ba-S012-FR100'), { date: '20260717', hash8: '185807ba', story: 12, fr: 100 });
	assert.deepEqual(RequirementIds.parse('E20260717185807ba:FR001'), { date: '20260717', hash8: '185807ba', fr: 1 });
	// what mint writes parses back to the same parts
	assert.deepEqual(RequirementIds.parse(RequirementIds.mint(EPIC, ISO, 9, 's3')), { date: '20260717', hash8: '185807ba', story: 3, fr: 9 });
	// an uppercase or malformed story is refused at mint, with the error type of the identity module
	for (const bad of ['S002', 'S2', 'story', 's0x', '']) {
		assert.throws(() => RequirementIds.mint(EPIC, ISO, 1, bad), InvalidArtifactKeyError, `story '${bad}'`);
	}
	// a miss is undefined, never null and never a throw
	for (const miss of ['', 'random', 'E20260717185807ba:S002', 'E20260717185807ba:S002:T003', 'e20260717185807ba:FR001', 'E20260717185807ba:FR', 'FR001']) {
		assert.equal(RequirementIds.parse(miss), undefined, miss);
	}
});
