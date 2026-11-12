import { workerData } from 'node:worker_threads';
import { installReviewNativeSpawnGuard } from '../../../../shared/review-native-guard.js';
import type { ReviewWorkerInit } from '../../review-worker-contract.js';
installReviewNativeSpawnGuard();
const {runReviewWorker}=await import('../../review-worker-runtime.js');
const {RegistryReviewSources}=await import('../../../../workflow/code-review/task-review/sources.js');
const init=workerData as ReviewWorkerInit;
const provider=()=>{Atomics.add(new Int32Array(workerData.calls),0,1);throw new Error('Stored evidence must not invoke a provider');};
await runReviewWorker(init,init.review.key.family==='code'?{code:{sources:new RegistryReviewSources({repoPath:init.review.key.project,sessionId:'maintenance-fixture',requestId:0,send:()=>{}}),provider}}:{design:{provider}});
