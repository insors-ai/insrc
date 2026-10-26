/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How the store library behaves once another process has removed its locks
 * (Epic c2ba6fa6, Story s4, t3). A test of the MECHANISM, run against the real
 * library on a temporary store, not against a hand-made error.
 *
 * The sequence, found on 2026-10-11 as the cause of the daemon's
 * "MDB_LOCK_FAILURE ... kern.sysv.semume" failures:
 *
 *   1. process A opens the store and writes;
 *   2. A opens and closes a SECOND descriptor on the store's lock file — on
 *      macOS that releases the file lock the library holds for the process;
 *   3. process B opens the store, writes and closes: finding no other holder
 *      of the lock, its close removes the semaphores A still uses.
 *
 * After that, in A: a read throws, a synchronous transaction throws code 22,
 * and an asynchronous transaction never settles. HOW the read throws depends
 * on whether A had read before: a process that never read needs a reader slot,
 * which takes the removed semaphore, and gets code -30775 (MDB_LOCK_FAILURE);
 * a process that had read already owns a slot, finds it wiped by B, and gets
 * code 22 with MDB_BAD_RSLOT in the message. A daemon has always read (the
 * store module reads while opening), so the second is what it meets.
 *
 * The store's failure detection rests on exactly these behaviours; this file
 * fails if a library upgrade changes any of them.
 *
 * A broken process never exits by itself, so every child is ended by SIGKILL.
 *
 * Run: npx tsx --test src/db/graph/__tests__/lock-loss-reproduction.test.ts
 */

import { after, afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { killAllStoreChildren, runLockLossSequence } from './helpers/store-child-driver.js';
import type { StoreChild } from './helpers/store-child-driver.js';

const base = mkdtempSync(join(tmpdir(), 'insrc-lock-loss-'));
after(() => {
	killAllStoreChildren();
	rmSync(base, { recursive: true, force: true });
});
// Also when an assertion fails mid-test.
afterEach(() => { killAllStoreChildren(); });

const LOCK_FAILURE = -30775;   // MDB_LOCK_FAILURE (lmdb-js)
const EINVAL       = 22;
const BAD_RSLOT    = /MDB_BAD_RSLOT/;

// What a read of a process that never read gets differs by platform, because the library keeps its
// locks in different primitives. macOS (System V semaphores, where the failure was found on 2026-10-11):
// code -30775 with MDB_LOCK_FAILURE in the message. Linux (observed on 2026-10-26 with the installed
// lmdb-js): code 22 and the bare message "Invalid argument", with no cause named. Both fail the read and
// go on failing it, which is what the store's detection rests on.
const RAW_READ = process.platform === 'darwin'
	? { code: LOCK_FAILURE, message: /MDB_LOCK_FAILURE/ }
	: { code: EINVAL, message: /^Invalid argument$/ };

function sequence(storePath: string, touchLockFile: boolean, raw = false): Promise<StoreChild> {
	return runLockLossSequence(storePath, { touchLockFile, raw });
}

describe('store library after another process removed its locks', { skip: process.platform === 'win32' }, () => {
	test('reproduction against the real library: read throws (-30775 on macOS, 22 on Linux), synchronous transaction throws 22, asynchronous transaction does not settle', async () => {
		// A has never read: it opened the path with the library directly.
		const a = await sequence(join(base, 'broken.lmdb'), true, true);

		// 1. A read throws the library's failure for this platform (see RAW_READ), and goes on doing so.
		for (const key of ['a', 'missing']) {
			const read = await a.send({ op: 'read', key });
			assert.equal(read.ok, false, 'a read fails');
			assert.equal(!read.ok && read.code, RAW_READ.code);
			assert.match(read.ok ? '' : read.message, RAW_READ.message);
		}

		// 2. A synchronous transaction throws a bare "invalid argument".
		const sync = await a.send({ op: 'txn-sync', key: 's' });
		assert.equal(sync.ok, false, 'a synchronous transaction fails');
		assert.equal(!sync.ok && sync.code, EINVAL);

		// 3. An asynchronous transaction neither resolves nor rejects.
		const async_ = await a.send({ op: 'txn-async', key: 't', waitMs: 3_000 });
		assert.deepEqual(async_, { ok: true, settled: false }, 'an asynchronous transaction has not settled after 3 seconds');

		await a.kill();
	});

	test('reproduction through the store module: a process that has read before gets code 22 with MDB_BAD_RSLOT on a read', async () => {
		// A opened through the store module, which reads while opening.
		const a = await sequence(join(base, 'broken-store.lmdb'), true);

		for (const key of ['a', 'missing']) {
			const read = await a.send({ op: 'read', key });
			assert.equal(read.ok, false, 'a read fails');
			assert.equal(!read.ok && read.code, EINVAL);
			assert.match(read.ok ? '' : read.message, BAD_RSLOT);
		}

		// The writes fail as in a process that never read.
		const sync = await a.send({ op: 'txn-sync', key: 's' });
		assert.equal(!sync.ok && sync.code, EINVAL);
		assert.doesNotMatch(sync.ok ? '' : sync.message, BAD_RSLOT, 'the write failure carries no cause of its own');
		assert.deepEqual(await a.send({ op: 'txn-async', key: 't', waitMs: 3_000 }), { ok: true, settled: false });

		// A read still answers (with the same error) after the write that never settled.
		const after = await a.send({ op: 'read', key: 'a' }, 5_000);
		assert.equal(!after.ok && after.code, EINVAL);

		await a.kill();
	});

	test("control case: without the second descriptor, the other process's close leaves the first process's write working", async () => {
		for (const raw of [true, false]) {
			const a = await sequence(join(base, `healthy-${raw ? 'raw' : 'store'}.lmdb`), false, raw);
			await control(a);
			await a.kill();
		}
	});
});

async function control(a: StoreChild): Promise<void> {
	{
		assert.deepEqual(await a.send({ op: 'read', key: 'b' }), { ok: true, value: '1' }, "reads the other process's write");
		assert.deepEqual(await a.send({ op: 'txn-sync', key: 's' }), { ok: true });
		assert.deepEqual(await a.send({ op: 'txn-async', key: 't', waitMs: 3_000 }), { ok: true, settled: true });
		assert.deepEqual(await a.send({ op: 'put', key: 'c' }), { ok: true });
		assert.deepEqual(await a.send({ op: 'read', key: 't' }), { ok: true, value: '1' });
	}
}
