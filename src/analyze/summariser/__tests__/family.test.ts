/**
 * plans/docs-module.md Section 6.1. Path-based DocFamily inference.
 *
 * Verifies the ordering rule (design > plans > docs > adr > rfc >
 * spec > changelog > readme > other) + basename fallbacks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { inferDocFamily } from '../family.js';

// ---------------------------------------------------------------------------
// Directory-based matches
// ---------------------------------------------------------------------------

test('design/ wins over plans/', () => {
	assert.equal(inferDocFamily('/repo/plans/design/foo.md'), 'design');
	assert.equal(inferDocFamily('/repo/design/plans/foo.md'), 'design');
});

test('plans/ matches for docs directly under plans', () => {
	assert.equal(inferDocFamily('/repo/plans/analyze-context.md'), 'plans');
	assert.equal(inferDocFamily('plans/foo.md'), 'plans');
});

test('designs/ (plural) matches the design family', () => {
	// insors-extraction stores design HTMLs under docs/designs/.
	assert.equal(inferDocFamily('/repo/docs/designs/match-scoring.html'), 'design');
	assert.equal(inferDocFamily('designs/foo.md'), 'design');
});

test('plan/ (singular) matches the plans family', () => {
	assert.equal(inferDocFamily('/repo/plan/foo.md'), 'plans');
});

test('docs/ matches for docs under docs/', () => {
	assert.equal(inferDocFamily('/repo/docs/api/reference.md'), 'docs');
});

test('design > docs when both are in the path', () => {
	// docs/design/... classifies as design because design pattern wins
	assert.equal(inferDocFamily('/repo/docs/design/x.md'), 'design');
});

test('adr/ matches for docs under adr/', () => {
	assert.equal(inferDocFamily('/repo/adr/0042-foo.md'), 'adr');
});

test('rfc/ matches for docs under rfc/', () => {
	assert.equal(inferDocFamily('/repo/rfc/rfc-042.md'), 'rfc');
});

test('spec/ matches for docs under spec/', () => {
	assert.equal(inferDocFamily('/repo/spec/api.md'), 'spec');
});

// ---------------------------------------------------------------------------
// Basename fallbacks
// ---------------------------------------------------------------------------

test('CHANGELOG.md classifies as changelog regardless of directory', () => {
	assert.equal(inferDocFamily('/repo/CHANGELOG.md'), 'changelog');
	assert.equal(inferDocFamily('/repo/subdir/CHANGELOG.md'), 'changelog');
});

test('CHANGES.md and HISTORY.md classify as changelog', () => {
	assert.equal(inferDocFamily('/repo/CHANGES.md'), 'changelog');
	assert.equal(inferDocFamily('/repo/HISTORY.md'), 'changelog');
});

test('README.md classifies as readme', () => {
	assert.equal(inferDocFamily('/repo/README.md'), 'readme');
	assert.equal(inferDocFamily('/repo/subdir/README.md'), 'readme');
	assert.equal(inferDocFamily('/repo/readme.md'), 'readme');
});

test('ADR-*.md by basename classifies as adr', () => {
	assert.equal(inferDocFamily('/repo/random/ADR-042-scope-picker.md'), 'adr');
});

test('RFC-*.md by basename classifies as rfc', () => {
	assert.equal(inferDocFamily('/repo/random/RFC-100.md'), 'rfc');
});

test('SPEC-*.md by basename classifies as spec', () => {
	assert.equal(inferDocFamily('/repo/random/SPEC-schema.md'), 'spec');
});

// ---------------------------------------------------------------------------
// Fallback + edge cases
// ---------------------------------------------------------------------------

test('unknown paths fall back to other', () => {
	assert.equal(inferDocFamily('/repo/misc/notes.md'), 'other');
	assert.equal(inferDocFamily('/repo/src/foo.md'), 'other');
});

test('empty path returns other', () => {
	assert.equal(inferDocFamily(''), 'other');
});

test('windows-style backslashes normalise', () => {
	assert.equal(inferDocFamily('\\repo\\design\\foo.md'), 'design');
	assert.equal(inferDocFamily('C:\\repo\\plans\\foo.md'), 'plans');
});

test('case-insensitive on directory names', () => {
	assert.equal(inferDocFamily('/repo/Design/foo.md'), 'design');
	assert.equal(inferDocFamily('/repo/DESIGN/foo.md'), 'design');
});
