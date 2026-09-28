/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) t1 — the additive erDefinition?/companions? body fields are optional +
 * absent-safe: an older HldBody/LldBody with NEITHER field still passes its type
 * guard, and adding the new fields does not break the guard. (tsc proves the
 * compile-time optionality; this proves the runtime guards stay absent-safe.)
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/body-fields.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isHldBody, type HldBody } from '../../hld.js';
import { isLldBody, type LldBody } from '../../lld.js';
import type { ErDefinition } from '../er.js';
import type { CompanionArtifactRef } from '../types.js';

const er: ErDefinition = { classes: { A: { attributes: { id: { range: 'string', identifier: true } } } } };
const companions: readonly CompanionArtifactRef[] = [{ kind: 'diagram-mermaid', relPath: 'docs/x/S001/er.html', title: 'ER' }];

const baseHld: HldBody = {
	frameworkSummary: 'f', architectureShape: 'a',
	sharedContracts: [], storyBoundaries: [],
	nonFunctional: {},
	rolloutOverview: { phases: [], orderingRationale: '', riskyBits: [] },
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

test('isHldBody: passes with NEITHER new field (older body) and WITH the new fields', () => {
	assert.equal(isHldBody(baseHld), true);
	assert.equal(isHldBody({ ...baseHld, erDefinition: er, companions }), true);
});

test('isLldBody: passes with NEITHER new field (older body) and WITH the new fields', () => {
	assert.equal(isLldBody(baseLld), true);
	assert.equal(isLldBody({ ...baseLld, erDefinition: er, companions }), true);
});
