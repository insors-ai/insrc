/**
 * When the subsystem pass runs (ISSUE-7d42b5dc). Owned by the IndexerService
 * that owns the index queue -- the code-indexing worker's, or the daemon's
 * when threads are off -- so one object sees every request, every queued and
 * running job and every outcome, even when the pass itself runs on the
 * document-summary worker.
 *
 * Pacing: a subsystems job is queued only when none is queued or in flight
 * for the repository and the last pass's ACTUAL start (the outcome's
 * startedAt, after any hand-over or maintenance wait) is at least
 * SUBSYSTEM_MIN_INTERVAL_MS ago; otherwise the request is remembered and
 * re-applied when the job finishes or the interval elapses. A pass cannot
 * start before it is queued, so consecutive passes start at least the interval
 * apart.
 *
 * Retry: a pass whose summaries failed (and did not stop), or a job that
 * failed outright, re-queues the pass after SUBSYSTEM_RETRY_BASE_MS doubling
 * per consecutive failure, capped at SUBSYSTEM_RETRY_CAP_MS; a clean pass
 * resets it. The retry is an ordinary subsystems job: it waits for code work
 * and runs one model call at a time, as every pass does.
 *
 * Timers are unref'd, do nothing once the queue is stopping, and are cleared
 * by dispose().
 */

import { getLogger } from '../shared/logger.js';

const log = getLogger('subsystem-scheduler');

export const SUBSYSTEM_MIN_INTERVAL_MS = 60_000;
export const SUBSYSTEM_RETRY_BASE_MS = 60_000;
export const SUBSYSTEM_RETRY_CAP_MS = 30 * 60_000;

/** What a finished subsystems job reports. */
export interface SubsystemsOutcome {
	readonly summariesFailed: number;
	readonly stopped:         boolean;
	readonly startedAt:       number;
}

/** The narrow facts the scheduler needs from its owner. */
export interface SubsystemSchedulerHost {
	/** Whether the repository's graph is complete (a pass would group it). */
	readonly graphComplete: (repoPath: string) => Promise<boolean>;
	/** Queue a subsystems job for the repository. */
	readonly enqueue:       (repoPath: string) => void;
	/** The queue is stopping: nothing more is queued. */
	readonly isStopping:    () => boolean;
	/** Time and timers; the real ones by default (a seam for tests). */
	readonly clock?:        SchedulerClock | undefined;
}

/** What the scheduler measures time with. */
export interface SchedulerClock {
	now(): number;
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

const REAL_CLOCK: SchedulerClock = {
	now: () => Date.now(),
	setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; },
	clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface RepoState {
	queued:     boolean;
	inFlight:   boolean;
	lastStart:  number | undefined;
	requested:  boolean;
	failures:   number;
	pacing:     unknown;
	retry:      unknown;
}

export class SubsystemScheduler {
	private readonly repos = new Map<string, RepoState>();
	private disposed = false;

	private readonly clock: SchedulerClock;

	constructor(private readonly host: SubsystemSchedulerHost) {
		this.clock = host.clock ?? REAL_CLOCK;
	}

	private now(): number { return this.clock.now(); }

	private state(repoPath: string): RepoState {
		let st = this.repos.get(repoPath);
		if (st === undefined) {
			st = { queued: false, inFlight: false, lastStart: undefined, requested: false, failures: 0, pacing: undefined, retry: undefined };
			this.repos.set(repoPath, st);
		}
		return st;
	}

	/** A pass is wanted (after a full index, a clean-up or a settle): queue it now or when pacing allows. */
	async request(repoPath: string): Promise<void> {
		if (this.disposed || this.host.isStopping()) return;
		if (!await this.host.graphComplete(repoPath)) return;
		this.admit(repoPath);
	}

	/**
	 * The retry timer fired. On an incomplete graph (code work in progress) the
	 * retry is not dropped -- the work that made it incomplete may end without a
	 * settle (an unchanged file) -- but re-armed at the same delay.
	 */
	private async retryFired(repoPath: string, delay: number): Promise<void> {
		if (this.disposed || this.host.isStopping()) return;
		if (await this.host.graphComplete(repoPath)) { this.admit(repoPath); return; }
		if (this.disposed || this.host.isStopping()) return;
		const st = this.state(repoPath);
		if (st.retry === undefined && !this.disposed) st.retry = this.clock.setTimeout(() => { st.retry = undefined; void this.retryFired(repoPath, delay); }, delay);
	}

	/** Queue the pass now, or remember the request (one is queued or in flight), or arm the pacing timer. */
	private admit(repoPath: string): void {
		// Checked again here: a request that awaited the graph's state may resume after dispose or a stop.
		if (this.disposed || this.host.isStopping()) return;
		const st = this.state(repoPath);
		if (st.queued || st.inFlight) { st.requested = true; return; }
		const wait = st.lastStart === undefined ? 0 : st.lastStart + SUBSYSTEM_MIN_INTERVAL_MS - this.now();
		if (wait > 0) {
			if (st.pacing === undefined) st.pacing = this.clock.setTimeout(() => { st.pacing = undefined; void this.request(repoPath); }, wait);
			return;
		}
		st.queued = true;
		this.host.enqueue(repoPath);
	}

	/** The queue driver begins a subsystems job for the repository. */
	started(repoPath: string): void {
		const st = this.state(repoPath);
		st.queued = false;
		st.inFlight = true;
	}

	/** The job ended: with its outcome, or `undefined` when it failed without one (counted as a failed pass). */
	finished(repoPath: string, outcome: SubsystemsOutcome | undefined): void {
		const st = this.state(repoPath);
		st.inFlight = false;
		st.lastStart = outcome?.startedAt ?? this.now();
		const failed = outcome === undefined || (outcome.summariesFailed > 0 && !outcome.stopped);
		const clean = outcome !== undefined && outcome.summariesFailed === 0 && !outcome.stopped;
		if (failed) {
			st.failures++;
			const delay = Math.min(SUBSYSTEM_RETRY_BASE_MS * 2 ** (st.failures - 1), SUBSYSTEM_RETRY_CAP_MS);
			if (st.retry !== undefined) this.clock.clearTimeout(st.retry);
			if (!this.disposed) st.retry = this.clock.setTimeout(() => { st.retry = undefined; void this.retryFired(repoPath, delay); }, delay);
			log.info({ repo: repoPath, failures: st.failures, retryInMs: delay }, 'subsystem pass: summaries failed; retrying after a back-off');
		} else if (clean) {
			st.failures = 0;
			if (st.retry !== undefined) { this.clock.clearTimeout(st.retry); st.retry = undefined; }
		}
		if (st.requested) { st.requested = false; void this.request(repoPath); }
	}

	/** Clear every timer; nothing is queued afterwards. */
	dispose(): void {
		this.disposed = true;
		for (const st of this.repos.values()) {
			if (st.pacing !== undefined) this.clock.clearTimeout(st.pacing);
			if (st.retry !== undefined) this.clock.clearTimeout(st.retry);
			st.pacing = undefined;
			st.retry = undefined;
		}
	}

	/** Test seam: the armed timers. */
	_timersForTest(): { pacing: number; retry: number } {
		let pacing = 0, retry = 0;
		for (const st of this.repos.values()) { if (st.pacing !== undefined) pacing++; if (st.retry !== undefined) retry++; }
		return { pacing, retry };
	}
}

/** The outcome of a subsystems job as it crosses a boundary (a worker reply), or undefined when it is not one. */
export function asSubsystemsOutcome(value: unknown): SubsystemsOutcome | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const v = value as Record<string, unknown>;
	return typeof v['summariesFailed'] === 'number' && typeof v['stopped'] === 'boolean' && typeof v['startedAt'] === 'number'
		? { summariesFailed: v['summariesFailed'], stopped: v['stopped'], startedAt: v['startedAt'] }
		: undefined;
}
