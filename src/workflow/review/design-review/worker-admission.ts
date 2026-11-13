/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { resolve } from 'node:path';
import { DesignReviewCoordinator } from './coordinator.js';
import type { DesignCoordinatorDeps,DesignControllerOwner } from './coordinator.js';
import { parseDesignRequest,isDesignAdmission,requireDesign } from './contracts.js';
import { loadStoredDesignCheckpoint,qualifiedDesignProjection,updateStoredDesignCheckpoint,saveDesignCheckpoint } from './checkpoint.js';
import { loadWorkerDesignCheckpoint,saveWorkerDesignCheckpoint } from './worker-checkpoint.js';
import { observeStoredDesignCheckpoint } from './progress.js';
import { prepareDesignSubject } from './subject.js';
import type { ReviewBootstrapInput } from '../../../daemon/threads/review-worker-contract.js';
import { getLogger } from '../../../shared/logger.js';
import { admitDesignRecovery,settleDesignRecovery } from './action-admission.js';
import type { DesignRecoveryRequest } from './contracts.js';

const log=getLogger('design-review-worker');
/** Durable submission adapter; all planning, retry, impact and subject monitor
 * policy remains in DesignReviewCoordinator. */
export class DesignReviewWorker {
 readonly coordinator:DesignReviewCoordinator;
 private launch:Promise<void>|undefined;
 private preparing=false;
 private owner:string|undefined;
 private targetAttempt:number;
 private recoveryRequest:DesignRecoveryRequest|undefined;
 private readonly recoveries=new Map<string,Promise<void>>();
 isActive():boolean{return this.preparing||this.coordinator.isActive(this.input.key.project,this.input.key.reviewId);}
 isPreparing():boolean{return this.preparing;}
 currentAttempt():number{return this.targetAttempt;}
 constructor(private readonly input:ReviewBootstrapInput,deps:DesignCoordinatorDeps={}){
  requireDesign(input.key.family==='design','wrong_owner','Design worker required');
  this.targetAttempt=input.attempt;
  if(input.submitted&&typeof input.submitted==='object'&&Reflect.get(input.submitted,'phase')==='recover'){const request=parseDesignRequest(input.submitted);if(request.phase==='recover')this.recoveryRequest=request;}
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
    const projection=isDesignAdmission(cp.attempts.at(-1)!)?qualifiedDesignProjection({...cp,attempts:cp.attempts.slice(0,-1)}):await loadWorkerDesignCheckpoint(project,id);
    if(deps.load)await deps.load(project,id);
    return projection;
   },
   admit:async cp=>{
    const saved=await loadStoredDesignCheckpoint(cp.project,cp.reviewId),last=saved?.attempts.at(-1),current=cp.attempts.at(-1)!;
    const recovery=this.recoveryRequest;
    requireDesign(last&&(last.number===current.number||recovery?.operation==='restart_full'&&last.number+1===current.number),'review_conflict','Saved admission attempt changed');
    if(isDesignAdmission(last)){
     requireDesign(last.reviewer===cp.subject.reviewer&&last.submitted.artifactPath&&resolve(cp.project,last.submitted.artifactPath)===cp.submitted.artifactPath,'foreign_checkpoint','Design admission input is pinned');
     current.startedAt=last.startedAt;
     if(recovery)current.actions=(last.actions??[]).map(a=>a.actionId===recovery.actionId?{...a,validation:'qualified'}:a);
    }
    await deps.admit?.(cp);
   },save:async(project,cp)=>{
    const stored=await loadStoredDesignCheckpoint(project,cp.reviewId);
    // Historical publication repair has no native work and must preserve its
    // existing format/preservation identity, rather than minting admission.
    if(input.maintenance&&stored?.schemaVersion===1)return saveDesignCheckpoint(project,cp);
    return saveWorkerDesignCheckpoint(project,cp);
   },
  });
 }
 async recover(raw:unknown,owner?:DesignControllerOwner){
  requireDesign(this.input.subject,'wrong_owner','Registered design subject required');
  if(this.input.reviewer==='controller')requireDesign(owner&&!owner.signal.aborted&&(this.owner===undefined||this.owner===owner.id),'wrong_owner','Trusted reviewing controller required');
  const request=parseDesignRequest(raw);
  requireDesign(request.phase==='recover'&&request.repo===this.input.key.project&&request.reviewId===this.input.key.reviewId,'foreign_checkpoint','Recovery belongs to another review');
  // The coordinator durably records publication.actions before its model-free
  // write. A second attempt.actions entry would change preserved assessment
  // identity merely by replaying publication of the same accepted feedback.
  if(request.operation==='retry_publication')return this.coordinator.recover(request,owner?{owner}:{});
  const admitted=await admitDesignRecovery(this.input.key.project,this.input.key.reviewId,raw,()=>requireDesign(!this.preparing&&!this.coordinator.isActive(this.input.key.project,this.input.key.reviewId),'review_conflict','Review is still active'));

  if(admitted.validation==='unverified'||this.recoveryRequest?.actionId===admitted.request.actionId)this.recoveryRequest=admitted.request;
  if(admitted.validation==='unverified'&&!this.recoveries.has(admitted.request.actionId)){
   const saved=await loadStoredDesignCheckpoint(this.input.key.project,this.input.key.reviewId);
   requireDesign(saved&&!saved.attempts.some(a=>'resourceGuard'in a&&a.resourceGuard?.openLeases.length),'resource_pending','Unresolved review resources require explicit clearance');
   const source=saved.attempts.find(a=>a.number===admitted.request.attempt);
   requireDesign(source&&(admitted.request.operation==='restart_full'||(source.reviewer??saved.subject?.reviewer)===this.input.reviewer),'wrong_owner','Recovery reviewer does not match its saved subject');
   this.owner=owner?.id;this.preparing=true;
   const work=new Promise<void>(done=>setImmediate(()=>{
    void(async()=>{
     const cp=await loadStoredDesignCheckpoint(this.input.key.project,this.input.key.reviewId),last=cp?.attempts.at(-1);
     requireDesign(last,'missing_checkpoint','Design recovery source missing');
     if(isDesignAdmission(last)){
      requireDesign(admitted.request.operation==='resume'&&last.submitted.artifactPath,'review_conflict','Only unchanged admission can resume');
      await this.coordinator.start({phase:'start',repo:this.input.key.project,reviewId:this.input.key.reviewId,attempt:last.number,artifactPath:last.submitted.artifactPath},owner?{owner}:{});
     }else await this.coordinator.recover(admitted.request,owner?{owner}:{});
     await settleDesignRecovery(this.input.key.project,this.input.key.reviewId,admitted.request,'qualified');
    })().catch(async error=>{
     try{await settleDesignRecovery(this.input.key.project,this.input.key.reviewId,admitted.request,'failed',error);}catch(saveError){log.error({reviewId:this.input.key.reviewId,error:String(saveError)},'Recovery qualification could not be saved');}
    }).finally(()=>{this.preparing=false;done();});
   }));
   this.recoveries.set(admitted.request.actionId,work);
  }
  return{accepted:true,reviewId:this.input.key.reviewId,attempt:this.targetAttempt,checkpointPath:`${this.input.key.project}/.insrc/tmp/design-review/${this.input.key.reviewId}.json`,actionId:admitted.request.actionId};
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
    if(last&&!isDesignAdmission(last))return; // A saved submission replay observes; only recover can restart it.
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
  if(cp)this.targetAttempt=cp.attempts.at(-1)!.number;
  const request=this.recoveryRequest,action=request&&cp?.attempts.flatMap(a=>a.actions??[]).find(a=>a.actionId===request.actionId);
  if(cp&&action&&(action.validation==='unverified'||action.validation==='failed'))return{...observeStoredDesignCheckpoint(cp,{active:false}),status:action.validation==='failed'?'failed' as const:'pending' as const,phase:'admission' as const,admission:{validation:'unverified' as const},requiresUserInput:action.validation==='failed',failure:action.outcome,guidance:action.validation==='failed'?'Recovery qualification failed; wait for user direction.':'Preparing recovery; wait for the complete review.'};
  if(cp&&isDesignAdmission(cp.attempts.at(-1)!))return observeStoredDesignCheckpoint(cp,{active:this.preparing||!this.launch&&!this.recoveryRequest});
  return this.coordinator.progress(this.input.key.project,this.input.key.reviewId,this.targetAttempt);
 }
}
