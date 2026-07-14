/**
 * Phase 7.4 tests for compactGraphStore.
 *
 * The flow under test:
 *   1. Open env, write a lot of rows so LMDB grows.
 *   2. Delete most of them (free pages but file size unchanged).
 *   3. Run compactGraphStore -- should rewrite the env into a
 *      smaller file and re-open.
 *   4. Verify surviving rows are still readable.
 *
 * Cleanup also covers: env not open -> error; .compact / .bak
 * leftovers from a prior aborted run get removed before the new
 * compact starts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	closeGraphStore,
	compactGraphStore,
	getGraphStore,
	setGraphStorePath,
	withWriteTxn,
} from '../store.js';
import {
	encodeOutEdgeKey,
	encodeInEdgeKey,
} from '../keys.js';

let dir: string;
let lmdbPath: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-compact-7.4-'));
	lmdbPath = join(dir, 'graph.lmdb');
	setGraphStorePath(lmdbPath);
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

async function bulkInsertEdges(n: number, startId = 0): Promise<void> {
	await withWriteTxn(s => {
		for (let i = 0; i < n; i++) {
			const from = BigInt(startId + i);
			const to   = BigInt(startId + i + 1);
			s.outEdge.put(encodeOutEdgeKey(from, 1, to), Buffer.alloc(0));
			s.inEdge.put(encodeInEdgeKey(to, 1, from), Buffer.alloc(0));
		}
	});
}

async function deleteEdges(start: number, end: number): Promise<void> {
	await withWriteTxn(s => {
		for (let i = start; i < end; i++) {
			const from = BigInt(i);
			const to   = BigInt(i + 1);
			s.outEdge.remove(encodeOutEdgeKey(from, 1, to));
			s.inEdge.remove(encodeInEdgeKey(to, 1, from));
		}
	});
}

async function countOutEdges(): Promise<number> {
	const store = await getGraphStore();
	let n = 0;
	for (const _ of store.outEdge.getRange()) n++;
	return n;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('compactGraphStore reclaims space after large deletes', async () => {
	await getGraphStore();
	// Populate: 50k edges. Each edge is ~17B key + small value, so the
	// raw data is ~1MB but LMDB pages round up; expect a couple-MiB
	// file.
	await bulkInsertEdges(50_000);

	// Delete 90% of them. Pages get marked free on the meta page's
	// free-list and may get reused by future writes -- but the file
	// itself does NOT shrink without compact.
	await deleteEdges(0, 45_000);
	const sizeAfterDeletes = statSync(lmdbPath).size;

	// Compact. Should rewrite the env using only live pages.
	const result = await compactGraphStore();
	assert.equal(result.beforeBytes, sizeAfterDeletes,
		'beforeBytes should match the file size at compact-call-time');
	assert.ok(result.afterBytes < result.beforeBytes,
		`expected afterBytes < beforeBytes; got ${result.afterBytes} vs ${result.beforeBytes}`);
	assert.ok(result.savedBytes > 0);
	assert.equal(result.savedBytes, result.beforeBytes - result.afterBytes);

	// Survivors are still readable.
	assert.equal(await countOutEdges(), 5_000);
});

test('compactGraphStore preserves all rows when nothing has been freed', async () => {
	await getGraphStore();
	await bulkInsertEdges(1_000);
	const before = await countOutEdges();

	const result = await compactGraphStore();
	assert.ok(result.afterBytes <= result.beforeBytes,
		'compact should never grow the file');
	assert.equal(await countOutEdges(), before, 'all rows must round-trip');
});

test('compactGraphStore cleans up .bak after success', async () => {
	await getGraphStore();
	await bulkInsertEdges(100);
	await compactGraphStore();
	assert.ok(!existsSync(`${lmdbPath}.bak`),
		'.bak should be removed after a successful compact');
	assert.ok(!existsSync(`${lmdbPath}.compact`),
		'.compact should not survive a successful compact');
});

test('compactGraphStore re-opens the env so subsequent writes go through', async () => {
	await getGraphStore();
	await bulkInsertEdges(100, 0);
	await compactGraphStore();
	// Write more after compact (distinct key range) -- must land in
	// the re-opened env.
	await bulkInsertEdges(50, 1_000_000);
	assert.equal(await countOutEdges(), 150);
});

test('compactGraphStore throws when env is not open', async () => {
	await closeGraphStore();
	await assert.rejects(
		() => compactGraphStore(),
		/not open/,
	);
});

test('compactGraphStore pre-clears stale .compact / .bak from a prior aborted run', async () => {
	await getGraphStore();
	await bulkInsertEdges(100);

	// Simulate leftovers from a prior crash mid-rename: a `.bak` file
	// where an old original landed but the swap never completed.
	writeFileSync(`${lmdbPath}.bak`, 'leftover from crash');
	writeFileSync(`${lmdbPath}.compact`, 'partial copy from crash');

	// Compact should still succeed -- the leftovers get cleared first.
	const result = await compactGraphStore();
	assert.ok(result.afterBytes > 0);
	assert.ok(!existsSync(`${lmdbPath}.bak`));
	assert.ok(!existsSync(`${lmdbPath}.compact`));
});
