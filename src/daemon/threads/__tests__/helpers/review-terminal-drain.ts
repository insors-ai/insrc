import {workerData} from 'node:worker_threads';
import {installReviewNativeSpawnGuard} from '../../../../shared/review-native-guard.js';
import type {ReviewWorkerInit} from '../../review-worker-contract.js';
installReviewNativeSpawnGuard();
const {TaskReviewCoordinator}=await import('../../../../workflow/code-review/task-review/coordinator.js');
const {runReviewWorker}=await import('../../review-worker-runtime.js');
const barrier=new Int32Array(workerData.fixtureBusy as SharedArrayBuffer),original=TaskReviewCoordinator.prototype.isActive;
// Simulate a family finishing its final checkpoint before releasing activity.
// All registry/bootstrap/transport behavior remains the production behavior.
TaskReviewCoordinator.prototype.isActive=function(project:string,id:string){Atomics.add(barrier,1,1);return Atomics.load(barrier,0)!==0||original.call(this,project,id);};
await runReviewWorker(workerData as ReviewWorkerInit);
