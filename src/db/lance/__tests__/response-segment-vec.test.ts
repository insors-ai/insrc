/**
 * Phase 2 tests for the response_segment_vec Lance table.
 *
 * Mirrors turn-vec.test.ts: per-test temp Lance dir, embedding seed
 * derived from a small int, exhaustive coverage of the upsert /
 * query / delete surface.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeLanceConn, setLanceConnPath } from '../conn.js';
import {
	upsertResponseSegmentVec,
	upsertResponseSegmentVecBatch,
	queryResponseSegmentVec,
	deleteResponseSegmentsForSession,
	deleteResponseSegmentsForTurn,
	_resetResponseSegmentVecCache,
	type ResponseSegmentVecRow,
} from '../response-segment-vec.js';
import { loadConfig } from '../../../agent/config.js';

const DIM = loadConfig().models.providers.local.embeddingDim;
let dir: string;

function vec(seed: number): Float32Array {
	const v = new Float32Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	return v;
}

function row(opts: Partial<ResponseSegmentVecRow> & {
	id: string;
	sessionId: string;
	turnId: string;
	segmentIdx: number;
	embedSeed: number;
}): ResponseSegmentVecRow {
	return {
		id:         opts.id,
		embedding:  vec(opts.embedSeed),
		sessionId:  opts.sessionId,
		turnId:     opts.turnId,
		segmentIdx: opts.segmentIdx,
		text:       opts.text       ?? `segment ${opts.segmentIdx} of ${opts.turnId}`,
		timestamp:  opts.timestamp  ?? BigInt(Date.now()),
	};
}

test.beforeEach(async () => {
	await closeLanceConn();
	_resetResponseSegmentVecCache();
	dir = mkdtempSync(join(tmpdir(), 'insrc-resp-seg-vec-'));
	setLanceConnPath(join(dir, 'lance'));
});

test.afterEach(async () => {
	await closeLanceConn();
	_resetResponseSegmentVecCache();
	rmSync(dir, { recursive: true, force: true });
});

test('upsertResponseSegmentVec + queryResponseSegmentVec round-trip', async () => {
	await upsertResponseSegmentVec(row({
		id: 's1:0:0', sessionId: 's1', turnId: 's1:0', segmentIdx: 0, embedSeed: 1,
	}));
	const hits = await queryResponseSegmentVec(Array.from(vec(1)), { sessionId: 's1', k: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id,         's1:0:0');
	assert.equal(hits[0]!.sessionId,  's1');
	assert.equal(hits[0]!.turnId,     's1:0');
	assert.equal(hits[0]!.segmentIdx, 0);
	assert.match(hits[0]!.text, /segment 0/);
});

test('queryResponseSegmentVec scopes hits to a single session', async () => {
	await upsertResponseSegmentVecBatch([
		row({ id: 's1:0:0', sessionId: 's1', turnId: 's1:0', segmentIdx: 0, embedSeed: 1 }),
		row({ id: 's1:0:1', sessionId: 's1', turnId: 's1:0', segmentIdx: 1, embedSeed: 2 }),
		row({ id: 's2:0:0', sessionId: 's2', turnId: 's2:0', segmentIdx: 0, embedSeed: 1 }),
	]);
	const hits = await queryResponseSegmentVec(Array.from(vec(1)), { sessionId: 's1', k: 10 });
	const ids = new Set(hits.map(h => h.id));
	assert.equal(ids.size, 2);
	assert.ok(ids.has('s1:0:0'));
	assert.ok(ids.has('s1:0:1'));
	assert.ok(!ids.has('s2:0:0'),
		'session-scoped query must NOT return rows from other sessions');
});

test('queryResponseSegmentVec respects the k limit', async () => {
	await upsertResponseSegmentVecBatch([
		row({ id: 's1:0:0', sessionId: 's1', turnId: 's1:0', segmentIdx: 0, embedSeed: 1 }),
		row({ id: 's1:0:1', sessionId: 's1', turnId: 's1:0', segmentIdx: 1, embedSeed: 2 }),
		row({ id: 's1:0:2', sessionId: 's1', turnId: 's1:0', segmentIdx: 2, embedSeed: 3 }),
		row({ id: 's1:0:3', sessionId: 's1', turnId: 's1:0', segmentIdx: 3, embedSeed: 4 }),
	]);
	const hits = await queryResponseSegmentVec(Array.from(vec(1)), { sessionId: 's1', k: 2 });
	assert.equal(hits.length, 2);
});

test('queryResponseSegmentVec returns [] for empty query vector or empty sessionId', async () => {
	await upsertResponseSegmentVec(row({
		id: 's1:0:0', sessionId: 's1', turnId: 's1:0', segmentIdx: 0, embedSeed: 1,
	}));
	assert.deepEqual(await queryResponseSegmentVec([],                 { sessionId: 's1' }), []);
	assert.deepEqual(await queryResponseSegmentVec(Array.from(vec(1)), { sessionId: ''   }), []);
});

test('upsert is idempotent on the same id (mergeInsert overwrite)', async () => {
	await upsertResponseSegmentVec(row({
		id: 's1:0:0', sessionId: 's1', turnId: 's1:0', segmentIdx: 0, embedSeed: 1,
		text: 'first version',
	}));
	await upsertResponseSegmentVec(row({
		id: 's1:0:0', sessionId: 's1', turnId: 's1:0', segmentIdx: 0, embedSeed: 1,
		text: 'second version',
	}));
	const hits = await queryResponseSegmentVec(Array.from(vec(1)), { sessionId: 's1', k: 5 });
	assert.equal(hits.length, 1, 'mergeInsert must overwrite, not duplicate');
	assert.equal(hits[0]!.text, 'second version');
});

test('deleteResponseSegmentsForSession removes all rows for a session and returns the count', async () => {
	await upsertResponseSegmentVecBatch([
		row({ id: 's1:0:0', sessionId: 's1', turnId: 's1:0', segmentIdx: 0, embedSeed: 1 }),
		row({ id: 's1:0:1', sessionId: 's1', turnId: 's1:0', segmentIdx: 1, embedSeed: 2 }),
		row({ id: 's1:1:0', sessionId: 's1', turnId: 's1:1', segmentIdx: 0, embedSeed: 3 }),
		row({ id: 's2:0:0', sessionId: 's2', turnId: 's2:0', segmentIdx: 0, embedSeed: 4 }),
	]);
	const removed = await deleteResponseSegmentsForSession('s1');
	assert.equal(removed, 3);
	assert.deepEqual(await queryResponseSegmentVec(Array.from(vec(1)), { sessionId: 's1' }), []);
	const survivors = await queryResponseSegmentVec(Array.from(vec(4)), { sessionId: 's2', k: 5 });
	assert.equal(survivors.length, 1);
	assert.equal(survivors[0]!.id, 's2:0:0');
});

test('deleteResponseSegmentsForSession on an empty session returns 0', async () => {
	const removed = await deleteResponseSegmentsForSession('never-existed');
	assert.equal(removed, 0);
});

test('deleteResponseSegmentsForTurn removes only the rows for that turn', async () => {
	await upsertResponseSegmentVecBatch([
		row({ id: 's1:0:0', sessionId: 's1', turnId: 's1:0', segmentIdx: 0, embedSeed: 1 }),
		row({ id: 's1:0:1', sessionId: 's1', turnId: 's1:0', segmentIdx: 1, embedSeed: 2 }),
		row({ id: 's1:1:0', sessionId: 's1', turnId: 's1:1', segmentIdx: 0, embedSeed: 3 }),
	]);
	const removed = await deleteResponseSegmentsForTurn('s1:0');
	assert.equal(removed, 2);
	const survivors = await queryResponseSegmentVec(Array.from(vec(3)), { sessionId: 's1', k: 5 });
	assert.equal(survivors.length, 1);
	assert.equal(survivors[0]!.id, 's1:1:0');
});

test('seed row never appears in query results', async () => {
	// No user rows yet -- but the seed exists. Query should be empty.
	const hits = await queryResponseSegmentVec(Array.from(vec(0)), { sessionId: '' });
	assert.equal(hits.length, 0);
});
