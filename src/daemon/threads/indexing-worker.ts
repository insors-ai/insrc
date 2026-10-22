/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The code-indexing worker (Epic 86197ac6, Story s2): hosts the index queue
 * (both lanes), the watcher and the indexer as the daemon's main thread did,
 * serves every indexing-class method and the indexing port's internal
 * methods, and publishes the index lanes and the store slot (the repositories
 * with their completeness, and the unattributed count) on the status board —
 * before its queue starts and after every change.
 */

import { parentPort, workerData } from 'node:worker_threads';

import { ConfigStore } from '../../config/store.js';
import { getDb } from '../../db/client.js';
import { listRepos } from '../../db/repos.js';
import { IndexerService } from '../../indexer/index.js';
import { Watcher } from '../../indexer/watcher.js';
import { getLogger } from '../../shared/logger.js';
import type { IndexJob } from '../../shared/types.js';
import { buildHandlerRuntime } from '../handler-runtime.js';
import { IndexQueue } from '../queue.js';
import { unattributedUnwritable, withCompleteness } from '../repo-completeness.js';
import { directDispatch } from '../server.js';
import type { RpcHandlers } from '../server.js';
import { INDEXING_DRAINED, INDEXING_PORT, INDEXING_STOP_OP } from './indexing-port.js';
import { SHUTDOWN_OP } from './main-services.js';
import type { WorkerConnection } from './main-services.js';
import { methodClasses } from './method-class.js';
import { StatusBoardClient } from './status-board.js';
import { startDaemonWorker } from './worker-entry.js';
import { serveRequests } from './worker-requests.js';

const log = getLogger('indexing-worker');

const init = workerData as WorkerConnection['workerData'];
const hub = startDaemonWorker(init);
const board = new StatusBoardClient(hub);

const db = await getDb();
const configStore = new ConfigStore(db);
const watcher = new Watcher();
let indexer: IndexerService | undefined;
const queue = new IndexQueue({
	indexingBlock: init.indexingBlock,
	publishLane: (lane, status, sweep) => board.publishLane(lane, status, sweep),
	sweepProgress: () => indexer?.summarySweepProgress(),
});
indexer = new IndexerService(db, queue, watcher, configStore);
const service = indexer;

/** Publish the store slot; publishes run one after another, so the board never goes back to an older list. */
let publishing: Promise<void> = Promise.resolve();
function publishStore(): Promise<void> {
	publishing = publishing.then(async () => {
		try {
			board.publishStore({
				repos: await withCompleteness(await listRepos(db), r => r.path),
				unattributedUnwritable: await unattributedUnwritable(),
				publishedAt: Date.now(),
			});
		} catch (err) {
			log.warn({ err: err instanceof Error ? err.message : String(err) }, 'indexing worker: the store slot could not be published');
		}
	});
	return publishing;
}

// The indexing-class methods, as the daemon's handler runtime builds them over this worker's queue and indexer.
const runtime = buildHandlerRuntime({
	db, configStore, queue, indexer: service, startedAt: Date.now(),
	shutdown: reason => hub.send(SHUTDOWN_OP, reason),
	attachedClients: () => [],
	understandingService: () => undefined,
});
const table: RpcHandlers = {};
for (const entry of methodClasses.entries()) {
	if (entry.cls !== 'indexing') continue;
	const handler = runtime.rpcHandlers[entry.method];
	if (handler === undefined) continue;
	// After each one, the registry or the queue may have changed.
	table[entry.method] = async (params) => {
		try { return await handler(params); } finally { void publishStore(); }
	};
}
// Compaction closes the graph environment, which every daemon thread holds
// open; it is run by the main thread's maintenance (Epic 86197ac6 s2/t16). The
// busy refusal is today's.
table['daemon.compact'] = async () => {
	if (queue.depth > 0 || queue.isProcessing) {
		throw new Error(
			`daemon.compact: indexer is busy (queue=${queue.depth}, ` +
			`processing=${queue.isProcessing}). Wait for indexing to ` +
			`drain before compacting.`,
		);
	}
	throw new Error('daemon.compact: compaction with daemon threads runs through maintenance, which is not available yet');
};

// The indexing port: what the main thread and the summary worker ask of this worker.
Object.assign(table, {
	[INDEXING_PORT.enqueue]: async (job: unknown) => { queue.enqueue(job as IndexJob); return { ok: true }; },
	[INDEXING_PORT.codeIndexWorkFor]: async (p: unknown) => queue.codeIndexWorkFor((p as { repoPath: string }).repoPath),
	[INDEXING_PORT.depthForRepo]: async (p: unknown) => queue.depthForRepo((p as { repoPath: string }).repoPath),
	[INDEXING_PORT.addRepo]: async (p: unknown) => { await service.addRepo((p as { repoPath: string }).repoPath); void publishStore(); return { ok: true }; },
	[INDEXING_PORT.removeRepo]: async (p: unknown) => { await service.removeRepo((p as { repoPath: string }).repoPath); void publishStore(); return { ok: true }; },
	[INDEXING_PORT.takeDocSummaryEdit]: async () => queue.takeDocSummaryEdit() ?? null,
} satisfies RpcHandlers);

serveRequests(init.hubPort, directDispatch(table));

// The store slot before the queue starts, so the admin worker's first status has it.
await publishStore();
await service.start(await listRepos(db));
const queueDone = queue.start(async job => {
	try { await service.processJob(job); } finally { void publishStore(); }
});

// Shutdown: stop the queue and the watcher, and report once both are done.
// The watcher's close is awaited: a native watcher call still running when
// the worker's environment is torn down aborts the whole process.
hub.onPush(INDEXING_STOP_OP, async () => {
	queue.stop();
	await watcher.close();
	await queueDone;
	parentPort!.postMessage(INDEXING_DRAINED);
});

parentPort!.postMessage('worker-ready');
