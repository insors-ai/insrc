import { workerData } from 'node:worker_threads';
import { installReviewNativeSpawnGuard } from '../../../../shared/review-native-guard.js';
import type { LLMProvider,ReviewSessionOpts } from '../../../../shared/types.js';
import type { ReviewWorkerInit } from '../../review-worker-contract.js';
installReviewNativeSpawnGuard();
const {runReviewWorker}=await import('../../review-worker-runtime.js');
const {RegistryReviewSources}=await import('../../../../workflow/code-review/task-review/sources.js');
const {publishTaskCheckpoint}=await import('../../../../workflow/code-review/task-review/publication.js');
const {saveWorkerCodeCheckpoint}=await import('../../../../workflow/code-review/task-review/worker-checkpoint.js');
const {roundWriterFor}=await import('../../../lifecycle-registry.js');
const port=workerData.fixturePort;
let sequence=0;
const pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;options:ReviewSessionOpts}>();
port.on('message',async(message:{id:number;result?:unknown;error?:string;event?:string;value?:unknown;callbackId?:number})=>{
 const p=pending.get(message.id);if(!p)return;
 if(message.event){
  try{const opts=p.options as any;const result=await opts[message.event]?.(message.value);port.postMessage({id:message.id,callbackId:message.callbackId,result});}
  catch(error){port.postMessage({id:message.id,callbackId:message.callbackId,error:String(error)});}return;
 }
 pending.delete(message.id);if(message.error)p.reject(Error(message.error));else p.resolve(message.result);
});
const provider={capabilities:{reviewActivity:true},runReviewSession:(prompt:string,schema:unknown,options:ReviewSessionOpts)=>new Promise((resolve,reject)=>{
 const id=++sequence;pending.set(id,{resolve,reject,options});
 const opts=options as any;
 options.signal?.addEventListener('abort',()=>port.postMessage({id,abort:true}),{once:true});
 port.postMessage({id,prompt,schema,options:{mode:opts.mode,cwd:opts.cwd,inactivityMs:opts.inactivityMs,internalRetry:opts.internalRetry,codeTaskCommands:opts.codeTaskCommands}});
})} as unknown as LLMProvider;
const init=workerData as ReviewWorkerInit;
const sources=new RegistryReviewSources({repoPath:init.review.key.project,sessionId:'controller-fixture',requestId:0,send:()=>{}});
await runReviewWorker(init,{code:{sources,provider:()=>provider,publish:(repo,id,hash)=>publishTaskCheckpoint(repo,hash,id,{sources,through:roundWriterFor(repo),save:saveWorkerCodeCheckpoint})}});
