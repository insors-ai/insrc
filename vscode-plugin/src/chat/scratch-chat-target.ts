/** One concrete chat webview lifetime. A waiting insertion never migrates to a
 * replacement panel. Activation supplies the public webview delivery API. */
import type { HostToWebview } from './protocol.js';

export interface ScratchChatTarget {
  ready(): Promise<void>;
  disposed(): boolean;
  post(message: HostToWebview): PromiseLike<boolean>;
}

export function createScratchChatTarget(post: ScratchChatTarget['post']): ScratchChatTarget & {
  markReady(): void;
  dispose(): void;
} {
  let live = true, ready = false;
  const waiters = new Set<(failure?: Error) => void>();
  return {
    disposed: () => !live,
    ready: () => {
      if (!live) return Promise.reject(new Error('Chat closed before the selection could be inserted.'));
      if (ready) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const finish = (failure?: Error): void => { clearTimeout(timer); waiters.delete(finish); if (failure) reject(failure); else resolve(); };
        const timer = setTimeout(() => finish(new Error('Chat did not become ready; retry Send.')), 10_000);
        waiters.add(finish);
      });
    },
    post: message => live && ready ? post(message) : Promise.resolve(false),
    markReady: () => { if (!live) return; ready = true; for (const finish of [...waiters]) finish(); },
    dispose: () => { live = false; for (const finish of [...waiters]) finish(new Error('Chat closed before the selection could be inserted.')); },
  };
}
