/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isMainThread } from 'node:worker_threads';
import { getLogger } from '../../../shared/logger.js';
import type { LLMProvider } from '../../../shared/types.js';
import { requireReviewActivity, REVIEW_INACTIVITY_MS, ReviewActivityMonitor } from '../../../shared/review-activity.js';
import { DESIGN_LIMITS, DesignPlanSchema, DesignResultSchema, DesignReviewError, DesignReviewConflictError, DesignReviewPersistenceError, currentDesignAttempt, parseDesignRequest, requireDesign } from './contracts.js';
import type { DesignReviewCheckpoint, DesignAttempt, DesignReviewSubject, DesignReviewStart, DesignReviewRequest, DesignReviewAcknowledgement, DesignUnitAssignment, DesignChunk, DesignChunkPlan, DesignChunkResult } from './contracts.js';
import { prepareDesignSubject, assertDesignSubjectUnchanged } from './subject.js';
import { designCheckpointPath, loadDesignCheckpoint, saveDesignCheckpoint } from './checkpoint.js';
import { DesignProgressTracker, observeDesignCheckpoint } from './progress.js';
import type { DesignObservation } from './progress.js';
import { designPlanningPrompt, designChunkPrompt } from './policy.js';
import { validateDesignPlan, assessDesignResult, consolidateDesignReview } from './results.js';

const log=getLogger('design-review');
export interface DesignProvider { readonly provider:LLMProvider; readonly model:string; }
export interface DesignCoordinatorDeps {
 readonly provider?:(subject:DesignReviewSubject)=>DesignProvider;
 readonly prepare?:typeof prepareDesignSubject;
 readonly save?:typeof saveDesignCheckpoint;
 readonly load?:typeof loadDesignCheckpoint;
}
export interface DesignControllerOwner { readonly id:string; readonly signal:AbortSignal; }
export interface DesignStartContext { readonly provider?:(()=>DesignProvider)|undefined; readonly owner?:DesignControllerOwner|undefined; }
interface ControllerUnit {
 assignment:DesignUnitAssignment; resolve:(value:unknown)=>void; reject:(reason:unknown)=>void;
 accepted:Promise<void>; accept:()=>void; fail:(reason:unknown)=>void; monitor:ReviewActivityMonitor;
 sequence:number; replay:Map<number,{signature:string;completion:Promise<void>}>;
 validate:(value:unknown)=>unknown;
}
interface DesignJob {
 checkpoint:DesignReviewCheckpoint; tracker:DesignProgressTracker; abort:AbortController;
 serial:Promise<void>; done:Promise<void>; providerFactory:()=>DesignProvider;
 progressTimer?:ReturnType<typeof setTimeout>|undefined; storageError?:unknown;
 closed:boolean; owner?:DesignControllerOwner|undefined; controller?:ControllerUnit|undefined; disconnect?:(()=>void)|undefined;
}
/** Main-daemon owner. Request disconnection is deliberately not an execution signal. */
export class DesignReviewCoordinator {
 private readonly jobs=new Map<string,DesignJob>();
 private readonly admitting=new Map<string,{signature:string;promise:Promise<DesignReviewAcknowledgement>}>();
 private readonly subjects=new Map<string,string>();
 // Only tiny diagnostics remain if a terminal failure itself could not be saved.
 private readonly replays=new Map<string,{owner:DesignControllerOwner;signature:string;completion:Promise<void>}>();
 private readonly uncertain=new Map<string,{code:string;summary:string}>();
 constructor(private readonly deps:DesignCoordinatorDeps={}){
  requireDesign(isMainThread,'wrong_owner','Design review execution belongs to the main daemon');
 }
 private key(project:string,id:string):string{return `${project}\0${id}`;}
 private subjectKey(subject:DesignReviewSubject):string{return this.key(subject.project,subject.artifactId);}
 async start(input:unknown,context:DesignStartContext={}):Promise<DesignReviewAcknowledgement>{
  const decoded=parseDesignRequest(input);requireDesign(decoded.phase==='start','invalid_phase','Expected start');
  const request={...decoded,repo:await realpath(decoded.repo),artifactPath:resolve(await realpath(decoded.repo),decoded.artifactPath)};
  const key=this.key(request.repo,request.reviewId),signature=JSON.stringify(request),existing=this.admitting.get(key);
  if(existing){if(existing.signature!==signature)throw new DesignReviewConflictError('Conflicting start during admission');return existing.promise;}
  const promise=this.admit(request,context);this.admitting.set(key,{signature,promise});
  try{return await promise;}finally{if(this.admitting.get(key)?.promise===promise)this.admitting.delete(key);}
 }
 private ack(checkpoint:DesignReviewCheckpoint,active:boolean):DesignReviewAcknowledgement{
  const attempt=currentDesignAttempt(checkpoint),error=this.uncertain.get(this.key(checkpoint.project,checkpoint.reviewId));
  return {reviewId:checkpoint.reviewId,attempt:attempt.number,artifactId:checkpoint.artifactId,reviewer:checkpoint.subject.reviewer,
   status:error?'failed':!active&&(attempt.status==='pending'||attempt.status==='running')?'interrupted':attempt.status,
   checkpointPath:designCheckpointPath(checkpoint.project,checkpoint.reviewId)};
 }
 private async admit(request:DesignReviewStart,context:DesignStartContext):Promise<DesignReviewAcknowledgement>{
  const key=this.key(request.repo,request.reviewId),active=this.jobs.get(key);
  const saved=active?.checkpoint??await(this.deps.load??loadDesignCheckpoint)(request.repo,request.reviewId);
  if(saved){
   if(saved.submitted.artifactPath!==request.artifactPath||saved.submitted.attempt!==request.attempt)throw new DesignReviewConflictError('Review id belongs to another immutable submission');
   return this.ack(saved,!!active);
  }
  const prepared=(this.deps.prepare??prepareDesignSubject)(request.repo,request.artifactPath);
  if(prepared.subject.reviewer==='controller')requireDesign(context.owner&&!context.owner.signal.aborted,'wrong_owner','A live trusted reviewer connection is required');
  const subjectKey=this.subjectKey(prepared.subject);
  if(this.subjects.has(subjectKey))throw new DesignReviewConflictError('Subject already has an active review');
  this.subjects.set(subjectKey,key);
  try{
   const tracker=new DesignProgressTracker(designCheckpointPath(request.repo,request.reviewId));
   const checkpoint:DesignReviewCheckpoint={schemaVersion:1,reviewId:request.reviewId,project:request.repo,artifactId:prepared.subject.artifactId,subject:prepared.subject,
    submitted:{artifactPath:request.artifactPath,attempt:1},attempts:[{number:1,status:'pending',baseline:prepared.baseline,inventory:prepared.inventory,completedChunks:[],progress:tracker.snapshot(),startedAt:new Date().toISOString()}]};
   await(this.deps.save??saveDesignCheckpoint)(request.repo,checkpoint);
   const job:DesignJob={checkpoint,tracker,abort:new AbortController(),serial:Promise.resolve(),done:Promise.resolve(),closed:false,owner:prepared.subject.reviewer==='controller'?context.owner:undefined,
    providerFactory:context.provider??(()=>{const descriptor=this.deps.provider?.(prepared.subject);requireDesign(descriptor,'missing_provider','Review provider unavailable');return descriptor;})};
   this.jobs.set(key,job);
   if(job.owner){
    job.disconnect=()=>{const error=new DesignReviewError('controller_disconnected','Reviewing controller disconnected');job.abort.abort(error);job.controller?.reject(error);for(const [id,replay] of this.replays)if(replay.owner.id===job.owner!.id)this.replays.delete(id);};
    job.owner.signal.addEventListener('abort',job.disconnect,{once:true});
    if(job.owner.signal.aborted)job.disconnect();
   }
   job.done=new Promise<void>(finish=>{setImmediate(()=>{void this.execute(job).then(finish,finish);});});
   return this.ack(checkpoint,true);
  }catch(error){if(this.subjects.get(subjectKey)===key)this.subjects.delete(subjectKey);throw error;}
 }
 async progress(project:string,reviewId:string,attempt:number,options:{includeResult?:boolean|undefined;afterCompletedChunk?:number|undefined}={}):Promise<DesignObservation>{
  project=await realpath(project);const key=this.key(project,reviewId),job=this.jobs.get(key);
  const checkpoint=job?.checkpoint??await(this.deps.load??loadDesignCheckpoint)(project,reviewId);
  requireDesign(checkpoint,'missing_checkpoint','Design review not found');
  requireDesign(currentDesignAttempt(checkpoint).number===attempt,'missing_attempt','Design review attempt not found');
  const view=observeDesignCheckpoint(checkpoint,{...options,active:!!job,...(job?{liveProgress:job.tracker.snapshot()}:{})});
  const uncertain=this.uncertain.get(key);
  return uncertain?{...view,status:'failed',phase:'complete',requiresUserInput:true,failure:uncertain}:view;
 }
 private commit(job:DesignJob,mutate:(attempt:DesignAttempt)=>void):Promise<void>{
  const work=job.serial.catch(()=>{}).then(async()=>{
   const next=structuredClone(job.checkpoint),attempt=currentDesignAttempt(next);mutate(attempt);attempt.progress=job.tracker.snapshot();
   try{await(this.deps.save??saveDesignCheckpoint)(next.project,next);}catch(error){throw new DesignReviewPersistenceError(error instanceof Error?error.message:'Checkpoint save failed');}
   job.checkpoint=next;
  });job.serial=work;return work;
 }
 private stopProgress(job:DesignJob):void{if(job.progressTimer)clearTimeout(job.progressTimer);job.progressTimer=undefined;}
 private scheduleProgress(job:DesignJob):void{
  if(job.closed||job.progressTimer)return;
  job.progressTimer=setTimeout(()=>{
   job.progressTimer=undefined;if(job.closed)return;
   void this.commit(job,()=>{}).catch(error=>{job.storageError=error;job.abort.abort(error);});
  },250);job.progressTimer.unref();
 }
 private async unit(job:DesignJob,provider:LLMProvider|undefined,chunk?:DesignChunk):Promise<unknown>{
  const checkpoint=job.checkpoint,attempt=currentDesignAttempt(checkpoint),path=designCheckpointPath(checkpoint.project,checkpoint.reviewId);
  assertDesignSubjectUnchanged(checkpoint.subject,attempt.baseline);
  job.tracker.unit(chunk?'chunk_review':'planning',chunk?.id,attempt.completedChunks.length,attempt.plan?.chunks.length??0);
  const assignment:DesignUnitAssignment={kind:chunk?'chunk':'planning',executionId:randomUUID(),sequence:0,...(chunk?{chunkId:chunk.id}:{}),
   prompt:chunk?designChunkPrompt(checkpoint.subject,chunk,path):designPlanningPrompt(checkpoint.subject,path),schema:chunk?DesignResultSchema:DesignPlanSchema};
  await this.commit(job,a=>{a.status='running';a.current={kind:assignment.kind,executionId:assignment.executionId,sequence:0,issuedAt:new Date().toISOString(),...(chunk?{chunkId:chunk.id}:{})};});
  const validate=(input:unknown)=>chunk?assessDesignResult(input,chunk,currentDesignAttempt(job.checkpoint).completedChunks,[checkpoint.subject.documentPath,...(chunk.purpose==='consistency'?[path]:[])]):validateDesignPlan(input,attempt.inventory);
  if(job.owner){
   requireDesign(!job.owner.signal.aborted,'controller_disconnected','Reviewing controller disconnected');
   return new Promise<unknown>((resolve,reject)=>{
    let accept!:()=>void,fail!:(reason:unknown)=>void;
    const accepted=new Promise<void>((yes,no)=>{accept=yes;fail=no;});void accepted.catch(()=>{});
    const monitor=new ReviewActivityMonitor(error=>{job.abort.abort(error);reject(error);});
    job.controller={assignment,resolve,reject,accepted,accept,fail,monitor,sequence:0,replay:new Map(),validate};
   });
  }
  requireDesign(provider,'missing_provider','Review provider unavailable');
  let candidateError:unknown;
  try{
   const value=await provider.runReviewSession!(assignment.prompt,assignment.schema,{mode:'activity',cwd:checkpoint.project,inactivityMs:REVIEW_INACTIVITY_MS,signal:job.abort.signal,internalRetry:false,
    onActivity:event=>{if(!job.closed&&currentDesignAttempt(job.checkpoint).current?.executionId===assignment.executionId&&job.tracker.activity(event))this.scheduleProgress(job);},
    onCandidate:async input=>{if(job.closed||currentDesignAttempt(job.checkpoint).current?.executionId!==assignment.executionId)return{accepted:false};try{validate(input);return{accepted:true};}catch(error){candidateError=error;throw error;}}});
   if(job.storageError)throw job.storageError;if(candidateError)throw candidateError;
   assertDesignSubjectUnchanged(checkpoint.subject,attempt.baseline);
   return validate(value);
  }catch(error){throw job.storageError??candidateError??error;}
  finally{this.stopProgress(job);}
 }
 private acceptController(job:DesignJob):void{
  const unit=job.controller;if(!unit)return;unit.monitor.stop();unit.accept();job.controller=undefined;
 }
 /** Only a connection identity supplied by the IPC host grants reviewer authority. */
 async exchange(input:unknown,owner:DesignControllerOwner):Promise<unknown>{
  const request=parseDesignRequest(input);
  requireDesign(!['start','progress'].includes(request.phase),'invalid_phase','Expected controller exchange');
  const project=await realpath(request.repo),key=this.key(project,request.reviewId),job=this.jobs.get(key);
  requireDesign(!owner.signal.aborted,'wrong_owner','Reviewer connection has ended');
  const signature=JSON.stringify(request);
  if('executionId' in request){
   const replay=this.replays.get(`${key}\0${request.executionId}\0${request.sequence}`);
   if(replay){requireDesign(replay.owner.id===owner.id,'wrong_owner','Not the reviewing connection');requireDesign(replay.signature===signature,'review_conflict','Conflicting response replay');await replay.completion;return{accepted:true};}
  }
  requireDesign(job?.owner?.id===owner.id,'wrong_owner','Not the reviewing connection');
  requireDesign(currentDesignAttempt(job.checkpoint).number===request.attempt,'missing_attempt','Review attempt not active');
  const unit=job.controller;
  if(request.phase==='assignment')return{assignment:unit?{...unit.assignment,sequence:unit.sequence}:null,progress:job.tracker.snapshot()};
  requireDesign(unit,'stale_execution','No active controller assignment');
  requireDesign('executionId' in request&&request.executionId===unit.assignment.executionId,'stale_execution','Wrong execution generation');
  requireDesign(request.sequence===unit.sequence+1,'invalid_sequence','Expected the next response sequence');
  assertDesignSubjectUnchanged(job.checkpoint.subject,currentDesignAttempt(job.checkpoint).baseline);
  if(request.phase==='activity'){
   requireDesign(unit.monitor.observe(request.event),'invalid_activity','Invalid or duplicate activity event');
   unit.sequence=request.sequence;job.tracker.activity(request.event);
   const completion=this.commit(job,a=>{if(a.current)a.current.sequence=request.sequence;});
   this.replays.set(`${key}\0${request.executionId}\0${request.sequence}`,{owner,signature,completion});
   try{await completion;}catch(error){job.abort.abort(error);unit.reject(error);throw error;}return{accepted:true};
  }
  requireDesign(request.phase==='plan'&&unit.assignment.kind==='planning'||request.phase==='result'&&unit.assignment.kind==='chunk','invalid_phase','Response does not match assignment');
  const value=unit.validate(request.phase==='plan'?request.plan:(request as Extract<DesignReviewRequest,{phase:'result'}>).result);
  unit.sequence=request.sequence;
  this.replays.set(`${key}\0${request.executionId}\0${request.sequence}`,{owner,signature,completion:unit.accepted});
  unit.resolve(value);await unit.accepted;return{accepted:true};
 }
 private async execute(job:DesignJob):Promise<void>{
  const key=this.key(job.checkpoint.project,job.checkpoint.reviewId);
  try{
   let provider:LLMProvider|undefined;
   if(!job.owner){const descriptor=job.providerFactory();provider=descriptor.provider;requireReviewActivity(provider);await this.commit(job,a=>{a.model=descriptor.model;});}
   const plan=await this.unit(job,provider) as DesignChunkPlan;
   assertDesignSubjectUnchanged(job.checkpoint.subject,currentDesignAttempt(job.checkpoint).baseline);
   job.tracker.phase('persisting',0,plan.chunks.length);await this.commit(job,a=>{a.plan=plan;delete a.current;});this.acceptController(job);
   for(const chunk of plan.chunks){
    const result=await this.unit(job,provider,chunk) as DesignChunkResult;
    assertDesignSubjectUnchanged(job.checkpoint.subject,currentDesignAttempt(job.checkpoint).baseline);
    job.tracker.phase('persisting',currentDesignAttempt(job.checkpoint).completedChunks.length+1,plan.chunks.length);
    await this.commit(job,a=>{a.completedChunks.push(result);delete a.current;});this.acceptController(job);
   }
   const checkpoint=job.checkpoint,attempt=currentDesignAttempt(checkpoint);assertDesignSubjectUnchanged(checkpoint.subject,attempt.baseline);
   const report=consolidateDesignReview(checkpoint.reviewId,attempt.number,checkpoint.subject,attempt.baseline.contentIdentity,plan,attempt.completedChunks);
   job.tracker.status(report.status);
   await this.commit(job,a=>{a.status=report.status;a.report=report;a.finishedAt=new Date().toISOString();delete a.current;});
  }catch(error){
   job.controller?.fail(error);job.controller?.monitor.stop();this.stopProgress(job);const code=error instanceof DesignReviewError?error.code:'provider_failed';
   const summary=(error instanceof Error?error.message:'Design review failed').slice(0,DESIGN_LIMITS.text);
   const status=code==='artifact_changed'?'invalidated':code==='controller_disconnected'?'interrupted':'failed';job.tracker.status(status);
   try{await this.commit(job,a=>{a.status=status;a.failure={code,summary};a.finishedAt=new Date().toISOString();delete a.current;});}
   catch{this.uncertain.set(key,{code:'persistence_failed',summary:`Terminal result could not be persisted: ${summary}`.slice(0,DESIGN_LIMITS.text)});}
   log.warn({reviewId:job.checkpoint.reviewId,code},'Design review stopped');
  }finally{
   job.closed=true;job.controller?.monitor.stop();this.stopProgress(job);await job.serial.catch(()=>{});
   this.jobs.delete(key);if(this.subjects.get(this.subjectKey(job.checkpoint.subject))===key)this.subjects.delete(this.subjectKey(job.checkpoint.subject));
  }
 }
}
