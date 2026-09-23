/**
 * Story E20260923401ae5fb:S006 / t2 — the thin rotation-aware LogTail (sc9 Debug).
 *
 * The plugin-local live log tail the Debug tab's controller drives (the epic's
 * ONLY continuous ticker). It is VS-Code-free + reads only local files, over an
 * INJECTED fs seam (listSegments/readLines/watch) so rotation/append/dispose are
 * unit-testable with no real disk watcher. It MIRRORS the daemon CLI's
 * `tailLogWith` (src/cli/services/debug.ts) but deliberately does NOT import it —
 * pulling the daemon service module into the extension bundle would drag its
 * transitive deps (pino, ipc, …) in and break the k5 thin-bundle allowlist. This
 * copy stays raw-line only (no LogLine parse): the emitted strings are appended to
 * the webview via textContent, so they are XSS-safe with no host-side escaping.
 *
 * `follow(onLines)` emits the maxLines-bounded initial tail of the active segment,
 * then on each watch event emits only the newly-appended lines; when a newer
 * segment appears it re-resolves and follows it. A `disposed` guard suppresses any
 * post-dispose emit. It NEVER throws — a missing dir / read / watch error degrades
 * to an empty (initial) emit + a quiet retry on the next event. The returned
 * dispose() is idempotent and removes the watcher.
 */

/**
 * The injected fs seam for the tailer. `listSegments` returns the `<stem>.*.log`
 * segment files under `logDir` sorted ascending by rotation number (the active
 * segment is the last); `readLines` returns a file's current lines; `watch`
 * installs a directory watcher firing on any append/creation and returns an
 * unwatch. `maxLines` bounds the initial tail.
 */
export interface LogTailDeps {
  readonly logDir: string;
  readonly stem: string;
  readonly listSegments: (dir: string, stem: string) => string[];
  readonly readLines: (file: string) => string[];
  readonly watch: (dir: string, onEvent: () => void) => () => void;
  readonly maxLines: number;
}

/** The live tail handle: `follow` arms the stream and returns an idempotent dispose. */
export interface LogTail {
  /** Start emitting the initial tail then the appended lines; returns dispose(). */
  follow(onLines: (lines: readonly string[]) => void): () => void;
}

/**
 * Build a rotation-aware LogTail over the injected fs seam. Never throws; the
 * initial `follow` call delivers the bounded tail (or an empty emit when the dir /
 * active segment is absent) and installs a best-effort watcher.
 */
export function createLogTail(deps: LogTailDeps): LogTail {
  return {
    follow(onLines: (lines: readonly string[]) => void): () => void {
      let disposed = false;
      let activeFile: string | undefined;
      let seen = 0; // count of lines of activeFile already emitted

      const resolveActive = (): string | undefined => {
        try {
          const segs = deps.listSegments(deps.logDir, deps.stem);
          return segs.length > 0 ? segs[segs.length - 1] : undefined;
        } catch {
          return undefined;
        }
      };

      const emit = (initial: boolean): void => {
        if (disposed) return;
        const active = resolveActive();
        if (active === undefined) {
          if (initial) onLines([]); // loaded-but-empty; a later event retries.
          return;
        }
        if (active !== activeFile) {
          activeFile = active;
          seen = 0;
        } // new/rotated segment.
        let lines: string[];
        try {
          lines = deps.readLines(active);
        } catch {
          return; // transient read error — retry on the next event.
        }
        if (lines.length < seen) seen = 0; // truncated/replaced → re-tail.
        if (seen === 0 && lines.length > deps.maxLines) seen = lines.length - deps.maxLines; // initial: last-N only.
        const fresh = lines.slice(seen);
        seen = lines.length;
        if (initial || fresh.length > 0) onLines(fresh);
      };

      emit(true);
      let unwatch: () => void = () => {};
      try {
        unwatch = deps.watch(deps.logDir, () => {
          if (!disposed) emit(false);
        });
      } catch {
        /* no watcher installable — the initial emit still delivered */
      }

      return () => {
        if (disposed) return;
        disposed = true;
        try {
          unwatch();
        } catch {
          /* ignore */
        }
      };
    },
  };
}
