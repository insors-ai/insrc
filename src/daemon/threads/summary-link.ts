/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The channel between the code-indexing worker and the document-summary worker
 * (Epic 86197ac6, Story s2). The queue, with both lanes, stays on the
 * code-indexing worker; its summary lane hands each summary job to the
 * summary worker here and waits for it, so lane order and the summary's yield
 * to code work are the queue's own. The summary worker asks back for the
 * single-document edits queued meanwhile, and reports its sweep's progress,
 * which the code-indexing worker publishes with the summary lane.
 */

import type { MessagePort } from 'node:worker_threads';

import type { IndexJob } from '../../shared/types.js';
import type { IndexerQueue } from '../../indexer/index.js';
import type { IndexingBlock } from './indexing-block.js';
import type { SummarySweepProgress } from './status-board.js';

type DocEdit = { kind: 'doc-summarise-entity'; entityId: string };

type ToSummary =
	| { readonly t: 'job'; readonly id: number; readonly job: IndexJob }
	| { readonly t: 'edit'; readonly id: number; readonly edit: DocEdit | null };
type ToCode =
	| { readonly t: 'done'; readonly id: number; readonly error?: string | undefined }
	| { readonly t: 'take-edit'; readonly id: number }
	| { readonly t: 'sweep'; readonly sweep: SummarySweepProgress | null };

/** The code-indexing worker's end: runs summary jobs on the summary worker. */
export class SummaryRunner {
	private seq = 0;
	private readonly pending = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();
	private sweep: SummarySweepProgress | undefined;

	constructor(
		private readonly port: MessagePort,
		private readonly takeEdit: () => DocEdit | undefined,
		/** Called when the reported sweep progress changes, so the summary lane is republished. */
		private readonly onSweep: () => void,
	) {
		port.on('message', (m: ToCode) => {
			if (m.t === 'done') {
				const p = this.pending.get(m.id);
				this.pending.delete(m.id);
				if (m.error === undefined) p?.resolve(); else p?.reject(new Error(m.error));
			} else if (m.t === 'take-edit') {
				port.postMessage({ t: 'edit', id: m.id, edit: this.takeEdit() ?? null } satisfies ToSummary);
			} else if (m.t === 'sweep') {
				this.sweep = m.sweep ?? undefined;
				this.onSweep();
			}
		});
		port.on('close', () => this.abandon('the document-summary worker is gone'));
	}

	/** Run one summary job on the summary worker; rejects when it fails or the worker goes. */
	run(job: IndexJob): Promise<void> {
		const id = ++this.seq;
		return new Promise<void>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.port.postMessage({ t: 'job', id, job } satisfies ToSummary);
		});
	}

	/** The summary sweep's progress, as the summary worker last reported it. */
	sweepProgress(): SummarySweepProgress | undefined { return this.sweep; }

	/** Fail every job in flight (the summary worker exited); the summary lane goes on, as after a failed summary. */
	abandon(why: string): void {
		for (const [id, p] of this.pending) {
			this.pending.delete(id);
			p.reject(new Error(`summary job abandoned: ${why}`));
		}
		if (this.sweep !== undefined) { this.sweep = undefined; this.onSweep(); }
	}
}

/**
 * The summary worker's end: the indexer's queue view (the code-busy and
 * stopping words from the shared block, edits taken from the code-indexing
 * worker's queue) and the job runner.
 */
export class SummaryWorkerLink implements IndexerQueue {
	private seq = 0;
	private readonly edits = new Map<number, (edit: DocEdit | undefined) => void>();

	constructor(private readonly port: MessagePort, private readonly block: IndexingBlock) {
		port.on('message', (m: ToSummary) => {
			if (m.t !== 'edit') return;
			const resolve = this.edits.get(m.id);
			this.edits.delete(m.id);
			resolve?.(m.edit ?? undefined);
		});
	}

	/** Serve the jobs the code-indexing worker hands over, one at a time as the lane sends them. */
	serveJobs(run: (job: IndexJob) => Promise<void>, sweep: () => SummarySweepProgress | undefined): void {
		this.port.on('message', (m: ToSummary) => {
			if (m.t !== 'job') return;
			let last: string | undefined;
			const report = (): void => {
				const now = sweep();
				const key = JSON.stringify(now ?? null);
				if (key === last) return;
				last = key;
				this.port.postMessage({ t: 'sweep', sweep: now ?? null } satisfies ToCode);
			};
			const ticker = setInterval(report, 200);
			run(m.job).then(
				() => { clearInterval(ticker); report(); this.port.postMessage({ t: 'done', id: m.id } satisfies ToCode); },
				(err: unknown) => { clearInterval(ticker); report(); this.port.postMessage({ t: 'done', id: m.id, error: err instanceof Error ? err.message : String(err) } satisfies ToCode); },
			);
		});
	}

	// IndexerQueue, as the indexer's summary paths use it.
	enqueue(_job: IndexJob): void {
		throw new Error('the document-summary worker does not enqueue; jobs come from the code-indexing worker');
	}
	takeDocSummaryEdit(): Promise<DocEdit | undefined> {
		const id = ++this.seq;
		return new Promise(resolve => {
			this.edits.set(id, resolve);
			this.port.postMessage({ t: 'take-edit', id } satisfies ToCode);
		});
	}
	get isStopping(): boolean { return this.block.stopping; }
	get isIndexIdle(): boolean { return !this.block.codeBusy; }
	waitForIndexIdle(): Promise<void> { return this.block.waitForCodeIdle(); }
}
