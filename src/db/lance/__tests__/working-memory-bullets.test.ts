/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Tests for the `working_memory_bullets` LanceDB table (P1.e).
 *
 * Each test runs against a fresh tmp Lance directory (same pattern as
 * the turn_vec / session_vec test fixtures), so writes/reads/deletes
 * touch real LanceDB without polluting the user's ~/.insrc/lance.
 *
 * Covered:
 * - Write + ANN-search round trip within a single runId.
 * - runId scoping: queries don't cross run boundaries.
 * - deleteBulletsForRun drops every row for that run.
 * - deleteBulletsForTodo drops just the matching TODO's rows.
 * - Empty queryVec / empty runId early-return guards.
 * - escapeLanceString quotes single quotes correctly (defensive SQL).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeLanceConn, setLanceConnPath } from '../conn.js';
import {
	writeBullet,
	writeBullets,
	searchBullets,
	deleteBulletsForRun,
	deleteBulletsForTodo,
	_resetBulletsTableCache,
	_escapeLanceStringForTest,
} from '../working-memory-bullets.js';
import { loadConfig } from '../../../agent/config.js';

const DIM = loadConfig().models.providers.local.embeddingDim;
let dir: string;

function vec(seed: number): Float32Array {
	const v = new Float32Array(DIM);
	for (let i = 0; i < DIM; i++) {
		v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	}
	return v;
}

test.beforeEach(async () => {
	await closeLanceConn();
	_resetBulletsTableCache();
	dir = mkdtempSync(join(tmpdir(), 'insrc-wm-bullets-'));
	setLanceConnPath(join(dir, 'lance'));
});

test.afterEach(async () => {
	await closeLanceConn();
	_resetBulletsTableCache();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

test('writeBullet + searchBullets: single-row round-trip', async () => {
	await writeBullet({
		id:        'run-1:t1:0',
		embedding: vec(1),
		runId:     'run-1',
		todoId:    't1',
		todoIndex: 0,
		bullet:    'NameNode persists namespace via FSImage + EditLog',
		createdAt: 1_000,
	});
	const hits = await searchBullets(Array.from(vec(1)), { runId: 'run-1', limit: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.bullet, 'NameNode persists namespace via FSImage + EditLog');
	assert.equal(hits[0]!.todoId, 't1');
	assert.equal(hits[0]!.runId,  'run-1');
});

test('writeBullets: batched insert + ANN returns multiple hits ordered by distance', async () => {
	await writeBullets([
		{ id: 'run-1:t1:0', embedding: vec(1), runId: 'run-1', todoId: 't1', todoIndex: 0, bullet: 'A', createdAt: 1 },
		{ id: 'run-1:t1:1', embedding: vec(2), runId: 'run-1', todoId: 't1', todoIndex: 0, bullet: 'B', createdAt: 2 },
		{ id: 'run-1:t2:0', embedding: vec(3), runId: 'run-1', todoId: 't2', todoIndex: 1, bullet: 'C', createdAt: 3 },
	]);
	const hits = await searchBullets(Array.from(vec(1)), { runId: 'run-1', limit: 3 });
	assert.equal(hits.length, 3);
	// ANN returns nearest first; vec(1) is closest to itself.
	assert.equal(hits[0]!.bullet, 'A');
});

// ---------------------------------------------------------------------------
// runId scoping
// ---------------------------------------------------------------------------

test('searchBullets: filters by runId -- other runs are excluded', async () => {
	await writeBullets([
		{ id: 'run-A:t1:0', embedding: vec(1), runId: 'run-A', todoId: 't1', todoIndex: 0, bullet: 'A-bullet', createdAt: 1 },
		{ id: 'run-B:t1:0', embedding: vec(1), runId: 'run-B', todoId: 't1', todoIndex: 0, bullet: 'B-bullet', createdAt: 1 },
	]);
	const hitsA = await searchBullets(Array.from(vec(1)), { runId: 'run-A', limit: 10 });
	const hitsB = await searchBullets(Array.from(vec(1)), { runId: 'run-B', limit: 10 });
	assert.equal(hitsA.length, 1);
	assert.equal(hitsA[0]!.bullet, 'A-bullet');
	assert.equal(hitsB.length, 1);
	assert.equal(hitsB[0]!.bullet, 'B-bullet');
});

test('searchBullets: empty runId -> [] (early return)', async () => {
	const hits = await searchBullets(Array.from(vec(1)), { runId: '', limit: 5 });
	assert.equal(hits.length, 0);
});

test('searchBullets: empty queryVec -> [] (early return)', async () => {
	const hits = await searchBullets([], { runId: 'run-1', limit: 5 });
	assert.equal(hits.length, 0);
});

// ---------------------------------------------------------------------------
// Deletes
// ---------------------------------------------------------------------------

test('deleteBulletsForRun: drops every row for the run', async () => {
	await writeBullets([
		{ id: 'run-A:t1:0', embedding: vec(1), runId: 'run-A', todoId: 't1', todoIndex: 0, bullet: 'a1', createdAt: 1 },
		{ id: 'run-A:t2:0', embedding: vec(2), runId: 'run-A', todoId: 't2', todoIndex: 1, bullet: 'a2', createdAt: 2 },
		{ id: 'run-B:t1:0', embedding: vec(3), runId: 'run-B', todoId: 't1', todoIndex: 0, bullet: 'b1', createdAt: 3 },
	]);
	await deleteBulletsForRun('run-A');
	const remainingA = await searchBullets(Array.from(vec(1)), { runId: 'run-A', limit: 10 });
	const remainingB = await searchBullets(Array.from(vec(3)), { runId: 'run-B', limit: 10 });
	assert.equal(remainingA.length, 0);
	assert.equal(remainingB.length, 1);
});

test('deleteBulletsForRun: empty runId -> no-op (no throw)', async () => {
	await assert.doesNotReject(() => deleteBulletsForRun(''));
});

test('deleteBulletsForTodo: drops just the matching TODO\'s rows', async () => {
	await writeBullets([
		{ id: 'run-A:t1:0', embedding: vec(1), runId: 'run-A', todoId: 't1', todoIndex: 0, bullet: 'a1', createdAt: 1 },
		{ id: 'run-A:t1:1', embedding: vec(2), runId: 'run-A', todoId: 't1', todoIndex: 0, bullet: 'a2', createdAt: 2 },
		{ id: 'run-A:t2:0', embedding: vec(3), runId: 'run-A', todoId: 't2', todoIndex: 1, bullet: 'a3', createdAt: 3 },
	]);
	await deleteBulletsForTodo('run-A', 't1');
	const remaining = await searchBullets(Array.from(vec(3)), { runId: 'run-A', limit: 10 });
	assert.equal(remaining.length, 1);
	assert.equal(remaining[0]!.todoId, 't2');
});

// ---------------------------------------------------------------------------
// SQL escape (defense-in-depth)
// ---------------------------------------------------------------------------

test('escapeLanceString: doubles single quotes', () => {
	assert.equal(_escapeLanceStringForTest("run'1"), "run''1");
});

test('searchBullets: runId containing a single quote does not corrupt the filter', async () => {
	const trickyRunId = "run'A";
	await writeBullet({
		id:        `${trickyRunId}:t1:0`,
		embedding: vec(1),
		runId:     trickyRunId,
		todoId:    't1',
		todoIndex: 0,
		bullet:    'tricky',
		createdAt: 1,
	});
	const hits = await searchBullets(Array.from(vec(1)), { runId: trickyRunId, limit: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.runId, trickyRunId);
});

// ---------------------------------------------------------------------------
// Upsert semantics (mergeInsert)
// ---------------------------------------------------------------------------

test('writeBullets: writing the same id twice updates the row in place', async () => {
	await writeBullet({
		id:        'run-A:t1:0',
		embedding: vec(1),
		runId:     'run-A',
		todoId:    't1',
		todoIndex: 0,
		bullet:    'original',
		createdAt: 1,
	});
	await writeBullet({
		id:        'run-A:t1:0',
		embedding: vec(1),
		runId:     'run-A',
		todoId:    't1',
		todoIndex: 0,
		bullet:    'updated',
		createdAt: 2,
	});
	const hits = await searchBullets(Array.from(vec(1)), { runId: 'run-A', limit: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.bullet, 'updated');
	assert.equal(hits[0]!.createdAt, 2);
});
