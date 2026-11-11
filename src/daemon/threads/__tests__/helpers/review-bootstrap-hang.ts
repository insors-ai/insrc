import { parentPort,workerData } from 'node:worker_threads';
import { startDaemonWorker } from '../../worker-entry.js';
import { getLockManager } from '../../../../shared/locks/lock-manager.js';
import { getStoreGuard } from '../../../../db/store-guard.js';
startDaemonWorker(workerData);
void getLockManager().request('review-bootstrap-held',{mode:'exclusive'},async()=>{
 await getStoreGuard().withStore('duckdb',async()=>{
  if(workerData.beforeSave)parentPort!.postMessage('worker-ready');
  await new Promise<void>(()=>{});
 },{acquireTimeoutMs:1000});
});
