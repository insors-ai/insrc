/** One coalesced refresh boundary; failures in one already-open consumer never
 * suppress the other or turn a successful file operation into a failure. */
export function createScratchRefresh(deps: { browse(): Promise<void>; menu(): Promise<void>; warn(message: string): void }): {
  request(): Promise<void>; dispose(): void;
} {
  let requested = false, stopped = false, running: Promise<void> | undefined;
  return {
    request: () => {
      if (stopped) return Promise.resolve(); requested = true;
      return running ??= Promise.resolve().then(async () => {
        try {
          while (requested && !stopped) {
            requested = false;
            try { await deps.browse(); } catch { deps.warn('Scratchpad browse refresh failed.'); }
            if (stopped) break;
            try { await deps.menu(); } catch { deps.warn('Scratchpad menu refresh failed.'); }
          }
        } finally { running = undefined; }
      });
    },
    dispose: () => { stopped = true; requested = false; },
  };
}
