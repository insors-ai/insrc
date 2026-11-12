/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { parseDesignRequest,isDesignAdmission,requireDesign,DESIGN_LIMITS } from './contracts.js';
import type { DesignRecoveryRequest } from './contracts.js';
import { updateStoredDesignCheckpoint } from './checkpoint.js';
import { requestSignature } from './request-signature.js';

/** Save only bounded request metadata before history/subject qualification.
 * It grants no unit reservation or reviewer dispatch authority. */
export async function admitDesignRecovery(project:string,id:string,raw:unknown,beforeNew?:()=>void){
 const request=parseDesignRequest(raw);
 requireDesign(request.phase==='recover'&&request.repo===project&&request.reviewId===id,'foreign_checkpoint','Recovery belongs to another review');
 const signature=requestSignature(request);let replay=false,validation:'unverified'|'qualified'|'failed'='unverified';
 await updateStoredDesignCheckpoint(project,id,cp=>{
  requireDesign(cp,'missing_checkpoint','Design review not found');
  const old=cp.attempts.at(-1)!;
  requireDesign(old.status!=='failed','review_conflict','Failed review requires the next attempt');
  const previous=cp.attempts.flatMap(a=>a.actions??[]).find(a=>a.actionId===request.actionId);
  if(previous){requireDesign(previous.signature===signature,'review_conflict','Conflicting recovery action replay');replay=true;validation=previous.validation??'qualified';return cp;}
  beforeNew?.();
  requireDesign(old.number===request.attempt,'missing_attempt','Recovery must name the current attempt');
  requireDesign(!cp.attempts.some(a=>('resourceGuard'in a)&&a.resourceGuard?.openLeases.length),'resource_pending','Unresolved native resources require explicit clearance');
  requireDesign(!(old.actions??[]).some(a=>a.validation==='unverified'),'review_conflict','Another recovery request is still being qualified');
  if(isDesignAdmission(old))requireDesign(request.operation==='resume'&&!request.userDecision,'review_conflict','Unverified recovery can only resume unchanged admission');
  const actions=old.actions??[];requireDesign(actions.length<DESIGN_LIMITS.actions,'input_too_large','Recovery action limit reached');
  const action={actionId:request.actionId,signature,operation:request.operation,sourceAttempt:request.attempt,resultAttempt:request.attempt+(request.operation==='restart_full'?1:0),...(request.userDecision?{userDecision:request.userDecision}:{}),acceptedAt:new Date().toISOString(),validation:'unverified' as const};
  return{...cp,schemaVersion:2,attempts:[...cp.attempts.slice(0,-1),{...old,actions:[...actions,action]}]};
 });
 return{request:request as DesignRecoveryRequest,replay,validation,resultAttempt:request.attempt+(request.operation==='restart_full'?1:0)};
}
/** An unsuccessful qualification is technical metadata, never a chunk result. */
export async function settleDesignRecovery(project:string,id:string,request:DesignRecoveryRequest,validation:'qualified'|'failed',error?:unknown):Promise<void>{
 const summary=(error instanceof Error?error.message:String(error??'Recovery qualification failed')).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,2048);
 await updateStoredDesignCheckpoint(project,id,cp=>{
  requireDesign(cp,'missing_checkpoint','Design review not found');
  const saved=cp.attempts.flatMap(a=>a.actions??[]).find(a=>a.actionId===request.actionId);
  requireDesign(saved&&saved.signature===requestSignature(request),'review_conflict','Recovery action is not durably admitted');
  return{...cp,schemaVersion:2,attempts:cp.attempts.map(a=>!(a.actions??[]).some(action=>action.actionId===request.actionId)?a:({...a,actions:(a.actions??[]).map(action=>{
   if(action.actionId!==request.actionId)return action;
   requireDesign(action.signature===requestSignature(request),'review_conflict','Recovery request changed');
   if(action.validation!=='unverified'){requireDesign((action.validation??'qualified')===validation,'review_conflict','Recovery action already sealed');return action;}
   return{...action,validation,...(validation==='failed'?{outcome:{code:'recovery_admission_failed',summary}}:{})};
  })}))};
 });
}
