import { sep } from 'node:path';
import type { IndexJob } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';
import { LmdbStoreLocksLostError, recordStoreFailureIfLockError } from '../db/graph/store.js';
import { IndexingBlock } from './threads/indexing-block.js';
import type { LaneStatus, SummarySweepProgress } from './threads/status-board.js';

const log = getLogger('queue');

type JobProcessor = (job: IndexJob) => Promise<void>;

/** The two lanes: document summaries, and everything else. */
type LaneName = 'index' | 'summary';

/** How a queue on the code-indexing worker reports its state to other threads (Epic 86197ac6 s2). */
export interface IndexQueueOptions {
  /** The indexing shared block: the queue writes its code-busy and stopping words at every change. */
  readonly indexingBlock?: SharedArrayBuffer | undefined;
  /** Publishes one lane's depth and processing state (the status board's publishLane). */
  readonly publishLane?: ((lane: LaneName, status: LaneStatus, sweep?: SummarySweepProgress) => void) | undefined;
  /** The running summary sweep's progress, published with the summary lane. */
  readonly sweepProgress?: (() => SummarySweepProgress | undefined) | undefined;
}

/** One lane: its own FIFO, its own drain loop and its own in-flight job. */
interface Lane {
  readonly jobs: IndexJob[];
  /** The job `processor` is running in this lane, for the duration of the call. */
  inFlight: IndexJob | null;
  resolve:  (() => void) | null;
}

/** Document-summary jobs call the local model (about 30 s each): they run in their own lane. */
const isSummaryJob = (job: IndexJob): boolean =>
  job.kind === 'doc-summarise-repo' || job.kind === 'doc-summarise-entity';

/**
 * In-memory queue for IndexJob items, in two lanes that run at the same time
 * (Story b94cf2c9 S001): the summary lane holds the document-summary jobs and
 * the index lane every other kind, so code indexing never waits behind a
 * summary sweep. Each lane runs its jobs one at a time, in order; in the
 * summary lane a single-document job goes ahead of a queued sweep.
 *
 * The summary lane yields to code work (Story 0f0e4f45, after measured model
 * contention): it starts a summary only while the index lane is idle, so the
 * two lanes reach the local model together only for the one summary already
 * in progress when code work arrives.
 *
 * Deduplication (within a lane): `full` jobs dedup by repo, `file` and
 * `config-file` jobs dedup by path (latest event wins), `config-full`/
 * `config-reindex` dedup by scope. `reembed` jobs are never deduplicated.
 */
export class IndexQueue {
  private readonly lanes: Record<LaneName, Lane> = {
    index:   { jobs: [], inFlight: null, resolve: null },
    summary: { jobs: [], inFlight: null, resolve: null },
  };
  private stopped = false;
  /** Waiters of waitForIndexIdle, released when the index lane goes idle or on stop(). */
  private indexIdleWaiters: (() => void)[] = [];
  private paused = false;
  /** Drain loops held by pause(), released by resume() or stop(). */
  private resumeWaiters: (() => void)[] = [];
  /** pause() callers waiting for the jobs in flight to finish. */
  private quietWaiters: (() => void)[] = [];
  private readonly block: IndexingBlock | undefined;
  private readonly publish: IndexQueueOptions['publishLane'];
  private readonly sweepProgress: IndexQueueOptions['sweepProgress'];

  constructor(opts: IndexQueueOptions = {}) {
    this.block = opts.indexingBlock !== undefined ? new IndexingBlock(opts.indexingBlock) : undefined;
    this.publish = opts.publishLane;
    this.sweepProgress = opts.sweepProgress;
  }

  /**
   * Report a change to a lane: the code-busy word and the lane's published
   * state. Called at every change, and by the summary sweep's owner when its
   * progress moves (lanesChanged).
   */
  private changed(name: LaneName): void {
    this.block?.setCodeBusy(!this.isIndexIdle);
    if (this.publish === undefined) return;
    const lane = this.lanes[name];
    const status: LaneStatus = { depth: lane.jobs.length, processing: lane.inFlight !== null };
    if (name === 'summary') this.publish('summary', status, this.sweepProgress?.());
    else this.publish('index', status);
  }

  /** Republish the summary lane, e.g. when the sweep's progress moved. */
  lanesChanged(): void { this.changed('summary'); }

  private laneFor(job: IndexJob): Lane { return this.lanes[isSummaryJob(job) ? 'summary' : 'index']; }

  /** Every queued job, both lanes. */
  private get queued(): IndexJob[] { return [...this.lanes.index.jobs, ...this.lanes.summary.jobs]; }

  /** Current number of pending jobs, both lanes. */
  get depth(): number { return this.lanes.index.jobs.length + this.lanes.summary.jobs.length; }

  /**
   * Pending jobs attributable to one repo (Story repo-stats / S001). Counts a
   * queued job when it names `repoPath` directly (`full` / `reembed` /
   * `reconcile` / `doc-summarise-repo`) or its `filePath` lives under `repoPath` (`file` /
   * `config-file`). Repo-agnostic jobs (`config-full` / `config-reindex` /
   * `doc-summarise-entity`) never count. Read-only over the in-memory queue;
   * the private `queue` array is not exposed.
   */
  depthForRepo(repoPath: string): number {
    const prefix = repoPath.endsWith(sep) ? repoPath : repoPath + sep;
    let n = 0;
    for (const job of this.queued) {
      switch (job.kind) {
        case 'full':
        case 'reembed':
        case 'reconcile':
        case 'doc-summarise-repo':
          if (job.repoPath === repoPath) n++;
          break;
        case 'file':
        case 'config-file':
          if (job.filePath === repoPath || job.filePath.startsWith(prefix)) n++;
          break;
        default:
          break; // config-full / config-reindex / doc-summarise-entity: not per-repo
      }
    }
    return n;
  }

  /**
   * The code-graph work queued or running for one repo (ISSUE-1102dc71): a
   * `full` or `reconcile` job naming `repoPath`, or a `file` job under it. A
   * code review waits only on this; other repos, config, re-embed and document
   * summary jobs do not change the repo's code graph. Read-only; separate from
   * `depthForRepo`, which counts every per-repo kind.
   */
  codeIndexWorkFor(repoPath: string): { inFlight: boolean; pending: number } {
    const prefix = repoPath.endsWith(sep) ? repoPath : repoPath + sep;
    const isCodeIndexWork = (job: IndexJob): boolean => {
      switch (job.kind) {
        case 'full':
        case 'reconcile':
          return job.repoPath === repoPath;
        case 'file':
          return job.filePath === repoPath || job.filePath.startsWith(prefix);
        default:
          return false;
      }
    };
    // Code-graph work only ever runs in the index lane.
    const lane = this.lanes.index;
    return {
      inFlight: lane.inFlight !== null && isCodeIndexWork(lane.inFlight),
      pending:  lane.jobs.filter(isCodeIndexWork).length,
    };
  }

  /** Add a job to the end of the queue. */
  enqueue(job: IndexJob): void {
    if (this.stopped) return;
    const lane = this.laneFor(job);
    const queue = lane.jobs;

    // Deduplicate full-index jobs for the same repo
    if (job.kind === 'full') {
      const already = queue.some(
        j => j.kind === 'full' && j.repoPath === job.repoPath,
      );
      if (already) return;
    }

    // Deduplicate reconcile jobs for the same repo -- the queued pass
    // compares against the disk when it runs, so a second one adds nothing.
    if (job.kind === 'reconcile') {
      const already = queue.some(
        j => j.kind === 'reconcile' && j.repoPath === job.repoPath,
      );
      if (already) return;
    }

    // Deduplicate file events — replace existing entry for same path
    if (job.kind === 'file') {
      const idx = queue.findIndex(
        j => j.kind === 'file' && j.filePath === job.filePath,
      );
      if (idx >= 0) {
        queue[idx] = job; // latest event type wins
        return;
      }
    }

    // Deduplicate config-file events for the same path
    if (job.kind === 'config-file') {
      const idx = queue.findIndex(
        j => j.kind === 'config-file' && j.filePath === job.filePath,
      );
      if (idx >= 0) {
        queue[idx] = job;
        return;
      }
    }

    // Deduplicate config-full jobs for the same scope
    if (job.kind === 'config-full') {
      const scopeKey = job.scope.kind === 'global' ? 'global' : `project:${job.scope.repoPath}`;
      const already = queue.some(j => {
        if (j.kind === 'config-full' || j.kind === 'config-reindex') {
          const jKey = j.scope.kind === 'global' ? 'global' : `project:${j.scope.repoPath}`;
          return jKey === scopeKey;
        }
        return false;
      });
      if (already) return;
    }

    // config-reindex supersedes config-full for the same scope
    if (job.kind === 'config-reindex') {
      const scopeKey = job.scope.kind === 'global' ? 'global' : `project:${job.scope.repoPath}`;
      // Remove any pending config-full for the same scope
      for (let i = queue.length - 1; i >= 0; i--) {
        const j = queue[i];
        if (j && j.kind === 'config-full') {
          const jKey = j.scope.kind === 'global' ? 'global' : `project:${j.scope.repoPath}`;
          if (jKey === scopeKey) {
            queue.splice(i, 1);
          }
        }
      }
      // Also dedup against existing config-reindex
      const already = queue.some(j => {
        if (j.kind === 'config-reindex') {
          const jKey = j.scope.kind === 'global' ? 'global' : `project:${j.scope.repoPath}`;
          return jKey === scopeKey;
        }
        return false;
      });
      if (already) {
        // The superseded config-full jobs left the lane.
        this.changed('index');
        return;
      }
    }

    // Deduplicate doc-summarise-repo jobs for the same repo. If a
    // background summarisation is already queued, skip -- the
    // enqueued sweep will pick up whatever's new when it runs.
    if (job.kind === 'doc-summarise-repo') {
      const already = queue.some(
        j => j.kind === 'doc-summarise-repo' && j.repoPath === job.repoPath,
      );
      if (already) return;
    }

    // Deduplicate doc-summarise-entity jobs for the same entity.
    // Watcher-driven per-file summarisation -- only the latest
    // enqueued instance survives; the driver's skip-if-unchanged
    // makes the trailing enqueue cheap anyway.
    if (job.kind === 'doc-summarise-entity') {
      const idx = queue.findIndex(
        j => j.kind === 'doc-summarise-entity' && j.entityId === job.entityId,
      );
      if (idx >= 0) return;
    }

    if (job.kind === 'doc-summarise-entity') {
      // An edited document goes ahead of a queued sweep, after earlier edits.
      const sweep = queue.findIndex(j => j.kind === 'doc-summarise-repo');
      if (sweep >= 0) queue.splice(sweep, 0, job); else queue.push(job);
    } else {
      queue.push(job);
    }
    this.changed(lane === this.lanes.index ? 'index' : 'summary');
    lane.resolve?.(); // wake up this lane's drain loop if it's waiting
  }

  /**
   * Remove and return the first queued single-document summary job, so a
   * running sweep can run it between documents. Undefined when none is queued.
   */
  takeDocSummaryEdit(): { kind: 'doc-summarise-entity'; entityId: string } | undefined {
    const jobs = this.lanes.summary.jobs;
    const idx = jobs.findIndex(j => j.kind === 'doc-summarise-entity');
    if (idx < 0) return undefined;
    const job = jobs.splice(idx, 1)[0] as { kind: 'doc-summarise-entity'; entityId: string };
    this.changed('summary');
    return job;
  }

  /** Each lane's queued count and whether its worker is running a job. */
  laneStatus(): { index: { depth: number; running: boolean }; summary: { depth: number; running: boolean } } {
    const of = (l: Lane) => ({ depth: l.jobs.length, running: l.inFlight !== null });
    return { index: of(this.lanes.index), summary: of(this.lanes.summary) };
  }

  /**
   * Start both lanes' drain loops, which run at the same time. Each processes
   * its jobs one at a time, calling `processor` for each. Returns only when
   * `stop()` has been called and both loops have ended.
   */
  async start(processor: JobProcessor): Promise<void> {
    this.stopped = false;
    // Two independent loops, each serial (drain never rejects: it catches every job's error).
    const index   = this.drain(this.lanes.index, processor);
    const summary = this.drain(this.lanes.summary, processor);
    await index;
    await summary;
  }

  private async drain(lane: Lane, processor: JobProcessor): Promise<void> {
    while (!this.stopped) {
      // The summary lane yields to code work: it starts a summary only while the
      // index lane is idle (Story 0f0e4f45). A summary already running is not stopped.
      if (lane === this.lanes.summary && lane.jobs.length > 0) {
        // Re-checked after every wake: an index job enqueued after the wait resolved
        // but before this continuation ran must still go first. No await follows the
        // last check before the shift below.
        while (!this.stopped && !this.isIndexIdle) await this.waitForIndexIdle();
        if (this.stopped) break;
      }
      // Held by pause() until resume(): no new job starts.
      if (this.paused) {
        await new Promise<void>(res => { this.resumeWaiters.push(res); });
        continue;
      }
      const job = lane.jobs.shift();

      if (!job) {
        // Nothing to do — wait until enqueue() wakes us up
        await new Promise<void>(res => { lane.resolve = res; });
        lane.resolve = null;
        continue;
      }

      lane.inFlight = job;
      this.changed(lane === this.lanes.index ? 'index' : 'summary');
      try {
        await processor(job);
      } catch (err) {
        // A read has no wrapper in the store layer: a store that lost its
        // locks shows here as the library's raw error. Record it, and log
        // the named error with the true cause.
        const operation = `job ${job.kind}`;
        if (recordStoreFailureIfLockError(err, operation)) {
          const named = err instanceof LmdbStoreLocksLostError ? err : new LmdbStoreLocksLostError(operation, err);
          log.error({ err: named }, 'job failed: the graph store lost its locks');
        } else {
          log.error({ err }, 'job failed');
        }
      } finally {
        lane.inFlight = null;
        this.changed(lane === this.lanes.index ? 'index' : 'summary');
        if (lane === this.lanes.index && lane.jobs.length === 0) this.releaseIndexIdleWaiters();
        if (this.paused && !this.isProcessing) this.releaseQuietWaiters();
      }
    }
  }

  /** True when the index lane has no job running and none queued. */
  get isIndexIdle(): boolean { return this.lanes.index.inFlight === null && this.lanes.index.jobs.length === 0; }

  private releaseIndexIdleWaiters(): void {
    const waiters = this.indexIdleWaiters;
    this.indexIdleWaiters = [];
    for (const w of waiters) w();
  }

  /**
   * Resolves once the index lane has no job running and none queued, or once stop()
   * has been called (at once when either already holds). The summary lane and a
   * running summary sweep await it, so they yield the local model to code work.
   */
  waitForIndexIdle(): Promise<void> {
    if (this.stopped || this.isIndexIdle) return Promise.resolve();
    return new Promise<void>(resolve => { this.indexIdleWaiters.push(resolve); });
  }

  /**
   * Stop both lanes from starting new jobs (maintenance compaction). Resolves
   * once no job is in flight in either lane; jobs keep queueing meanwhile.
   */
  pause(): Promise<void> {
    this.paused = true;
    if (!this.isProcessing) return Promise.resolve();
    return new Promise<void>(resolve => { this.quietWaiters.push(resolve); });
  }

  /** Let both lanes take jobs again after pause(). */
  resume(): void {
    this.paused = false;
    // A pause() still waiting for quiet resolves too: the queue is no longer paused.
    this.releaseQuietWaiters();
    this.releaseResumeWaiters();
  }

  private releaseQuietWaiters(): void {
    const waiters = this.quietWaiters;
    this.quietWaiters = [];
    for (const w of waiters) w();
  }

  private releaseResumeWaiters(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const w of waiters) w();
  }

  /** Signal both drain loops to stop after their current jobs finish. */
  stop(): void {
    this.stopped = true;
    this.block?.setStopping();
    this.releaseResumeWaiters();
    // unblock both if waiting
    this.lanes.index.resolve?.();
    this.lanes.summary.resolve?.();
    this.releaseIndexIdleWaiters();
  }

  /** True once `stop()` has been called; a running summary sweep reads it between documents. */
  get isStopping(): boolean { return this.stopped; }

  /** True while either lane is running a job. */
  get isProcessing(): boolean { return this.lanes.index.inFlight !== null || this.lanes.summary.inFlight !== null; }
}
