/**
 * Tests for the `artifact_vec` Lance table
 * (conversation-flow-refinement.md Phase 2). Mirrors the
 * `session_vec.test.ts` shape: tmpdir lance, deterministic seed
 * vectors, round-trip / filter / delete coverage.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeLanceConn, setLanceConnPath } from '../conn.js';
import {
	upsertArtifactVec,
	upsertArtifactVecBatch,
	queryArtifactVec,
	getArtifactById,
	deleteArtifactsForSession,
	updateArtifactSummary,
	listArtifactsForSession,
	_resetArtifactVecCache,
} from '../artifact-vec.js';
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
	_resetArtifactVecCache();
	dir = mkdtempSync(join(tmpdir(), 'insrc-artifact-vec-'));
	setLanceConnPath(join(dir, 'lance'));
});
test.afterEach(async () => {
	await closeLanceConn();
	_resetArtifactVecCache();
	rmSync(dir, { recursive: true, force: true });
});

test('upsertArtifactVec + queryArtifactVec round-trip', async () => {
	await upsertArtifactVec({
		id:         's1:1000:code.source.repo.describe',
		embedding:  vec(1),
		session_id: 's1',
		intent:     'code-analysis',
		skill_id:   'code.source.repo.describe',
		timestamp:  BigInt(1000),
		path:       '/tmp/insrc/s1/1000-code.source.repo.describe.json',
		preview:    '{"fileCount":12500}',
	});
	const hits = await queryArtifactVec(Array.from(vec(1)), { sessionId: 's1', k: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, 's1:1000:code.source.repo.describe');
	assert.equal(hits[0]!.intent, 'code-analysis');
	assert.equal(hits[0]!.timestamp, BigInt(1000));
	assert.match(hits[0]!.preview, /fileCount/);
});

test('queryArtifactVec scopes by sessionId', async () => {
	await upsertArtifactVecBatch([
		{ id: 's1:1:a', embedding: vec(1), session_id: 's1', intent: 'code-analysis', skill_id: 'a', timestamp: BigInt(1), path: '/p1', preview: 'p1' },
		{ id: 's2:1:a', embedding: vec(1), session_id: 's2', intent: 'code-analysis', skill_id: 'a', timestamp: BigInt(1), path: '/p2', preview: 'p2' },
	]);
	const hitsForS1 = await queryArtifactVec(Array.from(vec(1)), { sessionId: 's1', k: 5 });
	assert.equal(hitsForS1.length, 1);
	assert.equal(hitsForS1[0]!.session_id, 's1');
});

test('queryArtifactVec scopes by intent when provided', async () => {
	await upsertArtifactVecBatch([
		{ id: 's1:1:code-skill', embedding: vec(1), session_id: 's1', intent: 'code-analysis', skill_id: 's', timestamp: BigInt(1), path: '/p1', preview: 'p1' },
		{ id: 's1:2:data-skill', embedding: vec(1), session_id: 's1', intent: 'data-analysis', skill_id: 's', timestamp: BigInt(2), path: '/p2', preview: 'p2' },
	]);
	const codeOnly = await queryArtifactVec(Array.from(vec(1)), { sessionId: 's1', intent: 'code-analysis', k: 5 });
	assert.equal(codeOnly.length, 1);
	assert.equal(codeOnly[0]!.intent, 'code-analysis');
});

test('getArtifactById returns the row by exact id (no ANN)', async () => {
	await upsertArtifactVec({
		id: 's1:1:s', embedding: vec(2), session_id: 's1', intent: 'code-analysis',
		skill_id: 's', timestamp: BigInt(1), path: '/p', preview: 'preview',
	});
	const row = await getArtifactById('s1:1:s');
	assert.ok(row);
	assert.equal(row!.skill_id, 's');
	assert.equal(row!.preview, 'preview');
	const miss = await getArtifactById('does-not-exist');
	assert.equal(miss, null);
});

test('deleteArtifactsForSession removes all rows for a session and returns count', async () => {
	await upsertArtifactVecBatch([
		{ id: 's1:1:a', embedding: vec(1), session_id: 's1', intent: 'code-analysis', skill_id: 'a', timestamp: BigInt(1), path: '/p1', preview: 'p' },
		{ id: 's1:2:b', embedding: vec(1), session_id: 's1', intent: 'code-analysis', skill_id: 'b', timestamp: BigInt(2), path: '/p2', preview: 'p' },
		{ id: 's2:1:a', embedding: vec(1), session_id: 's2', intent: 'code-analysis', skill_id: 'a', timestamp: BigInt(1), path: '/p3', preview: 'p' },
	]);
	const removed = await deleteArtifactsForSession('s1');
	assert.equal(removed, 2);
	const remaining = await queryArtifactVec(Array.from(vec(1)), { sessionId: 's2', k: 5 });
	assert.equal(remaining.length, 1);
	assert.equal(remaining[0]!.session_id, 's2');
});

test('upsert: writing the same id replaces', async () => {
	await upsertArtifactVec({
		id: 's1:1:a', embedding: vec(1), session_id: 's1', intent: 'code-analysis',
		skill_id: 'a', timestamp: BigInt(1), path: '/p', preview: 'first',
	});
	await upsertArtifactVec({
		id: 's1:1:a', embedding: vec(2), session_id: 's1', intent: 'code-analysis',
		skill_id: 'a', timestamp: BigInt(1), path: '/p2', preview: 'second',
	});
	const row = await getArtifactById('s1:1:a');
	assert.equal(row!.preview, 'second');
	assert.equal(row!.path, '/p2');
});

test('returns [] for empty query / empty session / k=0', async () => {
	assert.deepEqual(await queryArtifactVec([], { sessionId: 's1', k: 5 }), []);
	assert.deepEqual(await queryArtifactVec(Array.from(vec(1)), { sessionId: '', k: 5 }), []);
	assert.deepEqual(await queryArtifactVec(Array.from(vec(1)), { sessionId: 's1', k: 0 }), []);
});

test('deleteArtifactsForSession on empty session returns 0 cleanly', async () => {
	const removed = await deleteArtifactsForSession('never-existed');
	assert.equal(removed, 0);
});

// ---------------------------------------------------------------------------
// Phase 1 of plans/section-flow-architecture-redesign.md:
// goal-aware summary column + updateArtifactSummary writer
// ---------------------------------------------------------------------------

test('default summary on a freshly-spilled row is empty string', async () => {
	await upsertArtifactVec({
		id:         's1:1:fresh',
		embedding:  vec(1),
		session_id: 's1',
		intent:     'data-analysis',
		skill_id:   'data.source.file.sample-shape',
		timestamp:  BigInt(1),
		path:       '/tmp/p',
		preview:    'preview text',
		// `summary` intentionally omitted so the default kicks in.
	});
	const row = await getArtifactById('s1:1:fresh');
	assert.notEqual(row, null);
	assert.equal(row!.summary, '');
});

test('upsertArtifactVec persists explicit summary verbatim', async () => {
	await upsertArtifactVec({
		id:         's1:2:with-summary',
		embedding:  vec(2),
		session_id: 's1',
		intent:     'data-analysis',
		skill_id:   'shared.fs.list-files',
		timestamp:  BigInt(2),
		path:       '/tmp/p2',
		preview:    'preview',
		summary:    '25 JSON file paths under test/integration/data/BB/GRN; CLOSES gap "enumerate-grn-json-fixtures" fully',
	});
	const row = await getArtifactById('s1:2:with-summary');
	assert.match(row!.summary, /CLOSES gap "enumerate-grn-json-fixtures" fully/);
});

test('updateArtifactSummary overwrites only the summary column', async () => {
	await upsertArtifactVec({
		id:         's1:3:to-update',
		embedding:  vec(3),
		session_id: 's1',
		intent:     'data-analysis',
		skill_id:   'code.class.extract-fields',
		timestamp:  BigInt(3),
		path:       '/tmp/p3',
		preview:    'preview-original',
	});
	const ok = await updateArtifactSummary(
		's1:3:to-update',
		'INGRN class at .../grn.py:40-207; 21 fields; CLOSES "ingrn-fields" fully',
	);
	assert.equal(ok, true);
	const row = await getArtifactById('s1:3:to-update');
	assert.match(row!.summary, /21 fields; CLOSES "ingrn-fields" fully/);
	// Other columns must be untouched.
	assert.equal(row!.preview,   'preview-original');
	assert.equal(row!.path,      '/tmp/p3');
	assert.equal(row!.timestamp, BigInt(3));
	assert.equal(row!.skill_id,  'code.class.extract-fields');
});

test('updateArtifactSummary returns false for unknown id (soft-fail)', async () => {
	const ok = await updateArtifactSummary('does-not-exist', 'whatever');
	assert.equal(ok, false);
});

test('updateArtifactSummary refuses empty id + the seed sentinel', async () => {
	assert.equal(await updateArtifactSummary('',                    'x'), false);
	assert.equal(await updateArtifactSummary('_seed_artifact_vec',  'x'), false);
});

// ---------------------------------------------------------------------------
// listArtifactsForSession (Phase 1 batch 2 -- TOC builder source)
// ---------------------------------------------------------------------------

test('listArtifactsForSession returns rows newest-first', async () => {
	await upsertArtifactVecBatch([
		{ id: 's1:100:older', embedding: vec(1), session_id: 's1', intent: 'i', skill_id: 'a', timestamp: BigInt(100), path: '/p1', preview: 'a', summary: 'sA' },
		{ id: 's1:300:newer', embedding: vec(2), session_id: 's1', intent: 'i', skill_id: 'b', timestamp: BigInt(300), path: '/p2', preview: 'b', summary: 'sB' },
		{ id: 's1:200:mid',   embedding: vec(3), session_id: 's1', intent: 'i', skill_id: 'c', timestamp: BigInt(200), path: '/p3', preview: 'c', summary: 'sC' },
	]);
	const rows = await listArtifactsForSession({ sessionId: 's1' });
	assert.deepEqual(rows.map(r => r.id), [
		's1:300:newer',
		's1:200:mid',
		's1:100:older',
	]);
});

test('listArtifactsForSession scopes by session and excludes seed', async () => {
	await upsertArtifactVecBatch([
		{ id: 's1:1:a', embedding: vec(1), session_id: 's1', intent: 'i', skill_id: 'a', timestamp: BigInt(1), path: '/p1', preview: 'p1' },
		{ id: 's2:1:a', embedding: vec(1), session_id: 's2', intent: 'i', skill_id: 'a', timestamp: BigInt(1), path: '/p2', preview: 'p2' },
	]);
	const rows = await listArtifactsForSession({ sessionId: 's1' });
	assert.equal(rows.length, 1);
	assert.equal(rows[0]!.session_id, 's1');
});

test('listArtifactsForSession honours skillIdPrefix filter', async () => {
	await upsertArtifactVecBatch([
		{ id: 's1:1:code',  embedding: vec(1), session_id: 's1', intent: 'i', skill_id: 'code.class.extract-fields', timestamp: BigInt(1), path: '/p1', preview: 'p1' },
		{ id: 's1:2:data',  embedding: vec(2), session_id: 's1', intent: 'i', skill_id: 'data.source.file.sample-shape', timestamp: BigInt(2), path: '/p2', preview: 'p2' },
		{ id: 's1:3:code2', embedding: vec(3), session_id: 's1', intent: 'i', skill_id: 'code.source.grep', timestamp: BigInt(3), path: '/p3', preview: 'p3' },
	]);
	const codeOnly = await listArtifactsForSession({ sessionId: 's1', skillIdPrefix: 'code.' });
	assert.equal(codeOnly.length, 2);
	assert.ok(codeOnly.every(r => r.skill_id.startsWith('code.')));
});

test('listArtifactsForSession honours afterTimestamp lower bound (exclusive)', async () => {
	await upsertArtifactVecBatch([
		{ id: 's1:100:a', embedding: vec(1), session_id: 's1', intent: 'i', skill_id: 'a', timestamp: BigInt(100), path: '/p', preview: 'p' },
		{ id: 's1:200:b', embedding: vec(2), session_id: 's1', intent: 'i', skill_id: 'b', timestamp: BigInt(200), path: '/p', preview: 'p' },
		{ id: 's1:300:c', embedding: vec(3), session_id: 's1', intent: 'i', skill_id: 'c', timestamp: BigInt(300), path: '/p', preview: 'p' },
	]);
	const recent = await listArtifactsForSession({ sessionId: 's1', afterTimestamp: BigInt(150) });
	assert.equal(recent.length, 2);
	assert.ok(recent.every(r => r.timestamp > BigInt(150)));
});

test('listArtifactsForSession returns [] for empty sessionId', async () => {
	assert.deepEqual(await listArtifactsForSession({ sessionId: '' }), []);
});

test('listArtifactsForSession defaults summary to empty string for rows without one', async () => {
	await upsertArtifactVec({
		id:         's1:1:no-summary',
		embedding:  vec(1),
		session_id: 's1',
		intent:     'i',
		skill_id:   'shared.fs.list-files',
		timestamp:  BigInt(1),
		path:       '/p',
		preview:    'preview',
		// summary omitted on purpose
	});
	const rows = await listArtifactsForSession({ sessionId: 's1' });
	assert.equal(rows.length, 1);
	assert.equal(rows[0]!.summary, '');
});

test('queryArtifactVec results carry the summary field', async () => {
	await upsertArtifactVec({
		id:         's1:4:queryable',
		embedding:  vec(4),
		session_id: 's1',
		intent:     'data-analysis',
		skill_id:   'shared.fs.peek',
		timestamp:  BigInt(4),
		path:       '/tmp/p4',
		preview:    'preview',
		summary:    'PARTIALLY supports "fixture-shape" gap',
	});
	const hits = await queryArtifactVec(Array.from(vec(4)), { sessionId: 's1', k: 5 });
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.summary, 'PARTIALLY supports "fixture-shape" gap');
});
