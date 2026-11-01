/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story b94cf2c9 S001/t4 — daemon.status reports the index queue's two lanes.
 *
 * Run: npx tsx --test src/daemon/__tests__/daemon-status-lanes.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDaemonStatus, composeQueueLanes } from '../status.js';
import type { DaemonStatusSources } from '../status.js';

const sources = (extra: Partial<DaemonStatusSources> = {}): DaemonStatusSources => ({
	uptimeSec: 7,
	listRepos: async () => [],
	queueDepth: 5,
	modelState: { status: 'ready' },
	installedCommit: 'abc',
	storeHealth: () => ({ state: 'ok' }),
	...extra,
});

test("buildDaemonStatus keeps queueDepth as the total and adds queueLanes with each lane's depth, whether it is running, and the running sweep's progress", async () => {
	const lanes = composeQueueLanes(
		{ index: { depth: 3, running: true }, summary: { depth: 2, running: true } },
		{ repoPath: '/repos/a', done: 40, total: 14974 },
	);
	const status = await buildDaemonStatus(sources({ queueLanes: () => lanes }));
	assert.equal(status.queueDepth, 5, 'the total is unchanged');
	assert.deepEqual(status.queueLanes, {
		index:   { depth: 3, running: true },
		summary: { depth: 2, running: true, sweep: { repoPath: '/repos/a', done: 40, total: 14974 } },
	});
});

test('with no sweep running the summary lane carries no sweep, and without a lane source the status carries no queueLanes', async () => {
	const idle = composeQueueLanes({ index: { depth: 0, running: false }, summary: { depth: 1, running: false } }, undefined);
	assert.deepEqual(idle, { index: { depth: 0, running: false }, summary: { depth: 1, running: false } });
	assert.equal('sweep' in idle.summary, false);

	const status = await buildDaemonStatus(sources());
	assert.equal('queueLanes' in status, false, 'a consumer that does not know the field sees no change');
	assert.equal(status.queueDepth, 5);
});

test('Epic c2ba6fa6 s2 review: the backfill lane is published in queueLanes, from the live queue and from the status board', async () => {
	const { queueStatusFromBoard } = await import('../status.js');
	const lanes = composeQueueLanes({ index: { depth: 0, running: false }, summary: { depth: 0, running: false }, backfill: { depth: 1, running: true } }, undefined);
	assert.deepEqual(lanes.backfill, { depth: 1, running: true });
	const fromBoard = queueStatusFromBoard({
		index: { depth: 0, processing: false }, summary: { depth: 0, processing: false }, backfill: { depth: 2, processing: true },
	} as Parameters<typeof queueStatusFromBoard>[0]);
	assert.deepEqual(fromBoard.queueLanes.backfill, { depth: 2, running: true });
	assert.equal(fromBoard.queueDepth, 2);
	assert.equal('backfill' in composeQueueLanes({ index: { depth: 0, running: false }, summary: { depth: 0, running: false } }, undefined), false);
});
