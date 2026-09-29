/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) integration — end-to-end the finalize seam composition (validate →
 * render via docgen assembleShell → attach ref → renderFromFormat): a body with a
 * valid uxDefinition produces a sibling ux-mock HTML companion AND a UX section +
 * LINK in the core markdown (never inlined); a body carrying BOTH an authored ER and
 * a UX definition emits BOTH sibling companions in their own extension slots. Mirrors
 * the S003 companion+renderer integration coverage. ac1.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/ux-integration.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderErCompanion, renderUxCompanion } from '../render.js';
import type { ErDefinition } from '../er.js';
import type { UxDefinition } from '../ux.js';
import type { CompanionArtifactRef } from '../types.js';
import { renderLldMarkdown, type LldArtifact, type LldBody } from '../../lld.js';

const validEr: ErDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
};
const validUx: UxDefinition = {
	type: 'AdaptiveCard',
	body: [
		{ type: 'TextBlock', text: 'Order form' },
		{ type: 'Input.Text', id: 'customer', label: 'Customer' },
		{ type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'Create' }] },
	],
};

const baseLld: LldBody = {
	hldContextSlice: { frameworkSummary: 'f', ownedContracts: [], consumedContracts: [], boundary: { storyId: 's1', owns: [], depends: [], internal: '' }, adjacentBoundaries: [], rolloutPhase: 'p', nonFunctional: {} },
	contractDetails: { surfaceLevel: 'internal', api: [] },
	dataModelChanges: [], interactionWithShared: [],
	errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
	testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
	alternativesConsidered: [{ id: 'a1', name: 'A', oneLineSummary: 's', approach: 'x', pros: [], cons: [], costEstimate: 'S' }],
	chosenAlternative: 'a1', openQuestions: [],
};

const lldArtifact = (body: LldBody): LldArtifact => ({
	meta: { workflow: 'design.story', runId: 'r', repoPath: '/repo', createdAt: '2026-07-18T00:00:00.000Z', schemaVersion: 1, epicHash: 'e1a2b3c4d5e6f7a8', storyId: 's1' } as unknown as LldArtifact['meta'],
	body,
	citations: [],
});

test('finalize seam: a valid uxDefinition → sibling ux-mock HTML + a UX section LINK in the markdown (never inlined)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'ux-integration-'));
	const dest = join(repo, 'ux-mock.html');
	const uxRef = await renderUxCompanion(validUx, 'UX mock', dest, { repoPath: repo });
	assert.equal(uxRef.kind, 'ux-mock');
	assert.ok(existsSync(dest), 'the sibling ux-mock HTML companion is written');

	const md = renderLldMarkdown(lldArtifact({ ...baseLld, uxDefinition: validUx, companions: [uxRef] }));
	assert.match(md, /## \d+\. UX/);
	assert.match(md, new RegExp(`\\[UX mock\\]\\(${uxRef.relPath.replace('.', '\\.')}\\)`));
	assert.ok(!md.includes('"AdaptiveCard"'), 'the card JSON is never inlined into the core markdown');
	rmSync(repo, { recursive: true, force: true });
});

test('finalize seam: a body with BOTH an ER and a UX definition emits BOTH companions in their own slots', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'ux-integration-'));
	const erRef: CompanionArtifactRef = await renderErCompanion(validEr, 'ER model', join(repo, 'er-model.html'), { repoPath: repo });
	const uxRef: CompanionArtifactRef = await renderUxCompanion(validUx, 'UX mock', join(repo, 'ux-mock.html'), { repoPath: repo });
	assert.ok(existsSync(join(repo, 'er-model.html')));
	assert.ok(existsSync(join(repo, 'ux-mock.html')));

	const md = renderLldMarkdown(lldArtifact({ ...baseLld, erDefinition: validEr, uxDefinition: validUx, companions: [erRef, uxRef] }));
	// Diagrams (diagramsEr) slot carries the ER link; the UX slot carries the UX link.
	assert.match(md, /\[ER model\]\(er-model\.html\)/);
	assert.match(md, /\[UX mock\]\(ux-mock\.html\)/);
	assert.ok(md.indexOf('ER model') < md.indexOf('UX mock'), 'the ER slot precedes the UX slot');
	rmSync(repo, { recursive: true, force: true });
});
