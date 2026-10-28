/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Target registry and status board (Epic 86197ac6, Story s1, t4).
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/registry-board.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker } from 'node:worker_threads';

import { serveHub } from '../channel.js';
import { TargetConflictError, TargetRegistry } from '../registry.js';
import { StatusBoard, statusBoardHubHandlers } from '../status-board.js';
import type { RunRecord } from '../status-board.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const A = { label: 'mcp', pid: 100 };
const B = { label: 'mcp', pid: 200 };

test('TargetRegistry refuses a second live admin, indexing, unattributed or same-session target and resolves an identity-less session request to the unattributed target', () => {
	const r = new TargetRegistry();
	r.register({ threadId: 1, cls: 'admin' });
	r.register({ threadId: 2, cls: 'indexing' });
	r.register({ threadId: 3, cls: 'session', unattributed: true });
	r.register({ threadId: 4, cls: 'session', session: A });
	r.register({ threadId: 5, cls: 'session', session: B });

	assert.throws(() => r.register({ threadId: 9, cls: 'admin' }), TargetConflictError);
	assert.throws(() => r.register({ threadId: 9, cls: 'indexing' }), TargetConflictError);
	assert.throws(() => r.register({ threadId: 9, cls: 'session', unattributed: true }), TargetConflictError);
	assert.throws(() => r.register({ threadId: 9, cls: 'session', session: { label: 'mcp', pid: 100 } }), /session:mcp:100 \(thread 4\)/);

	assert.equal(r.targetFor('admin')?.threadId, 1);
	assert.equal(r.targetFor('indexing')?.threadId, 2);
	assert.equal(r.targetFor('session', A)?.threadId, 4);
	assert.equal(r.targetFor('session', B)?.threadId, 5);
	assert.equal(r.targetFor('session')?.threadId, 3, 'no identity: the unattributed target');
	assert.equal(r.targetFor('session', { label: 'cli', pid: 1 }), undefined, 'an unknown session has no target yet');
});

test('registry: a shared target and an unattributed target register together without TargetConflictError and each lookup resolves to its own worker', () => {
	const r = new TargetRegistry();
	r.register({ threadId: 11, cls: 'session', unattributed: true });
	r.register({ threadId: 12, cls: 'session', shared: true });
	r.register({ threadId: 13, cls: 'session', session: { label: 'mcp', pid: 42 } });
	assert.equal(r.targetFor('session')?.threadId, 11, 'no identity: the unattributed target');
	assert.equal(r.targetFor('session', undefined, { shared: true })?.threadId, 12, 'only a shared lookup reaches the shared-state target');
	assert.equal(r.targetFor('session', { label: 'mcp', pid: 42 })?.threadId, 13);
	assert.throws(() => r.register({ threadId: 14, cls: 'session', shared: true }), TargetConflictError, 'one live shared-state target');
	r.unregister(12);
	assert.equal(r.targetFor('session', undefined, { shared: true }), undefined);
	assert.equal(r.targetFor('session')?.threadId, 11, 'the unattributed target is untouched');
});

test('a target re-registered after unregister succeeds and unregistering an unknown thread is a no-op', () => {
	const r = new TargetRegistry();
	r.register({ threadId: 1, cls: 'admin' });
	r.register({ threadId: 4, cls: 'session', session: A });
	r.unregister(999);
	assert.equal(r.targets().length, 2, 'unknown thread: nothing removed');

	r.unregister(4);
	assert.equal(r.targetFor('session', A), undefined);
	r.register({ threadId: 6, cls: 'session', session: A });
	assert.equal(r.targetFor('session', A)?.threadId, 6, 'the session gets its new worker');

	r.unregister(1);
	r.register({ threadId: 7, cls: 'admin' });
	assert.equal(r.targetFor('admin')?.threadId, 7);
});

test('StatusBoard keeps the latest status per thread and snapshots empty as specified', () => {
	const empty = new StatusBoard().snapshot();
	assert.deepEqual(empty, {
		threads: [],
		indexing: { index: { depth: 0, processing: false }, summary: { depth: 0, processing: false }, idle: true },
		clients: [],
		runs: [],
		store: { publishedAt: 0 },
	});
	assert.equal(empty.store.repos, undefined);
	assert.equal(empty.store.unattributedUnwritable, undefined);

	const b = new StatusBoard();
	b.publish({ threadId: 2, cls: 'admin', busy: false, queued: 0 });
	b.publish({ threadId: 3, cls: 'session', session: A, busy: true, method: 'a', since: 1, queued: 0 });
	b.publish({ threadId: 3, cls: 'session', session: A, busy: true, method: 'b', since: 2, queued: 2 });
	const s = b.snapshot();
	assert.equal(s.threads.length, 2);
	assert.deepEqual(s.threads.find(t => t.threadId === 3), { threadId: 3, cls: 'session', session: A, busy: true, method: 'b', since: 2, queued: 2 });
	b.forget(3);
	assert.deepEqual(b.snapshot().threads.map(t => t.threadId), [2]);
});

test('publishIndexing, publishClients, publishRun and publishStore are each reflected in snapshot, runs by runId with frames only growing', () => {
	const b = new StatusBoard();
	const indexing = { index: { depth: 3, processing: true }, summary: { depth: 1, processing: false }, sweep: { repoPath: '/r', done: 2, total: 9 }, idle: false };
	b.publishIndexing(indexing);
	const clients = [{ id: 1, label: 'mcp', pid: 100, connectedAt: 5, lastMethod: 'step.call' }];
	b.publishClients(clients);
	const store = { repos: [], unattributedUnwritable: { total: 3, reasons: { 'source-missing': 3 } }, publishedAt: 42 };
	b.publishStore(store);
	const run1: RunRecord = { runId: 'r1', status: 'running', ownerThreadId: 4, startedAt: 1, model: 'm', frames: ['a'] };
	b.publishRun(run1);
	b.publishRun({ runId: 'r2', status: 'running', ownerThreadId: 5, startedAt: 2, model: 'm', frames: [] });
	b.publishRun({ ...run1, frames: ['a', 'b'], status: 'done', result: { ok: true } });
	b.publishRun({ ...run1, frames: [] });   // would shrink: refused

	const s = b.snapshot();
	assert.deepEqual(s.indexing, indexing);
	assert.deepEqual(s.clients, clients);
	assert.deepEqual(s.store, store);
	assert.equal(s.runs.length, 2, 'one record per runId');
	assert.deepEqual(s.runs.find(r => r.runId === 'r1'), { ...run1, frames: ['a', 'b'], status: 'done', result: { ok: true } });
});

test('a status published from a worker appears in a main-thread snapshot', async () => {
	const board = new StatusBoard();
	const { port1: main, port2: workerPort } = new MessageChannel();
	serveHub(main, statusBoardHubHandlers(board));
	const worker = new Worker(join(HERE, 'helpers', 'board-worker.ts'), { workerData: { port: workerPort }, transferList: [workerPort] });
	try {
		const msg = await new Promise<{ threadId: number; snapshot: ReturnType<StatusBoard['snapshot']> }>((res, rej) => { worker.once('message', res); worker.once('error', rej); });
		const mine = board.snapshot().threads.find(t => t.threadId === msg.threadId);
		assert.deepEqual(mine, { threadId: msg.threadId, cls: 'session', session: { label: 'mcp', pid: 7 }, busy: true, method: 'analyze.step', since: 2, queued: 1 }, 'the main-thread snapshot holds the worker\'s latest status');
		assert.deepEqual(msg.snapshot.threads, [mine], 'the worker reads the same snapshot through the hub');
	} finally {
		main.close();
		await worker.terminate();
	}
});

test('board: forgetRun hub binding removes a run published from a worker; ownerThreadId is the publishing thread', async () => {
	const { mkdtempSync, rmSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const repo = mkdtempSync(join(tmpdir(), 'insrc-run-board-'));
	const board = new StatusBoard();
	const { port1: main, port2: workerPort } = new MessageChannel();
	serveHub(main, statusBoardHubHandlers(board));
	const worker = new Worker(join(HERE, 'helpers', 'run-board-worker.ts'), { workerData: { port: workerPort, repo }, transferList: [workerPort] });
	try {
		const msg = await new Promise<{ threadId: number; runId: string }>((res, rej) => { worker.once('message', res); worker.once('error', rej); });
		const record = board.snapshot().runs.find(r => r.runId === msg.runId);
		assert.ok(record !== undefined, 'the worker\'s run is on the main-thread board');
		assert.equal(record.ownerThreadId, msg.threadId, 'owned by the thread that published it');
		assert.notEqual(record.ownerThreadId, 0, 'not the main thread');
		assert.equal(record.status, 'done');
		assert.ok(record.frames.length > 0, 'its progress frames came with it');
		worker.postMessage('forget');
		await new Promise<void>((res, rej) => { worker.once('message', () => res()); worker.once('error', rej); });
		assert.equal(board.snapshot().runs.some(r => r.runId === msg.runId), false, 'forgotten through the hub');
	} finally {
		main.close();
		await worker.terminate();
		rmSync(repo, { recursive: true, force: true });
	}
});
