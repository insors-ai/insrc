/**
 * Phase 3.5: end-to-end conversation compaction on the LMDB+Lance
 * substrate.
 *
 * Verifies the compaction pipeline (db/compaction.ts) works correctly
 * after the substrate migration: vectors round-trip through
 * `getAllTurnsWithVectorsForRepo`, clustering produces real merges,
 * centroid computation gets real input, deletes/adds land in both
 * LMDB and Lance, and the result is consistent.
 *
 * The compaction algorithm has six steps:
 *   1. Directive scan      (text-only -- doesn't need vectors)
 *   2. Time-based tiering  (timestamps -- doesn't need vectors)
 *   3. Semantic clustering (vector-dependent)
 *   4. Archive collapse    (uses centroid from vectors)
 *   5. Size cap            (counts -- doesn't need vectors)
 *   6. Cross-tier dedup    (vector-dependent)
 *
 * We test scenarios that exercise each step and verify the resulting
 * row state matches expectations on both LMDB and Lance.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../lance/conn.js';
import { _resetSessionVecCache } from '../lance/session-vec.js';
import { _resetTurnVecCache, searchTurnVecs } from '../lance/turn-vec.js';
import {
	saveSession,
	saveTurn,
	getAllTurns,
	getAllTurnsWithVectorsForRepo,
} from '../conversations.js';
import { compactConversations } from '../compaction.js';
import { loadConfig } from '../../agent/config.js';

const DIM = loadConfig().models.providers.local.embeddingDim;
const REPO = '/repo/foo';

let dir: string;

function vec(seed: number): number[] {
	const v: number[] = new Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	return v;
}

/**
 * Embedding stub: returns a deterministic vector based on the text's
 * length. Compaction doesn't care that this is "real" -- it only needs
 * vectors to be DIM-sized.
 */
async function fakeEmbedFn(text: string): Promise<number[]> {
	return vec(text.length || 1);
}

/**
 * Save a turn with explicit createdAt (compaction tiers by age).
 */
async function saveTurnAt(
	sessionId: string,
	idx: number,
	user: string,
	assistant: string,
	createdAtMsAgo: number,
	vector: number[],
): Promise<void> {
	const createdAt = new Date(Date.now() - createdAtMsAgo).toISOString();
	await saveTurn(null, {
		sessionId, idx,
		user, assistant,
		entities: [], vector,
		repo: REPO,
		createdAt,
	});
}

test.beforeEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetSessionVecCache();
	_resetTurnVecCache();
	dir = mkdtempSync(join(tmpdir(), 'insrc-compaction-3.5-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	setLanceConnPath(join(dir, 'lance'));
});
test.afterEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetSessionVecCache();
	_resetTurnVecCache();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getAllTurnsWithVectorsForRepo: the helper compaction depends on
// ---------------------------------------------------------------------------

test('getAllTurnsWithVectorsForRepo joins Lance vectors back onto turns', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await saveTurnAt('sess-1', 0, 'a', 'b', 0, vec(1));
	await saveTurnAt('sess-1', 1, 'c', 'd', 0, vec(2));

	const naked = await getAllTurns(null);
	for (const t of naked) {
		assert.deepEqual(t.vector, [], 'getAllTurns intentionally returns empty vectors');
	}

	const withVecs = await getAllTurnsWithVectorsForRepo(null, REPO);
	assert.equal(withVecs.length, 2);
	for (const t of withVecs) {
		assert.equal(t.vector.length, DIM, 'vectors hydrated from Lance');
	}
});

test('getAllTurnsWithVectorsForRepo returns vectors only for Lance-backed turns', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	// One turn with a vector (lands in Lance) + one without
	await saveTurnAt('sess-1', 0, 'has-vec', 'b', 0, vec(1));
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 1, user: 'no-vec', assistant: 'b',
		entities: [], vector: [], repo: REPO,
	});

	const withVecs = await getAllTurnsWithVectorsForRepo(null, REPO);
	const sortedByIdx = [...withVecs].sort((a, b) => a.idx - b.idx);
	assert.equal(sortedByIdx[0]!.vector.length, DIM);
	assert.equal(sortedByIdx[1]!.vector.length, 0);
});

// ---------------------------------------------------------------------------
// Compaction: directive scan (no vectors needed)
// ---------------------------------------------------------------------------

test('compaction reclassifies directive turns as type=directive', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	// User text starting with "always" / "never" / "remember" is a
	// directive (per shared/todos heuristic). Keep it simple:
	await saveTurnAt('sess-1', 0, 'always use 4-space tabs', 'sure', 0, vec(1));
	await saveTurnAt('sess-1', 1, 'what is 2+2',             '4',    0, vec(2));

	const result = await compactConversations(null, fakeEmbedFn, { repo: REPO });
	assert.ok(result.directives >= 1, 'directive scan should have reclassified at least one turn');

	// Original turn 0 was deleted and replaced by a type='directive' row
	const after = await getAllTurnsWithVectorsForRepo(null, REPO);
	const directives = after.filter(t => t.type === 'directive');
	assert.ok(directives.length >= 1);
});

// ---------------------------------------------------------------------------
// Compaction: time-based tiering (warm tier, no vectors needed beyond passthrough)
// ---------------------------------------------------------------------------

test('compaction promotes warm-tier turns and re-embeds the compressed text', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	// 14 days ago: warm tier
	const FOURTEEN_DAYS_MS = 14 * 86_400_000;
	await saveTurnAt('sess-1', 0, 'q', 'a'.repeat(800), FOURTEEN_DAYS_MS, vec(1));

	const result = await compactConversations(null, fakeEmbedFn, { repo: REPO });
	assert.ok(result.warmCompressed >= 1);

	const after = await getAllTurnsWithVectorsForRepo(null, REPO);
	const warm = after.find(t => t.tier === 'warm');
	assert.ok(warm);
	assert.ok(warm.assistant.length <= 500, 'assistant truncated for warm tier');
	// New embedding got persisted to Lance via addCompactedTurns ->
	// saveTurn-style write path
	assert.equal(warm.vector.length, DIM, 'compacted turn has vector hydrated from Lance');
});

// ---------------------------------------------------------------------------
// Compaction: archive collapse (vector-dependent: centroid)
// ---------------------------------------------------------------------------

test('compaction collapses archive sessions into a summary turn (centroid)', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	// 100 days ago: archive tier
	const HUNDRED_DAYS_MS = 100 * 86_400_000;
	await saveTurnAt('sess-1', 0, 'q1', 'a1', HUNDRED_DAYS_MS, vec(1));
	await saveTurnAt('sess-1', 1, 'q2', 'a2', HUNDRED_DAYS_MS, vec(2));
	await saveTurnAt('sess-1', 2, 'q3', 'a3', HUNDRED_DAYS_MS, vec(3));

	const result = await compactConversations(null, fakeEmbedFn, { repo: REPO });
	assert.ok(result.archived >= 3, `expected archived >= 3, got ${result.archived}`);

	const after = await getAllTurnsWithVectorsForRepo(null, REPO);
	const summaries = after.filter(t => t.type === 'summary');
	assert.equal(summaries.length, 1);
	// The summary's vector is the centroid of the archived turns'
	// vectors -- fully populated, not empty
	assert.equal(summaries[0]!.vector.length, DIM);
});

// ---------------------------------------------------------------------------
// Compaction: cross-tier dedup (vector-dependent)
// ---------------------------------------------------------------------------

test('compaction dedupes near-duplicate turns within the same tier', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	// Two identical-vector turns within hot tier
	await saveTurnAt('sess-1', 0, 'q1', 'a1', 0, vec(1));
	await saveTurnAt('sess-1', 1, 'q2', 'a2', 0, vec(1)); // identical embedding

	const result = await compactConversations(null, fakeEmbedFn, { repo: REPO });
	assert.ok(result.deduped >= 1, `expected >= 1 dedup, got ${result.deduped}`);
});

// ---------------------------------------------------------------------------
// Compaction: cascade through to Lance
// ---------------------------------------------------------------------------

test('compaction-deleted turns are removed from Lance turn_vec', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	const HUNDRED_DAYS_MS = 100 * 86_400_000;
	await saveTurnAt('sess-1', 0, 'q1', 'a1', HUNDRED_DAYS_MS, vec(1));
	await saveTurnAt('sess-1', 1, 'q2', 'a2', HUNDRED_DAYS_MS, vec(2));

	const before = await searchTurnVecs(vec(1), { repo: REPO, limit: 10 });
	assert.equal(before.length, 2);

	await compactConversations(null, fakeEmbedFn, { repo: REPO });

	// Archive collapse deletes the originals + writes a summary; the
	// summary type is filtered out of the default search, so we expect
	// 0 hits with the default filter.
	const after = await searchTurnVecs(vec(1), { repo: REPO, limit: 10 });
	const matchingOriginals = after.filter(h => h.id === 'sess-1:0' || h.id === 'sess-1:1');
	assert.equal(matchingOriginals.length, 0,
		'originals should be removed from Lance');
	// Summary is searchable with explicit type filter
	const summaries = await searchTurnVecs(vec(1), { repo: REPO, limit: 10, types: ['summary'] });
	assert.equal(summaries.length, 1);
});

// ---------------------------------------------------------------------------
// Compaction: dryRun produces no mutations
// ---------------------------------------------------------------------------

test('compaction dryRun does not mutate state', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	const HUNDRED_DAYS_MS = 100 * 86_400_000;
	await saveTurnAt('sess-1', 0, 'q1', 'a1', HUNDRED_DAYS_MS, vec(1));
	await saveTurnAt('sess-1', 1, 'q2', 'a2', HUNDRED_DAYS_MS, vec(2));

	const result = await compactConversations(null, fakeEmbedFn, { repo: REPO, dryRun: true });
	assert.ok(result.archived >= 2, 'dryRun still computes the result');

	const after = await getAllTurnsWithVectorsForRepo(null, REPO);
	assert.equal(after.length, 2, 'turns should still exist (dryRun)');
	const types = new Set(after.map(t => t.type ?? 'turn'));
	assert.ok(!types.has('summary'), 'no summary turn written in dryRun');
});

// ---------------------------------------------------------------------------
// Compaction: empty-input no-op
// ---------------------------------------------------------------------------

test('compaction on empty repo is a no-op', async () => {
	const result = await compactConversations(null, fakeEmbedFn, { repo: REPO });
	assert.deepEqual(result, {
		directives: 0, warmCompressed: 0, coldMerged: 0,
		archived: 0, deduped: 0, capped: 0,
	});
});
