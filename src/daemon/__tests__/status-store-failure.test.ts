/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's status when its graph store has failed (Epic c2ba6fa6, Story
 * s4, t6): the request still answers, with an empty repository list and the
 * cause, because that is the one moment the status is needed.
 *
 * Run: npx tsx --test src/daemon/__tests__/status-store-failure.test.ts
 */

import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDaemonStatus, storeFailureForStatus, STORE_LOCKS_LOST_CAUSE } from '../status.js';
import type { DaemonStatusSources } from '../status.js';
import { getStoreHealth, recordStoreFailureIfLockError, resetStoreHealthForTests } from '../../db/graph/store.js';
import type { RegisteredRepo } from '../../shared/types.js';

beforeEach(() => { resetStoreHealthForTests(); });
after(() => { resetStoreHealthForTests(); });

const REPO: RegisteredRepo = { path: '/r', name: 'r', addedAt: '', status: 'ready' };

function sources(over: Partial<DaemonStatusSources> = {}): DaemonStatusSources {
	return {
		uptimeSec: 61,
		listRepos: async () => [REPO],
		queueDepth: 3,
		modelState: { status: 'ready' },
		installedCommit: 'abc123',
		lmdbFileSizeMb: 9,
		...over,
	};
}

/** What a store read throws once the locks are gone, in a daemon. */
function badRslot(): Error {
	return Object.assign(new Error('Invalid argument: MDB_BAD_RSLOT: Invalid reuse of reader locktable slot'), { code: 22 });
}
function lockFailure(): Error {
	return Object.assign(new Error('MDB_LOCK_FAILURE: Failed to get robust semaphore, increase max semaphores (kern.sysv.semume)'), { code: -30775 });
}

test('daemon status payload: no storeFailure when healthy; kind, time, operation and cause when locks-lost', async () => {
	// Healthy: the field is ABSENT (not undefined), the rest is as before.
	const healthy = await buildDaemonStatus(sources({ modelState: { status: 'pulling', pct: 40 } }));
	assert.deepEqual(healthy, {
		uptime: 61, repos: [REPO], queueDepth: 3, embeddingsPending: 3,
		modelPullStatus: 'pulling', modelPullPct: 40, installedCommit: 'abc123', lmdbFileSizeMb: 9,
	});
	assert.equal('storeFailure' in healthy, false);
	assert.equal(storeFailureForStatus({ state: 'ok' }), undefined);

	// Locks lost: kind, time, operation and cause.
	recordStoreFailureIfLockError(lockFailure(), 'request search');
	const health = getStoreHealth();
	assert.ok(health.state === 'locks-lost');
	const failed = await buildDaemonStatus(sources());
	assert.deepEqual(failed.storeFailure, { kind: 'locks-lost', at: health.at, operation: 'request search', cause: STORE_LOCKS_LOST_CAUSE });
	assert.ok(!Number.isNaN(Date.parse(failed.storeFailure?.at ?? '')));

	// The cause names another process and the remedy, not the library's advice.
	assert.match(STORE_LOCKS_LOST_CAUSE, /Another process/);
	assert.match(STORE_LOCKS_LOST_CAUSE, /restarted/);
	assert.doesNotMatch(JSON.stringify(failed), /semume|semaphore/, "the library's text reaches no field of the status");
});

test('status handler with the store failed returns an empty repository list and storeFailure and does not throw', async () => {
	// 1. The failure is already recorded: the store is not read at all.
	recordStoreFailureIfLockError(badRslot(), 'job full');
	let reads = 0;
	const known = await buildDaemonStatus(sources({ listRepos: async () => { reads++; throw new Error('must not be called'); } }));
	assert.deepEqual(known.repos, []);
	assert.equal(known.storeFailure?.operation, 'job full');
	assert.equal(reads, 0);
	// The other fields are still answered.
	assert.equal(known.uptime, 61);
	assert.equal(known.queueDepth, 3);
	assert.equal(known.installedCommit, 'abc123');

	// 2. The status request is the FIRST call to meet the failure: its own read
	//    throws the library's raw error, in either of its two forms.
	for (const thrown of [badRslot, lockFailure]) {
		resetStoreHealthForTests();
		const first = await buildDaemonStatus(sources({ listRepos: async () => { throw thrown(); } }));
		assert.deepEqual(first.repos, []);
		assert.equal(first.storeFailure?.kind, 'locks-lost');
		assert.equal(first.storeFailure?.operation, 'request daemon.status');
		assert.equal(getStoreHealth().state, 'locks-lost', 'and it is recorded for every later call');
	}

	// 3. Any other failure of the read is not swallowed and records nothing.
	resetStoreHealthForTests();
	await assert.rejects(buildDaemonStatus(sources({ listRepos: async () => { throw new Error('disk on fire'); } })), /disk on fire/);
	await assert.rejects(buildDaemonStatus(sources({ listRepos: async () => { throw Object.assign(new Error('Invalid argument'), { code: 22 }); } })), /Invalid argument/);
	assert.deepEqual(getStoreHealth(), { state: 'ok' });
});
