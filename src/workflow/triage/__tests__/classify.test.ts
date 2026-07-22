/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { CLASSIFY_SCHEMA, buildClassifyPrompt, routeForSizeClass } from '../classify.js';
import { SIZE_CLASSES, type TriageResult } from '../types.js';

// ---------------------------------------------------------------------------
// routeForSizeClass — the taxonomy table
// ---------------------------------------------------------------------------

test('routeForSizeClass: epic enters at define, in-Epic, full chain', () => {
	const r = routeForSizeClass('epic');
	assert.equal(r.startStage, 'define');
	assert.equal(r.standalone, false);
	assert.equal(r.needsPlan, true);
	assert.equal(r.producesLld, true);
});

test('routeForSizeClass: feature is a standalone LLD with plan', () => {
	const r = routeForSizeClass('feature');
	assert.equal(r.startStage, 'design.story');
	assert.equal(r.standalone, true);
	assert.equal(r.needsPlan, true);
	assert.equal(r.producesLld, true);
});

test('routeForSizeClass: small is a standalone LLD, no plan', () => {
	const r = routeForSizeClass('small');
	assert.equal(r.startStage, 'design.story');
	assert.equal(r.standalone, true);
	assert.equal(r.needsPlan, false);
	assert.equal(r.producesLld, true);
});

test('routeForSizeClass: trivial routes straight to build, no LLD', () => {
	const r = routeForSizeClass('trivial');
	assert.equal(r.startStage, 'build');
	assert.equal(r.standalone, true);
	assert.equal(r.needsPlan, false);
	assert.equal(r.producesLld, false);
});

test('routeForSizeClass: every non-epic tier is standalone (the enabling invariant)', () => {
	for (const sc of SIZE_CLASSES) {
		const r = routeForSizeClass(sc);
		assert.equal(r.standalone, sc !== 'epic', `${sc} standalone`);
	}
});

test('routeForSizeClass: only trivial skips the LLD', () => {
	for (const sc of SIZE_CLASSES) {
		assert.equal(routeForSizeClass(sc).producesLld, sc !== 'trivial', `${sc} producesLld`);
	}
});

// ---------------------------------------------------------------------------
// CLASSIFY_SCHEMA — validates a well-formed result, rejects malformed
// ---------------------------------------------------------------------------

const WELL_FORMED: TriageResult['sizeClass'] extends never ? never : Record<string, unknown> = {
	sizeClass: 'small',
	rationale: 'A single localized addition to one module.',
	storyTitle: 'Add per-repo cache TTL override',
	signals: [
		{ kind: 'modules-touched', detail: 'only src/config', evidence: ['src/config/analyze.ts'] },
	],
};

test('CLASSIFY_SCHEMA: accepts a well-formed result', () => {
	const res = validateAgainstSchema(CLASSIFY_SCHEMA, WELL_FORMED);
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

test('CLASSIFY_SCHEMA: rejects an unknown sizeClass', () => {
	const res = validateAgainstSchema(CLASSIFY_SCHEMA, { ...WELL_FORMED, sizeClass: 'medium' });
	assert.equal(res.ok, false);
});

test('CLASSIFY_SCHEMA: rejects missing storyTitle', () => {
	const bad = { ...WELL_FORMED };
	delete (bad as { storyTitle?: unknown }).storyTitle;
	const res = validateAgainstSchema(CLASSIFY_SCHEMA, bad);
	assert.equal(res.ok, false);
});

test('CLASSIFY_SCHEMA: rejects an unknown signal kind', () => {
	const res = validateAgainstSchema(CLASSIFY_SCHEMA, {
		...WELL_FORMED,
		signals: [{ kind: 'vibes', detail: 'feels big', evidence: [] }],
	});
	assert.equal(res.ok, false);
});

// ---------------------------------------------------------------------------
// buildClassifyPrompt — grounding goes trailing (rule 7); empty grounding noted
// ---------------------------------------------------------------------------

test('buildClassifyPrompt: request + grounding trail, grounding after the request', () => {
	const { system, user } = buildClassifyPrompt({
		focus: 'Add a --json flag to the status command',
		grounding: 'Module cli/status touches 2 files; 3 callers.',
	});
	assert.match(system, /Classify ONE code change request/);
	const reqAt = user.indexOf('Add a --json flag');
	const groundAt = user.indexOf('Module cli/status');
	assert.ok(reqAt >= 0 && groundAt > reqAt, 'grounding trails the request');
});

test('buildClassifyPrompt: empty grounding is flagged for conservative classification', () => {
	const { user } = buildClassifyPrompt({ focus: 'x', grounding: '   ' });
	assert.match(user, /no analyze grounding available/);
});
