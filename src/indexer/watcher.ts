import * as parcelWatcher from '@parcel/watcher';

export type FileEventType = 'create' | 'update' | 'delete';
export interface FileEvent { type: FileEventType; path: string }
export type EventHandler = (events: FileEvent[]) => void;

/** Directories to ignore during watching and file-walking. */
export const IGNORE_DIRS = [
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.venv', 'venv', '.env', '.next', '.nuxt', 'vendor', 'target',
];

const DEBOUNCE_MS = 200;

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

  /** Start watching a repo directory. Idempotent. */
  async addRepo(repoPath: string): Promise<void> {
    if (this.subscriptions.has(repoPath)) return;

    const sub = await parcelWatcher.subscribe(
      repoPath,
      (_err, events) => {
        for (const e of events) {
          this.pendingEvents.push({
            type: e.type as FileEventType,
            path: e.path,
          });
        }
        this.scheduleDrain();
      },
      { ignore: IGNORE_DIRS },
    );

    this.subscriptions.set(repoPath, sub);
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
