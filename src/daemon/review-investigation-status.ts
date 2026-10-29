/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewClientStatusV1,ReviewInvestigationDiagnosticsV1 } from '../shared/review-investigation.js';
import { ReviewIntegrationError } from '../shared/review-investigation.js';
import type { RecoveryView } from '../workflow/code-review/investigation/recovery-replay.js';
import type { ResumeCompatibilityV1 } from '../workflow/code-review/investigation/recovery-types.js';
import type { ReviewCompletionReceiptV1 } from '../workflow/code-review/investigation/completion-types.js';
import type { ReviewBudgetBreakdown } from '../shared/review-budget.js';
import { snapshotValue } from '../workflow/code-review/investigation/identity.js';

export interface InvestigationStatusInputs {
 readonly view:RecoveryView;readonly compatibility:ResumeCompatibilityV1;readonly readiness:{readonly available:boolean;readonly reason:string|null};
 readonly receipt:ReviewCompletionReceiptV1|null;
 readonly preflight?:ReviewBudgetBreakdown|null|undefined;
 readonly providerLivenessAt?:string|null|undefined;
 readonly error?:ReviewClientStatusV1['error']|undefined;
}
/** Read-only sc7 projection. No clock advancement, journal append, lease renewal,
 * token-counter addition or model request occurs while serializing status. */
export function investigationStatus(input:InvestigationStatusInputs):{status:ReviewClientStatusV1;diagnostics:ReviewInvestigationDiagnosticsV1}{
 const {view:v,compatibility:c}=input,rows=v.state.ledger.coverage;
 const unresolved=[...new Set([...rows.filter(row=>row.disposition==='pending'||row.disposition==='unverified').map(row=>row.requirementRef),...v.outstandingWork])];
 const last=new Map(v.state.accepted.map(a=>[a.progress.blockId,a]));
 const outstandingBlockIds=v.basis.subject.packets.flatMap(p=>p.blocks).filter(b=>last.get(b.blockId)?.progress.disposition!=='reviewed').map(b=>b.blockId);
 const unavailable=new Set(v.state.usage.filter(u=>u.observation.quality==='unavailable').map(u=>u.observation.attemptId));
 const pending=new Set(v.state.usage.filter(u=>u.state==='pending').map(u=>u.observation.attemptId));
 const estimated=new Set(v.state.usage.filter(u=>u.observation.quality==='estimated').map(u=>u.observation.attemptId));
 for(const attempt of v.accounting.attempts)if(!v.state.usage.some(u=>u.observation.attemptId===attempt.attemptId)){
  if(attempt.state==='issued'||attempt.state==='partially-accepted')pending.add(attempt.attemptId);else unavailable.add(attempt.attemptId);
 }
 // A cumulative snapshot is never exposed as an additive call-total receipt.
 // Exact spend aggregation belongs to the existing usage reducer/service.
 const observed=v.state.usage.filter(u=>u.state==='recorded'&&u.receiptRef&&u.observation.quality==='reported'&&u.observation.granularity!=='cumulative-snapshot'&&Object.values(u.observation.counters).some(n=>n!==null));
 const reportedRef=observed.length===1?observed[0]!.receiptRef:null;
 const preflight=input.preflight??null;
 const estimatedInputTokens=preflight?preflight.promptTokens+preflight.schemaTokens+preflight.declaredToolsTokens:null;
 const terminal=v.lifecycle.state==='completed'||v.lifecycle.state==='cancelled';
 const reason=terminal?'Run is terminal.':v.lifecycle.owner?'An owned attempt is active; reconnect without scheduling another attempt.':c.kind!=='compatible'?c.reasons.join(' '):c.extensionRequired?'Explicit allowance extension is required.':!input.readiness.available?input.readiness.reason:null;
 const status:ReviewClientStatusV1={version:1,engine:'plan-investigation-v1',runId:v.manifest.runId,subjectDigest:v.manifest.subjectDigest,generation:v.lifecycle.generation,
  state:c.kind==='stale'&&!terminal?'stale':v.lifecycle.state,coverageRef:`review-coverage:v1:${v.manifest.runId}:${v.state.checkpoint}`,covered:rows.filter(row=>['satisfied','finding','not-applicable'].includes(row.disposition)).length,required:v.basis.requirements.length,unresolved,
  resume:{available:reason===null,reason},consumption:{reportedRef,estimatedInputTokens,unavailableAttempts:unavailable.size,activeMs:v.state.consumedActiveMs,continuationCount:v.state.attempts},receipt:input.receipt,error:input.error??null};
 const diagnostics:ReviewInvestigationDiagnosticsV1={version:1,coverageUnit:'obligation-row',checkpointDigest:v.state.checkpoint,latestBlockReceipt:v.state.accepted.at(-1)?.receipt??null,outstandingBlockIds,providerLivenessAt:input.providerLivenessAt??null,
  usage:{pendingAttempts:pending.size,estimatedAttempts:estimated.size,unavailableAttempts:unavailable.size},allowance:{inclusiveTokenLimit:v.manifest.policy.budget.totalTokens,attemptMs:v.manifest.policy.providerLimitMs,activeLimitMs:v.accounting.activeLimitMs,attemptLimit:v.accounting.attemptLimit},
  preflight:{estimatedInputTokens,uncertainty:['Input is an admission estimate, not observed spend.','Host history and native provider liveness are unavailable unless independently observed.','Cumulative usage snapshots are not added as model calls.']}};
 return snapshotValue({status,diagnostics});
}
export function boundedInvestigationStatus<T>(value:T):T{
 if(Buffer.byteLength(JSON.stringify(value))>2*1024*1024)throw new ReviewIntegrationError('not-ready','Status exceeds the bounded transport response; no truncated coverage or verdict was emitted');return value;
}
/** Legacy diagnostics never mint a recovery journal or promise resumability. */
export function legacyReviewStatus(input:{runId:string;buildFingerprint:string;dimensions:readonly {name:string;completed:boolean}[];phase:string|null}|null){
 if(!input)return {version:1,engine:'legacy',next:'error',error:{code:'status-unavailable'},status:null,diagnostics:{coverageUnit:'legacy-dimension'}};
 const status:ReviewClientStatusV1={version:1,engine:'legacy',runId:input.runId,subjectDigest:input.buildFingerprint,generation:0,state:'paused',coverageRef:`legacy-dimensions:${input.runId}`,covered:input.dimensions.filter(d=>d.completed).length,required:input.dimensions.length,unresolved:input.dimensions.filter(d=>!d.completed).map(d=>d.name),resume:{available:false,reason:'Legacy diagnostics do not provide investigation recovery.'},consumption:{reportedRef:null,estimatedInputTokens:null,unavailableAttempts:0,activeMs:0,continuationCount:0},receipt:null,error:null};
 return boundedInvestigationStatus({version:1,engine:'legacy',status,diagnostics:{coverageUnit:'legacy-dimension',phase:input.phase,providerLivenessAt:null,accounting:'unavailable'}});
}
