/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc workflow chain` — status + next-action decision tree tests.
 *
 * Seeds various on-disk states (no Define / unapproved Define /
 * approved Define + no HLD / approved HLD + no LLD / stale LLD /
 * pending amendment / all approved) and asserts the returned
 * next-action.
 *
 * Every Epic is addressed by a 16-char hash under the new layout;
 * markdown lives in `docs/`, canonical JSON in `.insrc/artifacts/`.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/chain.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { approveArtifactByJsonPath } from '../gates.js';
import { defineArtifactPaths, hldArtifactPaths, lldArtifactPaths, writeAtomic } from '../storage.js';
import { buildChainReport, formatChainReport } from '../chain.js';
import { computeHldEffectiveHash } from '../artifacts/lld.js';
import { proposeAmendment } from '../amendments/store.js';
import type { AmendmentRecord } from '../amendments/types.js';

const HASH = 'a3f4b8c9d1e2f3a4';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function writeDefine(repo: string, epicHash: string, opts: { stories: string[] } = { stories: ['s1', 's2'] }): string {
	const paths = defineArtifactPaths(repo, epicHash);
	mkdirSync(dirname(paths.json), { recursive: true });
	writeAtomic(paths.json, JSON.stringify({
		meta: {
			workflow: 'define', runId: 'def-1', schemaVersion: 1,
			epicHash, epicSlug: 'test-epic',
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

function writeHld(repo: string, epicHash: string, runId: string): { path: string; runId: string } {
	const paths = hldArtifactPaths(repo, epicHash);
	mkdirSync(dirname(paths.json), { recursive: true });
	writeAtomic(paths.json, JSON.stringify({
		meta: {
			workflow: 'design.epic', runId, schemaVersion: 1,
			epicHash, epicSlug: 'test-epic',
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

function writeLld(repo: string, epicHash: string, storyId: string, hldRunId: string, effectiveHash: string): string {
	const paths = lldArtifactPaths(repo, epicHash, storyId);
	mkdirSync(dirname(paths.json), { recursive: true });
	writeAtomic(paths.json, JSON.stringify({
		meta: {
			workflow: 'design.story', runId: `lld-${storyId}`, schemaVersion: 1,
			epicHash, epicSlug: 'test-epic', storyId,
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

function pendingAmendment(epicHash: string, id: string, baseRunId: string): AmendmentRecord {
	return {
		id, epicHash, epicSlug: 'test-epic', hldBaseRunId: baseRunId,
		amendment: {
			type: 'sharedContract.fieldAdd', contractId: 'sc1',
			field: { name: 'x', type: 'string', optional: true, purpose: 'x' }, breaking: false,
		},
		rationale: 'x', citations: [],
		proposedBy: { workflow: 'design.story', runId: 'lld-1', storyId: 's1', stepId: 's4' },
		proposedAt: new Date().toISOString(),
		status: 'pending',
	};
}

// ---------------------------------------------------------------------------
// Decision tree
// ---------------------------------------------------------------------------

test('chain: no artifacts → next-action run-define', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-'));
	try {
		const r = buildChainReport(repo, HASH);
		assert.equal(r.nextAction.kind, 'run-define');
		assert.equal(r.define.exists, false);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('chain: unapproved Define → approve-define', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-'));
	try {
		writeDefine(repo, HASH);
		const r = buildChainReport(repo, HASH);
		assert.equal(r.nextAction.kind, 'approve-define');
		assert.equal(r.define.exists, true);
		assert.equal(r.define.approved, false);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('chain: approved Define, no HLD → run-hld', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-'));
	try {
		const path = writeDefine(repo, HASH);
		approveArtifactByJsonPath(path);
		const r = buildChainReport(repo, HASH);
		assert.equal(r.nextAction.kind, 'run-hld');
		assert.equal(r.define.approved, true);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('chain: unapproved HLD → approve-hld', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-'));
	try {
		approveArtifactByJsonPath(writeDefine(repo, HASH));
		writeHld(repo, HASH, 'hld-1');
		const r = buildChainReport(repo, HASH);
		assert.equal(r.nextAction.kind, 'approve-hld');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('chain: approved HLD, no LLDs → run-lld for first Story', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-'));
	try {
		approveArtifactByJsonPath(writeDefine(repo, HASH));
		approveArtifactByJsonPath(writeHld(repo, HASH, 'hld-1').path);
		const r = buildChainReport(repo, HASH);
		assert.equal(r.nextAction.kind, 'run-lld');
		if (r.nextAction.kind === 'run-lld') {
			assert.equal(r.nextAction.storyId, 's1');
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('chain: unapproved LLD blocks the chain → approve-lld', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-'));
	try {
		approveArtifactByJsonPath(writeDefine(repo, HASH));
		approveArtifactByJsonPath(writeHld(repo, HASH, 'hld-1').path);
		const hash = computeHldEffectiveHash('hld-1', []);
		writeLld(repo, HASH, 's1', 'hld-1', hash);
		const r = buildChainReport(repo, HASH);
		assert.equal(r.nextAction.kind, 'approve-lld');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('chain: pending amendment surfaces before further LLDs', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-'));
	try {
		approveArtifactByJsonPath(writeDefine(repo, HASH));
		approveArtifactByJsonPath(writeHld(repo, HASH, 'hld-1').path);
		proposeAmendment(repo, pendingAmendment(HASH, `AMD-${HASH}-1`, 'hld-1'));
		const r = buildChainReport(repo, HASH);
		assert.equal(r.nextAction.kind, 'review-amendment');
		assert.equal(r.amendments.pending, 1);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('chain: all Stories approved, no tracker → push-tracker', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-'));
	try {
		approveArtifactByJsonPath(writeDefine(repo, HASH, { stories: ['s1'] }));
		approveArtifactByJsonPath(writeHld(repo, HASH, 'hld-1').path);
		const hash = computeHldEffectiveHash('hld-1', []);
		approveArtifactByJsonPath(writeLld(repo, HASH, 's1', 'hld-1', hash));
		const r = buildChainReport(repo, HASH);
		assert.equal(r.nextAction.kind, 'push-tracker');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

test('formatChainReport prints all section headers', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-chain-'));
	try {
		const r = buildChainReport(repo, HASH);
		const md = formatChainReport(r);
		assert.ok(md.includes(`# Chain status: ${HASH}`));
		assert.ok(md.includes('## Define'));
		assert.ok(md.includes('## HLD'));
		assert.ok(md.includes('## Amendments'));
		assert.ok(md.includes('## Tracker'));
		assert.ok(md.includes('## Next action'));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
