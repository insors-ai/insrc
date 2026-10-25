/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Store health shared by every daemon thread (Epic 86197ac6, Story s1, t5): a
 * worker that finds the locks lost stops every thread, not only itself.
 *
 * Run: npx tsx --test src/db/graph/__tests__/store-health-threads.test.ts
 */

import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker } from 'node:worker_threads';

import { serveHub } from '../../../daemon/threads/channel.js';
import { wireMainStoreHealth } from '../../../daemon/threads/store-health-hub.js';
import { getLogger } from '../../../shared/logger.js';
import { createStoreGuardBlock, installStoreGuard, StoreGuard } from '../../store-guard.js';
import {
	closeGraphStore, getGraphStore, getStoreHealth, LmdbStoreLocksLostError, receiveStoreHealth, recordStoreFailureIfLockError,
	resetStoreHealthForTests, runReaderCheck, setGraphStorePath, setStoreProbeObserverForTests, withWriteTxn,
} from '../store.js';
import type { StoreHealth } from '../store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const base = mkdtempSync(join(tmpdir(), 'insrc-health-threads-'));
const block = createStoreGuardBlock();
installStoreGuard(block);
let n = 0;

beforeEach(async () => {
	await closeGraphStore();
	resetStoreHealthForTests();
	setGraphStorePath(join(base, `s${++n}.lmdb`));
});
after(async () => {
	setStoreProbeObserverForTests(null);
	resetStoreHealthForTests();
	await closeGraphStore();
	rmSync(base, { recursive: true, force: true });
});

/** Run the worker that finds the locks lost; resolves with what it reported. */
async function workerFindsLocksLost(): Promise<{ recorded: boolean; broadcast: StoreHealth; health: StoreHealth }> {
	const worker = new Worker(join(HERE, 'helpers', 'health-worker.ts'), { workerData: { block } });
	try {
		return await new Promise((res, rej) => { worker.once('message', res); worker.once('error', rej); });
	} finally {
		await worker.terminate();
	}
}

/** Collect the graph store's log calls at one level while `fn` runs. */
async function logged(level: 'error' | 'warn', fn: () => Promise<void> | void): Promise<unknown[][]> {
	const logger = getLogger('graph-store') as unknown as Record<string, (...a: unknown[]) => void>;
	const original = logger[level]!;
	const calls: unknown[][] = [];
	logger[level] = (...a: unknown[]) => { calls.push(a); };
	try { await fn(); } finally { logger[level] = original; }
	return calls;
}

test("locks-lost recorded in a worker makes the main thread's next getGraphStore and withWriteTxn fail with LmdbStoreLocksLostError and write nothing", async () => {
	await getGraphStore();   // the main thread has the store open, as the daemon does
	const found = await workerFindsLocksLost();
	assert.equal(found.recorded, true);
	assert.equal(found.broadcast.state, 'locks-lost', 'the finding thread broadcasts its record');
	assert.equal(found.broadcast.state === 'locks-lost' && found.broadcast.operation, 'request worker.op');

	await assert.rejects(getGraphStore(), LmdbStoreLocksLostError);
	let ran = false;
	await assert.rejects(withWriteTxn(() => { ran = true; }), LmdbStoreLocksLostError);
	assert.equal(ran, false, 'the write callback never ran');
});

test('after locks-lost in a worker, getStoreHealth on the main thread reports it, runReaderCheck does not probe and a second detection does not log', async () => {
	await getGraphStore();
	const found = await workerFindsLocksLost();

	// Everything below runs before the full record reaches this thread: only
	// the shared health word tells it the locks are lost.
	const before = getStoreHealth();
	assert.equal(before.state, 'locks-lost', 'reported before the full record arrives');
	assert.match(before.state === 'locks-lost' ? before.operation : '', /daemon thread \d+/, 'naming the detecting thread');

	const probes: string[] = [];
	setStoreProbeObserverForTests(r => probes.push(r));
	assert.equal(runReaderCheck('periodic'), 0);
	assert.deepEqual(probes, [], 'runReaderCheck does not probe a store whose locks are lost');

	const errors = await logged('error', () => {
		assert.equal(recordStoreFailureIfLockError(Object.assign(new Error('MDB_LOCK_FAILURE'), { code: -30775 }), 'request main.op'), true);
	});
	assert.deepEqual(errors, [], 'a second detection does not log again');

	// Two threads detecting at the same instant: only one mark takes effect, so
	// only one of them logs and broadcasts (the compare-and-swap in the block).
	const raceBlock = createStoreGuardBlock();
	const first = new StoreGuard(raceBlock, { threadId: 11 }).markLocksLost('graph');
	const second = new StoreGuard(raceBlock, { threadId: 12 }).markLocksLost('graph');
	assert.deepEqual([first, second], [true, false], 'exactly one thread\'s mark takes effect');
	assert.equal(new StoreGuard(raceBlock).healthSetBy('graph'), 11);

	receiveStoreHealth(found.broadcast);
	const after_ = getStoreHealth();
	assert.equal(after_.state === 'locks-lost' && after_.operation, 'request worker.op', 'the full record once it arrives');

	const warns = await logged('warn', () => closeGraphStore());
	assert.ok(warns.some(w => JSON.stringify(w).includes('close skipped')), 'closeGraphStore skips the library close');
});

test('the full locks-lost record reaches the main thread and every other worker through the hub', async () => {
	const ports: { postMessage(m: unknown): void }[] = [];
	const handlers = wireMainStoreHealth(() => ports);
	const workers: Worker[] = [];
	const start = (role: 'finder' | 'bystander'): { worker: Worker; next: () => Promise<{ step: string; health?: StoreHealth }> } => {
		const { port1: main, port2: workerPort } = new MessageChannel();
		serveHub(main, handlers);
		ports.push(main);
		const worker = new Worker(join(HERE, 'helpers', 'health-hub-worker.ts'), { workerData: { block, port: workerPort, role }, transferList: [workerPort] });
		workers.push(worker);
		// Buffer every message from the start, so one sent before next() is called is not lost.
		const inbox: { step: string; health?: StoreHealth }[] = [];
		const waiting: ((m: { step: string; health?: StoreHealth }) => void)[] = [];
		let failure: Error | undefined;
		worker.on('message', (m: { step: string; health?: StoreHealth }) => { const w = waiting.shift(); if (w !== undefined) w(m); else inbox.push(m); });
		worker.on('error', (e: Error) => { failure = e; });
		const next = (): Promise<{ step: string; health?: StoreHealth }> => {
			if (failure !== undefined) return Promise.reject(failure);
			const m = inbox.shift();
			return m !== undefined ? Promise.resolve(m) : new Promise(res => { waiting.push(res); });
		};
		return { worker, next };
	};
	try {
		const finder = start('finder');
		const bystander = start('bystander');
		assert.equal((await finder.next()).step, 'ready');
		assert.equal((await bystander.next()).step, 'ready');

		finder.worker.postMessage('find');
		assert.equal((await finder.next()).step, 'found');
		// The record crosses two hops (worker to main, main to the bystander); wait for it on the main thread.
		for (let i = 0; i < 100 && (getStoreHealth().state !== 'locks-lost' || (getStoreHealth() as { operation: string }).operation !== 'request finder.op'); i++) await new Promise(r => setTimeout(r, 10));
		const main = getStoreHealth();
		assert.equal(main.state === 'locks-lost' && main.operation, 'request finder.op', 'the main thread holds the finder\'s full record');

		let seen: StoreHealth | undefined;
		for (let i = 0; i < 100; i++) {
			bystander.worker.postMessage('health');
			seen = (await bystander.next()).health;
			if (seen?.state === 'locks-lost' && seen.operation === 'request finder.op') break;
			await new Promise(r => setTimeout(r, 10));
		}
		assert.equal(seen?.state === 'locks-lost' && seen.operation, 'request finder.op', 'another worker holds the finder\'s full record');
	} finally {
		for (const w of workers) await w.terminate();
	}
});
