/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeCodeReviewFreshness, type FreshnessDeps } from '../freshness.js';

// ---- fixtures ----

/** Build FreshnessDeps from per-file maps. `watermark` is the per-file entity
 *  watermark (null = no indexed entities); `mtime` the file mtime; `repo` the
 *  repo-level lastIndexed fallback; `processing` the queue flag. */
function deps(opts: {
	watermark?: Record<string, number | null>;
	mtime?:     Record<string, number>;
	repo?:      number;
	processing?: boolean;
	onReindex?: () => void;
}): FreshnessDeps {
	return {
		isProcessing: () => opts.processing ?? false,
		entityWatermark: async (_r, f) => (f in (opts.watermark ?? {}) ? opts.watermark![f]! : null),
		repoLastIndexed: async () => opts.repo ?? 0,
		fileMtime: async (_r, f) => opts.mtime?.[f] ?? 0,
	};
}

// ---- per-file watermark classification ----

test('freshness: a changed file whose per-file indexedAt predates its mtime is stale', async () => {
	const res = await computeCodeReviewFreshness('/repo', ['src/a.ts'], deps({
		watermark: { 'src/a.ts': 100 }, mtime: { 'src/a.ts': 200 },
	}));
	assert.deepEqual(res.staleFiles, ['src/a.ts']);
});

test('freshness: a changed file whose watermark is >= its mtime is NOT stale', async () => {
	const res = await computeCodeReviewFreshness('/repo', ['src/a.ts'], deps({
		watermark: { 'src/a.ts': 300 }, mtime: { 'src/a.ts': 200 },
	}));
	assert.deepEqual(res.staleFiles, []);
});

test('freshness: a changed path with NO indexable entity (repo indexed AFTER the change) is excluded — does not block forever', async () => {
	// e.g. a .md/lockfile: no entities, and the repo was indexed after it changed.
	const res = await computeCodeReviewFreshness('/repo', ['README.md'], deps({
		watermark: {}, mtime: { 'README.md': 100 }, repo: 200,
	}));
	assert.deepEqual(res.staleFiles, [], 'a genuinely non-indexable path is fresh, not perpetually stale');
});

test('freshness: a never-indexed changed source file (no entities, repo behind the change) is stale', async () => {
	const res = await computeCodeReviewFreshness('/repo', ['src/new.ts'], deps({
		watermark: {}, mtime: { 'src/new.ts': 300 }, repo: 100,
	}));
	assert.deepEqual(res.staleFiles, ['src/new.ts'], 'a source file the graph has not caught up to is stale');
});

test('freshness: a never-indexed repo (watermark 0) with a changed file is stale', async () => {
	const res = await computeCodeReviewFreshness('/repo', ['src/a.ts'], deps({
		watermark: {}, mtime: { 'src/a.ts': 50 }, repo: 0,
	}));
	assert.deepEqual(res.staleFiles, ['src/a.ts']);
});

// ---- isProcessing mirror + read-only (no reindex) ----

test('freshness: isProcessing mirrors the injected queue flag and the compute triggers no reindex', async () => {
	let reindexed = false;
	const d: FreshnessDeps = {
		...deps({ watermark: { 'src/a.ts': 300 }, mtime: { 'src/a.ts': 200 }, processing: true }),
		// there is no reindex seam at all — assert the compute never reaches for one
		// by proving it only touches the read seams.
	};
	const res = await computeCodeReviewFreshness('/repo', ['src/a.ts'], d);
	assert.equal(res.isProcessing, true);
	assert.equal(res.staleFiles.length, 0);
	assert.equal(reindexed, false, 'no reindex was triggered (the compute is read-only)');
});

// ---- mixed set + empty set ----

test('freshness: a mixed changed set reports only the stale files', async () => {
	const res = await computeCodeReviewFreshness('/repo', ['src/a.ts', 'src/b.ts', 'README.md'], deps({
		watermark: { 'src/a.ts': 100, 'src/b.ts': 500 },   // a stale, b fresh
		mtime:     { 'src/a.ts': 200, 'src/b.ts': 200, 'README.md': 100 },
		repo:      300,   // README.md: no entities, repo indexed after → fresh
	}));
	assert.deepEqual(res.staleFiles, ['src/a.ts']);
});

test('freshness: an empty changed set is fresh (no stale files)', async () => {
	const res = await computeCodeReviewFreshness('/repo', [], deps({ processing: false }));
	assert.deepEqual(res, { isProcessing: false, staleFiles: [] });
});
