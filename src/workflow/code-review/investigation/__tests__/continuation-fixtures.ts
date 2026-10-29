/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { LLMProvider } from '../../../../shared/types.js';
import { syntheticReviewBudget } from '../../../review-pipeline/__tests__/test-budget.js';
import { basisFixture } from './ledger-fixtures.js';
import { initializeReviewLedger } from '../ledger.js';
import { ledgerDigest } from '../ledger-identity.js';
import { createInvestigationPolicy, investigationRequestDigest, buildInvestigationSeed } from '../continuation-policy.js';
import type { InvestigationContext, InvestigationState, InvestigationTurnV1 } from '../continuation-types.js';
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
