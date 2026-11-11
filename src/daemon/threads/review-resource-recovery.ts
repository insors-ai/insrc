/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import type { Worker } from 'node:worker_threads';
import type { ReviewKey,ReviewGuardRow,ReviewAuthorizedClearance } from '../../shared/review-resources.js';
import { MAX_REVIEW_OPEN_LEASES } from '../../shared/review-resources.js';
import type { ReviewResourceSnapshot } from '../../workflow/review/resource-recovery.js';
import type { TrustedRpcContext } from '../request-context.js';
import type { ApprovalBroker } from '../approval-broker.js';
import { APPROVAL_WAIT_MS } from '../approval-broker.js';
import type { ThreadServices } from './main-services.js';
import { startWorker } from './workers.js';
import type { StartedWorker } from './workers.js';
import { assertReviewIdentity,REVIEW_BOOTSTRAP_MS } from './review-worker-contract.js';
import type { ReplyEnvelope } from './channel.js';

export interface ReviewRecoveryHold {
 assertActive():void;
 apply(clearance:ReviewAuthorizedClearance):void;
 release():void;
}
export interface ReviewResourceRecoveryDeps {
 readonly services:ThreadServices;
 readonly broker:ApprovalBroker;
 readonly claim:(key:ReviewKey,context:TrustedRpcContext)=>Promise<ReviewRecoveryHold>;
 /** Same artifact-log writer used by ordinary review publication. Required:
  * a prior receipt must be audited before a later clearance can replace it. */
 readonly audit:(key:ReviewKey,guards:readonly ReviewGuardRow[])=>Promise<void>;
 readonly track:(worker:Worker,name:string)=>void;
 readonly approvalWaitMs?:number|undefined;
}
/** Main retains the real broker outcome; only metadata crosses the registered
 * worker port. Public callers cannot submit an approval receipt. */
export class ReviewResourceRecovery {
 private readonly pending=new Map<string,Promise<void>>();
 private seq=0;
 constructor(private readonly deps:ReviewResourceRecoveryDeps){}
 private serial<T>(key:ReviewKey,run:()=>Promise<T>):Promise<T>{
  const id=JSON.stringify([key.project,key.family,key.reviewId]),old=this.pending.get(id)??Promise.resolve(),next=old.catch(()=>{}).then(run),tail=next.then(()=>{},()=>{});
  this.pending.set(id,tail);void tail.then(()=>{if(this.pending.get(id)===tail)this.pending.delete(id);});return next;
 }
 private async withWorker<T>(key:ReviewKey,context:TrustedRpcContext,run:(rpc:(method:string,params?:object)=>Promise<ReviewResourceSnapshot>,hold:ReviewRecoveryHold)=>Promise<T>):Promise<T>{
  if(!context.connectionSignal||context.connectionSignal.aborted)throw new Error('Live local resource recovery connection required');
  const identity={key:{...key},incarnation:randomUUID()};assertReviewIdentity(identity);
  const hold=await this.deps.claim(key,context);let started:StartedWorker|undefined,created:Worker|undefined;
  let starting:Promise<StartedWorker>|undefined;
  const pending=new Map<string,{resolve:(value:ReviewResourceSnapshot)=>void;reject:(error:Error)=>void}>();
  const fail=()=>{for(const p of pending.values())p.reject(new Error('Resource worker unavailable'));pending.clear();void created?.terminate();};
  context.connectionSignal.addEventListener('abort',fail,{once:true});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   starting=startWorker(this.deps.services,'review-resources','review-resource-worker',{workerData:{role:'review',resource:identity},transferList:[]},worker=>{created=worker;this.deps.track(worker,`review-resources:${key.reviewId}`);worker.once('exit',fail);if(context.connectionSignal?.aborted)void worker.terminate();});
   started=await Promise.race([starting,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{fail();reject(new Error('review_resource_bootstrap_timeout'));},REVIEW_BOOTSTRAP_MS);})]);
   clearTimeout(timer);hold.assertActive();
   started.worker.on('message',(raw:unknown)=>{const reply=raw as ReplyEnvelope;if(reply?.kind!=='reply')return;const p=pending.get(reply.requestId);if(!p)return;pending.delete(reply.requestId);if(reply.error)p.reject(new Error(reply.error));else p.resolve(reply.result as ReviewResourceSnapshot);});
   const rpc=(method:string,params:object={})=>new Promise<ReviewResourceSnapshot>((resolve,reject)=>{
    hold.assertActive();if(context.connectionSignal?.aborted){reject(new Error('Resource recovery connection ended'));return;}
    const requestId=`resource:${++this.seq}`;pending.set(requestId,{resolve,reject});
    try{started!.worker.postMessage({kind:'request',requestId,method,params:{...params,...identity},stream:false});}catch(error){pending.delete(requestId);reject(error as Error);}
   });
   return await run(rpc,hold);
  }finally{
   if(timer)clearTimeout(timer);context.connectionSignal.removeEventListener('abort',fail);fail();
   if(created)await created.terminate();started??=await starting?.catch(()=>undefined);
   if(started){const reclaimed=await started.reclaimed;started.disconnect();if(reclaimed.stores.unhealthy.length)throw new Error('Resource worker store reclamation is unhealthy');}
   hold.release();
  }
 }
 inspect(key:ReviewKey,context:TrustedRpcContext):Promise<ReviewResourceSnapshot>{return this.serial(key,()=>this.withWorker(key,context,rpc=>rpc('review.resource.inspect')));}
 async drained():Promise<void>{await Promise.all([...this.pending.values()]);}
 clear(key:ReviewKey,input:{readonly leaseIds?:readonly string[]|undefined;readonly reason:string},context:TrustedRpcContext){
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['leaseIds','reason'].includes(k))||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>2048||input.leaseIds!==undefined&&(!Array.isArray(input.leaseIds)||!input.leaseIds.length||input.leaseIds.length>MAX_REVIEW_OPEN_LEASES||input.leaseIds.some(id=>typeof id!=='string')))throw new Error('Resource clearance needs a reason and optional leaseIds; caller approval receipts are not accepted');
  key=Object.freeze({...key});input=Object.freeze({reason:input.reason,...(input.leaseIds?{leaseIds:Object.freeze([...input.leaseIds])}:{})});
  return this.serial(key,()=>this.withWorker(key,context,async(rpc,hold)=>{
   const before=await rpc('review.resource.inspect');
   await this.deps.audit(key,before.guards.filter(g=>g.resourceGuard.clearance));
   for(const row of before.guards)if(row.resourceGuard.clearance)hold.apply(row.resourceGuard.clearance);
   if(!before.remaining)return{status:'already-clear' as const,remaining:0};
   const all=before.guards.flatMap(g=>g.resourceGuard.openLeases.map(l=>l.operationId)),selected=[...(input.leaseIds??all)].sort();
   if(!selected.length||selected.length>MAX_REVIEW_OPEN_LEASES||new Set(selected).size!==selected.length||!selected.every(id=>typeof id==='string'&&all.includes(id)))throw new Error('Select an exact set of at most 128 unresolved review operations');
   const requestId=randomUUID(),expiresAt=new Date(Date.now()+(this.deps.approvalWaitMs??APPROVAL_WAIT_MS)).toISOString();
   const answer=await this.deps.broker.ask({requestId,toolId:'review_resource_clearance',approvalClass:'destructive',repoPath:key.project,arguments:Object.freeze({reviewKey:key,guardDigest:before.digest,leaseIds:Object.freeze([...selected])}),preview:{title:'Clear this review’s native-resource uncertainty',content:'Confirm the selected operations have ended. Clearance changes resource metadata; a separate explicit resume is required.'},reason:input.reason,expiresAt},context.connectionSignal);
   if(typeof answer==='string')return{status:'withheld' as const,reason:answer,remaining:before.remaining};
   if(answer.requestId!==requestId||answer.decision!=='approve'||context.connectionSignal?.aborted)throw new Error('Unverified resource clearance approval');
   hold.assertActive();
   const clearance:ReviewAuthorizedClearance={at:new Date().toISOString(),reason:input.reason,approvalReceipt:{requestId,decision:'approve',reviewKey:key,guardDigest:before.digest,leaseIds:selected}};
   const after=await rpc('review.resource.apply',{clearance});
   await this.deps.audit(key,after.guards.filter(g=>g.resourceGuard.clearance));
   hold.apply(clearance);
   return{status:after.remaining?'partially-cleared' as const:'cleared' as const,remaining:after.remaining,requestId};
  }));
 }
}
