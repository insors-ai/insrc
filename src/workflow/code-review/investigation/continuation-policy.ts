/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { resolveReviewBudgetPolicy, reviewWireSchemaJson } from '../../../agent/providers/review-budget.js';
import { admitReviewBudget } from '../../review-pipeline/budget.js';
import { ledgerDigest, ledgerSnapshot } from './ledger-identity.js';
import { validateLedgerBasis } from './ledger-catalog.js';
import { InvestigationError } from './continuation-types.js';
import type { InvestigationPolicy, InvestigationContext, InvestigationTurnV1 } from './continuation-types.js';
export const INVESTIGATION_LIMITS=Object.freeze({attemptMs:300000,activeMs:120*60000,attempts:24,inclusiveTokens:128000});
const positive=(n:number)=>Number.isSafeInteger(n)&&n>0;
export function createInvestigationPolicy(provider:LLMProvider,options:{activeLimitMs?:number;attemptLimit?:number;providerLimitMs?:number;hostContextReserveTokens?:number}={}):InvestigationPolicy{
 const value={budget:resolveReviewBudgetPolicy(provider,'reviewer-session',INVESTIGATION_LIMITS.inclusiveTokens),activeLimitMs:options.activeLimitMs??INVESTIGATION_LIMITS.activeMs,
  attemptLimit:options.attemptLimit??INVESTIGATION_LIMITS.attempts,providerLimitMs:options.providerLimitMs??INVESTIGATION_LIMITS.attemptMs,hostContextReserveTokens:options.hostContextReserveTokens??0};
 if(!positive(value.activeLimitMs)||!positive(value.attemptLimit)||!positive(value.providerLimitMs)||!Number.isSafeInteger(value.hostContextReserveTokens)||value.hostContextReserveTokens<0)throw new InvestigationError('invalid-binding','Invalid investigation allowances.');
 return ledgerSnapshot({...value,digest:ledgerDigest(value)});
}
export function admitInvestigationRequest(policy:InvestigationPolicy,seed:Readonly<Record<string,unknown>>,schema:StructuredSchema){
 const {digest,...projection}=policy;
 if(ledgerDigest(projection)!==digest)throw new InvestigationError('invalid-binding','Policy digest mismatch.');
 try{return admitReviewBudget(policy.budget,{promptChars:JSON.stringify(ledgerSnapshot(seed)).length,wireSchemaJson:reviewWireSchemaJson(policy.budget.profile,schema),phase:'dispatch',hostContextReserveTokens:policy.hostContextReserveTokens});}
 catch(cause){throw new InvestigationError('budget-refused','Inclusive investigation request cannot be admitted.',{cause});}
}
export function assertInvestigationBindings(turn:InvestigationTurnV1,context:InvestigationContext):number{
 const t=ledgerSnapshot(turn),s=context.basis.subject,q=context.backend.qualification;
 validateLedgerBasis(context.basis);context.assertOwner(context.generation);
 if(t.runId!==context.basis.runId||t.subjectDigest!==s.subjectDigest||t.generation!==context.generation||!t.attemptId?.trim()
  ||t.policyDigest!==context.policy.digest||t.requestDigest!==ledgerDigest(context.seed)||context.state.ledger.runId!==t.runId||context.state.ledger.subjectDigest!==t.subjectDigest
  ||t.priorAcceptedCheckpoint!==context.state.checkpoint||context.role!=='review'||context.tier!=='core'||context.authorParty===context.reviewerParty)throw new InvestigationError('invalid-binding','Untrusted or mismatched review bindings.');
 if(!q.pinnedReads||!q.readOnly||!q.cancellable||!['in-session-progress','block-yield'].includes(q.progressMode)
  ||q.providerId!==context.providerId||q.providerId!==context.policy.budget.profile.providerId||q.profileDigest!==ledgerDigest(context.policy.budget.profile))throw new InvestigationError('unsupported-backend','Backend lacks qualified pinned progress/read capabilities.');
 const actual=resolveReviewBudgetPolicy(context.backend.provider,'reviewer-session',INVESTIGATION_LIMITS.inclusiveTokens);
 if(ledgerDigest(actual)!==ledgerDigest(context.policy.budget))throw new InvestigationError('unsupported-backend','Backend provider profile changed.');
 const refs=new Set(context.basis.requirements.flatMap(r=>[r.requirementRef]));
 for(const p of s.packets)for(const b of p.blocks)refs.add(b.blockId);
 if(!Array.isArray(t.assignment)||!Array.isArray(t.unresolvedRefs)||[...t.assignment,...t.unresolvedRefs].some(r=>!refs.has(r)))throw new InvestigationError('invalid-binding','Assignment references are outside the pinned basis.');
 const active=context.policy.activeLimitMs-context.state.consumedActiveMs,attempts=context.policy.attemptLimit-context.state.attempts;
 if(!Number.isSafeInteger(context.state.consumedActiveMs)||context.state.consumedActiveMs<0||!Number.isSafeInteger(context.state.attempts)||context.state.attempts<0
  ||t.limits.activeMsRemaining!==active||t.limits.continuationsRemaining!==attempts||t.limits.inclusiveTokenLimit!==context.policy.budget.totalTokens)throw new InvestigationError('invalid-binding','Remaining allowance mismatch.');
 const cap=Math.min(INVESTIGATION_LIMITS.attemptMs,active,context.policy.providerLimitMs);
 if(active<=0||attempts<=0||!positive(t.limits.attemptMs)||t.limits.attemptMs>cap)throw new InvestigationError('budget-refused','Continuation allowance exhausted or exceeded.');
 admitInvestigationRequest(context.policy,context.seed,context.schema);return t.limits.attemptMs;
}
