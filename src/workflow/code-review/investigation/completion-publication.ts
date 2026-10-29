/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { adaptInvestigationReview } from './completion-artifact.js';
import { assessReviewCompletion } from './completion-assessment.js';
import { ledgerDigest, ledgerSnapshot, ledgerEqual } from './ledger-identity.js';
import { validateArtifact } from '../record-validation.js';
import { RecoveryError } from './recovery-types.js';
import { authorPartyOf } from '../../review/party.js';
import type { CompletionArtifactInput } from './completion-artifact.js';
import type { CodeReviewArtifact } from '../types.js';
import type { CompletionValidationContext } from './completion-types.js';
import type { RecoveryStore } from './recovery-store.js';

export interface CompletionPublicationIntent {
 readonly version: 1; readonly operationId: string; readonly runId: string; readonly subjectDigest: string;
 readonly policyDigest: string; readonly checkpointDigest: string; readonly artifactId: string;
 readonly expectedRevision: number | null; readonly expectedHeadDigest: string | null;
 readonly coverageRef: string; readonly coverageDigest: string; readonly candidateRef: string; readonly candidateDigest: string;
 readonly build: CompletionValidationContext['build']; readonly authorParty: 'controller' | 'daemon'; readonly reviewerParty: 'controller' | 'daemon';
}
export interface PreparedCompletionPublication {readonly intentRef: string; readonly intent: CompletionPublicationIntent; readonly candidate: CodeReviewArtifact;}
export type PrepareCompletionInput = Omit<CompletionArtifactInput, 'view' | 'linkage'> & {
 readonly sourceMode: 'source-only' | 'indexed-impact'; readonly expectedRevision: number | null; readonly expectedHeadDigest: string | null;
};
export function completionOperationId(runId:string,subjectDigest:string,checkpointDigest:string,artifactId:string):string {
 return `publication-${ledgerDigest({version:1,runId,subjectDigest,checkpointDigest,artifactId})}`;
}
/** Verify immutable closure on every retry, including after a process restart. */
export function readCompletionPublication(store:RecoveryStore,intentRef:string):PreparedCompletionPublication {
 const intent=store.journal.read(intentRef) as CompletionPublicationIntent,view=store.replay();
 if(intent.version!==1||intent.runId!==view.manifest.runId||intent.subjectDigest!==view.manifest.subjectDigest
  ||intent.policyDigest!==view.manifest.policyDigest||intent.checkpointDigest!==view.state.checkpoint
  ||intent.operationId!==completionOperationId(intent.runId,intent.subjectDigest,intent.checkpointDigest,intent.artifactId))
  throw new RecoveryError('corrupt','Publication intent binding is invalid.');
 const coverage=store.journal.read(intent.coverageRef) as {version:number;basis:unknown;ledger:unknown;checkpointDigest:string;receiptRefs:string[]},candidate=store.journal.read(intent.candidateRef) as CodeReviewArtifact;
 if(coverage.version!==1||coverage.checkpointDigest!==intent.checkpointDigest||!ledgerEqual(coverage.basis,view.basis)
  ||!ledgerEqual(coverage.ledger,view.state.ledger)||!Array.isArray(coverage.receiptRefs)
  ||!ledgerEqual(coverage.receiptRefs.map(r=>store.journal.read(r)),view.receipts))throw new RecoveryError('corrupt','Frozen coverage differs from the accepted checkpoint.');
 if(ledgerDigest(coverage)!==intent.coverageDigest||ledgerDigest(candidate)!==intent.candidateDigest
  ||candidate.body.investigation?.operationId!==intent.operationId||candidate.body.investigation.coverageDigest!==intent.coverageDigest
  ||candidate.body.investigation.coverageRef!==intent.coverageRef
  ||candidate.body.investigation.subjectDigest!==intent.subjectDigest||candidate.body.investigation.policyDigest!==intent.policyDigest
  ||candidate.body.investigation.checkpointDigest!==intent.checkpointDigest||candidate.meta.reviewedBy!==intent.reviewerParty
  ||intent.artifactId!==`CR-${candidate.meta.epicHash}-${candidate.meta.storyId}`
  ||validateArtifact(candidate,view.basis.criteria.map(c=>c.id as import('../types.js').ReviewDimension)))throw new RecoveryError('corrupt','Publication closure differs from frozen digests.');
 return ledgerSnapshot({intentRef,intent,candidate});
}
/** Staging alone grants no publication authority. Only sc4's accepted fence can freeze this intent. */
export async function prepareCompletionPublication(store:RecoveryStore,leaseId:string,generation:number,input:PrepareCompletionInput):Promise<PreparedCompletionPublication> {
 return store.journal.exclusive(async()=>{
  const view=store.replay();store.assertLease(view,leaseId,generation);
  if(view.publication) return readCompletionPublication(store,view.publication.intentRef);
  if((input.expectedRevision===null)!==(input.expectedHeadDigest===null)
   ||(input.expectedRevision!==null&&(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1))
   ||(input.expectedHeadDigest!==null&&!/^[a-f0-9]{64}$/.test(input.expectedHeadDigest))) throw new RecoveryError('invalid-input','Expected canonical revision/absence needs its exact head digest.');
  const assessment=await assessReviewCompletion(view,input.context);
  if(assessment.outcome!=='publishable')throw new RecoveryError(assessment.outcome==='stale'?'stale':'invalid-input',assessment.reasons.join(' '));
  const receiptRefs=view.receipts.map(r=>store.journal.stage({...r}).reference);
  const coverage=store.journal.stage({version:1,runId:view.manifest.runId,subjectDigest:view.manifest.subjectDigest,
   checkpointDigest:view.state.checkpoint,basis:view.basis,ledger:view.state.ledger,receiptRefs,assessment});
  const artifactId=`CR-${input.epicHash}-${input.storyId}`;
  const operationId=completionOperationId(view.manifest.runId,view.manifest.subjectDigest,view.state.checkpoint,artifactId);
  const candidate=await adaptInvestigationReview({...input,view,linkage:{version:1,sourceMode:input.sourceMode,operationId,
   runId:view.manifest.runId,subjectDigest:view.manifest.subjectDigest,policyDigest:view.manifest.policyDigest,
   checkpointDigest:view.state.checkpoint,coverageRef:coverage.reference,coverageDigest:coverage.digest}});
  const staged=store.journal.stage({...candidate});
  const authorParty=authorPartyOf(input.context.build.meta),reviewerParty=input.context.reviewerParty;
  if(authorParty==='unknown'||reviewerParty==='unknown')throw new RecoveryError('invalid-input','Unknown publication party.');
  const intent:CompletionPublicationIntent={version:1,operationId,runId:view.manifest.runId,subjectDigest:view.manifest.subjectDigest,
   policyDigest:view.manifest.policyDigest,checkpointDigest:view.state.checkpoint,artifactId,expectedRevision:input.expectedRevision,
   expectedHeadDigest:input.expectedHeadDigest,coverageRef:coverage.reference,coverageDigest:coverage.digest,
   candidateRef:staged.reference,candidateDigest:staged.digest,build:input.context.build,authorParty,reviewerParty};
  store.assertLease(store.replay(),leaseId,generation);
  const intentRef=store.journal.stage({...intent}).reference;
  return ledgerSnapshot({intentRef,intent,candidate});
 });
}
export type CompletionPublicationResult<T> = {readonly kind:'published';readonly value:T} | {readonly kind:'completed';readonly receiptRef:string};
/** Never calls a new mutator for a terminal run. Recovery owns the queue, freeze and callback deadline. */
export async function withCompletionPublication<T>(store:RecoveryStore,leaseId:string,generation:number,intentRef:string|null,
 context:CompletionValidationContext,publish:(prepared:PreparedCompletionPublication,assertCurrent:()=>void)=>Promise<T>):Promise<CompletionPublicationResult<T>> {
 const view=store.replay();
 if(view.lifecycle.state==='completed'){
  if(!view.lifecycle.completionReceipt)throw new RecoveryError('corrupt','Completed run has no receipt.');
  return {kind:'completed',receiptRef:view.lifecycle.completionReceipt};
 }
 const assessment=await assessReviewCompletion(view,context);
 if(assessment.outcome!=='publishable')throw new RecoveryError(assessment.outcome==='stale'?'stale':'invalid-input',assessment.reasons.join(' '));
 const value=await store.withPublicationFence(leaseId,generation,view.state.checkpoint,intentRef,async(frozen,assertCurrent)=>{
  const prepared=readCompletionPublication(store,frozen);assertCurrent();return publish(prepared,assertCurrent);
 });
 return {kind:'published',value};
}
