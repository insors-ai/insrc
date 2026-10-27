import * as parcelWatcher from '@parcel/watcher';
import { lstatSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { getLogger } from '../shared/logger.js';

const log = getLogger('watcher');

export type FileEventType = 'create' | 'update' | 'delete';
export interface FileEvent { type: FileEventType; path: string }
export type EventHandler = (events: FileEvent[]) => void;
/** The subscribe function the Watcher uses; tests replace it to force a failure. */
export type SubscribeFn = typeof parcelWatcher.subscribe;

/** Directories to ignore during watching and file-walking.
 *  `out` is a build-output dir (insrc itself builds to `out/`, alongside the
 *  common `dist`/`build`), and `.insrc` holds daemon-managed per-repo artifacts
 *  (LLD/review markdown, config, index state). Neither is source — indexing +
 *  watching them re-triggers doc-summarisation on every build / workflow-run,
 *  which floods the queue. See the doc-summariser churn diagnosis. */
export const IGNORE_DIRS = [
  'node_modules', '.git', 'dist', 'build', 'out', '__pycache__',
  '.venv', 'venv', '.env', '.next', '.nuxt', 'vendor', 'target', '.insrc',
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
  /** The ignore list each watched repo was added with. */
  private readonly repoIgnore:    Map<string, readonly string[]> = new Map();
  /**
   * Own subscriptions for directories that appeared with subdirectories. @parcel/watcher on Linux reports a
   * directory created together with its parent (mkdir -p a/b) but never watches the nested ones, so files written
   * there produce no event. A value of null marks a subscription being created.
   */
  private readonly dirSubscriptions: Map<string, { repo: string; sub: parcelWatcher.AsyncSubscription | null }> = new Map();
  private debounceTimer:          ReturnType<typeof setTimeout> | null = null;
  private pendingEvents:          FileEvent[] = [];

  /** `subscribe` defaults to the real @parcel/watcher subscribe. */
  constructor(private readonly subscribe: SubscribeFn = parcelWatcher.subscribe) {}

  /** Register an event handler (call before addRepo). */
  onEvents(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  /** Start watching a repo directory. Idempotent. `ignore` is the per-repo
   *  ignore dir list (from the repo's `.insrc` config); defaults to the
   *  universal `IGNORE_DIRS` for config dirs / older registrations. */
  async addRepo(repoPath: string, ignore: readonly string[] = IGNORE_DIRS): Promise<void> {
    if (this.subscriptions.has(repoPath)) return;

    this.repoIgnore.set(repoPath, ignore);
    let sub: parcelWatcher.AsyncSubscription;
    try {
      sub = await this.subscribe(
        repoPath,
        (_err, events) => this.onBackendEvents(repoPath, events),
        { ignore: [...ignore] },
      );
    } catch (err) {
      this.repoIgnore.delete(repoPath);
      throw err;
    }

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
    this.repoIgnore.delete(repoPath);
    for (const [dir, entry] of [...this.dirSubscriptions]) {
      if (entry.repo === repoPath) await this.releaseDirectory(dir);
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
    this.repoIgnore.clear();
    for (const dir of [...this.dirSubscriptions.keys()]) await this.releaseDirectory(dir);
  }

  /** Events from the repo subscription or from one of its directory subscriptions. */
  private onBackendEvents(repoPath: string, events: readonly parcelWatcher.Event[]): void {
    for (const e of events) {
      this.pendingEvents.push({ type: e.type as FileEventType, path: e.path });
      if (e.type === 'create') void this.adoptDirectory(repoPath, e.path);
      else if (e.type === 'delete') void this.releaseDirectory(e.path, true);
    }
    this.scheduleDrain();
  }

  /** Whether a path under the repo has a segment on the repo's ignore list. */
  private isIgnored(repoPath: string, path: string): boolean {
    const ignore = this.repoIgnore.get(repoPath);
    if (ignore === undefined) return true;
    return relative(repoPath, path).split(sep).some(seg => ignore.includes(seg));
  }

  /**
   * A directory that just appeared: when it has subdirectories, watch it ourselves (first, so a write between the
   * two steps is not lost), then report every file already in its tree.
   */
  private async adoptDirectory(repoPath: string, dir: string): Promise<void> {
    try {
      if (this.dirSubscriptions.has(dir) || this.isIgnored(repoPath, dir)) return;
      if (!lstatSync(dir).isDirectory()) return;          // lstat: a symbolic link is not a directory here
      if (this.hasWatchableSubdirectory(repoPath, dir)) {
        const ignore = this.repoIgnore.get(repoPath) ?? IGNORE_DIRS;
        const entry: { repo: string; sub: parcelWatcher.AsyncSubscription | null } = { repo: repoPath, sub: null };
        this.dirSubscriptions.set(dir, entry);
        try {
          const sub = await this.subscribe(dir, (_err, events) => this.onBackendEvents(repoPath, events), { ignore: [...ignore] });
          if (this.dirSubscriptions.get(dir) === entry && this.repoIgnore.has(repoPath)) entry.sub = sub;
          else await sub.unsubscribe();                     // the repo or the directory went away meanwhile
        } catch (err) {
          this.dirSubscriptions.delete(dir);
          log.warn({ dir, err: err instanceof Error ? err.message : String(err) }, 'could not watch a new directory; its files are scanned once');
        }
      }
      if (!this.repoIgnore.has(repoPath)) return;
      for (const file of this.filesUnder(repoPath, dir)) this.pendingEvents.push({ type: 'create', path: file });
      this.scheduleDrain();
    } catch (err) {
      log.debug({ dir, err: err instanceof Error ? err.message : String(err) }, 'new directory not adopted');
    }
  }

  /** Drop the subscription of a directory (and, for a delete event, of every directory under it). */
  private async releaseDirectory(dir: string, includeNested = false): Promise<void> {
    const prefix = dir + sep;
    for (const [key, entry] of [...this.dirSubscriptions]) {
      if (key !== dir && !(includeNested && key.startsWith(prefix))) continue;
      this.dirSubscriptions.delete(key);
      try { await entry.sub?.unsubscribe(); } catch { /* already gone */ }
    }
  }

  private hasWatchableSubdirectory(repoPath: string, dir: string): boolean {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .some(e => e.isDirectory() && !this.isIgnored(repoPath, join(dir, e.name)));
    } catch { return false; }
  }

  /** Every regular file under a directory, skipping ignored directories and symbolic links. */
  private filesUnder(repoPath: string, dir: string): string[] {
    const files: string[] = [];
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return files; }
    for (const e of entries) {
      const path = join(dir, e.name);
      if (e.isSymbolicLink() || this.isIgnored(repoPath, path)) continue;
      if (e.isDirectory()) files.push(...this.filesUnder(repoPath, path));
      else if (e.isFile()) files.push(path);
    }
    return files;
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
