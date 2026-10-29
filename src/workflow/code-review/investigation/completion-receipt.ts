/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { decodeArtifactHead } from '../../artifact-core/decode.js';
import { checkIntegrity } from '../../artifact-core/lifecycle.js';
import { publishCompletionCandidate, matchesCompletionCandidate } from './completion-publisher.js';
import { readCompletionPublication } from './completion-publication.js';
import { ledgerDigest, ledgerEqual, ledgerSnapshot } from './ledger-identity.js';
import { RecoveryError } from './recovery-types.js';
import { assessReviewCompletion } from './completion-assessment.js';
import { reviewedBuildFingerprint } from '../build-freshness.js';
import { authorPartyOf } from '../../review/party.js';
import type { CompletionPublisherDeps } from './completion-publisher.js';
import type { CompletionValidationContext, ReviewCompletionReceiptV1 } from './completion-types.js';
import type { RecoveryStore } from './recovery-store.js';

/** Reconcile against the current canonical head AND the recorded operation, never merely a matching verdict. */
async function receiptForCanonical(store:RecoveryStore,deps:CompletionPublisherDeps):Promise<ReviewCompletionReceiptV1>{
 const view=store.replay();if(!view.publication)throw new RecoveryError('corrupt','No frozen publication for completion receipt.');
 const prepared=readCompletionPublication(store,view.publication.intentRef),{intent,candidate}=prepared;
 const head=await deps.canonical.readHeadSnapshot(intent.artifactId);
 if(!head||head.revision!==(intent.expectedRevision??0)+1||!matchesCompletionCandidate(head,prepared))throw new RecoveryError('invalid-input','Canonical head conflicts with terminal publication.');
 const history=await deps.canonical.history.log(intent.artifactId),a=decodeArtifactHead(intent.artifactId,JSON.stringify(head.head)).artifact;
 const integrity=checkIntegrity({description:a.description,payload:a.payload,lifecycle:a.lifecycle},history);
 if(!integrity.ok||!history.some(e=>e.revision?.number===head.revision
  &&(e.outcome?.data as {operationId?:unknown}|undefined)?.operationId===intent.operationId))throw new RecoveryError('corrupt','Canonical publication has no matching intact history.');
 const fields={runId:intent.runId,subjectDigest:intent.subjectDigest,terminalCheckpointDigest:intent.checkpointDigest,
  artifactId:intent.artifactId,artifactRevision:head.revision,verdict:candidate.body.verdict,coverageRef:intent.coverageRef};
 return ledgerSnapshot({receiptId:`completion-${ledgerDigest(fields)}`,...fields});
}
/** Read-only terminal replay verifies both immutable receipt identity and its canonical operation. */
export async function readReviewCompletion(store:RecoveryStore,deps:CompletionPublisherDeps):Promise<ReviewCompletionReceiptV1>{
 const ref=store.replay().lifecycle.completionReceipt;
 if(!ref)throw new RecoveryError('invalid-input','Run has no terminal completion receipt.');
 const receipt=store.journal.read(ref) as ReviewCompletionReceiptV1,expected=await receiptForCanonical(store,deps);
 if(!ledgerEqual(receipt,expected))throw new RecoveryError('corrupt','Terminal receipt conflicts with frozen canonical publication.');
 return ledgerSnapshot(receipt);
}
/** Two recoverable commits. The sc4 callback and canonical queue are both released before recordCompletion. */
export async function completeInvestigationReview(store:RecoveryStore,leaseId:string,generation:number,intentRef:string|null,
 context:CompletionValidationContext,deps:CompletionPublisherDeps):Promise<ReviewCompletionReceiptV1>{
 const result=await publishCompletionCandidate(store,leaseId,generation,intentRef,context,deps);
 if(result.kind==='completed')return readReviewCompletion(store,deps);
 const receipt=await receiptForCanonical(store,deps);
 const view=store.replay(),prepared=readCompletionPublication(store,view.publication!.intentRef),current=await deps.current();
 const assessment=await assessReviewCompletion(view,current.context);
 if(assessment.outcome!=='publishable')throw new RecoveryError(assessment.outcome==='stale'?'stale':'invalid-input',assessment.reasons.join(' '));
 if(authorPartyOf(current.context.build.meta)!==prepared.intent.authorParty||current.context.reviewerParty!==prepared.intent.reviewerParty
  ||reviewedBuildFingerprint(current.buildRecord)!==prepared.candidate.body.subject.buildFingerprint)throw new RecoveryError('stale','BUILD or parties changed before terminal receipt.');
 const ref=await store.journal.exclusive(()=>{
  const view=store.replay();
  if(view.lifecycle.completionReceipt)return view.lifecycle.completionReceipt;
  store.assertLease(view,leaseId,generation);
  return store.journal.stage({...receipt}).reference;
 });
 // Never move this into the run queue or publication callback: recordCompletion acquires that queue itself.
 await store.recordCompletion(leaseId,generation,ref);
 return readReviewCompletion(store,deps);
}
