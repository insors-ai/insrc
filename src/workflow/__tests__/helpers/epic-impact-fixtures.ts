/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Minimal LLD and PLAN artifacts for the Epic impact tests (ISSUE-1b3caadf04023d33). Fixed values: the golden files depend on them. */

import type { LldArtifact } from '../../artifacts/lld.js';
import type { PlanArtifact } from '../../artifacts/plan.js';

export const FIXTURE_HASH = 'a3f4b8c9d1e2f3a4';

export function lldFixture(): LldArtifact {
	return {
		meta: {
			workflow: 'design.story', runId: 'lld-run-1', repoPath: '/nonexistent-epic-impact-fixture', createdAt: '2026-11-24T00:00:00Z',
			model: 'client', elapsedMs: 1, repoIndexedAt: null, schemaVersion: 1,
			epicHash: FIXTURE_HASH, epicSlug: 'later-story', storyId: 's2',
			hldBaseRunId: 'hld-run-1', hldEffectiveHash: 'deadbeefdeadbeef', hldAmendmentsApplied: [],
		},
		body: {
			hldContextSlice: {
				frameworkSummary: 'A framework.', ownedContracts: [], consumedContracts: [],
				boundary: { storyId: 's2', owns: [], depends: ['s1'], internal: 'Story two.' },
				adjacentBoundaries: [], rolloutPhase: 'p1', nonFunctional: {},
			},
			contractDetails: { surfaceLevel: 'internal', api: [] },
			dataModelChanges: [],
			interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testLevels: [{ level: 'unit', purpose: 'x', subjects: ['unit: it works'] }], acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['unit: it works'] }], testFramework: 'node:test' },
			alternativesConsidered: [{ id: 'a1', name: 'One', oneLineSummary: 'The only one.', approach: 'Do the one thing that works here.', pros: ['p'], cons: ['c'], costEstimate: 'S' }],
			chosenAlternative: 'a1',
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'src/x.ts' }],
	} as unknown as LldArtifact;
}

export function planFixture(): PlanArtifact {
	return {
		meta: {
			workflow: 'plan', runId: 'plan-run-1', repoPath: '/nonexistent-epic-impact-fixture', createdAt: '2026-11-24T00:00:00Z',
			model: 'client', elapsedMs: 1, repoIndexedAt: null, schemaVersion: 1,
			epicHash: FIXTURE_HASH, epicSlug: 'later-story', storyId: 's2',
			lldRunId: 'lld-run-1', lldEffectiveHash: 'deadbeef',
		},
		body: {
			tasks: [{
				id: 't1', title: 'Do the thing', summary: 'A unit of work.', size: 'S', order: 1,
				dependsOn: [], acceptanceChecks: ['it is done'], derivedFrom: ['c1'],
				tests: [{ level: 'unit', name: 'unit: t1 works' }],
			}],
			testStrategyCoverage: [{ lldStrategyItem: 'unit: it works', coveredByTaskIds: ['t1'] }],
		},
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD s2 handoff' }],
	} as unknown as PlanArtifact;
}
