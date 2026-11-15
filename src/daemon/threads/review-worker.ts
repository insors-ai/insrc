/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { parentPort,workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { installReviewNativeSpawnGuard } from '../../shared/review-native-guard.js';
import type { ReviewWorkerInit } from './review-worker-contract.js';

// Install before importing providers, tools or family runtimes.
installReviewNativeSpawnGuard();
Object.freeze(workerData.review.key);Object.freeze(workerData.review);
Object.defineProperty(workerData,'review',{value:workerData.review,writable:false,configurable:false,enumerable:true});
const init=workerData as ReviewWorkerInit,start=performance.now();
const registeredAt=performance.now();
const {startDaemonWorker}=await import('./worker-entry.js');
const hub=startDaemonWorker(init),registrationDone=performance.now();
const persistenceStarted=performance.now();
const {persistReviewWorkerAdmission,bindReviewWorkerAdmission,reviewWorkerAdmissionProgress}=await import('./review-worker-admission.js');
let receipt;
if(init.review.maintenance){
 const {loadPreparationCheckpoint}=await import('../../workflow/review/preparation-checkpoint.js');
 const cp=await loadPreparationCheckpoint(init.review.key),last=cp?.checkpoint.attempts.at(-1),attempt=last&&('header'in last?last.header.attempt:last.number);
 if(!cp||attempt!==init.review.attempt)throw new Error('Stored review attempt does not match maintenance request');
 const {reviewWorkerCheckpoint}=await import('./review-worker-contract.js');
 receipt={kind:'review-admission-saved' as const,key:init.review.key,incarnation:init.review.incarnation,attempt:init.review.attempt,checkpointPath:reviewWorkerCheckpoint(init.review.key)};
}else receipt=await persistReviewWorkerAdmission(init.review);
const persistenceDone=performance.now();
await bindReviewWorkerAdmission(init.review,init.preparation);
const bindingDone=performance.now();
const {ReviewPreparationClient}=await import('./review-preparation-client.js');
const client=new ReviewPreparationClient(init.preparation.port);
await client.activate();
const activationDone=performance.now();
const segments=[
 {name:'worker_registration' as const,durationMs:registrationDone-registeredAt},
 {name:'checkpoint_persistence' as const,durationMs:persistenceDone-persistenceStarted},
 {name:'checkpoint_binding' as const,durationMs:bindingDone-persistenceDone},
 {name:'runtime_activation' as const,durationMs:activationDone-bindingDone},
];
const slowest=segments.reduce((a,b)=>b.durationMs>a.durationMs?b:a).name;
const progress=init.review.maintenance?undefined:await reviewWorkerAdmissionProgress(init.review);
const acknowledged={...receipt,...(progress?{progress}:{}),timing:{mode:'cold' as const,totalMs:performance.now()-start,segments,slowest}};
parentPort!.postMessage(acknowledged);
parentPort!.postMessage('worker-ready');
const {runReviewWorker}=await import('./review-worker-runtime.js');
await runReviewWorker(init,{}, {hub,client,receipt:acknowledged});
