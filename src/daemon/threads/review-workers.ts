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

export interface ReviewWorkerScope {
 readonly reviewer:'daemon'|'controller';
 /** Resolved by the main family adapter from current tracked records. */
 readonly subject:string;
 readonly cleanupScope:string;
 readonly epicHash?:string|undefined;
}
export interface ReviewWorkersDeps {
 readonly services:ThreadServices;
 readonly resolveScope:(key:ReviewKey,context:TrustedRpcContext)=>Promise<ReviewWorkerScope>;
 readonly authorizeNative:(key:ReviewKey,command:ReviewNativeCommand,context:TrustedRpcContext,signal:AbortSignal)=>Promise<void>;
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
 private readonly resourceHolds=new Map<string,{readonly cleanupScope:string}>();
 private sequence=0;
 readonly leases:ReviewProcessLeases;
 constructor(private readonly deps:ReviewWorkersDeps){
  this.leases=new ReviewProcessLeases({
   authorize:async(r,c,signal)=>{const e=this.forReservation(r);this.active(e);await deps.authorizeNative(e.input.key,c,e.context,signal);this.active(e);},
   verifyIntent:(r,receipt)=>this.forReservation(r).native.verifyIntent(r,receipt),
  });
 }
 private forReservation(r:ReviewProcessReservation):Entry{
  const e=this.entries.get(keyOf(r.key));if(!e||e.input.incarnation!==r.workerIncarnation)throw new Error('Foreign review incarnation');return e;
 }
 private active(e:Entry):void{
  if(this.entries.get(keyOf(e.input.key))!==e||e.closing||e.fence.state==='closing')throw new Error('Review worker fenced');assertReviewOwnerActive(e.owner,e.connection);
 }
 async admit(input:Omit<ReviewBootstrapInput,'incarnation'|'reviewer'|'epicHash'|'subject'>,context:TrustedRpcContext):Promise<ReviewAdmissionReceipt>{
  if(!context.connectionIdentity||!context.daemonEpoch||!context.connectionSignal||context.connectionSignal.aborted)throw new Error('Trusted live review connection required');
  context.assertRequestActive?.();
  if(!Number.isSafeInteger(input.attempt)||input.attempt<1||typeof input.actionId!=='string'||!input.actionId||input.actionId.length>128||input.operation!==undefined&&!['start','resume'].includes(input.operation))throw new Error('Invalid review admission header');
  const key={...input.key,project:await realpath(input.key.project)};
  const identity={key,incarnation:randomUUID()};assertReviewIdentity(identity);
  if(this.resourceHolds.has(keyOf(key)))throw new Error('Review resource recovery is in progress');
  const scope=await this.deps.resolveScope(key,context);
  if(!scope.subject||!scope.cleanupScope||!['daemon','controller'].includes(scope.reviewer)||scope.epicHash!==undefined&&!/^[0-9a-f]{16}$/.test(scope.epicHash))throw new Error('Invalid trusted review scope');
  if(context.connectionSignal.aborted)throw new Error('Review connection lost');
  const previous=this.entries.get(keyOf(key));
  if(previous){
   this.assertController(previous,context);this.active(previous);await previous.ready;
   if(input.attempt!==previous.input.attempt){
    if(input.attempt!==previous.attempt+1)throw new Error('Review attempt conflict');
    await this.call(previous,'review.worker.advance',{attempt:previous.attempt,nextAttempt:input.attempt});
    await this.closeEntry(previous);
    if(this.entries.has(keyOf(key)))throw new Error('Review resources remain fenced');
    return this.admit(input,context);
   }
   return this.call(previous,'review.worker.matchAdmission',{...input,key,incarnation:previous.input.incarnation,reviewer:scope.reviewer}) as Promise<ReviewAdmissionReceipt>;
  }
  if(this.cleanup.has(scope.cleanupScope)||key.family==='design'&&[...this.entries.values()].some(e=>e.input.key.family==='design'&&e.input.key.project===key.project&&e.scope.subject===scope.subject))throw new Error('Review subject or cleanup busy');
  const review:ReviewBootstrapInput={attempt:input.attempt,actionId:input.actionId,submitted:input.submitted,...identity,reviewer:scope.reviewer,subject:scope.subject,...(scope.epicHash?{epicHash:scope.epicHash}:{}),...(input.operation?{operation:input.operation}:{})};
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
  entry={attempt:review.attempt,input:review,scope,context,fence,lifetime,connection,owner,native,ready,pending:new Map(),detach};
  this.entries.set(keyOf(key),entry);
  if(scope.reviewer==='controller')context.connectionSignal.addEventListener('abort',lost,{once:true});
  void Promise.resolve().then(()=>(this.deps.start??startReviewWorkerBootstrap)(this.deps.services,review,port2,{fence,onCreated:worker=>this.deps.track(worker,`review:${key.family}:${key.reviewId}`),onClosing:(_worker,reclaimed)=>{void reclaimed.then(()=>this.closeEntry(entry));}})).then(started=>{
   entry.started=started;
   const hubConnection=reviewWorkerConnection(started.port);
   if(!hubConnection){rejectReady(new Error('Review worker hub is not registered'));void started.worker.terminate();void this.closeEntry(entry);return;}
   disconnectReviewWorker(entry.connection);entry.connection=hubConnection;
   entry.owner=registerReviewRequestOwner(hubConnection,randomUUID(),scope.reviewer==='controller'?context.connectionSignal:lifetime.signal);
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
 async recover(identity:ReviewWorkerIdentity,request:DesignRecoveryRequest,context:TrustedRpcContext):Promise<unknown>{
  const e=this.entries.get(keyOf(identity.key));if(!e||identity.key.family!=='design'||!sameReviewWorker(e.input,identity))throw new Error('Foreign design recovery');
  this.assertController(e,context);this.active(e);
  if(request.repo!==e.input.key.project||request.reviewId!==e.input.key.reviewId||request.phase!=='recover')throw new Error('Foreign design recovery request');
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
  const requested=operation??e.input.operation??'start';
  if(!['start','resume'].includes(requested))throw new Error('Invalid review operation');
  const result=await this.call(e,'review.worker.execute',{operation:requested,attempt:e.input.attempt}) as {attempt:number};
  if(Number.isSafeInteger(result.attempt)&&result.attempt>e.attempt){e.attempt=result.attempt;e.progress=undefined;}
  return result;
 }
 async control(request:ReviewWorkerControl,context:TrustedRpcContext):Promise<unknown>{
  const e=this.entries.get(keyOf(request.key));
  if(!e||!sameReviewWorker(e.input,request)||request.attempt!==e.attempt||e.scope.reviewer!=='controller')throw new Error('Foreign review control');
  this.assertController(e,context);this.active(e);
  const phases=e.input.key.family==='code'?['assignment','scope','result','activity']:['assignment','plan','impact','result','activity','failure'];
  if(!phases.includes(request.phase)||typeof request.actionId!=='string'||!request.actionId||request.actionId.length>128||typeof request.executionId!=='string'||!request.executionId||request.executionId.length>128||!Number.isSafeInteger(request.sequence)||request.sequence<1||request.taskId!==undefined&&(typeof request.taskId!=='string'||!request.taskId||request.taskId.length>256))throw new Error('Invalid review control envelope');
  return this.call(e,'review.worker.control',{attempt:request.attempt,phase:request.phase,actionId:request.actionId,executionId:request.executionId,sequence:request.sequence,taskId:request.taskId,input:request.input});
 }
 private acceptPublication(source:Worker,raw:ReviewProgressPublication):boolean{
  try{assertReviewIdentity(raw);}catch{return false;}
  const e=this.entries.get(keyOf(raw.key));if(!e||!sameReviewWorker(e.input,raw)||raw.attempt!==e.attempt||!Number.isSafeInteger(raw.sequence)||raw.sequence<1)return false;
  try{if(Buffer.byteLength(JSON.stringify(raw))>reviewJsonLimit())return false;
   const value=reviewProgressPublication({...e.input,attempt:e.attempt},raw.sequence,raw.observation),d=value.display;
   const phase=d.status==='failed'?'failed':d.status==='interrupted'?'interrupted':d.admission?'admission':['passed','changes_requested','incomplete','paused','invalidated'].includes(d.status)?'complete':d.phase==='publishing'||d.phase==='cr_publication'?'publication':'execution';
   return this.acceptProgress(source,raw,{...raw,phase,completed:d.completed,total:d.total,updatedAt:d.observedAt,observation:value.observation,display:d});
  }catch{return false;}
 }
 acceptProgress(source:Worker,identity:ReviewWorkerIdentity,progress:ReviewWorkerProgress):boolean{
  const e=this.entries.get(keyOf(identity.key));
  if(!e||e.started?.worker!==source||e.closing||!sameReviewWorker(e.input,identity)||!sameReviewWorker(identity,progress)||progress.attempt!==e.attempt||!Number.isSafeInteger(progress.sequence)||progress.sequence<1||progress.sequence<=(e.progress?.sequence??0)||!Number.isSafeInteger(progress.completed)||progress.completed<0||!['admission','execution','publication','complete','failed','interrupted'].includes(progress.phase)||typeof progress.updatedAt!=='string'||progress.updatedAt.length>40||!Number.isFinite(Date.parse(progress.updatedAt)))return false;
  if(progress.total!==undefined&&(!Number.isSafeInteger(progress.total)||progress.total<progress.completed))return false;
  e.progress=Object.freeze({key:e.input.key,incarnation:e.input.incarnation,attempt:progress.attempt,sequence:progress.sequence,phase:progress.phase,completed:progress.completed,total:progress.total,updatedAt:progress.updatedAt,...((progress.observation??e.progress?.observation)?{observation:structuredClone(progress.observation??e.progress!.observation!)}:{}),...((progress.display??e.progress?.display)?{display:structuredClone(progress.display??e.progress!.display!)}:{})});
  this.deps.services.board.publish({threadId:source.threadId,cls:'review',role:e.input.key.family==='code'?'code-review':'design-review',busy:!['complete','failed','interrupted'].includes(progress.phase),method:progress.phase,queued:0,...(progress.display?{reviewProgress:progress.display,reviewSubject:e.input.key.family==='code'&&e.input.epicHash&&e.input.submitted&&typeof e.input.submitted==='object'&&typeof Reflect.get(e.input.submitted,'storyId')==='string'?`BUILD-${e.input.epicHash}-${String(Reflect.get(e.input.submitted,'storyId'))}`:e.scope.subject}:{})});return true;
 }
 cachedProgress(key:ReviewKey):ReviewWorkerProgress|undefined{return this.entries.get(keyOf(key))?.progress;}
 /** Held by the artifact/story cleanup operation, including its filesystem work. */
 claimCleanup(scope:string):()=>void{
  if(this.cleanup.has(scope)||[...this.entries.values()].some(e=>e.scope.cleanupScope===scope)||[...this.resourceHolds.values()].some(h=>h.cleanupScope===scope))throw new Error('Review cleanup busy');
  this.cleanup.add(scope);let held=true;return()=>{if(held){held=false;this.cleanup.delete(scope);}};
 }
 resourceRecovery(broker:ApprovalBroker,audit:ReviewResourceRecoveryDeps['audit'],approvalWaitMs?:number):ReviewResourceRecovery{
  return new ReviewResourceRecovery({services:this.deps.services,broker,audit,track:this.deps.track,approvalWaitMs,claim:async(key,context)=>{
   if(await realpath(key.project)!==key.project)throw new Error('Canonical resource review project required');
   const scope=await this.deps.resolveScope(key,context),id=keyOf(key),entry=this.entries.get(id);
   if(this.resourceHolds.has(id)||this.cleanup.has(scope.cleanupScope)||entry&&(!entry.fence.reclaimed||entry.reclaimedHealthy===false))throw new Error('Review work must be reclaimed before resource clearance');
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
 async shutdown():Promise<void>{await Promise.all([...this.entries.values()].map(e=>this.closeEntry(e)));}
}
