/**
 * Phase 3.3 tests for the session_vec Lance table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeLanceConn, setLanceConnPath } from '../conn.js';
import {
	writeSessionEmbedding,
	searchSessionVecs,
	deleteSessionVec,
	deleteSessionVecsByIds,
	deleteSessionVecsForRepo,
	_resetSessionVecCache,
} from '../session-vec.js';
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
	_resetSessionVecCache();
	dir = mkdtempSync(join(tmpdir(), 'insrc-session-vec-3.3-'));
	setLanceConnPath(join(dir, 'lance'));
});
test.afterEach(async () => {
	await closeLanceConn();
	_resetSessionVecCache();
	rmSync(dir, { recursive: true, force: true });
});

test('writeSessionEmbedding + searchSessionVecs round-trip', async () => {
	await writeSessionEmbedding({ id: 's1', embedding: vec(1), repo: '/repo/foo', status: 'active' });
	const hits = await searchSessionVecs(Array.from(vec(1)), { repo: '/repo/foo', limit: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, 's1');
});

test('searchSessionVecs scopes by repo', async () => {
	await writeSessionEmbedding({ id: 'a', embedding: vec(1), repo: '/repo/x', status: 'active' });
	await writeSessionEmbedding({ id: 'b', embedding: vec(2), repo: '/repo/y', status: 'active' });
	const x = await searchSessionVecs(Array.from(vec(1)), { repo: '/repo/x', limit: 5 });
	assert.equal(x.length, 1);
	assert.equal(x[0]!.id, 'a');
});

test('searchSessionVecs with notExpired drops expired sessions', async () => {
	await writeSessionEmbedding({ id: 'live',  embedding: vec(1), repo: '/repo/foo', status: 'active' });
	await writeSessionEmbedding({ id: 'gone',  embedding: vec(2), repo: '/repo/foo', status: 'expired' });
	const hits = await searchSessionVecs(Array.from(vec(1)), { repo: '/repo/foo', limit: 5, notExpired: true });
	const ids = hits.map(h => h.id);
	assert.ok(ids.includes('live'));
	assert.ok(!ids.includes('gone'));
});

test('upsert: writing the same id replaces', async () => {
	await writeSessionEmbedding({ id: 's1', embedding: vec(1), repo: '/repo/foo', status: 'active' });
	await writeSessionEmbedding({ id: 's1', embedding: vec(99), repo: '/repo/foo', status: 'archived' });
	const hits = await searchSessionVecs(Array.from(vec(1)), { repo: '/repo/foo', limit: 10 });
	const s1 = hits.filter(h => h.id === 's1');
	assert.equal(s1.length, 1);
	assert.equal(s1[0]!.status, 'archived');
});

test('deleteSessionVec / deleteSessionVecsByIds / deleteSessionVecsForRepo', async () => {
	await writeSessionEmbedding({ id: 'a', embedding: vec(1), repo: '/repo/foo', status: 'active' });
	await writeSessionEmbedding({ id: 'b', embedding: vec(2), repo: '/repo/foo', status: 'active' });
	await writeSessionEmbedding({ id: 'c', embedding: vec(3), repo: '/repo/bar', status: 'active' });
	await deleteSessionVec('a');
	await deleteSessionVecsByIds(['b']);
	const fooHits = await searchSessionVecs(Array.from(vec(1)), { repo: '/repo/foo', limit: 10 });
	assert.equal(fooHits.length, 0);
	await deleteSessionVecsForRepo('/repo/bar');
	const barHits = await searchSessionVecs(Array.from(vec(3)), { repo: '/repo/bar', limit: 10 });
	assert.equal(barHits.length, 0);
});

test('returns [] for empty query / empty repo', async () => {
	assert.deepEqual(await searchSessionVecs([], { repo: '/repo/foo', limit: 5 }), []);
	assert.deepEqual(await searchSessionVecs(Array.from(vec(1)), { repo: '', limit: 5 }), []);
});
