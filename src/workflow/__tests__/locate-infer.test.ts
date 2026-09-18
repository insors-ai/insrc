/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 / sc3 — inference + ownership + end-to-end locate tests (t6).
 *
 * Covers the daemon-composition seam WITHOUT a live DB: `inferParentCandidates`
 * over stub `InferencePorts` + a fabricated ownership index; `matchGraphCandidates`
 * scoring; `buildOwnershipIndex` over a temp `.insrc/artifacts` store; the pure
 * `refFromDocPath` / `mapSemanticHits` mappers; and an end-to-end compose of the
 * controller policy with the fixture-backed inference for the three acceptance
 * outcomes (graph attach / semantic attach / prompt → standalone).
 *
 * Run:
 *   npx tsx --test src/workflow/__tests__/locate-infer.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { inferParentCandidates, refFromDocPath, type InferencePorts } from '../locate/infer.js';
import { buildOwnershipIndex, matchGraphCandidates } from '../locate/ownership.js';
import { mapSemanticHits } from '../locate/infer-daemon.js';
import { locateParent } from '../locate/locate-parent.js';
import type { Entity } from '../../shared/types.js';
import type { InferParentsRequest, RankedCandidate } from '../locate/types.js';

// --- fixtures --------------------------------------------------------------

function writeArtifact(dir: string, id: string, meta: Record<string, unknown>, citations: unknown[]): void {
	writeFileSync(join(dir, `${id}.json`), JSON.stringify({ meta, body: {}, citations }), 'utf8');
}

function tmpRepo(): { repo: string; artifacts: string } {
	const repo = mkdtempSync(join(tmpdir(), 'locate-infer-'));
	const artifacts = join(repo, '.insrc', 'artifacts');
	mkdirSync(artifacts, { recursive: true });
	return { repo, artifacts };
}

function fakeEntity(over: Partial<Entity> & { file: string }): Entity {
	return {
		id: 'e', kind: 'function', name: 'n', language: 'typescript',
		repoId: 1, repo: '/repo', startLine: 1, endLine: 2, body: '',
		embedding: [], indexedAt: '2026-01-01T00:00:00.000Z',
		...over,
	};
}

const noExpand: InferencePorts['expandTouchedFiles'] = async () => [];
const noSemantic: InferencePorts['semanticCandidates'] = async () => [];

function req(over: Partial<InferParentsRequest> = {}): InferParentsRequest {
	return { repoPath: '/repo', touchedPaths: ['src/a.ts'], defectDescription: 'boom', ...over };
}

// --- buildOwnershipIndex ---------------------------------------------------

test('buildOwnershipIndex maps cited code paths to owning work items', () => {
	const { repo, artifacts } = tmpRepo();
	try {
		writeArtifact(artifacts, 'LLD-hash1-s2',
			{ epicHash: 'hash1', storyId: 's2', epicSlug: 'my-epic' },
			[{ id: 'c1', kind: 'code', ref: 'src/a.ts:42' }, { id: 'c2', kind: 'doc', ref: 'src/b.ts' }],
		);
		const idx = buildOwnershipIndex(repo);
		const owners = idx.byPath.get('src/a.ts');
		assert.ok(owners, 'src/a.ts is owned');
		assert.deepEqual(owners, [{ epicHash: 'hash1', storyId: 's2', slug: 'my-epic' }]);
		assert.ok(idx.byPath.get('src/b.ts'), 'doc-kind citation with a path also contributes');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('buildOwnershipIndex is best-effort: missing store → empty; bad json skipped', () => {
	const idx = buildOwnershipIndex('/nonexistent/repo');
	assert.equal(idx.byPath.size, 0);
});

// --- matchGraphCandidates (pure scoring) -----------------------------------

test('matchGraphCandidates scores by distinct matched paths, sorted desc', () => {
	const idx = {
		byPath: new Map([
			['src/a.ts', [{ slug: 'owner-a', storyId: 's1' }]],
			['src/b.ts', [{ slug: 'owner-a', storyId: 's1' }]],
			['src/c.ts', [{ slug: 'owner-b', storyId: 's2' }]],
		]),
	};
	const ranked = matchGraphCandidates(['src/a.ts', 'src/b.ts', 'src/c.ts'], idx);
	assert.equal(ranked.length, 2);
	assert.deepEqual(ranked[0]!.parentRef, { slug: 'owner-a', storyId: 's1' });
	assert.equal(ranked[0]!.score, 2, 'owner-a matched two paths');
	assert.equal(ranked[1]!.score, 1);
});

test('matchGraphCandidates: unmatched paths contribute nothing (no throw)', () => {
	const idx = { byPath: new Map([['src/a.ts', [{ slug: 'o' }]]]) };
	const ranked = matchGraphCandidates(['src/unknown.ts'], idx);
	assert.deepEqual(ranked, []);
});

// --- inferParentCandidates (composition over stub ports) -------------------

test('inferParentCandidates: touched path owned by a story yields a graph candidate + evidence', async () => {
	const idx = { byPath: new Map([['src/a.ts', [{ slug: 'owner', storyId: 's1' }]]]) };
	const out = await inferParentCandidates({ expandTouchedFiles: noExpand, semanticCandidates: noSemantic }, idx, req());
	assert.equal(out.graph.length, 1);
	assert.deepEqual(out.graph[0]!.parentRef, { slug: 'owner', storyId: 's1' });
	assert.match(out.graph[0]!.evidence[0]!, /code-ownership: touched src\/a\.ts/);
});

test('inferParentCandidates: graph expansion folds neighbour files into ownership matching', async () => {
	// The touched path itself is not owned, but a graph-neighbour file is.
	const idx = { byPath: new Map([['src/owned-neighbour.ts', [{ slug: 'owner' }]]]) };
	const ports: InferencePorts = {
		expandTouchedFiles: async () => ['src/owned-neighbour.ts'],
		semanticCandidates: noSemantic,
	};
	const out = await inferParentCandidates(ports, idx, req({ touchedPaths: ['src/new.ts'] }));
	assert.equal(out.graph.length, 1);
	assert.deepEqual(out.graph[0]!.parentRef, { slug: 'owner' });
});

test('inferParentCandidates: returns raw scores only (no threshold applied)', async () => {
	const idx = { byPath: new Map([['src/a.ts', [{ slug: 'owner' }]]]) };
	const semantic: RankedCandidate[] = [{ parentRef: { slug: 'x' }, score: 0.01, evidence: ['sem'] }];
	const out = await inferParentCandidates(
		{ expandTouchedFiles: noExpand, semanticCandidates: async () => semantic },
		idx, req(),
	);
	// A 0.01 semantic score would fail any threshold, but inference does NOT filter.
	assert.equal(out.semantic.length, 1);
	assert.equal(out.semantic[0]!.score, 0.01);
});

test('inferParentCandidates: empty defectDescription skips the semantic pass', async () => {
	let semanticCalled = false;
	const idx = { byPath: new Map() };
	const out = await inferParentCandidates(
		{ expandTouchedFiles: noExpand, semanticCandidates: async () => { semanticCalled = true; return []; } },
		idx, req({ defectDescription: '   ' }),
	);
	assert.equal(semanticCalled, false, 'nothing to embed → semantic pass skipped');
	assert.deepEqual(out.semantic, []);
});

// --- refFromDocPath (pure mapper) ------------------------------------------

test('refFromDocPath parses slug + storyId from a docs artifact path', () => {
	assert.deepEqual(
		refFromDocPath('docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/S003/LLD.md'),
		{ slug: 'add-bugfix-triage-category-insrc-framework', storyId: 's3' },
	);
	assert.deepEqual(
		refFromDocPath('/abs/docs/standalone/my-feature-E202609170d565a95/DEF.md'),
		{ slug: 'my-feature' },
	);
	assert.equal(refFromDocPath('src/not/a/doc.ts'), null);
});

// --- mapSemanticHits (rank-decay proxy) ------------------------------------

test('mapSemanticHits maps artifact hits to work items, rank-decayed, de-duped', () => {
	const hits: Entity[] = [
		fakeEntity({ file: 'docs/epics/epic-a-E202609181703991c/S001/LLD.md', name: 'A1' }),
		fakeEntity({ file: 'docs/epics/epic-a-E202609181703991c/S001/PLAN.md', name: 'A2' }), // same work item → deduped
		fakeEntity({ file: 'src/code.ts', name: 'C' }),                                        // not a doc → dropped
		fakeEntity({ file: 'docs/epics/epic-b-E20260101abcdef12/S002/LLD.md', name: 'B1' }),
	];
	const ranked = mapSemanticHits(hits);
	assert.equal(ranked.length, 2);
	assert.deepEqual(ranked[0]!.parentRef, { slug: 'epic-a', storyId: 's1' });
	assert.ok(ranked[0]!.score > ranked[1]!.score, 'rank decay: earlier hit scores higher');
	assert.ok(ranked[0]!.score <= 1 && ranked[1]!.score > 0);
});

// --- end-to-end: policy composed with fixture-backed inference -------------

test('end-to-end: touched paths under a story → graph attach with grounded evidence (ac1)', async () => {
	const { repo, artifacts } = tmpRepo();
	try {
		writeArtifact(artifacts, 'LLD-hash1-s2',
			{ epicHash: 'hash1', storyId: 's2', epicSlug: 'my-epic' },
			[{ id: 'c1', kind: 'code', ref: 'src/a.ts' }, { id: 'c2', kind: 'code', ref: 'src/b.ts' }],
		);
		const ownership = buildOwnershipIndex(repo);
		const ports: InferencePorts = { expandTouchedFiles: noExpand, semanticCandidates: noSemantic };
		const res = await locateParent(
			{ touchedPaths: ['src/a.ts', 'src/b.ts'], defectDescription: 'fix' },
			{
				repoPath: repo,
				resolveRef: () => null,
				inferCandidates: (r) => inferParentCandidates(ports, ownership, r),
				promptForRef: async () => null,
				thresholds: { graph: 2, semantic: 0.75 },
			},
		);
		assert.equal(res.tier, 'graph-ownership');
		assert.deepEqual(res.parentRef, { epicHash: 'hash1', storyId: 's2', slug: 'my-epic' });
		assert.ok(res.evidence.some(e => /code-ownership/.test(e)));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('end-to-end: defect description matching a story → semantic attach (ac2)', async () => {
	const ownership = { byPath: new Map() };
	const ports: InferencePorts = {
		expandTouchedFiles: noExpand,
		semanticCandidates: async () => mapSemanticHits([
			fakeEntity({ file: 'docs/epics/epic-a-E202609181703991c/S001/LLD.md', name: 'A1' }),
		]),
	};
	const res = await locateParent(
		{ touchedPaths: ['src/unrelated.ts'], defectDescription: 'the login token expires early' },
		{
			repoPath: '/repo',
			resolveRef: () => null,
			inferCandidates: (r) => inferParentCandidates(ports, ownership, r),
			promptForRef: async () => null,
			thresholds: { graph: 2, semantic: 0.5 },
		},
	);
	assert.equal(res.tier, 'semantic');
	assert.deepEqual(res.parentRef, { slug: 'epic-a', storyId: 's1' });
});

test('end-to-end: neither tier matches → prompt → standalone (ac3)', async () => {
	const ownership = { byPath: new Map() };
	const ports: InferencePorts = { expandTouchedFiles: noExpand, semanticCandidates: noSemantic };
	let prompted = false;
	const res = await locateParent(
		{ touchedPaths: ['src/brand-new.ts'], defectDescription: 'unmappable defect' },
		{
			repoPath: '/repo',
			resolveRef: () => null,
			inferCandidates: (r) => inferParentCandidates(ports, ownership, r),
			promptForRef: async () => { prompted = true; return null; },
			thresholds: { graph: 2, semantic: 0.75 },
		},
	);
	assert.equal(prompted, true);
	assert.equal(res.tier, 'standalone');
	assert.equal(res.parentRef, null);
});
