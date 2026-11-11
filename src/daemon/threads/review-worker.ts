/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { workerData } from 'node:worker_threads';
import { installReviewNativeSpawnGuard } from '../../shared/review-native-guard.js';
import type { ReviewWorkerInit } from './review-worker-contract.js';

// Install before importing providers, tools or family runtimes.
installReviewNativeSpawnGuard();
Object.freeze(workerData.review.key);Object.freeze(workerData.review);
Object.defineProperty(workerData,'review',{value:workerData.review,writable:false,configurable:false,enumerable:true});
const {runReviewWorker}=await import('./review-worker-runtime.js');
await runReviewWorker(workerData as ReviewWorkerInit);
