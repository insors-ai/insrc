/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (provenance/feedback) t4 — the additive optional `feedback?` body field is
 * absent-safe: a legacy body WITHOUT it still passes its type guard, and a body
 * WITH it still passes. The guards are LEFT UNTOUCHED (they never inspect
 * feedback); this proves adding the field did not break them across all four
 * artifact types. (tsc proves the compile-time optionality.)
 *
 * Run: npx tsx --test src/workflow/artifacts/provenance/__tests__/body-fields.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isDefineBody, type DefineBody } from '../../define.js';
import { isHldBody, type HldBody } from '../../hld.js';
import { isLldBody, type LldBody } from '../../lld.js';
import { isPlanBody, type PlanBody } from '../../plan.js';
import type { FeedbackRecord } from '../types.js';

const feedback: FeedbackRecord = [
	{ id: 'f1', author: 'rev', timestamp: '2026-09-28T00:00:00Z', target: { file: 'x.json' }, comment: 'note' },
];

const baseDefine: DefineBody = {
	flavor: 'enhancement', problem: 'p', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [],
};
const baseHld: HldBody = {
	frameworkSummary: 'f', architectureShape: 'a', sharedContracts: [], storyBoundaries: [],
	nonFunctional: {}, rolloutOverview: { phases: [], orderingRationale: '', riskyBits: [] },
	alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
};
const baseLld: LldBody = {
	hldContextSlice: { frameworkSummary: 'f', ownedContracts: [], consumedContracts: [], boundary: { storyId: 's1', owns: [], depends: [], internal: '' }, adjacentBoundaries: [], rolloutPhase: 'p', nonFunctional: {} },
	contractDetails: { surfaceLevel: 'internal', api: [] },
	dataModelChanges: [], interactionWithShared: [],
	errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
	testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
	alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
};
const basePlan: PlanBody = { tasks: [], testStrategyCoverage: [] };

test('isDefineBody: passes WITHOUT feedback (legacy) and WITH it', () => {
	assert.equal(isDefineBody(baseDefine), true);
	assert.equal(isDefineBody({ ...baseDefine, feedback }), true);
});

test('isHldBody: passes WITHOUT feedback (legacy) and WITH it', () => {
	assert.equal(isHldBody(baseHld), true);
	assert.equal(isHldBody({ ...baseHld, feedback }), true);
});

test('isLldBody: passes WITHOUT feedback (legacy) and WITH it', () => {
	assert.equal(isLldBody(baseLld), true);
	assert.equal(isLldBody({ ...baseLld, feedback }), true);
});

test('isPlanBody: passes WITHOUT feedback (legacy) and WITH it', () => {
	assert.equal(isPlanBody(basePlan), true);
	assert.equal(isPlanBody({ ...basePlan, feedback }), true);
});
