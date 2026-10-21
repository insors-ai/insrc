/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Store guard (Epic 86197ac6, Story s1, t2): permits in shared memory that are
 * always released, waits that never block, nesting refused per async call
 * chain, and reclaim of a dead worker's permits.
 *
 * Run: npx tsx --test src/db/__tests__/store-guard.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import {
	createStoreGuardBlock, HEALTH_UNHEALTHY, StoreGuard, StoreLockNestedError, StoreLockTimeoutError, StoreUnhealthyError,
} from '../store-guard.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LONG = { acquireTimeoutMs: 5_000 };

function guard(deps: ConstructorParameters<typeof StoreGuard>[1] = {}): StoreGuard {
	return new StoreGuard(createStoreGuardBlock(), deps);
}

test('withStore releases its permit on resolve, reject, synchronous throw and abort', async () => {
	const g = guard();
	assert.equal(await g.withStore('duckdb', async () => 7, LONG), 7);
	assert.deepEqual(g.holders(), [], 'released after resolve');

	await assert.rejects(g.withStore('duckdb', async () => { throw new Error('rejected'); }, LONG), /rejected/);
	assert.deepEqual(g.holders(), [], 'released after reject');

	await assert.rejects(g.withStore('duckdb', () => { throw new Error('sync throw'); }, LONG), /sync throw/);
	assert.deepEqual(g.holders(), [], 'released after a synchronous throw');

	// Abort while waiting: one call holds the permit, a second waits and is aborted.
	let releaseFirst!: () => void;
	const first = g.withStore('duckdb', () => new Promise<void>(r => { releaseFirst = r; }), LONG);
	await new Promise(r => setImmediate(r));
	const ac = new AbortController();
	const second = g.withStore('duckdb', async () => 'ran', { ...LONG, signal: ac.signal });
	ac.abort(new Error('aborted'));
	await assert.rejects(second, /aborted/);
	releaseFirst();
	await first;
	assert.deepEqual(g.holders(), [], 'released after an abort, and the aborted waiter took nothing');
	assert.equal(await g.withStore('duckdb', async () => 'again', LONG), 'again', 'the permit is free again');
});

test('an acquisition past its limit fails with StoreLockTimeoutError naming the holder', async () => {
	const g = guard();
	let releaseFirst!: () => void;
	const first = g.withStore('duckdb', () => new Promise<void>(r => { releaseFirst = r; }), LONG);
	await new Promise(r => setImmediate(r));
	const err = await g.withStore('duckdb', async () => 'never', { acquireTimeoutMs: 50 }).then(() => undefined, (e: unknown) => e);
	assert.ok(err instanceof StoreLockTimeoutError, 'times out');
	assert.equal(err.store, 'duckdb');
	assert.equal(err.holders.length, 1);
	assert.equal(err.holders[0]!.threadId, 0, 'names the holding thread');
	assert.match(err.message, /held by thread 0 since /);
	releaseFirst();
	await first;
});

test('two concurrent same-thread withStore calls on a one-permit store both complete in turn; withStore inside a held op fails with StoreLockNestedError', async () => {
	const g = guard();
	const order: string[] = [];
	let releaseA!: () => void;
	const a = g.withStore('duckdb', async () => { order.push('a start'); await new Promise<void>(r => { releaseA = r; }); order.push('a end'); return 'a'; }, LONG);
	const b = g.withStore('duckdb', async () => { order.push('b start'); return 'b'; }, LONG);
	await new Promise(r => setTimeout(r, 20));
	assert.deepEqual(order, ['a start'], 'b waits while a holds the permit; it does not fail as nested');
	releaseA();
	assert.deepEqual([await a, await b], ['a', 'b']);
	assert.deepEqual(order, ['a start', 'a end', 'b start'], 'one after the other, in arrival order');

	await assert.rejects(
		g.withStore('duckdb', () => g.withStore('duckdb', async () => 'inner', LONG), LONG),
		StoreLockNestedError,
	);
	assert.deepEqual(g.holders(), [], 'the outer permit is released after the nested refusal');
	assert.equal(await g.withStore('duckdb', () => g.withStore('graph', async () => 'direct inside guarded', LONG), LONG), 'direct inside guarded', 'a direct store needs no permit, so it is not nesting');
});

test('reclaim releases after quiescence and marks the store unhealthy past limitMs', async () => {
	const block = createStoreGuardBlock();
	const dead = new StoreGuard(block, { threadId: 42 });
	void dead.withStore('duckdb', () => new Promise<never>(() => {}), LONG);   // a "dead" holder that never releases
	await new Promise(r => setImmediate(r));
	assert.deepEqual(dead.holders().map(h => [h.store, h.threadId]), [['duckdb', 42]]);

	let quiet!: () => void;
	const main = new StoreGuard(block, { threadId: 0, probe: () => new Promise<void>(r => { quiet = r; }), quiescence: { duckdb: { store: 'duckdb', limitMs: 2_000 } } });
	const reclaiming = main.reclaim(42);
	await new Promise(r => setTimeout(r, 20));
	assert.equal(main.holders().length, 1, 'not released before the store quiesces');
	quiet();
	assert.deepEqual(await reclaiming, { released: ['duckdb'], unhealthy: [] });
	assert.deepEqual(main.holders(), []);
	assert.equal(await main.withStore('duckdb', async () => 'free', LONG), 'free', 'another thread can now take it');

	const block2 = createStoreGuardBlock();
	void new StoreGuard(block2, { threadId: 43 }).withStore('duckdb', () => new Promise<never>(() => {}), LONG);
	await new Promise(r => setImmediate(r));
	const stuck = new StoreGuard(block2, { threadId: 0, probe: () => new Promise<void>(() => {}), quiescence: { duckdb: { store: 'duckdb', limitMs: 30 } } });
	assert.deepEqual(await stuck.reclaim(43), { released: [], unhealthy: ['duckdb'] });
	assert.equal(stuck.health('duckdb'), HEALTH_UNHEALTHY);
	await assert.rejects(stuck.withStore('duckdb', async () => 'x', LONG), StoreUnhealthyError);
});

test('a worker terminated while holding a permit has it reclaimed and another worker then acquires it', async () => {
	const block = createStoreGuardBlock();
	const main = new StoreGuard(block);
	const start = (mode: 'hold' | 'take'): { worker: Worker; message: Promise<{ step: string; threadId?: number; message?: string }> } => {
		const worker = new Worker(join(HERE, 'helpers', 'store-guard-worker.ts'), { workerData: { block, mode } });
		return { worker, message: new Promise((res, rej) => { worker.once('message', res); worker.once('error', rej); }) };
	};

	const holder = start('hold');
	const held = await holder.message;
	assert.equal(held.step, 'acquired');
	assert.deepEqual(main.holders().map(h => [h.store, h.threadId]), [['duckdb', held.threadId]]);
	const exited = new Promise(r => holder.worker.once('exit', r));
	await holder.worker.terminate();
	await exited;
	assert.equal(main.holders().length, 1, 'a dead worker still holds the permit until reclaim');

	assert.deepEqual(await main.reclaim(held.threadId!), { released: ['duckdb'], unhealthy: [] });
	const taker = start('take');
	const took = await taker.message;
	assert.equal(took.step, 'acquired', 'another worker acquires the reclaimed permit');
	await taker.worker.terminate();
});
