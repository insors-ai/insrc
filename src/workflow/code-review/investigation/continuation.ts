/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import { admitInvestigationRequest, assertInvestigationBindings, investigationRequestDigest, buildInvestigationSeed, INVESTIGATION_LIMITS } from './continuation-policy.js';
import { InvestigationNavigation, untilInvestigationAborted } from './navigation.js';
import { BlockProgressCoordinator } from './progress.js';
import { ledgerSnapshot } from './ledger-identity.js';
import { InvestigationError } from './continuation-types.js';
import type { InvestigationContext, InvestigationTurnV1, InvestigationReplyV1, InvestigationTools, InvestigationState } from './continuation-types.js';
/** Only classified transport transience is retried; unknown/schema/policy failures pause. */
export class InvestigationTransientError extends Error { constructor(message='Transient investigation transport failure.'){super(message);this.name='InvestigationTransientError';} }
const unresolved=(owner:BlockProgressCoordinator,context:InvestigationContext)=>context.basis.requirements.filter(r=>{
 const row=owner.state.ledger.coverage.find(c=>c.requirementRef===r.requirementRef&&c.category===r.category);return !row||row.disposition==='pending'||row.disposition==='unverified';
}).map(r=>r.requirementRef);
function pause(turn:InvestigationTurnV1,owner:BlockProgressCoordinator,context:InvestigationContext,reason:string):InvestigationReplyV1{
 return ledgerSnapshot({runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,
  acceptedBlockReceiptIds:owner.state.accepted.map(a=>a.receipt.progressId),lastAcceptedSequence:owner.state.sequence,inspectedEvidenceIds:owner.state.ledger.evidence.map(e=>e.evidenceId),coverageUpdates:[],findings:[],
  next:{kind:'pause',remainingWork:unresolved(owner,context),reason}});
}
function checkReply(raw:InvestigationReplyV1,turn:InvestigationTurnV1,owner:BlockProgressCoordinator,context:InvestigationContext):InvestigationReplyV1{
 const reply=ledgerSnapshot(raw),accepted=new Set(owner.state.accepted.map(a=>a.receipt.progressId)),evidence=new Set(owner.state.ledger.evidence.map(e=>e.evidenceId));
 if(reply.runId!==turn.runId||reply.subjectDigest!==turn.subjectDigest||reply.generation!==turn.generation||reply.attemptId!==turn.attemptId||reply.lastAcceptedSequence!==owner.state.sequence
  ||!Array.isArray(reply.acceptedBlockReceiptIds)||new Set(reply.acceptedBlockReceiptIds).size!==reply.acceptedBlockReceiptIds.length||reply.acceptedBlockReceiptIds.length!==accepted.size||reply.acceptedBlockReceiptIds.some(id=>!accepted.has(id))
  ||!Array.isArray(reply.inspectedEvidenceIds)||reply.inspectedEvidenceIds.some(id=>!evidence.has(id))||!Array.isArray(reply.coverageUpdates)||reply.coverageUpdates.length||!Array.isArray(reply.findings)||reply.findings.length
  ||!reply.next||!['continue','request-completion','pause'].includes(reply.next.kind)||typeof reply.next.reason!=='string'||!reply.next.reason.trim()||!Array.isArray(reply.next.remainingWork))throw new InvestigationError('invalid-progress','Final reply is not bound to accepted progress; final deltas must be checkpointed first.');
 const known=new Set(context.basis.requirements.map(r=>r.requirementRef));for(const b of context.basis.subject.packets.flatMap(p=>p.blocks))known.add(b.blockId);
 if(reply.next.remainingWork.some(r=>!known.has(r)))throw new InvestigationError('invalid-progress','Unknown outstanding work in final reply.');
 return ledgerSnapshot({...reply,next:{...reply.next,remainingWork:[...new Set([...reply.next.remainingWork,...unresolved(owner,context)])]}});
}
/** Exactly one continuation, plus at most one immediate transient retry. No pending-backlog sweep. */
export async function runInvestigationContinuation(input:InvestigationTurnV1,initial:InvestigationContext):Promise<InvestigationReplyV1>{
 assertInvestigationBindings(input,initial);
 let turn=ledgerSnapshot(input),context=initial,state=initial.state;
 for(let retry=0;retry<2;retry++){
  const cap=assertInvestigationBindings(turn,{...context,state});
  const controller=new AbortController(),signal=context.signal?AbortSignal.any([context.signal,controller.signal]):controller.signal;
  const started=context.now(),deadline=started+cap;
  const timer=setTimeout(()=>controller.abort(new InvestigationError('budget-refused','Attempt deadline elapsed.')),cap);
  const check=()=>{signal.throwIfAborted();context.assertOwner(turn.generation);if(context.now()>=deadline)throw new InvestigationError('budget-refused','Active attempt deadline elapsed.');};
  let owner!:BlockProgressCoordinator,navigation!:InvestigationNavigation;
  const guarded={...context,state,signal,assertOwner:(_generation:number)=>check()};
  navigation=new InvestigationNavigation(turn,guarded,signal,async(basis,blockId,refs)=>{
   check();await owner.accept({runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,progressId:`impact-${turn.attemptId}-${refs[0]}`,expectedSequence:owner.state.sequence,blockId,disposition:'unverified',evidenceIds:[],notes:'Caller impact remains an explicit obligation; empty/stale results cannot prove no impact.',coverageUpdates:[],findings:[],outstandingWork:refs});
  });
  owner=new BlockProgressCoordinator(turn,guarded,navigation.validation,()=>navigation.basis);
  let failure:unknown=null,reply:InvestigationReplyV1|null=null;
  const currentContext=():InvestigationContext=>({...context,basis:navigation.basis,state:owner.state,validation:navigation.validation()});
  try{
   check();await untilInvestigationAborted(context.assertFresh(),signal);check();
   owner.account({attempts:state.attempts+1,consumedActiveMs:state.consumedActiveMs,usage:state.usage});
   const budget=admitInvestigationRequest(context.policy,{turn,seed:context.seed},context.schema);
   const tools:InvestigationTools={read:navigation.read,impact:navigation.capability(),progress:async p=>{
    check();const otherBlock=owner.state.accepted.some(a=>a.progress.attemptId===turn.attemptId&&a.progress.blockId!==p.blockId);
    const replay=owner.state.accepted.some(a=>a.progress.progressId===p.progressId);
    if(context.backend.qualification.progressMode==='block-yield'&&otherBlock&&!replay)throw new InvestigationError('unsupported-backend','Block-yield backend must return before another block assessment.');
    const receipt=await owner.accept(p);check();return receipt;
   },seed:ledgerSnapshot(context.seed),execution:{budget:{policy:context.policy.budget,admitted:budget,outputAllowanceTokens:context.policy.budget.profile.completionReserveTokens,reviewId:turn.runId,callId:randomUUID(),stage:'judge',role:'investigation',attempt:owner.state.attempts},timeoutMs:cap,stallMs:Math.min(300000,cap),internalRetry:false}};
   reply=await untilInvestigationAborted(context.backend.execute(turn,tools,signal),signal);check();
   reply=checkReply(reply,turn,owner,currentContext());
  }catch(cause){failure=signal.aborted&&controller.signal.reason instanceof InvestigationError?controller.signal.reason:cause;}
  finally{
   clearTimeout(timer);controller.abort();
   const elapsed=Math.max(0,Math.ceil(context.now()-started));
   context.assertOwner(turn.generation);
   owner.account({attempts:owner.state.attempts,consumedActiveMs:owner.state.consumedActiveMs+elapsed,usage:owner.state.usage});state=owner.state;
  }
  if(reply&&failure===null)return reply;
  const active=context.policy.activeLimitMs-state.consumedActiveMs,remaining=context.policy.attemptLimit-state.attempts;
  if(retry===0&&failure instanceof InvestigationTransientError&&!context.signal?.aborted&&!state.uncertainProgressId&&active>0&&remaining>0){
   const attemptId=randomUUID();
   const next={...turn,attemptId,priorAcceptedCheckpoint:state.checkpoint,limits:{...turn.limits,attemptMs:Math.min(INVESTIGATION_LIMITS.attemptMs,context.policy.providerLimitMs,active),activeMsRemaining:active,continuationsRemaining:remaining}};
   const seed=buildInvestigationSeed(navigation.basis,state,context.seed['history'] as readonly unknown[]);
   turn=ledgerSnapshot({...next,requestDigest:investigationRequestDigest(next,seed)});
   context={...context,state,seed,validation:{...navigation.validation(),attempt:{runId:turn.runId,subjectDigest:turn.subjectDigest,attemptId}},basis:navigation.basis};continue;
  }
  const reason=context.signal?.aborted?'cancelled':failure instanceof InvestigationError?failure.code:'provider-failed';
  return pause(turn,owner,currentContext(),reason);
 }
 throw new InvestigationError('provider-failed','Unreachable retry state.');
}
