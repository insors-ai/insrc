/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Scoping feature: `define`'s new-vs-extend first step + the extend
 * execution path (append Story + `storyBoundary.addStory` amendment).
 *
 * Unit coverage here; the full MCP extend walk lives in
 * `mcp/workflow-step/__tests__/define-extend-e2e.test.ts`.
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/scope-extend.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { approveArtifactByJsonPath, appendStoryToDefine, epicCatalog, nextStoryId } from '../gates.js';
import { defineArtifactPaths } from '../storage.js';
import { applyAmendments } from '../amendments/applier.js';
import type { AmendmentRecord } from '../amendments/types.js';
import type { DefineArtifact, DefineStory } from '../artifacts/define.js';
import type { HldBody } from '../artifacts/hld.js';

const HASH = 'a3f4b8c9d1e2f3a4';

function seedDefine(repo: string, opts: { approved: boolean; slug?: string; stories?: DefineStory[] } = { approved: true }): string {
	const paths = defineArtifactPaths(repo, HASH);
	mkdirSync(dirname(paths.json), { recursive: true });
	const define: DefineArtifact = {
		meta: { workflow: 'define', runId: 'r1', repoPath: repo, createdAt: 'x', model: 'client', elapsedMs: 0, repoIndexedAt: 'x', schemaVersion: 1, epicHash: HASH, epicSlug: opts.slug ?? 'tag-filtering' },
		body: {
			flavor: 'enhancement',
			problem: 'Users cannot filter todos by tag today; only status filtering exists.',
			nonGoals: [],
			assumptions: [],
			constraints: [{ id: 'k1', text: 'Reuse sidebar', type: 'convention', source: 'c1' }],
			stories: opts.stories ?? [
				{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] },
			],
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	};
	writeFileSync(paths.json, JSON.stringify(define, null, 2) + '\n');
	if (opts.approved) approveArtifactByJsonPath(paths.json);
	return paths.json;
}

// ---------------------------------------------------------------------------
// epicCatalog
// ---------------------------------------------------------------------------

test('epicCatalog enumerates Epics with problem + stories + approved flag', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-cat-'));
	try {
		seedDefine(repo, { approved: true });
		const cat = epicCatalog(repo);
		assert.equal(cat.length, 1);
		assert.equal(cat[0]!.epicHash, HASH);
		assert.equal(cat[0]!.epicSlug, 'tag-filtering');
		assert.equal(cat[0]!.approved, true);
		assert.match(cat[0]!.problem, /filter todos by tag/);
		assert.deepEqual(cat[0]!.stories, [{ id: 's1', title: 'Filter by tag' }]);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('epicCatalog marks an un-approved Epic as not approved + returns [] for an empty repo', () => {
	const empty = mkdtempSync(join(tmpdir(), 'insrc-cat0-'));
	const repo = mkdtempSync(join(tmpdir(), 'insrc-cat1-'));
	try {
		assert.deepEqual(epicCatalog(empty), []);
		seedDefine(repo, { approved: false });
		assert.equal(epicCatalog(repo)[0]!.approved, false);
	} finally {
		rmSync(empty, { recursive: true, force: true });
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// nextStoryId + appendStoryToDefine
// ---------------------------------------------------------------------------

test('nextStoryId returns s<max+1>', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-nid-'));
	try {
		seedDefine(repo, { approved: true, stories: [
			{ id: 's1', title: 'a', userValue: 'v', acceptanceCriteria: [] },
			{ id: 's3', title: 'b', userValue: 'v', acceptanceCriteria: [] },
		] });
		const define = JSON.parse(readFileSync(defineArtifactPaths(repo, HASH).json, 'utf8')) as DefineArtifact;
		assert.equal(nextStoryId(define), 's4');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('appendStoryToDefine appends the Story, re-renders md, and retains approval', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-app-'));
	try {
		const jsonPath = seedDefine(repo, { approved: true });
		const before = JSON.parse(readFileSync(jsonPath, 'utf8')) as DefineArtifact;
		assert.ok(before.meta.approvedAt);
		const story: DefineStory = { id: 's2', title: 'Filter by multiple tags', userValue: 'power users triage faster', acceptanceCriteria: [{ id: 'ac1', given: 'tagged todos', when: 'user picks two tags', then: 'union is shown', operationalizes: [] }] };
		const next = appendStoryToDefine(repo, HASH, story);
		assert.equal(next.body.stories.length, 2);
		assert.equal(next.body.stories[1]!.id, 's2');
		// approval preserved
		assert.equal(next.meta.approvedAt, before.meta.approvedAt);
		const onDisk = JSON.parse(readFileSync(jsonPath, 'utf8')) as DefineArtifact;
		assert.equal(onDisk.body.stories.length, 2);
		// md re-rendered with the new story title
		const mdPath = defineArtifactPaths(repo, HASH, next.meta.epicSlug).md;
		assert.ok(existsSync(mdPath));
		assert.match(readFileSync(mdPath, 'utf8'), /Filter by multiple tags/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('appendStoryToDefine rejects a duplicate story id', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-dup-'));
	try {
		seedDefine(repo, { approved: true });
		assert.throws(
			() => appendStoryToDefine(repo, HASH, { id: 's1', title: 'dup', userValue: 'v', acceptanceCriteria: [] }),
			/already exists/,
		);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// applyAddStory (via applyAmendments)
// ---------------------------------------------------------------------------

function baseHldBody(): HldBody {
	return {
		frameworkSummary: 'x', architectureShape: 'x [[c1]]',
		sharedContracts: [{ id: 'sc1', name: 'API', purpose: 'p', interfaceSketch: 'interface API {}', ownedByStory: 's1', consumedByStories: [], assumptions: ['c1'] }],
		storyBoundaries: [{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'private' }],
		nonFunctional: { performance: 'fast' },
		rolloutOverview: { phases: [{ name: 'A', includesStories: ['s1'], rationale: 'r', backwardCompat: '', featureFlag: null }], orderingRationale: 'r', riskyBits: [] },
		alternativesConsidered: [
			{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' },
			{ id: 'a2', name: 'y', oneLineSummary: 'y', approach: 'y', pros: ['y'], cons: ['y'], costEstimate: 'S', reasonRejected: 'x' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
	} as unknown as HldBody;
}

function addStoryRecord(storyId: string): AmendmentRecord {
	return {
		id: `AMD-${HASH}-1`, epicHash: HASH, epicSlug: 'tag-filtering', hldBaseRunId: 'hld-1',
		amendment: { type: 'storyBoundary.addStory', storyId, internal: `private to ${storyId}` },
		rationale: 'extend', citations: [],
		proposedBy: { workflow: 'define', runId: 'r2', storyId, stepId: 'scope.assess' },
		proposedAt: 'x', status: 'approved', approvedAt: 'x', approvedBy: 'u',
	};
}

test('applyAddStory appends a new StoryBoundary to the effective HLD', () => {
	const next = applyAmendments(baseHldBody(), [addStoryRecord('s2')]);
	assert.equal(next.storyBoundaries.length, 2);
	const added = next.storyBoundaries.find(b => b.storyId === 's2');
	assert.ok(added);
	assert.equal(added!.internal, 'private to s2');
});

test('applyAddStory rejects a story id that already has a boundary', () => {
	assert.throws(() => applyAmendments(baseHldBody(), [addStoryRecord('s1')]), /already has a boundary/);
});
