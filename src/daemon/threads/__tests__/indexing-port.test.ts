/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The main thread's indexing port and the routed in-daemon client (Epic
 * 86197ac6, Story s2, t12): with daemon threads the main thread hosts no
 * queue, indexer or watcher; it reads the lanes from the status board and
 * asks the code-indexing worker for the rest, and a step handler's nested
 * call to an indexing method runs on that worker.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/indexing-port.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MessagePort, Worker } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-indexing-port-'));
process.env['HOME'] = HOME;

const { closeGraphStore, declareLiveStoreOwner } = await import('../../../db/graph/store.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { getDb, initDb } = await import('../../../db/client.js');
const { addRepo } = await import('../../../db/repos.js');
const { findEntitiesByFile } = await import('../../../db/entities.js');
const { directDispatch } = await import('../../server.js');
const { buildHandlerRuntime } = await import('../../handler-runtime.js');
const { createInDaemonClient } = await import('../../steps/daemon-client.js');
const { queueStatusFromBoard } = await import('../../status.js');
const { ThreadServices } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { startClassWorker } = await import('../workers.js');
const { IndexingPortClient, INDEXING_DRAINED, INDEXING_PORT, INDEXING_STOP_OP } = await import('../indexing-port.js');
const { pushToWorker } = await import('../channel.js');
import type { MethodClass } from '../channel.js';
import { stopWorker } from './helpers/stop-worker.js';
import type { DaemonStatus } from '../../../shared/types.js';

const REPO = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-indexing-port-repo-')));
const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
const routed = new Set<MethodClass>(['indexing']);
let router: InstanceType<typeof Router>;
let worker: Worker;
let channel: MessagePort;
const sent: string[] = [];
/** The port's requests to the worker and what each answered. */
const portCalls: { method: string; result: unknown }[] = [];
let port: InstanceType<typeof IndexingPortClient>;
let main: ReturnType<typeof buildHandlerRuntime>;

before(async () => {
	declareLiveStoreOwner();
	const db = await getDb();
	await initDb(db);
	mkdirSync(join(REPO, 'src'), { recursive: true });
	writeFileSync(join(REPO, 'src', 'a.ts'), 'export function alpha(): number { return 1; }\n');
	await addRepo(db, { path: REPO, name: 'fixture', addedAt: new Date().toISOString(), status: 'pending' });

	let local: ReturnType<typeof directDispatch> | undefined;
	router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed, local: (r, d) => local!(r, d) });
	const attach = router.attach.bind(router);
	router.attach = (threadId: number, p: MessagePort) => {
		channel = p;
		const post = p.postMessage.bind(p);
		p.postMessage = ((m: { method?: string }) => { if (m.method !== undefined) sent.push(m.method); post(m); }) as typeof p.postMessage;
		attach(threadId, p);
	};
	port = new IndexingPortClient(async (method, params) => {
		const result = await router.request('indexing', method, params);
		portCalls.push({ method, result });
		return result;
	}, services.board);
	// The main thread's tables over the port, as main() builds them with daemon threads.
	main = buildHandlerRuntime({
		db, configStore: {} as never, queue: port, indexer: port, startedAt: Date.now(),
		shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
	local = directDispatch(main.rpcHandlers, main.streamHandlers);
	worker = (await startClassWorker(services, router, 'indexing', 'indexing-worker')).worker;
	const deadline = Date.now() + 20_000;
	while ((await findEntitiesByFile(db, join(REPO, 'src', 'a.ts'))).length === 0 || !services.board.snapshot().indexing.idle) {
		if (Date.now() > deadline) assert.fail('the fixture was not indexed');
		await new Promise(r => setTimeout(r, 50));
	}
});
after(async () => {
	// Stopped as shutdown stops it: an exit first, or no drained report within 30 s, fails the teardown.
	await stopWorker(worker, () => pushToWorker(channel, INDEXING_STOP_OP, null), INDEXING_DRAINED);
	await closeLanceConn();
	await closeGraphStore();
	for (const d of [HOME, REPO]) rmSync(d, { recursive: true, force: true });
});

test("codeReview.freshness on the main thread gets the code-indexing worker's codeIndexWorkFor result", async () => {
	portCalls.length = 0;
	const result = await main.rpcHandlers['codeReview.freshness']!({ repo: REPO, epicHash: 'e', storyId: 's1', changedFiles: ['src/a.ts'] }) as {
		isProcessing: boolean; inFlight: boolean; pendingCodeIndexJobs: number;
	};
	const asked = portCalls.filter(c => c.method === INDEXING_PORT.codeIndexWorkFor);
	assert.equal(asked.length, 1, 'freshness asked the worker once');
	const work = asked[0]!.result as { inFlight: boolean; pending: number };
	assert.equal(result.inFlight, work.inFlight);
	assert.equal(result.pendingCodeIndexJobs, work.pending);
	assert.equal(result.isProcessing, work.inFlight || work.pending > 0);
});

test("the main thread's depthForRepo asks the code-indexing worker's queue", async () => {
	portCalls.length = 0;
	assert.equal(await port.depthForRepo(REPO), 0, 'nothing queued for the indexed fixture');
	const asked = portCalls.filter(c => c.method === INDEXING_PORT.depthForRepo);
	assert.equal(asked.length, 1, 'one request to the worker');
	assert.equal(asked[0]!.result, 0);
	// repo.stats through the main thread's tables reads the same answer.
	const stats = await main.rpcHandlers['repo.stats']!({ repoPath: REPO }) as { pendingJobs?: number } | { error: string };
	assert.equal('error' in stats ? stats.error : undefined, undefined);
	assert.equal((stats as { pendingJobs: number }).pendingJobs, 0);
	assert.ok(portCalls.filter(c => c.method === INDEXING_PORT.depthForRepo).length >= 2, 'repo.stats asked the worker too');
});

test('a nested in-daemon call from a step handler to repo.reindex runs on the code-indexing worker', async () => {
	const client = createInDaemonClient(main.rpcHandlers, main.streamHandlers, {
		route: { classOf: methodClasses.classOf, routed, request: (cls, method, params) => router.request(cls, method, params) },
	});
	sent.length = 0;
	assert.deepEqual(await client.request('repo.reindex', { path: REPO }), { ok: true });
	assert.deepEqual(sent, ['repo.reindex'], 'sent to the worker as repo.reindex, not run here (which would have sent an enqueue)');
	await assert.rejects(client.request('repo.reindex', { path: '/no/such/repo' }).then(r => { if ((r as { error?: string }).error) throw new Error((r as { error: string }).error); }), /repo not found/);
	// A session method still runs here.
	sent.length = 0;
	assert.equal(await client.request('repo.resolveForCwd', { cwd: REPO }).then(r => (r as { path: string | null }).path), REPO);
	assert.deepEqual(sent, []);
	const deadline = Date.now() + 20_000;
	while (!services.board.snapshot().indexing.idle && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
});

test("daemon.status queue fields reflect the code-indexing worker's real lanes", async () => {
	// The lanes the worker publishes are what status reports (read from the board, not a local queue).
	services.board.publishLane('index', { depth: 3, processing: true });
	services.board.publishLane('summary', { depth: 2, processing: false }, { repoPath: REPO, done: 1, total: 4 });
	const status = await main.rpcHandlers['daemon.status']!({}) as DaemonStatus;
	assert.equal(status.queueDepth, 5);
	assert.deepEqual(status.queueLanes, queueStatusFromBoard(services.board.snapshot().indexing).queueLanes);
	assert.deepEqual(status.queueLanes, { index: { depth: 3, running: true }, summary: { depth: 2, running: false, sweep: { repoPath: REPO, done: 1, total: 4 } } });
	assert.equal(port.isProcessing, true);
	// And the worker's own publishes replace them: a real job shows, then the lanes settle idle.
	services.board.publishLane('index', { depth: 0, processing: false });
	services.board.publishLane('summary', { depth: 0, processing: false });
	port.enqueue({ kind: 'full', repoPath: REPO });
	let sawRunning = false;
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		const lanes = (await main.rpcHandlers['daemon.status']!({}) as DaemonStatus).queueLanes!;
		if (lanes.index.running || lanes.index.depth > 0) sawRunning = true;
		if (sawRunning && services.board.snapshot().indexing.idle) break;
		await new Promise(r => setTimeout(r, 5));
	}
	assert.ok(sawRunning, 'status showed the worker\'s reindex in the index lane');
	assert.equal((await main.rpcHandlers['daemon.status']!({}) as DaemonStatus).queueDepth, 0);
});

test('No indexing object is constructed on the main thread with the flag on', () => {
	// main() builds IndexQueue, Watcher and IndexerService only on the single-thread branch.
	const src = readFileSync(join(import.meta.dirname, '..', '..', 'index.ts'), 'utf8');
	const threadedBranch = src.slice(src.indexOf('if (threadServices !== undefined && router !== undefined) {\n\t\tconst port'), src.indexOf('\t} else {\n\t\tconst repos = await listRepos(db);'));
	assert.ok(threadedBranch.length > 0, 'the threaded branch is found');
	assert.doesNotMatch(threadedBranch, /new (IndexQueue|Watcher|IndexerService)\(/);
	const elseBranch = src.slice(src.indexOf('\t} else {\n\t\tconst repos = await listRepos(db);'), src.indexOf('// 5b. Boot-time steering refresh'));
	assert.match(elseBranch, /new IndexQueue\(\)/);
	assert.equal((src.match(/new (IndexQueue|Watcher|IndexerService)\(/g) ?? []).length, 3, 'nowhere else in main()');
});
