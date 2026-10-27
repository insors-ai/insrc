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
 *
 * The two speak the shared sc3 envelopes: a summary job is a streaming
 * RequestEnvelope (SUMMARY_JOB) whose frames carry the sweep's progress and
 * whose ReplyEnvelope ends it (with the error when it failed); an edit taken
 * back is a unary RequestEnvelope (SUMMARY_TAKE_EDIT) answered by a
 * ReplyEnvelope carrying the edit or null.
 *
 * When either worker exits, the other end's port closes: the code-indexing
 * worker fails the job in flight and holds the next until a new summary worker
 * is connected; the summary worker abandons its job (its sweep stops between
 * documents, as on shutdown). The main thread then gives the survivor a port
 * to the replacement (SUMMARY_PORT_OP).
 */

import type { MessagePort } from 'node:worker_threads';

import type { IndexJob } from '../../shared/types.js';
import type { IndexerQueue } from '../../indexer/index.js';
import type { ChannelEnvelope, FrameEnvelope, ReplyEnvelope, RequestEnvelope } from './channel.js';
import type { IndexingBlock } from './indexing-block.js';
import type { SummarySweepProgress } from './status-board.js';

type DocEdit = { kind: 'doc-summarise-entity'; entityId: string };

/** The main thread's push to either worker: a port to the other worker's replacement. */
export const SUMMARY_PORT_OP = 'summary.port';

/** The code-indexing worker asks the summary worker to run one summary job (streaming: sweep frames, then the reply). */
export const SUMMARY_JOB = 'summary.job';
/** The summary worker asks the code-indexing worker for the next queued single-document edit (unary). */
export const SUMMARY_TAKE_EDIT = 'summary.takeEdit';

/** A sweep-progress frame of a summary job. */
type SweepFrame = { readonly stream: 'sweep'; readonly data: SummarySweepProgress | null };

/** The code-indexing worker's end: runs summary jobs on the summary worker. */
export class SummaryRunner {
	private seq = 0;
	private readonly pending = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
	private sweep: SummarySweepProgress | undefined;
	/** The live port to the summary worker; undefined between its exit and its replacement's connection. */
	private port: MessagePort | undefined;
	private connected: Promise<MessagePort>;
	private connect: (port: MessagePort) => void = () => {};
	private stopWaiting: (err: Error) => void = () => {};

	constructor(
		port: MessagePort,
		private readonly takeEdit: () => DocEdit | undefined,
		/** Called when the reported sweep progress changes, so the summary lane is republished. */
		private readonly onSweep: () => void,
	) {
		this.connected = Promise.resolve(port);
		this.bind(port);
	}

	/** Connect to a new summary worker (the last one exited). */
	rebind(port: MessagePort): void {
		this.port?.close();
		this.bind(port);
		this.connect(port);
	}

	private bind(port: MessagePort): void {
		this.port = port;
		port.on('message', (m: ChannelEnvelope) => {
			if (m.kind === 'reply') {
				const p = this.pending.get(m.requestId);
				this.pending.delete(m.requestId);
				if (m.error === undefined) p?.resolve(); else p?.reject(new Error(m.error));
			} else if (m.kind === 'frame') {
				if (!this.pending.has(m.requestId)) return;
				this.sweep = (m.frame as SweepFrame).data ?? undefined;
				this.onSweep();
			} else if (m.kind === 'request' && m.method === SUMMARY_TAKE_EDIT) {
				port.postMessage({ kind: 'reply', requestId: m.requestId, result: this.takeEdit() ?? null } satisfies ReplyEnvelope);
			}
		});
		port.on('close', () => {
			if (this.port !== port) return;
			this.port = undefined;
			this.connected = new Promise((resolve, reject) => { this.connect = resolve; this.stopWaiting = reject; });
			this.connected.catch(() => {});
			this.abandon('the document-summary worker is gone');
		});
	}

	/**
	 * Run one summary job on the summary worker; rejects when it fails or the
	 * worker goes. Between a summary worker's exit and its replacement, waits
	 * for the replacement.
	 */
	async run(job: IndexJob): Promise<void> {
		const port = this.port ?? await this.connected;
		const requestId = `summary-job-${++this.seq}`;
		return new Promise<void>((resolve, reject) => {
			this.pending.set(requestId, { resolve, reject });
			port.postMessage({ kind: 'request', requestId, method: SUMMARY_JOB, params: job, stream: true } satisfies RequestEnvelope);
		});
	}

	/** The summary sweep's progress, as the summary worker last reported it. */
	sweepProgress(): SummarySweepProgress | undefined { return this.sweep; }

	/** Shutdown: a job waiting for a replacement summary worker fails instead, so the queue drains. */
	stop(): void {
		this.stopWaiting(new Error('summary job abandoned: the code-indexing worker is stopping'));
	}

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
	private readonly edits = new Map<string, (edit: DocEdit | undefined) => void>();
	private port: MessagePort;
	/** The code-indexing worker that handed over the running job exited: the job stops as on shutdown. */
	private abandoned = false;
	private jobs: { run: (job: IndexJob) => Promise<void>; sweep: () => SummarySweepProgress | undefined } | undefined;

	constructor(port: MessagePort, private readonly block: IndexingBlock) {
		this.port = port;
		this.bind(port);
	}

	/** Connect to a new code-indexing worker (the last one exited). */
	rebind(port: MessagePort): void {
		this.port.close();
		this.port = port;
		this.bind(port);
	}

	private bind(port: MessagePort): void {
		port.on('message', (m: ChannelEnvelope) => {
			if (m.kind === 'reply') {
				const resolve = this.edits.get(m.requestId);
				this.edits.delete(m.requestId);
				resolve?.((m.result as DocEdit | null | undefined) ?? undefined);
			} else if (m.kind === 'request' && m.method === SUMMARY_JOB && this.jobs !== undefined) {
				this.serveJob(port, m, this.jobs.run, this.jobs.sweep);
			}
		});
		port.on('close', () => {
			if (this.port !== port) return;
			this.abandoned = true;
			// No answer will come for an edit asked of the exited worker.
			for (const [id, resolve] of this.edits) { this.edits.delete(id); resolve(undefined); }
		});
	}

	/** Serve the jobs the code-indexing worker hands over, one at a time as the lane sends them. */
	serveJobs(run: (job: IndexJob) => Promise<void>, sweep: () => SummarySweepProgress | undefined): void {
		this.jobs = { run, sweep };
	}

	private serveJob(port: MessagePort, m: RequestEnvelope, run: (job: IndexJob) => Promise<void>, sweep: () => SummarySweepProgress | undefined): void {
		this.abandoned = false;
		let last: string | undefined;
		const report = (): void => {
			const now = sweep();
			const key = JSON.stringify(now ?? null);
			if (key === last) return;
			last = key;
			port.postMessage({ kind: 'frame', requestId: m.requestId, frame: { stream: 'sweep', data: now ?? null } satisfies SweepFrame } satisfies FrameEnvelope);
		};
		const ticker = setInterval(report, 200);
		run(m.params as IndexJob).then(
			() => { clearInterval(ticker); report(); port.postMessage({ kind: 'reply', requestId: m.requestId } satisfies ReplyEnvelope); },
			(err: unknown) => { clearInterval(ticker); report(); port.postMessage({ kind: 'reply', requestId: m.requestId, error: err instanceof Error ? err.message : String(err) } satisfies ReplyEnvelope); },
		);
	}

	// IndexerQueue, as the indexer's summary paths use it.
	enqueue(_job: IndexJob): void {
		throw new Error('the document-summary worker does not enqueue; jobs come from the code-indexing worker');
	}
	takeDocSummaryEdit(): Promise<DocEdit | undefined> {
		const requestId = `summary-edit-${++this.seq}`;
		return new Promise(resolve => {
			this.edits.set(requestId, resolve);
			this.port.postMessage({ kind: 'request', requestId, method: SUMMARY_TAKE_EDIT, params: null, stream: false } satisfies RequestEnvelope);
		});
	}
	get isStopping(): boolean { return this.block.stopping || this.abandoned; }
	get isIndexIdle(): boolean { return !this.block.codeBusy; }
	waitForIndexIdle(): Promise<void> { return this.block.waitForCodeIdle(); }
}
