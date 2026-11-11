/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { parentPort,workerData } from 'node:worker_threads';
import { installReviewNativeSpawnGuard } from '../../shared/review-native-guard.js';
import type { DaemonWorkerInit } from './worker-entry.js';
import type { ReviewWorkerIdentity } from './review-worker-contract.js';
import type { ReviewAuthorizedClearance } from '../../shared/review-resources.js';
installReviewNativeSpawnGuard();
const {startDaemonWorker}=await import('./worker-entry.js');
const {assertReviewIdentity,sameReviewWorker}=await import('./review-worker-contract.js');
const {serveRequests}=await import('./worker-requests.js');
const {directDispatch}=await import('../server.js');
const {inspectReviewResources,applyReviewResourceClearance}=await import('../../workflow/review/resource-recovery.js');
const init=workerData as DaemonWorkerInit&{readonly role:'review';readonly resource:ReviewWorkerIdentity};
if(!parentPort||init.role!=='review')throw new Error('Registered resource worker required');
assertReviewIdentity(init.resource);Object.freeze(init.resource.key);Object.freeze(init.resource);
startDaemonWorker(init);
const identity=(raw:unknown)=>{if(!raw||typeof raw!=='object'||!sameReviewWorker(init.resource,raw as ReviewWorkerIdentity))throw new Error('Foreign resource worker operation');return raw as Record<string,unknown>;};
serveRequests(parentPort,directDispatch({
 'review.resource.inspect':async raw=>{identity(raw);return inspectReviewResources(init.resource.key);},
 'review.resource.apply':async raw=>{const p=identity(raw);return applyReviewResourceClearance(init.resource.key,p['clearance'] as ReviewAuthorizedClearance);},
}));
parentPort.postMessage('worker-ready');
