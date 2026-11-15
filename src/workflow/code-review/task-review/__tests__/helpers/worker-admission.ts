import { parentPort,workerData } from 'node:worker_threads';
import type { ReviewWorkerInit } from '../../../../../daemon/threads/review-worker-contract.js';
import type { LLMProvider,ReviewSessionOpts } from '../../../../../shared/types.js';
import { installReviewNativeSpawnGuard } from '../../../../../shared/review-native-guard.js';
installReviewNativeSpawnGuard();
const {runReviewWorker}=await import('../../../../../daemon/threads/review-worker-runtime.js');
const {RegistryReviewSources}=await import('../../sources.js');
const {loadStoredCheckpoint}=await import('../../checkpoint.js');
const {isCodeAdmission}=await import('../../contracts.js');
const {ReviewSourceSession}=await import('../../../../review/source-session.js');
const init=workerData as ReviewWorkerInit;
const actual=new RegistryReviewSources({repoPath:init.review.key.project,sessionId:'worker-qualification-fixture',requestId:1,send:()=>{}});
let release!:()=>void,releaseProvider!:()=>void,entered=false,calls=0,qualifiedBeforeProvider=true;
const sourceSessions=new Set<InstanceType<typeof ReviewSourceSession>>(),physical=new Set<string>();let physicalDuplicates=0;
const createSource=ReviewSourceSession.create;
ReviewSourceSession.create=async function(...args){const session=await createSource(...args);sourceSessions.add(session);return session;};
const stageSource=(ReviewSourceSession.prototype as unknown as {stage:(method:string,key:string,...args:unknown[])=>Promise<unknown>}).stage;
(ReviewSourceSession.prototype as unknown as {stage:(method:string,key:string,...args:unknown[])=>Promise<unknown>}).stage=async function(method:string,key:string,...args:unknown[]){
 if(physical.has(key))physicalDuplicates++;physical.add(key);return stageSource.call(this,method,key,...args);
};
const stats=()=>{const memories=new Set([...sourceSessions].map(session=>session.workingMemory));return{entered,calls,qualifiedBeforeProvider,
 physicalQueries:physical.size,physicalDuplicates,memoryHighWaterBytes:[...memories].reduce((total,memory)=>total+memory.snapshot().highWaterBytes,0),
 memoryBytes:[...memories].reduce((total,memory)=>total+memory.snapshot().bytes,0),nativeCommands:0,fullCheckpointNativeWrites:0};};
const gate=new Promise<void>(resolve=>{release=resolve;});
const providerGate=new Promise<void>(resolve=>{releaseProvider=resolve;});
parentPort!.on('message',(raw:{kind?:string;requestId?:string;method?:string})=>{
 if(raw.method==='fixture.block'&&workerData.fixtureBarrier){const barrier=new Int32Array(workerData.fixtureBarrier as SharedArrayBuffer);Atomics.store(barrier,6,1);while(Atomics.load(barrier,7)===0)Atomics.wait(barrier,7,0,1000);parentPort!.postMessage({kind:'reply',requestId:raw.requestId,result:{released:true}});}
 if(raw.method==='fixture.release'){release();parentPort!.postMessage({kind:'reply',requestId:raw.requestId,result:{released:true}});}
 if(raw.method==='fixture.stats')parentPort!.postMessage({kind:'reply',requestId:raw.requestId,result:stats()});
 if(raw.method==='fixture.releaseProvider'){releaseProvider();parentPort!.postMessage({kind:'reply',requestId:raw.requestId,result:{released:true}});}
});
await runReviewWorker(init,{code:{sources:{
 commit:async oid=>{entered=true;await gate;return actual.commit(oid);},
 file:(...args)=>actual.file(...args),isAncestor:(...args)=>actual.isAncestor(...args),changedRanges:(...args)=>actual.changedRanges(...args),pathChanges:(...args)=>actual.pathChanges(...args),
},provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,_options:ReviewSessionOpts)=>{
 calls++;if(workerData.fixtureBarrier)Atomics.add(new Int32Array(workerData.fixtureBarrier as SharedArrayBuffer),5,1);const stored=await loadStoredCheckpoint(`${init.review.key.project}/.insrc/tmp/code-review/${init.review.key.reviewId}.json`);
 qualifiedBeforeProvider&&=!!stored&&!isCodeAdmission(stored.attempts.at(-1)!);
 if(!qualifiedBeforeProvider)throw new Error('Provider dispatched before qualified persistence');
 if(workerData.fixtureHoldProvider)await providerGate;
 return prompt.startsWith('Derive task attribution')?{...(init.review.attempt>1?{summary:'Reassess after technical admission failure'}:{}),tasks:[{taskId:'t1',changeIndexes:[0],testIndexes:[0],...(init.review.attempt>1?{action:'reassess',reason:'Prior attempt never qualified'}:{})}]}:workerData.fixtureResult;
}} as unknown as LLMProvider)}});
