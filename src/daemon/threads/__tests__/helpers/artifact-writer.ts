import { parentPort,workerData } from 'node:worker_threads';
import { startDaemonWorker } from '../../worker-entry.js';
import { createRepoLifecycle } from '../../../../workflow/artifact-core/repo-lifecycle.js';
import { serveRequests } from '../../worker-requests.js';
import { directDispatch } from '../../../server.js';
startDaemonWorker(workerData);
const store=createRepoLifecycle(workerData.repo).store;
const barrier=new Int32Array(workerData.barrier);
serveRequests(parentPort!,directDispatch({'fixture.write':()=>store.exclusive(workerData.id,async()=>{
 Atomics.add(barrier,0,1);Atomics.notify(barrier,0);
 while(Atomics.load(barrier,1)===0)await Atomics.waitAsync(barrier,1,0).value;
 return true;
})}));
parentPort!.postMessage('worker-ready');
