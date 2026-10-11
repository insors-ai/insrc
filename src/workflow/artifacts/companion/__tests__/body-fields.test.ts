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
import { prepareSynthesize } from '../../../orchestrator.js';
import type { WorkflowIntent } from '../../../types.js';
import { validateAgainstSchema } from '../../../../agent/providers/structured-output.js';

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

// ---------------------------------------------------------------------------
// LLD-d9f85b3c S001/t1 — the design synthesizers' schemas admit the optional
// narrative + per-element descriptions, so a synthesizer that writes them is
// not refused at the schema check.
// ---------------------------------------------------------------------------

function synthBodySchemas(): readonly Record<string, unknown>[] {
	const story = prepareSynthesize({
		workflow: 'design.story', focus: 'a standalone story', repoPath: '/tmp/insrc-no-repo', repoIndexedAt: null,
		params: { standalone: true, epicHash: 'abcdef0123456789', storyId: 'S001', sizeClass: 'feature' },
	} as unknown as WorkflowIntent, {});
	const epic = prepareSynthesize({
		workflow: 'design.epic', focus: 'an epic', repoPath: '/tmp/insrc-no-repo', repoIndexedAt: null,
		params: { epicHash: 'abcdef0123456789' },
	} as unknown as WorkflowIntent, {});
	return [story.schema, epic.schema].map(s =>
		((s as { properties: { body: { properties: Record<string, unknown> } } }).properties.body.properties));
}

test('d9f85b3c t1 — design.story and design.epic synth schemas admit narrative + descriptions on ER, sequence and component definitions', () => {
	const described: Record<string, unknown> = {
		erDefinition: {
			narrative: 'Customers place orders.',
			classes: { Customer: { description: 'A buyer.', attributes: { id: { description: 'Key.', range: 'string', identifier: true } } } },
		},
		sequenceDefinition: {
			narrative: 'The CLI asks the daemon to build.',
			participants: [{ id: 'cli', description: 'The command.' }, { id: 'daemon', description: 'The service.' }],
			messages: [{ from: 'cli', to: 'daemon', label: 'build', description: 'Start a build.' }],
		},
		componentDependencyDefinition: {
			narrative: 'MCP reaches storage through the daemon.',
			components: [{ id: 'mcp', description: 'Tools.', path: 'src/mcp' }, { id: 'daemon', description: 'Storage owner.', path: 'src/daemon' }],
			dependencies: [{ from: 'mcp', to: 'daemon' }],
		},
	};
	for (const body of synthBodySchemas()) {
		for (const [field, def] of Object.entries(described)) {
			const r = validateAgainstSchema(body[field] as Record<string, unknown>, def);
			assert.equal(r.ok, true, `${field}: ${JSON.stringify(r)}`);
		}
	}
});
