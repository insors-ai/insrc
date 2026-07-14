/**
 * Tests for the Lance session-cleanup orchestrator.
 *
 * Plan: plans/session-delete.md Phase A.4.
 *
 * Seeds rows for two sessions across all 4 vector tables, deletes
 * session A, asserts session A rows are gone and session B rows are
 * untouched. Also exercises the compaction helper to confirm it's
 * idempotent + survives a missing-table scenario.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeLanceConn, setLanceConnPath, getLanceConn } from '../conn.js';
import {
	writeSessionEmbedding,
	_resetSessionVecCache,
} from '../session-vec.js';
import {
	writeTurnEmbedding,
	_resetTurnVecCache,
} from '../turn-vec.js';
import {
	upsertResponseSegmentVecBatch,
	_resetResponseSegmentVecCache,
} from '../response-segment-vec.js';
import {
	upsertArtifactVecBatch,
	_resetArtifactVecCache,
} from '../artifact-vec.js';
import { deleteSessionFromLance, compactSessionVecTables } from '../cleanup.js';
import { loadConfig } from '../../../agent/config.js';

const DIM = loadConfig().models.providers.local.embeddingDim;
let dir: string;

function vec(seed: number): Float32Array {
	const v = new Float32Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	return v;
}

function resetAllCaches(): void {
	_resetSessionVecCache();
	_resetTurnVecCache();
	_resetResponseSegmentVecCache();
	_resetArtifactVecCache();
}

test.beforeEach(async () => {
	await closeLanceConn();
	resetAllCaches();
	dir = mkdtempSync(join(tmpdir(), 'insrc-lance-cleanup-'));
	setLanceConnPath(join(dir, 'lance'));
});
test.afterEach(async () => {
	await closeLanceConn();
	resetAllCaches();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Seed helpers: populate all 4 tables for sessions A and B.
// ---------------------------------------------------------------------------

async function seedSession(sessionId: string): Promise<void> {
	// session_vec: 1 row per session
	await writeSessionEmbedding({
		id: sessionId,
		embedding: vec(1),
		repo: '/repo/x',
		status: 'active',
	});

	// turn_vec: 3 rows per session
	for (let i = 0; i < 3; i++) {
		await writeTurnEmbedding({
			id:        `${sessionId}:${i}`,
			embedding: vec(2 + i),
			sessionId,
			repo:      '/repo/x',
			type:      'user-message',
			tier:      'M',
		});
	}

	// response_segment_vec: 2 rows per session (1 turn x 2 segments)
	await upsertResponseSegmentVecBatch([
		{
			id:         `${sessionId}:0:0`,
			embedding:  vec(10),
			sessionId,
			turnId:     `${sessionId}:0`,
			segmentIdx: 0,
			text:       'segment 0',
			timestamp:  BigInt(Date.now()),
		},
		{
			id:         `${sessionId}:0:1`,
			embedding:  vec(11),
			sessionId,
			turnId:     `${sessionId}:0`,
			segmentIdx: 1,
			text:       'segment 1',
			timestamp:  BigInt(Date.now()),
		},
	]);

	// artifact_vec: 1 row per session
	await upsertArtifactVecBatch([
		{
			id:         `${sessionId}:art-1`,
			embedding:  vec(20),
			session_id: sessionId,
			intent:     'code-analysis',
			skill_id:   'code.entity.summary',
			timestamp:  BigInt(Date.now()),
			path:       '~/.insrc/tmp/' + sessionId + '/0-summary.json',
			preview:    'artifact preview',
		},
	]);
}

async function rowCount(tableName: string, where: string): Promise<number> {
	const conn = await getLanceConn();
	const names = await conn.tableNames();
	if (!names.includes(tableName)) return 0;
	const table = await conn.openTable(tableName);
	const rows = await table.query().where(where).select(['id']).toArray();
	return rows.length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('deleteSessionFromLance: empty sessionId is a no-op + zero counts', async () => {
	const counts = await deleteSessionFromLance('');
	assert.deepEqual(counts, { sessionRows: 0, turnRows: 0, responseSegments: 0, artifacts: 0 });
});

test('deleteSessionFromLance: unknown sessionId returns zero counts', async () => {
	const counts = await deleteSessionFromLance('never-seen');
	assert.equal(counts.sessionRows, 0);
	assert.equal(counts.turnRows, 0);
	assert.equal(counts.responseSegments, 0);
	assert.equal(counts.artifacts, 0);
});

test('deleteSessionFromLance: removes only the targeted session across all 4 tables', async () => {
	await seedSession('A');
	await seedSession('B');

	// Sanity: pre-state has both sessions present
	assert.equal(await rowCount('session_vec', `id = 'A'`), 1);
	assert.equal(await rowCount('session_vec', `id = 'B'`), 1);
	assert.equal(await rowCount('turn_vec', `sessionId = 'A'`), 3);
	assert.equal(await rowCount('turn_vec', `sessionId = 'B'`), 3);
	assert.equal(await rowCount('response_segment_vec', `sessionId = 'A'`), 2);
	assert.equal(await rowCount('response_segment_vec', `sessionId = 'B'`), 2);
	assert.equal(await rowCount('artifact_vec', `session_id = 'A'`), 1);
	assert.equal(await rowCount('artifact_vec', `session_id = 'B'`), 1);

	const counts = await deleteSessionFromLance('A');

	assert.deepEqual(counts, { sessionRows: 1, turnRows: 3, responseSegments: 2, artifacts: 1 });

	// A is gone
	assert.equal(await rowCount('session_vec', `id = 'A'`), 0);
	assert.equal(await rowCount('turn_vec', `sessionId = 'A'`), 0);
	assert.equal(await rowCount('response_segment_vec', `sessionId = 'A'`), 0);
	assert.equal(await rowCount('artifact_vec', `session_id = 'A'`), 0);

	// B survives
	assert.equal(await rowCount('session_vec', `id = 'B'`), 1);
	assert.equal(await rowCount('turn_vec', `sessionId = 'B'`), 3);
	assert.equal(await rowCount('response_segment_vec', `sessionId = 'B'`), 2);
	assert.equal(await rowCount('artifact_vec', `session_id = 'B'`), 1);
});

test('deleteSessionFromLance: re-running on the same session is idempotent', async () => {
	await seedSession('A');
	const first = await deleteSessionFromLance('A');
	assert.equal(first.sessionRows + first.turnRows + first.responseSegments + first.artifacts > 0, true);

	const second = await deleteSessionFromLance('A');
	assert.deepEqual(second, { sessionRows: 0, turnRows: 0, responseSegments: 0, artifacts: 0 });
});

test('deleteSessionFromLance: SQL-injection-safe (apostrophes in sessionId)', async () => {
	const trickyId = `weird'session"id`;
	await seedSession(trickyId);
	const counts = await deleteSessionFromLance(trickyId);
	// At minimum the session_vec row should be gone; we don't assert
	// exact non-session-vec counts because seed indexing is sessionId-
	// concatenated (no escape needed since we control them).
	assert.equal(counts.sessionRows, 1);
	assert.equal(await rowCount('session_vec', `id = 'weird''session"id'`), 0);
});

test('compactSessionVecTables: succeeds when tables exist + have tombstones', async () => {
	await seedSession('A');
	await deleteSessionFromLance('A');
	// Compaction should not throw; we don't assert disk-level state
	// here (Lance doesn't expose tombstone counts in a stable way),
	// only that the call completes.
	await compactSessionVecTables();
});

test('compactSessionVecTables: succeeds when no tables exist yet', async () => {
	// Fresh tmpdir; no tables were ever created.
	await compactSessionVecTables();
});

test('compactSessionVecTables: idempotent (call twice, second is cheap)', async () => {
	await seedSession('A');
	await deleteSessionFromLance('A');
	await compactSessionVecTables();
	await compactSessionVecTables();
});
