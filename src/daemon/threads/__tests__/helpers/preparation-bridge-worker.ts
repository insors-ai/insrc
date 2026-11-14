import { parentPort, threadId, workerData } from 'node:worker_threads';
import { startDaemonWorker } from '../../worker-entry.js';
import { ReviewPreparationClient } from '../../review-preparation-client.js';
import { PreparedContextReader } from '../../../../workflow/review/prepared-context.js';

startDaemonWorker(workerData);
const client=new ReviewPreparationClient(workerData.preparationPort);
parentPort!.on('message',raw=>{
 if(raw?.method!=='bridge.read')return;
 void(async()=>{
  const reader=await PreparedContextReader.open(raw.receipt,raw.limits,async()=>{await client.resolve(raw.access);},async()=>{await client.invalidate(raw.access);});
  const view=await reader.view('current') as {projection:{identity:string}},blob=await reader.query('file',raw.query) as {bytes:Uint8Array};
  parentPort!.postMessage({result:{threadId,identity:view.projection.identity,source:Buffer.from(blob.bytes).toString()}});
 })().catch(error=>parentPort!.postMessage({error:String(error)}));
});
parentPort!.postMessage('worker-ready');
