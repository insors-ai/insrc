/**
 * Phase 3.3 tests for the turn_vec Lance table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeLanceConn, setLanceConnPath } from '../conn.js';
import {
	writeTurnEmbedding,
	searchTurnVecs,
	deleteTurnVec,
	deleteTurnVecsBySessionId,
	deleteTurnVecsForRepo,
	_resetTurnVecCache,
} from '../turn-vec.js';
import { loadConfig } from '../../../agent/config.js';

const DIM = loadConfig().models.providers.local.embeddingDim;
let dir: string;

function vec(seed: number): Float32Array {
	const v = new Float32Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	return v;
}

test.beforeEach(async () => {
	await closeLanceConn();
	_resetTurnVecCache();
	dir = mkdtempSync(join(tmpdir(), 'insrc-turn-vec-3.3-'));
	setLanceConnPath(join(dir, 'lance'));
});
test.afterEach(async () => {
	await closeLanceConn();
	_resetTurnVecCache();
	rmSync(dir, { recursive: true, force: true });
});

test('writeTurnEmbedding + searchTurnVecs round-trip', async () => {
	await writeTurnEmbedding({
		id: 's1:0', embedding: vec(1), repo: '/repo/foo',
		sessionId: 's1', type: 'turn', tier: 'hot',
	});
	const hits = await searchTurnVecs(Array.from(vec(1)), { repo: '/repo/foo', limit: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, 's1:0');
});

test('searchTurnVecs default type filter excludes summary', async () => {
	await writeTurnEmbedding({ id: 's1:0', embedding: vec(1), repo: '/repo/foo', sessionId: 's1', type: 'turn',     tier: 'hot' });
	await writeTurnEmbedding({ id: 's1:1', embedding: vec(2), repo: '/repo/foo', sessionId: 's1', type: 'summary',  tier: 'hot' });
	await writeTurnEmbedding({ id: 's1:2', embedding: vec(3), repo: '/repo/foo', sessionId: 's1', type: 'directive',tier: 'hot' });
	await writeTurnEmbedding({ id: 's1:3', embedding: vec(4), repo: '/repo/foo', sessionId: 's1', type: 'merged',   tier: 'cold' });
	const hits = await searchTurnVecs(Array.from(vec(1)), { repo: '/repo/foo', limit: 10 });
	const ids = new Set(hits.map(h => h.id));
	// Default types: turn, directive, merged. summary excluded.
	assert.ok(ids.has('s1:0'));
	assert.ok(!ids.has('s1:1'));
	assert.ok(ids.has('s1:2'));
	assert.ok(ids.has('s1:3'));
});

test('searchTurnVecs with explicit types', async () => {
	await writeTurnEmbedding({ id: 's1:0', embedding: vec(1), repo: '/repo/foo', sessionId: 's1', type: 'turn',    tier: 'hot' });
	await writeTurnEmbedding({ id: 's1:1', embedding: vec(2), repo: '/repo/foo', sessionId: 's1', type: 'summary', tier: 'hot' });
	const hits = await searchTurnVecs(Array.from(vec(1)), { repo: '/repo/foo', limit: 10, types: ['summary'] });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.type, 'summary');
});

test('deleteTurnVec / deleteTurnVecsBySessionId / deleteTurnVecsForRepo', async () => {
	await writeTurnEmbedding({ id: 's1:0', embedding: vec(1), repo: '/repo/foo', sessionId: 's1', type: 'turn', tier: 'hot' });
	await writeTurnEmbedding({ id: 's1:1', embedding: vec(2), repo: '/repo/foo', sessionId: 's1', type: 'turn', tier: 'hot' });
	await writeTurnEmbedding({ id: 's2:0', embedding: vec(3), repo: '/repo/foo', sessionId: 's2', type: 'turn', tier: 'hot' });
	await writeTurnEmbedding({ id: 'a:0',  embedding: vec(4), repo: '/repo/bar', sessionId: 'a',  type: 'turn', tier: 'hot' });

	await deleteTurnVec('s1:0');
	await deleteTurnVecsBySessionId('s2');
	const fooHits = await searchTurnVecs(Array.from(vec(1)), { repo: '/repo/foo', limit: 10 });
	const ids = fooHits.map(h => h.id).sort();
	assert.deepEqual(ids, ['s1:1']);

	await deleteTurnVecsForRepo('/repo/bar');
	const barHits = await searchTurnVecs(Array.from(vec(4)), { repo: '/repo/bar', limit: 10 });
	assert.equal(barHits.length, 0);
});
