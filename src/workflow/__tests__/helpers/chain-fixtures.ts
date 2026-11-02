/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Chain-report fixtures shared by chain.test.ts and chain-report-tracker.test.ts: an Epic's Define, HLD and Story LLDs on disk. */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { defineArtifactPaths, hldArtifactPaths, lldArtifactPaths, writeAtomic } from '../../storage.js';
import { markApprovedSync } from '../lifecycle-fixtures.js';

const CREATED = '2026-07-17T07:42:28.275Z';   // stable anchor for the nested md-path resolver

/** A fixture that is already approved: its head carries an approved lifecycle. */
export function approveReviewed(jsonPath: string): void {
	markApprovedSync(jsonPath);
}

export function writeDefine(repo: string, epicHash: string, opts: { stories: string[] } = { stories: ['s1', 's2'] }): string {
	const paths = defineArtifactPaths(repo, epicHash, CREATED, 'epic');
	mkdirSync(dirname(paths.json), { recursive: true });
	writeAtomic(paths.json, JSON.stringify({
		meta: {
			workflow: 'define', runId: 'def-1', schemaVersion: 1,
			epicHash, epicSlug: 'test-epic', createdAt: CREATED, epicCreatedAt: CREATED,
		},
		body: {
			flavor: 'enhancement',
			problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: opts.stories.map(id => ({
				id, title: `Story ${id}`, userValue: 'v', acceptanceCriteria: [],
			})),
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	return paths.json;
}

export function writeHld(repo: string, epicHash: string, runId: string): { path: string; runId: string } {
	const paths = hldArtifactPaths(repo, epicHash, CREATED, 'epic');
	mkdirSync(dirname(paths.json), { recursive: true });
	writeAtomic(paths.json, JSON.stringify({
		meta: {
			workflow: 'design.epic', runId, schemaVersion: 1,
			epicHash, epicSlug: 'test-epic', createdAt: CREATED, epicCreatedAt: CREATED,
		},
		body: {
			frameworkSummary: 'x', architectureShape: 'x',
			sharedContracts: [],
			storyBoundaries: [{ storyId: 's1', owns: [], depends: [], internal: 'x' }, { storyId: 's2', owns: [], depends: [], internal: 'x' }],
			nonFunctional: {},
			rolloutOverview: { phases: [], orderingRationale: '', riskyBits: [] },
			alternativesConsidered: [], chosenAlternative: '', openQuestions: [],
		},
		citations: [],
	}, null, 2));
	return { path: paths.json, runId };
}

export function writeLld(repo: string, epicHash: string, storyId: string, hldRunId: string, effectiveHash: string): string {
	const paths = lldArtifactPaths(repo, epicHash, storyId, CREATED, 'epic');
	mkdirSync(dirname(paths.json), { recursive: true });
	writeAtomic(paths.json, JSON.stringify({
		meta: {
			workflow: 'design.story', runId: `lld-${storyId}`, schemaVersion: 1,
			epicHash, epicSlug: 'test-epic', storyId, createdAt: CREATED, epicCreatedAt: CREATED,
			hldBaseRunId: hldRunId, hldEffectiveHash: effectiveHash, hldAmendmentsApplied: [],
		},
		body: {
			hldContextSlice: {}, contractDetails: { surfaceLevel: 'internal', api: [] },
			dataModelChanges: [], interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'x' },
			alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [],
	}, null, 2));
	return paths.json;
}
