/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) t3 — the additive uxDefinition?/adherence? body fields are optional +
 * absent-safe: an older HldBody/LldBody with NEITHER field still passes its type
 * guard; the LLD renderer omits the UX extension slot when there is no ux-mock
 * companion (byte-identical, forward-only) and renders a LINK when one is present
 * (never inlined); the ER + UX companions render in their OWN slots; and the
 * AdherenceDimension enum validates a recorded selection.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/ux-body-fields.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isHldBody, type HldBody } from '../../hld.js';
import { isLldBody, renderLldMarkdown, type LldArtifact, type LldBody } from '../../lld.js';
import type { UxDefinition } from '../ux.js';
import type { CompanionArtifactRef } from '../types.js';
import { ADHERENCE_PROPERTY_SCHEMA, isAdherenceDimension, ADHERENCE_DIMENSIONS, type AdherenceSelection } from '../adherence.js';
import { validateAgainstSchema } from '../../../../agent/providers/structured-output.js';

const ux: UxDefinition = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'hi' }] };
const adherence: AdherenceSelection = { dimensions: ['ux'] };
const uxMock: CompanionArtifactRef = { kind: 'ux-mock', relPath: 'docs/x/S004/ux-mock.html', title: 'UX mock' };
const erDiagram: CompanionArtifactRef = { kind: 'diagram-mermaid', relPath: 'docs/x/S004/er-model.html', title: 'ER model' };

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
	alternativesConsidered: [{ id: 'a1', name: 'A', oneLineSummary: 's', approach: 'x', pros: [], cons: [], costEstimate: 'S' }],
	chosenAlternative: 'a1', openQuestions: [],
};

const lldArtifact = (body: LldBody): LldArtifact => ({
	meta: { workflow: 'design.story', runId: 'r', repoPath: '/repo', createdAt: '2026-07-18T00:00:00.000Z', schemaVersion: 1, epicHash: 'e1a2b3c4d5e6f7a8', storyId: 's1' } as unknown as LldArtifact['meta'],
	body,
	citations: [],
});

// ── type guards stay absent-safe ──────────────────────────────────────────────

test('isHldBody / isLldBody: pass with NEITHER new field and WITH uxDefinition + adherence', () => {
	assert.equal(isHldBody(baseHld), true);
	assert.equal(isHldBody({ ...baseHld, uxDefinition: ux, adherence }), true);
	assert.equal(isLldBody(baseLld), true);
	assert.equal(isLldBody({ ...baseLld, uxDefinition: ux, adherence }), true);
});

// ── renderer omit-slot / link (ac1) ───────────────────────────────────────────

test('renderLldMarkdown: uxDefinition + adherence present but NO ux-mock companion → byte-identical (omit-slot)', () => {
	const without = renderLldMarkdown(lldArtifact(baseLld));
	const withFields = renderLldMarkdown(lldArtifact({ ...baseLld, uxDefinition: ux, adherence }));
	assert.equal(withFields, without, 'uxDefinition/adherence are not rendered; the UX slot stays omitted');
	assert.ok(!/## \d+\. UX/.test(without), 'the UX section is omitted when there is no ux-mock companion');
});

test('renderLldMarkdown: a ux-mock companion renders the UX section as a LINK (never inlined)', () => {
	const md = renderLldMarkdown(lldArtifact({ ...baseLld, uxDefinition: ux, companions: [uxMock] }));
	assert.match(md, /## \d+\. UX/);
	assert.match(md, /\[UX mock\]\(docs\/x\/S004\/ux-mock\.html\)/);
	// never inlined: the authored card JSON text is not dumped into the markdown
	assert.ok(!md.includes('"AdaptiveCard"'));
});

test('renderLldMarkdown: an ER + a UX companion render in their OWN slots', () => {
	const md = renderLldMarkdown(lldArtifact({ ...baseLld, companions: [erDiagram, uxMock] }));
	// Diagrams slot carries the ER link; UX slot carries the UX link.
	assert.match(md, /\[ER model\]\(docs\/x\/S004\/er-model\.html\)/);
	assert.match(md, /\[UX mock\]\(docs\/x\/S004\/ux-mock\.html\)/);
	// The ER link appears before the UX link (diagramsEr slot precedes the ux slot).
	assert.ok(md.indexOf('ER model') < md.indexOf('UX mock'));
});

// ── AdherenceDimension enum (ac3) ─────────────────────────────────────────────

test('ADHERENCE_PROPERTY_SCHEMA: validates a recorded selection against the AdherenceDimension set', () => {
	assert.equal(validateAgainstSchema(ADHERENCE_PROPERTY_SCHEMA, { dimensions: ['ux', 'diagram-er', 'functional-coverage'] }).ok, true);
	assert.equal(validateAgainstSchema(ADHERENCE_PROPERTY_SCHEMA, { dimensions: ['bogus'] }).ok, false);
	assert.equal(validateAgainstSchema(ADHERENCE_PROPERTY_SCHEMA, { dimensions: [] }).ok, true);
});

test('isAdherenceDimension: only the five selectable members', () => {
	for (const d of ADHERENCE_DIMENSIONS) assert.equal(isAdherenceDimension(d), true);
	assert.equal(isAdherenceDimension('diagram'), false);   // ReviewDimension, not an AdherenceDimension
	assert.equal(isAdherenceDimension('nope'), false);
});
