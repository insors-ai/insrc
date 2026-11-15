import { parentPort, workerData } from 'node:worker_threads';
import { installReviewNativeSpawnGuard } from '../../../../shared/review-native-guard.js';
installReviewNativeSpawnGuard();
const { ReviewWorkerPreparation } = await import('../../review-worker-preparation.js');
const { runReviewWorker } = await import('../../review-worker-runtime.js');
const original = ReviewWorkerPreparation.open;
// Fault injection only: the actual production assembly performs migration.
// The parent terminates this exact worker before admission/bind/activation.
ReviewWorkerPreparation.open = async (...args) => {
 if (workerData.fixtureMigrationCrash === 'after-migration') await original(...args);
 parentPort!.postMessage({ kind: 'fixture-migration-boundary', boundary: workerData.fixtureMigrationCrash });
 return new Promise<never>(() => {});
};
await runReviewWorker(workerData);
