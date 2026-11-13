import { capacityCheckedResult } from './capacity.js';
import { failAttribution, unmappedTaskFailure, attributionTimedOut } from './attribution-failure.js';
import { recordAttributionRejection, MAX_ATTRIBUTION_SUBMISSIONS } from './attribution-repair.js';
import { persistFailureDiagnostic, resolveFailureDiagnostics } from './diagnostics.js';
import { DiagnosticSnapshotSchema } from './diagnostic-schema.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { ReviewProgressTracker } from './progress.js';
import { ReviewProgressPersistence } from './progress-persistence.js';
import { access, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import { ReviewActivityMonitor, REVIEW_INACTIVITY_MS } from '../../../shared/review-activity.js';
import { isDeepStrictEqual } from 'node:util';
import type { TSchema } from '@sinclair/typebox';
import { getLogger } from '../../../shared/logger.js';
import { decodeReview, requireReview, TaskReviewInputError, TaskResultSchema } from './contracts.js';
import type { ReviewCheckpoint, ReviewStatus } from './contracts.js';
import type { PlanTask } from '../../artifacts/plan.js';
import type { TaskAssignment } from './packet.js';
import type { ReviewSources } from './sources.js';
import { assessTaskResult, attributionSchema, attributionPrompt, directReviewAssignments, reviewAssignments, reuseAssessment, taskFailure, taskReferences } from './assessment.js';
import { assignmentPrompt } from './policy.js';
import { assignmentResultSchema } from './result-schema.js';
import { completeReview, persistReview, persistAcceptedAttribution } from './execution.js';
import type { AdmittedReview, ReviewPersistence } from './execution.js';

/** Trusted in-process transport lifetime, never accepted from caller JSON. */
export interface ControllerReviewOwner { readonly id:string; readonly signal:AbortSignal; readonly requestSignal?:AbortSignal|undefined; readonly assertReviewer?:(()=>void)|undefined; }
export interface ControllerFrame {
 reviewId:string;attempt:number;path:string;reviewer:'controller';status:ReviewStatus;kind:'scope'|'task'|'done';crPublication:'pending'|'complete';
 completedTaskIds:readonly string[];pendingTaskIds:readonly string[];
 taskId?:string|undefined;prompt?:string|undefined;schema?:TSchema|undefined;executionId?:string|undefined;nextSequence?:number|undefined;timingProtocol:'activity-v1';timing?:{mode:'activity';inactivityMs:1800000;inactivityRemainingMs:number;expectedDurationMs:number}|undefined;crPath?:string|undefined;error?:string|undefined;
}
export interface ControllerDeps extends ReviewPersistence {
 readonly sources:ReviewSources;readonly now?:(()=>number)|undefined;readonly timer?:((callback:()=>void,ms:number)=>()=>void)|undefined;
 readonly release:(drop:boolean)=>void;
}
const log=getLogger('task-review:controller');
/** Only the adapter differs: the controller supplies feedback; all assessment and persistence policy is shared. */
export class ControllerTaskReview {
 readonly done:Promise<void>;
 readonly progress:ReviewProgressTracker;
 readonly progressPersistence:ReviewProgressPersistence;
 private resolveDone!:()=>void;
 private tail:Promise<unknown>=Promise.resolve();
 private assignments:readonly TaskAssignment[]|undefined;
 private lastDurable:ReviewCheckpoint;
 private monitor:ReviewActivityMonitor|undefined;
 private executionId:string|undefined;
 private sequence=0;
 private receipt:{taskId:string;executionId:string;sequence:number;kind:string;input:unknown;response:unknown}|undefined;
 private finished=false;
 private stopped=false;
 private readonly selected:readonly PlanTask[];
 constructor(private readonly review:AdmittedReview,private readonly owner:ControllerReviewOwner,private readonly deps:ControllerDeps){
  this.lastDurable=structuredClone(review.checkpoint);
  this.progress=new ReviewProgressTracker(deps.now?{now:deps.now,wall:()=>new Date().toISOString()}:undefined,review.attempt.progress);
  this.progressPersistence=new ReviewProgressPersistence(review.attempt,this.progress,{serial:work=>this.queue(undefined,work),save:async()=>{await persistReview(this.review,this.deps);this.lastDurable=structuredClone(this.review.checkpoint);}});
  this.done=new Promise(resolve=>{this.resolveDone=resolve;});
  this.selected=review.prepared.tasks.filter(task=>!review.prepared.packet.taskId||task.id===review.prepared.packet.taskId).sort((a,b)=>a.order-b.order);
  const disconnect=()=>{if(this.finished){this.retire(true);return;}void this.queue(undefined,()=>this.stop()).catch(error=>log.warn({error:String(error)},'Controller interruption could not be persisted'));};
  owner.signal.addEventListener('abort',disconnect,{once:true});if(owner.signal.aborted)disconnect();
 }
 assignment(owner:ControllerReviewOwner):Promise<ControllerFrame>{return this.queue(owner,()=>this.frame(owner));}
 scope(input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<ControllerFrame>{return this.exchange('scope',input,owner,envelope,async()=>{
  requireReview(!this.assignments&&!directReviewAssignments(this.review),'scope','Task attribution is not awaiting a response');
  this.checkTime();
  const previous=structuredClone(this.lastDurable);
  let assignments:readonly TaskAssignment[];
  try{
   requireReview((this.review.attempt.header.attributionRepair?.rejections ?? 0) < MAX_ATTRIBUTION_SUBMISSIONS,'attribution','Attribution correction budget exhausted');
   assignments=await bindTaskFinalIdentities(this.review,assignmentsToRows(this.review,reviewAssignments(this.review,input)));
  }catch(error){
   if(await recordAttributionRejection(this.review,error,()=>this.persist()))return this.frame(owner);
   this.monitor?.stop();this.monitor=undefined;delete this.review.attempt.header.activeTaskId;
   failAttribution(this.review.attempt,error,false);
   for(const task of this.selected.filter(task=>!this.review.attempt['review-response'].tasks.some(result=>result.taskId===task.id))){
    this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,unmappedTaskFailure(task.id,false)];
    await this.persist();
   }
   this.finished=true;await this.complete();this.retire(false);return this.base('done');
  }
  this.checkTime();
  const priorDiagnostics=this.review.attempt['review-response'].failureDiagnostics;
  resolveFailureDiagnostics(this.review.attempt,'attribution');try{await this.accept(previous);}catch(error){
   if(priorDiagnostics)this.review.attempt['review-response'].failureDiagnostics=priorDiagnostics;else delete this.review.attempt['review-response'].failureDiagnostics;
   throw error;
  }
  this.assignments=assignments;
  return this.frame(owner);
 });}
 submit(input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<ControllerFrame>{return this.exchange('result',input,owner,envelope,async()=>{
  const raw=decodeReview(TaskResultSchema,input);
  const assignment=this.assignments?.find(task=>task.taskId===raw.taskId);
  requireReview(assignment,'taskId','Wrong or unassigned task');
  requireReview(this.current()?.id===raw.taskId,'taskId','Result is not for the current task');this.checkTime();
  const refs=await taskReferences(this.deps.sources,this.review.prepared,assignment);
  const result=capacityCheckedResult(this.review,await assessTaskResult(this.deps.sources,assignment,raw,refs));
  this.progress.phase('feedback_persistence');
  this.assertOwner(owner);
  const priorTasks=this.review.attempt['review-response'].tasks,priorDiagnostics=this.review.attempt['review-response'].failureDiagnostics,priorActive=this.review.attempt.header.activeTaskId;
  this.review.attempt['review-response'].tasks=[...priorTasks,result];
  if(result.status!=='failed')resolveFailureDiagnostics(this.review.attempt,'assessment',raw.taskId);
  delete this.review.attempt.header.activeTaskId;
  try{await this.persist();}catch(error){
   this.review.attempt['review-response'].tasks=priorTasks;
   if(priorDiagnostics)this.review.attempt['review-response'].failureDiagnostics=priorDiagnostics;else delete this.review.attempt['review-response'].failureDiagnostics;
   if(priorActive!==undefined)this.review.attempt.header.activeTaskId=priorActive;else delete this.review.attempt.header.activeTaskId;
   throw error;
  }
  this.monitor?.stop();this.monitor=undefined;
  return this.frame(owner);
 });}
 private current(){return this.selected.find(task=>!this.review.attempt['review-response'].tasks.some(result=>result.taskId===task.id));}
 private assertOwner(owner:ControllerReviewOwner):void{
  requireReview(!this.stopped&&owner.id===this.owner.id&&owner.signal===this.owner.signal&&!owner.signal.aborted&&!owner.requestSignal?.aborted,'reviewer','wrong-reviewer or disconnected controller');
  this.owner.assertReviewer?.();
 }
 private queue<T>(owner:ControllerReviewOwner|undefined,run:()=>Promise<T>):Promise<T>{
  const operation=this.tail.then(async()=>{
   try{await access(this.review.path);}catch(error){this.retire(true);throw new TaskReviewInputError('checkpoint',(error as NodeJS.ErrnoException).code==='ENOENT'?'missing-checkpoint':String(error));}
   if(owner)this.assertOwner(owner);
   return run();
  });
  this.tail=operation.catch(error=>{if(!(error instanceof TaskReviewInputError))this.retire(true);});
  return operation;
 }
 activity(input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<unknown>{
  return this.exchange('activity',input,owner,envelope,async()=>{
   const event=decodeReview(Type.Union([
    Type.Object({kind:Type.Literal('diagnostic'),phase:Type.Union([Type.Literal('attribution'),Type.Literal('assessment')]),diagnostic:DiagnosticSnapshotSchema},{additionalProperties:false}),
    Type.Object({kind:Type.Literal('model_output')},{additionalProperties:false}),
    Type.Object({kind:Type.Union([Type.Literal('tool_started'),Type.Literal('tool_completed')]),toolId:Type.String({minLength:1,maxLength:256})},{additionalProperties:false}),
   ]),input);
   if(event.kind==='diagnostic'){
    requireReview(this.monitor,'executionId','No active diagnostic execution');
    requireReview(event.phase===(this.assignments?'assessment':'attribution'),'diagnostic','Stale diagnostic phase');
    await persistFailureDiagnostic(this.review,this.assignments?'assessment':'attribution',this.assignments?this.current()!.id:undefined,event.diagnostic,()=>this.persist());
    return{reviewId:this.review.checkpoint.reviewId,attempt:this.review.attempt.header.attempt,taskId:this.current()!.id,executionId:this.executionId,acceptedSequence:this.sequence,inactivityRemainingMs:this.remaining()};
   }
   const native={sessionId:this.executionId!,sequence:this.sequence+1,...event};
   requireReview(this.monitor?.observe(native),'activity','Invalid or duplicate native activity');
   const prior=this.progress.snapshot().phase;this.progress.activity(native,this.monitor!.snapshot().tools.length);this.progressPersistence.request(prior!==this.progress.snapshot().phase);
   return{reviewId:this.review.checkpoint.reviewId,attempt:this.review.attempt.header.attempt,taskId:this.current()!.id,executionId:this.executionId,acceptedSequence:this.sequence,inactivityRemainingMs:this.remaining()};
  });
 }
 private exchange<T>(kind:string,input:unknown,owner:ControllerReviewOwner,envelope:unknown,work:()=>Promise<T>):Promise<T>{return this.queue(owner,async()=>{
  const request=decodeReview(Type.Object({taskId:Type.String({minLength:1,maxLength:256}),executionId:Type.String({minLength:1,maxLength:256}),sequence:Type.Integer({minimum:1,maximum:Number.MAX_SAFE_INTEGER})},{additionalProperties:false}),envelope);
  if(this.receipt?.executionId===request.executionId&&this.receipt.sequence===request.sequence){
   requireReview(this.receipt.taskId===request.taskId&&this.receipt.kind===kind&&isDeepStrictEqual(this.receipt.input,input),'sequence','Conflicting accepted exchange replay');
   return structuredClone(this.receipt.response) as T;
  }
  requireReview(request.taskId===this.current()?.id&&request.executionId===this.executionId,'executionId','Stale or wrong task execution');
  requireReview(request.sequence===this.sequence+1,'sequence','Out-of-order exchange');
  const prior=this.sequence;this.sequence=request.sequence;
  try{
   const response=await work();this.receipt={taskId:request.taskId,executionId:request.executionId,sequence:request.sequence,kind,input:structuredClone(input),response:structuredClone(response)};
   return response;
  }catch(error){if(this.executionId===request.executionId)this.sequence=prior;throw error;}
 });}
 private remaining():number{return this.monitor?.snapshot().inactivityRemainingMs??0;}
 // Queue order decides feedback versus expiry, as on the daemon route. A delayed
 // timer must not discard feedback that reached this queue before expiry did.
 private checkTime():void{requireReview(this.monitor,'inactivity','Review inactivity grace expired; request the next assignment');}
 private async frame(owner:ControllerReviewOwner):Promise<ControllerFrame>{
  const task=this.current();
  if(!task){
   if(!this.finished){this.finished=true;this.monitor?.stop();if(this.review.attempt['review-response'].crPublication!=='complete')await this.complete();this.retire(false);}
   else{const saved=JSON.parse(await readFile(this.review.path,'utf8')) as ReviewCheckpoint;this.review.checkpoint=saved;this.review.attempt=saved.attempts.at(-1)!;}
   return this.base('done');
  }
  this.assertOwner(owner);
  if(this.review.attempt.header.attributionState==='failed'){
   for(const missing of this.selected.filter(t=>!this.review.attempt['review-response'].tasks.some(r=>r.taskId===t.id)))this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,unmappedTaskFailure(missing.id,attributionTimedOut(this.review.attempt))];
   await this.persist();return this.frame(owner);
  }
  if(!this.monitor){
   this.executionId=randomUUID();this.sequence=0;
   const prior=structuredClone(this.lastDurable),restored=this.assignments??await restoreAcceptedAssignments(this.review), direct=restored?undefined:directReviewAssignments(this.review);
   let candidate:readonly TaskAssignment[]|undefined;
   try{candidate=restored??(direct?await bindTaskFinalIdentities(this.review,assignmentsToRows(this.review,direct)):undefined);}
   catch(error){
    if(!direct||!(error instanceof TaskReviewInputError)||error.field!=='projection_limit')throw error;
    failAttribution(this.review.attempt,error,false);return this.frame(owner);
   }
   this.progress.task(task,this.selected.indexOf(task)+1,this.selected.length,this.review.attempt['review-response'].tasks.length);
   this.review.attempt.header.status='running';this.review.attempt.header.activeTaskId=task.id;
   if(direct)await this.accept(prior);else await this.persist();
   this.assignments=candidate;
   const executionId=this.executionId;
   this.monitor=new ReviewActivityMonitor(error=>{void this.queue(undefined,async()=>{
    if(this.executionId===executionId&&this.current()?.id===task.id){log.warn({taskId:task.id,diagnostic:error.snapshot},'Controller review inactivity');await this.expire();}
   }).catch(error=>log.warn({error:String(error)},'Controller inactivity could not be persisted'));},{...(this.deps.now?{now:this.deps.now}:{}),...(this.deps.timer?{timer:this.deps.timer}:{})});
   this.monitor.observe({sessionId:executionId,sequence:1,kind:'session_started'});
  }
  if(this.remaining()<=0){await this.expire();return this.frame(owner);}
  if(!this.assignments)return{...this.base('scope'),taskId:task.id,prompt:attributionPrompt(this.review.prepared,this.review.checkpoint.project,this.review),schema:attributionSchema(this.review),executionId:this.executionId,nextSequence:this.sequence+1};
  const assignment=this.assignments.find(value=>value.taskId===task.id)!;
  const refs=await taskReferences(this.deps.sources,this.review.prepared,assignment);this.assertOwner(owner);
  if(this.remaining()<=0){await this.expire();return this.frame(owner);}
  if(assignment.reassessment?.action==='reuse'){
   try{
    const reused=await reuseAssessment(this.review,assignment,this.deps.sources,refs);this.assertOwner(owner);this.checkTime();
    this.review.attempt['review-response'].origins=[...(this.review.attempt['review-response'].origins??[]),reused.origin];
    this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,reused.result];
   }catch(error){
    this.assertOwner(owner);this.checkTime();
    this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,taskFailure(task.id,`Reuse failed: ${error instanceof Error?error.message:String(error)}`,false)];
   }
   this.monitor?.stop();this.monitor=undefined;delete this.review.attempt.header.activeTaskId;
   await this.persist();return this.frame(owner);
  }
  if(this.progress.snapshot().phase==='scope_preparation'){this.progress.phase('task_review');this.progressPersistence.request(true);}
  return{...this.base('task'),taskId:task.id,prompt:assignmentPrompt(this.review.prepared,assignment,refs,this.review.checkpoint.project,this.review),schema:assignmentResultSchema(assignment),executionId:this.executionId,nextSequence:this.sequence+1};
 }
 private base(kind:ControllerFrame['kind']):ControllerFrame{
  const response=this.review.attempt['review-response'];
  return{reviewId:this.review.checkpoint.reviewId,attempt:this.review.attempt.header.attempt,path:this.review.path,reviewer:'controller',timingProtocol:'activity-v1',...(kind!=='done'&&this.monitor?{executionId:this.executionId,nextSequence:this.sequence+1,timing:{mode:'activity' as const,inactivityMs:REVIEW_INACTIVITY_MS,inactivityRemainingMs:this.remaining(),expectedDurationMs:{S:300000,M:600000,L:900000}[this.current()!.size]}}:{}),status:this.review.attempt.header.status,kind,crPublication:response.crPublication,completedTaskIds:response.tasks.map(task=>task.taskId),pendingTaskIds:this.selected.filter(task=>!response.tasks.some(result=>result.taskId===task.id)).map(task=>task.id),...(response.crPath?{crPath:response.crPath}:{}),...(response.error?{error:response.error}:{})};
 }
 private async expire():Promise<void>{
  if(this.stopped||this.finished||!this.monitor)return;
  if(this.owner.signal.aborted){await this.stop();return;}
  const task=this.current();if(!task)return;
  this.monitor?.stop();
  if(!this.assignments)failAttribution(this.review.attempt,new Error('Task attribution exceeded the 30-minute inactivity grace.'),true);
  const timedOut=this.assignments?taskFailure(task.id,'Task has no observed review activity for 30 minutes.',true):unmappedTaskFailure(task.id,true);
  this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,timedOut];
  if(!this.assignments){
   for(const remaining of this.selected.filter(task=>!this.review.attempt['review-response'].tasks.some(result=>result.taskId===task.id)))this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,unmappedTaskFailure(remaining.id,true)];
  }
  this.monitor=undefined;delete this.review.attempt.header.activeTaskId;
  await this.persist();
  if(!this.current()){this.finished=true;await this.complete();this.retire(false);}
 }
 private async stop():Promise<void>{
  if(!this.finished&&!this.stopped){this.progress.phase('interrupted');this.progress.stopped();this.review.attempt.header.interrupted=true;await this.persist();}
  this.retire(true);
 }
 private async persist():Promise<void>{this.progressPersistence.boundary();await persistReview(this.review,this.deps);this.lastDurable=structuredClone(this.review.checkpoint);}
 private async accept(prior:ReviewCheckpoint):Promise<void>{
  this.progressPersistence.boundary();
  try{await persistAcceptedAttribution(this.review,this.deps,prior);this.lastDurable=structuredClone(this.review.checkpoint);}
  catch(error){this.retire(true);throw error;}
 }
 private async complete():Promise<void>{
  this.progressPersistence.stop();this.progress.phase('cr_publication',this.review.attempt['review-response'].tasks.length);this.progress.stopped();
  await this.persist();await completeReview(this.review,this.deps);
  this.progress.phase(this.review.attempt['review-response'].crPublication==='complete'||!this.deps.publish?'complete':'error');

 }
 private retire(drop:boolean):void{this.progressPersistence.stop();this.progress.stopped();this.monitor?.stop();if(drop)this.stopped=true;this.deps.release(drop);this.resolveDone();}
}
import { assignmentsToRows, bindTaskFinalIdentities, restoreAcceptedAssignments } from './attribution-binding.js';
