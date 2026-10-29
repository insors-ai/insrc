/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { validateAttribution } from '../../usage/attribution.js';
import type { NormalizedCounters } from '../../usage/types.js';
import { ledgerDigest, ledgerEqual, ledgerSnapshot } from './ledger-identity.js';
import { InvestigationError } from './continuation-types.js';
import type { InvestigationContext, InvestigationState, InvestigationTurnV1 } from './continuation-types.js';
import type { ReviewUsageObservationV1 } from './types.js';
const unknownCounters:NormalizedCounters={inputUncachedTokens:null,cacheReadTokens:null,cacheWriteTokens:null,outputTokens:null,reasoningTokens:null};
function observationFor(turn:InvestigationTurnV1,context:InvestigationContext,elapsedActiveMs:number):ReviewUsageObservationV1{
 let observed:ReviewUsageObservationV1|null;
 try{observed=context.observeUsage(turn.attemptId);}catch{observed=null;}
 const build=context.basis.subject.build.artifactId;
 const value=ledgerSnapshot<ReviewUsageObservationV1>(observed??{runId:turn.runId,attemptId:turn.attemptId,observationId:`usage-${ledgerDigest({runId:turn.runId,attemptId:turn.attemptId,kind:'managed-invocation'})}`,
  activity:'code-review',chargedArtifactId:build,subjectArtifactId:build,providerRequestId:null,quality:'unavailable',providerId:context.providerId,modelId:null,
  granularity:'invocation-total',counters:unknownCounters,nativeObservationRef:null,allowanceTokens:turn.limits.inclusiveTokenLimit,elapsedActiveMs});
 if(value.runId!==turn.runId||value.attemptId!==turn.attemptId||!value.observationId?.trim()||value.activity!=='code-review'||value.providerId!==context.providerId
  ||value.chargedArtifactId!==build||value.subjectArtifactId!==build||validateAttribution({activity:'code-review',chargedArtifactId:build,subjectArtifactId:build,storyBuildId:build}).length
  ||!['reported','estimated','unavailable'].includes(value.quality)||!['model-call','invocation-total','cumulative-snapshot'].includes(value.granularity)
  ||!Number.isSafeInteger(value.elapsedActiveMs)||value.elapsedActiveMs<0||value.allowanceTokens!==turn.limits.inclusiveTokenLimit)throw new InvestigationError('invalid-binding','Usage observation does not match the attempt/BUILD attribution.');
 const counters=value.counters;
 if(!counters||Object.keys(counters).sort().join(',')!==Object.keys(unknownCounters).sort().join(',')||Object.values(counters).some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0))
  ||(counters.reasoningTokens!==null&&counters.outputTokens!==null&&counters.reasoningTokens>counters.outputTokens)
  ||(value.quality==='unavailable'&&Object.values(counters).some(n=>n!==null))||(value.granularity==='cumulative-snapshot'&&!value.nativeObservationRef))throw new InvestigationError('invalid-binding','Invalid usage counters or unavailable/cumulative provenance.');
 return value;
}
/** Retain a pending observation before invoking the idempotent writer; s4 owns the durable outbox. */
export async function recordInvestigationUsage(turn:InvestigationTurnV1,context:InvestigationContext,state:InvestigationState,elapsedActiveMs:number):Promise<InvestigationState>{
 const observation=observationFor(turn,context,elapsedActiveMs),prior=state.usage.find(u=>u.observation.observationId===observation.observationId);
 if(prior){if(!ledgerEqual(prior.observation,observation))throw new InvestigationError('invalid-binding','Usage identity has conflicting content.');return state;}
 const pending=ledgerSnapshot({...state,usage:[...state.usage,{observation,state:'pending' as const,receiptRef:null}]});context.onState(pending);
 const remaining=context.policy.activeLimitMs-state.consumedActiveMs;
 if(remaining<=0)return pending;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const outcome=await Promise.race([context.ports.recordAttemptUsage(observation),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),Math.min(1000,remaining));})]);
  if(!outcome)return pending;
  if(!['recorded','pending','unavailable'].includes(outcome.state)||(outcome.receiptRef!==null&&typeof outcome.receiptRef!=='string'))throw new InvestigationError('invalid-binding','Invalid usage writer receipt.');
  const next=ledgerSnapshot({...pending,usage:pending.usage.map(u=>u.observation.observationId===observation.observationId?{...u,state:outcome.state,receiptRef:outcome.receiptRef}:u)});context.onState(next);return next;
 }catch(cause){if(cause instanceof InvestigationError)throw cause;return pending;}
 finally{if(timer)clearTimeout(timer);}
}
