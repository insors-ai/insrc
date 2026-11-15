/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import type { ReviewKey,ReviewGuardRow,ReviewAuthorizedClearance } from '../../shared/review-resources.js';
import { reviewGuardDigest,validateReviewResourceGuard,MAX_REVIEW_OPEN_LEASES } from '../../shared/review-resources.js';
import { checkpointPath,loadStoredCheckpoint,updateStoredCodeCheckpoint } from '../code-review/task-review/checkpoint.js';
import { loadStoredDesignCheckpoint,updateStoredDesignCheckpoint } from './design-review/checkpoint.js';
import { loadPreparationCheckpoint } from './preparation-checkpoint.js';
import { loadReviewRuntime } from '../../daemon/threads/review-runtime-store.js';

export interface ReviewResourceSnapshot {readonly key:ReviewKey;readonly guards:readonly ReviewGuardRow[];readonly digest:string;readonly remaining:number;}
export class ReviewResourceFenceError extends Error {
 readonly code='review_resources_fenced';
 constructor(readonly key:ReviewKey){super(`review_resources_fenced: ${key.family}/${key.reviewId}; explicit local resource clearance and a separate resume are required`);this.name='ReviewResourceFenceError';}
}
function snapshot(key:ReviewKey,guards:readonly ReviewGuardRow[]):ReviewResourceSnapshot{
 for(const row of guards)validateReviewResourceGuard(row.resourceGuard,key);
 return{key,guards,digest:reviewGuardDigest(key,guards),remaining:guards.reduce((count,row)=>count+row.resourceGuard.openLeases.length,0)};
}
function legacyGuard(key:ReviewKey,attempt:number){return{daemonInstance:'unverifiable-legacy',openLeases:[{operationId:`legacy-${key.family}-${attempt}`,workerIncarnation:'unverifiable-legacy',kind:'legacy-active-review',openedAt:new Date().toISOString()}]};}
/** No PID probing, Git, provider, tool or artifact-approval access. A missing
 * legacy guard means uncertainty, never absence of a surviving process. */
export async function inspectReviewResources(key:ReviewKey):Promise<ReviewResourceSnapshot>{
 const prepared = await loadPreparationCheckpoint(key), runtime = await loadReviewRuntime(key);
 if (prepared?.format === 'current') {
  const cp = prepared.checkpoint, last = cp.attempts.at(-1)!, attempt = 'header' in last ? last.header.attempt : last.number;
  if (!runtime || runtime.runtimeId !== cp.runtime.runtimeId || runtime.checkpointBinding.inputDigest !== cp.runtime.inputDigest || runtime.attempt !== attempt) throw new ReviewResourceFenceError(key);
  return snapshot(key, [{ attempt, resourceGuard: runtime.resourceGuard }]);
 }
 // An orphan or half-migrated runtime is retained proof, not an empty old
 // checkpoint. Only the exact explicit initialization recovery can reconcile it.
 if (runtime) throw new ReviewResourceFenceError(key);
 if(key.family==='code'){
  let cp=await loadStoredCheckpoint(checkpointPath(key.project,key.reviewId));
  if(!cp)return snapshot(key,[]);
  if(cp.project!==key.project||cp.reviewId!==key.reviewId)throw new Error('Foreign resource checkpoint');
  if(cp.schemaVersion===1&&cp.attempts.some(a=>!a.resourceGuard&&(['pending','running','interrupted'].includes(a.header.status)||a.header.interrupted===true)))cp=await updateStoredCodeCheckpoint(checkpointPath(key.project,key.reviewId),current=>{
   if(!current||current.project!==key.project||current.reviewId!==key.reviewId)throw new Error('Resource checkpoint changed');
   if(current.schemaVersion!==1)return current;
   return{...current,schemaVersion:2,attempts:current.attempts.map(a=>!a.resourceGuard&&(['pending','running','interrupted'].includes(a.header.status)||a.header.interrupted===true)?{...a,resourceGuard:legacyGuard(key,a.header.attempt)}:a)};
  });
  return snapshot(key,cp.attempts.flatMap(a=>a.resourceGuard?[{attempt:a.header.attempt,resourceGuard:a.resourceGuard}]:[]));
 }
 let cp=await loadStoredDesignCheckpoint(key.project,key.reviewId);
 if(!cp)return snapshot(key,[]);
 if(cp.schemaVersion===1&&cp.attempts.some(a=>['pending','running','interrupted'].includes(a.status)))cp=await updateStoredDesignCheckpoint(key.project,key.reviewId,current=>{
  if(!current)throw new Error('Resource checkpoint changed');if(current.schemaVersion!==1)return current;
  return{...current,schemaVersion:2,attempts:current.attempts.map(a=>['pending','running','interrupted'].includes(a.status)?{...a,resourceGuard:legacyGuard(key,a.number)}:a)};
 });
 return snapshot(key,cp.attempts.flatMap(a=>'resourceGuard'in a&&a.resourceGuard?[{attempt:a.number,resourceGuard:a.resourceGuard}]:[]));
}
export async function requireClosedReviewResources(key:ReviewKey):Promise<void>{if((await inspectReviewResources(key)).remaining)throw new ReviewResourceFenceError(key);}

/** Only the registered metadata worker receives this command from its main
 * broker owner. No public API accepts a serialized caller approval receipt. */
export async function applyReviewResourceClearance(key:ReviewKey,clearance:ReviewAuthorizedClearance):Promise<ReviewResourceSnapshot>{
 if((await loadPreparationCheckpoint(key))?.format==='current')throw new Error('Current runtime clearance is main-owned');
 const receipt=clearance.approvalReceipt,selected=new Set(receipt.leaseIds);
 if(!same(receipt.reviewKey,key)||receipt.decision!=='approve'||!receipt.requestId||!selected.size||selected.size!==receipt.leaseIds.length||selected.size>MAX_REVIEW_OPEN_LEASES)throw new Error('Invalid resource clearance binding');
 const mutate=(rows:readonly ReviewGuardRow[])=>{
  const open=rows.flatMap(row=>row.resourceGuard.openLeases.map(l=>l.operationId));
  if(!open.some(id=>selected.has(id))&&rows.some(row=>same(row.resourceGuard.clearance,clearance)))return false;
  if(reviewGuardDigest(key,rows)!==receipt.guardDigest||![...selected].every(id=>open.includes(id)))throw new Error('Stale review resource clearance');
  return true;
 };
 if(key.family==='code')await updateStoredCodeCheckpoint(checkpointPath(key.project,key.reviewId),cp=>{
  if(!cp||cp.project!==key.project||cp.reviewId!==key.reviewId)throw new Error('Foreign resource checkpoint');
  const rows=cp.attempts.flatMap(a=>a.resourceGuard?[{attempt:a.header.attempt,resourceGuard:a.resourceGuard}]:[]);if(!mutate(rows))return cp;
  return{...cp,schemaVersion:2,attempts:cp.attempts.map(a=>!a.resourceGuard||!a.resourceGuard.openLeases.some(l=>selected.has(l.operationId))?a:{...a,resourceGuard:{...a.resourceGuard,openLeases:a.resourceGuard.openLeases.filter(l=>!selected.has(l.operationId)),clearance}})};
 });
 else await updateStoredDesignCheckpoint(key.project,key.reviewId,cp=>{
  if(!cp)throw new Error('Resource checkpoint missing');
  const rows=cp.attempts.flatMap(a=>'resourceGuard'in a&&a.resourceGuard?[{attempt:a.number,resourceGuard:a.resourceGuard}]:[]);if(!mutate(rows))return cp;
  return{...cp,schemaVersion:2,attempts:cp.attempts.map(a=>!('resourceGuard'in a)||!a.resourceGuard||!a.resourceGuard.openLeases.some(l=>selected.has(l.operationId))?a:{...a,resourceGuard:{...a.resourceGuard,openLeases:a.resourceGuard.openLeases.filter(l=>!selected.has(l.operationId)),clearance}})};
 },[],clearance);
 return inspectReviewResources(key);
}
