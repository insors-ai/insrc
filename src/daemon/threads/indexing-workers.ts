/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The two indexing workers under the supervisor (Epic 86197ac6, Story s2):
 * the code-indexing worker and the document-summary worker, joined by a
 * channel of their own. Each start of either worker takes a new channel's
 * end; the other end goes to the live peer (SUMMARY_PORT_OP), or waits for
 * the peer's next start. A code-indexing worker that exits clears the
 * code-busy word, so a summary waiting for code idle goes on (its job was
 * abandoned); its replacement restarts the indexer from the persisted registry.
 */

import { MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { getLogger } from '../../shared/logger.js';
import { pushToWorker } from './channel.js';
import { IndexingBlock } from './indexing-block.js';
import { INDEXING_DRAINED, INDEXING_STOP_OP } from './indexing-port.js';
import { SUMMARY_PORT_OP } from './summary-link.js';
import type { Supervisor } from './supervisor.js';
import type { StartedWorker } from './workers.js';

const log = getLogger('indexing-workers');

export const CODE_INDEXING_WORKER = 'indexing';
export const SUMMARY_WORKER = 'document-summary';

export interface IndexingWorkers {
	/** Both workers' first starts (each logs its own failure). */
	readonly ready: Promise<void>;
	/** Stop the current code-indexing worker's queue and watcher; settles when it reports its drain, or exits. */
	stop(): Promise<void>;
}

export function startIndexingWorkers(workers: Supervisor, indexingBlock: SharedArrayBuffer): IndexingWorkers {
	const waitingEnd = new Map<string, MessagePort>();
	const endFor = (self: string, peer: string): MessagePort => {
		const mine = waitingEnd.get(self);
		if (mine !== undefined) { waitingEnd.delete(self); return mine; }
		const { port1, port2 } = new MessageChannel();
		const live = workers.current(peer);
		if (live !== undefined) pushToWorker(live.port, SUMMARY_PORT_OP, port2, [port2]);
		else { waitingEnd.get(peer)?.close(); waitingEnd.set(peer, port2); }
		return port1;
	};
	// An end that came while the worker was starting goes to it once it is ready.
	const ready = (self: string, what: string) => (started: StartedWorker): void => {
		log.info({ threadId: started.threadId }, `${what} worker ready`);
		const end = waitingEnd.get(self);
		if (end === undefined) return;
		waitingEnd.delete(self);
		pushToWorker(started.port, SUMMARY_PORT_OP, end, [end]);
	};
	const failed = (what: string) => (err: unknown): void => {
		log.error({ err: err instanceof Error ? err.message : String(err) }, `${what} worker did not start`);
	};
	const block = new IndexingBlock(indexingBlock);

	const code = workers.start({
		name: CODE_INDEXING_WORKER, cls: 'indexing', script: 'indexing-worker',
		extra: () => {
			const end = endFor(CODE_INDEXING_WORKER, SUMMARY_WORKER);
			return { workerData: { summaryPort: end }, transferList: [end] };
		},
		started: ready(CODE_INDEXING_WORKER, 'code-indexing'),
		exited: () => block.setCodeBusy(false),
	}).then(() => {}, failed('code-indexing'));
	const summary = workers.start({
		name: SUMMARY_WORKER, script: 'summary-worker',
		extra: () => {
			const end = endFor(SUMMARY_WORKER, CODE_INDEXING_WORKER);
			return { workerData: { summaryPort: end }, transferList: [end] };
		},
		started: ready(SUMMARY_WORKER, 'document-summary'),
	}).then(() => {}, failed('document-summary'));

	return {
		ready: code.then(() => summary),
		stop: () => new Promise<void>(resolve => {
			workers.stop();
			const current = workers.current(CODE_INDEXING_WORKER);
			if (current === undefined) { resolve(); return; }
			current.worker.on('message', m => {
				if (m !== INDEXING_DRAINED) return;
				log.info({ threadId: current.threadId }, 'shutdown: the code-indexing worker drained its queue');
				resolve();
			});
			current.worker.once('exit', () => resolve());
			pushToWorker(current.port, INDEXING_STOP_OP, null);
		}),
	};
}
