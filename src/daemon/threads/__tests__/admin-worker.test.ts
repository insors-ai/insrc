/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The admin worker (Epic 86197ac6, Story s2, t10): the admin methods run on
 * it and answer as the single-thread daemon does, from the status board and
 * the main thread's daemon.info, reading the store itself only before the
 * first publish; with the store's locks lost, daemon.status says so.
 *
 * The home directory is a temporary one, set before any store module loads.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/admin-worker.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MessagePort } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-admin-worker-'));
process.env['HOME'] = HOME;

const { closeGraphStore, declareLiveStoreOwner, getGraphStore, withWriteTxn } = await import('../../../db/graph/store.js');
const { encodeRepoKey } = await import('../../../db/graph/keys.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { getDb } = await import('../../../db/client.js');
const { addRepo, listRepos, lookupRepoIdInTxn } = await import('../../../db/repos.js');
const { getStoreGuard } = await import('../../../db/store-guard.js');
const { IpcServer, directDispatch } = await import('../../server.js');
const { buildHandlerRuntime } = await import('../../handler-runtime.js');
const { IndexQueue } = await import('../../queue.js');
const { getModelState } = await import('../../lifecycle.js');
const { readInstalledCommit } = await import('../../installed-commit.js');
const { unattributedUnwritable, withCompleteness } = await import('../../repo-completeness.js');
const { currentLmdbFileSizeMb, ThreadServices } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { startClassWorker } = await import('../workers.js');
import type { DaemonStatus } from '../../../shared/types.js';
import type { Worker } from 'node:worker_threads';

const REPO = '/repo/admin-worker';
/** A repository whose index-state row cannot be decoded, so its completeness read fails. */
const BROKEN = '/repo/admin-worker-broken';
const STARTED = Date.now();
const workers: Worker[] = [];

/** A fake Socket that records what is written to it. */
class CapturingSocket extends EventEmitter {
	readonly writes: string[] = [];
	write(chunk: string, cb?: (err?: Error) => void): boolean { this.writes.push(chunk); cb?.(); return true; }
}
type Internals = { handleConnection(s: CapturingSocket): void; handleMessage(raw: string, s: CapturingSocket): Promise<void> };

/** The threaded daemon's request path (router + admin worker) and today's single-thread tables, over one store. */
async function setup(): Promise<{
	ask: (method: string, params?: unknown) => Promise<{ result?: unknown; error?: string }>;
	single: (method: string, params?: unknown) => Promise<unknown>;
	services: InstanceType<typeof ThreadServices>;
	sent: string[];
	workerThreadId: number;
	shutdowns: string[];
}> {
	const services = new ThreadServices(() => ({
		startedAt: STARTED, modelState: getModelState(), installedCommit: readInstalledCommit(), lmdbFileSizeMb: currentLmdbFileSizeMb(),
	}));
	const shutdowns: string[] = [];
	services.onShutdown(reason => { shutdowns.push(reason); });
	const db = await getDb();
	const single = buildHandlerRuntime({
		db, configStore: {} as never, queue: new IndexQueue(), indexer: { summarySweepProgress: () => undefined } as never, startedAt: STARTED,
		shutdown: () => {}, attachedClients: () => ipc.attachedClients(), understandingService: () => undefined,
	});
	const router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed: new Set(['admin']), local: directDispatch(single.rpcHandlers) });
	// Record each request the router sends on the admin worker's channel.
	const sent: string[] = [];
	const attach = router.attach.bind(router);
	router.attach = (threadId: number, port: MessagePort) => {
		const post = port.postMessage.bind(port);
		port.postMessage = ((m: { method?: string }) => { if (m.method !== undefined) sent.push(m.method); post(m); }) as typeof port.postMessage;
		attach(threadId, port);
	};
	const started = await startClassWorker(services, router, 'admin', 'admin-worker');
	workers.push(started.worker);
	const ipc = new IpcServer(router.forward, () => 1000);
	ipc.onRegistryChange(clients => services.board.publishClients(clients));
	const server = ipc as unknown as Internals;
	const sock = new CapturingSocket();
	server.handleConnection(sock);
	let id = 0;
	const ask = async (method: string, params?: unknown): Promise<{ result?: unknown; error?: string }> => {
		const n = ++id;
		await server.handleMessage(JSON.stringify({ id: n, method, params, client: { label: 'test', pid: 1 } }), sock);
		const line = sock.writes.map(w => JSON.parse(w) as { id: number }).find(w => w.id === n);
		assert.ok(line !== undefined, `answered ${method}`);
		return line as { result?: unknown; error?: string };
	};
	return { ask, single: (m, p) => single.rpcHandlers[m]!(p), services, sent, workerThreadId: started.threadId, shutdowns };
}

before(async () => {
	declareLiveStoreOwner();
	await addRepo(await getDb(), { path: REPO, name: 'admin-worker', addedAt: '2026-10-22T00:00:00.000Z', status: 'ready' });
	await addRepo(await getDb(), { path: BROKEN, name: 'broken', addedAt: '2026-10-22T00:00:00.000Z', status: 'ready' });
	const repoId = lookupRepoIdInTxn(await getGraphStore(), BROKEN)!;
	await withWriteTxn(s => { void s.indexState.put(encodeRepoKey(repoId), Buffer.from([0xff, 0x01, 0x02])); });
});
after(async () => {
	for (const w of workers) await w.terminate();
	await closeLanceConn();
	await closeGraphStore();
	rmSync(HOME, { recursive: true, force: true });
});

const ADMIN_READS: [string, unknown][] = [
	['daemon.status', undefined], ['daemon.debug-status', undefined], ['repo.list', undefined], ['config.show', undefined],
	['config.catalog', undefined], ['guide.list', undefined], ['guide.get', { workflow: 'build' }], ['daemon.updateOutcome', undefined],
];

test("each admin-class method runs on the admin worker's thread id", async () => {
	const t = await setup();
	// A row only the board has: repo.list and daemon.status answer from the board, not the store.
	const boardOnly = { path: '/repo/board-only', name: 'board-only', addedAt: '2026-10-22T00:00:00.000Z', status: 'ready' as const };
	t.services.board.publishStore({ repos: [boardOnly], publishedAt: Date.now() });
	assert.deepEqual((await t.ask('repo.list')).result, [boardOnly]);
	assert.deepEqual(((await t.ask('daemon.status')).result as DaemonStatus).repos, [boardOnly]);
	t.sent.length = 0;
	for (const [method, params] of ADMIN_READS) {
		const reply = await t.ask(method, params);
		assert.equal(reply.error, undefined, `${method}: ${reply.error}`);
	}
	assert.deepEqual((await t.ask('daemon.shutdown')).result, { ok: true });
	assert.deepEqual(t.shutdowns, ['daemon.shutdown RPC'], 'daemon.shutdown on the worker reached the main thread\'s shutdown');
	assert.deepEqual(t.sent, [...ADMIN_READS.map(([m]) => m), 'daemon.shutdown'], 'every admin method went to the admin worker\'s channel and was answered from it');
	// Every admin-class method is one of these, or daemon.update (not called: it launches an update).
	const adminMethods = methodClasses.entries().filter(e => e.cls === 'admin').map(e => e.method).sort();
	assert.deepEqual(adminMethods, [...ADMIN_READS.map(([m]) => m), 'daemon.shutdown', 'daemon.update'].sort());
});

test("recorded responses of daemon.status, daemon.debug-status, repo.list, config.show, config.catalog, guide.list and guide.get equal the single-thread daemon's", async () => {
	const t = await setup();
	// The store slot as the code-indexing worker publishes it.
	t.services.board.publishStore({
		repos: await withCompleteness(await listRepos(await getDb()), r => r.path),
		unattributedUnwritable: await unattributedUnwritable(),
		publishedAt: Date.now(),
	});
	for (const [method, params] of [['config.show', undefined], ['config.catalog', undefined], ['guide.list', undefined], ['guide.get', { workflow: 'build' }], ['guide.get', { workflow: 'nope' }], ['repo.list', undefined]] as const) {
		assert.deepEqual((await t.ask(method, params)).result, await t.single(method, params), method);
	}
	assert.deepEqual((await t.ask('daemon.debug-status')).result, await t.single('daemon.debug-status'));

	const threaded = (await t.ask('daemon.status')).result as DaemonStatus;
	const today = await t.single('daemon.status') as DaemonStatus;
	assert.deepEqual(Object.keys(threaded).sort(), Object.keys(today).sort(), 'the same fields');
	assert.equal(typeof threaded.uptime, typeof today.uptime);
	const { uptime: _a, ...restThreaded } = threaded;
	const { uptime: _b, ...restToday } = today;
	assert.deepEqual(restThreaded, restToday, 'every other field equal');
	assert.equal('maintenance' in threaded, false);
});

test("repo.list and daemon.status before the first publish return today's list read from the store; a repo whose completeness read fails has no completeness field", async () => {
	const t = await setup();
	const fromStore = await withCompleteness(await listRepos(await getDb()), r => r.path);
	assert.ok(fromStore.some(r => r.path === BROKEN && !('completeness' in r)), 'the broken repo\'s completeness read fails, so the field is left out');
	assert.ok(fromStore.some(r => r.path === REPO && 'completeness' in r), 'the other repo has its completeness');
	const t0 = Date.now();
	assert.deepEqual((await t.ask('repo.list')).result, fromStore);
	assert.ok(Date.now() - t0 >= 4_000, 'it waited for the first publish before reading the store');
	assert.deepEqual(((await t.ask('daemon.status')).result as DaemonStatus).repos, fromStore);
});

test('daemon.status answers with storeFailure when store health is locks-lost', async () => {
	const t = await setup();
	t.services.board.publishStore({ repos: [], publishedAt: Date.now() });
	const guard = getStoreGuard();
	assert.equal(guard.markLocksLost('graph'), true);
	try {
		const status = (await t.ask('daemon.status')).result as DaemonStatus;
		assert.equal(status.storeFailure?.kind, 'locks-lost');
		assert.deepEqual(status.repos, [], 'with the store failed, no repository list');
	} finally {
		guard.resetHealthForTests('graph');
	}
});
