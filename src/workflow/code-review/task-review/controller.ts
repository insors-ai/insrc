/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { access, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import type { TSchema } from '@sinclair/typebox';
import { getLogger } from '../../../shared/logger.js';
import { decodeReview, requireReview, TaskReviewInputError, TaskResultSchema } from './contracts.js';
import type { ReviewCheckpoint, ReviewStatus } from './contracts.js';
import { deriveTaskAssignments } from './packet.js';
import type { PlanTask } from '../../artifacts/plan.js';
import type { TaskAssignment } from './packet.js';
import type { ReviewSources } from './sources.js';
import { assessTaskResult, AttributionSchema, attributionPrompt, directAssignments, taskFailure, taskReferences } from './assessment.js';
import { normalizeTaskResult } from './results.js';
import { resultReferences } from './record.js';
import { assignmentPrompt } from './policy.js';
import { assignmentResultSchema } from './result-schema.js';
import { completeReview, persistReview } from './execution.js';
import type { AdmittedReview, ReviewPersistence } from './execution.js';

/** Trusted in-process transport lifetime, never accepted from caller JSON. */
export interface ControllerReviewOwner { readonly id:string; readonly signal:AbortSignal; readonly requestSignal?:AbortSignal|undefined; readonly assertReviewer?:(()=>void)|undefined; }
export interface ControllerFrame {
 reviewId:string;attempt:number;path:string;reviewer:'controller';status:ReviewStatus;kind:'scope'|'task'|'done';crPublication:'pending'|'complete';
 completedTaskIds:readonly string[];pendingTaskIds:readonly string[];
 taskId?:string|undefined;prompt?:string|undefined;schema?:TSchema|undefined;remainingMs?:number|undefined;crPath?:string|undefined;error?:string|undefined;
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
 private started:number|undefined;
 private cancelTimer:(()=>void)|undefined;
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
 scope(input:unknown,owner:ControllerReviewOwner):Promise<ControllerFrame>{return this.queue(owner,async()=>{
  requireReview(!this.assignments&&!directAssignments(this.review.prepared),'scope','Task attribution is not awaiting a response');
  this.checkTime();
  const assignments=deriveTaskAssignments(this.review.prepared,decodeReview(AttributionSchema,input).tasks);this.checkTime();this.assignments=assignments;
  return this.frame(owner);
 });}
 submit(input:unknown,owner:ControllerReviewOwner):Promise<ControllerFrame>{return this.queue(owner,async()=>{
  const raw=decodeReview(TaskResultSchema,input);
  const existing=this.review.attempt['review-response'].tasks.find(result=>result.taskId===raw.taskId);
  if(existing){const result=normalizeTaskResult(raw,{taskId:raw.taskId,changes:this.review.prepared.changes,evidenceReferences:resultReferences(existing)});requireReview(isDeepStrictEqual(existing,result),'result','Conflicting accepted submission replay');return this.frame(owner);}
  const assignment=this.assignments?.find(task=>task.taskId===raw.taskId);
  requireReview(assignment,'taskId','Wrong or unassigned task');
  requireReview(this.current()?.id===raw.taskId,'taskId','Result is not for the current task');this.checkTime();
  const refs=await taskReferences(this.deps.sources,this.review.prepared,assignment);
  const result=await assessTaskResult(this.deps.sources,assignment,raw,refs);
  this.assertOwner(owner);
  this.checkTime();this.cancelTimer?.();this.cancelTimer=undefined;
  this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,result];
  delete this.review.attempt.header.activeTaskId;this.started=undefined;
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
 private clock(){return(this.deps.now??(()=>performance.now()))();}
 private remaining():number{const task=this.current();return task&&this.started!==undefined?{S:300000,M:600000,L:900000}[task.size]-(this.clock()-this.started):0;}
 private checkTime():void{requireReview(this.started!==undefined&&this.remaining()>0,'deadline','Task deadline expired; request the next assignment');}
 private async frame(owner:ControllerReviewOwner):Promise<ControllerFrame>{
  const task=this.current();
  if(!task){
   if(!this.finished){this.finished=true;this.cancelTimer?.();if(this.review.attempt['review-response'].crPublication!=='complete')await completeReview(this.review,this.deps);this.retire(false);}
   else{const saved=JSON.parse(await readFile(this.review.path,'utf8')) as ReviewCheckpoint;this.review.checkpoint=saved;this.review.attempt=saved.attempts.at(-1)!;}
   return this.base('done');
  }
  this.assertOwner(owner);
  if(this.started===undefined){
   this.started=this.clock();this.assignments??=directAssignments(this.review.prepared);
   this.review.attempt.header.status='running';this.review.attempt.header.activeTaskId=task.id;
   await persistReview(this.review,this.deps);
   const expire=()=>{void this.queue(undefined,async()=>{if(this.current()?.id===task.id)await this.expire();}).catch(error=>log.warn({error:String(error)},'Controller deadline could not be persisted'));};
   const ms=this.remaining();
   if(this.deps.timer)this.cancelTimer=this.deps.timer(expire,ms);else{const timer=setTimeout(expire,ms);this.cancelTimer=()=>clearTimeout(timer);}
  }
  if(this.remaining()<=0){await this.expire();return this.frame(owner);}
  if(!this.assignments)return{...this.base('scope'),prompt:attributionPrompt(this.review.prepared,this.review.checkpoint.project),schema:AttributionSchema,remainingMs:this.remaining()};
  const assignment=this.assignments.find(value=>value.taskId===task.id)!;
  const refs=await taskReferences(this.deps.sources,this.review.prepared,assignment);this.assertOwner(owner);
  if(this.remaining()<=0){await this.expire();return this.frame(owner);}
  return{...this.base('task'),taskId:task.id,prompt:assignmentPrompt(this.review.prepared,assignment,refs,this.review.checkpoint.project),schema:assignmentResultSchema(assignment),remainingMs:this.remaining()};
 }
 private base(kind:ControllerFrame['kind']):ControllerFrame{
  const response=this.review.attempt['review-response'];
  return{reviewId:this.review.checkpoint.reviewId,attempt:this.review.attempt.header.attempt,path:this.review.path,reviewer:'controller',status:this.review.attempt.header.status,kind,crPublication:response.crPublication,completedTaskIds:response.tasks.map(task=>task.taskId),pendingTaskIds:this.selected.filter(task=>!response.tasks.some(result=>result.taskId===task.id)).map(task=>task.id),...(response.crPath?{crPath:response.crPath}:{}),...(response.error?{error:response.error}:{})};
 }
 private async expire():Promise<void>{
  if(this.stopped||this.finished||this.started===undefined)return;
  if(this.owner.signal.aborted){await this.stop();return;}
  const task=this.current();if(!task)return;
  this.cancelTimer?.();this.cancelTimer=undefined;
  const timedOut=taskFailure(task.id,`Task exceeded its ${task.size} allowance (${{S:300000,M:600000,L:900000}[task.size]}ms).`,true);
  this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,timedOut];
  if(!this.assignments){
   for(const remaining of this.selected.filter(task=>!this.review.attempt['review-response'].tasks.some(result=>result.taskId===task.id)))this.review.attempt['review-response'].tasks=[...this.review.attempt['review-response'].tasks,taskFailure(remaining.id,'Task attribution did not complete within the first task allowance.',true)];
  }
  this.started=undefined;delete this.review.attempt.header.activeTaskId;
  await persistReview(this.review,this.deps);
  if(!this.current()){this.finished=true;await completeReview(this.review,this.deps);this.retire(false);}
 }
 private async stop():Promise<void>{
  if(!this.finished&&!this.stopped){this.review.attempt.header.interrupted=true;await persistReview(this.review,this.deps);}
  this.retire(true);
 }
 private retire(drop:boolean):void{this.cancelTimer?.();this.cancelTimer=undefined;if(drop)this.stopped=true;this.deps.release(drop);this.resolveDone();}
}
