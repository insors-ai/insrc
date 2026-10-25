/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The indexing port's internal methods (Epic 86197ac6, Story s2): what the
 * main thread (and the document-summary worker) ask of the code-indexing
 * worker, which owns the index queue, the indexer and the watcher. They are
 * served beside the indexing-class methods but are not in the method-class
 * table, so a client socket cannot reach them.
 */

import { getLogger } from '../../shared/logger.js';
import type { IndexJob } from '../../shared/types.js';
import type { CodeIndexWork, RuntimeIndexer, RuntimeQueue } from '../handler-runtime.js';
import type { IndexingStatus, StatusBoard, SummarySweepProgress } from './status-board.js';

const log = getLogger('indexing-port');

export const INDEXING_PORT = {
	enqueue:            'indexing.port.enqueue',
	codeIndexWorkFor:   'indexing.port.codeIndexWorkFor',
	depthForRepo:       'indexing.port.depthForRepo',
	addRepo:            'indexing.port.addRepo',
	removeRepo:         'indexing.port.removeRepo',
	takeDocSummaryEdit: 'indexing.port.takeDocSummaryEdit',
} as const;

/** The main thread tells the code-indexing worker to stop its queue and watcher (shutdown). */
export const INDEXING_STOP_OP = 'indexing.stop';
/** The code-indexing worker reports that its queue has drained after a stop. */
export const INDEXING_DRAINED = 'indexing-drained';

/**
 * The main thread's port to the code-indexing worker, in place of the queue,
 * indexer and watcher it no longer hosts: the queue's depth, lanes and the
 * summary sweep are read from the status board (synchronously); everything
 * else is a request to the worker.
 */
export class IndexingPortClient implements RuntimeQueue, RuntimeIndexer {
	constructor(
		private readonly request: (method: string, params: unknown) => Promise<unknown>,
		private readonly board: StatusBoard,
	) {}

	private get indexing(): IndexingStatus { return this.board.snapshot().indexing; }

	get depth(): number { return this.indexing.index.depth + this.indexing.summary.depth; }
	get isProcessing(): boolean { return this.indexing.index.processing || this.indexing.summary.processing; }

	laneStatus(): { index: { depth: number; running: boolean }; summary: { depth: number; running: boolean } } {
		const { index, summary } = this.indexing;
		return { index: { depth: index.depth, running: index.processing }, summary: { depth: summary.depth, running: summary.processing } };
	}

	summarySweepProgress(): SummarySweepProgress | undefined { return this.indexing.sweep; }

	/** Fire-and-forget, as IndexQueue.enqueue is; a failure is logged. */
	enqueue(job: IndexJob): void {
		this.request(INDEXING_PORT.enqueue, job).catch((err: unknown) => {
			log.warn({ kind: job.kind, err: err instanceof Error ? err.message : String(err) }, 'indexing port: an enqueue did not reach the code-indexing worker');
		});
	}

	async codeIndexWorkFor(repoPath: string): Promise<CodeIndexWork> {
		return await this.request(INDEXING_PORT.codeIndexWorkFor, { repoPath }) as CodeIndexWork;
	}

	/** repo.stats, its only caller, runs on the code-indexing worker against the real queue. */
	depthForRepo(_repoPath: string): number {
		throw new Error('depthForRepo is answered on the code-indexing worker; ask it with INDEXING_PORT.depthForRepo');
	}

	async addRepo(repoPath: string): Promise<void> { await this.request(INDEXING_PORT.addRepo, { repoPath }); }
	async removeRepo(repoPath: string): Promise<void> { await this.request(INDEXING_PORT.removeRepo, { repoPath }); }
}
