/**
 * Phase 3.2 tests for the entity_vec Lance table.
 *
 * Verifies the table operations end-to-end:
 *   - writeEntityEmbedding upsert (delete + add semantics)
 *   - writeEntityEmbeddings bulk upsert
 *   - searchEntityVecs ANN with closure-repo + filter scoping
 *   - deleteEntityVec / deleteEntityVecsByIds / deleteEntityVecsForRepo
 *
 * Uses tmpdir-isolated Lance per test (setLanceConnPath + closeLanceConn).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { existsSync, readdirSync } from 'node:fs';

import { closeLanceConn, setLanceConnPath } from '../conn.js';
import {
	addEntityEmbeddings,
	writeEntityEmbedding,
	writeEntityEmbeddings,
	searchEntityVecs,
	compactEntityVecTable,
	deleteEntityVec,
	deleteEntityVecsByIds,
	deleteEntityVecsForRepo,
	_resetEntityVecCache,
} from '../entity-vec.js';
import { loadConfig } from '../../../agent/config.js';

let dir: string;

// Match whatever dim the runtime config carries -- the entity_vec module
// reads it at module load via loadConfig(), so tests must use the same
// value to avoid "No vector column found to match" errors at search time.
const DIM = loadConfig().models.providers.local.embeddingDim;

function vec(seed: number): Float32Array {
	const v = new Float32Array(DIM);
	for (let i = 0; i < DIM; i++) {
		v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	}
	return v;
}

test.beforeEach(async () => {
	await closeLanceConn();
	_resetEntityVecCache();
	dir = mkdtempSync(join(tmpdir(), 'insrc-entity-vec-3.2-'));
	setLanceConnPath(join(dir, 'lance'));
});
test.afterEach(async () => {
	await closeLanceConn();
	_resetEntityVecCache();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

test('writeEntityEmbedding stores a single row', async () => {
	await writeEntityEmbedding({
		id: 'e1',
		embedding: vec(1),
		repo: '/repo/foo',
		kind: 'function',
		artifact: false,
	});
	const hits = await searchEntityVecs(Array.from(vec(1)), ['/repo/foo'], 5);
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, 'e1');
});

test('writeEntityEmbedding upsert: same id replaces row', async () => {
	await writeEntityEmbedding({ id: 'e1', embedding: vec(1), repo: '/repo/foo', kind: 'function', artifact: false });
	await writeEntityEmbedding({ id: 'e1', embedding: vec(99), repo: '/repo/foo', kind: 'function', artifact: false });
	// Verify only one row remains under id=e1
	const all = await searchEntityVecs(Array.from(vec(1)), ['/repo/foo'], 100);
	const e1Hits = all.filter(h => h.id === 'e1');
	assert.equal(e1Hits.length, 1);
});

test('writeEntityEmbeddings bulk upsert', async () => {
	const rows = [
		{ id: 'a', embedding: vec(1), repo: '/repo/foo', kind: 'function' as const, artifact: false },
		{ id: 'b', embedding: vec(2), repo: '/repo/foo', kind: 'function' as const, artifact: false },
		{ id: 'c', embedding: vec(3), repo: '/repo/bar', kind: 'class'    as const, artifact: false },
	];
	await writeEntityEmbeddings(rows);
	const all = await searchEntityVecs(Array.from(vec(1)), ['/repo/foo', '/repo/bar'], 10);
	assert.equal(all.length, 3);
});

test('writeEntityEmbeddings on empty array is a no-op', async () => {
	await writeEntityEmbeddings([]);
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

test('searchEntityVecs returns ANN hits ordered by distance', async () => {
	await writeEntityEmbeddings([
		{ id: 'near',  embedding: vec(1),   repo: '/repo/foo', kind: 'function', artifact: false },
		{ id: 'mid',   embedding: vec(5),   repo: '/repo/foo', kind: 'function', artifact: false },
		{ id: 'far',   embedding: vec(50),  repo: '/repo/foo', kind: 'function', artifact: false },
	]);
	const hits = await searchEntityVecs(Array.from(vec(1)), ['/repo/foo'], 3);
	assert.equal(hits[0]!.id, 'near');
});

test('searchEntityVecs respects closure-repo scope', async () => {
	await writeEntityEmbeddings([
		{ id: 'a', embedding: vec(1), repo: '/repo/x', kind: 'function', artifact: false },
		{ id: 'b', embedding: vec(2), repo: '/repo/y', kind: 'function', artifact: false },
	]);
	const xOnly = await searchEntityVecs(Array.from(vec(1)), ['/repo/x'], 10);
	assert.equal(xOnly.length, 1);
	assert.equal(xOnly[0]!.id, 'a');
});

test('searchEntityVecs filter=code excludes artifacts', async () => {
	await writeEntityEmbeddings([
		{ id: 'code1',     embedding: vec(1), repo: '/repo/foo', kind: 'function', artifact: false },
		{ id: 'artifact1', embedding: vec(2), repo: '/repo/foo', kind: 'document', artifact: true  },
	]);
	const codeOnly = await searchEntityVecs(Array.from(vec(1)), ['/repo/foo'], 10, 'code');
	assert.equal(codeOnly.length, 1);
	assert.equal(codeOnly[0]!.id, 'code1');
});

test('searchEntityVecs filter=artifact returns only artifacts', async () => {
	await writeEntityEmbeddings([
		{ id: 'code1',     embedding: vec(1), repo: '/repo/foo', kind: 'function', artifact: false },
		{ id: 'artifact1', embedding: vec(2), repo: '/repo/foo', kind: 'document', artifact: true  },
	]);
	const artOnly = await searchEntityVecs(Array.from(vec(1)), ['/repo/foo'], 10, 'artifact');
	assert.equal(artOnly.length, 1);
	assert.equal(artOnly[0]!.id, 'artifact1');
});

test('searchEntityVecs returns [] for empty query vector', async () => {
	await writeEntityEmbedding({ id: 'a', embedding: vec(1), repo: '/repo/foo', kind: 'function', artifact: false });
	assert.deepEqual(await searchEntityVecs([], ['/repo/foo'], 5), []);
});

test('searchEntityVecs returns [] for empty closureRepos', async () => {
	await writeEntityEmbedding({ id: 'a', embedding: vec(1), repo: '/repo/foo', kind: 'function', artifact: false });
	assert.deepEqual(await searchEntityVecs(Array.from(vec(1)), [], 5), []);
});

test('searchEntityVecs excludes the seed sentinel row', async () => {
	// Even with no real writes, a search shouldn't return _seed_entity_vec
	const hits = await searchEntityVecs(Array.from(vec(1)), ['', '/repo/foo'], 100);
	for (const h of hits) {
		assert.notEqual(h.id, '_seed_entity_vec');
	}
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

test('deleteEntityVec removes a single row', async () => {
	await writeEntityEmbedding({ id: 'e1', embedding: vec(1), repo: '/repo/foo', kind: 'function', artifact: false });
	await deleteEntityVec('e1');
	const hits = await searchEntityVecs(Array.from(vec(1)), ['/repo/foo'], 5);
	assert.deepEqual(hits.filter(h => h.id === 'e1'), []);
});

test('deleteEntityVecsByIds bulk drop', async () => {
	await writeEntityEmbeddings([
		{ id: 'a', embedding: vec(1), repo: '/repo/foo', kind: 'function', artifact: false },
		{ id: 'b', embedding: vec(2), repo: '/repo/foo', kind: 'function', artifact: false },
		{ id: 'c', embedding: vec(3), repo: '/repo/foo', kind: 'function', artifact: false },
	]);
	await deleteEntityVecsByIds(['a', 'c']);
	const remaining = await searchEntityVecs(Array.from(vec(2)), ['/repo/foo'], 10);
	const ids = remaining.map(h => h.id).sort();
	assert.deepEqual(ids, ['b']);
});

test('deleteEntityVecsForRepo removes all rows for a repo', async () => {
	await writeEntityEmbeddings([
		{ id: 'a', embedding: vec(1), repo: '/repo/x', kind: 'function', artifact: false },
		{ id: 'b', embedding: vec(2), repo: '/repo/x', kind: 'function', artifact: false },
		{ id: 'c', embedding: vec(3), repo: '/repo/y', kind: 'function', artifact: false },
	]);
	await deleteEntityVecsForRepo('/repo/x');
	const all = await searchEntityVecs(Array.from(vec(1)), ['/repo/x', '/repo/y'], 10);
	const ids = all.map(h => h.id).sort();
	assert.deepEqual(ids, ['c']);
});

test('delete on empty input is a silent no-op', async () => {
	await deleteEntityVecsByIds([]);
});

// ---------------------------------------------------------------------------
// SQL escape safety
// ---------------------------------------------------------------------------

test('strings with single quotes are escaped in delete + search', async () => {
	const id = "weird'id";
	await writeEntityEmbedding({ id, embedding: vec(1), repo: "/repo/quote'inside", kind: 'function', artifact: false });
	const hits = await searchEntityVecs(Array.from(vec(1)), ["/repo/quote'inside"], 5);
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, id);
	await deleteEntityVec(id);
	const after = await searchEntityVecs(Array.from(vec(1)), ["/repo/quote'inside"], 5);
	assert.equal(after.length, 0);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('rows survive close + reopen', async () => {
	await writeEntityEmbedding({ id: 'persist', embedding: vec(1), repo: '/repo/foo', kind: 'function', artifact: false });
	await closeLanceConn();
	_resetEntityVecCache();
	const hits = await searchEntityVecs(Array.from(vec(1)), ['/repo/foo'], 5);
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.id, 'persist');
});

// ---------------------------------------------------------------------------
// compactEntityVecTable
// ---------------------------------------------------------------------------
//
// Models the indexer's per-source-file pattern: many small
// addEntityEmbeddings() calls each producing a separate transaction +
// data file. After a long pass the manifest accumulates and per-write
// fsync time climbs (real-world Hadoop signal: 3.8 -> 5.1 s/file).
// compactEntityVecTable wraps Lance's table.optimize() (compaction +
// version pruning + index update). Tests below verify it actually
// reduces the on-disk fragment count + preserves all rows + survives
// close/reopen.

const dataDir = (): string => join(dir, 'lance', 'entity_vec.lance', 'data');

test('compactEntityVecTable reduces on-disk fragment count', async () => {
	// Simulate 30 small per-file batches like the indexer does.
	for (let batch = 0; batch < 30; batch++) {
		const rows = Array.from({ length: 5 }, (_, i) => ({
			id:        `e${batch}-${i}`,
			embedding: vec(batch * 1000 + i),
			repo:      '/repo/foo',
			kind:      'function',
			artifact:  false,
		}));
		await addEntityEmbeddings(rows);
	}
	assert.ok(existsSync(dataDir()));
	const before = readdirSync(dataDir()).length;
	assert.ok(before >= 30, `expected >= 30 fragments before compact; got ${before}`);

	const stats = await compactEntityVecTable();
	assert.equal(typeof stats.fragmentsRemoved, 'number');
	assert.equal(typeof stats.filesRemoved,     'number');
	assert.equal(typeof stats.elapsedMs,        'number');
	assert.ok(stats.fragmentsRemoved >= 1, `compact should reclaim fragments; got ${JSON.stringify(stats)}`);

	const after = readdirSync(dataDir()).length;
	assert.ok(after < before, `expected fewer data files after compact (${before} -> ${after})`);
});

test('compactEntityVecTable preserves all rows + searchability', async () => {
	const N = 50;
	for (let i = 0; i < N; i++) {
		await addEntityEmbeddings([{
			id:        `keep-${i}`,
			embedding: vec(i),
			repo:      '/repo/foo',
			kind:      'function',
			artifact:  false,
		}]);
	}
	const beforeHits = await searchEntityVecs(Array.from(vec(7)), ['/repo/foo'], N + 5);
	assert.equal(beforeHits.length, N, 'all rows present pre-compact');

	await compactEntityVecTable();

	const afterHits = await searchEntityVecs(Array.from(vec(7)), ['/repo/foo'], N + 5);
	assert.equal(afterHits.length, N, 'all rows still present post-compact');
	const ids = new Set(afterHits.map(h => h.id));
	for (let i = 0; i < N; i++) assert.ok(ids.has(`keep-${i}`));
});

test('compactEntityVecTable on a fresh / single-fragment table is a cheap no-op', async () => {
	// Bootstrap row only -- nothing to compact.
	const stats = await compactEntityVecTable();
	assert.equal(typeof stats.fragmentsRemoved, 'number');
	assert.ok(stats.elapsedMs < 5_000, `expected fast no-op; got ${stats.elapsedMs} ms`);
});

test('compactEntityVecTable result survives close + reopen', async () => {
	for (let batch = 0; batch < 10; batch++) {
		await addEntityEmbeddings([{
			id:        `surv-${batch}`,
			embedding: vec(batch),
			repo:      '/repo/foo',
			kind:      'function',
			artifact:  false,
		}]);
	}
	await compactEntityVecTable();

	await closeLanceConn();
	_resetEntityVecCache();

	const hits = await searchEntityVecs(Array.from(vec(3)), ['/repo/foo'], 20);
	assert.equal(hits.length, 10, 'all 10 rows still findable after compact + reopen');
});
