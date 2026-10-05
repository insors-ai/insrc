/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) follow-on — the AUTHOR-GATES ER path is LIVE in finalize. When the
 * synthesizer LLM authored an `erDefinition` into the emitted body, finalize
 * (design.epic + design.story) renders the sibling `er-model.html` companion
 * DETERMINISTICALLY (no provider) and the rendered HLD/LLD md links it in the
 * Diagrams extension slot. A body with NO erDefinition writes no companion and the
 * Diagrams slot stays absent (forward-only / absent-safe).
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/er-companion-finalize.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import { approveArtifactByJsonPath } from '../gates.js';
import { defineArtifactPaths } from '../storage.js';
import type { WorkflowIntent } from '../types.js';
import type { HldArtifact } from '../artifacts/hld.js';
import type { LldArtifact } from '../artifacts/lld.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';

const EPIC_HASH = 'a3f4b8c9d1e2f3a4';
const CREATED   = '2026-07-17T07:42:28.275Z';

/** A valid ER model (Customer 1—1 Order) the LLM would author under the gate. */
const erDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true }, name: { range: 'string' } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
};

// ---------------------------------------------------------------------------
// design.story (standalone LLD) — the full finalize path, no Epic gating
// ---------------------------------------------------------------------------

function minimalLldBody(): Record<string, unknown> {
	return {
		hldContextSlice: { frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [], boundary: { storyId: 'S001', owns: [], depends: [], internal: 'x' }, adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {} },
		contractDetails: { surfaceLevel: 'internal', api: [] },
		dataModelChanges: [],
		interactionWithShared: [],
		errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
		testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
		alternativesConsidered: [{ id: 'a1', name: 'n', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

function standaloneLldIntent(repo: string): WorkflowIntent {
	return {
		workflow: 'design.story', focus: 'a standalone feature with a data model', repoPath: repo,
		repoIndexedAt: null,
		params: { standalone: true, epicHash: EPIC_HASH, storyId: 'S001', sizeClass: 'feature' },
	} as unknown as WorkflowIntent;
}

test('finalize[design.story standalone]: an authored erDefinition → sibling companion written + linked in the md (LIVE)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'er-fin-lld-'));
	const emit = { body: { ...minimalLldBody(), erDefinition }, citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
	const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-lld-er', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as LldArtifact;
	// The erDefinition stays in-body (source of truth), the companion is out-of-body.
	assert.deepEqual(artifact.body.erDefinition, erDefinition);
	assert.equal(artifact.body.companions?.length, 1);
	const ref = artifact.body.companions![0]!;
	assert.equal(ref.kind, 'diagram-mermaid');
	assert.match(ref.relPath, /er-model\.html$/);
	// The sibling companion file was written under the repo.
	assert.ok(existsSync(join(repo, ref.relPath)), 'the sibling er-model.html companion exists on disk');
	// The rendered md LINKS it (never inlines the HTML) in a Diagrams section.
	assert.match(result.finalized.renderedMd, /## \d+\. Diagrams/);
	assert.match(result.finalized.renderedMd, /\[ER model\]\([^)]*er-model\.html\)/);
	assert.doesNotMatch(result.finalized.renderedMd, /<!doctype html>/i);   // never inlined
	rmSync(repo, { recursive: true, force: true });
});

test('finalize[design.story standalone]: NO erDefinition → no companion + no Diagrams slot (absent-safe)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'er-fin-lld-none-'));
	const emit = { body: minimalLldBody(), citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
	const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-lld-noer', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as LldArtifact;
	assert.equal(artifact.body.companions, undefined);
	assert.doesNotMatch(result.finalized.renderedMd, /er-model\.html/);
	assert.doesNotMatch(result.finalized.renderedMd, /## \d+\. Diagrams/);
	rmSync(repo, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// design.epic (HLD) — seed a 1-story approved Epic, finalize the HLD
// ---------------------------------------------------------------------------

function seedOneStoryEpic(repo: string): void {
	const dp = defineArtifactPaths(repo, EPIC_HASH, CREATED, 'epic', 'er-epic');
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-er', schemaVersion: 1, epicHash: EPIC_HASH, epicSlug: 'er-epic', createdAt: CREATED },
		body: {
			flavor: 'new-capability', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'The data model story', userValue: 'v', acceptanceCriteria: [], dependsOn: [] }],
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	stampOtherPartyReview(dp.json);   // approval requires an other-party review
	approveArtifactByJsonPath(dp.json);
}

function validHldBody(withEr: boolean): Record<string, unknown> {
	return {
		frameworkSummary: 'The framework', architectureShape: 'The shape [[c1]]',
		sharedContracts: [],
		storyBoundaries: [{ storyId: 's1', owns: [], depends: [], internal: 's1 internals' }],
		nonFunctional: {},
		rolloutOverview: { phases: [{ name: 'P', includesStories: ['s1'], rationale: 'r', backwardCompat: '', featureFlag: null }], orderingRationale: 'o', riskyBits: [] },
		alternativesConsidered: [
			{ id: 'a1', name: 'chosen', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' },
			{ id: 'a2', name: 'other', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S', reasonRejected: 'r' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
		...(withEr ? { erDefinition } : {}),
	};
}

function epicIntent(repo: string): WorkflowIntent {
	return {
		workflow: 'design.epic', focus: 'HLD for the data model epic', repoPath: repo, repoIndexedAt: null,
		params: { epicHash: EPIC_HASH },
	} as unknown as WorkflowIntent;
}

test('finalize[design.epic HLD]: an authored erDefinition → sibling companion written + linked in the HLD md (LIVE)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'er-fin-hld-'));
	seedOneStoryEpic(repo);
	const emit = { body: validHldBody(true), citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }] };
	const result = await finalizeArtifact(epicIntent(repo), {}, 'wf-hld-er', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as HldArtifact;
	assert.deepEqual(artifact.body.erDefinition, erDefinition);
	assert.equal(artifact.body.companions?.length, 1);
	const ref = artifact.body.companions![0]!;
	assert.match(ref.relPath, /er-model\.html$/);
	assert.ok(existsSync(join(repo, ref.relPath)), 'the sibling companion exists next to the HLD.md');
	assert.match(result.finalized.renderedMd, /## \d+\. Diagrams/);
	assert.match(result.finalized.renderedMd, /\[ER model\]\([^)]*er-model\.html\)/);
	rmSync(repo, { recursive: true, force: true });
});

test('finalize[design.epic HLD]: NO erDefinition → no companion + no Diagrams slot', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'er-fin-hld-none-'));
	seedOneStoryEpic(repo);
	const emit = { body: validHldBody(false), citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }] };
	const result = await finalizeArtifact(epicIntent(repo), {}, 'wf-hld-noer', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as HldArtifact;
	assert.equal(artifact.body.companions, undefined);
	assert.doesNotMatch(result.finalized.renderedMd, /er-model\.html/);
	assert.doesNotMatch(result.finalized.renderedMd, /## \d+\. Diagrams/);
	rmSync(repo, { recursive: true, force: true });
});
