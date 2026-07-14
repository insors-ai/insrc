/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * getEffectiveHld / getEffectiveHash / scanLldStaleness
 * integration tests. Each test pre-seeds an HLD JSON + optional
 * amendments on disk and asserts the returned effective view +
 * staleness reasons.
 *
 * Every artifact is keyed by the 16-char Epic hash under the new
 * layout; JSON lives in `.insrc/artifacts/`.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/amendments/__tests__/effective-and-staleness.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { hldArtifactPaths, lldArtifactPaths } from '../../storage.js';
import type { HldArtifact, HldBody } from '../../artifacts/hld.js';
import type { LldArtifact } from '../../artifacts/lld.js';
import { computeHldEffectiveHash } from '../../artifacts/lld.js';
import { getEffectiveHld, getEffectiveHash } from '../effective.js';
import { scanLldStaleness } from '../staleness.js';
import { approveAmendment, proposeAmendment } from '../store.js';
import type { AmendmentRecord } from '../types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const AMD1 = `AMD-${HASH}-1`;

function seedHld(repo: string, epicHash: string, runId: string, body: HldBody, approved: boolean): HldArtifact {
	const paths = hldArtifactPaths(repo, epicHash);
	mkdirSync(dirname(paths.json), { recursive: true });
	const artifact: HldArtifact = {
		meta: {
			workflow: 'design.epic',
			runId,
			repoPath: repo, createdAt: new Date().toISOString(), model: 'client', elapsedMs: 0,
			repoIndexedAt: null, schemaVersion: 1,
			epicHash, epicSlug: 'test-epic',
			...(approved ? { approvedAt: new Date().toISOString() } : {}),
		},
		body,
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos' }],
	};
	writeFileSync(paths.json, JSON.stringify(artifact, null, 2));
	return artifact;
}

function seedLld(
	repo: string, epicHash: string, storyId: string,
	hldBaseRunId: string, hldEffectiveHash: string, hldAmendmentsApplied: string[],
): void {
	const paths = lldArtifactPaths(repo, epicHash, storyId);
	mkdirSync(dirname(paths.json), { recursive: true });
	const artifact: LldArtifact = {
		meta: {
			workflow: 'design.story', runId: `lld-${storyId}`,
			repoPath: repo, createdAt: new Date().toISOString(), model: 'client', elapsedMs: 0,
			repoIndexedAt: null, schemaVersion: 1,
			epicHash, epicSlug: 'test-epic', storyId,
			hldBaseRunId, hldEffectiveHash, hldAmendmentsApplied,
		},
		body: {
			hldContextSlice: {} as never,
			contractDetails: { surfaceLevel: 'internal', api: [] },
			dataModelChanges: [], interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'x' },
			alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [],
	};
	writeFileSync(paths.json, JSON.stringify(artifact, null, 2));
}

function baseBody(): HldBody {
	return {
		frameworkSummary: 'x', architectureShape: 'x',
		sharedContracts: [
			{ id: 'sc1', name: 'API', purpose: 'p', interfaceSketch: 'interface API { fn(): void; }',
			  ownedByStory: 's1', consumedByStories: ['s2'], assumptions: [] },
		],
		storyBoundaries: [
			{ storyId: 's1', owns: ['sc1'], depends: [],     internal: 'x' },
			{ storyId: 's2', owns: [],      depends: ['sc1'], internal: 'x' },
		],
		nonFunctional: { performance: 'x' },
		rolloutOverview: {
			phases: [
				{ name: 'A', includesStories: ['s1'], rationale: 'x', backwardCompat: '', featureFlag: null },
				{ name: 'B', includesStories: ['s2'], rationale: 'x', backwardCompat: '', featureFlag: null },
			],
			orderingRationale: 'x', riskyBits: [],
		},
		alternativesConsidered: [
			{ id: 'a1', name: 'A1', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' },
			{ id: 'a2', name: 'A2', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

function pendingAmendmentRecord(epicHash: string, id: string): AmendmentRecord {
	return {
		id, epicHash, epicSlug: 'test-epic', hldBaseRunId: 'hld-1',
		amendment: {
			type: 'sharedContract.fieldAdd',
			contractId: 'sc1',
			field: { name: 'batchSize', type: 'number', optional: true, purpose: 'batching' },
			breaking: false,
		},
		rationale: 'need batching', citations: [],
		proposedBy: { workflow: 'design.story', runId: 'lld-x', storyId: 's2', stepId: 's4' },
		proposedAt: new Date().toISOString(),
		status: 'pending',
	};
}

// ---------------------------------------------------------------------------
// getEffectiveHld
// ---------------------------------------------------------------------------

test('getEffectiveHld with no amendments returns base unchanged', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-eff-'));
	try {
		const base = seedHld(repo, HASH, 'hld-1', baseBody(), true);
		const effective = getEffectiveHld(repo, HASH, base);
		assert.deepEqual(effective.body, base.body);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('getEffectiveHld applies approved amendments to body', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-eff-'));
	try {
		const base = seedHld(repo, HASH, 'hld-1', baseBody(), true);
		proposeAmendment(repo, pendingAmendmentRecord(HASH, AMD1));
		approveAmendment(repo, AMD1, 'alice');
		const effective = getEffectiveHld(repo, HASH, base);
		assert.match(effective.body.sharedContracts[0]!.interfaceSketch, /batchSize\?/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('getEffectiveHash changes when an amendment is approved', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-eff-'));
	try {
		const base = seedHld(repo, HASH, 'hld-1', baseBody(), true);
		const before = getEffectiveHash(repo, HASH, base);
		proposeAmendment(repo, pendingAmendmentRecord(HASH, AMD1));
		const midPending = getEffectiveHash(repo, HASH, base);
		assert.equal(midPending, before);
		approveAmendment(repo, AMD1, 'alice');
		const after = getEffectiveHash(repo, HASH, base);
		assert.notEqual(before, after);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// scanLldStaleness
// ---------------------------------------------------------------------------

test('scanLldStaleness reports up-to-date when LLD hash matches current effective', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-eff-'));
	try {
		const base = seedHld(repo, HASH, 'hld-1', baseBody(), true);
		const hash = computeHldEffectiveHash('hld-1', []);
		seedLld(repo, HASH, 's1', 'hld-1', hash, []);
		const rows = scanLldStaleness(repo, HASH, base);
		assert.equal(rows.length, 1);
		assert.equal(rows[0]!.stale, false);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('scanLldStaleness reports amendment-<id> when a new amendment lands', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-eff-'));
	try {
		const base = seedHld(repo, HASH, 'hld-1', baseBody(), true);
		const preHash = computeHldEffectiveHash('hld-1', []);
		seedLld(repo, HASH, 's1', 'hld-1', preHash, []);
		proposeAmendment(repo, pendingAmendmentRecord(HASH, AMD1));
		approveAmendment(repo, AMD1, 'alice');
		const rows = scanLldStaleness(repo, HASH, base);
		assert.equal(rows[0]!.stale, true);
		assert.equal(rows[0]!.staleReason, `amendment-${AMD1}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('scanLldStaleness reports hld-rerun when base runId changed', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-eff-'));
	try {
		const base = seedHld(repo, HASH, 'hld-2', baseBody(), true);
		const oldHash = computeHldEffectiveHash('hld-1', []);
		seedLld(repo, HASH, 's1', 'hld-1', oldHash, []);
		const rows = scanLldStaleness(repo, HASH, base);
		assert.equal(rows[0]!.stale, true);
		assert.equal(rows[0]!.staleReason, 'hld-rerun');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('scanLldStaleness returns [] when no LLDs exist', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-eff-'));
	try {
		const base = seedHld(repo, HASH, 'hld-1', baseBody(), true);
		const rows = scanLldStaleness(repo, HASH, base);
		assert.deepEqual(rows, []);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
