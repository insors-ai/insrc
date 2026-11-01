import * as parcelWatcher from '@parcel/watcher';
import { changedIgnoreFile, refreshFileFilter, type FileFilter } from './file-filter.js';

export type FileEventType = 'create' | 'update' | 'delete';
export interface FileEvent { type: FileEventType; path: string }
export type EventHandler = (events: FileEvent[]) => void;

const DEBOUNCE_MS = 200;

/**
 * One batch of a repository's file events through its FileFilter (Epic
 * c2ba6fa6 s6/t10). When the batch changes an ignore file -- or the clone's
 * exclude file or the global ignore file changed -- the filter is refreshed
 * FIRST, so the rest of the batch is judged by the new rules (ac5): a file
 * the new rules leave out is dropped and one they let in passes. The files
 * the refresh moved are then reported too, so the index follows the rules
 * without re-adding the repository: each file that left as a 'delete', each
 * that entered as a 'create' (unless the batch already carries an event for
 * it).
 */
export function filterBatch(filter: FileFilter, events: readonly FileEvent[]): FileEvent[] {
  const changed = changedIgnoreFile(filter, events.map(e => e.path));
  const change = changed !== undefined ? refreshFileFilter(filter, changed) : undefined;
  const out = events.filter(e => filter.includes(e.path));
  if (change !== undefined) {
    const carried = new Set(out.map(e => e.path));
    for (const path of change.left) out.push({ type: 'delete', path });
    for (const path of change.entered) if (!carried.has(path)) out.push({ type: 'create', path });
  }
  return out;
}

/**
 * Wraps @parcel/watcher to provide multi-repo, debounced file event emission.
 *
 * Usage:
 *   const w = new Watcher();
 *   w.onEvents(events => { ... });
 *   await w.addRepo('/path/to/repo');
 *   // later:
 *   await w.close();
 */
export class Watcher {
  private readonly handlers:     EventHandler[]   = [];
  private readonly subscriptions: Map<string, parcelWatcher.AsyncSubscription> = new Map();
  private debounceTimer:          ReturnType<typeof setTimeout> | null = null;
  private pendingEvents:          FileEvent[] = [];

  /** Register an event handler (call before addRepo). */
  onEvents(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  /** Start watching a repo directory. Idempotent. `filter` (Epic c2ba6fa6
   *  s6) is the repo's FileFilter — the one rule for what the index holds;
   *  every emitted event is checked against it before reaching a handler,
   *  so the watcher agrees with the full walk and the single file event. A
   *  config dir (no FileFilter: it is not an indexed repository, and is
   *  small and daemon-managed) is unfiltered. */
  async addRepo(repoPath: string, filter?: FileFilter): Promise<void> {
    if (this.subscriptions.has(repoPath)) return;

    const sub = await parcelWatcher.subscribe(
      repoPath,
      (_err, events) => {
        const batch = events.map(e => ({ type: e.type as FileEventType, path: e.path }));
        this.pendingEvents.push(...(filter === undefined ? batch : filterBatch(filter, batch)));
        this.scheduleDrain();
      },
      { ignore: [] },
    );

    this.subscriptions.set(repoPath, sub);
  }

  /**
   * Start watching a config directory (templates, feedback, conventions).
   * Alias for addRepo — same watcher infrastructure, just a semantic distinction.
   */
  async addConfigDir(dirPath: string): Promise<void> {
    await this.addRepo(dirPath);
  }

  /** Stop watching a repo directory. */
  async removeRepo(repoPath: string): Promise<void> {
    const sub = this.subscriptions.get(repoPath);
    if (sub) {
      await sub.unsubscribe();
      this.subscriptions.delete(repoPath);
    }
  }

  /** Stop all watchers. */
  async close(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const sub of this.subscriptions.values()) {
      await sub.unsubscribe();
    }
    this.subscriptions.clear();
  }

  private scheduleDrain(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const events = this.pendingEvents.splice(0);
      if (events.length > 0) {
        for (const handler of this.handlers) {
          handler(events);
        }
      }
    }, DEBOUNCE_MS);
  }
}
