/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The refusal of the live store, between processes (Epic c2ba6fa6, Story s4,
 * t10). Process A declares itself the owner, as the daemon does, and opens the
 * live store of a temporary home. Process B, which made no declaration, is
 * refused and never opens the lock file — so it can never be the process that
 * removes A's locks. A's writes go on working. A child that A spawns is
 * refused too: the declaration is a call, not something a child inherits.
 *
 * Run: npx tsx --test src/db/graph/__tests__/live-store-refusal.test.ts
 */

import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { killAllStoreChildren, spawnStoreChild } from './helpers/store-child-driver.js';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-refusal-'));
mkdirSync(join(HOME, '.insrc'), { recursive: true });
afterEach(() => { killAllStoreChildren(); });
after(() => {
	killAllStoreChildren();
	rmSync(HOME, { recursive: true, force: true });
});

const env = { HOME };

test('refusal: process B is refused and never opens the lock file; process A then writes; a child of a declared process is refused', { skip: process.platform === 'win32' }, async () => {
	// '-' leaves the path at its default: the live store of HOME.
	const a = await spawnStoreChild('-', { env });
	assert.deepEqual(await a.send({ op: 'declare-owner' }), { ok: true });
	assert.deepEqual(await a.send({ op: 'open' }), { ok: true });
	assert.deepEqual(await a.send({ op: 'put', key: 'before' }), { ok: true });

	const b = await spawnStoreChild('-', { env });
	const refused = await b.send({ op: 'open' });
	assert.equal(refused.ok, false);
	assert.equal(!refused.ok && refused.name, 'LmdbStoreNotOwnerError');
	assert.deepEqual(await b.send({ op: 'open-store-files' }), { ok: true, value: [] }, 'B holds no descriptor on the store or its lock file');

	// A is unaffected: a synchronous and an asynchronous write, and reads.
	assert.deepEqual(await a.send({ op: 'wrapper-sync', key: 'sync' }), { ok: true });
	assert.deepEqual(await a.send({ op: 'wrapper-async', key: 'async', probeAfterMs: 10_000 }), { ok: true });
	assert.deepEqual(await a.send({ op: 'read', key: 'async' }), { ok: true, value: '1' });
	assert.deepEqual(await a.send({ op: 'health' }), { ok: true, value: { state: 'ok' } });

	// A child of the declared process A is refused.
	const child = await a.send({ op: 'child-open' });
	assert.ok(child.ok);
	const reply = child.value as { ok: boolean; name?: string };
	assert.equal(reply.ok, false);
	assert.equal(reply.name, 'LmdbStoreNotOwnerError');

	// The permitted reader is let in beside the owner.
	const c = await spawnStoreChild('-', { env });
	assert.deepEqual(await c.send({ op: 'declare-reader' }), { ok: true });
	assert.deepEqual(await c.send({ op: 'open' }), { ok: true });
	assert.deepEqual(await c.send({ op: 'read', key: 'before' }), { ok: true, value: '1' });
	await c.kill();
	await b.kill();
	await a.kill();
});
