/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The code-indexing worker (Epic 86197ac6, Story s2, t11): every indexing
 * method runs on it, its watcher indexes a file change while the main thread
 * is blocked, it publishes the store slot before its queue starts and after
 * each change, and repo.stats and daemon.compact's busy refusal answer as the
 * single-thread daemon does.
 *
 * The home directory is a temporary one, set before any store module loads.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/indexing-worker.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MessagePort, Worker } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-indexing-worker-'));
process.env['HOME'] = HOME;

const { closeGraphStore, declareLiveStoreOwner } = await import('../../../db/graph/store.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { getDb, initDb } = await import('../../../db/client.js');
const { addRepo, listRepos } = await import('../../../db/repos.js');
const { findEntitiesByFile } = await import('../../../db/entities.js');
const { directDispatch } = await import('../../server.js');
const { buildHandlerRuntime } = await import('../../handler-runtime.js');
const { IndexQueue } = await import('../../queue.js');
const { ThreadServices } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { startClassWorker } = await import('../workers.js');
const { INDEXING_DRAINED, INDEXING_PORT, INDEXING_STOP_OP } = await import('../indexing-port.js');
const { pushToWorker } = await import('../channel.js');
import type { ReplyEnvelope, RequestEnvelope } from '../channel.js';

// Real paths: the watcher reports events under the real path (/private/var on macOS).
const REPO = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-indexing-worker-repo-')));
const SECOND = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-indexing-worker-second-')));
const workers: Worker[] = [];
const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
let router: InstanceType<typeof Router>;
const sent: string[] = [];
let indexingPort: MessagePort;
/** The board's publishes in arrival order, from before the worker starts. */
const boardEvents: string[] = [];

/** Ask the router as a socket would; resolves with the reply envelope. */
let seq = 0;
function ask(method: string, params?: unknown): Promise<ReplyEnvelope> {
	const requestId = `t${++seq}`;
	return new Promise(resolve => {
		router.forward({ kind: 'request', requestId, method, params, stream: false } satisfies RequestEnvelope, e => resolve(e as ReplyEnvelope));
	});
}
async function until(cond: () => Promise<boolean> | boolean, what: string, ms = 20_000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!(await cond())) {
		if (Date.now() > deadline) assert.fail(`timed out waiting for: ${what}`);
		await new Promise(r => setTimeout(r, 50));
	}
}

before(async () => {
	declareLiveStoreOwner();
	const db = await getDb();
	await initDb(db);
	mkdirSync(join(REPO, 'src'), { recursive: true });
	writeFileSync(join(REPO, 'src', 'a.ts'), 'export function alpha(): number { return 1; }\n');
	await addRepo(db, { path: REPO, name: 'fixture', addedAt: new Date().toISOString(), status: 'pending' });

	const board = services.board;
	const publishStore = board.publishStore.bind(board);
	board.publishStore = store => { boardEvents.push('store'); publishStore(store); };
	const publishLane = board.publishLane.bind(board);
	board.publishLane = (lane, status, sweep) => { boardEvents.push(`${lane}${status.processing ? ' running' : ''}`); publishLane(lane, status, sweep); };
	router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed: new Set(['indexing']), local: directDispatch({}) });
	const attach = router.attach.bind(router);
	router.attach = (threadId: number, port: MessagePort) => {
		indexingPort = port;
		const post = port.postMessage.bind(port);
		port.postMessage = ((m: { method?: string }) => { if (m.method !== undefined) sent.push(m.method); post(m); }) as typeof port.postMessage;
		attach(threadId, port);
	};
	const started = await startClassWorker(services, router, 'indexing', 'indexing-worker');
	workers.push(started.worker);
	// The pending repository is indexed by the worker's queue.
	await until(async () => (await findEntitiesByFile(db, join(REPO, 'src', 'a.ts'))).length > 0, 'a.ts to be indexed');
	await until(() => services.board.snapshot().indexing.idle, 'the worker\'s queue to go idle');
});
after(async () => {
	// Stop the worker's queue and watcher (its native subscription) before it ends, as shutdown does.
	for (const w of workers) {
		const drained = new Promise<void>(resolve => w.on('message', m => { if (m === INDEXING_DRAINED) resolve(); }));
		pushToWorker(indexingPort, INDEXING_STOP_OP, null);
		await drained;
		await w.terminate();
	}
	await closeLanceConn();
	await closeGraphStore();
	for (const d of [HOME, REPO, SECOND]) rmSync(d, { recursive: true, force: true });
});

test("each indexing-class method runs on the code-indexing worker's thread id", async () => {
	const backupDir = mkdtempSync(join(tmpdir(), 'insrc-indexing-worker-backup-'));
	try {
		const calls: [string, unknown][] = [
			['repo.stats', {}],
			['repo.reindex', { path: REPO }],
			['index.file', { filePath: join(REPO, 'src', 'a.ts'), event: 'update' }],
			['config.enqueue', { filePath: join(HOME, 'none.md'), scope: { kind: 'global' }, event: 'update' }],
			['config.reindex', { scope: { kind: 'global' } }],
			['daemon.backup', { path: join(backupDir, 'b') }],
			['docSummary.restoreFromBackup', { backupPath: 42 }],
			['daemon.compact', undefined],
			['repo.add', { path: SECOND }],
			['repo.remove', { path: SECOND }],
		];
		// What each call must answer: its handler really ran (not just "not an unknown method").
		const ok = (r: ReplyEnvelope): void => { assert.equal(r.error, undefined); assert.deepEqual(r.result, { ok: true }); };
		const expect: Record<string, (r: ReplyEnvelope) => void> = {
			'repo.stats': r => { assert.equal(r.error, undefined); assert.ok(Array.isArray(r.result) && (r.result as { repoPath: string }[]).some(x => x.repoPath === REPO)); },
			'repo.reindex': ok, 'index.file': ok, 'config.enqueue': ok, 'config.reindex': ok, 'repo.add': ok, 'repo.remove': ok,
			'daemon.backup': r => { assert.equal(r.error, undefined); assert.equal((r.result as { targetDir?: string }).targetDir, join(backupDir, 'b')); },
			'docSummary.restoreFromBackup': r => assert.equal(r.error, 'docSummary.restoreFromBackup: backupPath must be a string', 'its own validation ran'),
			// Work was just queued by the calls above: today's busy refusal, from the worker's real queue.
			'daemon.compact': r => assert.match(r.error ?? '', /^daemon\.compact: indexer is busy \(queue=\d+, processing=(true|false)\)\./),
		};
		sent.length = 0;
		for (const [method, params] of calls) {
			const reply = await ask(method, params);
			assert.ok(expect[method] !== undefined, `an expected outcome for ${method}`);
			expect[method]!(reply);
		}
		assert.deepEqual(sent, calls.map(([m]) => m), 'every indexing method went to the code-indexing worker');
		const indexingMethods = methodClasses.entries().filter(e => e.cls === 'indexing').map(e => e.method).sort();
		assert.deepEqual(indexingMethods, calls.map(([m]) => m).sort(), 'and these are all of them');
	} finally {
		rmSync(backupDir, { recursive: true, force: true });
	}
});

test('a file change is indexed while a session request spins the main thread', async () => {
	const db = await getDb();
	const file = join(REPO, 'src', 'b.ts');
	writeFileSync(file, 'export function beta(): number { return 2; }\n');
	// The main thread is blocked outright for 8 s, as a CPU-bound session request would block it.
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 8_000);
	// Read at once, before this thread has run anything else: the worker indexed it meanwhile.
	assert.ok((await findEntitiesByFile(db, file)).length > 0, 'b.ts was indexed while the main thread was blocked');
});

test('the store slot is published before the queue starts and after every registry change', async () => {
	const first = services.board.snapshot().store;
	assert.ok(first.repos?.some(r => r.path === REPO), 'the registry was on the board before any status was asked');
	assert.equal(boardEvents[0], 'store', 'the store slot was published before anything else');
	assert.ok(boardEvents.indexOf('store') < boardEvents.indexOf('index running'), 'and before the queue ran its first job');
	const before = first.publishedAt;
	const added = await ask('repo.add', { path: SECOND });
	assert.equal(added.error, undefined);
	await until(() => services.board.snapshot().store.repos?.some(r => r.path === SECOND) === true, 'the added repo on the board', 5_000);
	assert.ok(services.board.snapshot().store.publishedAt >= before);
	await ask('repo.remove', { path: SECOND });
	await until(() => services.board.snapshot().store.repos?.some(r => r.path === SECOND) === false, 'the removed repo gone from the board', 5_000);
	assert.deepEqual(services.board.snapshot().store.repos, await (await import('../../repo-completeness.js')).withCompleteness(await listRepos(await getDb()), r => r.path));
});

test("recorded responses of repo.stats and daemon.compact equal the single-thread daemon's", async () => {
	await until(() => services.board.snapshot().indexing.idle, 'the worker idle');
	const single = buildHandlerRuntime({
		db: await getDb(), configStore: {} as never, queue: new IndexQueue(), indexer: {} as never, startedAt: 0,
		shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
	const threaded = await ask('repo.stats', {});
	assert.equal(threaded.error, undefined);
	assert.deepEqual(threaded.result, await single.rpcHandlers['repo.stats']!({}));
	const one = await ask('repo.stats', { repoPath: REPO });
	assert.deepEqual(one.result, await single.rpcHandlers['repo.stats']!({ repoPath: REPO }));

	// daemon.compact while the queue has work: today's refusal, word for word in shape.
	const busyQueue = new IndexQueue();
	busyQueue.enqueue({ kind: 'full', repoPath: REPO });
	const singleBusy = buildHandlerRuntime({
		db: await getDb(), configStore: {} as never, queue: busyQueue, indexer: {} as never, startedAt: 0,
		shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
	const todayRefusal = await singleBusy.rpcHandlers['daemon.compact']!(undefined).then(() => '', (e: Error) => e.message);
	const enqueued = await new Promise<ReplyEnvelope>(resolve => {
		const requestId = 'enq';
		const onMessage = (m: ReplyEnvelope): void => { if (m.requestId === requestId) { indexingPort.off('message', onMessage); resolve(m); } };
		indexingPort.on('message', onMessage);
		indexingPort.postMessage({ kind: 'request', requestId, method: INDEXING_PORT.enqueue, params: { kind: 'full', repoPath: REPO }, stream: false });
	});
	assert.equal(enqueued.error, undefined);
	const threadedRefusal = (await ask('daemon.compact')).error ?? '';
	const shape = /^daemon\.compact: indexer is busy \(queue=\d+, processing=(true|false)\)\. Wait for indexing to drain before compacting\.$/;
	assert.match(todayRefusal, shape);
	assert.match(threadedRefusal, shape);
	await until(() => services.board.snapshot().indexing.idle, 'the reindex to finish');
});
