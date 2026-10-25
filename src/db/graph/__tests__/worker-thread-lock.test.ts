/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Gate for the multi-threaded daemon (Epic 86197ac6, Story s1, t1): a worker
 * thread opening, using and releasing the store keeps the daemon's lock on the
 * store's lock file.
 *
 * The lock is a POSIX record lock the library holds for the whole process, and
 * closing any descriptor on that file releases it (see lock-loss-reproduction
 * test). A worker thread must open the store itself, so this pins that its open,
 * write, close and exit leave the lock in place, and that another process
 * opening and closing the store afterwards does not break the daemon's writes.
 *
 * The lock is checked from a separate process that asks for an exclusive lock on
 * byte 0 of the lock file, the byte the library holds shared while the store is
 * open. The control test proves that check can see a dropped lock.
 *
 * Run: npx tsx --test src/db/graph/__tests__/worker-thread-lock.test.ts
 */

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { open } from 'lmdb';

import { MAX_DBS } from '../store.js';

const HERE    = dirname(fileURLToPath(import.meta.url));
// The daemon's open options (src/db/graph/store.ts): MAX_DBS and the default 1024 GiB map.
const MAPSIZE = 1024 * 1024 ** 3;
const base    = mkdtempSync(join(tmpdir(), 'insrc-worker-lock-'));
after(() => { rmSync(base, { recursive: true, force: true }); });

/** Ask, from another process, for an exclusive lock on byte 0 of the lock file. */
function lockHeld(lockFile: string): boolean {
	const probe = [
		'import fcntl, os, sys',
		'fd = os.open(sys.argv[1], os.O_RDWR)',
		'try:',
		'    fcntl.lockf(fd, fcntl.LOCK_EX | fcntl.LOCK_NB, 1, 0)',
		'    print("free")',
		'except OSError:',
		'    print("held")',
	].join('\n');
	return execFileSync('python3', ['-c', probe, lockFile]).toString().trim() === 'held';
}

function openStore(path: string) {
	const root = open({ path, mapSize: MAPSIZE, maxDbs: MAX_DBS });
	return { root, db: root.openDB({ name: 'gate', keyEncoding: 'binary', encoding: 'binary' }) };
}

describe('a worker thread and the daemon\'s lock on the store', { skip: process.platform === 'win32' }, () => {
	test('a worker thread\'s open, write, close and exit keep the daemon\'s lock, and the daemon writes after another process opens and closes the store', async () => {
		const path = join(base, 'gate.lmdb');
		const lockFile = `${path}-lock`;
		const { root, db } = openStore(path);
		try {
			await db.put(Buffer.from('k'), Buffer.from('v1'));
			assert.equal(lockHeld(lockFile), true, 'held once the daemon has opened the store');

			const worker = new Worker(join(HERE, 'helpers', 'lmdb-worker.mjs'), { workerData: { path, mapSize: MAPSIZE, maxDbs: MAX_DBS } });
			const next = (): Promise<{ step: string; read?: string | null }> => new Promise((res, rej) => { worker.once('message', res); worker.once('error', rej); });
			try {
				assert.deepEqual(await next(), { step: 'opened', read: 'v1' }, 'the worker reads the daemon\'s write');
				assert.equal(lockHeld(lockFile), true, 'held after the worker opened the store');

				worker.postMessage('write');
				assert.equal((await next()).step, 'wrote');
				assert.equal(db.get(Buffer.from('w'))?.toString(), 'from-worker', 'the daemon reads the worker\'s write');
				assert.equal(lockHeld(lockFile), true, 'held after the worker wrote');

				worker.postMessage('close');
				assert.equal((await next()).step, 'closed');
				assert.equal(lockHeld(lockFile), true, 'held after the worker closed its handle');
			} finally {
				await worker.terminate();
			}
			assert.equal(lockHeld(lockFile), true, 'held after the worker exited');

			const other = execFileSync(process.execPath, [join(HERE, 'helpers', 'lmdb-open-close.mjs'), path, String(MAPSIZE), String(MAX_DBS)]).toString().trim();
			assert.equal(other, 'read v1', 'another process opened, read and closed the store');
			assert.equal(lockHeld(lockFile), true, 'held after another process opened and closed the store');

			await db.put(Buffer.from('k2'), Buffer.from('v2'));
			assert.equal(db.get(Buffer.from('k2'))?.toString(), 'v2', 'the daemon still writes');
		} finally {
			await root.close();
		}
	});

	test('control: the lock check reports a dropped lock after a stray descriptor on the lock file is closed', async () => {
		const path = join(base, 'control.lmdb');
		const lockFile = `${path}-lock`;
		const { root, db } = openStore(path);
		try {
			await db.put(Buffer.from('k'), Buffer.from('v1'));
			assert.equal(lockHeld(lockFile), true, 'held while the store is open');
			// The known way to lose the lock: close any other descriptor on the file.
			closeSync(openSync(lockFile, 'r'));
			assert.equal(lockHeld(lockFile), false, 'the check sees the dropped lock');
		} finally {
			await root.close();
		}
	});
});
