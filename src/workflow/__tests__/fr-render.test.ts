/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for sc1 (S001, Task t3): the per-type renderers emit the additive
 * Functional Requirements section from body.functionalDefinition, and produce
 * BYTE-IDENTICAL output to the pre-change baseline when the record is
 * absent/empty. All four renderers call the same renderFunctionalRequirementsSection
 * helper (which returns [] when absent), so an absent record appends nothing.
 *
 * Run: npx tsx --test src/workflow/__tests__/fr-render.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mintFrId } from '../id.js';
import type { FunctionalDefinition } from '../artifacts/functional-definition.js';
import { renderDefineMarkdown, type DefineArtifact, type DefineBody } from '../artifacts/define.js';
import { renderHldMarkdown, type HldArtifact, type HldBody } from '../artifacts/hld.js';
import { renderLldMarkdown, type LldArtifact, type LldBody } from '../artifacts/lld.js';
import { renderPlanMarkdown, type PlanArtifact, type PlanBody } from '../artifacts/plan.js';

const EPIC = '185807ba9a6b35d3';
const ISO  = '2026-07-17T07:42:28.275Z';

const RECORD: FunctionalDefinition = {
	requirements: [
		{ id: mintFrId(EPIC, ISO, 1), statement: 'the reviewer can see the intended outcome', scope: 'doc' },
		{ id: mintFrId(EPIC, ISO, 2, 's1'), statement: 'a per-item outcome', scope: 'item', itemRef: 's1' },
	],
};
const HEADING = '## Functional requirements';

// --- minimal, renderer-valid fixtures (only the fields each renderer reads) ---

function defineArtifact(fd?: FunctionalDefinition): DefineArtifact {
	const body = {
		flavor: 'enhancement', problem: 'A problem statement.', nonGoals: [], assumptions: [],
		constraints: [], stories: [], openQuestions: [],
		...(fd ? { functionalDefinition: fd } : {}),
	} as DefineBody;
	return { meta: { epicHash: EPIC, createdAt: ISO, workflow: 'define', runId: 'r', repoPath: '/', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1 }, body, citations: [] } as unknown as DefineArtifact;
}

function hldArtifact(fd?: FunctionalDefinition): HldArtifact {
	const body = {
		frameworkSummary: 'A framework.', architectureShape: 'A shape.', sharedContracts: [],
		storyBoundaries: [], nonFunctional: {}, rolloutOverview: { phases: [], orderingRationale: '', riskyBits: [] },
		alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
		...(fd ? { functionalDefinition: fd } : {}),
	} as unknown as HldBody;
	return { meta: { epicHash: EPIC, createdAt: ISO, workflow: 'design.epic', runId: 'r', repoPath: '/', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1, epicSlug: 'slug' }, body, citations: [] } as unknown as HldArtifact;
}

function lldArtifact(fd?: FunctionalDefinition): LldArtifact {
	const body = {
		hldContextSlice: { frameworkSummary: 'F.', rolloutPhase: 'Phase A', ownedContracts: [], consumedContracts: [], adjacentBoundaries: [], boundary: { storyId: 's1', owns: [], depends: [], internal: '' }, nonFunctional: {} },
		contractDetails: { surfaceLevel: 'internal', api: [] }, dataModelChanges: [], interactionWithShared: [],
		errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
		testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'x' },
		alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
		...(fd ? { functionalDefinition: fd } : {}),
	} as unknown as LldBody;
	return { meta: { epicHash: EPIC, storyId: 's1', createdAt: ISO, workflow: 'design.story', runId: 'r', repoPath: '/', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1, epicSlug: 'slug', hldBaseRunId: 'h', hldEffectiveHash: 'abcdef0123456789' }, body, citations: [] } as unknown as LldArtifact;
}

function planArtifact(fd?: FunctionalDefinition): PlanArtifact {
	const body = {
		tasks: [], testStrategyCoverage: [],
		...(fd ? { functionalDefinition: fd } : {}),
	} as unknown as PlanBody;
	return { meta: { epicHash: EPIC, storyId: 's1', createdAt: ISO, workflow: 'plan', runId: 'r', repoPath: '/', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1, epicSlug: 'slug', lldRunId: 'l', lldEffectiveHash: 'abcdef0123456789' }, body, citations: [] } as unknown as PlanArtifact;
}

const RENDERERS: ReadonlyArray<[string, (fd?: FunctionalDefinition) => string]> = [
	['define', (fd) => renderDefineMarkdown(defineArtifact(fd))],
	['hld',    (fd) => renderHldMarkdown(hldArtifact(fd))],
	['lld',    (fd) => renderLldMarkdown(lldArtifact(fd))],
	['plan',   (fd) => renderPlanMarkdown(planArtifact(fd))],
];

for (const [name, render] of RENDERERS) {
	test(`${name}: absent functionalDefinition renders byte-identically (no FR section)`, () => {
		const baseline = render(undefined);
		assert.ok(!baseline.includes(HEADING), `${name} baseline must not contain the FR heading`);
		// an empty record is treated as absent -> byte-identical to the undefined baseline
		assert.equal(render({ requirements: [] }), baseline);
	});

	test(`${name}: a functionalDefinition renders the FR section when present`, () => {
		const withRec = render(RECORD);
		// The FR heading is 'Functional requirements' — plain (old renderers) or
		// engine-numbered '## N. Functional requirements' (S002-reshaped renderers).
		assert.match(withRec, /## (?:\d+\. )?Functional requirements/, `${name} must render the FR heading when present`);
		assert.ok(withRec.includes(mintFrId(EPIC, ISO, 1)), `${name} must list the doc-level FR id`);
		assert.ok(withRec.includes(mintFrId(EPIC, ISO, 2, 's1')), `${name} must list the per-item FR id`);
		// The FR requirement lines are present verbatim (de-headed by the engine reshaping).
		assert.ok(withRec.includes(RECORD.requirements[0]!.statement), `${name} lists the doc-level FR statement`);
	});
}
