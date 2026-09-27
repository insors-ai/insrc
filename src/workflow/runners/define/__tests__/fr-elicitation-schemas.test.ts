/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 back-fill — the define step schemas ELICIT functional-requirement STATEMENTS:
 * `epicFrameSchema` gains an optional doc-level `functionalRequirements`, and each
 * Story in `storiesComposeSchema` gains an optional per-story `functionalRequirements`.
 * Both are absent-safe (omitting them still validates) and both keep
 * `additionalProperties:false` (an unknown extra property still fails). The elicited
 * shape is `{ statement, rationale? }` ONLY — the model emits no ids/scope (the
 * framework mints those).
 *
 * Run: npx tsx --test src/workflow/runners/define/__tests__/fr-elicitation-schemas.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { epicFrameSchema, storiesComposeSchema } from '../schemas.js';
import { validateAgainstSchema } from '../../../../agent/providers/structured-output.js';

const CITES = [{ id: 'c1', kind: 'doc', ref: 'r' }];

/** A minimal, otherwise-valid epic-frame output; `frs` is the knob under test. */
function epicFrameWith(frs?: unknown): unknown {
	return {
		problem: 'A sufficiently long problem statement describing the gap.',
		nonGoals: [],
		assumptions: [],
		constraints: [],
		citations: CITES,
		...(frs !== undefined ? { functionalRequirements: frs } : {}),
	};
}

/** A minimal, otherwise-valid stories-compose output; `frs` is the per-story knob. */
function storiesWith(frs?: unknown): unknown {
	return {
		stories: [{
			id: 's1',
			title: 't',
			userValue: 'v',
			acceptanceCriteria: [{ id: 'ac1', given: 'g', when: 'w', then: 't', operationalizes: [] }],
			...(frs !== undefined ? { functionalRequirements: frs } : {}),
		}],
		citations: [],
	};
}

// ---- epic.frame (doc-level FRs) ----

test('epicFrameSchema: omitting functionalRequirements still validates (absent-safe)', () => {
	const res = validateAgainstSchema(epicFrameSchema, epicFrameWith());
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

test('epicFrameSchema: a doc-level FR statement (+ optional rationale) validates', () => {
	const res = validateAgainstSchema(epicFrameSchema, epicFrameWith([
		{ statement: 'The system exposes X to a reviewer.' },
		{ statement: 'The system records Y.', rationale: 'audit trail' },
	]));
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

test('epicFrameSchema: an FR without a statement is REJECTED', () => {
	const res = validateAgainstSchema(epicFrameSchema, epicFrameWith([{ rationale: 'no statement' }]));
	assert.equal(res.ok, false, 'statement is required on a functional requirement');
});

test('epicFrameSchema: an FR carrying an id/scope is REJECTED (model must not mint ids)', () => {
	const res = validateAgainstSchema(epicFrameSchema, epicFrameWith([{ statement: 'x', scope: 'doc', id: 'E1:FR001' }]));
	assert.equal(res.ok, false, 'the elicited FR shape is { statement, rationale? } only');
});

// ---- stories.compose (per-story FRs) ----

test('storiesComposeSchema: omitting per-story functionalRequirements still validates (absent-safe)', () => {
	const res = validateAgainstSchema(storiesComposeSchema, storiesWith());
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

test('storiesComposeSchema: per-story FR statements validate', () => {
	const res = validateAgainstSchema(storiesComposeSchema, storiesWith([
		{ statement: 'The user can filter by tag.' },
		{ statement: 'The list persists across reloads.', rationale: 'continuity' },
	]));
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

test('storiesComposeSchema: a per-story FR without a statement is REJECTED', () => {
	const res = validateAgainstSchema(storiesComposeSchema, storiesWith([{ rationale: 'oops' }]));
	assert.equal(res.ok, false);
});
