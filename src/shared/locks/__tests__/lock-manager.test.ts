/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cross-thread named locks (Story afcfa027/S001) on one thread: the block
 * layout, argument checks, name resolution and grants. Two managers over one
 * block with different threadIds stand in for two threads.
 *
 * Run: npx tsx --test src/shared/locks/__tests__/lock-manager.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	createLockBlock, DEFAULT_LOCK_CAPACITY, getLockManager, installLockManager, LockArgumentError, LockCapacityError, LockManager,
	LockNestedError, setLockGrantHookForTests, validateLockRequest,
} from '../lock-manager.js';
import type { Lock, LockGrantPoint, LockInfo, LockOptions } from '../lock-manager.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

test('createLockBlock stores capacities in the header and two managers over one block read the same layout', async () => {
	assert.deepEqual(new LockManager(createLockBlock()).capacity, DEFAULT_LOCK_CAPACITY);
	assert.deepEqual(DEFAULT_LOCK_CAPACITY, { names: 64, holders: 512, pending: 256 });

	const block = createLockBlock({ names: 3, holders: 5, pending: 7 });
	const a = new LockManager(block, { threadId: 1 });
	const b = new LockManager(block, { threadId: 2 });
	assert.deepEqual(a.capacity, { names: 3, holders: 5, pending: 7 });
	assert.deepEqual(b.capacity, a.capacity);
	// Same layout: a name one manager claims is found at the same slot by the other.
	const slot = await a.resolveName(enc('alpha'));
	assert.equal(await b.resolveName(enc('alpha')), slot);
	assert.equal(await b.resolveName(enc('beta')), slot + 1);
	assert.equal(await a.resolveName(enc('beta')), slot + 1);

	assert.throws(() => createLockBlock({ names: 0 }), (e: unknown) => e instanceof LockArgumentError && e.argument === 'capacity.names');
	assert.throws(() => new LockManager(new SharedArrayBuffer(64)), /does not match the capacities/);
});

test('invalid arguments are refused with LockArgumentError and nothing is truncated', async () => {
	const refused = (name: string, options: LockOptions, argument: string, limit: RegExp): void => {
		assert.throws(() => validateLockRequest(name, options), (e: unknown) => {
			assert.ok(e instanceof LockArgumentError, String(e));
			assert.equal(e.argument, argument);
			assert.match(e.message, limit);
			return true;
		});
	};
	refused('', {}, 'name', /1 to 64 UTF-8 bytes \(got 0\)/);
	refused('x'.repeat(65), {}, 'name', /got 65/);
	// 32 two-byte characters fill the limit exactly; one more byte is refused, not cut.
	assert.equal(validateLockRequest('é'.repeat(32), {}).nameBytes.length, 64);
	refused(`${'é'.repeat(32)}a`, {}, 'name', /got 65/);
	refused('n', { mode: 'read' as never }, 'mode', /'shared' or 'exclusive'/);
	refused('n', { timeoutMs: -1 }, 'timeoutMs', />= 0/);
	refused('n', { timeoutMs: Number.NaN }, 'timeoutMs', />= 0/);
	refused('n', { ifAvailable: true, timeoutMs: 5 }, 'ifAvailable', /signal or timeoutMs/);
	refused('n', { ifAvailable: true, signal: new AbortController().signal }, 'ifAvailable', /signal or timeoutMs/);
	refused('n', { metadata: { activity: 'a'.repeat(65), reason: '' } }, 'metadata.activity', /at most 64 UTF-8 bytes \(got 65\)/);
	refused('n', { metadata: { activity: 'a', reason: 'r'.repeat(1025) } }, 'metadata.reason', /at most 1024 UTF-8 bytes \(got 1025\)/);

	// At the limits, values are kept whole.
	const ok = validateLockRequest('n', { metadata: { activity: 'a'.repeat(64), reason: 'r'.repeat(1024) } });
	assert.equal(ok.activity?.length, 64);
	assert.equal(ok.reason?.length, 1024);
	assert.equal(ok.mode, 'exclusive', 'mode defaults to exclusive');
	assert.equal(validateLockRequest('n', { mode: 'shared' }).mode, 'shared');

	// Validation touches no shared state.
	const block = createLockBlock({ names: 2, holders: 2, pending: 2 });
	const before = Buffer.from(new Uint8Array(block)).toString('hex');
	assert.throws(() => validateLockRequest('', {}), LockArgumentError);
	assert.equal(Buffer.from(new Uint8Array(block)).toString('hex'), before);
});

test('a name resolves to one slot and a full name table gives LockCapacityError(names)', async () => {
	const block = createLockBlock({ names: 2, holders: 2, pending: 2 });
	const a = new LockManager(block, { threadId: 1 });
	const b = new LockManager(block, { threadId: 2 });
	// Both managers race to claim the same new name: one slot results.
	const [x, y] = await Promise.all([a.resolveName(enc('same')), b.resolveName(enc('same'))]);
	assert.equal(x, y);
	assert.equal(await a.resolveName(enc('same')), x, 'resolving again returns the same slot');
	assert.notEqual(await a.resolveName(enc('other')), x);
	await assert.rejects(a.resolveName(enc('third')), (e: unknown) => {
		assert.ok(e instanceof LockCapacityError, String(e));
		assert.equal(e.table, 'names');
		assert.equal(e.capacity, 2);
		return true;
	});
	// Names already claimed still resolve when the table is full.
	assert.equal(await b.resolveName(enc('same')), x);

	// A slot another thread is claiming (state -(threadId + 1)) is never passed: a
	// resolver waits on it, and claims it itself once it is reset to free (as
	// reclaim does for a claimer that died).
	const fresh = createLockBlock({ names: 2, holders: 2, pending: 2 });
	const words = new Int32Array(fresh);
	const SLOT0_STATE = 8; // first word after the 8-word header
	Atomics.store(words, SLOT0_STATE, -(7 + 1));
	let resolved: number | undefined;
	const pending = new LockManager(fresh, { threadId: 3 }).resolveName(enc('late')).then(i => { resolved = i; });
	await new Promise(res => setTimeout(res, 20));
	assert.equal(resolved, undefined, 'the resolver waits behind the slot being claimed');
	assert.equal(Atomics.load(words, SLOT0_STATE), -(7 + 1));
	Atomics.store(words, SLOT0_STATE, 0);
	await pending;
	assert.equal(resolved, 0, 'the freed slot is claimed, not skipped');
	assert.equal(Atomics.load(words, SLOT0_STATE), 1, 'published ready');
});

test('getLockManager without an install uses a private block', () => {
	const first = getLockManager();
	assert.ok(first.block instanceof SharedArrayBuffer);
	assert.deepEqual(first.capacity, DEFAULT_LOCK_CAPACITY);
	assert.equal(getLockManager(), first, 'the private manager is kept');
	const block = createLockBlock();
	const installed = installLockManager(block);
	assert.equal(getLockManager(), installed);
	assert.equal(getLockManager().block, block);
});

/** Two managers over one block, standing in for threads 1 and 2. */
function pair(capacity: Parameters<typeof createLockBlock>[0] = {}): [LockManager, LockManager, SharedArrayBuffer] {
	const block = createLockBlock(capacity);
	return [new LockManager(block, { threadId: 1 }), new LockManager(block, { threadId: 2 }), block];
}

/** Hold `name` on `m` until the returned release() is called. */
async function hold(m: LockManager, name: string, options: LockOptions = {}): Promise<{ lock: Lock | null; release: () => Promise<void> }> {
	let release!: () => void;
	const gate = new Promise<void>(r => { release = r; });
	let granted!: (l: Lock | null) => void;
	const lockP = new Promise<Lock | null>(r => { granted = r; });
	const done = m.request(name, options, async lock => { granted(lock); await gate; });
	const lock = await lockP;
	return { lock, release: async () => { release(); await done; } };
}

/** What an ifAvailable request on `m` gets: the lock's mode, or null with what blocks it. */
function probe(m: LockManager, name: string, mode: 'shared' | 'exclusive'): Promise<{ lock: Lock | null; blockedBy: readonly LockInfo[] }> {
	return m.request(name, { mode, ifAvailable: true }, (lock, blockedBy) => ({ lock, blockedBy }));
}

test('exclusive excludes exclusive and shared, shared admits shared, mode defaults to exclusive', async () => {
	const [a, b] = pair();
	const ex = await hold(a, 'x');
	assert.equal(ex.lock?.mode, 'exclusive', 'mode defaults to exclusive');
	assert.equal((await probe(b, 'x', 'exclusive')).lock, null, 'exclusive excludes exclusive');
	assert.equal((await probe(b, 'x', 'shared')).lock, null, 'exclusive excludes shared');
	await ex.release();

	const sh = await hold(a, 'x', { mode: 'shared' });
	assert.equal(sh.lock?.mode, 'shared');
	assert.equal((await probe(b, 'x', 'shared')).lock?.mode, 'shared', 'shared admits shared');
	const sh2 = await hold(b, 'x', { mode: 'shared' });
	assert.equal((await probe(b, 'x', 'exclusive')).lock, null, 'shared excludes exclusive');
	await sh.release();
	assert.equal((await probe(a, 'x', 'exclusive')).lock, null, 'one shared holder still excludes exclusive');
	await sh2.release();
	assert.equal((await probe(a, 'x', 'exclusive')).lock?.mode, 'exclusive', 'free once both shared holders release');
	// The callback's value is request's value.
	assert.equal(await a.request('x', {}, () => 42), 42);
});

test('ifAvailable grants when free and otherwise calls back with null and the holders with metadata, never pending', async () => {
	const [a, b, block] = pair();
	assert.deepEqual((await probe(b, 'm', 'shared')).blockedBy, [], 'granted when free');
	const metadata = { activity: 'maintenance', reason: 'compacting graph.lmdb' };
	const before = Date.now();
	const held = await hold(a, 'm', { metadata });
	assert.deepEqual(held.lock, { name: 'm', mode: 'exclusive', metadata });

	const snapshot = Buffer.from(new Uint8Array(block)).toString('hex');
	const refused = await probe(b, 'm', 'shared');
	assert.equal(refused.lock, null);
	assert.equal(refused.blockedBy.length, 1);
	const [h] = refused.blockedBy;
	assert.deepEqual({ ...h, since: 0 }, { name: 'm', mode: 'exclusive', threadId: 1, since: 0, metadata });
	assert.ok(h!.since >= before && h!.since <= Date.now(), 'since is the grant time');
	assert.equal(Buffer.from(new Uint8Array(block)).toString('hex'), snapshot, 'a refused ifAvailable request leaves the block exactly as it was: nothing pending');

	// Without metadata the holder carries none.
	await held.release();
	const plain = await hold(a, 'm');
	const [p] = (await probe(b, 'm', 'exclusive')).blockedBy;
	assert.equal(p!.metadata, undefined);
	assert.equal('metadata' in p!, false);
	await plain.release();
});

test('the lock is released and its holder slot cleared on resolve, reject and synchronous throw', async () => {
	const [a, b] = pair();
	const holderCount = async (): Promise<number> => {
		const other = await hold(b, 'r');
		assert.ok(other.lock !== null, 'the lock is free');
		// Only b's own record exists while b holds it.
		const seen = (await probe(a, 'r', 'shared')).blockedBy;
		await other.release();
		return seen.length;
	};
	assert.equal(await a.request('r', {}, async () => 'ok'), 'ok');
	assert.equal(await holderCount(), 1, 'released after resolve');

	const rejection = new Error('rejected');
	await assert.rejects(a.request('r', {}, async () => { throw rejection; }), (e: unknown) => e === rejection);
	assert.equal(await holderCount(), 1, 'released after reject');

	const thrown = new TypeError('sync throw');
	await assert.rejects(a.request('r', {}, () => { throw thrown; }), (e: unknown) => e === thrown);
	assert.equal(await holderCount(), 1, 'released after a synchronous throw');
});

test('same-name nesting and unbounded nested waits fail with LockNestedError; bounded nested requests are allowed', async () => {
	const [a, b] = pair();
	await a.request('outer', {}, async () => {
		await assert.rejects(a.request('outer', { ifAvailable: true }, () => 0), (e: unknown) => e instanceof LockNestedError && e.kind === 'same-name');
		await assert.rejects(a.request('outer', { mode: 'shared', timeoutMs: 10 }, () => 0), (e: unknown) => e instanceof LockNestedError && e.kind === 'same-name');
		await assert.rejects(a.request('inner', {}, () => 0), (e: unknown) => e instanceof LockNestedError && e.kind === 'unbounded-wait' && e.heldName === 'outer');
		assert.equal(await a.request('inner', { ifAvailable: true }, l => l?.name), 'inner');
		assert.equal(await a.request('inner', { timeoutMs: 100 }, l => l?.name), 'inner');
		// Two levels deep, the outermost name is still refused.
		await a.request('inner', { timeoutMs: 100 }, async () => {
			await assert.rejects(a.request('outer', { ifAvailable: true }, () => 0), (e: unknown) => e instanceof LockNestedError && e.kind === 'same-name');
		});
		// The outer hold is unaffected by the refusals.
		assert.equal((await probe(b, 'outer', 'shared')).lock, null);
	});
	// Outside the callback the same chain may ask again.
	assert.equal(await a.request('outer', {}, () => 'again'), 'again');
});

test('a full holder table gives LockCapacityError(holders) and leaves no grant behind', async () => {
	const [a, b] = pair({ holders: 1 });
	const held = await hold(a, 'one');
	await assert.rejects(b.request('two', { mode: 'shared' }, () => 0), (e: unknown) => {
		assert.ok(e instanceof LockCapacityError, String(e));
		assert.equal(e.table, 'holders');
		assert.equal(e.capacity, 1);
		return true;
	});
	await held.release();
	// The refused shared grant gave its lock word back: an exclusive request is granted.
	assert.equal((await probe(b, 'two', 'exclusive')).lock?.mode, 'exclusive');
});

test('the grant hook fires at its three points in order and is inert when unset', async () => {
	const [a] = pair();
	const seen: [LockGrantPoint, string][] = [];
	setLockGrantHookForTests((point, name) => { seen.push([point, name]); });
	try {
		await a.request('hooked', {}, () => undefined);
	} finally {
		setLockGrantHookForTests(null);
	}
	assert.deepEqual(seen, [['in-critical-section', 'hooked'], ['after-lock-word', 'hooked'], ['before-publish', 'hooked']]);
	// A refused grant stops after the critical-section point.
	const [c, d] = pair();
	const held = await hold(c, 'busy');
	const refusedSeen: LockGrantPoint[] = [];
	setLockGrantHookForTests(point => { refusedSeen.push(point); });
	try {
		await probe(d, 'busy', 'exclusive');
	} finally {
		setLockGrantHookForTests(null);
	}
	assert.deepEqual(refusedSeen, ['in-critical-section']);
	await held.release();

	// Unset, grants still work and nothing is recorded.
	seen.length = 0;
	assert.equal(await a.request('hooked', {}, l => l?.mode), 'exclusive');
	assert.deepEqual(seen, []);
});
