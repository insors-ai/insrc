/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the `plan` upstream gate (sc3): `requireApprovedLld`
 * (approved / unapproved / rejected / stale / stale-acked / missing) and
 * `readPlanUpstream` assembly.
 *
 * Run: npx tsx --test src/workflow/__tests__/plan-gate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { computeHldEffectiveHash } from '../artifacts/lld.js';
import {
	ArtifactMissingError,
	ArtifactNotApprovedError,
	approveArtifactByJsonPath,
	readPlanUpstream,
	requireApprovedLld,
} from '../gates.js';
import { defineArtifactPaths, hldArtifactPaths, lldArtifactPaths } from '../storage.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const HLD_RUN = 'hld-run-1';
const CURRENT_EFFECTIVE = computeHldEffectiveHash(HLD_RUN, []);

function seedDefineAndHld(repo: string): void {
	const dp = defineArtifactPaths(repo, HASH);
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering' },
		body: {
			flavor: 'enhancement', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'a', when: 'b', then: 'c', operationalizes: [] }], dependsOn: [] }],
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	approveArtifactByJsonPath(dp.json);

	const hp = hldArtifactPaths(repo, HASH);
	writeFileSync(hp.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: HLD_RUN, schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering' },
		body: {
			frameworkSummary: 'x', architectureShape: 'x [[c1]]',
			sharedContracts: [{ id: 'sc1', name: 'A', purpose: 'p', interfaceSketch: 'interface A {}', ownedByStory: 's1', consumedByStories: [], assumptions: [] }],
			storyBoundaries: [{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'x' }],
			nonFunctional: {},
			rolloutOverview: { phases: [{ name: 'A', includesStories: ['s1'], rationale: 'x', backwardCompat: '', featureFlag: null }], orderingRationale: 'x', riskyBits: [] },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	}, null, 2));
	approveArtifactByJsonPath(hp.json);
}

interface LldMetaOpts {
	readonly approved?:      boolean;
	readonly rejected?:      boolean;
	readonly effectiveHash?: string;
	readonly staleAckedAt?:  string;
}

function seedLld(repo: string, storyId: string, opts: LldMetaOpts): string {
	const lp = lldArtifactPaths(repo, HASH, storyId);
	mkdirSync(dirname(lp.json), { recursive: true });
	const meta: Record<string, unknown> = {
		workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', storyId,
		hldBaseRunId: HLD_RUN, hldEffectiveHash: opts.effectiveHash ?? CURRENT_EFFECTIVE, hldAmendmentsApplied: [],
	};
	if (opts.approved) meta['approvedAt'] = '2026-01-01T00:00:00Z';
	if (opts.rejected) meta['rejectedAt'] = '2026-01-02T00:00:00Z';
	if (opts.staleAckedAt) meta['staleAckedAt'] = opts.staleAckedAt;
	writeFileSync(lp.json, JSON.stringify({
		meta,
		body: {
			hldContextSlice: {}, contractDetails: { surfaceLevel: 'internal', api: [] },
			dataModelChanges: [], interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testLevels: [{ level: 'unit', purpose: 'x', subjects: ['unit: s'] }], acceptanceMapping: [], testFramework: 'node:test' },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: [], cons: [], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [],
	}, null, 2));
	return lp.json;
}

test('requireApprovedLld: returns the LLD when approved + non-stale', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-gate-'));
	try {
		seedDefineAndHld(repo);
		seedLld(repo, 's1', { approved: true });
		const lld = requireApprovedLld(repo, HASH, 's1');
		assert.equal(lld.meta.storyId, 's1');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('requireApprovedLld: throws ArtifactNotApprovedError when approvedAt is missing', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-gate-'));
	try {
		seedDefineAndHld(repo);
		seedLld(repo, 's1', { approved: false });
		assert.throws(() => requireApprovedLld(repo, HASH, 's1'), ArtifactNotApprovedError);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('requireApprovedLld: throws when rejectedAt is set', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-gate-'));
	try {
		seedDefineAndHld(repo);
		seedLld(repo, 's1', { approved: true, rejected: true });
		assert.throws(() => requireApprovedLld(repo, HASH, 's1'), /rejected/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('requireApprovedLld: throws when effective hash differs and no stale-ack', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-gate-'));
	try {
		seedDefineAndHld(repo);
		seedLld(repo, 's1', { approved: true, effectiveHash: 'stale-different-hash' });
		assert.throws(() => requireApprovedLld(repo, HASH, 's1'), /stale/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('requireApprovedLld: returns the LLD when stale but stale-acked', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-gate-'));
	try {
		seedDefineAndHld(repo);
		seedLld(repo, 's1', { approved: true, effectiveHash: 'stale-different-hash', staleAckedAt: '2026-01-03T00:00:00Z' });
		const lld = requireApprovedLld(repo, HASH, 's1');
		assert.equal(lld.meta.storyId, 's1');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('requireApprovedLld: throws ArtifactMissingError when no LLD exists', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-gate-'));
	try {
		seedDefineAndHld(repo);
		assert.throws(() => requireApprovedLld(repo, HASH, 's1'), ArtifactMissingError);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('readPlanUpstream: assembles { lld, hldSlice, storyDependsOn } from approved artifacts', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-gate-'));
	try {
		seedDefineAndHld(repo);
		seedLld(repo, 's1', { approved: true });
		const up = readPlanUpstream(repo, HASH, 's1');
		assert.equal(up.lld.meta.storyId, 's1');
		assert.equal(up.hldSlice.boundary.storyId, 's1');
		assert.deepEqual(up.storyDependsOn, []);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
