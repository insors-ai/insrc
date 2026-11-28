import { Worker } from 'node:worker_threads';
import { ScratchValidationClient } from './scratch-validation-client.js';

/** One native service-owned executor per document. The fixed packaged worker
 * receives bounded text only and has no native editor/file/chat capability. */
export function createScratchHostValidator(workerPath: string): { readonly client: ScratchValidationClient; dispose(): Promise<void> } {
  const worker = new Worker(workerPath);
  worker.on('error', () => { /* absorb late errors after the client unlistens during termination */ });
  let termination: Promise<number> | undefined;
  const client = new ScratchValidationClient({
    post: value => worker.postMessage(value),
    listen: (message, error) => {
      const exited = (): void => error();
      worker.on('message', message); worker.on('error', error); worker.on('exit', exited); worker.on('messageerror', error);
      return () => { worker.off('message', message); worker.off('error', error); worker.off('exit', exited); worker.off('messageerror', error); };
    },
    terminate: () => { termination ??= worker.terminate(); void termination.catch(() => {}); },
  });
  return { client, dispose: async () => { client.dispose(); await termination; } };
}
