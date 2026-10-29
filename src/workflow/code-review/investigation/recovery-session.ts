/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import { RecoveryError } from './recovery-types.js';
import type { ReviewRecoveryV1 } from './recovery-types.js';
import type { RecoveryStore } from './recovery-store.js';
import type { InvestigationContext, InvestigationTurnV1 } from './continuation-types.js';
import { buildInvestigationSeed, investigationRequestDigest } from './continuation-policy.js';
import { runInvestigationContinuation } from './continuation.js';
import { recordInvestigationUsage } from './continuation-usage.js';
import { durableInvestigationBackend } from './recovery-attempts.js';
/** Internal composition boundary for s6. It does not register an engine or publish a verdict. */
export async function runRecoveredContinuation(store:RecoveryStore,lease:NonNullable<ReviewRecoveryV1['owner']>,input:InvestigationTurnV1,initial:InvestigationContext){
 const view=store.replay();store.assertLease(view,lease.leaseId,lease.generation);
 const compatibility=await store.compatibility({subjectDigest:initial.basis.subject.subjectDigest,policyDigest:initial.policy.digest,compatibility:store.options.currentCompatibility},initial.assertFresh);
 if(compatibility.kind!=='compatible'||compatibility.extensionRequired)throw new RecoveryError(compatibility.kind!=='compatible'?'stale':'budget-exhausted','Recovery is not admitted.');
 const attemptId=view.accounting.attempts.some(a=>a.attemptId===input.attemptId)?randomUUID():input.attemptId;
 const policy={...initial.policy,activeLimitMs:view.accounting.activeLimitMs,attemptLimit:view.accounting.attemptLimit};
 const reviewed=new Set(view.state.accepted.filter(a=>a.progress.disposition==='reviewed').map(a=>a.progress.blockId));
 const assessed=new Set(view.state.ledger.coverage.filter(r=>!['pending','unverified'].includes(r.disposition)).map(r=>r.requirementRef));
 const seed=buildInvestigationSeed(view.basis,view.state,initial.seed['history'] as readonly unknown[]);
 const draft={...input,attemptId,generation:lease.generation,priorAcceptedCheckpoint:view.state.checkpoint,assignment:input.assignment.filter(ref=>!reviewed.has(ref)&&!assessed.has(ref)),unresolvedRefs:view.outstandingWork,limits:{...input.limits,attemptMs:Math.min(input.limits.attemptMs,policy.providerLimitMs,policy.activeLimitMs-view.state.consumedActiveMs),activeMsRemaining:policy.activeLimitMs-view.state.consumedActiveMs,continuationsRemaining:policy.attemptLimit-view.state.attempts}};
 const turn={...draft,requestDigest:investigationRequestDigest(draft,seed)};
 let latest=view.state;
 const context:InvestigationContext={...initial,policy,basis:view.basis,state:view.state,seed,generation:lease.generation,validation:{attempt:{runId:turn.runId,subjectDigest:turn.subjectDigest,attemptId},receipts:view.receipts},
  backend:durableInvestigationBackend(store,lease.leaseId,lease.generation,initial.backend),ports:store.ports(lease.generation,attemptId,lease.leaseId),
  assertOwner:generation=>{initial.assertOwner(generation);store.assertLease(store.replay(),lease.leaseId,generation);},onState:state=>{latest=state;initial.onState(state);}};
 try{return await runInvestigationContinuation(turn,context);}
 finally{
  // sc3 can retain usage without invoking its port when allowance is exhausted. Flush that collection before returning.
  for(const item of latest.usage)await store.recordUsage(item.observation);
  // An interruption before sc3's usage callback must still leave explicit unknown consumption for each issued request.
  const recovered=store.replay();
  for(const attempt of recovered.accounting.attempts.filter(a=>!recovered.state.usage.some(u=>u.observation.attemptId===a.attemptId))){
   const usageTurn={...turn,attemptId:attempt.attemptId};
   const usageContext={...context,state:recovered.state,observeUsage:()=>null,onState:(state:typeof latest)=>{latest=state;}};
   await recordInvestigationUsage(usageTurn,usageContext,recovered.state,attempt.elapsedMs??attempt.reservedMs);
   for(const item of latest.usage)await store.recordUsage(item.observation);
  }
 }
}
