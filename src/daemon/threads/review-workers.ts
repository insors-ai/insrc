/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { MessageChannel } from 'node:worker_threads';
import type { Worker } from 'node:worker_threads';
import type { TrustedRpcContext } from '../request-context.js';
import { registerReviewWorkerConnection,reviewWorkerConnection,registerReviewRequestOwner,assertReviewOwnerActive,disconnectReviewWorker } from '../review-request-owner.js';
import type { ThreadServices } from './main-services.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { ReviewNativeCommand,ReviewProcessReservation } from '../../shared/review-native.js';
import { ReviewProcessLeases } from './review-processes.js';
import { ReviewNativeHost } from './review-native-host.js';
import { ReviewBootstrapFence,ReviewWorkerBootstrapError,startReviewWorkerBootstrap } from './review-worker-bootstrap.js';
import type { StartedReviewWorker } from './review-worker-bootstrap.js';
import type { ReviewAdmissionReceipt,ReviewBootstrapInput,ReviewWorkerIdentity } from './review-worker-contract.js';
import { assertReviewIdentity,sameReviewWorker } from './review-worker-contract.js';
import type { ReplyEnvelope } from './channel.js';
import type { DesignRecoveryRequest } from '../../workflow/review/design-review/contracts.js';
import { ReviewResourceRecovery } from './review-resource-recovery.js';
import type { ReviewResourceRecoveryDeps } from './review-resource-recovery.js';
import { reviewJsonLimit } from '../../config/review.js';
import { reviewProgressPublication } from './review-progress.js';
import type { ReviewObservation,ReviewProgressPublication } from './review-progress.js';
import type { ReviewWorkerStatus } from '../../shared/review-worker-progress.js';
import type { ApprovalBroker } from '../approval-broker.js';
import type { ReviewCleanupTarget } from '../../workflow/review/cleanup-owner.js';
import { reviewCleanupScope,reviewUnknownCleanupScope } from '../../workflow/review/cleanup-owner.js';
import type { CleanupResult } from '../../workflow/code-review/task-review/cleanup.js';
import { startWorker } from './workers.js';
import type { StartedWorker } from './workers.js';
import { REVIEW_BOOTSTRAP_MS } from './review-worker-contract.js';

export interface ReviewWorkerScope {
 readonly reviewer:'daemon'|'controller';
 /** Resolved by the main family adapter from current tracked records. */
 readonly subject:string;
 readonly cleanupScope:string;
 readonly epicHash?:string|undefined;
}
export interface ReviewWorkersDeps {
 readonly services:ThreadServices;
 readonly resolveScope:(key:ReviewKey,context:TrustedRpcContext,input?:Omit<ReviewBootstrapInput,'incarnation'|'reviewer'|'epicHash'|'subject'>)=>Promise<ReviewWorkerScope>;
 readonly authorizeNative:(key:ReviewKey,command:ReviewNativeCommand,context:TrustedRpcContext,signal:AbortSignal,receipt?:import('../../shared/review-native.js').ReviewIntentReceipt,scope?:ReviewWorkerScope)=>Promise<void>;
 readonly resolveBinary:(command:string)=>Promise<string>;
 readonly track:(worker:Worker,name:string)=>void;
 readonly start?:typeof startReviewWorkerBootstrap | undefined;
}
export interface ReviewWorkerProgress extends ReviewWorkerIdentity {
 readonly attempt:number;readonly sequence:number;
 readonly phase:'admission'|'execution'|'publication'|'complete'|'failed'|'interrupted';
 readonly completed:number;readonly total?:number | undefined;
 readonly updatedAt:string;
 readonly observation?:ReviewObservation|undefined;readonly display?:ReviewWorkerStatus|undefined;
}
export interface ReviewWorkerControl extends ReviewWorkerIdentity {
 readonly attempt:number;
 readonly phase:'assignment'|'scope'|'plan'|'impact'|'result'|'activity'|'failure';
 readonly taskId?:string|undefined;
 readonly actionId:string;readonly executionId:string;readonly sequence:number;
 readonly input:unknown;
}
interface Entry {
 readonly cleanupOwner:boolean;
 attempt:number;
 readonly input:ReviewBootstrapInput;
 readonly scope:ReviewWorkerScope;
 readonly context:TrustedRpcContext;
 readonly fence:ReviewBootstrapFence;
 readonly lifetime:AbortController;
 connection:string;
 owner:string;
 readonly native:ReviewNativeHost;
 readonly ready:Promise<StartedReviewWorker>;
 readonly pending:Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>;
 started?:StartedReviewWorker|undefined;
 progress?:ReviewWorkerProgress|undefined;
 publication?:Promise<unknown>|undefined;
 pendingAttempt?:number|undefined;
 reclaiming?:Promise<void>|undefined;
 executed?:boolean|undefined;
 closing?:Promise<void>|undefined;
 reclaimedHealthy?:boolean|undefined;
 readonly detach:()=>void;
}
const keyOf=(key:ReviewKey)=>JSON.stringify([key.project,key.family,key.reviewId]);
/** Main owns identity and lifetime. No review source processing, model calls,
 * session-wide queue, or per-review TargetRegistry singleton registration. */
export class ReviewWorkers {
 private readonly entries=new Map<string,Entry>();
 private readonly cleanup=new Set<string>();
 private readonly cleanupTargets=new Map<string,ReviewCleanupTarget>();
 private readonly resourceHolds=new Map<string,{readonly cleanupScope:string}>();
 private sequence=0;
 private shutdownWork:Promise<void>|undefined;
 private readonly storedWorkers=new Set<Worker>();
 private readonly storedRuns=new Set<Promise<unknown>>();
 readonly leases:ReviewProcessLeases;
 constructor(private readonly deps:ReviewWorkersDeps){
  this.leases=new ReviewProcessLeases({
   authorize:async(r,c,signal)=>{const e=this.forReservation(r);this.active(e);await deps.authorizeNative(e.input.key,c,e.context,signal,e.native.intentFor(r),e.scope);this.active(e);},
   verifyIntent:(r,receipt)=>this.forReservation(r).native.verifyIntent(r,receipt),
  });
  deps.services.onReviewCleanup(target=>this.cleanupApproved(target));
 }
 private forReservation(r:ReviewProcessReservation):Entry{
  const e=this.entries.get(keyOf(r.key));if(!e||e.input.incarnation!==r.workerIncarnation)throw new Error('Foreign review incarnation');return e;
 }
 private active(e:Entry):void{
  if(this.entries.get(keyOf(e.input.key))!==e||e.closing||e.fence.state==='closing')throw new Error('Review worker fenced');assertReviewOwnerActive(e.owner,e.connection);
 }
 private scopeCleaning(key:ReviewKey,scope:Pick<ReviewWorkerScope,'cleanupScope'>):boolean{return this.cleanup.has(scope.cleanupScope)||scope.cleanupScope===reviewUnknownCleanupScope(key.project,key.family)&&[...this.cleanupTargets.values()].some(t=>t.project===key.project&&t.family===key.family);}
 async admit(input:Omit<ReviewBootstrapInput,'incarnation'|'reviewer'|'epicHash'|'subject'>,context:TrustedRpcContext):Promise<ReviewAdmissionReceipt>{
  return this.admitOwned(input,context);
 }
 private async admitOwned(input:Omit<ReviewBootstrapInput,'incarnation'|'reviewer'|'epicHash'|'subject'>,context:TrustedRpcContext,cleanupScope?:string):Promise<ReviewAdmissionReceipt>{
  if(this.shutdownWork)throw new Error('Review workers are shutting down');
  if(!context.connectionIdentity||!context.daemonEpoch||!context.connectionSignal||context.connectionSignal.aborted)throw new Error('Trusted live review connection required');
  context.assertRequestActive?.();
  if(!Number.isSafeInteger(input.attempt)||input.attempt<1||typeof input.actionId!=='string'||!input.actionId||input.actionId.length>128||input.operation!==undefined&&!['start','resume'].includes(input.operation))throw new Error('Invalid review admission header');
  const key={...input.key,project:await realpath(input.key.project)};
  const identity={key,incarnation:randomUUID()};assertReviewIdentity(identity);
  if(this.resourceHolds.has(keyOf(key)))throw new Error('Review resource recovery is in progress');
  const scope=await this.deps.resolveScope(key,context,input);
  if(!scope.subject||!scope.cleanupScope||!['daemon','controller'].includes(scope.reviewer)||scope.epicHash!==undefined&&!/^[0-9a-f]{16}$/.test(scope.epicHash))throw new Error('Invalid trusted review scope');
  if(context.connectionSignal.aborted)throw new Error('Review connection lost');
  if(this.scopeCleaning(key,scope)&&cleanupScope!==scope.cleanupScope)throw new Error('Review subject or cleanup busy');
  const previous=this.entries.get(keyOf(key));
  if(previous){
   if(previous.closing){
    if(input.attempt!==previous.input.attempt)this.assertController(previous,context);
    await previous.closing;if(this.entries.has(keyOf(key)))throw new Error('Review resources remain fenced');
    return this.admitOwned(input,context,cleanupScope);
   }
   if(previous.publication)throw new Error('Review publication is active');
   if(previous.cleanupOwner&&!cleanupScope)throw new Error('Review cleanup is active');
   this.active(previous);await previous.ready;
   if(input.attempt!==previous.input.attempt){
    this.assertController(previous,context);
    if(input.attempt!==previous.attempt+1)throw new Error('Review attempt conflict');
    await this.call(previous,'review.worker.advance',{attempt:previous.attempt,nextAttempt:input.attempt});
    await this.closeEntry(previous);
    if(this.entries.has(keyOf(key)))throw new Error('Review resources remain fenced');
    return this.admit(input,context);
   }
   const foreign=previous.scope.reviewer==='controller'&&(context.connectionIdentity!==previous.context.connectionIdentity||context.daemonEpoch!==previous.context.daemonEpoch);
   if(foreign&&input.operation==='resume'){
    // Explicit recovery can rebind stopped work. The private owner must prove
    // idleness and pinned input before its native/worker lifetime is retired.
    await this.call(previous,'review.worker.assertIdle',{});
    await this.call(previous,'review.worker.matchAdmission',{...input,actionId:previous.input.actionId,key,incarnation:previous.input.incarnation,reviewer:scope.reviewer});
    await this.closeEntry(previous);if(this.entries.has(keyOf(key)))throw new Error('Review resources remain fenced');
    return this.admit(input,context);
   }
   this.assertController(previous,context);
   return this.call(previous,'review.worker.matchAdmission',{...input,...(key.family==='code'&&input.operation==='resume'?{actionId:previous.input.actionId}:{}),key,incarnation:previous.input.incarnation,reviewer:scope.reviewer}) as Promise<ReviewAdmissionReceipt>;
  }
  if(this.cleanup.has(scope.cleanupScope)&&cleanupScope!==scope.cleanupScope||key.family==='design'&&[...this.entries.values()].some(e=>e.input.key.family==='design'&&e.input.key.project===key.project&&e.scope.subject===scope.subject))throw new Error('Review subject or cleanup busy');
  const review:ReviewBootstrapInput={attempt:input.attempt,actionId:input.actionId,submitted:input.submitted,...identity,reviewer:scope.reviewer,subject:scope.subject,...(scope.epicHash?{epicHash:scope.epicHash}:{}),...(input.operation?{operation:input.operation}:{}),...(input.maintenance?{maintenance:true as const}:{}),...(input.route?{route:input.route}:{})};
  const {port1,port2}=new MessageChannel(),connection=registerReviewWorkerConnection(port1),lifetime=new AbortController();
  const owner=registerReviewRequestOwner(connection,randomUUID(),scope.reviewer==='controller'?context.connectionSignal:lifetime.signal);
  const processOwner=this.leases.register(key,identity.incarnation),fence=new ReviewBootstrapFence(identity);
  let entry!:Entry,resolveReady!:(s:StartedReviewWorker)=>void,rejectReady!:(error:unknown)=>void;
  const ready=new Promise<StartedReviewWorker>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const native=new ReviewNativeHost({leases:this.leases,owner:processOwner,port:port1,
   assertActive:()=>this.active(entry),resolveBinary:this.deps.resolveBinary,
   persist:(operation,reservation,closure)=>this.call(entry,`review.worker.resource.${operation}`,{reservation,closure},true) as Promise<import('../../shared/review-native.js').ReviewIntentReceipt>,
   onLost:()=>{if(entry)void this.closeEntry(entry);},
  });
  const lost=()=>{void this.closeEntry(entry);};
  const detach=()=>context.connectionSignal?.removeEventListener('abort',lost);
  entry={...(key.family==='design'&&review.submitted&&typeof review.submitted==='object'&&Reflect.get(review.submitted,'phase')==='recover'&&Reflect.get(review.submitted,'operation')==='restart_full'?{pendingAttempt:review.attempt+1}:{}),cleanupOwner:cleanupScope===scope.cleanupScope,attempt:review.attempt,input:review,scope,context,fence,lifetime,connection,owner,native,ready,pending:new Map(),detach};
  this.entries.set(keyOf(key),entry);
  if(scope.reviewer==='controller')context.connectionSignal.addEventListener('abort',lost,{once:true});
  void Promise.resolve().then(()=>(this.deps.start??startReviewWorkerBootstrap)(this.deps.services,review,port2,{fence,onCreated:worker=>this.deps.track(worker,`review:${key.family}:${key.reviewId}`),onClosing:(_worker,reclaimed)=>{void reclaimed.then(()=>this.closeEntry(entry));}})).then(started=>{
   entry.started=started;
   const hubConnection=reviewWorkerConnection(started.port);
   if(!hubConnection){rejectReady(new Error('Review worker hub is not registered'));void started.worker.terminate();void this.closeEntry(entry);return;}
   disconnectReviewWorker(entry.connection);entry.connection=hubConnection;
   entry.owner=registerReviewRequestOwner(hubConnection,randomUUID(),scope.reviewer==='controller'?context.connectionSignal:lifetime.signal);
   started.port.once('close',()=>{void this.closeEntry(entry);});
   this.deps.services.board.publish({threadId:started.threadId,cls:'review',role:key.family==='code'?'code-review':'design-review',busy:true,method:'admission',since:Date.now(),queued:0});
   started.worker.on('message',(raw:unknown)=>{if(raw&&typeof raw==='object'&&Reflect.get(raw,'kind')==='review-progress'){this.acceptPublication(started.worker,raw as ReviewProgressPublication);return;}const reply=raw as ReplyEnvelope;if(reply?.kind!=='reply')return;const p=entry.pending.get(reply.requestId);if(!p)return;entry.pending.delete(reply.requestId);if(reply.error)p.reject(new Error(reply.error));else p.resolve(reply.result);});
   started.worker.once('exit',()=>{for(const p of entry.pending.values())p.reject(new Error('Review worker exited'));entry.pending.clear();void this.closeEntry(entry);});
   if(started.admission.progress)this.acceptPublication(started.worker,started.admission.progress);
   void started.reclaimed.then(()=>this.closeEntry(entry));resolveReady(started);
   if(entry.closing)void started.worker.terminate();
  },error=>{rejectReady(error);void this.closeEntry(entry);});
  const {progress:_internalProgress,...admission}=(await ready).admission;return admission;
 }
 private assertController(e:Entry,context:TrustedRpcContext):void{
  if(e.scope.reviewer==='controller'&&(context.connectionIdentity!==e.context.connectionIdentity||context.daemonEpoch!==e.context.daemonEpoch||context.connectionSignal?.aborted))throw new Error('Review owner mismatch');
 }
 private async call(e:Entry,method:string,params:object,metadata=false):Promise<unknown>{
  if(!metadata)this.active(e);
  const started=await e.ready;
  if(started.fence.reclaimed||started.worker.threadId===-1)throw new Error('Review worker reclaimed');
  const requestId=`review-control:${++this.sequence}`;
  return new Promise((resolve,reject)=>{
   e.pending.set(requestId,{resolve,reject});
   try{started.worker.postMessage({kind:'request',requestId,method,params:{...params,key:e.input.key,incarnation:e.input.incarnation},stream:false,trustedContext:{connectionIdentity:e.context.connectionIdentity,daemonEpoch:e.context.daemonEpoch,reviewOwnerNonce:e.owner}});}
   catch(error){e.pending.delete(requestId);reject(error);}
  });
 }
 /** Family adapters expose only their typed actions, never arbitrary methods. */
 async progress(key:ReviewKey,context:TrustedRpcContext):Promise<unknown>{
  const e=this.entries.get(keyOf(key));if(!e)throw new Error('Review worker not found');this.assertController(e,context);
  // Observation never waits on a blocked worker or changes its owner.
  const cached=e.progress?.observation;if(!cached)throw new Error('Review admission is not durably acknowledged yet');
  const stale=Date.now()-Date.parse(e.progress!.updatedAt)>2000||!!e.closing;
  return structuredClone({...cached,freshness:e.input.key.family==='code'?(stale?'stale':'live'):(stale?'stored':'live')});
 }
 /** Explicit retries consume stored feedback only. A cold owner still joins
  * native/resource fencing and the ordinary worker reclamation contract. */
 async publishStored(input:Omit<ReviewBootstrapInput,'incarnation'|'reviewer'|'epicHash'|'subject'>,context:TrustedRpcContext):Promise<unknown>{
  if(!Number.isSafeInteger(input.attempt)||input.attempt<1||!input.actionId||input.actionId.length>128)throw new Error('Invalid publication retry identity');
  let entry=this.entries.get(keyOf(input.key));
  if(!entry){await this.admit({...input,maintenance:true},context);entry=this.entries.get(keyOf(input.key));}
  if(!entry)throw new Error('Review worker missing');this.assertController(entry,context);this.active(entry);
  if(input.attempt!==entry.attempt)throw new Error('Publication retry attempt conflict');
  if(entry.cleanupOwner||this.scopeCleaning(entry.input.key,entry.scope))throw new Error('Review cleanup is active');
  if(entry.publication)throw new Error('Review publication is active');
  const work=this.call(entry,'review.worker.publish',{actionId:input.actionId});entry.publication=work;
  try{return await work;}
  finally{if(entry.publication===work)entry.publication=undefined;if(entry.input.maintenance)await this.closeEntry(entry);}
 }
 async recover(identity:ReviewWorkerIdentity,request:DesignRecoveryRequest,context:TrustedRpcContext):Promise<unknown>{
  const e=this.entries.get(keyOf(identity.key));if(!e||identity.key.family!=='design'||!sameReviewWorker(e.input,identity))throw new Error('Foreign design recovery');
  this.assertController(e,context);this.active(e);
  if(e.publication||e.cleanupOwner||this.scopeCleaning(e.input.key,e.scope))throw new Error('Review publication or cleanup is active');
  if(request.repo!==e.input.key.project||request.reviewId!==e.input.key.reviewId||request.phase!=='recover')throw new Error('Foreign design recovery request');
  if(request.operation==='restart_full'){
   const scope=await this.deps.resolveScope(identity.key,context,{...e.input,submitted:request});
   if(scope.reviewer!==e.scope.reviewer){
    await this.call(e,'review.worker.assertIdle',{});
    await this.closeEntry(e);if(this.entries.has(keyOf(identity.key)))throw new Error('Review resources remain fenced');
    const ack=await this.admit({key:identity.key,attempt:request.attempt,actionId:request.actionId,submitted:request},context);
    return this.execute(ack,context);
   }
   e.pendingAttempt=request.attempt+1;
  }else e.pendingAttempt=undefined;
  const result=await this.call(e,'review.worker.recover',{request}) as {attempt:number};
  if(!Number.isSafeInteger(result.attempt)||result.attempt<1)throw new Error('Invalid recovery receipt');
  if(result.attempt>e.attempt){e.attempt=result.attempt;e.progress=undefined;}
  return result;
 }
 /** Admission has already been acknowledged. The worker schedules expensive
  * qualification in the background and this private control returns promptly. */
 async execute(identity:ReviewWorkerIdentity,context:TrustedRpcContext,operation?:'start'|'resume'):Promise<unknown>{
  const e=this.entries.get(keyOf(identity.key));if(!e||!sameReviewWorker(e.input,identity))throw new Error('Foreign review execution');
  this.assertController(e,context);this.active(e);
  if(e.publication||e.cleanupOwner||this.scopeCleaning(e.input.key,e.scope))throw new Error('Review publication or cleanup is active');
  const requested=operation??e.input.operation??'start';
  if(!['start','resume'].includes(requested))throw new Error('Invalid review operation');
  const result=await this.call(e,'review.worker.execute',{operation:requested,attempt:e.input.attempt}) as {attempt:number};
  e.executed=true;
  if(Number.isSafeInteger(result.attempt)&&result.attempt>e.attempt){e.attempt=result.attempt;e.progress=undefined;}
  return result;
 }
 async control(request:ReviewWorkerControl,context:TrustedRpcContext):Promise<unknown>{
  const e=this.entries.get(keyOf(request.key));
  if(!e||!sameReviewWorker(e.input,request)||request.attempt!==e.attempt||e.scope.reviewer!=='controller')throw new Error('Foreign review control');
  this.assertController(e,context);this.active(e);
  if(e.publication||e.cleanupOwner||this.scopeCleaning(e.input.key,e.scope))throw new Error('Review publication or cleanup is active');
  const phases=e.input.key.family==='code'?['assignment','scope','result','activity']:['assignment','plan','impact','result','activity','failure'];
  if(!phases.includes(request.phase)||typeof request.actionId!=='string'||!request.actionId||request.actionId.length>128||typeof request.executionId!=='string'||!request.executionId||request.executionId.length>128||!Number.isSafeInteger(request.sequence)||request.sequence<1||request.taskId!==undefined&&(typeof request.taskId!=='string'||!request.taskId||request.taskId.length>256))throw new Error('Invalid review control envelope');
  return this.call(e,'review.worker.control',{attempt:request.attempt,phase:request.phase,actionId:request.actionId,executionId:request.executionId,sequence:request.sequence,taskId:request.taskId,input:request.input});
 }
 private acceptPublication(source:Worker,raw:ReviewProgressPublication):boolean{
  try{assertReviewIdentity(raw);}catch{return false;}
  const e=this.entries.get(keyOf(raw.key));if(!e||!sameReviewWorker(e.input,raw)||!Number.isSafeInteger(raw.sequence)||raw.sequence<1)return false;
  const advancing=raw.attempt!==e.attempt;
  if(advancing&&(e.input.key.family!=='design'||raw.attempt!==e.pendingAttempt||e.started?.worker!==source||raw.sequence<=(e.progress?.sequence??0)))return false;
  try{if(Buffer.byteLength(JSON.stringify(raw))>reviewJsonLimit())return false;
   const value=reviewProgressPublication({...e.input,attempt:raw.attempt},raw.sequence,raw.observation),d=value.display;
   if(advancing){e.attempt=raw.attempt;e.pendingAttempt=undefined;e.progress=undefined;}
   const phase=d.status==='failed'?'failed':d.status==='interrupted'?'interrupted':d.admission?'admission':['passed','changes_requested','incomplete','paused','invalidated'].includes(d.status)?'complete':d.phase==='publishing'||d.phase==='cr_publication'?'publication':'execution';
   return this.acceptProgress(source,raw,{...raw,phase,completed:d.completed,total:d.total,updatedAt:d.observedAt,observation:value.observation,display:d});
  }catch{return false;}
 }
 acceptProgress(source:Worker,identity:ReviewWorkerIdentity,progress:ReviewWorkerProgress):boolean{
  const e=this.entries.get(keyOf(identity.key));
  if(!e||e.started?.worker!==source||e.closing||!sameReviewWorker(e.input,identity)||!sameReviewWorker(identity,progress)||progress.attempt!==e.attempt||!Number.isSafeInteger(progress.sequence)||progress.sequence<1||progress.sequence<=(e.progress?.sequence??0)||!Number.isSafeInteger(progress.completed)||progress.completed<0||!['admission','execution','publication','complete','failed','interrupted'].includes(progress.phase)||typeof progress.updatedAt!=='string'||progress.updatedAt.length>40||!Number.isFinite(Date.parse(progress.updatedAt)))return false;
  if(progress.total!==undefined&&(!Number.isSafeInteger(progress.total)||progress.total<progress.completed))return false;
  e.progress=Object.freeze({key:e.input.key,incarnation:e.input.incarnation,attempt:progress.attempt,sequence:progress.sequence,phase:progress.phase,completed:progress.completed,total:progress.total,updatedAt:progress.updatedAt,...((progress.observation??e.progress?.observation)?{observation:structuredClone(progress.observation??e.progress!.observation!)}:{}),...((progress.display??e.progress?.display)?{display:structuredClone(progress.display??e.progress!.display!)}:{})});
  this.deps.services.board.publish({threadId:source.threadId,cls:'review',role:e.input.key.family==='code'?'code-review':'design-review',busy:!['complete','failed','interrupted'].includes(progress.phase),method:progress.phase,queued:0,...(progress.display?{reviewProgress:progress.display,reviewSubject:e.input.key.family==='code'&&e.input.epicHash&&e.input.submitted&&typeof e.input.submitted==='object'&&typeof Reflect.get(e.input.submitted,'storyId')==='string'?`BUILD-${e.input.epicHash}-${String(Reflect.get(e.input.submitted,'storyId'))}`:e.scope.subject}:{})});
  if(['complete','failed','interrupted'].includes(progress.phase)&&e.executed&&!e.input.maintenance&&!e.reclaiming){
   const work=this.reclaimTerminal(e);e.reclaiming=work;void work.finally(()=>{if(e.reclaiming===work)e.reclaiming=undefined;});
  }
  return true;
 }
 private async reclaimTerminal(e:Entry):Promise<void>{
  while(this.entries.get(keyOf(e.input.key))===e&&!e.closing&&e.progress&&['complete','failed','interrupted'].includes(e.progress.phase)){
   try {
    await this.call(e,'review.worker.assertIdle',{});
    if(!e.publication){await this.closeEntry(e);return;}
   } catch { if(e.closing)return; }
   // The final checkpoint can precede the coordinator's release. Do not
   // require another checkpoint write to retry this lightweight idle probe.
   await new Promise<void>(resolve=>{setTimeout(resolve,100).unref();});
  }
 }

 cachedProgress(key:ReviewKey):ReviewWorkerProgress|undefined{return this.entries.get(keyOf(key))?.progress;}
 /** Held by the artifact/story cleanup operation, including its filesystem work. */
 claimCleanup(scope:string):()=>void{
  if(this.cleanup.has(scope)||[...this.entries.values()].some(e=>e.scope.cleanupScope===scope)||[...this.resourceHolds.values()].some(h=>h.cleanupScope===scope))throw new Error('Review cleanup busy');
  this.cleanup.add(scope);let held=true;return()=>{if(held){held=false;this.cleanup.delete(scope);}};
 }
 private storedOperation(data:Record<string,unknown>,method:string):Promise<unknown>{
  if(this.shutdownWork)return Promise.reject(new Error('Review workers are shutting down'));
  const work=this.runStoredOperation(data,method);this.storedRuns.add(work);
  void work.then(()=>this.storedRuns.delete(work),()=>this.storedRuns.delete(work));return work;
 }
 private async runStoredOperation(data:Record<string,unknown>,method:string):Promise<unknown>{
  let worker:Worker|undefined,started:StartedWorker|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const starting=startWorker(this.deps.services,'review-stored-evidence','review-cleanup-discovery',{workerData:{role:'review',...data},transferList:[]},w=>{worker=w;this.storedWorkers.add(w);this.deps.track(w,'review-stored-evidence');});
  try{
   started=await Promise.race([starting,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void worker?.terminate();reject(new Error('Review cleanup discovery bootstrap timed out'));},REVIEW_BOOTSTRAP_MS);})]);
   clearTimeout(timer);
   started.port.once('close',()=>{void started?.worker.terminate();});
   return await new Promise((resolve,reject)=>{
    const id=randomUUID(),s=started!;
    const exit=()=>{s.worker.off('message',message);reject(new Error('Review cleanup discovery exited'));};
    const message=(raw:unknown)=>{const reply=raw as ReplyEnvelope;if(reply?.kind!=='reply'||reply.requestId!==id)return;s.worker.off('message',message);s.worker.off('exit',exit);if(reply.error)reject(new Error(reply.error));else resolve(reply.result as {candidates:Array<{reviewId:string;attempt:number}>;retained:string[];errors:string[]});};
    s.worker.once('exit',exit);s.worker.on('message',message);s.worker.postMessage({kind:'request',requestId:id,method,params:{},stream:false});
   });
  }finally{if(timer)clearTimeout(timer);await worker?.terminate();started??=await starting.catch(()=>undefined);if(started){await started.reclaimed;started.disconnect();}if(worker)this.storedWorkers.delete(worker);}
 }
 async storedProgress(key:ReviewKey,attempt:number,options:{artifactPath?:string;epicHash?:string;storyId?:string;includeResult?:boolean;afterCompletedChunk?:number}={}):Promise<unknown>{
  if(await realpath(key.project)!==key.project||!Number.isSafeInteger(attempt)||attempt<1)throw new Error('Canonical stored review identity required');
  assertReviewIdentity({key,incarnation:'stored-reader'});
  return this.storedOperation({history:{key,attempt,options}},'review.cleanup.history');
 }
 async describeStored(key:ReviewKey):Promise<{attempt:number;reviewer:'daemon'|'controller';storyId?:string;artifactId?:string;artifactPath?:string;epicHash?:string}|undefined>{
  assertReviewIdentity({key,incarnation:'stored-metadata'});
  return await this.storedOperation({key},'review.cleanup.describe') as {attempt:number;reviewer:'daemon'|'controller';storyId?:string;artifactId?:string;artifactPath?:string;epicHash?:string}|undefined;
 }
 registeredScope(key:ReviewKey):ReviewWorkerScope|undefined{const scope=this.entries.get(keyOf(key))?.scope;return scope?{...scope}:undefined;}
 identity(key:ReviewKey):ReviewWorkerIdentity|undefined{const e=this.entries.get(keyOf(key));return e&&!e.closing?{key:e.input.key,incarnation:e.input.incarnation}:undefined;}
 /** Actual approval consumers enter this main-owned exclusion before a worker
  * scans or deletes evidence. Worker-local coordinator maps cannot grant it. */
 async cleanupApproved(target:ReviewCleanupTarget):Promise<CleanupResult>{
  const result:CleanupResult={deleted:[],retained:[],errors:[]};
  if(!target||!['code','design'].includes(target.family)||await realpath(target.project)!==target.project)throw new Error('Canonical review cleanup target required');
  if(target.family==='code'?!/^[a-f0-9]{16}$/.test(target.epicHash)||!/^s\d+$/.test(target.storyId):!/^(DEF-[a-f0-9]{16}|(?:HLD|LLD)-[a-f0-9]{16}(?:-s\d+)?)$/.test(target.artifactId))throw new Error('Invalid review cleanup subject');
  const scope=reviewCleanupScope(target),root=`${target.project}/.insrc/tmp/${target.family==='code'?'code-review':'design-review'}`;
  const unknown=reviewUnknownCleanupScope(target.project,target.family);
  if(this.cleanup.has(scope)||[...this.resourceHolds.values()].some(h=>h.cleanupScope===scope||h.cleanupScope===unknown))return{deleted:[],retained:[root],errors:['Review cleanup or resource recovery is active']};
  this.cleanup.add(scope);
  this.cleanupTargets.set(scope,target);
  const context:TrustedRpcContext={connectionIdentity:`review-cleanup:${randomUUID()}`,daemonEpoch:this.leases.daemonInstance,connectionSignal:new AbortController().signal};
  try{
   const entries=[...this.entries.values()].filter(e=>e.scope.cleanupScope===scope||e.scope.cleanupScope===unknown);
   for(const e of entries){
    if(e.publication||e.closing||!e.progress||!['complete','failed','interrupted'].includes(e.progress.phase))throw new Error('Review admission/execution/publication is active');
    await this.call(e,'review.worker.assertIdle',{},true);
   }
   for(const e of entries){await this.closeEntry(e);if(this.entries.has(keyOf(e.input.key)))throw new Error('Review resources remain fenced');}
   const discovery=await this.storedOperation({target},target.family==='design'?'review.cleanup.execute':'review.cleanup.discover') as {candidates:Array<{reviewId:string;attempt:number}>;deleted?:string[];retained:string[];errors:string[]};result.deleted.push(...(discovery.deleted??[]));result.retained.push(...discovery.retained);result.errors.push(...discovery.errors);
   for(const candidate of discovery.candidates){
    const key:ReviewKey={project:target.project,family:target.family,reviewId:candidate.reviewId};let entry:Entry|undefined;
    try{
     const resolved=await this.deps.resolveScope(key,context,target.family==='code'?{key,attempt:candidate.attempt,actionId:'cleanup-scope',submitted:undefined,route:{epicHash:target.epicHash,storyId:target.storyId}}:undefined);if(resolved.cleanupScope!==scope)throw new Error('Cleanup subject does not match the registered host scope');
     await this.admitOwned({key,attempt:candidate.attempt,actionId:`cleanup:${randomUUID()}`,submitted:{},maintenance:true,...(target.family==='code'?{route:{epicHash:target.epicHash,storyId:target.storyId}}:{})},context,scope);
     entry=this.entries.get(keyOf(key));if(!entry)throw new Error('Cleanup owner missing');
     const cleaned=await this.call(entry,'review.worker.cleanup',target.family==='code'?{storyId:target.storyId}:{artifactId:target.artifactId},true) as CleanupResult;
     result.deleted.push(...cleaned.deleted);result.retained.push(...cleaned.retained);result.errors.push(...cleaned.errors);
    }catch(e){result.retained.push(`${root}/${candidate.reviewId}.json`);result.errors.push(e instanceof Error?e.message:String(e));}
    finally{if(entry)await this.closeEntry(entry);}
   }
  }catch(e){result.retained.push(root);result.errors.push(e instanceof Error?e.message:String(e));}
  finally{this.cleanup.delete(scope);this.cleanupTargets.delete(scope);}
  return result;
 }
 resourceRecovery(broker:ApprovalBroker,audit:ReviewResourceRecoveryDeps['audit'],approvalWaitMs?:number):ReviewResourceRecovery{
  return new ReviewResourceRecovery({services:this.deps.services,broker,audit,track:this.deps.track,approvalWaitMs,claim:async(key,context,knownScope)=>{
   if(await realpath(key.project)!==key.project)throw new Error('Canonical resource review project required');
   const scope=knownScope??await this.deps.resolveScope(key,context),id=keyOf(key),entry=this.entries.get(id);
   if(this.resourceHolds.has(id)||this.scopeCleaning(key,scope)||entry&&(!entry.fence.reclaimed||entry.reclaimedHealthy===false))throw new Error('Review work must be reclaimed before resource clearance');
   const hold={cleanupScope:scope.cleanupScope};this.resourceHolds.set(id,hold);
   const assertActive=()=>{const current=this.entries.get(id);if(this.resourceHolds.get(id)!==hold||context.connectionSignal?.aborted||current!==entry&&!(entry&&!current))throw new Error('Stale review resource recovery hold');};
   return{assertActive,release:()=>{if(this.resourceHolds.get(id)===hold)this.resourceHolds.delete(id);},apply:clearance=>{
    // An earlier receipt may already have released the captured entry.
    if(this.resourceHolds.get(id)!==hold||context.connectionSignal?.aborted)throw new Error('Stale resource clearance');
    if(!entry||!this.entries.has(id))return;if(this.entries.get(id)!==entry||!entry.fence.reclaimed||entry.reclaimedHealthy!==true)throw new Error('Review resources remain unreclaimed');
    entry.native.authorizeClearance(clearance.approvalReceipt.leaseIds);
    if(entry.native.reclaimable){entry.native.dispose();if(this.entries.get(id)===entry)this.entries.delete(id);}
   }};
  }});
 }
 private closeEntry(e:Entry):Promise<void>{
  if(e.closing)return e.closing;
  e.fence.close();e.lifetime.abort();e.detach();
  e.closing=(async()=>{
   if(e.scope.reviewer==='controller'){
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([this.call(e,'review.worker.disconnect',{},true),new Promise<void>(resolve=>{timer=setTimeout(resolve,5000);})]);}
    catch{/* Exit/loss still uses the existing cold interruption projection. */}
    finally{clearTimeout(timer);}
   }
   try{await e.native.flushClosures();}catch{/* Uncertain persisted guards keep this incarnation fenced. */}
   for(const p of e.pending.values())p.reject(new Error('Review worker closed'));e.pending.clear();
   const started=await e.ready.catch(async(error:unknown)=>{if(error instanceof ReviewWorkerBootstrapError)await error.reclaimed;return undefined;});
   let storesHealthy=true;
   if(started){await started.worker.terminate();const reclaimed=await started.reclaimed;storesHealthy=reclaimed.stores.unhealthy.length===0;started.disconnect();this.deps.services.board.forget(started.threadId);this.deps.services.board.forgetAnalyzeRunsOf(started.threadId);}
   disconnectReviewWorker(e.connection);
   e.reclaimedHealthy=storesHealthy;
   if(e.native.reclaimable&&e.fence.reclaimed&&storesHealthy){e.native.dispose();if(this.entries.get(keyOf(e.input.key))===e)this.entries.delete(keyOf(e.input.key));}
  })();return e.closing;
 }
 async shutdown():Promise<void>{
  if(this.shutdownWork)return this.shutdownWork;
  const work=(async()=>{
   await Promise.all([...this.entries.values()].map(e=>this.closeEntry(e)));
   for(const worker of this.storedWorkers)await worker.terminate();
   await Promise.allSettled([...this.storedRuns]);
  })();this.shutdownWork=work;
  try{await work;}finally{if(this.shutdownWork===work)this.shutdownWork=undefined;}
 }
}
