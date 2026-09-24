/**
 * Unit tests for the sc2 pure partition reader (src/daemon/guide-sections.ts):
 * readWorkflowGuide / listWorkflowGuides + the marker builders, over fixture
 * steering text — no I/O. Plus the seam-based guideGetResult/guideListResult
 * daemon handler logic over an injected reader (including the read-failure path).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	guideMarkerStart,
	guideMarkerEnd,
	readWorkflowGuide,
	listWorkflowGuides,
	guideGetResult,
	guideListResult,
} from '../guide-sections.js';
import type { InsrcGuideOk, InsrcGuideError } from '../guide-sections.js';

// --- fixture: 2 complete sections + 1 half-marked + a decoy inner marker ------

const FIXTURE = [
	'# steering skeleton',
	'',
	guideMarkerStart('define'),
	'Guidance for DEFINE.',
	'It even mentions ' + guideMarkerStart('plan') + ' as a decoy inside its body.',
	guideMarkerEnd('define'),
	'',
	guideMarkerStart('design.story'),
	'Guidance for DESIGN.STORY.',
	guideMarkerEnd('design.story'),
	'',
	// half-marked: a start with no matching end
	guideMarkerStart('broken'),
	'This section was never closed.',
].join('\n');

// --- marker builders --------------------------------------------------------

test('guideMarkerStart/End produce the exact insrc:guide marker strings', () => {
	assert.equal(guideMarkerStart('plan'), '<!-- insrc:guide:plan:start -->');
	assert.equal(guideMarkerEnd('plan'), '<!-- insrc:guide:plan:end -->');
});

// --- readWorkflowGuide ------------------------------------------------------

test('readWorkflowGuide returns the trimmed section for a known workflow (ac1)', () => {
	const guidance = readWorkflowGuide(FIXTURE, 'design.story');
	assert.equal(guidance, 'Guidance for DESIGN.STORY.');
});

test('readWorkflowGuide keeps a decoy inner marker verbatim, not mis-sliced', () => {
	const guidance = readWorkflowGuide(FIXTURE, 'define');
	assert.ok(guidance);
	assert.match(guidance, /Guidance for DEFINE\./);
	assert.match(guidance, /decoy inside its body/);
	// the decoy `plan:start` is content, so `plan` is NOT retrievable
	assert.equal(readWorkflowGuide(FIXTURE, 'plan'), null);
});

test('readWorkflowGuide returns null for an unknown key', () => {
	assert.equal(readWorkflowGuide(FIXTURE, 'nope'), null);
});

test('readWorkflowGuide returns null for a half-present pair (start, no end)', () => {
	assert.equal(readWorkflowGuide(FIXTURE, 'broken'), null);
});

test('readWorkflowGuide returns null for an inverted pair (end before start)', () => {
	const inverted = `${guideMarkerEnd('x')}\nbody\n${guideMarkerStart('x')}`;
	assert.equal(readWorkflowGuide(inverted, 'x'), null);
});

// --- listWorkflowGuides -----------------------------------------------------

test('listWorkflowGuides returns COMPLETE-pair keys only, in document order', () => {
	assert.deepEqual(listWorkflowGuides(FIXTURE), ['define', 'design.story']);
});

test('listWorkflowGuides returns [] for text with no pairs (Phase-A empty)', () => {
	assert.deepEqual(listWorkflowGuides('# skeleton with no guide markers'), []);
});

// --- guideGetResult / guideListResult over an injected reader ----------------

test('guideGetResult: known key -> Ok { workflow, guidance }', () => {
	const r = guideGetResult(() => FIXTURE, 'define') as InsrcGuideOk;
	assert.equal(r.workflow, 'define');
	assert.match(r.guidance, /Guidance for DEFINE/);
});

test('guideGetResult: omitted workflow -> Error { validWorkflows }', () => {
	const r = guideGetResult(() => FIXTURE, undefined) as InsrcGuideError;
	assert.match(r.error, /workflow is required/);
	assert.deepEqual(r.validWorkflows, ['define', 'design.story']);
});

test('guideGetResult: unknown workflow -> Error { validWorkflows }', () => {
	const r = guideGetResult(() => FIXTURE, 'nope') as InsrcGuideError;
	assert.match(r.error, /unknown workflow/);
	assert.deepEqual(r.validWorkflows, ['define', 'design.story']);
});

test('guideGetResult: read-seam throws -> Error { validWorkflows: [] }, never escapes', () => {
	const r = guideGetResult(() => { throw new Error('missing asset'); }, 'define') as InsrcGuideError;
	assert.match(r.error, /guidance source unavailable/);
	assert.deepEqual(r.validWorkflows, []);
});

test('guideListResult: returns { workflows } in document order', () => {
	assert.deepEqual(guideListResult(() => FIXTURE), { workflows: ['define', 'design.story'] });
});

test('guideListResult: read-seam throws -> { workflows: [] }, never escapes', () => {
	assert.deepEqual(guideListResult(() => { throw new Error('boom'); }), { workflows: [] });
});
