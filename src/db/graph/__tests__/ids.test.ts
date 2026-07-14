/**
 * Phase 1.2 tests for the sequential ID allocators.
 *
 * Verifies that:
 *   - First allocation returns 1 (reserving 0 as the "no ID" sentinel)
 *   - Subsequent allocations are monotonically increasing
 *   - Block allocation reserves the requested span without gaps
 *   - Counters survive close+reopen of the env
 *   - Concurrent allocations across the txn boundary serialize correctly
 *   - peekIdCounters reads without mutating
 *   - In-txn allocator works alongside other writes in the same txn
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	closeGraphStore,
	getGraphStore,
	setGraphStorePath,
	withWriteTxn,
} from '../store.js';
import {
	allocateEntityId,
	allocateEntityIdBlock,
	allocateEntityIdInTxn,
	allocateRepoId,
	allocateRepoIdInTxn,
	peekIdCounters,
} from '../ids.js';
import { encodeEntityKey } from '../keys.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-graph-ids-1.2-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('first entity allocation returns 1 (0 reserved as no-ID sentinel)', async () => {
	const id = await allocateEntityId();
	assert.equal(id, 1n);
});

test('first repo allocation returns 1', async () => {
	const id = await allocateRepoId();
	assert.equal(id, 1);
});

test('entity allocations are monotonically increasing', async () => {
	const ids: bigint[] = [];
	for (let i = 0; i < 100; i++) {
		ids.push(await allocateEntityId());
	}
	for (let i = 1; i < ids.length; i++) {
		assert.equal(ids[i], ids[i - 1]! + 1n, `allocations not strictly +1 at index ${i}`);
	}
	assert.equal(ids[0], 1n);
	assert.equal(ids[99], 100n);
});

test('repo allocations are monotonically increasing', async () => {
	const ids: number[] = [];
	for (let i = 0; i < 50; i++) {
		ids.push(await allocateRepoId());
	}
	for (let i = 1; i < ids.length; i++) {
		assert.equal(ids[i], ids[i - 1]! + 1);
	}
	assert.equal(ids[0], 1);
	assert.equal(ids[49], 50);
});

test('block allocation reserves contiguous IDs without gaps', async () => {
	const first = await allocateEntityIdBlock(100);
	assert.equal(first, 1n);
	// Next single-allocation should be 101
	const next = await allocateEntityId();
	assert.equal(next, 101n);
});

test('block allocation rejects count < 1', async () => {
	await assert.rejects(allocateEntityIdBlock(0), /count must be >= 1/);
	await assert.rejects(allocateEntityIdBlock(-5), /count must be >= 1/);
});

test('counters survive close + reopen', async () => {
	for (let i = 0; i < 5; i++) await allocateEntityId();
	for (let i = 0; i < 3; i++) await allocateRepoId();
	const before = await peekIdCounters();
	assert.equal(before.nextEntityId, 6n);
	assert.equal(before.nextRepoId, 4);

	await closeGraphStore();

	const after = await peekIdCounters();
	assert.equal(after.nextEntityId, 6n);
	assert.equal(after.nextRepoId, 4);
	const id = await allocateEntityId();
	assert.equal(id, 6n);
});

test('peek does not mutate the counter', async () => {
	await allocateEntityId(); // now next=2
	const a = await peekIdCounters();
	const b = await peekIdCounters();
	const c = await peekIdCounters();
	assert.equal(a.nextEntityId, 2n);
	assert.equal(b.nextEntityId, 2n);
	assert.equal(c.nextEntityId, 2n);
});

test('in-txn allocator works alongside other writes', async () => {
	await getGraphStore();
	await withWriteTxn(s => {
		const a = allocateEntityIdInTxn(s);
		const b = allocateEntityIdInTxn(s);
		const c = allocateEntityIdInTxn(s);
		assert.equal(a, 1n);
		assert.equal(b, 2n);
		assert.equal(c, 3n);
		// Use the IDs in the same txn (e.g. write entity rows)
		s.entity.put(encodeEntityKey(a), Buffer.from('row-a'));
		s.entity.put(encodeEntityKey(b), Buffer.from('row-b'));
		s.entity.put(encodeEntityKey(c), Buffer.from('row-c'));
	});
	const next = await allocateEntityId();
	assert.equal(next, 4n);
});

test('in-txn allocator: repo + entity counters are independent', async () => {
	await getGraphStore();
	await withWriteTxn(s => {
		const e = allocateEntityIdInTxn(s);
		const r = allocateRepoIdInTxn(s);
		assert.equal(e, 1n);
		assert.equal(r, 1);
	});
	const e2 = await allocateEntityId();
	const r2 = await allocateRepoId();
	assert.equal(e2, 2n);
	assert.equal(r2, 2);
});

test('concurrent allocations all return distinct IDs', async () => {
	const promises: Promise<bigint>[] = [];
	for (let i = 0; i < 200; i++) {
		promises.push(allocateEntityId());
	}
	const ids = await Promise.all(promises);
	const unique = new Set(ids.map(b => b.toString()));
	assert.equal(unique.size, ids.length, 'duplicate IDs allocated under concurrency');
	const sorted = [...ids].sort((a, b) => Number(a - b));
	assert.equal(sorted[0], 1n);
	assert.equal(sorted[199], 200n);
});

test('large block allocation produces correct next value at u64 scale', async () => {
	// Burn through 1M IDs to verify bigint arithmetic stays correct
	const first = await allocateEntityIdBlock(1_000_000);
	assert.equal(first, 1n);
	const counters = await peekIdCounters();
	assert.equal(counters.nextEntityId, 1_000_001n);
	const next = await allocateEntityId();
	assert.equal(next, 1_000_001n);
});
