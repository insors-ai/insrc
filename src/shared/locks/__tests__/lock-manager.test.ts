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
import { EventEmitter } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import {
	createLockBlock, DEFAULT_LOCK_CAPACITY, getLockManager, installLockManager, LockArgumentError, LockCapacityError, LockManager,
	LockNestedError, LockTimeoutError, setLockGrantHookForTests, validateLockRequest, watchWorker,
} from '../lock-manager.js';
import type { Lock, LockGrantPoint, LockInfo, LockOptions } from '../lock-manager.js';
import type { Worker as WorkerType } from 'node:worker_threads';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const HERE = dirname(fileURLToPath(import.meta.url));
const tick = (ms = 20): Promise<void> => new Promise(res => setTimeout(res, ms));

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

test('writer preference: a waiting exclusive blocks ifAvailable shared and runs before a waiting shared', async () => {
	const block = createLockBlock();
	const [a, b, c] = [1, 2, 3].map(threadId => new LockManager(block, { threadId })) as [LockManager, LockManager, LockManager];
	const order: string[] = [];
	const shared = await hold(a, 'w', { mode: 'shared' });

	const writer = b.request('w', { mode: 'exclusive' }, () => { order.push('exclusive'); });
	await tick();
	const refused = await probe(c, 'w', 'shared');
	assert.equal(refused.lock, null, 'a waiting exclusive stops new shared grants');
	assert.deepEqual(refused.blockedBy.map(i => [i.mode, i.threadId]), [['shared', 1], ['exclusive', 2]], 'the shared holder and the waiting exclusive block it');
	// An ifAvailable exclusive does not register as pending, so it blocks nothing.
	assert.equal((await probe(c, 'w', 'exclusive')).lock, null);

	const reader = c.request('w', { mode: 'shared' }, () => { order.push('shared'); });
	await tick();
	assert.deepEqual(order, [], 'both wait while the shared holder holds');
	await shared.release();
	await Promise.all([writer, reader]);
	assert.deepEqual(order, ['exclusive', 'shared'], 'the exclusive ran first, then the shared waiter');
	assert.equal((await probe(c, 'w', 'shared')).lock?.mode, 'shared', 'the pending-exclusive count is back to zero');
});

test('timeoutMs rejects with LockTimeoutError naming the holders and leaves no pending entry or count', async () => {
	const [a, b] = pair({ pending: 1 });
	const metadata = { activity: 'maintenance', reason: 'compact' };
	const shared = await hold(a, 't', { mode: 'shared', metadata });
	const started = Date.now();
	await assert.rejects(b.request('t', { timeoutMs: 60 }, () => 0), (e: unknown) => {
		assert.ok(e instanceof LockTimeoutError, String(e));
		assert.equal(e.lockName, 't');
		assert.ok(e.waitedMs >= 60, `waited ${e.waitedMs} ms`);
		assert.deepEqual(e.holders.map(h => [h.mode, h.threadId, h.metadata]), [['shared', 1, metadata]]);
		assert.match(e.message, /lock 't': not granted within \d+ ms \(held by shared on thread 1 since .*\(maintenance: compact\)\)/);
		return true;
	});
	assert.ok(Date.now() - started < 2_000, 'it did not wait past its timeout');
	// The pending-exclusive count is gone: a new shared request is granted at once.
	assert.equal((await probe(b, 't', 'shared')).lock?.mode, 'shared');
	// The pending entry is gone: the one-slot pending table takes a new waiter.
	const waiter = b.request('t', { timeoutMs: 5_000 }, l => l?.mode);
	await tick();
	await shared.release();
	assert.equal(await waiter, 'exclusive');
	// timeoutMs 0 on a free lock is granted, not timed out.
	assert.equal(await b.request('t', { timeoutMs: 0 }, l => l?.mode), 'exclusive');
});

test('an already-aborted signal refuses before queuing; an abort while waiting rejects with signal.reason and cleans up', async () => {
	const [a, b, block] = pair({ pending: 1 });
	const reason = new Error('caller gave up');
	const pre = new AbortController();
	pre.abort(reason);
	const untouched = Buffer.from(new Uint8Array(block)).toString('hex');
	await assert.rejects(b.request('s', { signal: pre.signal }, () => 0), (e: unknown) => e === reason);
	assert.equal(Buffer.from(new Uint8Array(block)).toString('hex'), untouched, 'refused before touching shared state (the name was not even claimed)');

	const held = await hold(a, 's', { mode: 'shared' });
	const ctl = new AbortController();
	const waiting = b.request('s', { signal: ctl.signal }, () => 0);
	await tick();
	assert.equal((await probe(a, 's', 'shared')).lock, null, 'the waiting exclusive is counted');
	const why = new Error('stop waiting');
	ctl.abort(why);
	await assert.rejects(waiting, (e: unknown) => e === why);
	assert.equal((await probe(a, 's', 'shared')).lock?.mode, 'shared', 'the count is withdrawn');
	const next = b.request('s', { timeoutMs: 5_000 }, l => l?.mode);
	await tick();
	await held.release();
	assert.equal(await next, 'exclusive', 'the pending slot was freed for the next waiter');
});

test('requests for one name from one thread are served in arrival order', async () => {
	const [a, b] = pair();
	const blocker = await hold(a, 'q');
	const order: string[] = [];
	// A shared request queued first is granted first, even though the exclusive
	// queued after it would otherwise win by writer preference.
	const first = b.request('q', { mode: 'shared' }, async () => { order.push('1 shared'); await tick(); });
	const second = b.request('q', { mode: 'exclusive' }, () => { order.push('2 exclusive'); });
	const third = b.request('q', { mode: 'shared' }, () => { order.push('3 shared'); });
	await tick();
	await blocker.release();
	await Promise.all([first, second, third]);
	assert.deepEqual(order, ['1 shared', '2 exclusive', '3 shared']);
});

test('a full pending table gives LockCapacityError(pending) and queues nothing', async () => {
	const block = createLockBlock({ pending: 1 });
	const [a, b, c] = [1, 2, 3].map(threadId => new LockManager(block, { threadId })) as [LockManager, LockManager, LockManager];
	const held = await hold(a, 'p', { mode: 'shared' });
	// b's exclusive waits behind the shared holder and takes the one pending slot.
	const waiter = b.request('p', { timeoutMs: 5_000 }, l => l?.mode);
	await tick();
	await assert.rejects(c.request('p', { timeoutMs: 5_000 }, () => 0), (e: unknown) => {
		assert.ok(e instanceof LockCapacityError, String(e));
		assert.equal(e.table, 'pending');
		assert.equal(e.capacity, 1);
		return true;
	});
	await held.release();
	assert.equal(await waiter, 'exclusive');
	// The refused exclusive left no count behind: once b's is retired, a shared request is granted.
	assert.equal((await probe(c, 'p', 'shared')).lock?.mode, 'shared');
});

test('a lock wait keeps its thread alive until it completes', async () => {
	const block = createLockBlock();
	const main = new LockManager(block, { threadId: 0 });
	const held = await hold(main, 'alive');
	const worker = new Worker(join(HERE, 'helpers', 'lock-wait-worker.ts'), { workerData: { block, name: 'alive' } });
	let exited = false;
	const exit = new Promise<number>(res => worker.once('exit', code => { exited = true; res(code); }));
	const granted = new Promise<unknown>(res => worker.once('message', m => res(m)));
	await tick(300);
	assert.equal(exited, false, 'the worker is still waiting, not exited');
	await held.release();
	assert.deepEqual(await granted, { granted: 'exclusive' });
	assert.equal(await exit, 0, 'and exits on its own once its wait is done');
});

/**
 * Word offsets of the block layout (lock-manager.ts): an 8-word header; name
 * slots of 23 words (state, hash, length, lock, pending-exclusive, version,
 * mutex, 16 name words); holder slots of 278 words; pending slots of 4.
 */
function offsets(capacity: { names: number; holders: number }): {
	nameState: (i: number) => number; lock: (i: number) => number; pendx: (i: number) => number; mutex: (i: number) => number;
	holderState: (slot: number) => number; pendingState: (slot: number) => number;
} {
	const names = 8;
	const holders = names + capacity.names * 23;
	const pending = holders + capacity.holders * 278;
	return {
		nameState: i => names + i * 23, lock: i => names + i * 23 + 3, pendx: i => names + i * 23 + 4, mutex: i => names + i * 23 + 6,
		holderState: slot => holders + slot * 278, pendingState: slot => pending + slot * 278,
	};
}

test("a waiting exclusive request's metadata is in query().pending and in the blockedBy of a shared request it refuses", async () => {
	const block = createLockBlock();
	const [a, b, c] = [1, 2, 3].map(threadId => new LockManager(block, { threadId })) as [LockManager, LockManager, LockManager];
	const ha = await hold(a, 'p', { mode: 'shared' });
	const metadata = { activity: 'compaction', reason: '31 min idle, 40% / 300 MB reclaimable' };
	const waiting = b.request('p', { mode: 'exclusive', timeoutMs: 5_000, metadata }, () => 'granted');
	await tick();
	assert.deepEqual(a.query().pending.map(p => ({ mode: p.mode, threadId: p.threadId, metadata: p.metadata })), [{ mode: 'exclusive', threadId: 2, metadata }]);
	const blockedBy = await c.request('p', { mode: 'shared', ifAvailable: true }, (lock, by) => { assert.equal(lock, null); return by; });
	assert.deepEqual(blockedBy.filter(l => l.mode === 'exclusive').map(l => l.metadata), [metadata], 'refused by writer preference, it is told what it waits behind');
	await ha.release();
	assert.equal(await waiting, 'granted');
	assert.deepEqual(a.query(), { held: [], pending: [] });
});

test('query lists held and pending entries with mode, threadId, since and metadata', async () => {
	const block = createLockBlock();
	const [a, b, c] = [1, 2, 3].map(threadId => new LockManager(block, { threadId })) as [LockManager, LockManager, LockManager];
	assert.deepEqual(a.query(), { held: [], pending: [] });
	const before = Date.now();
	const metadata = { activity: 'maintenance', reason: 'compacting' };
	const ha = await hold(a, 'q', { mode: 'shared', metadata });
	const hb = await hold(b, 'q', { mode: 'shared' });
	const waiter = c.request('q', { timeoutMs: 5_000 }, () => 'granted');
	await tick();

	const snap = b.query();
	const strip = (i: LockInfo): unknown => ({ ...i, since: 0 });
	assert.deepEqual(snap.held.map(strip), [
		{ name: 'q', mode: 'shared', threadId: 1, since: 0, metadata },
		{ name: 'q', mode: 'shared', threadId: 2, since: 0 },
	]);
	assert.equal('metadata' in snap.held[1]!, false, 'no metadata key when none was given');
	assert.deepEqual(snap.pending.map(strip), [{ name: 'q', mode: 'exclusive', threadId: 3, since: 0 }]);
	for (const i of [...snap.held, ...snap.pending]) assert.ok(i.since >= before && i.since <= Date.now(), `since ${i.since}`);
	assert.deepEqual(c.query(), snap, 'every thread reads the same snapshot');

	await ha.release();
	await hb.release();
	assert.equal(await waiter, 'granted');
	assert.deepEqual(a.query(), { held: [], pending: [] }, 'released and granted records are gone');
});

test('query never returns a slot in its being-written state', async () => {
	const block = createLockBlock({ names: 2, holders: 4, pending: 4 });
	const a = new LockManager(block, { threadId: 1 });
	const reader = new LockManager(block, { threadId: 2 });
	const other = await hold(a, 'other', { mode: 'shared' });
	// At each grant point the new holder's slot is claimed or being filled, not published.
	const seen: [LockGrantPoint, number][] = [];
	setLockGrantHookForTests(point => { seen.push([point, reader.query().held.filter(h => h.name === 'w').length]); });
	try {
		await a.request('w', {}, () => undefined);
	} finally {
		setLockGrantHookForTests(null);
	}
	assert.deepEqual(seen, [['in-critical-section', 0], ['after-lock-word', 0], ['before-publish', 0]]);
	assert.deepEqual(reader.query().held.map(h => h.name), ['other'], 'the holder records of other locks are read throughout');

	// Slots claimed by a thread (state -(threadId + 1)) but not yet published are left out.
	const words = new Int32Array(block);
	const o = offsets({ names: 2, holders: 4 });
	Atomics.store(words, o.holderState(3), -(9 + 1));
	Atomics.store(words, o.pendingState(3), -(9 + 1));
	assert.deepEqual(reader.query().pending, []);
	assert.deepEqual(reader.query().held.map(h => h.name), ['other']);
	await other.release();
});

test("reclaim releases a thread's holds and pending requests, recounts and wakes waiters", async () => {
	const block = createLockBlock();
	const live = new LockManager(block, { threadId: 1 });
	const dying = new LockManager(block, { threadId: 7 });
	// Thread 7 holds 'r' exclusive (its callback never settles: it "dies" holding it)
	// and waits for 'r2' exclusive behind live's shared hold.
	let heldByDying!: () => void;
	const dyingHolds = new Promise<void>(r => { heldByDying = r; });
	void dying.request('r', { metadata: { activity: 'indexing', reason: 'repo x' } }, () => { heldByDying(); return new Promise(() => {}); });
	await dyingHolds;
	const shared = await hold(live, 'r2', { mode: 'shared' });
	const stop = new AbortController();
	const dyingWait = dying.request('r2', { signal: stop.signal }, () => 0).catch(() => 'stopped');
	await tick();
	assert.equal((await probe(live, 'r2', 'shared')).lock, null, "thread 7's waiting exclusive is counted");

	// live waits for 'r'; it is woken when 'r' is reclaimed.
	const woken = live.request('r', { timeoutMs: 5_000 }, l => l?.mode);
	await tick();
	const reclaimedAt = Date.now();
	const reclaimed = await live.reclaim(7);
	assert.deepEqual(reclaimed.map(i => [i.name, i.mode, i.threadId, i.metadata?.activity]), [['r', 'exclusive', 7, 'indexing'], ['r2', 'exclusive', 7, undefined]]);
	assert.equal(await woken, 'exclusive', 'the waiter was granted');
	assert.ok(Date.now() - reclaimedAt < 1_000, `the waiter was woken by the reclaim, not by its wait running out (${Date.now() - reclaimedAt} ms)`);
	assert.equal(live.query().held.concat(live.query().pending).some(i => i.threadId === 7), false, 'no record of thread 7 is left');
	assert.equal((await probe(live, 'r2', 'shared')).lock?.mode, 'shared', 'the pending-exclusive count was recomputed');
	assert.deepEqual(await live.reclaim(7), [], 'a second reclaim finds nothing');
	stop.abort();
	await dyingWait;
	await shared.release();

	// watchWorker reclaims with the threadId it captured, though the field reads -1 after exit.
	installLockManager(block, { threadId: 0 });
	const thread8 = new LockManager(block, { threadId: 8 });
	let held8!: () => void;
	const holds8 = new Promise<void>(r => { held8 = r; });
	void thread8.request('r3', {}, () => { held8(); return new Promise(() => {}); });
	await holds8;
	const fake = Object.assign(new EventEmitter(), { threadId: 8 });
	watchWorker(fake as unknown as WorkerType);
	fake.threadId = -1;
	fake.emit('exit', 1);
	await tick();
	assert.equal(live.query().held.some(h => h.threadId === 8), false, 'thread 8 reclaimed on exit');
	assert.equal((await probe(live, 'r3', 'exclusive')).lock?.mode, 'exclusive');
});

test('reclaim takes over a mutex and resets a name claim left by a foreign threadId', async () => {
	const capacity = { names: 3, holders: 4, pending: 4 };
	const block = createLockBlock(capacity);
	const words = new Int32Array(block);
	const o = offsets(capacity);
	const a = new LockManager(block, { threadId: 1 });
	const b = new LockManager(block, { threadId: 2 });
	const shared = await hold(a, 'x', { mode: 'shared' });
	assert.equal(Atomics.load(words, o.lock(0)), 1);

	// Thread 9 "died" inside x's critical section after changing its words, and
	// while claiming slot 1 for a new name, and with half-written holder and pending slots.
	Atomics.store(words, o.mutex(0), 9 + 1);
	Atomics.store(words, o.lock(0), 5);
	Atomics.store(words, o.pendx(0), 2);
	Atomics.store(words, o.nameState(1), -(9 + 1));
	Atomics.store(words, o.holderState(3), -(9 + 1));
	Atomics.store(words, o.pendingState(3), -(9 + 1));

	// b's request for x cannot enter x's critical section while 9 holds it.
	let bGranted = false;
	const bWaits = b.request('x', { timeoutMs: 5_000 }, () => { bGranted = true; });
	await tick();
	assert.equal(bGranted, false);

	assert.deepEqual(await a.reclaim(9), [], 'thread 9 had no published record');
	assert.equal(Atomics.load(words, o.nameState(1)), 0, 'the abandoned name claim is free again');
	assert.equal(Atomics.load(words, o.holderState(3)), 0, 'the half-written holder slot is free');
	assert.equal(Atomics.load(words, o.pendingState(3)), 0, 'the half-written pending slot is free');
	assert.notEqual(Atomics.load(words, o.mutex(0)), 9 + 1, 'the mutex was taken over');
	assert.equal(Atomics.load(words, o.lock(0)), 1, 'the lock word was recounted from the one published shared holder');

	await tick();
	// b is now in the queue as an exclusive waiter (counted), and is granted when a releases.
	assert.equal(Atomics.load(words, o.pendx(0)), 1, 'the recounted pending-exclusive count holds only b');
	await shared.release();
	await bWaits;
	assert.equal(bGranted, true);
	assert.equal(await a.resolveName(enc('y')), 1, 'the freed name slot is claimed for the next name');
});

test('a timer or promise created inside a callback no longer holds the lock once the callback settled: holds() is false and a request of the same name is not refused as nested', async () => {
	const m = new LockManager(createLockBlock({ names: 4, holders: 8, pending: 8 }), { threadId: 1 });
	let later!: Promise<{ holds: boolean; ran: boolean }>;
	await m.request('maintenance', { mode: 'shared' }, async () => {
		assert.equal(m.holds('maintenance'), true, 'inside the callback');
		// Created inside the hold, run after it: it inherits the async context.
		later = new Promise(resolve => setTimeout(() => {
			void (async () => {
				const holds = m.holds('maintenance');
				const ran = await m.request('maintenance', { mode: 'exclusive', timeoutMs: 1_000 }, async () => true);
				resolve({ holds, ran });
			})();
		}, 50));
	});
	assert.equal(m.holds('maintenance'), false, 'outside the callback');
	assert.deepEqual(await later, { holds: false, ran: true }, 'the timer neither believes it holds the lock nor is refused as a nested request');
	// While the callback is still running, a continuation inside it still holds it.
	await m.request('maintenance', { mode: 'shared' }, async () => {
		await tick(10);
		assert.equal(m.holds('maintenance'), true, 'an await inside the callback still holds it');
		await assert.rejects(m.request('maintenance', { mode: 'shared', timeoutMs: 100 }, async () => 1), (e: Error) => e.name === 'LockNestedError');
	});
});
