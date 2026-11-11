/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { resolve } from 'node:path';
import { DesignReviewCoordinator } from './coordinator.js';
import type { DesignCoordinatorDeps,DesignControllerOwner } from './coordinator.js';
import { parseDesignRequest,isDesignAdmission,requireDesign } from './contracts.js';
import { loadStoredDesignCheckpoint,qualifiedDesignProjection,updateStoredDesignCheckpoint } from './checkpoint.js';
import { loadWorkerDesignCheckpoint,saveWorkerDesignCheckpoint } from './worker-checkpoint.js';
import { observeStoredDesignCheckpoint } from './progress.js';
import { prepareDesignSubject } from './subject.js';
import type { ReviewBootstrapInput } from '../../../daemon/threads/review-worker-contract.js';
import { getLogger } from '../../../shared/logger.js';

const log=getLogger('design-review-worker');
/** Durable submission adapter; all planning, retry, impact and subject monitor
 * policy remains in DesignReviewCoordinator. */
export class DesignReviewWorker {
 readonly coordinator:DesignReviewCoordinator;
 private launch:Promise<void>|undefined;
 private preparing=false;
 private owner:string|undefined;
 constructor(private readonly input:ReviewBootstrapInput,deps:DesignCoordinatorDeps={}){
  requireDesign(input.key.family==='design','wrong_owner','Design worker required');
  this.coordinator=new DesignReviewCoordinator({...deps,acceptedAttempt:input.attempt,
   prepare:(project,path)=>{
    const prepared=(deps.prepare??prepareDesignSubject)(project,path);
    requireDesign(prepared.subject.reviewer===input.reviewer,'wrong_owner','Current author requires another reviewer');
    requireDesign(input.subject===prepared.subject.artifactId||input.subject===prepared.subject.canonicalPath,'foreign_checkpoint','Prepared subject does not match the main registry reservation');
    return prepared;
   },
   load:async(project,id)=>{
    const cp=await loadStoredDesignCheckpoint(project,id);if(!cp)return undefined;
    if(cp.schemaVersion===1)return cp;
    return isDesignAdmission(cp.attempts.at(-1)!)?qualifiedDesignProjection({...cp,attempts:cp.attempts.slice(0,-1)}):loadWorkerDesignCheckpoint(project,id);
   },
   admit:async cp=>{
    const saved=await loadStoredDesignCheckpoint(cp.project,cp.reviewId),last=saved?.attempts.at(-1),current=cp.attempts.at(-1)!;
    requireDesign(last&&last.number===current.number,'review_conflict','Saved admission attempt changed');
    if(isDesignAdmission(last)){
     requireDesign(last.reviewer===cp.subject.reviewer&&last.submitted.artifactPath&&resolve(cp.project,last.submitted.artifactPath)===cp.submitted.artifactPath,'foreign_checkpoint','Design admission input is pinned');
     current.startedAt=last.startedAt;
    }
    await deps.admit?.(cp);
   },save:saveWorkerDesignCheckpoint,
  });
 }
 execute(owner?:DesignControllerOwner):void{
  requireDesign(this.input.subject,'wrong_owner','Registered design subject reservation required');
  if(this.input.reviewer==='controller')requireDesign(owner&&!owner.signal.aborted,'wrong_owner','Trusted reviewing controller required');
  if(this.launch){requireDesign(this.owner===owner?.id,'wrong_owner','Review owner mismatch');return;}
  this.owner=owner?.id;this.preparing=true;
  this.launch=new Promise<void>(done=>setImmediate(()=>{
   void(async()=>{
    const request=parseDesignRequest(this.input.submitted);requireDesign(request.phase==='start','invalid_phase','Expected admitted design start');
    const saved=await loadStoredDesignCheckpoint(this.input.key.project,this.input.key.reviewId);
    requireDesign(saved&&saved.schemaVersion===2,'missing_checkpoint','Version-2 design admission required');
    const last=saved.attempts.at(-1);
    requireDesign(last&&isDesignAdmission(last)&&last.number===this.input.attempt&&['pending','running'].includes(last.status)&&last.reviewer===this.input.reviewer,'review_conflict','Active durable design admission required');
    requireDesign(!saved!.attempts.some(a=>a.resourceGuard?.openLeases.length),'resource_pending','Unresolved review resources require explicit recovery');
    await this.coordinator.start(request,owner?{owner}:{});
   })().catch(error=>this.failure(error)).finally(()=>{this.preparing=false;done();});
  }));
 }
 private async failure(error:unknown):Promise<void>{
  const summary=(error instanceof Error?error.message:String(error)).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,2048)||'Design admission failed';
  try{await updateStoredDesignCheckpoint(this.input.key.project,this.input.key.reviewId,cp=>{
   requireDesign(cp&&cp.schemaVersion===2,'missing_checkpoint','Design admission missing');const last=cp.attempts.at(-1)!;
   requireDesign(last.number===this.input.attempt&&['pending','running'].includes(last.status),'review_conflict','Design admission is no longer active');
   const code=error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'?error.code.slice(0,256):'design_admission_failed';
   if(isDesignAdmission(last))return{...cp,attempts:[...cp.attempts.slice(0,-1),{...last,status:'failed',finishedAt:new Date().toISOString(),error:{code,field:'artifactPath',summary}}]};
   return{...cp,attempts:[...cp.attempts.slice(0,-1),{...last,status:'failed',finishedAt:new Date().toISOString(),failure:{code,summary},progress:{...last.progress,status:'failed',phase:'complete',requiresUserInput:true}}]};
  });}catch(saveError){log.error({reviewId:this.input.key.reviewId,error:saveError instanceof Error?saveError.message:String(saveError)},'Design handoff stopped; durable checkpoint retained');}
 }
 async progress(){
  const cp=await loadStoredDesignCheckpoint(this.input.key.project,this.input.key.reviewId);
  if(cp&&isDesignAdmission(cp.attempts.at(-1)!))return observeStoredDesignCheckpoint(cp,{active:this.preparing});
  return this.coordinator.progress(this.input.key.project,this.input.key.reviewId,this.input.attempt);
 }
}
