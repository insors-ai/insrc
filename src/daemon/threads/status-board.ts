/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Thread status board (Epic 86197ac6, Story s1, contract sc4): the record every
 * thread updates as it works, so the admin thread can answer status, debug
 * status, liveness and run polls without calling into a busy thread or
 * touching a store. Lives on the main thread; workers publish with one-way hub
 * messages (ordered per port) and read a snapshot with one hub request.
 */

import type { AttachedClient, RegisteredRepo, RepoCompleteness, ThreadRole, UnattributedUnwritableCount } from '../../shared/types.js';
import type { IndexRunView } from '../../indexer/run-record.js';
import { getLogger } from '../../shared/logger.js';
import type { HubClient, HubHandlers, MethodClass, SessionId } from './channel.js';

const log = getLogger('status-board');

export interface ThreadStatus {
	readonly threadId: number;
	readonly cls: MethodClass | 'router';
	readonly session?: SessionId | undefined;
	readonly busy: boolean;
	readonly method?: string | undefined;
	readonly since?: number | undefined;
	readonly queued: number;
	/** What the thread is for (an additive sc4 field, s4 AMD-86197ac660732ceb-2). */
	readonly role?: ThreadRole | undefined;
}
export interface LaneStatus { readonly depth: number; readonly processing: boolean; }
export interface SummarySweepProgress { readonly repoPath: string; readonly done: number; readonly total: number; }
export interface IndexingStatus {
	readonly index: LaneStatus;
	readonly summary: LaneStatus;
	readonly sweep?: SummarySweepProgress | undefined;
	readonly idle: boolean;
}
/** The existing AttachedClient shape from the server, lastMethod included. */
export type AttachedClientSnapshot = AttachedClient;
/**
 * Today's shapes from src/shared/types.ts, published unchanged. completeness is
 * optional because today's withCompleteness leaves it out when its read fails
 * (an sc4 amendment delivered by s2), so a published row equals today's row.
 */
export type RepoStatusSnapshot = RegisteredRepo & { readonly completeness?: RepoCompleteness | undefined };
export interface StoreStatusSnapshot {
	/** undefined until first published; responses then mark the value unavailable. */
	readonly repos?: readonly RepoStatusSnapshot[] | undefined;
	readonly unattributedUnwritable?: UnattributedUnwritableCount | undefined;
	readonly publishedAt: number;
}
export interface RunRecord {
	readonly runId: string;
	readonly status: 'running' | 'done' | 'error' | 'aborted';
	readonly ownerThreadId: number;
	readonly startedAt: number;
	readonly model: string;
	/** The append-only progress sequence a poll slices from its cursor. */
	readonly frames: readonly unknown[];
	readonly result?: unknown;
	readonly error?: string | undefined;
}
export interface StatusSnapshot {
	readonly threads: readonly ThreadStatus[];
	readonly indexing: IndexingStatus;
	readonly clients: readonly AttachedClientSnapshot[];
	readonly runs: readonly RunRecord[];
	readonly store: StoreStatusSnapshot;
}

/**
 * Cap on the run records the board keeps, over every owner thread: the oldest terminal ones
 * go first, a running one never. It is the run registry's own cap, so the daemon retains as
 * many runs as a single thread did; without it, a released worker's finished runs would stay.
 */
export const MAX_RUNS = 64;

const IDLE_INDEXING: IndexingStatus = { index: { depth: 0, processing: false }, summary: { depth: 0, processing: false }, idle: true };

export class StatusBoard {
	private readonly threads = new Map<number, ThreadStatus>();
	private readonly runs = new Map<string, RunRecord>();
	/** Live analyze runs and the thread running each (Story 5d393a4b). */
	private readonly analyzeRuns = new Map<string, number>();
	private indexing: IndexingStatus = IDLE_INDEXING;
	private clients: readonly AttachedClientSnapshot[] = [];
	private store: StoreStatusSnapshot = { publishedAt: 0 };
	private indexRunList: readonly IndexRunView[] = [];
	private indexRunsListener: ((runs: readonly IndexRunView[]) => void) | undefined;
	private laneBusyAt: number | undefined;

	constructor(private readonly now: () => number = Date.now) {}

	publish(status: ThreadStatus): void { this.threads.set(status.threadId, status); }
	publishIndexing(status: IndexingStatus): void { this.setIndexing(status); }
	/**
	 * When an indexing lane was last seen with work (a publish while busy, or the one that
	 * ended its work): work that came and went between two reads of the board still shows.
	 */
	lastLaneActivityAt(): number | undefined { return this.laneBusyAt; }
	private setIndexing(next: IndexingStatus): void {
		if (!this.indexing.idle || !next.idle) this.laneBusyAt = this.now();
		this.indexing = next;
	}
	/**
	 * One indexing worker publishes only its own lane (an additive sc4 method
	 * delivered by s2): the board keeps both, the summary lane's publisher also
	 * sets the sweep (absent clears it), and idle is both lanes empty and idle.
	 */
	publishLane(lane: 'index' | 'summary', status: LaneStatus, sweep?: SummarySweepProgress): void {
		const index = lane === 'index' ? status : this.indexing.index;
		const summary = lane === 'summary' ? status : this.indexing.summary;
		const kept = lane === 'summary' ? sweep : this.indexing.sweep;
		const idle = index.depth === 0 && !index.processing && summary.depth === 0 && !summary.processing;
		this.setIndexing({ index, summary, idle, ...(kept !== undefined ? { sweep: kept } : {}) });
	}
	publishClients(clients: readonly AttachedClientSnapshot[]): void { this.clients = clients; }
	publishStore(store: StoreStatusSnapshot): void { this.store = store; }
	/** The running full indexes, as the code-indexing worker last published them (an additive s2 slot). */
	publishIndexRuns(runs: readonly IndexRunView[]): void { this.indexRunList = runs; this.indexRunsListener?.(runs); }
	/** The running full indexes as last published. */
	indexRuns(): readonly IndexRunView[] { return this.indexRunList; }
	/** Told of every publish of the running full indexes (the main thread forwards them to the session workers, s3). */
	onIndexRuns(fn: ((runs: readonly IndexRunView[]) => void) | undefined): void { this.indexRunsListener = fn; }
	indexRun(repoPath: string): IndexRunView | undefined { return this.indexRunList.find(r => r.repoPath === repoPath); }

	/** Inserts or replaces the record with that runId; a record whose frames would shrink is refused. */
	publishRun(run: RunRecord): void {
		const prior = this.runs.get(run.runId);
		if (prior !== undefined && run.frames.length < prior.frames.length) {
			log.warn({ runId: run.runId, had: prior.frames.length, got: run.frames.length }, 'status board: refused a run record whose frames would shrink');
			return;
		}
		this.runs.set(run.runId, run);
		if (this.runs.size <= MAX_RUNS) return;
		const terminal = [...this.runs.values()].filter(r => r.status !== 'running').sort((a, b) => a.startedAt - b.startedAt);
		for (const r of terminal) {
			if (this.runs.size <= MAX_RUNS) break;
			this.runs.delete(r.runId);
		}
	}

	/** The owner thread exited (s3): each of its runs still running ends 'error' with `error`, keeping its frames. */
	failRunsOwnedBy(threadId: number, error: string): void {
		for (const run of this.runs.values()) {
			if (run.ownerThreadId === threadId && run.status === 'running') this.runs.set(run.runId, { ...run, status: 'error', error });
		}
	}

	/** Remove a run the owner's retention evicted (an additive sc4 method, s3); a later poll for it answers 'unknown'. */
	forgetRun(runId: string): void { this.runs.delete(runId); }

	/** An analyze run started (live) or stopped on `threadId`; a stop from another thread leaves a later owner in place. */
	markAnalyzeRun(runId: string, threadId: number, live: boolean): void {
		if (live) this.analyzeRuns.set(runId, threadId);
		else if (this.analyzeRuns.get(runId) === threadId) this.analyzeRuns.delete(runId);
	}
	/** The thread running the analyze run `runId`, if it is live anywhere. */
	analyzeRunOwner(runId: string): number | undefined { return this.analyzeRuns.get(runId); }
	/** The thread exited or was released: none of its analyze runs is live any more. */
	forgetAnalyzeRunsOf(threadId: number): void {
		for (const [runId, owner] of this.analyzeRuns) if (owner === threadId) this.analyzeRuns.delete(runId);
	}

	/** Remove a thread's status (its worker exited or was released). */
	forget(threadId: number): void { this.threads.delete(threadId); }

	snapshot(): StatusSnapshot {
		return {
			threads:  [...this.threads.values()],
			indexing: this.indexing,
			clients:  this.clients,
			runs:     [...this.runs.values()],
			store:    this.store,
		};
	}
}

// ---------------------------------------------------------------------------
// Hub bindings
// ---------------------------------------------------------------------------

const OPS = {
	publish: 'board.publish', publishIndexing: 'board.publishIndexing', publishLane: 'board.publishLane', publishClients: 'board.publishClients',
	publishRun: 'board.publishRun', forgetRun: 'board.forgetRun', publishStore: 'board.publishStore', snapshot: 'board.snapshot',
	publishIndexRuns: 'board.publishIndexRuns', markAnalyzeRun: 'board.markAnalyzeRun',
} as const;

/** The main thread's hub services for the board. */
export function statusBoardHubHandlers(board: StatusBoard): HubHandlers {
	return {
		[OPS.publish]:         a => board.publish(a as ThreadStatus),
		[OPS.publishIndexing]: a => board.publishIndexing(a as IndexingStatus),
		[OPS.publishLane]:     a => { const { lane, status, sweep } = a as { lane: 'index' | 'summary'; status: LaneStatus; sweep?: SummarySweepProgress }; board.publishLane(lane, status, sweep); },
		[OPS.publishClients]:  a => board.publishClients(a as readonly AttachedClientSnapshot[]),
		[OPS.publishRun]:      a => board.publishRun(a as RunRecord),
		[OPS.forgetRun]:       a => board.forgetRun(a as string),
		[OPS.publishStore]:    a => board.publishStore(a as StoreStatusSnapshot),
		[OPS.snapshot]:        () => board.snapshot(),
		[OPS.publishIndexRuns]: a => board.publishIndexRuns(a as readonly IndexRunView[]),
		[OPS.markAnalyzeRun]:  a => { const { runId, threadId, live } = a as { runId: string; threadId: number; live: boolean }; board.markAnalyzeRun(runId, threadId, live); },
	};
}

/** A worker's view of the board: publishes are one-way, a snapshot is one hub request. */
export class StatusBoardClient {
	constructor(private readonly hub: HubClient) {}
	publish(status: ThreadStatus): void { this.hub.send(OPS.publish, status); }
	publishIndexing(status: IndexingStatus): void { this.hub.send(OPS.publishIndexing, status); }
	publishLane(lane: 'index' | 'summary', status: LaneStatus, sweep?: SummarySweepProgress): void {
		this.hub.send(OPS.publishLane, { lane, status, ...(sweep !== undefined ? { sweep } : {}) });
	}
	publishClients(clients: readonly AttachedClientSnapshot[]): void { this.hub.send(OPS.publishClients, clients); }
	publishRun(run: RunRecord): void { this.hub.send(OPS.publishRun, run); }
	forgetRun(runId: string): void { this.hub.send(OPS.forgetRun, runId); }
	publishStore(store: StoreStatusSnapshot): void { this.hub.send(OPS.publishStore, store); }
	publishIndexRuns(runs: readonly IndexRunView[]): void { this.hub.send(OPS.publishIndexRuns, runs); }
	markAnalyzeRun(runId: string, threadId: number, live: boolean): void { this.hub.send(OPS.markAnalyzeRun, { runId, threadId, live }); }
	snapshot(): Promise<StatusSnapshot> { return this.hub.request<StatusSnapshot>(OPS.snapshot, null); }
}
