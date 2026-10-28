/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s3 / t6: the shared-state worker. The session worker started with
 * `shared: true` hosts the one chat session pool, the understanding service and the todos
 * retention sweep, and serves the chat, todos and understanding families on its thread; the
 * thread that started it hosts none of them.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-shared-state-worker-'));
process.env['HOME'] = HOME;
process.env['INSRC_TEST_HOOKS'] = '1';

const { getDb, initDb } = await import('../../../db/client.js');
const { closeGraphStore, declareLiveStoreOwner } = await import('../../../db/graph/store.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { chatList } = await import('../../chat-handler.js');
const { directDispatch } = await import('../../server.js');
const { ThreadServices } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { startWorker } = await import('../workers.js');
import type { MethodClass } from '../channel.js';
import type { StartedWorker } from '../workers.js';

const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
const router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed: new Set<MethodClass>(['session']), local: directDispatch({}) });
services.onRoute(r => router.request(r.cls, r.method, r.params, { underHold: r.underHold, shared: r.shared }));
let started: StartedWorker | undefined;

before(async () => {
	declareLiveStoreOwner();
	await initDb(await getDb());
	started = await startWorker(services, 'shared-state', 'session-worker', { workerData: { shared: true }, transferList: [] });
	services.registry.register({ threadId: started.threadId, cls: 'session', shared: true });
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

const shared = (method: string, params: unknown): Promise<unknown> => router.request('session', method, params, { shared: true });

test('shared-state worker: chat.list, todos.listForSession and understanding.* run on its thread; the main thread starts no chat pool, understanding service or retention timer', async () => {
	const where = await shared('test.servingThread', null) as { threadId: number };
	assert.equal(where.threadId, started!.threadId, 'requests reach the shared-state worker');
	// The chat pool lives on the shared-state worker: it answers chat.list ...
	assert.deepEqual(await shared('chat.list', {}), { sessions: [] });
	// ... and this thread, which started the worker, has none.
	await assert.rejects(() => chatList({}), /chat handlers not initialized/, 'no chat pool on the starting thread');
	const todos = await shared('todos.listForSession', { sessionId: 'sess-x' });
	assert.equal(typeof todos, 'object', 'todos served');
	// The understanding service: its routes are served there (no daemon socket in this test, so it reports unavailable).
	const understanding = await shared('understanding.history', {}).then(() => 'answered', (err: Error) => err.message);
	assert.doesNotMatch(understanding, /unknown method/, 'understanding.* is a served method on the worker');
	// The in-daemon-only purge method is served to nested calls on this worker.
	assert.deepEqual(await shared('chat.dropSession', { sessionId: 'sess-x' }), { ok: true });
	// The main thread's own start of the understanding service and the retention sweep is gated on session work
	// not being routed (src/daemon/index.ts, hostsSharedState); the threaded daemon's boot test checks it.
});
