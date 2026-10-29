/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { validateAttribution } from '../../usage/attribution.js';
import { RecoveryError, recoveryId, recoveryInteger, recoveryRecord, recoveryValue } from './recovery-types.js';
import { ledgerEqual } from './ledger-identity.js';
import type { RecoveryEvent } from './recovery-types.js';
import type { RecoveryView } from './recovery-replay.js';
import type { ReviewUsageObservationV1 } from './types.js';
export interface RecoveryUsageWriter {
 readonly idempotent: true;
 /** Adapter must use this exact key with the existing usage service, not mint another call. */
 readonly write: (observation:ReviewUsageObservationV1,idempotencyKey:string)=>Promise<string>;
}
const counterKeys=['inputUncachedTokens','cacheReadTokens','cacheWriteTokens','outputTokens','reasoningTokens'].sort().join(',');
export function validateRecoveryUsage(view:RecoveryView,raw:ReviewUsageObservationV1):ReviewUsageObservationV1{
 const v=recoveryValue(raw),build=view.manifest.basis.subject.build.artifactId;recoveryId(v.observationId);
 if(v.runId!==view.manifest.runId||!view.accounting.attempts.some(a=>a.attemptId===v.attemptId)||v.activity!=='code-review'||v.chargedArtifactId!==build||v.subjectArtifactId!==build
  ||validateAttribution({activity:v.activity,chargedArtifactId:build,subjectArtifactId:build,storyBuildId:build}).length
  ||!['reported','estimated','unavailable'].includes(v.quality)||!['model-call','invocation-total','cumulative-snapshot'].includes(v.granularity)
  ||typeof v.providerId!=='string'||!v.providerId||!v.counters||Object.keys(v.counters).sort().join(',')!==counterKeys
  ||Object.values(v.counters).some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0))
  ||v.quality==='unavailable'&&Object.values(v.counters).some(n=>n!==null)
  ||v.counters.reasoningTokens!==null&&v.counters.outputTokens!==null&&v.counters.reasoningTokens>v.counters.outputTokens
  ||v.granularity==='cumulative-snapshot'&&!v.nativeObservationRef)throw new RecoveryError('invalid-input','Invalid recovery usage attribution or counters.');
 recoveryInteger(v.elapsedActiveMs);recoveryInteger(v.allowanceTokens,1);
 if(v.allowanceTokens>view.manifest.policy.budget.totalTokens)throw new RecoveryError('invalid-input','Usage allowance exceeds pinned policy.');
 for(const field of [v.providerRequestId,v.modelId,v.nativeObservationRef])if(field!==null&&(typeof field!=='string'||!field))throw new RecoveryError('invalid-input','Invalid native usage identity.');
 return v;
}
export function foldRecoveryUsage(view:RecoveryView,event:RecoveryEvent,raw:unknown):RecoveryView{
 const p=recoveryRecord(raw);recoveryInteger(p['wallMs']);
 if(event.generation!==view.lifecycle.generation||p['accountingOnly']!==true)throw new RecoveryError('corrupt','Foreign usage accounting event.');
 let usage=[...view.state.usage],attempts=[...view.accounting.attempts];
 if(event.kind==='usage-pending'){
  const observation=validateRecoveryUsage(view,p['observation'] as ReviewUsageObservationV1),old=usage.find(u=>u.observation.observationId===observation.observationId);
  if(old){if(!ledgerEqual(old.observation,observation))throw new RecoveryError('corrupt','Conflicting usage identity.');}
  else usage.push({observation,state:'pending',receiptRef:null});
 }else if(event.kind==='usage-recorded'){
  const id=p['observationId'],receipt=p['receiptRef'];recoveryId(id);
  if(typeof receipt!=='string'||!receipt)throw new RecoveryError('corrupt','Missing usage receipt.');
  const old=usage.find(u=>u.observation.observationId===id);if(!old||old.state==='recorded'&&old.receiptRef!==receipt)throw new RecoveryError('corrupt','Conflicting usage receipt.');
  usage=usage.map(u=>u===old?{...u,state:'recorded',receiptRef:receipt}:u);
  attempts=attempts.map(a=>a.attemptId===old.observation.attemptId?{...a,usageReceipt:receipt}:a);
 }else throw new RecoveryError('unsupported','Unknown usage event.');
 return recoveryValue({...view,eventOrdinal:event.ordinal,eventDigest:event.digest,accounting:{...view.accounting,attempts},state:{...view.state,usage}});
}
