/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { LLMProvider } from '../../../../shared/types.js';
import { syntheticReviewBudget } from '../../../review-pipeline/__tests__/test-budget.js';
import { identifySubject } from '../identity.js';
import { buildLedgerBasis } from '../ledger-catalog.js';
import { basisFixture, catalogFixture } from './ledger-fixtures.js';
import { initializeReviewLedger } from '../ledger.js';
import { ledgerDigest } from '../ledger-identity.js';
import { createInvestigationPolicy, investigationRequestDigest, buildInvestigationSeed } from '../continuation-policy.js';
import type { InvestigationContext, InvestigationState, InvestigationTurnV1, InvestigationReplyV1, ReviewBlockProgressV1 } from '../continuation-types.js';
export function continuationFixture(){
 const provider:LLMProvider={getReviewBudgetProfile:()=>syntheticReviewBudget('reviewer-session',128000).profile,
  complete:async()=>{throw Error('unexpected model call');},async *stream(){},embed:async()=>[],completeStructured:async()=>{throw Error('unexpected model call');},supportsTools:false,
  capabilities:{structuredOutput:true,toolCalling:false,vision:false,webSearch:false,streaming:false,embeddings:false}};
 const basis=basisFixture(),ledger=initializeReviewLedger(basis),policy=createInvestigationPolicy(provider);
 const state:InvestigationState={ledger,sequence:0,checkpoint:'initial',accepted:[],consumedActiveMs:0,attempts:0,uncertainProgressId:null,usage:[]};
 const seed=buildInvestigationSeed(basis,state);
 const values=new Map<string,unknown>(),states:InvestigationState[]=[];let clock=0;
 const context:InvestigationContext={basis,state,policy,generation:1,authorParty:'controller',reviewerParty:'daemon',role:'review',tier:'core',providerId:'fixture',
  backend:{provider,qualification:{providerId:'fixture',profileDigest:ledgerDigest(policy.budget.profile),pinnedReads:true,readOnly:true,progressMode:'in-session-progress',cancellable:true},execute:async()=>{throw Error('not configured');}},
  ports:{readEvidence:async()=>{throw Error('not configured');},stageImmutableValue:async(_run,value)=>{const digest=ledgerDigest(value);values.set(digest,value);return {reference:digest,digest};},
   appendTransition:async(_run,_gen,sequence,ref)=>({sequence:sequence+1,checkpointDigest:ledgerDigest({sequence:sequence+1,ref})}),recordAttemptUsage:async()=>({state:'recorded',receiptRef:'usage'})},
  validation:{attempt:{runId:basis.runId,subjectDigest:basis.subject.subjectDigest,attemptId:'attempt-1'},receipts:[]},schema:{type:'object',properties:{},additionalProperties:false},seed,now:()=>clock,
  assertFresh:async()=>{},assertOwner:()=>{},inspect:async()=>{throw Error('not configured');},impact:{mode:'source-only',index:null,queryChangedEntityCallers:null},changedEntity:()=>null,impactReceipts:()=>[],observeUsage:()=>null,onState:value=>{states.push(value);}};
 const turn:InvestigationTurnV1={runId:basis.runId,subjectDigest:basis.subject.subjectDigest,generation:1,attemptId:'attempt-1',requestDigest:ledgerDigest(seed),policyDigest:policy.digest,
  assignment:[basis.requirements[0]!.requirementRef],navigationRefs:[],unresolvedRefs:[],priorAcceptedCheckpoint:'initial',limits:{attemptMs:300000,activeMsRemaining:policy.activeLimitMs,continuationsRemaining:policy.attemptLimit,inclusiveTokenLimit:128000}};
 return {provider,basis,context,turn:{...turn,requestDigest:investigationRequestDigest(turn,seed)},states,values,setClock:(n:number)=>{clock=n;}};
}

export function twoBlockFixture(){
 const f=continuationFixture(),input=catalogFixture(),{subjectId:_,subjectDigest:__,...projection}=input.subject;
 const packet=input.subject.packets[0]!;
 const subject=identifySubject({...projection,packets:[{...packet,blocks:[...packet.blocks,{...packet.blocks[0]!,blockId:'block-2',kind:'mode'}]}]});
 const basis=buildLedgerBasis({...input,subject}),state={...f.context.state,ledger:initializeReviewLedger(basis)},seed=buildInvestigationSeed(basis,state);
 const context={...f.context,basis,state,seed,validation:{...f.context.validation,attempt:{...f.context.validation.attempt,subjectDigest:subject.subjectDigest}}};
 const t={...f.turn,subjectDigest:subject.subjectDigest};return {...f,basis,context,turn:{...t,requestDigest:investigationRequestDigest(t,seed)}};
}
export function progressFor(turn:InvestigationTurnV1,blockId:string,expectedSequence:number):ReviewBlockProgressV1{
 return {runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,progressId:`${turn.attemptId}-${blockId}`,expectedSequence,blockId,disposition:'unverified',evidenceIds:[],notes:'Needs additional inspection',coverageUpdates:[],findings:[],outstandingWork:[]};
}
export function finalReply(turn:InvestigationTurnV1,ids:readonly string[],sequence:number):InvestigationReplyV1{
 return {runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,acceptedBlockReceiptIds:ids,lastAcceptedSequence:sequence,inspectedEvidenceIds:[],coverageUpdates:[],findings:[],next:{kind:'continue',remainingWork:[],reason:'More work remains'}};
}
