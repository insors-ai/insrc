/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import { TaskReviewCoordinator } from './coordinator.js';
import type { TaskReviewDeps } from './coordinator.js';
import type { ControllerReviewOwner } from './controller.js';
import { checkpointPath,loadStoredCheckpoint,updateStoredCodeCheckpoint } from './checkpoint.js';
import { isCodeAdmission,requireReview } from './contracts.js';
import { prepareWorkerCodeAdmission,readQualifiedCodeCheckpoint,saveWorkerCodeCheckpoint } from './worker-checkpoint.js';
import type { ReviewBootstrapInput } from '../../../daemon/threads/review-worker-contract.js';
import { getLogger } from '../../../shared/logger.js';

const log=getLogger('code-review-worker');
/** Adapts durable input to the existing judge, never a second review engine.
 * The caller installs native transport and supplies only registered authority. */
export class CodeReviewWorker {
 readonly coordinator:TaskReviewCoordinator;
 private launch:Promise<void>|undefined;
 private owner:string|undefined;
 private preparing=false;
 isPreparing():boolean{return this.preparing;}
 isActive():boolean{return this.preparing||this.coordinator.isActive(this.input.key.project,this.input.key.reviewId);}
 constructor(private readonly input:ReviewBootstrapInput,deps:TaskReviewDeps,private readonly epicHash?:string){
  requireReview(input.key.family==='code','reviewer','Code worker required');
  this.coordinator=new TaskReviewCoordinator({...deps,prepare:prepareWorkerCodeAdmission,read:readQualifiedCodeCheckpoint,save:saveWorkerCodeCheckpoint});
 }
 /** Returns before source work; no provider/qualification is awaited here. */
 execute(owner?:ControllerReviewOwner,operation:'start'|'resume'='start'):void{
  if(this.input.reviewer==='controller')requireReview(owner&&!owner.signal.aborted,'reviewer','Trusted live reviewing owner required');
  if(this.launch){
   requireReview(this.owner===owner?.id,'reviewer','Review owner mismatch');
   if(operation!=='resume'||this.preparing||this.coordinator.isActive(this.input.key.project,this.input.key.reviewId))return;
   this.launch=undefined;
  }
  this.owner=owner?.id;this.preparing=true;
  this.launch=new Promise<void>(resolve=>setImmediate(()=>{
   void(async()=>{
    const path=checkpointPath(this.input.key.project,this.input.key.reviewId),stored=await loadStoredCheckpoint(path),last=stored?.attempts.at(-1);
    requireReview(last&&last.header.attempt===this.input.attempt&&last.header.reviewer===this.input.reviewer&&same(last.submitted,this.input.submitted),'packet','Saved worker input mismatch');
    // A cold same-input start replay observes its admitted work. Only explicit
    // resume may reopen qualified execution or publish retained feedback.
    if(!isCodeAdmission(last)&&operation==='start')return;
    if(isCodeAdmission(last)&&operation==='resume'){
     requireReview(last.header.status==='interrupted','attempt','Only interrupted admission may resume');
     await updateStoredCodeCheckpoint(path,current=>{
      const a=current?.attempts.at(-1);requireReview(a&&isCodeAdmission(a)&&a.header.attempt===last.header.attempt&&a.header.status==='interrupted'&&same(a.submitted,last.submitted),'attempt','Admission changed during recovery');
      const {completedAt:_completed,...header}=a.header;
      return{...current!,schemaVersion:2,attempts:[...current!.attempts.slice(0,-1),{...a,operation:'resume',header:{...header,status:'pending'},progress:{...a.progress,phase:'scope_preparation'}}]};
     });
    }
    if(owner)await this.coordinator.startController(this.input.key.project,this.input.key.reviewId,this.input.attempt,this.input.submitted,owner,this.epicHash,isCodeAdmission(last)?'start':operation);
    else await this.coordinator.start(this.input.key.project,this.input.key.reviewId,this.input.attempt,this.input.submitted,{...(this.epicHash?{epicHash:this.epicHash}:{}),operation:isCodeAdmission(last)?'start':operation});
   })().catch(error=>this.failure(error)).finally(()=>{this.preparing=false;resolve();});
  }));
 }
 async assertResume():Promise<void>{
  requireReview(!this.preparing&&!this.coordinator.isActive(this.input.key.project,this.input.key.reviewId),'attempt','Review is still active');
  const cp=await loadStoredCheckpoint(checkpointPath(this.input.key.project,this.input.key.reviewId)),last=cp?.attempts.at(-1);
  requireReview(last&&last.header.attempt===this.input.attempt&&same(last.submitted,this.input.submitted),'packet','Resume input is pinned');
  requireReview(last.header.status!=='failed','attempt','Failed review requires the next attempt');
  requireReview(!cp!.attempts.some(a=>a.resourceGuard?.openLeases.length),'resourceGuard','Unresolved review resources require explicit clearance');
  requireReview(!isCodeAdmission(last)||last.header.status==='interrupted','attempt','Only interrupted admission may resume; failed admission needs the next attempt');
 }
 private async failure(error:unknown):Promise<void>{
  const message=(error instanceof Error?error.message:String(error)).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,2048)||'Review admission failed';
  try{await updateStoredCodeCheckpoint(checkpointPath(this.input.key.project,this.input.key.reviewId),current=>{
   const last=current?.attempts.at(-1);
   if(!last||last.header.attempt!==this.input.attempt||!['pending','running'].includes(last.header.status))throw error;
   if(!isCodeAdmission(last))return{...current!,schemaVersion:2,attempts:[...current!.attempts.slice(0,-1),{...last,header:{...last.header,interrupted:true},'review-response':{...last['review-response'],error:`Worker handoff failed: ${message}`},...(last.progress?{progress:{...last.progress,phase:'interrupted' as const}}:{})}]};
   const field=error&&typeof error==='object'&&'field'in error&&typeof error.field==='string'?error.field.slice(0,256):'admission';
   return{...current!,schemaVersion:2,attempts:[...current!.attempts.slice(0,-1),{...last,header:{...last.header,status:'failed',completedAt:new Date().toISOString()},error:{code:'code_review_admission_failed',field,summary:message},progress:{...last.progress,phase:'error'}}]};
  });}catch(saveError){log.error({reviewId:this.input.key.reviewId,error:saveError instanceof Error?saveError.message:String(saveError)},'Worker admission stopped; durable checkpoint retained');}
 }
 async progress(){
  const progress=await this.coordinator.progress(this.input.key.project,this.input.key.reviewId,this.input.attempt);
  return this.preparing&&progress.admission?{...progress,executionState:'starting' as const,interrupted:false,freshness:'live' as const}:progress;
 }
 async settled():Promise<void>{await this.launch;await this.coordinator.settled(this.input.key.project,this.input.key.reviewId);}
}
