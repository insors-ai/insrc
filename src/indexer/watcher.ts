import * as parcelWatcher from '@parcel/watcher';
import { lstatSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

import { getLogger } from '../shared/logger.js';
import { changedIgnoreFile, nativelyIgnoredPaths, refreshFileFilter, type FileFilter } from './file-filter.js';

export type FileEventType = 'create' | 'update' | 'delete';
export interface FileEvent { type: FileEventType; path: string }
/** A nested-directory subscription; `settled` resolves once a pending subscribe has finished and, if it was released meanwhile, been undone. */
interface DirEntry { repo: string; sub: parcelWatcher.AsyncSubscription | null; settled: Promise<void> }

export type EventHandler = (events: FileEvent[]) => void;
/** The subscribe function the Watcher uses; tests replace it to force a failure. */
export type SubscribeFn = typeof parcelWatcher.subscribe;

const DEBOUNCE_MS = 200;

const log = getLogger('watcher');

/** One watched directory: its subscription, its FileFilter (absent for a
 *  config dir) and the native ignore list the subscription was made with. */
interface Watched {
  sub:     parcelWatcher.AsyncSubscription;
  readonly filter: FileFilter | undefined;
  ignored: readonly string[];
}

/**
 * One batch of a repository's file events through its FileFilter (Epic
 * c2ba6fa6 s6/t10). When the batch changes an ignore file -- or the clone's
 * exclude file or the global ignore file changed -- the filter is refreshed
 * FIRST, so the rest of the batch is judged by the new rules (ac5): a file
 * the new rules leave out is dropped and one they let in passes. The files
 * the refresh moved are then reported too, so the index follows the rules
 * without re-adding the repository: each file that left as a 'delete', each
 * that entered as a 'create' (unless the batch already carries an event for
 * it). `onRefreshed` is told of a refresh: a file indexed after the filter
 * was last rebuilt is not on its 'left' list, so the indexer runs its
 * clean-up pass too.
 */
export function filterBatch(filter: FileFilter, events: readonly FileEvent[], onRefreshed?: () => void): FileEvent[] {
  const changed = changedIgnoreFile(filter, events.map(e => e.path));
  const change = changed !== undefined ? refreshFileFilter(filter, changed) : undefined;
  if (change !== undefined) onRefreshed?.();
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
  private readonly refreshHandlers: Array<(repoPath: string) => void> = [];
  private readonly subscriptions: Map<string, Watched> = new Map();
  /** Per repository, the native-ignore update in flight (they run one at a
   *  time, and close() waits for them: a parcel call still running when the
   *  daemon's worker ends aborts the process). */
  private readonly resyncs: Map<string, Promise<void>> = new Map();
  /**
   * Own subscriptions for directories that appeared with subdirectories. @parcel/watcher on Linux reports a
   * directory created together with its parent (mkdir -p a/b) but never watches the nested ones, so files written
   * there produce no event. A value with a null `sub` marks a subscription being created.
   */
  private readonly dirSubscriptions: Map<string, DirEntry> = new Map();
  /** Releases started by delete events and not finished; removeRepo() and close() wait for them. */
  private readonly releasing:    Set<Promise<void>> = new Set();
  /** Repositories whose first subscription is being made: events arriving meanwhile are kept. */
  private readonly adding:       Set<string> = new Set();
  private debounceTimer:          ReturnType<typeof setTimeout> | null = null;
  private pendingEvents:          FileEvent[] = [];

  /** `subscribeFn` defaults to the real @parcel/watcher subscribe; a test may replace it, or override `subscribe`. */
  constructor(private readonly subscribeFn: SubscribeFn = parcelWatcher.subscribe) {}

  /** Register an event handler (call before addRepo). */
  onEvents(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  /** Register a handler told when a repository's FileFilter was refreshed
   *  by an ignore-rule change in its event stream (call before addRepo). */
  onFilterRefreshed(handler: (repoPath: string) => void): void {
    this.refreshHandlers.push(handler);
  }

  /** Start watching a repo directory. Idempotent. `filter` (Epic c2ba6fa6
   *  s6) is the repo's FileFilter — the one rule for what the index holds;
   *  every emitted event is checked against it before reaching a handler,
   *  so the watcher agrees with the full walk and the single file event. A
   *  config dir (no FileFilter: it is not an indexed repository, and is
   *  small and daemon-managed) is unfiltered. */
  async addRepo(repoPath: string, filter?: FileFilter): Promise<void> {
    if (this.subscriptions.has(repoPath)) return;
    const ignored = filter === undefined ? [] : nativelyIgnoredPaths(filter);
    this.adding.add(repoPath);
    try {
      const sub = await this.subscribe(repoPath, filter, ignored);
      this.subscriptions.set(repoPath, { sub, filter, ignored });
    } finally {
      this.adding.delete(repoPath);
    }
  }

  /**
   * Bring a repository's native ignores in line with its FileFilter after a
   * refresh -- the watcher's own (an ignore-file edit in its events) or the
   * indexer's (a full index, a re-registration). When the directories the
   * filter leaves out changed, a new subscription is made BEFORE the old one
   * is dropped, so no event falls between them (one seen twice is harmless:
   * the queue merges file jobs).
   */
  syncIgnores(repoPath: string): Promise<void> {
    const prior = this.resyncs.get(repoPath) ?? Promise.resolve();
    const next = prior.then(async () => {
      const watched = this.subscriptions.get(repoPath);
      if (watched?.filter === undefined) return;
      const ignored = nativelyIgnoredPaths(watched.filter);
      if (ignored.length === watched.ignored.length && ignored.every((p, i) => p === watched.ignored[i])) return;
      const sub = await this.subscribe(repoPath, watched.filter, ignored);
      const old = watched.sub;
      watched.sub = sub;
      watched.ignored = ignored;
      await old.unsubscribe();
    }).catch(err => {
      log.warn({ repo: repoPath, err: err instanceof Error ? err.message : String(err) }, 'watcher: native ignores not updated; the filter still judges every event');
    });
    this.resyncs.set(repoPath, next);
    void next.finally(() => { if (this.resyncs.get(repoPath) === next) this.resyncs.delete(repoPath); });
    return next;
  }

  /** Protected: a test records the native ignores each subscription is made with. `owner` is the repository a
   *  nested-directory subscription belongs to (the repository itself for its own subscription). */
  protected subscribe(root: string, filter: FileFilter | undefined, ignored: readonly string[], owner: string = root): Promise<parcelWatcher.AsyncSubscription> {
    return this.subscribeFn(
      root,
      (_err, events) => this.onBackendEvents(owner, filter, events),
      // What the filter leaves out with no rule change in between never
      // reaches JS (no watches under node_modules/ either); everything else
      // is judged by the filter itself.
      { ignore: [...ignored] },
    );
  }

  /** Events from a repository's subscription or from one of its directory subscriptions. */
  private onBackendEvents(owner: string, filter: FileFilter | undefined, events: readonly parcelWatcher.Event[]): void {
    if (!this.subscriptions.has(owner) && !this.adding.has(owner)) return;     // the repo was removed or the watcher closed: a late subscription delivers nothing
    const batch = events.map(e => ({ type: e.type as FileEventType, path: e.path }));
    this.pendingEvents.push(...(filter === undefined ? batch : filterBatch(filter, batch, () => {
      for (const handler of this.refreshHandlers) handler(owner);
      void this.syncIgnores(owner);
    })));
    for (const e of events) {
      if (e.type === 'create') void this.adoptDirectory(owner, e.path);
      else if (e.type === 'delete') this.trackRelease(this.releaseDirectory(e.path, true));
    }
    this.scheduleDrain();
  }

  private trackRelease(release: Promise<void>): void {
    this.releasing.add(release);
    void release.finally(() => this.releasing.delete(release));
  }

  /** Whether the repository's FileFilter leaves a path out. A repository without one (a config dir) ignores nothing. */
  private isIgnored(repoPath: string, path: string): boolean {
    const watched = this.subscriptions.get(repoPath);
    if (watched === undefined) return true;
    return watched.filter !== undefined && !watched.filter.includes(path);
  }

  /**
   * A directory that just appeared: when it has subdirectories, watch it ourselves (first, so a write between the
   * two steps is not lost), then report every file already in its tree.
   */
  private async adoptDirectory(repoPath: string, dir: string): Promise<void> {
    try {
      if (this.dirSubscriptions.has(dir) || this.isIgnored(repoPath, dir)) return;
      if (!lstatSync(dir).isDirectory()) return;          // lstat: a symbolic link is not a directory here
      const watched = this.subscriptions.get(repoPath);
      if (watched !== undefined && this.hasWatchableSubdirectory(repoPath, dir)) {
        const entry: DirEntry = { repo: repoPath, sub: null, settled: Promise.resolve() };
        this.dirSubscriptions.set(dir, entry);
        entry.settled = (async () => {
          try {
            const sub = await this.subscribe(dir, watched.filter, watched.ignored, repoPath);
            if (this.dirSubscriptions.get(dir) === entry && this.subscriptions.has(repoPath)) entry.sub = sub;
            else await sub.unsubscribe();                   // the repo or the directory went away meanwhile
          } catch (err) {
            if (this.dirSubscriptions.get(dir) === entry) this.dirSubscriptions.delete(dir);
            log.warn({ dir, err: err instanceof Error ? err.message : String(err) }, 'could not watch a new directory; its files are scanned once');
          }
        })();
        await entry.settled;
      }
      if (!this.subscriptions.has(repoPath)) return;
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
      await entry.settled;                                  // a subscribe still in progress finishes and undoes itself first
      try { await entry.sub?.unsubscribe(); } catch { /* already gone */ }
    }
  }

  private hasWatchableSubdirectory(repoPath: string, dir: string): boolean {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .some(e => e.isDirectory() && !this.isIgnored(repoPath, join(dir, e.name)));
    } catch { return false; }
  }

  /** Every regular file under a directory, skipping directories the filter leaves out and symbolic links. */
  private filesUnder(repoPath: string, dir: string): string[] {
    const files: string[] = [];
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch (err) {
      log.debug({ dir, err: err instanceof Error ? err.message : String(err) }, 'directory not scanned');
      return files;
    }
    for (const e of entries) {
      const path = join(dir, e.name);
      if (e.isSymbolicLink() || this.isIgnored(repoPath, path)) continue;
      if (e.isDirectory()) files.push(...this.filesUnder(repoPath, path));
      else if (e.isFile()) files.push(path);
    }
    return files;
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
    await this.resyncs.get(repoPath);
    const watched = this.subscriptions.get(repoPath);
    if (watched) {
      await watched.sub.unsubscribe();
      this.subscriptions.delete(repoPath);
    }
    for (const [dir, entry] of [...this.dirSubscriptions]) {
      if (entry.repo === repoPath) await this.releaseDirectory(dir);
    }
    await Promise.allSettled([...this.releasing]);
  }

  /** Stop all watchers. */
  async close(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const pending of [...this.resyncs.values()]) await pending;
    for (const watched of this.subscriptions.values()) {
      await watched.sub.unsubscribe();
    }
    this.subscriptions.clear();
    for (const dir of [...this.dirSubscriptions.keys()]) await this.releaseDirectory(dir);
    await Promise.allSettled([...this.releasing]);
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
