/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The store's health record (Epic c2ba6fa6, Story s4, t4), in one process on a
 * healthy temporary store. The failure itself is injected as the error a read
 * throws on a broken store; the really broken store is in
 * lock-loss-detection.test.ts.
 *
 * Run: npx tsx --test src/db/graph/__tests__/store-health.test.ts
 */

import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	closeGraphStore, getGraphStore, getStoreHealth, LmdbStoreError, LmdbStoreLocksLostError,
	recordStoreFailureIfLockError, resetStoreHealthForTests, setGraphStorePath,
	setStoreProbeObserverForTests, setWriteProbeAfterMsForTests, withWriteTxn, withWriteTxnSync,
} from '../store.js';

const base = mkdtempSync(join(tmpdir(), 'insrc-store-health-'));
let n = 0;

beforeEach(async () => {
	resetStoreHealthForTests();
	await closeGraphStore();
	setStoreProbeObserverForTests(null);
	setWriteProbeAfterMsForTests(10_000);
	setGraphStorePath(join(base, `s${++n}.lmdb`));
});
after(async () => {
	resetStoreHealthForTests();
	await closeGraphStore();
	rmSync(base, { recursive: true, force: true });
});

/** What a read throws once the locks are gone, in a process that had read. */
function badRslot(): Error {
	return Object.assign(new Error("Invalid argument: MDB_BAD_RSLOT: Invalid reuse of reader locktable slot: The reader lock pid 0, txn -1, doesn't match env pid 1"), { code: 22 });
}
/** ...and in a process that had not. */
function lockFailure(): Error {
	return Object.assign(new Error('MDB_LOCK_FAILURE: Failed to get robust semaphore, increase max semaphores (kern.sysv.semume)'), { code: -30775 });
}

test('recordStoreFailureIfLockError: records both read failures once, and nothing else', () => {
	assert.equal(recordStoreFailureIfLockError(new Error('boom'), 'x'), false);
	assert.equal(recordStoreFailureIfLockError(Object.assign(new Error('Invalid argument'), { code: 22 }), 'x'), false, 'a bare code 22 is not a lock failure');
	assert.equal(recordStoreFailureIfLockError(undefined, 'x'), false);
	assert.deepEqual(getStoreHealth(), { state: 'ok' });

	assert.equal(recordStoreFailureIfLockError(badRslot(), 'request repo.list'), true);
	const first = getStoreHealth();
	assert.equal(first.state, 'locks-lost');
	assert.ok(first.state === 'locks-lost' && first.operation === 'request repo.list' && first.detectedBy === 'read');
	assert.ok(first.state === 'locks-lost' && first.libraryMessage.includes('MDB_BAD_RSLOT'));

	// Set once: a second failure does not overwrite the first.
	assert.equal(recordStoreFailureIfLockError(lockFailure(), 'later'), true);
	assert.equal(getStoreHealth(), first);
	// The named error itself counts as already recorded.
	assert.equal(recordStoreFailureIfLockError(new LmdbStoreLocksLostError('y'), 'y'), true);

	resetStoreHealthForTests();
	assert.equal(recordStoreFailureIfLockError(lockFailure(), 'first read'), true);
	assert.equal(getStoreHealth().state, 'locks-lost');
});

test("the named error's message names another process and does not repeat the library's advice", () => {
	const e = new LmdbStoreLocksLostError('a write transaction', lockFailure());
	assert.ok(e instanceof LmdbStoreError);
	assert.equal(e.name, 'LmdbStoreLocksLostError');
	assert.match(e.message, /removed by another process/);
	assert.match(e.message, /a write transaction/);
	assert.doesNotMatch(e.message, /semume|semaphore/);
});

test("health record: after locks-lost a further store call throws the named error and closeGraphStore skips the library's close", async () => {
	const store = await getGraphStore();
	let libraryCalls = 0;
	const realClose = store.root.close.bind(store.root);
	const realTxnSync = store.root.transactionSync.bind(store.root);
	const realTxn = store.root.transaction.bind(store.root);
	store.root.close = (() => { libraryCalls++; return realClose(); }) as typeof store.root.close;
	store.root.transactionSync = ((fn: () => unknown) => { libraryCalls++; return realTxnSync(fn); }) as typeof store.root.transactionSync;
	store.root.transaction = ((fn: () => unknown) => { libraryCalls++; return realTxn(fn); }) as typeof store.root.transaction;
	const realChild = store.root.childTransaction.bind(store.root);
	store.root.childTransaction = ((fn: () => unknown) => { libraryCalls++; return realChild(fn); }) as typeof store.root.childTransaction;

	assert.equal(recordStoreFailureIfLockError(badRslot(), 'a read'), true);

	let ran = false;
	assert.throws(() => withWriteTxnSync(store, () => { ran = true; }), LmdbStoreLocksLostError);
	await assert.rejects(withWriteTxn(() => { ran = true; }), LmdbStoreLocksLostError);
	assert.equal(ran, false, 'no callback runs');

	await closeGraphStore();
	assert.equal(libraryCalls, 0, "neither a transaction nor the library's close was called");

	// The handle is forgotten all the same: clean up the real environment.
	resetStoreHealthForTests();
	await realClose();
});

test('health record: after locks-lost getGraphStore itself rejects with the named error', async () => {
	await getGraphStore();
	recordStoreFailureIfLockError(lockFailure(), 'request search');
	await assert.rejects(getGraphStore(), (e: Error) => {
		assert.ok(e instanceof LmdbStoreLocksLostError);
		assert.match(e.message, /request search/);
		return true;
	});
	// Also for a process that has not opened the store yet.
	resetStoreHealthForTests();
	await closeGraphStore();
	recordStoreFailureIfLockError(lockFailure(), 'x');
	await assert.rejects(getGraphStore(), LmdbStoreLocksLostError);
});

test('sync wrapper: code 22 with a succeeding probe read is rethrown and leaves the record ok', async () => {
	const store = await getGraphStore();
	const probes: string[] = [];
	setStoreProbeObserverForTests(r => probes.push(r));

	for (const code of [22, -30775]) {
		const thrown = Object.assign(new Error('Invalid argument'), { code });
		assert.throws(() => withWriteTxnSync(store, () => { throw thrown; }), (e: unknown) => e === thrown, 'the original error, unchanged');
		await assert.rejects(withWriteTxn(() => { throw thrown; }), (e: unknown) => e === thrown);
	}
	assert.deepEqual(probes, ['ok', 'ok', 'ok', 'ok'], 'each was confirmed by a probe read that returned');
	assert.deepEqual(getStoreHealth(), { state: 'ok' });

	// An error with another code is not probed at all.
	assert.throws(() => withWriteTxnSync(store, () => { throw new Error('plain'); }), /plain/);
	assert.equal(probes.length, 4);

	// The store still works.
	withWriteTxnSync(store, () => { store.meta.putSync('k', 'v'); });
	assert.equal(store.meta.get('k'), 'v');
});

test('slow healthy write: the probe runs and returns, nothing is recorded, the write completes', async () => {
	const store = await getGraphStore();
	const probes: string[] = [];
	setStoreProbeObserverForTests(r => probes.push(r));
	setWriteProbeAfterMsForTests(100);

	// withWriteTxn takes only synchronous callbacks (ISSUE-5437d6e5), so the
	// write is made slow by delaying the library's settlement instead: no
	// transaction is held open, which would nest the write rather than queue it.
	const realChild = store.root.childTransaction.bind(store.root);
	store.root.childTransaction = ((fn: () => unknown) =>
		Promise.resolve(realChild(fn)).then(v => new Promise<unknown>(r => setTimeout(() => r(v), 450)))  // past the bound, several times over
	) as typeof store.root.childTransaction;
	let result: string;
	try {
		result = await withWriteTxn(s => { void s.meta.put('slow', 'done'); return 'finished'; });
	} finally {
		store.root.childTransaction = realChild;
	}

	assert.equal(result, 'finished');
	assert.ok(probes.length >= 2, `the probe ran at each bound (ran ${probes.length} times)`);
	assert.ok(probes.every(r => r === 'ok'), 'and returned every time');
	assert.deepEqual(getStoreHealth(), { state: 'ok' });
	assert.equal(store.meta.get('slow'), 'done');

	// A fast write is never probed.
	probes.length = 0;
	setWriteProbeAfterMsForTests(10_000);
	await withWriteTxn(s => { void s.meta.put('fast', '1'); });
	assert.deepEqual(probes, []);
});
