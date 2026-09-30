/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E20260929e2c6705f:S003 t6 — the AUTHOR-GATED sequence + component finalize path is
 * LIVE. When the synthesizer LLM authored a `sequenceDefinition` and/or a
 * `componentDependencyDefinition`, finalize (design.story) renders the sibling
 * companion HTML DETERMINISTICALLY and attaches one diagram-mermaid ref per authored
 * def to body.companions; a body with NEITHER writes no diagram companion and is
 * byte-identical to today. A malformed (dangling-ref) definition is swallowed —
 * finalize does not throw and any valid second definition still renders.
 *
 * Exercises the private renderDiagramCompanionsForBody seam through the public
 * finalizeArtifact path (mirrors er-companion-finalize.test.ts).
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/diagram-companion-finalize.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import type { WorkflowIntent } from '../types.js';
import type { LldArtifact } from '../artifacts/lld.js';

const EPIC_HASH = 'e2c6705fd105d4ac';

const sequenceDefinition = {
	participants: [{ id: 'A', label: 'Client' }, { id: 'B', label: 'Server' }],
	messages: [{ from: 'A', to: 'B', label: 'request' }, { from: 'B', to: 'A', label: 'response', kind: 'return' as const }],
};
const componentDependencyDefinition = {
	components: [{ id: 'api' }, { id: 'db' }],
	dependencies: [{ from: 'api', to: 'db' }],
};

function minimalLldBody(): Record<string, unknown> {
	return {
		hldContextSlice: { frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [], boundary: { storyId: 'S003', owns: [], depends: [], internal: 'x' }, adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {} },
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

function intent(repo: string): WorkflowIntent {
	return {
		workflow: 'design.story', focus: 'a standalone feature with diagrams', repoPath: repo,
		repoIndexedAt: null,
		params: { standalone: true, epicHash: EPIC_HASH, storyId: 'S003', sizeClass: 'feature' },
	} as unknown as WorkflowIntent;
}

const citations = [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }];

test('finalize: an authored sequenceDefinition → sibling sequence companion written + linked', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'diagram-fin-seq-'));
	const emit = { body: { ...minimalLldBody(), sequenceDefinition }, citations };
	const result = await finalizeArtifact(intent(repo), {}, 'wf-seq', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as LldArtifact;
	assert.deepEqual(artifact.body.sequenceDefinition, sequenceDefinition);
	assert.equal(artifact.body.companions?.length, 1);
	const ref = artifact.body.companions![0]!;
	assert.equal(ref.kind, 'diagram-mermaid');
	assert.match(ref.relPath, /sequence-diagram\.html$/);
	assert.ok(existsSync(join(repo, ref.relPath)), 'the sibling sequence-diagram.html exists');
	assert.doesNotMatch(result.finalized.renderedMd, /<!doctype html>/i);   // never inlined
	rmSync(repo, { recursive: true, force: true });
});

test('finalize: an authored componentDependencyDefinition → sibling component companion written + linked', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'diagram-fin-comp-'));
	const emit = { body: { ...minimalLldBody(), componentDependencyDefinition }, citations };
	const result = await finalizeArtifact(intent(repo), {}, 'wf-comp', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as LldArtifact;
	assert.equal(artifact.body.companions?.length, 1);
	assert.match(artifact.body.companions![0]!.relPath, /component-dependency\.html$/);
	assert.ok(existsSync(join(repo, artifact.body.companions![0]!.relPath)));
	rmSync(repo, { recursive: true, force: true });
});

test('finalize: BOTH diagram slots → two sibling companions + two refs', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'diagram-fin-both-'));
	const emit = { body: { ...minimalLldBody(), sequenceDefinition, componentDependencyDefinition }, citations };
	const result = await finalizeArtifact(intent(repo), {}, 'wf-both', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as LldArtifact;
	assert.equal(artifact.body.companions?.length, 2);
	const rels = artifact.body.companions!.map(c => c.relPath).sort();
	assert.ok(rels.some(r => /component-dependency\.html$/.test(r)));
	assert.ok(rels.some(r => /sequence-diagram\.html$/.test(r)));
	for (const c of artifact.body.companions!) assert.ok(existsSync(join(repo, c.relPath)));
	rmSync(repo, { recursive: true, force: true });
});

test('finalize: NEITHER diagram slot → no diagram companion (byte-identical, absent-safe)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'diagram-fin-none-'));
	const emit = { body: minimalLldBody(), citations };
	const result = await finalizeArtifact(intent(repo), {}, 'wf-none', 5, emit, 'client');
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const artifact = result.finalized.artifact as LldArtifact;
	assert.equal(artifact.body.companions, undefined);
	assert.doesNotMatch(result.finalized.renderedMd, /sequence-diagram\.html/);
	assert.doesNotMatch(result.finalized.renderedMd, /component-dependency\.html/);
	rmSync(repo, { recursive: true, force: true });
});

test('finalize: a malformed (dangling-ref) sequenceDefinition now SURFACES a retryable failure (S001, was swallowed)', async () => {
	// S001 (harden-artifact-flows): a HIGH companion-validation finding is no longer
	// swallowed at render — the pre-render gate makes finalize return a retryable
	// schema failure so the author is re-prompted, and NO artifact is written (even
	// though a sibling componentDependencyDefinition here is valid — the whole
	// artifact is gated, not the one companion).
	const repo = mkdtempSync(join(tmpdir(), 'diagram-fin-surface-'));
	const badSeq = { participants: [{ id: 'A' }], messages: [{ from: 'A', to: 'Z', label: 'x' }] };  // Z is undeclared → HIGH
	const emit = { body: { ...minimalLldBody(), sequenceDefinition: badSeq, componentDependencyDefinition }, citations };
	const result = await finalizeArtifact(intent(repo), {}, 'wf-surface', 5, emit, 'client');
	assert.equal(result.ok, false, 'finalize surfaces the HIGH finding as a failure instead of swallowing it');
	if (result.ok) return;
	assert.equal(result.failure.ok, false);
	if (result.failure.ok) return;
	assert.equal(result.failure.kind, 'schema');
	assert.equal(result.failure.retryable, true);
	assert.ok((result.failure.details ?? []).some(d => /sequenceDefinition/.test(d)), 'the specific error is carried in details[]');
	rmSync(repo, { recursive: true, force: true });
});
