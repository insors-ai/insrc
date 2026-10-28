/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s3 / t5: the session worker. Started through startWorker, it serves
 * session-class methods with the daemon's own handler runtime (today's responses), each
 * under the maintenance lock's request hold, and a step handler's nested session-class
 * call runs inline on it.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-session-worker-'));
process.env['HOME'] = HOME;
process.env['INSRC_TEST_HOOKS'] = '1';

const { getDb, initDb } = await import('../../../db/client.js');
const { saveSession } = await import('../../../db/conversations.js');
const { closeGraphStore, declareLiveStoreOwner } = await import('../../../db/graph/store.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { getLockManager } = await import('../../../shared/locks/lock-manager.js');
const { MAINTENANCE_LOCK } = await import('../../../shared/locks/maintenance-lock.js');
const { buildHandlerRuntime } = await import('../../handler-runtime.js');
const { directDispatch } = await import('../../server.js');
const { ThreadServices } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { startWorker } = await import('../workers.js');
import type { MethodClass } from '../channel.js';
import type { StartedWorker } from '../workers.js';

const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
const router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed: new Set<MethodClass>(['session']), local: directDispatch({}) });
/** Every nested call a worker sends to another thread through the main thread's router. */
const routed: string[] = [];
services.onRoute(r => { routed.push(r.method); return router.request(r.cls, r.method, r.params, { underHold: r.underHold, shared: r.shared }); });
let started: StartedWorker | undefined;

before(async () => {
	declareLiveStoreOwner();
	const db = await getDb();
	await initDb(db);
	await saveSession(db, { id: 'sess-a', repo: '/repos/a', summary: 'first' });
	await saveSession(db, { id: 'sess-b', repo: '/repos/b', summary: 'second' });
	started = await startWorker(services, 'session', 'session-worker');
	// Registered as the unattributed worker: a session-class request with no identity reaches it.
	services.registry.register({ threadId: started.threadId, cls: 'session', unattributed: true });
	router.attach(started.threadId, started.port);
});
after(async () => {
	if (started !== undefined) {
		router.detach(started.threadId);
		await started.worker.terminate();
		await started.reclaimed;
		started.disconnect();
	}
	await closeLanceConn();
	await closeGraphStore();
	rmSync(HOME, { recursive: true, force: true });
});

/** session.list as today's single-thread daemon answers it, over the same store. */
async function todaySessionList(): Promise<unknown> {
	const none = {} as never;
	const single = buildHandlerRuntime({
		db: await getDb(), configStore: none, queue: none, indexer: none, startedAt: 0,
		shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
	return single.rpcHandlers['session.list']!({});
}

test("session worker: starts, reports ready and serves a session method with today's response under the maintenance request hold", async () => {
	const where = await router.request('session', 'test.servingThread', null) as { threadId: number };
	assert.equal(where.threadId, started!.threadId, 'served on the session worker, not this thread');
	const answer = await router.request('session', 'session.list', {});
	assert.deepEqual(answer, await todaySessionList(), "today's response");
	assert.ok(Array.isArray((answer as { sessions?: unknown[] }).sessions ?? answer), 'a list came back');

	// With maintenance holding the lock exclusively, the worker's request hold refuses the request at once.
	let release!: () => void;
	const gate = new Promise<void>(r => { release = r; });
	let granted!: () => void;
	const isGranted = new Promise<void>(r => { granted = r; });
	const maintenance = getLockManager().request(MAINTENANCE_LOCK, { mode: 'exclusive', metadata: { activity: 'compaction', reason: 'test' }, timeoutMs: 10_000 }, async () => { granted(); await gate; });
	await isGranted;
	try {
		await assert.rejects(() => router.request('session', 'session.list', {}), /daemon busy: compaction/, 'refused by the request hold while maintenance holds the lock');
	} finally {
		release();
		await maintenance;
	}
	assert.deepEqual(await router.request('session', 'session.list', {}), await todaySessionList(), 'served again once maintenance released');
});

test('session worker: a nested session-class call runs inline on the worker thread', async () => {
	routed.length = 0;
	const answer = await router.request('session', 'test.nested', null) as { threadId: number; nested: unknown };
	assert.equal(answer.threadId, started!.threadId);
	assert.deepEqual(answer.nested, await todaySessionList(), 'the nested session.list answered as today');
	assert.deepEqual(routed, [], 'no nested call left the worker: it ran inline on its thread');
});
