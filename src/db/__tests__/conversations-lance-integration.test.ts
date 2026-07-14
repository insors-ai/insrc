/**
 * Phase 3.3 integration tests: conversations.ts <-> Lance session_vec
 * + turn_vec wiring.
 *
 * Verifies:
 *   - saveTurn with a vector persists to Lance
 *   - addCompactedTurns persists vectors to Lance
 *   - saveSession with a vector persists summary to Lance
 *   - closeSession persists summary embedding to Lance
 *   - searchTurnsByRepo returns hydrated TurnRecord objects
 *   - seedFromPrior returns hydrated SessionRecord objects + recency sort
 *   - Cascade paths (deleteSession + deleteTurnsForSession +
 *     deleteSessionsForRepo + deleteTurnsForRepo + deleteTurnsByIds)
 *     all clean up Lance rows
 *   - searchTurnsByRepo/seedFromPrior with empty/dim-mismatch inputs
 *     silently return [] (legacy contract)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../lance/conn.js';
import { _resetSessionVecCache, searchSessionVecs } from '../lance/session-vec.js';
import { _resetTurnVecCache,    searchTurnVecs }    from '../lance/turn-vec.js';
import {
	saveSession,
	closeSession,
	saveTurn,
	addCompactedTurns,
	deleteSession,
	deleteTurnsForSession,
	deleteSessionsForRepo,
	deleteTurnsForRepo,
	deleteTurnsByIds,
	searchTurnsByRepo,
	seedFromPrior,
} from '../conversations.js';
import { loadConfig } from '../../agent/config.js';

const DIM = loadConfig().models.providers.local.embeddingDim;
const REPO = '/repo/foo';

let dir: string;

function vec(seed: number): number[] {
	const v: number[] = new Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	return v;
}

test.beforeEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetSessionVecCache();
	_resetTurnVecCache();
	dir = mkdtempSync(join(tmpdir(), 'insrc-conversations-lance-3.3-'));
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
// Writes
// ---------------------------------------------------------------------------

test('saveTurn persists vector to Lance', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 0, user: 'hi', assistant: 'hello',
		entities: [], vector: vec(1), repo: REPO,
	});
	const hits = await searchTurnVecs(vec(1), { repo: REPO, limit: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, 'sess-1:0');
});

test('saveTurn with empty vector skips Lance write', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 0, user: '', assistant: '',
		entities: [], vector: [], repo: REPO,
	});
	const hits = await searchTurnVecs(vec(1), { repo: REPO, limit: 5 });
	assert.equal(hits.length, 0);
});

test('addCompactedTurns persists batch to Lance with type=merged tier=cold defaults', async () => {
	await addCompactedTurns(null, [
		{ sessionId: 's1', idx: 0, user: '', assistant: '', entities: [], vector: vec(1), repo: REPO },
		{ sessionId: 's1', idx: 1, user: '', assistant: '', entities: [], vector: vec(2), repo: REPO },
	]);
	const hits = await searchTurnVecs(vec(1), { repo: REPO, limit: 10 });
	assert.equal(hits.length, 2);
	for (const h of hits) {
		assert.equal(h.type, 'merged');
		assert.equal(h.tier, 'cold');
	}
});

test('saveSession with vector persists summary to Lance', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: 'x' }, vec(1));
	const hits = await searchSessionVecs(vec(1), { repo: REPO, limit: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, 'sess-1');
});

test('closeSession persists summary embedding to Lance', async () => {
	await closeSession(null,
		{ id: 'sess-1', repo: REPO, summary: 'final', seenEntities: [] },
		vec(1));
	const hits = await searchSessionVecs(vec(1), { repo: REPO, limit: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.status, 'archived');
});

// ---------------------------------------------------------------------------
// Read paths
// ---------------------------------------------------------------------------

test('searchTurnsByRepo returns hydrated TurnRecord objects', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 0, user: 'q', assistant: 'a',
		entities: ['e1'], vector: vec(1), repo: REPO,
	});
	const r = await searchTurnsByRepo(null, REPO, vec(1), 5);
	assert.equal(r.length, 1);
	assert.equal(r[0]!.user, 'q');
	assert.equal(r[0]!.assistant, 'a');
	assert.deepEqual(r[0]!.entities, ['e1']);
});

test('searchTurnsByRepo returns [] on dim mismatch (legacy silent-error contract)', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 0, user: 'q', assistant: 'a',
		entities: [], vector: vec(1), repo: REPO,
	});
	// 3-dim query against a 1024/2560-dim table -> Lance throws
	const r = await searchTurnsByRepo(null, REPO, [1, 2, 3], 5);
	assert.deepEqual(r, []);
});

test('seedFromPrior returns sessions sorted by recency', async () => {
	await saveSession(null, { id: 'older', repo: REPO, summary: '' }, vec(1));
	await new Promise(r => setTimeout(r, 5));
	await saveSession(null, { id: 'newer', repo: REPO, summary: '' }, vec(1));
	const r = await seedFromPrior(null, REPO, vec(1), 5);
	assert.equal(r.length, 2);
	assert.equal(r[0]!.id, 'newer'); // newer first (recency sort)
});

test('seedFromPrior returns [] on dim mismatch', async () => {
	await saveSession(null, { id: 's1', repo: REPO, summary: '' }, vec(1));
	const r = await seedFromPrior(null, REPO, [1, 2, 3], 3);
	assert.deepEqual(r, []);
});

// ---------------------------------------------------------------------------
// Cascades clean up Lance
// ---------------------------------------------------------------------------

test('deleteSession cascades Lance session + turn rows', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' }, vec(1));
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 0, user: '', assistant: '',
		entities: [], vector: vec(2), repo: REPO,
	});
	await deleteSession(null, 'sess-1');
	const sHits = await searchSessionVecs(vec(1), { repo: REPO, limit: 5 });
	const tHits = await searchTurnVecs(vec(2), { repo: REPO, limit: 5 });
	assert.equal(sHits.length, 0);
	assert.equal(tHits.length, 0);
});

test('deleteTurnsForSession cascades only the turn Lance rows', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' }, vec(1));
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 0, user: '', assistant: '',
		entities: [], vector: vec(2), repo: REPO,
	});
	await deleteTurnsForSession(null, 'sess-1');
	// Session row remains, turn row gone
	const sHits = await searchSessionVecs(vec(1), { repo: REPO, limit: 5 });
	const tHits = await searchTurnVecs(vec(2), { repo: REPO, limit: 5 });
	assert.equal(sHits.length, 1);
	assert.equal(tHits.length, 0);
});

test('deleteSessionsForRepo cascades all Lance rows for that repo', async () => {
	await saveSession(null, { id: 'a', repo: REPO,         summary: '' }, vec(1));
	await saveSession(null, { id: 'b', repo: '/repo/other', summary: '' }, vec(2));
	await saveTurn(null, {
		sessionId: 'a', idx: 0, user: '', assistant: '',
		entities: [], vector: vec(3), repo: REPO,
	});
	await saveTurn(null, {
		sessionId: 'b', idx: 0, user: '', assistant: '',
		entities: [], vector: vec(4), repo: '/repo/other',
	});
	await deleteSessionsForRepo(null, REPO);
	// Repo-scoped Lance cleanup
	assert.equal((await searchSessionVecs(vec(1), { repo: REPO, limit: 5 })).length, 0);
	assert.equal((await searchTurnVecs(vec(3),    { repo: REPO, limit: 5 })).length, 0);
	// Other repo unaffected
	assert.equal((await searchSessionVecs(vec(2), { repo: '/repo/other', limit: 5 })).length, 1);
	assert.equal((await searchTurnVecs(vec(4),    { repo: '/repo/other', limit: 5 })).length, 1);
});

test('deleteTurnsForRepo cascades Lance turn rows but leaves sessions', async () => {
	await saveSession(null, { id: 'a', repo: REPO, summary: '' }, vec(1));
	await saveTurn(null, {
		sessionId: 'a', idx: 0, user: '', assistant: '',
		entities: [], vector: vec(2), repo: REPO,
	});
	await deleteTurnsForRepo(null, REPO);
	const sHits = await searchSessionVecs(vec(1), { repo: REPO, limit: 5 });
	const tHits = await searchTurnVecs(vec(2), { repo: REPO, limit: 5 });
	assert.equal(sHits.length, 1);
	assert.equal(tHits.length, 0);
});

test('deleteTurnsByIds cascades the corresponding Lance rows', async () => {
	await saveSession(null, { id: 'sess-1', repo: REPO, summary: '' });
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 0, user: '', assistant: '',
		entities: [], vector: vec(1), repo: REPO,
	});
	await saveTurn(null, {
		sessionId: 'sess-1', idx: 1, user: '', assistant: '',
		entities: [], vector: vec(2), repo: REPO,
	});
	await deleteTurnsByIds(null, ['sess-1:0']);
	const remaining = await searchTurnVecs(vec(1), { repo: REPO, limit: 10 });
	const ids = remaining.map(h => h.id).sort();
	assert.deepEqual(ids, ['sess-1:1']);
});
