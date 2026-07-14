/**
 * Smoke test for the `@lancedb/lancedb` dependency. Phase 0.3 of the
 * storage migration: pin the version, verify the native binding loads
 * on this platform, verify basic table CRUD + ANN search work at the
 * new 1024-dim default.
 *
 * Not a full vector-table test -- that's Phase 3.x. This test only
 * answers: "does the dep work at all, with the post-Phase-0.2 dim?"
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as lancedb from '@lancedb/lancedb';

const DIM = 1024;

let dbPath: string;

test.beforeEach(() => {
	dbPath = mkdtempSync(join(tmpdir(), 'insrc-lance-smoke-'));
});
test.afterEach(() => {
	rmSync(dbPath, { recursive: true, force: true });
});

function unitVec(seed: number): number[] {
	// Deterministic non-zero vector; not unit-normalized, but adequate
	// for cosine-distance ordering tests.
	const v = new Array<number>(DIM);
	for (let i = 0; i < DIM; i++) {
		v[i] = Math.sin(seed * (i + 1)) * 0.1 + (seed === 0 ? 0.001 : 0);
	}
	return v;
}

test('lancedb native binding loads', async () => {
	const db = await lancedb.connect(dbPath);
	assert.ok(db);
});

test('create table + insert + count round-trip', async () => {
	const db = await lancedb.connect(dbPath);
	const table = await db.createTable('entity_vec', [
		{ id: 'e1', embedding: unitVec(1) },
		{ id: 'e2', embedding: unitVec(2) },
	]);
	assert.equal(await table.countRows(), 2);
});

test('vector search returns nearest first', async () => {
	const db = await lancedb.connect(dbPath);
	const table = await db.createTable('entity_vec', [
		{ id: 'near',  embedding: unitVec(1) },
		{ id: 'mid',   embedding: unitVec(5) },
		{ id: 'far',   embedding: unitVec(50) },
	]);
	const query = unitVec(1);
	const hits = await table.search(query).limit(3).toArray();
	assert.equal(hits.length, 3);
	// The query is identical to "near"'s vector -- nearest hit must be 'near'.
	assert.equal(hits[0].id, 'near');
});

test('vector dim 1024 is accepted (post-0.2 default)', async () => {
	const db = await lancedb.connect(dbPath);
	const table = await db.createTable('entity_vec', [
		{ id: 'e1', embedding: unitVec(1) },
	]);
	const rows = await table.query().toArray();
	assert.equal(rows[0].embedding.length, DIM);
});

test('table reopened from disk retains data (file-backed persistence)', async () => {
	{
		const db = await lancedb.connect(dbPath);
		await db.createTable('entity_vec', [
			{ id: 'persist', embedding: unitVec(7) },
		]);
	}
	{
		const db = await lancedb.connect(dbPath);
		const table = await db.openTable('entity_vec');
		assert.equal(await table.countRows(), 1);
	}
});

test('filter columns work alongside vector search (where clause)', async () => {
	const db = await lancedb.connect(dbPath);
	const table = await db.createTable('entity_vec', [
		{ id: 'a', repo: 1, embedding: unitVec(1) },
		{ id: 'b', repo: 2, embedding: unitVec(2) },
		{ id: 'c', repo: 1, embedding: unitVec(3) },
	]);
	const hits = await table.search(unitVec(1)).where('repo = 1').limit(10).toArray();
	assert.equal(hits.length, 2);
	for (const h of hits) {
		assert.equal(h.repo, 1);
	}
});
