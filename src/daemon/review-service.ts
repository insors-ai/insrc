/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isMainThread } from 'node:worker_threads';
import type { Worker } from 'node:worker_threads';
import { realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { TrustedRpcContext } from './request-context.js';
import type { ThreadServices } from './threads/main-services.js';
import { ReviewWorkers } from './threads/review-workers.js';
import type { ReviewWorkerScope } from './threads/review-workers.js';
import type { ReviewBootstrapInput } from './threads/review-worker-contract.js';
import type { startReviewWorkerBootstrap } from './threads/review-worker-bootstrap.js';
import type { ReviewKey } from '../shared/review-resources.js';
import { parsePacket,requireReview,reviewJsonLimit } from '../workflow/code-review/task-review/contracts.js';
import { canonicalReviewStory } from '../workflow/code-review/task-review/admission.js';
import { parseDesignRequest } from '../workflow/review/design-review/contracts.js';
import { designArtifactLocator,readDesignFile } from '../workflow/review/design-review/subject.js';
import { authorPartyOf,otherParty } from '../workflow/review/party.js';
import { artifactJsonPath,buildArtifactId } from '../workflow/storage.js';
import { reviewCleanupScope } from '../workflow/review/cleanup-owner.js';
import { authorizeReviewNative,resolveReviewBinary } from './review-native-policy.js';
import { registerBuiltinTools } from './tools/builtins/index.js';
import { approvalBroker } from './approval.js';
import { persistReviewResourceAudit } from '../workflow/review/resource-audit.js';
import { lifecycleFor } from './lifecycle-registry.js';
import { repoSchemaRefusal } from './repo-schema-guard.js';
import type { DesignObservation } from '../workflow/review/design-review/progress.js';

type Admission=Omit<ReviewBootstrapInput,'incarnation'|'reviewer'|'epicHash'|'subject'>;
export interface ProductionReviewDeps{
 readonly services:ThreadServices;
 readonly registeredRepos:()=>Promise<ReadonlySet<string>>;
 readonly track:(worker:Worker,name:string)=>void;
 /** Real-worker fixture seam; production uses the ordinary compiled entry. */
 readonly start?:typeof startReviewWorkerBootstrap;
}
let installed:ProductionReviews|undefined;
export function installProductionReviews(service:ProductionReviews):void{
 if(!isMainThread||installed&&!installed.closed)throw new Error('Review host is already installed or is not main-owned');installed=service;
}
export function productionReviews():ProductionReviews{
 if(!isMainThread||!installed||installed.closed)throw new Error('Dedicated review workers unavailable');return installed;
}
/** One host for both families. Public routes cannot choose an older engine. */
export class ProductionReviews{
 readonly registry:ReviewWorkers;
 readonly resources:ReturnType<ReviewWorkers['resourceRecovery']>;
 private readonly lifetime=new AbortController();
 private readonly tracked=new Set<Worker>();
 closed=false;
 constructor(private readonly deps:ProductionReviewDeps){
  if(!isMainThread)throw new Error('Review host must be constructed on main');
  registerBuiltinTools();
  this.registry=new ReviewWorkers({services:deps.services,
   resolveScope:(key,ctx,input)=>this.scope(key,ctx,input),resolveBinary:command=>resolveReviewBinary({command}),
   authorizeNative:async(key,command,_ctx,signal,receipt,scope)=>{
    await this.registered(key.project);if(!scope)throw new Error('Registered review scope required');
    if(command.kind==='cli')this.currentReviewer(key.project,scope.subject,scope.reviewer);
    await authorizeReviewNative(key,command,scope.reviewer,signal,receipt);
   },track:(w,name)=>{this.tracked.add(w);w.once('exit',()=>this.tracked.delete(w));deps.track(w,name);},...(deps.start?{start:deps.start}:{})});
  this.resources=this.registry.resourceRecovery(approvalBroker,async(key,rows,knownScope)=>{
   const scope=knownScope??await this.scope(key),id=key.family==='code'?scope.subject.replace(/^BUILD-/,'CR-'):scope.subject;
   await persistReviewResourceAudit(lifecycleFor(key.project).store,id,key,rows);
  });
  deps.services.onReviewCleanup(async target=>{await this.registered(target.project);return this.registry.cleanupApproved(target);});
 }
 private async registered(repo:string):Promise<void>{
  if(this.closed||this.lifetime.signal.aborted||await realpath(repo)!==repo||!(await this.deps.registeredRepos()).has(repo))throw new Error('Registered live review project required');
 }
 private currentReviewer(project:string,id:string,expected?:'daemon'|'controller'):'daemon'|'controller'{
  const raw=JSON.parse(readDesignFile(project,artifactJsonPath(project,id))) as {meta:unknown};
  const author=authorPartyOf(raw.meta);if(author==='unknown')throw new Error('Tracked review author is unknown');
  const reviewer=otherParty(author);if(expected&&reviewer!==expected)throw new Error('Tracked reviewer authority changed');return reviewer;
 }
 private async scope(key:ReviewKey,_ctx?:TrustedRpcContext,input?:Admission):Promise<ReviewWorkerScope>{
  await this.registered(key.project);
  const owned=!input?this.registry.registeredScope(key):undefined;if(owned)return owned;
  const hint=input?.route,stored=hint?.storyId||hint?.artifactPath?undefined:await this.registry.describeStored(key);
  if(key.family==='code'){
   const hash=hint?.epicHash??stored?.epicHash,storyInput=hint?.storyId??stored?.storyId;
   if(!hash||!/^[a-f0-9]{16}$/.test(hash)||!storyInput)throw new Error('Canonical stored review epic/story locator required');
   const story=canonicalReviewStory(storyInput,hash),subject=buildArtifactId(hash,story);
   let reviewer:'daemon'|'controller';try{reviewer=this.currentReviewer(key.project,subject);}catch(error){if(input||!stored)throw error;reviewer=stored.reviewer;}
   return{reviewer,subject,epicHash:hash,cleanupScope:reviewCleanupScope({project:key.project,family:'code',epicHash:hash,storyId:story})};
  }
  const path=hint?.artifactPath??stored?.artifactPath;if(!path)throw new Error('Stored design artifact locator required');
  let id:string;try{id=designArtifactLocator(key.project,resolve(key.project,path)).id;}catch(error){if(input||!stored?.artifactId)throw error;id=stored.artifactId;}
  let reviewer:'daemon'|'controller';try{reviewer=this.currentReviewer(key.project,id);}catch(error){if(input||!stored)throw error;reviewer=stored.reviewer;}
  return{reviewer,subject:id,cleanupScope:reviewCleanupScope({project:key.project,family:'design',artifactId:id})};
 }
 private context(ctx:TrustedRpcContext|undefined):TrustedRpcContext{
  if(!ctx?.connectionIdentity||!ctx.daemonEpoch||!ctx.connectionSignal||ctx.connectionSignal.aborted||this.closed)throw new Error('Trusted live review connection required');
  if(ctx.connectionExecution?.mode==='session-memory')throw new Error('unsupported-temporary');
  return ctx;
 }
 private async request(raw:unknown,family:'code'|'design'){
  requireReview(raw&&typeof raw==='object'&&!Array.isArray(raw),'request','Expected review request');
  requireReview(Buffer.byteLength(JSON.stringify(raw))<=reviewJsonLimit(),'request','Review request exceeds capacity');
  const p=raw as Record<string,unknown>;
  requireReview(typeof p['repo']==='string','repo','Explicit review project required');const project=await realpath(p['repo']);await this.registered(project);
  requireReview(!repoSchemaRefusal(project),'repo','Repository schema must be current');
  requireReview(typeof p['reviewId']==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(p['reviewId']),'reviewId','Literal review identity required');
  requireReview(Number.isSafeInteger(p['attempt'])&&Number(p['attempt'])>0,'attempt','Positive safe attempt required');
  return{p,key:{project,family,reviewId:p['reviewId']} satisfies ReviewKey,attempt:Number(p['attempt'])};
 }
 private async recovery(key:ReviewKey,p:Record<string,unknown>,ctx:TrustedRpcContext):Promise<unknown|undefined>{
  const context={...ctx,connectionSignal:AbortSignal.any([ctx.connectionSignal!,this.lifetime.signal])};
  if(p['resourceRecovery']===undefined&&this.registry.identity(key))return undefined;
  const saved=await this.registry.describeStored(key);
  if(!saved&&p['resourceRecovery']===undefined)return undefined;
  // A no-document Story has no commit-document filename from which to infer
  // its root. Resolve the explicit public locator against tracked authority,
  // then carry that host-owned scope through the existing broker and audit.
  const scope=await this.scope(key,ctx,key.family==='code'&&typeof p['epicHash']==='string'&&saved?.storyId?{key,attempt:saved.attempt,actionId:'resource-scope',submitted:undefined,route:{epicHash:p['epicHash'],storyId:saved.storyId}}:undefined);
  if(p['resourceRecovery']!==undefined){
   const answer=await this.resources.clear(key,p['resourceRecovery'] as {reason:string;leaseIds?:string[]},context,scope);
   return{...answer,guidance:'Resource clearance never starts review work. Submit a separate explicit resume/recover, or the next attempt after a failed attempt.'};
  }
  const state=await this.resources.inspect(key,context,scope);
  if(state.remaining)return{status:'resource_recovery_required',remaining:state.remaining,reviewId:key.reviewId,guardDigest:state.digest,guidance:'Verify the prior resources have ended, then request resourceRecovery with a reason and optional exact leaseIds through the existing local approval broker. Clearance alone will not resume.'};
  return undefined;
 }
 async codeStart(raw:unknown,trusted?:TrustedRpcContext):Promise<unknown>{
  const {p,key,attempt}=await this.request(raw,'code'),ctx=this.context(trusted),resume=p['operation']==='resume';
  requireReview(p['operation']===undefined||p['operation']==='start'||resume,'operation','Expected start or resume');
  requireReview(typeof p['epicHash']==='string'&&/^[a-f0-9]{16}$/.test(p['epicHash']),'epicHash','Canonical epic identity required');
  requireReview(p['resourceRecovery']===undefined||resume,'resourceRecovery','Clear resources through explicit resume only');
  const recovery=await this.recovery(key,p,ctx);if(recovery)return recovery;
  const saved=resume?await this.registry.describeStored(key):undefined;
  requireReview(!resume||saved,'checkpoint','Pinned resume checkpoint missing');
  const packet=resume?undefined:parsePacket(p['packet']);
  const story=canonicalReviewStory(packet?.storyId??saved!.storyId!,p['epicHash']);
  const client=p['client'];requireReview(client===undefined||client==='claude'||client==='codex','client','Unsupported review client');
  const scope=await this.scope(key,ctx,{key,attempt,actionId:'lookup',submitted:undefined,route:{epicHash:p['epicHash'],storyId:story}});
  if(scope.reviewer==='controller')requireReview(p['timingProtocol']==='activity-v1','timingProtocol','Controller must support activity-v1');
  const ack=await this.registry.admit({key,attempt,actionId:`${resume?'resume':'start'}-${attempt}`,operation:resume?'resume':'start',submitted:resume?p['packet']:packet,route:{epicHash:p['epicHash'],storyId:story,...(client?{client}:{})}},ctx);
  await this.registry.execute(ack,ctx,resume?'resume':'start');
  return{reviewId:key.reviewId,attempt,reviewer:scope.reviewer,status:'pending',path:ack.checkpointPath,checkpointPath:ack.checkpointPath,crPublication:'pending',completedTaskIds:[],pendingTaskIds:[],admission:{validation:'unverified'}};
 }
 async codeProgress(raw:unknown,trusted?:TrustedRpcContext):Promise<unknown>{
  const {p,key,attempt}=await this.request(raw,'code');
  if(this.registry.identity(key)&&this.registry.cachedProgress(key)?.attempt===attempt)return this.registry.progress(key,this.context(trusted));
  return this.registry.storedProgress(key,attempt,{...(typeof p['epicHash']==='string'?{epicHash:p['epicHash']}:{}),...(typeof p['storyId']==='string'?{storyId:p['storyId']}:{})});
 }
 async codePublish(raw:unknown,trusted?:TrustedRpcContext):Promise<unknown>{
  const supplied=raw&&typeof raw==='object'?(raw as Record<string,unknown>)['attempt']:undefined;
  const {p,key}=await this.request({...((raw&&typeof raw==='object')?raw:{}),attempt:supplied??1},'code'),ctx=this.context(trusted);
  requireReview(typeof p['epicHash']==='string'&&/^[a-f0-9]{16}$/.test(p['epicHash']),'epicHash','Canonical epic identity required');
  requireReview(p['resourceRecovery']===undefined,'resourceRecovery','Clear resources through explicit resume only');
  const recovery=await this.recovery(key,p,ctx);if(recovery)return recovery;
  const stored=await this.registry.describeStored(key);if(!stored)throw new Error('Stored publication checkpoint missing');
  return this.registry.publishStored({key,attempt:typeof supplied==='number'?supplied:stored.attempt,actionId:`publish-${randomUUID()}`,submitted:{},route:{epicHash:p['epicHash'],...(stored.storyId?{storyId:stored.storyId}:{})}},ctx);
 }
 async codeControl(raw:unknown,trusted:TrustedRpcContext|undefined,phase:'assignment'|'scope'|'result'|'activity'):Promise<unknown>{
  const {p,key,attempt}=await this.request(raw,'code'),ctx=this.context(trusted),identity=this.registry.identity(key);
  if(!identity)throw new Error('Review owner unavailable; explicitly resume first');
  const scope=await this.scope(key);if(phase!=='activity')this.currentReviewer(key.project,scope.subject,'controller');
  return this.registry.control({...identity,attempt,phase,actionId:`control-${phase}-${attempt}`,executionId:typeof p['executionId']==='string'?p['executionId']:'pending',sequence:typeof p['sequence']==='number'?p['sequence']:1,...(typeof p['taskId']==='string'?{taskId:p['taskId']}:{}),input:phase==='scope'?p['scope']:phase==='result'?p['result']:phase==='activity'?p['event']:{}},ctx);
 }
 async design(raw:unknown,trusted?:TrustedRpcContext,client?:'claude'|'codex'|'vibe'):Promise<unknown>{
  const {p,key,attempt}=await this.request(raw,'design');
  const {resourceRecovery:_clear,...fields}=p,request=parseDesignRequest({...fields,repo:key.project});
  requireReview(p['resourceRecovery']===undefined||request.phase==='recover','resourceRecovery','Clear resources through explicit recover only');
  if(request.phase==='progress'){
   const options={...(request.artifactPath?{artifactPath:request.artifactPath}:{}),...(request.includeResult!==undefined?{includeResult:request.includeResult}:{}),...(request.afterCompletedChunk!==undefined?{afterCompletedChunk:request.afterCompletedChunk}:{})};
   if(this.registry.identity(key)&&this.registry.cachedProgress(key)?.attempt===attempt){
    const live=await this.registry.progress(key,this.context(trusted)) as DesignObservation;if(!request.includeResult)return live;
    const page=await this.registry.storedProgress(key,attempt,options) as DesignObservation;
    if(!!live.admission!==!!page.admission)return{...live,completedResults:[],nextCompletedChunk:request.afterCompletedChunk??0};
    const merged={...page,...live,completedResults:page.completedResults,nextCompletedChunk:page.nextCompletedChunk};if(!live.report)delete merged.report;return merged;
   }
   return this.registry.storedProgress(key,attempt,options);
  }
  const ctx=this.context(trusted);
  if(request.phase==='start'||request.phase==='recover'){
   const recovery=await this.recovery(key,p,ctx);if(recovery)return recovery;
   const old=this.registry.identity(key);
   if(request.phase==='recover'&&old)return this.registry.recover(old,request,ctx);
   const stored=request.phase==='recover'?await this.registry.describeStored(key):undefined;
   const path=request.phase==='start'?request.artifactPath:stored?.artifactPath;if(!path)throw new Error('Stored design artifact locator missing');
   const route={artifactPath:path,...(client?{client}:{})};
   const scope=await this.scope(key,ctx,{key,attempt,actionId:'lookup',submitted:request,route});
   const ack=await this.registry.admit({key,attempt,actionId:request.phase==='recover'?request.actionId:`start-${attempt}`,submitted:request,route},ctx);
   await this.registry.execute(ack,ctx);
   return{accepted:true,reviewId:key.reviewId,attempt,reviewer:scope.reviewer,status:'pending',checkpointPath:ack.checkpointPath,admission:{validation:'unverified'}};
  }
  const identity=this.registry.identity(key);if(!identity)throw new Error('Design owner unavailable; explicitly recover first');
  const scope=await this.scope(key);if(request.phase!=='activity')this.currentReviewer(key.project,scope.subject,'controller');
  return this.registry.control({...identity,attempt,phase:request.phase,actionId:`control-${request.phase}-${attempt}`,executionId:'executionId'in request?request.executionId:'pending',sequence:'sequence'in request?request.sequence:1,input:request},ctx);
 }
 stopAdmission():void{this.closed=true;this.lifetime.abort();}
 async shutdown():Promise<void>{this.stopAdmission();await this.registry.shutdown();await this.resources.drained();for(const worker of this.tracked)await worker.terminate();}
}
