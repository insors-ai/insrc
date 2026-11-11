/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import { decodeReview,CheckpointSchema,isCodeAdmission,requireReview } from './contracts.js';
import type { ReviewAttempt,ReviewCheckpoint,StoredReviewCheckpoint,AdmissionCheckpoint } from './contracts.js';
import { checkpointBytes,checkpointPath,loadStoredCheckpoint,updateStoredCodeCheckpoint } from './checkpoint.js';
import { qualifyCodeAdmission } from './admission-checkpoint.js';
import { prepareReviewAdmission } from './admission.js';

/** Private execution view, never persisted or exposed as an approval artifact.
 * Technical-only attempts remain in the authoritative v2 file with their
 * original numbers; existing judging sees only actual qualified feedback. */
export function qualifiedCodeView(stored:StoredReviewCheckpoint):ReviewCheckpoint|undefined{
 const attempts:ReviewAttempt[]=stored.attempts.filter(a=>!isCodeAdmission(a)).map(a=>{
  const {acceptedAt:_accepted,operation:_operation,resourceGuard:_guard,...qualified}=a as ReviewAttempt&{acceptedAt?:unknown;operation?:unknown;resourceGuard?:unknown};
  return qualified;
 });
 if(!attempts.length)return undefined;
 return decodeReview(CheckpointSchema,{...stored,schemaVersion:1,attempts});
}
export async function readQualifiedCodeCheckpoint(path:string):Promise<ReviewCheckpoint|undefined>{
 const stored=await loadStoredCheckpoint(path);if(!stored)return undefined;
 requireReview(!isCodeAdmission(stored.attempts.at(-1)!),'checkpoint','Admission checkpoint requires a version-2-aware consumer');
 return qualifiedCodeView(stored);
}
/** Every coordinator/progress save merges fresh operational state in the same
 * lane as open/close intents. A stale execution snapshot cannot clear a lease. */
export const saveWorkerCodeCheckpoint:typeof import('./checkpoint.js').saveCheckpoint=async(path,checkpoint)=>{
 const candidate=JSON.parse(checkpointBytes(checkpoint)) as ReviewCheckpoint;
 await updateStoredCodeCheckpoint(path,stored=>{
  requireReview(stored&&stored.project===candidate.project&&stored.reviewId===candidate.reviewId&&stored.storyId===candidate.storyId&&stored.taskId===candidate.taskId,'checkpoint','Worker checkpoint identity mismatch');
  const latest=stored.attempts.at(-1)!,next=candidate.attempts.at(-1)!;
  requireReview(latest.header.attempt===next.header.attempt,'attempt','Stale worker checkpoint save');
  const prior=qualifiedCodeView({...stored,attempts:stored.attempts.slice(0,-1)} as StoredReviewCheckpoint);
  requireReview(same(prior?.attempts??[],candidate.attempts.slice(0,-1)),'checkpoint','Worker cannot rewrite historical feedback');
  if(isCodeAdmission(latest))return qualifyCodeAdmission(stored as AdmissionCheckpoint,next);
  requireReview(same(latest.submitted,next.submitted)&&latest.header.reviewer===next.header.reviewer&&latest.header.createdAt===next.header.createdAt,'packet','Worker input is pinned');
  const accepted=latest as typeof latest&{acceptedAt?:string;operation?:'start'|'resume'};
  return{...stored,schemaVersion:2,attempts:[...stored.attempts.slice(0,-1),{...next,...(accepted.acceptedAt?{acceptedAt:accepted.acceptedAt}:{}),...(accepted.operation?{operation:accepted.operation}:{}),...(latest.resourceGuard?{resourceGuard:latest.resourceGuard}:{})}]};
 });
};
/** Reuse the entire normal source/history/route/capacity qualification; only
 * replace its read-only starting history with the preaccepted worker input. */
export const prepareWorkerCodeAdmission:typeof prepareReviewAdmission=async(project,id,attempt,input,reviewer,sources,context={})=>{
 const stored=await loadStoredCheckpoint(checkpointPath(project,id));
 requireReview(stored,'checkpoint','Durable worker admission missing');
 const latest=stored.attempts.at(-1)!;
 requireReview(!stored.attempts.some(a=>a.resourceGuard?.openLeases.length),'resourceGuard','Unresolved native resources require explicit recovery');
 if(!isCodeAdmission(latest)){
  requireReview(context.operation==='resume','attempt','Qualified execution already admitted');
  return prepareReviewAdmission(project,id,attempt,input,reviewer,sources,{...context,qualifiedHistory:qualifiedCodeView(stored)!});
 }
 requireReview(stored.schemaVersion===2&&latest.header.attempt===attempt,'attempt','Worker attempt mismatch');
 requireReview(latest.header.status==='pending'||latest.header.status==='running','attempt','Failed or interrupted admission requires explicit retrigger');
 const admitted=await prepareReviewAdmission(project,id,attempt,input,reviewer,sources,{...context,operation:'start',accepted:{admission:latest,prior:qualifiedCodeView({...stored,attempts:stored.attempts.slice(0,-1)}),historyLength:stored.attempts.length-1}});
 admitted.attempt.progress=latest.progress;
 return admitted;
};
