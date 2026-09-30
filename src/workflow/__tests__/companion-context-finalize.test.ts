/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (enrich-docgen-generated-companion-html-artifacts) — through the finalize
 * wiring, a rendered companion HTML carries the reader-facing context (Purpose +
 * Legend) AND a relative back-link to the source artifact .md (./LLD.md at the
 * design.story site), and stays offline (no remote URL, nothing inlined into
 * the .md).
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/companion-context-finalize.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import type { WorkflowIntent } from '../types.js';
import type { LldArtifact } from '../artifacts/lld.js';

const EPIC_HASH = 'b7c3d1e2f3a4b5c6';

const erDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true }, name: { range: 'string' } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
};

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

test('finalize: the rendered companion carries Purpose + Legend + a relative ./LLD.md link, and stays offline', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'ctx-fin-'));
	const emit = { body: { ...minimalLldBody(), erDefinition }, citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }] };
	const result = await finalizeArtifact(standaloneLldIntent(repo), {}, 'wf-ctx', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as LldArtifact;
	const ref = artifact.body.companions![0]!;
	const html = readFileSync(join(repo, ref.relPath), 'utf8');
	// context band with purpose + legend, derived from the authored definition.
	assert.match(html, /id="docgen-narrative"/);
	assert.match(html, /<h3 style="margin:.2rem 0">Purpose<\/h3>/);
	assert.match(html, /<h3 style="margin:.2rem 0">Legend<\/h3>/);
	// a relative back-link to the sibling source markdown (./LLD.md), never remote.
	assert.match(html, /<a href="\.\/LLD\.md"[^>]*>View the source document \(LLD\.md\)<\/a>/);
	assert.doesNotMatch(html, /href="https?:\/\//);
	// the .md links the companion but never inlines its HTML.
	assert.match(result.finalized.renderedMd, /\[ER model\]\([^)]*er-model\.html\)/);
	assert.doesNotMatch(result.finalized.renderedMd, /<!doctype html>/i);
	assert.doesNotMatch(result.finalized.renderedMd, /docgen-narrative/);
	rmSync(repo, { recursive: true, force: true });
});
