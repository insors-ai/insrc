/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cross-thread named locks (Story afcfa027/S001) on one thread: the block
 * layout, argument checks and name resolution.
 *
 * Run: npx tsx --test src/shared/locks/__tests__/lock-manager.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	createLockBlock, DEFAULT_LOCK_CAPACITY, getLockManager, installLockManager, LockArgumentError, LockCapacityError, LockManager,
	validateLockRequest,
} from '../lock-manager.js';
import type { LockOptions } from '../lock-manager.js';

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
