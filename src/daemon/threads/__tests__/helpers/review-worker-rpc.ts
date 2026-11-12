import type { StartedReviewWorker } from '../../review-worker-bootstrap.js';

export function workerRpc(started:StartedReviewWorker,method:string,params:unknown={}):Promise<any>{
 const requestId=Math.random().toString();return new Promise((resolve,reject)=>{
  const done=()=>{started.worker.off('message',message);started.worker.off('exit',exit);};const exit=()=>{done();reject(new Error('Fixture worker exited'));};
  const message=(raw:any)=>{if(raw?.kind!=='reply'||raw.requestId!==requestId)return;done();if(raw.error)reject(new Error(raw.error));else resolve(raw.result);};
  started.worker.on('message',message);started.worker.once('exit',exit);started.worker.postMessage({kind:'request',requestId,method,params,stream:false});
 });
}
