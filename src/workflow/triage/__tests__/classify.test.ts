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
		// bugfix requires a magnitude to route; standalone does not depend on it.
		const r = sc === 'bugfix' ? routeForSizeClass(sc, 'sized') : routeForSizeClass(sc);
		assert.equal(r.standalone, sc !== 'epic', `${sc} standalone`);
	}
});

test('routeForSizeClass: only trivial (and a small bugfix) skips the LLD', () => {
	// The four fixed tiers keep the original invariant: only trivial skips the LLD.
	for (const sc of SIZE_CLASSES) {
		if (sc === 'bugfix') continue; // magnitude-dependent — asserted explicitly below
		assert.equal(routeForSizeClass(sc).producesLld, sc !== 'trivial', `${sc} producesLld`);
	}
	// bugfix is the one category where the LLD is gated by magnitude, not the tier.
	assert.equal(routeForSizeClass('bugfix', 'small').producesLld, false, 'bugfix small skips the LLD');
	assert.equal(routeForSizeClass('bugfix', 'sized').producesLld, true, 'bugfix sized produces the LLD');
});

// ---------------------------------------------------------------------------
// routeForSizeClass — the bugfix arm (scope-gated by magnitude)
// ---------------------------------------------------------------------------

test('routeForSizeClass: bugfix small routes issue -> build (no design, no plan)', () => {
	const r = routeForSizeClass('bugfix', 'small');
	assert.equal(r.startStage, 'issue');
	assert.equal(r.standalone, true);
	assert.equal(r.needsPlan, false);
	assert.equal(r.producesLld, false);
});

test('routeForSizeClass: bugfix sized routes issue -> design -> plan -> build', () => {
	const r = routeForSizeClass('bugfix', 'sized');
	assert.equal(r.startStage, 'issue');
	assert.equal(r.standalone, true);
	assert.equal(r.needsPlan, true);
	assert.equal(r.producesLld, true);
});

test('routeForSizeClass: a bugfix with no magnitude throws (authoritative guard)', () => {
	assert.throws(() => routeForSizeClass('bugfix'), /bugfix.*requires a magnitude/);
});

test('routeForSizeClass: magnitude is ignored for the four fixed tiers (ac1)', () => {
	// The optional param exists for bugfix only; passing it to a fixed tier must
	// return the byte-for-byte identical route.
	assert.deepEqual(routeForSizeClass('small', 'sized'), routeForSizeClass('small'));
	assert.deepEqual(routeForSizeClass('feature', 'small'), routeForSizeClass('feature'));
	assert.deepEqual(routeForSizeClass('trivial', 'sized'), routeForSizeClass('trivial'));
	assert.deepEqual(routeForSizeClass('epic', 'small'), routeForSizeClass('epic'));
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

// --- bugfix category + magnitude ---

const BUGFIX_WELL_FORMED: Record<string, unknown> = {
	sizeClass: 'bugfix',
	magnitude: 'small',
	rationale: 'A one-line off-by-one in the pager; localized correction.',
	storyTitle: 'Fix pager off-by-one on the final page',
	signals: [
		{ kind: 'modules-touched', detail: 'only src/cli/pager', evidence: ['src/cli/pager.ts'] },
	],
};

test('CLASSIFY_SCHEMA: sizeClass enum includes bugfix (auto-derived from SIZE_CLASSES)', () => {
	assert.ok(SIZE_CLASSES.includes('bugfix'), 'SIZE_CLASSES carries bugfix');
	const ok = validateAgainstSchema(CLASSIFY_SCHEMA, BUGFIX_WELL_FORMED);
	assert.equal(ok.ok, true, ok.ok ? '' : ok.errors.join('; '));
});

test('CLASSIFY_SCHEMA: accepts a bugfix with magnitude sized', () => {
	const res = validateAgainstSchema(CLASSIFY_SCHEMA, { ...BUGFIX_WELL_FORMED, magnitude: 'sized' });
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

test('CLASSIFY_SCHEMA: rejects a bugfix with NO magnitude (conditional required)', () => {
	const bad = { ...BUGFIX_WELL_FORMED };
	delete (bad as { magnitude?: unknown }).magnitude;
	const res = validateAgainstSchema(CLASSIFY_SCHEMA, bad);
	assert.equal(res.ok, false, 'a magnitude-less bugfix must fail the if/then conditional');
});

test('CLASSIFY_SCHEMA: rejects an out-of-enum magnitude', () => {
	const res = validateAgainstSchema(CLASSIFY_SCHEMA, { ...BUGFIX_WELL_FORMED, magnitude: 'medium' });
	assert.equal(res.ok, false);
});

test('CLASSIFY_SCHEMA: a non-bugfix tier needs no magnitude (four-tier unchanged)', () => {
	// WELL_FORMED is a `small` with no magnitude — still valid.
	const res = validateAgainstSchema(CLASSIFY_SCHEMA, WELL_FORMED);
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

// --- sc1 contract: TriageResult carries magnitude iff bugfix ---

test('sc1 contract: a bugfix TriageResult carries magnitude and startStage issue', () => {
	const result: TriageResult = {
		sizeClass: 'bugfix',
		magnitude: 'sized',
		route: routeForSizeClass('bugfix', 'sized'),
		rationale: 'A cross-cutting correction needing design.',
		signals: [],
		storyTitle: 'Fix cross-module contract drift',
	};
	assert.equal(result.magnitude, 'sized');
	assert.equal(result.route.startStage, 'issue');
});

test('sc1 contract: a fixed-tier TriageResult omits magnitude and keeps its route', () => {
	const result: TriageResult = {
		sizeClass: 'small',
		route: routeForSizeClass('small'),
		rationale: 'Minor addition.',
		signals: [],
		storyTitle: 'Add a flag',
	};
	assert.equal(result.magnitude, undefined);
	assert.equal(result.route.startStage, 'design.story');
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

test('buildClassifyPrompt: declaredBugfix adds bugfix+magnitude guidance to the system prompt', () => {
	const { system } = buildClassifyPrompt({
		focus: 'The pager drops the last row',
		grounding: 'src/cli/pager touches 1 file.',
		declaredBugfix: true,
	});
	assert.match(system, /DECLARED a defect fix/);
	assert.match(system, /sizeClass: "bugfix"/);
	assert.match(system, /magnitude/);
});

test('buildClassifyPrompt: WITHOUT declaredBugfix the system prompt is the unchanged four-tier prompt', () => {
	const plain = buildClassifyPrompt({ focus: 'Add a flag', grounding: 'g' });
	const explicitFalse = buildClassifyPrompt({ focus: 'Add a flag', grounding: 'g', declaredBugfix: false });
	// No bugfix guidance leaks into the default prompt (ac1).
	assert.doesNotMatch(plain.system, /DECLARED a defect fix/);
	assert.equal(explicitFalse.system, plain.system, 'declaredBugfix:false === omitted');
});
