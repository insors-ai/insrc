/* Copyright (c) Procix Software India. Licensed under the MIT License. */
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
import { completeReview, persistReview } from './execution.js';
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
 private resolveDone!:()=>void;
 private tail:Promise<unknown>=Promise.resolve();
 private assignments:readonly TaskAssignment[]|undefined;
 private monitor:ReviewActivityMonitor|undefined;
 private executionId:string|undefined;
 private sequence=0;
 private receipt:{taskId:string;executionId:string;sequence:number;kind:string;input:unknown;response:unknown}|undefined;
 private finished=false;
 private stopped=false;
 private readonly selected:readonly PlanTask[];
 constructor(private readonly review:AdmittedReview,private readonly owner:ControllerReviewOwner,private readonly deps:ControllerDeps){
  this.done=new Promise(resolve=>{this.resolveDone=resolve;});
  this.selected=review.prepared.tasks.filter(task=>!review.prepared.packet.taskId||task.id===review.prepared.packet.taskId).sort((a,b)=>a.order-b.order);
  const disconnect=()=>{if(this.finished){this.retire(true);return;}void this.queue(undefined,()=>this.stop()).catch(error=>log.warn({error:String(error)},'Controller interruption could not be persisted'));};
  owner.signal.addEventListener('abort',disconnect,{once:true});if(owner.signal.aborted)disconnect();
 }
 assignment(owner:ControllerReviewOwner):Promise<ControllerFrame>{return this.queue(owner,()=>this.frame(owner));}
 scope(input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<ControllerFrame>{return this.exchange('scope',input,owner,envelope,async()=>{
  requireReview(!this.assignments&&!directReviewAssignments(this.review),'scope','Task attribution is not awaiting a response');
  this.checkTime();
  let assignments:readonly TaskAssignment[];
  try{assignments=reviewAssignments(this.review,input);}catch(error){
   this.monitor?.stop();this.monitor=undefined;delete this.review.attempt.header.activeTaskId;
   for(const task of this.selected.filter(task=>!this.review.attempt['review-response'].tasks.some(result=>result.taskId===task.id))){
    this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,taskFailure(task.id,`Task attribution failed: ${error instanceof Error?error.message:String(error)}`,false)];
    await persistReview(this.review,this.deps);
   }
   this.finished=true;await completeReview(this.review,this.deps);this.retire(false);return this.base('done');
  }
  this.checkTime();this.assignments=assignments;
  return this.frame(owner);
 });}
 submit(input:unknown,owner:ControllerReviewOwner,envelope:unknown):Promise<ControllerFrame>{return this.exchange('result',input,owner,envelope,async()=>{
  const raw=decodeReview(TaskResultSchema,input);
  const assignment=this.assignments?.find(task=>task.taskId===raw.taskId);
  requireReview(assignment,'taskId','Wrong or unassigned task');
  requireReview(this.current()?.id===raw.taskId,'taskId','Result is not for the current task');this.checkTime();
  const refs=await taskReferences(this.deps.sources,this.review.prepared,assignment);
  const result=await assessTaskResult(this.deps.sources,assignment,raw,refs);
  this.assertOwner(owner);
  this.monitor?.stop();
  this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,result];
  delete this.review.attempt.header.activeTaskId;this.monitor=undefined;
  await persistReview(this.review,this.deps);
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
    Type.Object({kind:Type.Literal('model_output')},{additionalProperties:false}),
    Type.Object({kind:Type.Union([Type.Literal('tool_started'),Type.Literal('tool_completed')]),toolId:Type.String({minLength:1,maxLength:256})},{additionalProperties:false}),
   ]),input);
   requireReview(this.monitor?.observe({sessionId:this.executionId!,sequence:this.sequence+1,...event}),'activity','Invalid or duplicate native activity');
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
   if(!this.finished){this.finished=true;this.monitor?.stop();if(this.review.attempt['review-response'].crPublication!=='complete')await completeReview(this.review,this.deps);this.retire(false);}
   else{const saved=JSON.parse(await readFile(this.review.path,'utf8')) as ReviewCheckpoint;this.review.checkpoint=saved;this.review.attempt=saved.attempts.at(-1)!;}
   return this.base('done');
  }
  this.assertOwner(owner);
  if(!this.monitor){
   this.executionId=randomUUID();this.sequence=0;this.assignments??=directReviewAssignments(this.review);
   this.review.attempt.header.status='running';this.review.attempt.header.activeTaskId=task.id;
   await persistReview(this.review,this.deps);
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
   await persistReview(this.review,this.deps);return this.frame(owner);
  }
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
  const timedOut=taskFailure(task.id,'Task has no observed review activity for 30 minutes.',true);
  this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,timedOut];
  if(!this.assignments){
   for(const remaining of this.selected.filter(task=>!this.review.attempt['review-response'].tasks.some(result=>result.taskId===task.id)))this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,taskFailure(remaining.id,'Task attribution exceeded the 30-minute inactivity grace.',true)];
  }
  this.monitor=undefined;delete this.review.attempt.header.activeTaskId;
  await persistReview(this.review,this.deps);
  if(!this.current()){this.finished=true;await completeReview(this.review,this.deps);this.retire(false);}
 }
 private async stop():Promise<void>{
  if(!this.finished&&!this.stopped){this.review.attempt.header.interrupted=true;await persistReview(this.review,this.deps);}
  this.retire(true);
 }
 private retire(drop:boolean):void{this.monitor?.stop();if(drop)this.stopped=true;this.deps.release(drop);this.resolveDone();}
}
