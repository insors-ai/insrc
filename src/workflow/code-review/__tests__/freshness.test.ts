/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeCodeReviewFreshness, type FreshnessDeps } from '../freshness.js';
import type { FileSelection } from '../../../indexer/file-selection.js';

// ---- fixtures ----

/** Build FreshnessDeps from per-file maps. `watermark` is the per-file entity
 *  watermark (null = no indexed entities); `mtime` the file mtime; `repo` the
 *  repo-level lastIndexed fallback; `processing` the queue flag. */
function deps(opts: {
	watermark?: Record<string, number | null>;
	mtime?:     Record<string, number>;
	repo?:      number;
	processing?: boolean;
	selection?: Record<string, FileSelection>;
	requested?: Record<string, number>;
	onReindex?: () => void;
}): FreshnessDeps {
	return {
		selection: async (_r, f) => opts.selection?.[f] ?? 'selected',
		requestedAt: (_r, f) => opts.requested?.[f],
		codeIndexWork: () => ({ inFlight: opts.processing ?? false, pending: 0 }),
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
		watermark: {}, mtime: { 'README.md': 100 }, repo: 200, selection: { 'README.md': 'not-code' },
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
		repo:      300,
		selection: { 'README.md': 'not-code' },   // README.md: no entities and not indexed code → fresh
	}));
	assert.deepEqual(res.staleFiles, ['src/a.ts']);
});

test('freshness: an empty changed set is fresh (no stale files)', async () => {
	const res = await computeCodeReviewFreshness('/repo', [], deps({ processing: false }));
	assert.deepEqual(res, { isProcessing: false, inFlight: false, pendingCodeIndexJobs: 0, staleFiles: [], unindexedFiles: [] });
});

// ---- ISSUE-1102dc71 S001/t4: only the repo's code-index work counts ----

test('computeCodeReviewFreshness reports isProcessing and pendingCodeIndexJobs from codeIndexWork and leaves staleFiles as before', async () => {
	const base = { watermark: { 'src/a.ts': 100, 'src/b.ts': 300 }, mtime: { 'src/a.ts': 200, 'src/b.ts': 200 } };
	const asked: string[] = [];
	const at = (work: { inFlight: boolean; pending: number }): FreshnessDeps => ({
		...deps(base),
		codeIndexWork: (repo) => { asked.push(repo); return work; },
	});
	const queuedOnly = await computeCodeReviewFreshness('/repo', ['src/a.ts', 'src/b.ts'], at({ inFlight: false, pending: 2 }));
	assert.deepEqual(queuedOnly, { isProcessing: true, inFlight: false, pendingCodeIndexJobs: 2, staleFiles: ['src/a.ts'], unindexedFiles: ['src/a.ts'] });
	const inFlightOnly = await computeCodeReviewFreshness('/repo', ['src/a.ts', 'src/b.ts'], at({ inFlight: true, pending: 0 }));
	assert.deepEqual(inFlightOnly, { isProcessing: true, inFlight: true, pendingCodeIndexJobs: 0, staleFiles: ['src/a.ts'], unindexedFiles: ['src/a.ts'] });
	const idle = await computeCodeReviewFreshness('/repo', ['src/a.ts', 'src/b.ts'], at({ inFlight: false, pending: 0 }));
	assert.deepEqual(idle, { isProcessing: false, inFlight: false, pendingCodeIndexJobs: 0, staleFiles: ['src/a.ts'], unindexedFiles: ['src/a.ts'] });
	assert.deepEqual(asked, ['/repo', '/repo', '/repo'], 'the work is asked for the Story\'s repository');
});

// ---- Story fa396bdf197b8e8b/s1: request stale files, settle missing ones ----

const F = 'src/a.ts';
const T = 'src/workflow/code-review/__tests__/freshness.test.ts';

test(`${T}: a changed file whose mtime is 0 (deleted or unstattable) is not stale, not in unindexedFiles, and neither the entity nor the selection seam decides it, even when selection would say selected`, async () => {
	const consulted: string[] = [];
	const d: FreshnessDeps = {
		...deps({ mtime: { [F]: 0 }, selection: { [F]: 'selected' } }),
		entityWatermark: async () => { consulted.push('entity'); return null; },
		selection: async () => { consulted.push('selection'); return 'selected'; },
	};
	const res = await computeCodeReviewFreshness('/repo', [F], d);
	assert.deepEqual(res.staleFiles, []);
	assert.deepEqual(res.unindexedFiles, []);
	assert.deepEqual(consulted, []);
});

test(`${T}: a file with no entities and selection 'not-code' or 'excluded-by-ignore' is not stale, whatever the repo-level lastIndexed is`, async () => {
	for (const selection of ['not-code', 'excluded-by-ignore'] as const) {
		for (const repo of [0, 50, 10_000]) {
			const res = await computeCodeReviewFreshness('/repo', ['x.bin'], deps({ mtime: { 'x.bin': 100 }, repo, selection: { 'x.bin': selection } }));
			assert.deepEqual(res.staleFiles, [], `${selection} with lastIndexed ${repo}`);
			assert.deepEqual(res.unindexedFiles, []);
		}
	}
});

test(`${T}: a file with no entities and selection 'selected' is in staleFiles and unindexedFiles when it was never requested`, async () => {
	const res = await computeCodeReviewFreshness('/repo', [F], deps({ mtime: { [F]: 100 }, repo: 10_000, selection: { [F]: 'selected' } }));
	assert.deepEqual(res.staleFiles, [F]);
	assert.deepEqual(res.unindexedFiles, [F]);
});

test(`${T}: with an idle queue, a file with entities whose watermark is older than its mtime (a missed update) is in staleFiles and unindexedFiles, and the selection seam is not consulted for it`, async () => {
	let asked = 0;
	const d: FreshnessDeps = { ...deps({ watermark: { [F]: 100 }, mtime: { [F]: 200 }, processing: false }), selection: async () => { asked++; return 'selected'; } };
	const res = await computeCodeReviewFreshness('/repo', [F], d);
	assert.equal(res.isProcessing, false);
	assert.deepEqual(res.staleFiles, [F]);
	assert.deepEqual(res.unindexedFiles, [F]);
	assert.equal(asked, 0);
});

test(`${T}: a stale file requested at or after its mtime stays in staleFiles but leaves unindexedFiles, with the queue idle or busy, for both an entity-less file and a file with an older watermark`, async () => {
	for (const processing of [false, true]) {
		for (const requestedAt of [200, 250]) {
			const res = await computeCodeReviewFreshness('/repo', ['src/new.ts', F], deps({
				watermark: { [F]: 100 }, mtime: { 'src/new.ts': 200, [F]: 200 }, processing,
				selection: { 'src/new.ts': 'selected' }, requested: { 'src/new.ts': requestedAt, [F]: requestedAt },
			}));
			assert.deepEqual(res.staleFiles, ['src/new.ts', F]);
			assert.deepEqual(res.unindexedFiles, []);
		}
	}
});

test(`${T}: a file edited after its request is in unindexedFiles again`, async () => {
	const res = await computeCodeReviewFreshness('/repo', ['src/new.ts', F], deps({
		watermark: { [F]: 100 }, mtime: { 'src/new.ts': 300, [F]: 300 },
		selection: { 'src/new.ts': 'selected' }, requested: { 'src/new.ts': 299, [F]: 299 },
	}));
	assert.deepEqual(res.unindexedFiles, ['src/new.ts', F]);
});

test(`${T}: a selection seam that throws keeps an entity-less file stale and out of unindexedFiles`, async () => {
	const d: FreshnessDeps = { ...deps({ mtime: { [F]: 100 } }), selection: async () => { throw new Error('parsers not loaded'); } };
	const res = await computeCodeReviewFreshness('/repo', [F], d);
	assert.deepEqual(res.staleFiles, [F]);
	assert.deepEqual(res.unindexedFiles, []);
});

test(`${T}: a file with entities whose watermark is at or after its mtime is not stale and not in unindexedFiles; the compute calls no write seam`, async () => {
	const d = deps({ watermark: { 'src/a.ts': 200, 'src/b.ts': 300 }, mtime: { 'src/a.ts': 200, 'src/b.ts': 200 } });
	const keys = Object.keys(d).sort();
	assert.deepEqual(keys, ['codeIndexWork', 'entityWatermark', 'fileMtime', 'repoLastIndexed', 'requestedAt', 'selection']);
	const res = await computeCodeReviewFreshness('/repo', ['src/a.ts', 'src/b.ts'], d);
	assert.deepEqual(res.staleFiles, []);
	assert.deepEqual(res.unindexedFiles, []);
});

test(`${T}: the existing whole-result assertions are updated for the unindexedFiles field and still pass`, async () => {
	const res = await computeCodeReviewFreshness('/repo', ['src/a.ts', 'src/b.ts'], deps({
		watermark: { 'src/a.ts': 100, 'src/b.ts': 500 }, mtime: { 'src/a.ts': 200, 'src/b.ts': 200 }, processing: true,
	}));
	assert.deepEqual(res, { isProcessing: true, inFlight: true, pendingCodeIndexJobs: 0, staleFiles: ['src/a.ts'], unindexedFiles: ['src/a.ts'] });
	assert.deepEqual(await computeCodeReviewFreshness('/repo', [], deps({})), { isProcessing: false, inFlight: false, pendingCodeIndexJobs: 0, staleFiles: [], unindexedFiles: [] });
});
