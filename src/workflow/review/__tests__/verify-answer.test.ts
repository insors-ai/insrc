/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The verify answer's bounds and the fix rules its prompt states
 * (ISSUE-562b1bb5, LLD-697b9f8ff46b9deb-S001 t3).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import type { Claim, Evidence } from '../types.js';
import { buildBatchedVerifyPrompt, buildVerifyPrompt, normalizeFinding, VERDICTS_SCHEMA, VERIFY_SCHEMA } from '../verify.js';

const CLAIM: Claim = { id: 'p1', kind: 'citation', text: 'x', anchors: [], probe: {} };
const EVIDENCE: Evidence = { claimId: 'p1', grepResults: [], reads: [] };

const FINDING = {
	severity: 'LOW', evidence: 'read src/a.ts:1', action: 'none — verified sound', fixability: 'manual',
	proposedFix: { rationale: '', artifactEdits: [], options: [] },
};
const ok = (schema: object, answer: unknown): boolean => validateAgainstSchema(schema, answer).ok;

test('VERIFY_SCHEMA and VERDICTS_SCHEMA bound evidence, action, rationale, edits and options, and an answer over a bound fails validation', () => {
	const fix = FINDING.proposedFix;
	const over: [string, unknown][] = [
		['evidence', { ...FINDING, evidence: 'e'.repeat(4001) }],
		['action', { ...FINDING, action: 'a'.repeat(2001) }],
		['rationale', { ...FINDING, proposedFix: { ...fix, rationale: 'r'.repeat(2001) } }],
		['edits', { ...FINDING, proposedFix: { ...fix, artifactEdits: Array.from({ length: 11 }, () => ({ find: 'f', replace: 'r' })) } }],
		['edit text', { ...FINDING, proposedFix: { ...fix, artifactEdits: [{ find: 'f'.repeat(4001), replace: 'r' }] } }],
		['options', { ...FINDING, proposedFix: { ...fix, options: ['1', '2', '3', '4', '5'] } }],
		['option text', { ...FINDING, proposedFix: { ...fix, options: ['o'.repeat(501)] } }],
	];
	assert.ok(ok(VERIFY_SCHEMA, FINDING), 'a finding inside the bounds is valid');
	assert.ok(ok(VERDICTS_SCHEMA, { verdicts: [{ claimId: 'p1', ...FINDING }] }), 'and valid as a batched verdict');
	for (const [what, answer] of over) {
		assert.equal(ok(VERIFY_SCHEMA, answer), false, `${what} over its bound fails VERIFY_SCHEMA`);
		assert.equal(ok(VERDICTS_SCHEMA, { verdicts: [{ claimId: 'p1', ...(answer as object) }] }), false, `${what} over its bound fails VERDICTS_SCHEMA`);
	}
});

test('the verify SYSTEM rules ask for an always-present proposedFix with empty fields when there is no fix and no longer tell the model to omit fields, in both the single and batched prompts', () => {
	for (const [name, system] of [['single', buildVerifyPrompt(CLAIM, EVIDENCE).system], ['batched', buildBatchedVerifyPrompt([CLAIM], [EVIDENCE]).system]] as const) {
		assert.match(system, /Always emit `proposedFix` with all three fields/, `${name}: proposedFix is always present`);
		assert.match(system, /`artifactEdits` and `options` empty\s+arrays/, `${name}: empty arrays when there is nothing to say`);
		assert.match(system, /leave `artifactEdits` an empty array/, `${name}: manual leaves edits empty`);
		assert.doesNotMatch(system, /do NOT emit/, `${name}: no field is to be left out`);
		assert.doesNotMatch(system, /no edits and no options/, `${name}: no field is to be left out`);
	}
});

test('a no-fix answer with an empty rationale normalises to a finding without proposedFix, and one with a rationale keeps a rationale-only proposedFix', () => {
	const empty = normalizeFinding(CLAIM, FINDING as never);
	assert.equal(empty.proposedFix, undefined, 'empty rationale and arrays: no proposedFix');
	const reasoned = normalizeFinding(CLAIM, { ...FINDING, proposedFix: { rationale: 'no safe edit', artifactEdits: [], options: [] } } as never);
	assert.deepEqual(reasoned.proposedFix, { rationale: 'no safe edit' }, 'a rationale alone is kept');
});
