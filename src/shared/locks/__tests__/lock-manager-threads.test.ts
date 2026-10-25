/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cross-thread named locks (Story afcfa027/S001, t6) across real worker
 * threads sharing one lock block: contention with the main thread, wake-up on
 * release, writer preference, metadata, nested bounded waits, and reclaim of
 * workers terminated while holding, waiting, or in the middle of a grant.
 *
 * Run: npx tsx --test src/shared/locks/__tests__/lock-manager-threads.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { createLockBlock, installLockManager, watchWorker } from '../lock-manager.js';
import type { LockGrantPoint, LockInfo, LockManagerSnapshot, LockOptions } from '../lock-manager.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const block = createLockBlock();
const main = installLockManager(block);
const live: Worker[] = [];

after(async () => {
	for (const w of live) await w.terminate();
});

type Event = Record<string, unknown> & { event: string };

/** A worker of helpers/lock-ops-worker.ts with an inbox of its events. */
class Scripted {
	private readonly inbox: Event[] = [];
	private readonly waiting: { pred: (e: Event) => boolean; resolve: (e: Event) => void }[] = [];
	readonly exited: Promise<number>;

	private constructor(readonly worker: Worker) {
		worker.on('message', (e: Event) => {
			const i = this.waiting.findIndex(w => w.pred(e));
			if (i >= 0) this.waiting.splice(i, 1)[0]!.resolve(e);
			else this.inbox.push(e);
		});
		this.exited = new Promise(res => worker.once('exit', res));
	}

	static async start(): Promise<Scripted> {
		const worker = new Worker(join(HERE, 'helpers', 'lock-ops-worker.ts'), { workerData: { block, pause: new SharedArrayBuffer(4) } });
		live.push(worker);
		const s = new Scripted(worker);
		await s.next(e => e.event === 'ready');
		return s;
	}

	get threadId(): number {
		return this.worker.threadId;
	}

	send(m: Record<string, unknown>): void {
		this.worker.postMessage(m);
	}

	next(pred: (e: Event) => boolean, timeoutMs = 5_000): Promise<Event> {
		const i = this.inbox.findIndex(pred);
		if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]!);
		return new Promise((resolve, reject) => {
			const entry = { pred, resolve: (e: Event) => { clearTimeout(timer); resolve(e); } };
			const timer = setTimeout(() => {
				this.waiting.splice(this.waiting.indexOf(entry), 1);
				reject(new Error(`no matching event from thread ${this.threadId} within ${timeoutMs} ms`));
			}, timeoutMs);
			this.waiting.push(entry);
		});
	}

	async hold(name: string, options: LockOptions = {}): Promise<Event> {
		this.send({ op: 'hold', name, options });
		return this.next(e => e.name === name && ['granted', 'refused', 'error'].includes(e.event));
	}

	async release(name: string): Promise<Event> {
		this.send({ op: 'release', name });
		return this.next(e => e.name === name && e.event === 'released');
	}

	async probe(name: string, mode: 'shared' | 'exclusive'): Promise<{ granted: string | null; blockedBy: LockInfo[] }> {
		this.send({ op: 'probe', name, mode });
		return await this.next(e => e.event === 'probe' && e.name === name) as unknown as { granted: string | null; blockedBy: LockInfo[] };
	}

	async query(): Promise<LockManagerSnapshot> {
		this.send({ op: 'query' });
		return (await this.next(e => e.event === 'query'))['snapshot'] as LockManagerSnapshot;
	}
}

/** Poll `cond` until it holds or `ms` passes. */
async function until(cond: () => boolean, ms = 3_000, what = 'condition'): Promise<void> {
	const deadline = Date.now() + ms;
	while (!cond()) {
		if (Date.now() > deadline) throw new Error(`${what} did not hold within ${ms} ms`);
		await new Promise(res => setTimeout(res, 10));
	}
}

const entriesOf = (threadId: number): LockInfo[] => {
	const q = main.query();
	return [...q.held, ...q.pending].filter(i => i.threadId === threadId);
};

/** Hold `name` on the main thread until release() is called. */
async function mainHold(name: string, options: LockOptions = {}): Promise<() => Promise<void>> {
	let release!: () => void;
	const gate = new Promise<void>(r => { release = r; });
	let held!: () => void;
	const holding = new Promise<void>(r => { held = r; });
	const done = main.request(name, options, async () => { held(); await gate; });
	await holding;
	return async () => { release(); await done; };
}

test("a worker's ifAvailable exclusive gets null while the main thread holds shared, then gets the lock", async () => {
	const w = await Scripted.start();
	const release = await mainHold('t1', { mode: 'shared' });
	const refused = await w.probe('t1', 'exclusive');
	assert.equal(refused.granted, null);
	assert.deepEqual(refused.blockedBy.map(b => [b.mode, b.threadId]), [['shared', 0]], 'the main thread is the blocker');
	await release();
	assert.equal((await w.probe('t1', 'exclusive')).granted, 'exclusive');
});

test("a waiting worker is woken within 50 ms of another worker's release", async () => {
	const [a, b] = [await Scripted.start(), await Scripted.start()];
	assert.equal((await a.hold('t2')).event, 'granted');
	b.send({ op: 'hold', name: 't2', options: { timeoutMs: 10_000 } });
	await until(() => entriesOf(b.threadId).length === 1, 3_000, 'b pending');
	await new Promise(res => setTimeout(res, 200));
	const released = await a.release('t2');
	const granted = await b.next(e => e.name === 't2' && e.event === 'granted');
	const gap = (granted['at'] as number) - (released['at'] as number);
	assert.ok(gap < 50, `granted ${gap} ms after the release`);
	await b.release('t2');
});

test('writer preference across three workers', async () => {
	const [a, b, c] = [await Scripted.start(), await Scripted.start(), await Scripted.start()];
	assert.equal((await a.hold('t3', { mode: 'shared' })).event, 'granted');
	assert.equal((await c.probe('t3', 'shared')).granted, 'shared', 'shared admits shared before any exclusive waits');
	b.send({ op: 'hold', name: 't3', options: { mode: 'exclusive', timeoutMs: 10_000 } });
	await until(() => main.query().pending.some(p => p.threadId === b.threadId), 3_000, 'b pending');
	const refused = await c.probe('t3', 'shared');
	assert.equal(refused.granted, null, "c's new shared request is refused while b's exclusive waits");
	assert.deepEqual(refused.blockedBy.map(i => [i.mode, i.threadId]), [['shared', a.threadId], ['exclusive', b.threadId]]);
	await a.release('t3');
	assert.equal((await b.next(e => e.name === 't3' && e.event === 'granted'))['mode'], 'exclusive', 'b is granted when a releases');
	await b.release('t3');
});

test('terminated holder and waiter are reclaimed and a third worker gets the lock', async () => {
	const [a, b, c] = [await Scripted.start(), await Scripted.start(), await Scripted.start()];
	const [idA, idB] = [a.threadId, b.threadId];
	assert.equal((await a.hold('t4')).event, 'granted');
	b.send({ op: 'hold', name: 't4', options: { timeoutMs: 30_000 } });
	await until(() => entriesOf(idB).length === 1, 3_000, 'b pending');
	await a.worker.terminate();
	await b.worker.terminate();
	assert.deepEqual(entriesOf(idA).map(i => i.mode), ['exclusive'], 'the dead holder is still recorded before reclaim');
	const reclaimed = [...await main.reclaim(idA), ...await main.reclaim(idB)];
	assert.deepEqual(reclaimed.map(i => [i.name, i.mode, i.threadId]), [['t4', 'exclusive', idA], ['t4', 'exclusive', idB]]);
	assert.equal((await c.hold('t4', { timeoutMs: 2_000 })).event, 'granted');
	const q = await c.query();
	assert.equal([...q.held, ...q.pending].some(i => i.threadId === idA || i.threadId === idB), false, 'query shows no entry for the dead threads');
	await c.release('t4');
});

test('holder metadata written on one worker is read on another', async () => {
	const [a, b] = [await Scripted.start(), await Scripted.start()];
	const metadata = { activity: 'maintenance', reason: 'compacting graph.lmdb — reclaimable 41% (1.2 GB)' };
	assert.equal((await a.hold('t5', { metadata })).event, 'granted');
	const refused = await b.probe('t5', 'shared');
	assert.deepEqual(refused.blockedBy.map(i => i.metadata), [metadata], 'blockedBy carries the metadata');
	assert.deepEqual((await b.query()).held.filter(h => h.name === 't5').map(h => [h.threadId, h.metadata]), [[a.threadId, metadata]], 'and so does query()');
	await a.release('t5');
});

test('opposite-order nested bounded waits end in one LockTimeoutError and nothing stays held', async () => {
	const [a, b] = [await Scripted.start(), await Scripted.start()];
	a.send({ op: 'nested', outer: 'x6', inner: 'y6', timeoutMs: 300 });
	b.send({ op: 'nested', outer: 'y6', inner: 'x6', timeoutMs: 10_000 });
	await a.next(e => e.event === 'outer-held');
	await b.next(e => e.event === 'outer-held');
	a.send({ op: 'go', outer: 'x6' });
	b.send({ op: 'go', outer: 'y6' });
	const ra = await a.next(e => e.event === 'nested-result');
	const rb = await b.next(e => e.event === 'nested-result');
	assert.deepEqual([ra['outcome'], (ra['error'] as { name: string } | undefined)?.name], ['error', 'LockTimeoutError'], 'a timed out on y6');
	assert.match((ra['error'] as { message: string }).message, new RegExp(`held by exclusive on thread ${b.threadId}`));
	assert.equal(rb['outcome'], 'completed', 'b got x6 once a unwound and released it');
	await a.next(e => e.event === 'nested-done');
	await b.next(e => e.event === 'nested-done');
	const q = main.query();
	assert.equal([...q.held, ...q.pending].some(i => i.name === 'x6' || i.name === 'y6'), false, 'nothing stays held or pending');
});

test("watchWorker reclaims a terminated worker's hold and pending request without an explicit reclaim", async () => {
	const [a, c] = [await Scripted.start(), await Scripted.start()];
	watchWorker(a.worker);
	const id = a.threadId;
	const mainHolds = await mainHold('t7b');
	assert.equal((await a.hold('t7a')).event, 'granted');
	a.send({ op: 'hold', name: 't7b', options: { timeoutMs: 30_000 } });
	await until(() => main.query().pending.some(p => p.threadId === id), 3_000, 'a pending on t7b');
	await a.worker.terminate();
	await until(() => entriesOf(id).length === 0, 3_000, 'watchWorker reclaimed both');
	assert.equal((await c.hold('t7a', { timeoutMs: 2_000 })).event, 'granted', 'the reclaimed hold is free');
	await mainHolds();
	assert.equal((await c.probe('t7b', 'shared')).granted, 'shared', 'the reclaimed waiter no longer counts');
	await c.release('t7a');
});

test('a worker terminated at each point of a grant leaves nothing held', async () => {
	const c = await Scripted.start();
	for (const point of ['in-critical-section', 'after-lock-word', 'before-publish'] as LockGrantPoint[]) {
		const name = `t8-${point}`;
		const a = await Scripted.start();
		const id = a.threadId;
		watchWorker(a.worker);
		a.send({ op: 'pause-at', point, name });
		await a.next(e => e.event === 'pause-armed');
		// A shared holder on the main thread, so a recount has something to keep.
		const mainShared = await mainHold(name, { mode: 'shared' });
		a.send({ op: 'hold', name, options: { mode: 'shared', timeoutMs: 30_000 } });
		await a.next(e => e.event === 'paused' && e.point === point);
		await a.worker.terminate();
		await until(() => entriesOf(id).length === 0, 3_000, `${point}: no record of the dead worker`);
		// c's exclusive request waits for the main thread's shared hold only, then is granted.
		c.send({ op: 'hold', name, options: { timeoutMs: 5_000 } });
		await until(() => main.query().pending.some(p => p.threadId === c.threadId && p.name === name), 3_000, `${point}: c pending`);
		await mainShared();
		const granted = await c.next(e => e.name === name && ['granted', 'error'].includes(e.event));
		assert.equal(granted.event, 'granted', `${point}: ${JSON.stringify(granted)}`);
		await c.release(name);
		assert.deepEqual(main.query().held.filter(h => h.name === name), [], `${point}: nothing held`);
	}
});

test('watchWorker uses the threadId captured at registration', async () => {
	const [a, c] = [await Scripted.start(), await Scripted.start()];
	const id = a.threadId;
	watchWorker(a.worker);
	assert.equal((await a.hold('t9')).event, 'granted');
	await a.worker.terminate();
	assert.equal(a.worker.threadId, -1, 'the field reads -1 once the thread has stopped');
	await until(() => entriesOf(id).length === 0, 3_000, 'reclaimed by the captured id');
	assert.equal((await c.hold('t9', { timeoutMs: 2_000 })).event, 'granted');
	await c.release('t9');
});
