/**
 * plans/exploration-based-context-build.md Section 7. Tests for
 * the exploration cache CRUD:
 *   - put + get round-trip
 *   - key derivation stability (same params -> same key -> cache hit)
 *   - lastIndexedAt invalidation (different watermark -> cache miss)
 *   - repo scoping (repo A miss doesn't hit repo B row)
 *   - delete-for-repo cascade
 *   - unregistered repo returns null on get / no-op on put
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import {
	deleteCachedExplorationsForRepo,
	getCachedExploration,
	hashExplorationParams,
	putCachedExploration,
} from '../exploration-cache.js';
import { addRepo } from '../repos.js';
import type { RegisteredRepo } from '../../shared/types.js';
import type { Exploration, ExplorationOutput } from '../../analyze/explore/types.js';

const REPO_A = '/repo/alpha';
const REPO_B = '/repo/bravo';
const NOW = '2026-07-10T10:00:00.000Z';
let dir: string;

function makeExp(overrides: Partial<Exploration> = {}): Exploration {
	return {
		id:      overrides.id      ?? 'e1',
		type:    overrides.type    ?? 'concept.resolve',
		purpose: overrides.purpose ?? 'test probe',
		params:  overrides.params  ?? { query: 'payable extraction' },
		...(overrides.dependsOn !== undefined ? { dependsOn: overrides.dependsOn } : {}),
	};
}

function makeOutput(overrides: Partial<ExplorationOutput> = {}): ExplorationOutput {
	return (overrides.type !== undefined ? overrides : {
		type:  'concept.resolve',
		query: 'payable extraction',
		hits:  [{
			kind:  'dir',
			path:  '/repo/alpha/insors/extraction/payable',
			name:  'payable',
			score: 0.85,
			diagnostics: { tokenMatch: 0.9, pathDepth: 3 },
		}],
	}) as ExplorationOutput;
}

async function registerRepo(path: string): Promise<void> {
	const r: RegisteredRepo = {
		path, name: '', addedAt: NOW, status: 'pending',
	};
	await addRepo(null, r);
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-exploration-cache-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await registerRepo(REPO_A);
	await registerRepo(REPO_B);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

test('put + get round-trip', async () => {
	const exp = makeExp();
	const out = makeOutput();
	await putCachedExploration(REPO_A, 1_000n, exp, out);
	const got = await getCachedExploration(REPO_A, 1_000n, exp);
	assert.deepEqual(got, out);
});

test('get returns null on cache miss (never written)', async () => {
	const got = await getCachedExploration(REPO_A, 1_000n, makeExp());
	assert.equal(got, null);
});

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

test('same exploration params produce the same hash', () => {
	const h1 = hashExplorationParams(makeExp({ params: { query: 'foo', limit: 20 } }));
	const h2 = hashExplorationParams(makeExp({ params: { limit: 20, query: 'foo' } }));
	assert.equal(h1, h2, 'param key order should not matter (canonical sort)');
});

test('different exploration types produce distinct hashes', () => {
	const h1 = hashExplorationParams(makeExp({ type: 'concept.resolve', params: { x: 1 } }));
	const h2 = hashExplorationParams(makeExp({ type: 'symbol.locate',   params: { x: 1 } }));
	assert.notEqual(h1, h2);
});

test('nested params still canonicalise deterministically', () => {
	const h1 = hashExplorationParams(makeExp({
		params: { outer: { a: 1, b: 2 } },
	}));
	const h2 = hashExplorationParams(makeExp({
		params: { outer: { b: 2, a: 1 } },
	}));
	assert.equal(h1, h2);
});

// ---------------------------------------------------------------------------
// lastIndexedAt invalidation
// ---------------------------------------------------------------------------

test('different lastIndexedAt produces cache miss', async () => {
	const exp = makeExp();
	const out = makeOutput();
	await putCachedExploration(REPO_A, 1_000n, exp, out);
	const stale = await getCachedExploration(REPO_A, 2_000n, exp);
	assert.equal(stale, null);
});

// ---------------------------------------------------------------------------
// Repo scoping
// ---------------------------------------------------------------------------

test('repo scoping: repo A row is not visible to repo B lookup', async () => {
	const exp = makeExp();
	const out = makeOutput();
	await putCachedExploration(REPO_A, 1_000n, exp, out);
	const inB = await getCachedExploration(REPO_B, 1_000n, exp);
	assert.equal(inB, null);
});

// ---------------------------------------------------------------------------
// Delete for repo
// ---------------------------------------------------------------------------

test('deleteCachedExplorationsForRepo drops every row for the repo', async () => {
	const exp1 = makeExp({ id: 'e1', params: { query: 'foo' } });
	const exp2 = makeExp({ id: 'e2', params: { query: 'bar' } });
	await putCachedExploration(REPO_A, 1_000n, exp1, makeOutput());
	await putCachedExploration(REPO_A, 1_000n, exp2, makeOutput());
	await putCachedExploration(REPO_B, 1_000n, exp1, makeOutput());

	await deleteCachedExplorationsForRepo(REPO_A);

	assert.equal(await getCachedExploration(REPO_A, 1_000n, exp1), null);
	assert.equal(await getCachedExploration(REPO_A, 1_000n, exp2), null);
	// Repo B row survives
	assert.notEqual(await getCachedExploration(REPO_B, 1_000n, exp1), null);
});

// ---------------------------------------------------------------------------
// Unregistered repo handling
// ---------------------------------------------------------------------------

test('put + get on unregistered repo is a no-op / null', async () => {
	const exp = makeExp();
	// putCachedExploration silently no-ops (lookupRepoIdInTxn -> undefined)
	await putCachedExploration('/repo/nope', 1_000n, exp, makeOutput());
	// getCachedExploration returns null
	const got = await getCachedExploration('/repo/nope', 1_000n, exp);
	assert.equal(got, null);
});
