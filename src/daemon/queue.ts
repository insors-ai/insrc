import type { IndexJob } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('queue');

type JobProcessor = (job: IndexJob) => Promise<void>;

/**
 * In-memory FIFO queue for IndexJob items.
 *
 * Deduplication: `full` jobs dedup by repo, `file` and `config-file` jobs
 * dedup by path (latest event wins), `config-full`/`config-reindex` dedup
 * by scope. `reembed` jobs are never deduplicated.
 */
export class IndexQueue {
  private readonly queue:  IndexJob[] = [];
  private processing = false;
  private stopped    = false;
  private resolve:   (() => void) | null = null;

  /** Current number of pending jobs. */
  get depth(): number { return this.queue.length; }

  /** Add a job to the end of the queue. */
  enqueue(job: IndexJob): void {
    if (this.stopped) return;

    // Deduplicate full-index jobs for the same repo
    if (job.kind === 'full') {
      const already = this.queue.some(
        j => j.kind === 'full' && j.repoPath === job.repoPath,
      );
      if (already) return;
    }

    // Deduplicate file events — replace existing entry for same path
    if (job.kind === 'file') {
      const idx = this.queue.findIndex(
        j => j.kind === 'file' && j.filePath === job.filePath,
      );
      if (idx >= 0) {
        this.queue[idx] = job; // latest event type wins
        return;
      }
    }

    // Deduplicate config-file events for the same path
    if (job.kind === 'config-file') {
      const idx = this.queue.findIndex(
        j => j.kind === 'config-file' && j.filePath === job.filePath,
      );
      if (idx >= 0) {
        this.queue[idx] = job;
        return;
      }
    }

    // Deduplicate config-full jobs for the same scope
    if (job.kind === 'config-full') {
      const scopeKey = job.scope.kind === 'global' ? 'global' : `project:${job.scope.repoPath}`;
      const already = this.queue.some(j => {
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
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const j = this.queue[i];
        if (j && j.kind === 'config-full') {
          const jKey = j.scope.kind === 'global' ? 'global' : `project:${j.scope.repoPath}`;
          if (jKey === scopeKey) {
            this.queue.splice(i, 1);
          }
        }
      }
      // Also dedup against existing config-reindex
      const already = this.queue.some(j => {
        if (j.kind === 'config-reindex') {
          const jKey = j.scope.kind === 'global' ? 'global' : `project:${j.scope.repoPath}`;
          return jKey === scopeKey;
        }
        return false;
      });
      if (already) return;
    }

    // Deduplicate doc-summarise-repo jobs for the same repo. If a
    // background summarisation is already queued, skip -- the
    // enqueued sweep will pick up whatever's new when it runs.
    if (job.kind === 'doc-summarise-repo') {
      const already = this.queue.some(
        j => j.kind === 'doc-summarise-repo' && j.repoPath === job.repoPath,
      );
      if (already) return;
    }

    // Deduplicate doc-summarise-entity jobs for the same entity.
    // Watcher-driven per-file summarisation -- only the latest
    // enqueued instance survives; the driver's skip-if-unchanged
    // makes the trailing enqueue cheap anyway.
    if (job.kind === 'doc-summarise-entity') {
      const idx = this.queue.findIndex(
        j => j.kind === 'doc-summarise-entity' && j.entityId === job.entityId,
      );
      if (idx >= 0) return;
    }

    this.queue.push(job);
    this.resolve?.(); // wake up the drain loop if it's waiting
  }

  /**
   * Start the drain loop. Processes jobs sequentially, calling `processor`
   * for each. Returns only when `stop()` is called.
   */
  async start(processor: JobProcessor): Promise<void> {
    this.stopped = false;

    while (!this.stopped) {
      const job = this.queue.shift();

      if (!job) {
        // Nothing to do — wait until enqueue() wakes us up
        await new Promise<void>(res => { this.resolve = res; });
        this.resolve = null;
        continue;
      }

      this.processing = true;
      try {
        await processor(job);
      } catch (err) {
        log.error({ err }, 'job failed');
      } finally {
        this.processing = false;
      }
    }
  }

  /** Signal the drain loop to stop after the current job finishes. */
  stop(): void {
    this.stopped = true;
    this.resolve?.(); // unblock if waiting
  }

  get isProcessing(): boolean { return this.processing; }
}
