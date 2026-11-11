import { register } from 'tsx/esm/api';
import { parentPort, threadId, workerData } from 'node:worker_threads';
register();
const { installReviewNativeSpawnGuard } = await import(workerData.guard);
installReviewNativeSpawnGuard();
const { CliProvider } = await import(workerData.provider);
const { withReviewNativeTransport } = await import(workerData.bridge);
let next=0;
const pending=new Map(),consumers=new Map();
function rpc(op,args){const id=++next;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});parentPort.postMessage({kind:'request',id,op,args});});}
parentPort.on('message',async message=>{
 if(message.kind==='reply'){const p=pending.get(message.id);pending.delete(message.id);if(message.error)p?.reject(Error(message.error));else p?.resolve(message.value);}
 if(message.kind==='output'){
  try{await consumers.get(message.output.operationId)?.(message.output);parentPort.postMessage({kind:'ack',id:message.id});}
  catch(error){parentPort.postMessage({kind:'ack',id:message.id,error:String(error)});}
 }
});
const transport={
 resolveBinary:command=>rpc('resolveBinary',command),reserve:command=>rpc('reserve',command),
 saveOpenIntent:r=>rpc('saveOpenIntent',r),saveClosedIntent:r=>rpc('saveClosedIntent',r),cancel:r=>rpc('cancel',r),
 waitStarted:r=>rpc('waitStarted',r),write:(r,bytes,end)=>rpc('write',{r,bytes,end}),
 start:async(r,receipt,consume)=>{consumers.set(r.operationId,consume);try{return await rpc('start',{r,receipt});}finally{consumers.delete(r.operationId);}},
};
const provider=new CliProvider({kind:'claude',binPath:'fixture-cli'});
const run=()=>provider.runReviewSession('test prompt',{type:'object',required:['ok'],properties:{ok:{type:'boolean'}},additionalProperties:false},{
 mode:'activity',cwd:workerData.repo,signal:new AbortController().signal,inactivityMs:1800000,internalRetry:false,
 onActivity:event=>{if(event.kind==='model_output')parentPort.postMessage({kind:'active',threadId});},
 onCandidate:async()=>{parentPort.postMessage({kind:'parsed',threadId});return{accepted:true};},
});
try{
 const value=await (workerData.noTransport?run():withReviewNativeTransport(transport,run));
 parentPort.postMessage({kind:'done',value,threadId});
}catch(error){parentPort.postMessage({kind:'done',error:String(error),threadId});}
parentPort.close();
