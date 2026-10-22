/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Additive amendments to s1's contracts delivered by s2 (Epic 86197ac6, Story
 * s2, t4): the board's publishLane, an optional completeness on published repo
 * rows, the envelope's underHold flag and daemon.status's maintenance field.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/board-amendments.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

import { HubClient, serveHub } from '../channel.js';
import { StatusBoard, StatusBoardClient, statusBoardHubHandlers } from '../status-board.js';
import type { StoreStatusSnapshot } from '../status-board.js';
import { buildDaemonStatus, composeQueueLanes, queueStatusFromBoard } from '../../status.js';
import { IpcServer } from '../../server.js';
import type { RequestEnvelope } from '../channel.js';
import type { RegisteredRepo } from '../../../shared/types.js';

/** A board served over the hub, and a client per publishing "thread". */
function boardWithClients(n: number): { board: StatusBoard; clients: StatusBoardClient[]; close: () => void } {
	const board = new StatusBoard();
	const channels = Array.from({ length: n }, () => new MessageChannel());
	for (const c of channels) serveHub(c.port1, statusBoardHubHandlers(board));
	return {
		board,
		clients: channels.map(c => new StatusBoardClient(new HubClient(c.port2))),
		close: () => { for (const c of channels) { c.port1.close(); c.port2.close(); } },
	};
}

test('publishLane: two lanes merge, idle is derived from both, queueDepth and QueueLanes map as composeQueueLanes does today', async () => {
	const { board, clients: [codeWorker, summaryWorker], close } = boardWithClients(2);
	try {
		const sweep = { repoPath: '/repo/a', done: 3, total: 9 };
		codeWorker!.publishLane('index', { depth: 4, processing: true });
		summaryWorker!.publishLane('summary', { depth: 2, processing: false }, sweep);
		// The hub reply orders after the one-way publishes on each port.
		let snap = await codeWorker!.snapshot();
		await summaryWorker!.snapshot();
		snap = board.snapshot();
		assert.deepEqual(snap.indexing, { index: { depth: 4, processing: true }, summary: { depth: 2, processing: false }, sweep, idle: false });
		// The status fields map exactly as composeQueueLanes maps the live queue today.
		assert.deepEqual(queueStatusFromBoard(snap.indexing), {
			queueDepth: 6,
			queueLanes: composeQueueLanes({ index: { depth: 4, running: true }, summary: { depth: 2, running: false } }, sweep),
		});

		// An index-lane publish keeps the summary lane and its sweep.
		codeWorker!.publishLane('index', { depth: 0, processing: false });
		await codeWorker!.snapshot();
		assert.deepEqual(board.snapshot().indexing.sweep, sweep);
		assert.equal(board.snapshot().indexing.idle, false, 'not idle while the summary lane has work');

		// A summary publish without a sweep clears it; both lanes empty is idle.
		summaryWorker!.publishLane('summary', { depth: 0, processing: false });
		await summaryWorker!.snapshot();
		assert.deepEqual(board.snapshot().indexing, { index: { depth: 0, processing: false }, summary: { depth: 0, processing: false }, idle: true });
		assert.equal('sweep' in board.snapshot().indexing, false);
		assert.deepEqual(queueStatusFromBoard(board.snapshot().indexing).queueLanes, { index: { depth: 0, running: false }, summary: { depth: 0, running: false } });

		// A processing lane at depth 0 is not idle.
		codeWorker!.publishLane('index', { depth: 0, processing: true });
		await codeWorker!.snapshot();
		assert.equal(board.snapshot().indexing.idle, false);
	} finally {
		close();
	}
});

test('a repo row without completeness is published unchanged; underHold and maintenance are absent by default', async () => {
	const board = new StatusBoard();
	const row: RegisteredRepo = { path: '/repo/no-completeness', name: 'r', addedAt: '2026-10-22T00:00:00.000Z', status: 'ready' };
	const store: StoreStatusSnapshot = { repos: [row], publishedAt: 5 };
	board.publishStore(store);
	assert.deepEqual(board.snapshot().store, { repos: [{ ...row }], publishedAt: 5 });
	assert.equal('completeness' in board.snapshot().store.repos![0]!, false);

	// A request the server forwards carries no underHold.
	const seen: RequestEnvelope[] = [];
	const server = new IpcServer((request, deliver) => { seen.push(request); deliver({ kind: 'reply', requestId: request.requestId, result: 1 }); return () => {}; });
	const internals = server as unknown as { handleConnection(s: unknown): void; handleMessage(raw: string, s: unknown): Promise<void> };
	const { EventEmitter } = await import('node:events');
	const sock = Object.assign(new EventEmitter(), { write: (_c: string, cb?: () => void) => { cb?.(); return true; } });
	internals.handleConnection(sock);
	await internals.handleMessage(JSON.stringify({ id: 1, method: 'daemon.status' }), sock);
	assert.equal(seen.length, 1);
	assert.equal('underHold' in seen[0]!, false);

	// daemon.status carries no maintenance field unless maintenance is running.
	const status = await buildDaemonStatus({
		uptimeSec: 1, listRepos: async () => [], queueDepth: 0, modelState: { status: 'ready' }, installedCommit: '',
		storeHealth: () => ({ state: 'ok' }),
	});
	assert.equal('maintenance' in status, false);
});
