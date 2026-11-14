import { parentPort, threadId, workerData } from 'node:worker_threads';
import { installReviewNativeSpawnGuard } from '../../../../shared/review-native-guard.js';
installReviewNativeSpawnGuard();
const { startDaemonWorker } = await import('../../worker-entry.js');
const { createRepoLifecycle } = await import('../../../../workflow/artifact-core/repo-lifecycle.js');
const { cleanupPreparedReview } = await import('../../../../workflow/review/cleanup-claim.js');
startDaemonWorker(workerData);
parentPort!.on('message', raw => {
 if (raw?.method !== 'cleanup') return;
 void cleanupPreparedReview(workerData.target, workerData.key, { store: createRepoLifecycle(workerData.key.project).store, assertIdle: async () => {}, boundary: async (stage, path) => {
  if (stage === 'unlink.after' && path.endsWith('/runtime.json')) { parentPort!.postMessage({ paused: true, threadId }); await new Promise<void>(() => {}); }
 } }).then(result => parentPort!.postMessage({ result }), error => parentPort!.postMessage({ error: String(error) }));
});
parentPort!.postMessage('worker-ready');
