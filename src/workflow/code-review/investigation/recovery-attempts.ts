/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { performance } from 'node:perf_hooks';
import { RecoveryError, recoveryId, recoveryDigest, recoveryInteger, recoveryRecord, recoveryValue } from './recovery-types.js';
import type { RecoveryEvent } from './recovery-types.js';
import type { RecoveryView } from './recovery-replay.js';
import type { InvestigationBackend } from './continuation-types.js';
import type { RecoveryStore } from './recovery-store.js';
import { investigationRequestDigest } from './continuation-policy.js';
import { untilInvestigationAborted } from './navigation.js';
export interface RecoveryAttempt {
 readonly attemptId:string;readonly requestDigest:string;readonly generation:number;
 readonly state:'issued'|'partially-accepted'|'accepted'|'failed'|'uncertain'|'cancelled';
 readonly reservedMs:number;readonly elapsedMs:number|null;readonly priorAttemptId:string|null;
 readonly acceptedSequence:number|null;readonly usageReceipt:string|null;
}
export interface RecoveryAccounting {readonly attempts:readonly RecoveryAttempt[];readonly activeLimitMs:number;readonly attemptLimit:number;}
export function accountRecovery(view:RecoveryView,accounting:RecoveryAccounting):RecoveryView{
 const consumedActiveMs=accounting.attempts.reduce((sum,a)=>sum+(a.elapsedMs??a.reservedMs),0);
 if(!Number.isSafeInteger(consumedActiveMs))throw new RecoveryError('corrupt','Invalid accumulated attempt time.');
 return recoveryValue({...view,accounting,state:{...view.state,consumedActiveMs,attempts:accounting.attempts.length}});
}
export function foldRecoveryAttempt(view:RecoveryView,event:RecoveryEvent,raw:unknown):RecoveryView{
 const p=recoveryRecord(raw),wall=p['wallMs'],owner=view.lifecycle.owner;
 recoveryInteger(wall);
 if(!owner||owner.leaseId!==p['leaseId']||owner.generation!==event.generation||wall<view.lifecycle.lastWallMs||Date.parse(owner.expiresAt)<=wall)throw new RecoveryError('corrupt','Foreign attempt owner.');
 let accounting=view.accounting;
 if(event.kind==='attempt-issued'){
  const attemptId=p['attemptId'],requestDigest=p['requestDigest'],reservedMs=p['reservedMs'];recoveryId(attemptId);recoveryDigest(requestDigest);recoveryInteger(reservedMs,1);
  if(view.lifecycle.state!=='running'||accounting.attempts.some(a=>a.attemptId===attemptId)||accounting.attempts.some(a=>a.state==='issued'||a.state==='partially-accepted')
   ||reservedMs>Math.min(300000,view.manifest.policy.providerLimitMs)||view.state.consumedActiveMs+reservedMs>accounting.activeLimitMs||accounting.attempts.length>=accounting.attemptLimit)throw new RecoveryError('budget-exhausted','Attempt reservation refused.');
  const priorAttemptId=accounting.attempts.at(-1)?.attemptId??null;
  if(p['priorAttemptId']!==priorAttemptId)throw new RecoveryError('corrupt','Missing retry provenance.');
  accounting={...accounting,attempts:[...accounting.attempts,{attemptId,requestDigest,generation:event.generation,state:'issued',reservedMs,elapsedMs:null,priorAttemptId,acceptedSequence:null,usageReceipt:null}]};
 }else if(event.kind==='attempt-settled'){
  const attemptId=p['attemptId'],elapsedMs=p['elapsedMs'],state=p['state'];recoveryId(attemptId);recoveryInteger(elapsedMs);
  const old=accounting.attempts.find(a=>a.attemptId===attemptId);
  if(!old||old.generation!==event.generation||!['issued','partially-accepted'].includes(old.state)||!['accepted','failed','cancelled'].includes(String(state))||elapsedMs>old.reservedMs)throw new RecoveryError('corrupt','Invalid attempt settlement.');
  accounting={...accounting,attempts:accounting.attempts.map(a=>a===old?{...a,state:state as RecoveryAttempt['state'],elapsedMs}:a)};
 }else if(event.kind==='extension'){
  const activeLimitMs=p['activeLimitMs'],attemptLimit=p['attemptLimit'];recoveryInteger(activeLimitMs,1);recoveryInteger(attemptLimit,1);
  if(activeLimitMs<accounting.activeLimitMs||attemptLimit<accounting.attemptLimit||typeof p['reason']!=='string'||!p['reason'].trim())throw new RecoveryError('corrupt','Invalid allowance extension.');
  accounting={...accounting,activeLimitMs,attemptLimit};
 }else throw new RecoveryError('unsupported','Unsupported attempt event.');
 return accountRecovery({...view,lifecycle:{...view.lifecycle,lastWallMs:wall},eventOrdinal:event.ordinal,eventDigest:event.digest},accounting);
}
/** Wrap every actual backend dispatch, including sc3's one permitted transient retry. */
export function durableInvestigationBackend(store:RecoveryStore,leaseId:string,generation:number,backend:InvestigationBackend,now:()=>number=()=>performance.now()):InvestigationBackend{
 return {...backend,execute:async(turn,tools,signal)=>{
  if(turn.generation!==generation||turn.requestDigest!==investigationRequestDigest(turn,tools.seed))throw new RecoveryError('invalid-input','Attempt request changed before dispatch.');
  signal.throwIfAborted();await store.issueAttempt(leaseId,generation,turn,tools.execution.timeoutMs);
  const start=now();let state:'accepted'|'failed'|'cancelled'='failed';
  try{const reply=await untilInvestigationAborted(backend.execute(turn,tools,signal),signal);state='accepted';return reply;}
  finally{if(signal.aborted)state='cancelled';const elapsed=Math.max(0,Math.min(tools.execution.timeoutMs,Math.ceil(now()-start)));await store.settleAttempt(leaseId,generation,turn.attemptId,state,elapsed);}
 }};
}
