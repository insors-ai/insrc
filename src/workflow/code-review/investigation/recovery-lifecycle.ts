/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { foldRecoveryUsage } from './recovery-usage.js';
import { foldRecoveryAttempt, accountRecovery } from './recovery-attempts.js';
import { RecoveryError, recoveryRecord, recoveryInteger, recoveryId, recoveryDigest, recoveryVersion, recoveryValue } from './recovery-types.js';
import type { ReviewRecoveryV1, ResumeCompatibilityV1, RecoveryManifest, RecoveryEvent } from './recovery-types.js';
import type { RecoveryView } from './recovery-replay.js';
import { ledgerEqual, ledgerDigest } from './ledger-identity.js';
export function foldRecoveryLifecycle(view:RecoveryView,event:RecoveryEvent,raw:unknown,read?:(reference:string)=>unknown):RecoveryView {
 if(['usage-pending','usage-recorded'].includes(event.kind))return foldRecoveryUsage(view,event,raw);
 if(['attempt-issued','attempt-settled','extension'].includes(event.kind))return foldRecoveryAttempt(view,event,raw);
 const p=recoveryRecord(raw),old=view.lifecycle;
 const wall=p['wallMs'];recoveryInteger(wall);
 if(wall<old.lastWallMs)throw new RecoveryError('corrupt','Owner clock regressed.');
 let lifecycle={...old,lastWallMs:wall};let publication=view.publication;
 if(event.kind==='lease'){
  const leaseId=p['leaseId'],expiresAt=p['expiresAt'],processEpoch=p['processEpoch'];recoveryId(leaseId);recoveryId(processEpoch);
  if(typeof expiresAt!=='string'||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=wall)throw new RecoveryError('corrupt','Invalid lease expiration.');
  const renewing=old.owner?.leaseId===leaseId;
  if(renewing){if(event.generation!==old.generation||Date.parse(old.owner!.expiresAt)<=wall)throw new RecoveryError('corrupt','Expired lease renewal.');}
  else if(event.generation!==old.generation+1||old.owner&&Date.parse(old.owner.expiresAt)>wall&&processEpoch===old.processEpoch)throw new RecoveryError('corrupt','Conflicting lease claim.');
  if(['completed','cancelled','stale'].includes(old.state))throw new RecoveryError('corrupt','Cannot claim terminal run.');
  if(old.state==='completion-requested'&&!publication)throw new RecoveryError('unsupported','Legacy pending publication has no frozen intent.');
  lifecycle={...lifecycle,state:old.state==='completion-requested'?'completion-requested':'running',generation:event.generation,owner:{leaseId,generation:event.generation,expiresAt},processEpoch};
 }else{
  if(!old.owner||event.generation!==old.generation||p['leaseId']!==old.owner.leaseId||Date.parse(old.owner.expiresAt)<=wall)throw new RecoveryError('corrupt','Foreign lifecycle owner.');
  if(event.kind==='publication-intent'){
   recoveryVersion(p['version']);const ref=p['intentRef'],digest=p['intentDigest'],checkpoint=p['checkpointDigest'];recoveryDigest(digest);
   if(Object.keys(p).sort().join(',')!==['version','leaseId','wallMs','intentRef','intentDigest','checkpointDigest'].sort().join(',')
    ||old.state!=='running'||publication!==null||typeof ref!=='string'||typeof checkpoint!=='string'||checkpoint!==view.state.checkpoint
    ||view.accounting.attempts.some(a=>a.state==='issued'||a.state==='partially-accepted')||!read)throw new RecoveryError('invalid-input','Invalid publication intent boundary.');
   const intent=read(ref);recoveryRecord(intent);
   if(ledgerDigest(intent)!==digest)throw new RecoveryError('corrupt','Publication intent digest mismatch.');
   publication={version:1,intentRef:ref,intentDigest:digest,checkpointDigest:checkpoint,acceptedGeneration:event.generation};lifecycle={...lifecycle,state:'completion-requested'};
  }else if(event.kind==='release'){
   const state=p['state'];if(state!=='paused'&&state!=='cancelled'&&state!=='stale')throw new RecoveryError('corrupt','Invalid release state.');
   lifecycle={...lifecycle,state:publication&&state==='paused'?'completion-requested':state,owner:null};
  }else if(event.kind==='state'){
   const state=p['state'];
   if(state==='completion-requested'&&old.state==='running')lifecycle={...lifecycle,state};
   else if(state==='completed'&&old.state==='completion-requested'&&typeof p['receipt']==='string'&&p['receipt'])lifecycle={...lifecycle,state,completionReceipt:p['receipt']};
   else throw new RecoveryError('corrupt','Invalid lifecycle transition.');
  }else throw new RecoveryError('unsupported','Unsupported recovery control event.');
 }
 const accounting=lifecycle.generation!==old.generation?{...view.accounting,attempts:view.accounting.attempts.map(a=>['issued','partially-accepted'].includes(a.state)?{...a,state:'uncertain' as const}:a)}:view.accounting;
 return accountRecovery({...view,publication,lifecycle,eventOrdinal:event.ordinal,eventDigest:event.digest},accounting);
}
export function recoveryProjection(view:RecoveryView):ReviewRecoveryV1{
 return recoveryValue({schemaVersion:1,runId:view.manifest.runId,subjectDigest:view.manifest.subjectDigest,policyDigest:view.manifest.policyDigest,
  state:view.lifecycle.state,journalSequence:view.state.sequence,acceptedCheckpointDigest:view.state.checkpoint,owner:view.lifecycle.owner,attempts:view.accounting.attempts.map(a=>({attemptId:a.attemptId,requestDigest:a.requestDigest,state:a.state,acceptedSequence:a.acceptedSequence,usageReceipt:a.usageReceipt})),activeMsConsumed:view.state.consumedActiveMs,continuationsConsumed:view.state.attempts,
  blockCheckpoints:view.state.accepted.map(a=>({blockId:a.receipt.blockId,progressId:a.receipt.progressId,sequence:a.receipt.sequence,checkpointDigest:a.receipt.checkpointDigest})),outstandingWork:view.outstandingWork,completionReceipt:view.lifecycle.completionReceipt});
}
export function recoveryCompatibility(view:RecoveryView,current:Pick<RecoveryManifest,'subjectDigest'|'policyDigest'|'compatibility'>,fresh:boolean):ResumeCompatibilityV1{
 const reasons:string[]=[];
 if(!fresh||current.subjectDigest!==view.manifest.subjectDigest)reasons.push('Pinned source or approved contracts changed.');
 if(current.policyDigest!==view.manifest.policyDigest)reasons.push('Review policy changed.');
 if(!ledgerEqual(current.compatibility,view.manifest.compatibility))reasons.push('Engine, evidence, provider or tool compatibility changed.');
 return recoveryValue({kind:reasons.length?'stale':'compatible',invalidatedEvidenceIds:reasons.length?view.state.ledger.evidence.map(e=>e.evidenceId):[],reasons,extensionRequired:view.state.consumedActiveMs>=view.accounting.activeLimitMs||view.state.attempts>=view.accounting.attemptLimit});
}
