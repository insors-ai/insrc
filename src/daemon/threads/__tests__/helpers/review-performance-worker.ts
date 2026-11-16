import { parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { installReviewNativeSpawnGuard } from '../../../../shared/review-native-guard.js';
import type { LLMProvider } from '../../../../shared/types.js';
installReviewNativeSpawnGuard();
const { CodePreparation } = await import('../../../../workflow/review/code-preparation.js');
const { ReviewSourceSession } = await import('../../../../workflow/review/source-session.js');
const { PreparedViewWriter } = await import('../../../../workflow/review/prepared-views.js');
const { PreparationProgress } = await import('../../../../workflow/review/preparation-progress.js');
const { HistoryBindingSession } = await import('../../../../workflow/review/history-binding.js');
const { runReviewWorker } = await import('../../review-worker-runtime.js');
const began=performance.now(),physical=new Set<string>(),sessions=new Set<InstanceType<typeof ReviewSourceSession>>();
let duplicates=0,contextWriteMs=0,historyValidationMs=0,lastStage='bootstrap',lastAt=began,contextReadyAt:number|undefined;
const stages:Record<string,number>={};
const preparations:InstanceType<typeof CodePreparation>[]=[];
let locatorCount=0,locatorBlockCount=0,workspaceFiles=0,workspaceBytes=0,qualifiedHistoryAttempts=0,preparedChanges=0,preparedTests=0,aggregateSourceBodyBytes=0;
const create=CodePreparation.create;
CodePreparation.create=async function(...args){const p=await create(...args);preparations.push(p);return p;};
const snapshot=()=>({elapsedMs:performance.now()-began,physicalQueries:physical.size,physicalDuplicates:duplicates,sourceSessions:[...sessions].map(s=>s.snapshot()),
 memoryHighWaterBytes:[...new Set([...sessions].map(session=>session.workingMemory))].reduce((sum,memory)=>sum+memory.snapshot().highWaterBytes,0),
 locatorCount,locatorBlockCount,workspaceFiles,workspaceBytes,qualifiedHistoryAttempts,preparedChanges,preparedTests,aggregateSourceBodyBytes,
 contextWriteMs,historyValidationMs,warmHandoffMs:contextReadyAt===undefined?null:performance.now()-contextReadyAt,stages:{...stages,[lastStage]:(stages[lastStage]??0)+performance.now()-lastAt},preparedPacketBytes:preparations.map(p=>(p as any).packetBytes),processMemory:process.memoryUsage()});
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
const add=PreparedViewWriter.prototype.add;
PreparedViewWriter.prototype.add=async function(id,kind,value){
 const seen=new Set<object>(),visit=(member:unknown):void=>{
  if(member instanceof Uint8Array){aggregateSourceBodyBytes+=member.byteLength;return;}
  if(!member||typeof member!=='object'||seen.has(member))return;seen.add(member);
  if(Array.isArray(member)){for(const item of member)visit(item);return;}
  for(const key of Object.keys(member))visit(Reflect.get(member,key));
 };
 visit(value);
 if(id==='source-locators'){
  const selected=value as {locators?:readonly {blocks?:readonly unknown[]}[]};locatorCount=selected.locators?.length??0;
  locatorBlockCount=selected.locators?.reduce((sum,locator)=>sum+(locator.blocks?.length??0),0)??0;
 }
 if(id==='baseline-workspace'){
  const workspace=value as {files?:readonly unknown[];byteTotals?:{stored?:number}};workspaceFiles=workspace.files?.length??0;workspaceBytes=workspace.byteTotals?.stored??0;
 }
 return add.call(this,id,kind,value);
};
const seal=CodePreparation.prototype.seal;
CodePreparation.prototype.seal=async function(review,...rest){
 qualifiedHistoryAttempts=review.checkpoint.attempts.length;preparedChanges=review.prepared.changes.length;preparedTests=review.prepared.packet.tests.length;
 const at=performance.now();try{return await seal.call(this,review,...rest);}finally{contextWriteMs+=performance.now()-at;contextReadyAt=performance.now();}
};
const bind=HistoryBindingSession.open;
HistoryBindingSession.open=async function(...args){const at=performance.now();try{return await bind(...args);}finally{historyValidationMs+=performance.now()-at;}};
const provider={capabilities:{reviewActivity:true},runReviewSession:async()=>{
 const at=performance.now();stages[lastStage]=(stages[lastStage]??0)+at-lastAt;lastAt=at;
 parentPort!.postMessage({kind:'fixture-performance-ready',...snapshot(),providerCalls:1});
 return new Promise<never>(()=>{});
}} as unknown as LLMProvider;
await runReviewWorker(workerData,{code:{provider:()=>provider}});
