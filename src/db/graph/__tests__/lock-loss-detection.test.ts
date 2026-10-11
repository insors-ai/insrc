/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The store's own detection of lost locks, through its real wrappers on a
 * really broken store (Epic c2ba6fa6, Story s4, t4). The breaking sequence is
 * the one pinned by lock-loss-reproduction.test.ts; here the child uses
 * withWriteTxn / withWriteTxnSync / getGraphStore / closeGraphStore.
 *
 * Run: npx tsx --test src/db/graph/__tests__/lock-loss-detection.test.ts
 */

import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { killAllStoreChildren, runLockLossSequence } from './helpers/store-child-driver.js';
import type { StoreChildReply } from './helpers/store-child.js';

const base = mkdtempSync(join(tmpdir(), 'insrc-lock-detect-'));
after(() => {
	killAllStoreChildren();
	rmSync(base, { recursive: true, force: true });
});
afterEach(() => { killAllStoreChildren(); });

const skip = process.platform === 'win32';

function assertNamedError(r: StoreChildReply): void {
	assert.equal(r.ok, false);
	if (r.ok) return;
	assert.equal(r.name, 'LmdbStoreLocksLostError');
	assert.match(r.message, /removed by another process/);
	assert.doesNotMatch(r.message, /semume/);
}

test('detection through the real wrappers: asynchronous write by probe, synchronous write at once', { skip }, async () => {
	// --- asynchronous write: never settles, found by the probe after the bound.
	const a = await runLockLossSequence(join(base, 'async.lmdb'));
	assert.deepEqual(await a.send({ op: 'health' }), { ok: true, value: { state: 'ok' } }, 'nothing is recorded before a call meets the failure');

	const write = await a.send({ op: 'wrapper-async', key: 't', probeAfterMs: 400 });
	assertNamedError(write);
	const elapsed = write.ok ? -1 : write.elapsedMs ?? -1;
	assert.ok(elapsed >= 400 && elapsed < 3_000, `rejected by the probe at the bound, not before and not much later (took ${elapsed} ms)`);

	const health = await a.send({ op: 'health' });
	assert.ok(health.ok);
	const h = health.value as { state: string; detectedBy: string; operation: string; at: string; libraryMessage: string };
	assert.equal(h.state, 'locks-lost');
	assert.equal(h.detectedBy, 'write-timeout-probe');
	assert.match(h.libraryMessage, /MDB_BAD_RSLOT|MDB_LOCK_FAILURE/, "the library's own text is kept in the record");
	assert.ok(!Number.isNaN(Date.parse(h.at)));

	// Once recorded, every later call is refused without reaching the library.
	assertNamedError(await a.send({ op: 'get-store' }));
	assertNamedError(await a.send({ op: 'wrapper-sync', key: 's' }, 5_000));
	assert.deepEqual(await a.send({ op: 'wrapper-close' }, 5_000), { ok: true, value: { libraryCloseCalls: 0 } }, "the library's close is skipped");
	await a.kill();

	// --- synchronous write: throws at once, confirmed by the probe.
	const b = await runLockLossSequence(join(base, 'sync.lmdb'));
	const started = Date.now();
	assertNamedError(await b.send({ op: 'wrapper-sync', key: 's' }));
	assert.ok(Date.now() - started < 2_000, 'recorded at once');
	const hb = await b.send({ op: 'health' });
	assert.ok(hb.ok);
	assert.equal((hb.value as { state: string }).state, 'locks-lost');
	assert.equal((hb.value as { detectedBy: string }).detectedBy, 'sync-write');
	assertNamedError(await b.send({ op: 'get-store' }));
	await b.kill();
});

test('control: the same wrappers on a store that was not broken write and record nothing', { skip }, async () => {
	const a = await runLockLossSequence(join(base, 'healthy.lmdb'), { touchLockFile: false });
	assert.deepEqual(await a.send({ op: 'wrapper-async', key: 't', probeAfterMs: 400 }), { ok: true });
	assert.deepEqual(await a.send({ op: 'wrapper-sync', key: 's' }), { ok: true });
	assert.deepEqual(await a.send({ op: 'read', key: 't' }), { ok: true, value: '1' });
	assert.deepEqual(await a.send({ op: 'health' }), { ok: true, value: { state: 'ok' } });
	assert.deepEqual(await a.send({ op: 'wrapper-close' }), { ok: true, value: { libraryCloseCalls: 1 } });
	await a.kill();
});
