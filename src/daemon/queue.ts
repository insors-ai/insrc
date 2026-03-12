import type { IndexJob } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('queue');

type JobProcessor = (job: IndexJob) => Promise<void>;

/**
 * In-memory FIFO queue for IndexJob items.
 *
 * Deduplication: if a `full` job for the same repo is already queued (and
 * not yet started), the duplicate is dropped. `file` and `reembed` jobs
 * are never deduplicated — their order matters.
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
