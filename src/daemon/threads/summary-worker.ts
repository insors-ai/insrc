/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The document-summary worker (Epic 86197ac6, Story s2): runs the summary jobs
 * the code-indexing worker's summary lane hands it, with the indexer's
 * summary paths, so a summary's model work never holds up code indexing. It
 * still starts a summary only while code indexing is idle: the code-busy word
 * in the indexing shared block says so, without a request.
 */

import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import type { SummariseDocResult } from '../../analyze/summariser/index.js';
import { ConfigStore } from '../../config/store.js';
import { getDb } from '../../db/client.js';
import { withWriteTxn } from '../../db/graph/store.js';
import { IndexerService } from '../../indexer/index.js';
import { Watcher } from '../../indexer/watcher.js';
import type { Entity } from '../../shared/types.js';
import { IndexingBlock } from './indexing-block.js';
import type { WorkerConnection } from './main-services.js';
import { SUMMARY_PORT_OP, SummaryWorkerLink } from './summary-link.js';
import { startDaemonWorker } from './worker-entry.js';
import { TEST_EXIT_METHOD } from './worker-requests.js';

const init = workerData as WorkerConnection['workerData'] & { readonly summaryPort: MessagePort };
const hub = startDaemonWorker(init);
const block = new IndexingBlock(init.indexingBlock);
const link = new SummaryWorkerLink(init.summaryPort, block);
// The code-indexing worker was replaced: a port to the new one.
hub.onPush(SUMMARY_PORT_OP, port => { link.rebind(port as MessagePort); });
// Test-only (INSRC_TEST_HOOKS=1): exit with code 1 at once, as a crash mid-summary.
if (process.env['INSRC_TEST_HOOKS'] === '1') hub.onPush(TEST_EXIT_METHOD, () => process.exit(1));
const db = await getDb();

/**
 * Test-only (INSRC_TEST_STUB_SUMMARISER=1): a summariser that needs no model.
 * It reports each document it summarises, and whether code work was queued at
 * that moment, to the test, and records it in the store (meta `test-summary:<id>`).
 */
class StubSummaryIndexer extends IndexerService {
	protected override async summariseEntity(entity: Entity): Promise<SummariseDocResult> {
		parentPort!.postMessage({ summarised: entity.id, codeBusy: block.codeBusy });
		// A real write from this thread, so a test can see it land (e.g. in the store maintenance compacted).
		await withWriteTxn(s => { s.meta.put(`test-summary:${entity.id}`, Buffer.from([1])); });
		await new Promise(r => setTimeout(r, 20));
		return { ok: true };
	}
}

// The indexer's watcher is never started here: the code-indexing worker watches.
const indexer = process.env['INSRC_TEST_STUB_SUMMARISER'] === '1'
	? new StubSummaryIndexer(db, link, new Watcher(), new ConfigStore(db))
	: new IndexerService(db, link, new Watcher(), new ConfigStore(db));

link.serveJobs(job => indexer.processJob(job), () => indexer.summarySweepProgress());
parentPort!.postMessage('worker-ready');
