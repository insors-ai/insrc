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
import { IndexerService } from '../../indexer/index.js';
import { Watcher } from '../../indexer/watcher.js';
import type { Entity } from '../../shared/types.js';
import { IndexingBlock } from './indexing-block.js';
import type { WorkerConnection } from './main-services.js';
import { SummaryWorkerLink } from './summary-link.js';
import { startDaemonWorker } from './worker-entry.js';

const init = workerData as WorkerConnection['workerData'] & { readonly summaryPort: MessagePort };
startDaemonWorker(init);
const block = new IndexingBlock(init.indexingBlock);
const link = new SummaryWorkerLink(init.summaryPort, block);
const db = await getDb();

/**
 * Test-only (INSRC_TEST_STUB_SUMMARISER=1): a summariser that needs no model.
 * It reports each document it summarises, and whether code work was queued at
 * that moment, to the test.
 */
class StubSummaryIndexer extends IndexerService {
	protected override async summariseEntity(entity: Entity): Promise<SummariseDocResult> {
		parentPort!.postMessage({ summarised: entity.id, codeBusy: block.codeBusy });
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
