/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 back-fill — `assembleFunctionalDefinition` turns the FR STATEMENTS elicited in
 * s2 (epic.frame, doc-level) + s3 (stories.compose, per-story) into a validated
 * FunctionalDefinition record, MINTING stable ids off the model via `mintFrId`.
 * Doc-level first (scope 'doc'), then per-story (scope 'item', itemRef = story id,
 * ordinal restarts per story). Absent-safe; a dangling itemRef fails validation.
 *
 * Run: npx tsx --test src/workflow/__tests__/define-fr-assembly.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assembleFunctionalDefinition } from '../orchestrator.js';
import { isFrId, parseFrId } from '../id.js';

const EPIC = '0123456789abcdef';
const CREATED = '2026-09-28T00:00:00.000Z';
const STORIES = [{ id: 's1' }, { id: 's2' }];

function steps(s2FRs: unknown, s3Stories: unknown): Record<string, unknown> {
	return {
		s2: { functionalRequirements: s2FRs },
		s3: { stories: s3Stories },
	};
}

test('absent-safe: no FR statements anywhere → {} (no fd, no error)', () => {
	const out = assembleFunctionalDefinition(steps(undefined, [{ id: 's1' }]), STORIES, EPIC, CREATED);
	assert.equal(out.fd, undefined);
	assert.equal(out.error, undefined);
});

test('assembles doc-level + per-story FRs with minted ids, correct scope/itemRef', () => {
	const out = assembleFunctionalDefinition(
		steps(
			[{ statement: 'Doc requirement A.' }, { statement: 'Doc requirement B.', rationale: 'why B' }],
			[
				{ id: 's1', functionalRequirements: [{ statement: 'Story1 FR one.' }] },
				{ id: 's2', functionalRequirements: [{ statement: 'Story2 FR one.' }, { statement: 'Story2 FR two.' }] },
			],
		),
		STORIES, EPIC, CREATED,
	);
	assert.equal(out.error, undefined, out.error);
	const reqs = out.fd!.requirements;
	assert.equal(reqs.length, 5);

	// Doc-level first, scope 'doc', no itemRef, every id a valid FR id.
	assert.equal(reqs[0]!.scope, 'doc');
	assert.equal(reqs[0]!.statement, 'Doc requirement A.');
	assert.equal(reqs[0]!.itemRef, undefined);
	assert.equal(reqs[1]!.rationale, 'why B');
	assert.ok(reqs.every(r => isFrId(r.id)), 'every minted id is a valid FR id');

	// Per-story: scope 'item', itemRef = story id, S-segment matches the story ordinal.
	const perItem = reqs.filter(r => r.scope === 'item');
	assert.equal(perItem.length, 3);
	assert.equal(perItem[0]!.itemRef, 's1');
	assert.equal(parseFrId(perItem[0]!.id)!.story, 1); // s1 → S001
	assert.equal(perItem[1]!.itemRef, 's2');
	assert.equal(parseFrId(perItem[1]!.id)!.story, 2); // s2 → S002
	// Per-story ordinal restarts within each story (s2's two FRs are FR1, FR2).
	assert.equal(parseFrId(perItem[1]!.id)!.fr, 1);
	assert.equal(parseFrId(perItem[2]!.id)!.fr, 2);

	// All ids unique.
	assert.equal(new Set(reqs.map(r => r.id)).size, reqs.length);
});

test('id stability: identical inputs mint identical ids across two runs', () => {
	const mk = () => assembleFunctionalDefinition(
		steps([{ statement: 'A' }], [{ id: 's1', functionalRequirements: [{ statement: 'B' }] }]),
		STORIES, EPIC, CREATED,
	);
	const a = mk(); const b = mk();
	assert.deepEqual(a.fd!.requirements.map(r => r.id), b.fd!.requirements.map(r => r.id));
});

test('blank/whitespace statements are skipped; all-blank → {}', () => {
	const out = assembleFunctionalDefinition(
		steps([{ statement: '   ' }, { statement: '' }], [{ id: 's1', functionalRequirements: [{ statement: '  ' }] }]),
		STORIES, EPIC, CREATED,
	);
	assert.equal(out.fd, undefined);
	assert.equal(out.error, undefined);
});

test('a per-story FR whose story id is not among the known stories → validation error (dangling itemRef)', () => {
	const out = assembleFunctionalDefinition(
		steps(undefined, [{ id: 's9', functionalRequirements: [{ statement: 'orphan FR' }] }]),
		STORIES, EPIC, CREATED, // known ids are s1/s2 — s9 dangles
	);
	assert.equal(out.fd, undefined);
	assert.ok(typeof out.error === 'string' && /functionalDefinition assembly invalid/.test(out.error), out.error);
});
