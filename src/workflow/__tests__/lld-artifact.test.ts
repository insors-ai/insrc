/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LldArtifact — renderer, HLD slice extractor, effective hash,
 * cross-artifact invariants.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/lld-artifact.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	checkAcceptanceMapping,
	checkApiSignaturesTypeLevel,
	checkImplementOwnership,
	checkSharedContractRefs,
	computeHldEffectiveHash,
	extractHldContextSlice,
	isLldBody,
	renderLldMarkdown,
	type LldArtifact,
	type LldBody,
} from '../artifacts/lld.js';
import type { HldArtifact, HldBody } from '../artifacts/hld.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function hldFixture(): HldArtifact {
	const body: HldBody = {
		frameworkSummary: 'Extract a small TagFilter service.',
		architectureShape: 'TagFilter owns the index; sidebar consumes it.',
		sharedContracts: [
			{
				id: 'sc1', name: 'TagFilterAPI', purpose: 'Query todos by tag',
				interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[] }',
				ownedByStory: 's1', consumedByStories: ['s2'], assumptions: [],
			},
		],
		storyBoundaries: [
			{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'index storage private' },
			{ storyId: 's2', owns: [], depends: ['sc1'], internal: 'UI state private' },
		],
		nonFunctional: { performance: 'P50 < 20ms' },
		rolloutOverview: {
			phases: [
				{ name: 'Phase A', includesStories: ['s1'], rationale: 'contract first', backwardCompat: '', featureFlag: null },
				{ name: 'Phase B', includesStories: ['s2'], rationale: 'consumer next', backwardCompat: '', featureFlag: null },
			],
			orderingRationale: 's2 depends on sc1',
			riskyBits: [],
		},
		alternativesConsidered: [
			{ id: 'a1', name: 'Service', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' },
			{ id: 'a2', name: 'Inline',  oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'XS', reasonRejected: 'perf' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
	return {
		meta: { workflow: 'design.epic', runId: 'hld-run-1', repoPath: '/', createdAt: '2026-07-12T00:00:00Z', model: 'client', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1 },
		body,
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	};
}

function lldBodyFixture(): LldBody {
	const hld = hldFixture();
	return {
		hldContextSlice: extractHldContextSlice(hld, 's1'),
		contractDetails: {
			surfaceLevel: 'internal-shared',
			api: [
				{
					name: 'TagFilterAPI.list',
					signature: 'list(tag: string): Todo[]',
					parameters: [{ name: 'tag', type: 'string', purpose: 'the tag to filter by', optional: false }],
					returns: { type: 'Todo[]', meaning: 'todos tagged with `tag`' },
					errors: [{ type: 'UnknownTagError', condition: 'when the tag is not registered' }],
					preconditions:  ['tag is a non-empty string'],
					postconditions: ['returned Todo[] is sorted by createdAt desc'],
				},
			],
		},
		dataModelChanges: [
			{ entity: 'Todo', change: 'invariant-change', details: 'add tag index invariant', callSites: ['src/todos/store.ts:filter'] },
		],
		interactionWithShared: [
			{ contractId: 'sc1', role: 'implements', howDetails: 's1 owns the TagFilterAPI as the primary implementation' },
		],
		errorPaths: {
			errorCases: [{ scenario: 'unknown tag', detection: 'lookup miss in tag registry', response: 'throw UnknownTagError', userImpact: 'empty results', recoverable: true }],
			edgeCases:  [{ input: 'empty tag string', expected: 'return empty array without error' }],
			invariantsToPreserve: [{ text: 'existing status filter still works', source: 'c1' }],
		},
		testStrategy: {
			testLevels: [
				{ level: 'unit', purpose: 'exercise list() with valid/invalid tags', subjects: ['TagFilterAPI.list'] },
			],
			acceptanceMapping: [
				{ criterionId: 'ac1', provingTests: ['unit:TagFilterAPI.list'] },
			],
			testFramework: 'node:test',
		},
		alternativesConsidered: [
			{ id: 'a1', name: 'In-memory index', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' },
			{ id: 'a2', name: 'DB view',         oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'M', reasonRejected: 'perf' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

// ---------------------------------------------------------------------------
// computeHldEffectiveHash
// ---------------------------------------------------------------------------

test('computeHldEffectiveHash returns a 64-char hex string', () => {
	const h = computeHldEffectiveHash('hld-run-1', []);
	assert.equal(typeof h, 'string');
	assert.equal(h.length, 64);
	assert.match(h, /^[0-9a-f]{64}$/);
});

test('computeHldEffectiveHash is deterministic', () => {
	const h1 = computeHldEffectiveHash('hld-run-1', ['a1', 'a2']);
	const h2 = computeHldEffectiveHash('hld-run-1', ['a1', 'a2']);
	assert.equal(h1, h2);
});

test('computeHldEffectiveHash differs when amendments change', () => {
	const base   = computeHldEffectiveHash('hld-run-1', []);
	const amend1 = computeHldEffectiveHash('hld-run-1', ['a1']);
	const amend12 = computeHldEffectiveHash('hld-run-1', ['a1', 'a2']);
	assert.notEqual(base, amend1);
	assert.notEqual(amend1, amend12);
});

test('computeHldEffectiveHash order-sensitive to amendment sequence', () => {
	const h12 = computeHldEffectiveHash('hld-run-1', ['a1', 'a2']);
	const h21 = computeHldEffectiveHash('hld-run-1', ['a2', 'a1']);
	assert.notEqual(h12, h21);
});

// ---------------------------------------------------------------------------
// extractHldContextSlice
// ---------------------------------------------------------------------------

test('extractHldContextSlice returns owned + consumed contracts + boundary + phase', () => {
	const hld = hldFixture();
	const slice = extractHldContextSlice(hld, 's1');
	assert.equal(slice.frameworkSummary, hld.body.frameworkSummary);
	assert.equal(slice.ownedContracts.length, 1);
	assert.equal(slice.ownedContracts[0]!.id, 'sc1');
	assert.equal(slice.consumedContracts.length, 0);
	assert.equal(slice.boundary.storyId, 's1');
	assert.equal(slice.rolloutPhase, 'Phase A');
});

test('extractHldContextSlice returns consumed contracts for consumer Story', () => {
	const hld = hldFixture();
	const slice = extractHldContextSlice(hld, 's2');
	assert.equal(slice.ownedContracts.length, 0);
	assert.equal(slice.consumedContracts.length, 1);
	assert.equal(slice.consumedContracts[0]!.id, 'sc1');
	assert.equal(slice.rolloutPhase, 'Phase B');
});

test('extractHldContextSlice throws when Story not in HLD', () => {
	const hld = hldFixture();
	assert.throws(() => extractHldContextSlice(hld, 's99'));
});

// ---------------------------------------------------------------------------
// isLldBody
// ---------------------------------------------------------------------------

test('isLldBody accepts valid body', () => {
	assert.equal(isLldBody(lldBodyFixture()), true);
});

test('isLldBody rejects missing testStrategy', () => {
	const bad = { ...lldBodyFixture() } as Record<string, unknown>;
	delete bad['testStrategy'];
	assert.equal(isLldBody(bad), false);
});

// ---------------------------------------------------------------------------
// checkSharedContractRefs
// ---------------------------------------------------------------------------

test('checkSharedContractRefs passes when every id resolves', () => {
	const issues = checkSharedContractRefs(lldBodyFixture(), hldFixture());
	assert.deepEqual(issues, []);
});

test('checkSharedContractRefs flags unknown contract id', () => {
	const body: LldBody = {
		...lldBodyFixture(),
		interactionWithShared: [{ contractId: 'sc99', role: 'consumes', howDetails: 'x' }],
	};
	const issues = checkSharedContractRefs(body, hldFixture());
	assert.equal(issues.length, 1);
	assert.match(issues[0]!, /sc99/);
});

// ---------------------------------------------------------------------------
// checkImplementOwnership
// ---------------------------------------------------------------------------

test('checkImplementOwnership passes when owner matches', () => {
	const issues = checkImplementOwnership(lldBodyFixture(), hldFixture(), 's1');
	assert.deepEqual(issues, []);
});

test('checkImplementOwnership flags claiming to implement a contract owned by another Story', () => {
	// Same body but call as if we were s2's LLD.
	const issues = checkImplementOwnership(lldBodyFixture(), hldFixture(), 's2');
	assert.equal(issues.length, 1);
	assert.match(issues[0]!, /sc1/);
});

test('checkImplementOwnership ignores role=consumes', () => {
	const body: LldBody = {
		...lldBodyFixture(),
		interactionWithShared: [{ contractId: 'sc1', role: 'consumes', howDetails: 'x' }],
	};
	// s2 consumes sc1 which is owned by s1; not a violation for consumes.
	const issues = checkImplementOwnership(body, hldFixture(), 's2');
	assert.deepEqual(issues, []);
});

// ---------------------------------------------------------------------------
// checkAcceptanceMapping
// ---------------------------------------------------------------------------

test('checkAcceptanceMapping passes when every criterion is mapped', () => {
	const issues = checkAcceptanceMapping(lldBodyFixture(), ['ac1']);
	assert.deepEqual(issues, []);
});

test('checkAcceptanceMapping flags an unknown criterion in the mapping', () => {
	const body: LldBody = {
		...lldBodyFixture(),
		testStrategy: {
			...lldBodyFixture().testStrategy,
			acceptanceMapping: [{ criterionId: 'ac99', provingTests: ['x'] }],
		},
	};
	const issues = checkAcceptanceMapping(body, ['ac1']);
	assert.ok(issues.some(i => i.includes('ac99')));
});

test('checkAcceptanceMapping flags an unmapped Story criterion', () => {
	const issues = checkAcceptanceMapping(lldBodyFixture(), ['ac1', 'ac2']);
	assert.ok(issues.some(i => i.includes('ac2')));
});

// ---------------------------------------------------------------------------
// checkApiSignaturesTypeLevel
// ---------------------------------------------------------------------------

test('checkApiSignaturesTypeLevel passes on TS signature', () => {
	assert.deepEqual(checkApiSignaturesTypeLevel(lldBodyFixture()), []);
});

test('checkApiSignaturesTypeLevel flags a signature with a body containing return', () => {
	const body: LldBody = {
		...lldBodyFixture(),
		contractDetails: {
			...lldBodyFixture().contractDetails,
			api: [{
				...lldBodyFixture().contractDetails.api[0]!,
				signature: 'list(tag) { return db.filter(tag); }',
			}],
		},
	};
	const issues = checkApiSignaturesTypeLevel(body);
	assert.ok(issues.length > 0);
});

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

test('renderLldMarkdown emits all sections', () => {
	const artifact: LldArtifact = {
		meta: {
			workflow: 'design.story', runId: 'lld-run-1',
			repoPath: '/', createdAt: '2026-07-12T00:00:00Z', model: 'client',
			elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1,
			epicSlug: 'tag-filtering', storyId: 's1',
			hldBaseRunId: 'hld-run-1',
			hldEffectiveHash: computeHldEffectiveHash('hld-run-1', []),
			hldAmendmentsApplied: [],
		},
		body: lldBodyFixture(),
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	};
	const md = renderLldMarkdown(artifact);
	assert.ok(md.includes('# LLD: s1'));
	assert.ok(md.includes('**Epic:** `tag-filtering`'));
	assert.ok(md.includes('## HLD context'));
	assert.ok(md.includes('## Contract details'));
	assert.ok(md.includes('### `TagFilterAPI.list`'));
	assert.ok(md.includes('## Data model changes'));
	assert.ok(md.includes('## Interaction with shared contracts'));
	assert.ok(md.includes('## Error paths'));
	assert.ok(md.includes('## Test strategy'));
	assert.ok(md.includes('| Criterion | Proving tests |'));
	assert.ok(md.includes('## Alternatives considered'));
	assert.ok(md.includes('**CHOSEN**'));
});

test('renderLldMarkdown adds a Tracker link only when meta.tracker.storyRef is set', () => {
	const meta = {
		workflow: 'design.story', runId: 'lld-run-1', repoPath: '/', createdAt: '', model: 'client',
		elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1, epicSlug: 'tag-filtering', storyId: 's1',
		hldBaseRunId: 'hld-run-1', hldEffectiveHash: computeHldEffectiveHash('hld-run-1', []), hldAmendmentsApplied: [],
	};
	const base = { meta, body: lldBodyFixture(), citations: [] } as unknown as LldArtifact;
	assert.doesNotMatch(renderLldMarkdown(base), /\*\*Tracker:\*\*/);
	const linked = { meta: { ...meta, tracker: { storyRef: 'acme/demo#11' } }, body: lldBodyFixture(), citations: [] } as unknown as LldArtifact;
	assert.match(renderLldMarkdown(linked), /\*\*Tracker:\*\* \[acme\/demo#11\]/);
});

test('renderLldMarkdown includes Migration section for enhancement (when present)', () => {
	const body: LldBody = {
		...lldBodyFixture(),
		migration: {
			stateBefore: 'no tag filter',
			stateAfter:  'tag filter available',
			migrationSteps: [
				{ order: 1, action: 'add index', rollbackable: true },
				{ order: 2, action: 'backfill',  rollbackable: false, prerequisiteFlags: ['index-ready'] },
			],
			backwardCompat: 'status filter still works',
			zeroDowntime: true,
			dataRewriteRequired: false,
		},
	};
	const artifact: LldArtifact = {
		meta: {
			workflow: 'design.story', runId: 'x', repoPath: '/', createdAt: '', model: 'client', elapsedMs: 0, repoIndexedAt: null,
			schemaVersion: 1, epicSlug: 'x', storyId: 's1',
			hldBaseRunId: 'x', hldEffectiveHash: 'x', hldAmendmentsApplied: [],
		},
		body,
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	};
	const md = renderLldMarkdown(artifact);
	assert.ok(md.includes('## Migration'));
	assert.ok(md.includes('1. add index'));
	assert.ok(md.includes('2. backfill'));
	assert.ok(md.includes('index-ready'));
});
