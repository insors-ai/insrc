/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Synthesizer scaffold: citation grounding + scope boundary +
 * citation-block renderer.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/synthesizer.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	checkScopeBoundary,
	renderCitationBlock,
	validateCitations,
} from '../synthesizer.js';

const cits = [
	{ id: 'c1', kind: 'step-output' as const, ref: 's1' },
	{ id: 'c2', kind: 'step-output' as const, ref: 's2' },
];

// ---------------------------------------------------------------------------
// validateCitations
// ---------------------------------------------------------------------------

test('validateCitations passes when every ref resolves + every id used', () => {
	const body = 'This claim relies on [[c1]] and this on [[c2]].';
	assert.deepEqual(validateCitations(body, cits), { ok: true });
});

test('validateCitations fails on unknown ref', () => {
	const body = 'Bad claim on [[c99]].';
	const r = validateCitations(body, cits);
	assert.equal(r.ok, false);
	if (!r.ok) {
		assert.equal(r.kind, 'citations');
	}
});

test('validateCitations tolerates an unused citation (harmless padding)', () => {
	// A defined-but-unreferenced citation no longer fails: grounding of the
	// body's claims is guaranteed by the dangling-ref check, and hard-failing
	// here only punished long artifact synthesizes without improving grounding.
	const body = 'Only c1 used [[c1]].';
	const r = validateCitations(body, cits);
	assert.equal(r.ok, true);
});

test('validateCitations fails on duplicate id', () => {
	const dupes = [
		{ id: 'c1', kind: 'step-output' as const, ref: 's1' },
		{ id: 'c1', kind: 'doc' as const, ref: 'x' },
	];
	const r = validateCitations('[[c1]]', dupes);
	assert.equal(r.ok, false);
});

test('validateCitations fails on non-cN id shape', () => {
	const r = validateCitations('[[c1]]', [{ id: 'foo', kind: 'step-output', ref: 's1' }]);
	assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// checkScopeBoundary
// ---------------------------------------------------------------------------

test('checkScopeBoundary passes on stub workflow (no rules)', () => {
	assert.deepEqual(checkScopeBoundary('stub', 'anything goes here'), { ok: true });
});

test('checkScopeBoundary fails define artifact containing a code fence', () => {
	const body = 'This define is fine but\n```ts\nconst x = 1;\n```\n';
	const r = checkScopeBoundary('define', body);
	assert.equal(r.ok, false);
	if (!r.ok) assert.equal(r.kind, 'boundary');
});

test('checkScopeBoundary fails design.epic containing a task list', () => {
	const body = '# HLD\n\n- [ ] some task\n';
	const r = checkScopeBoundary('design.epic', body);
	assert.equal(r.ok, false);
});

// ---------------------------------------------------------------------------
// renderCitationBlock
// ---------------------------------------------------------------------------

test('renderCitationBlock formats the tail block', () => {
	const md = renderCitationBlock(cits);
	assert.ok(md.includes('## Citations'));
	assert.ok(md.includes('[[c1]]'));
	assert.ok(md.includes('[[c2]]'));
});

test('renderCitationBlock returns empty on empty list', () => {
	assert.equal(renderCitationBlock([]), '');
});
