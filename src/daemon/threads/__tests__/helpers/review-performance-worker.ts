import { parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { installReviewNativeSpawnGuard } from '../../../../shared/review-native-guard.js';
import type { LLMProvider } from '../../../../shared/types.js';
installReviewNativeSpawnGuard();
const { CodePreparation } = await import('../../../../workflow/review/code-preparation.js');
const { ReviewSourceSession } = await import('../../../../workflow/review/source-session.js');
const { PreparationProgress } = await import('../../../../workflow/review/preparation-progress.js');
const { HistoryBindingSession } = await import('../../../../workflow/review/history-binding.js');
const { runReviewWorker } = await import('../../review-worker-runtime.js');
const began=performance.now(),physical=new Set<string>(),sessions=new Set<InstanceType<typeof ReviewSourceSession>>();
let duplicates=0,contextWriteMs=0,historyValidationMs=0,lastStage='bootstrap',lastAt=began,contextReadyAt:number|undefined;
const stages:Record<string,number>={};
const preparations:InstanceType<typeof CodePreparation>[]=[];
const create=CodePreparation.create;
CodePreparation.create=async function(...args){const p=await create(...args);preparations.push(p);return p;};
const snapshot=()=>({elapsedMs:performance.now()-began,physicalQueries:physical.size,physicalDuplicates:duplicates,sourceSessions:[...sessions].map(s=>s.snapshot()),contextWriteMs,historyValidationMs,warmHandoffMs:contextReadyAt===undefined?null:performance.now()-contextReadyAt,stages:{...stages,[lastStage]:(stages[lastStage]??0)+performance.now()-lastAt},preparedPacketBytes:preparations.map(p=>(p as any).packetBytes),memory:process.memoryUsage()});
const post=parentPort!.postMessage.bind(parentPort!);
parentPort!.postMessage=((value:any,...rest:any[])=>{
 if(value?.kind==='review-progress'&&value.observation?.status==='failed')post({kind:'fixture-performance-failed',...snapshot(),providerCalls:0});
 return (post as any)(value,...rest);
}) as NonNullable<typeof parentPort>['postMessage'];
const stage=(ReviewSourceSession.prototype as any).stage;
(ReviewSourceSession.prototype as any).stage=async function(method:string,key:string,...rest:unknown[]){
 sessions.add(this);if(physical.has(key))duplicates++;physical.add(key);return stage.call(this,method,key,...rest);
};
const report=PreparationProgress.prototype.report;
PreparationProgress.prototype.report=async function(...args){
 const at=performance.now();stages[lastStage]=(stages[lastStage]??0)+at-lastAt;lastAt=at;lastStage=args[0];return report.apply(this,args);
};
const seal=CodePreparation.prototype.seal;
CodePreparation.prototype.seal=async function(...args){const at=performance.now();try{return await seal.apply(this,args);}finally{contextWriteMs+=performance.now()-at;contextReadyAt=performance.now();}};
const bind=HistoryBindingSession.open;
HistoryBindingSession.open=async function(...args){const at=performance.now();try{return await bind(...args);}finally{historyValidationMs+=performance.now()-at;}};
const provider={capabilities:{reviewActivity:true},runReviewSession:async()=>{
 const at=performance.now();stages[lastStage]=(stages[lastStage]??0)+at-lastAt;lastAt=at;
 parentPort!.postMessage({kind:'fixture-performance-ready',...snapshot(),providerCalls:1});
 return new Promise<never>(()=>{});
}} as unknown as LLMProvider;
await runReviewWorker(workerData,{code:{provider:()=>provider}});
