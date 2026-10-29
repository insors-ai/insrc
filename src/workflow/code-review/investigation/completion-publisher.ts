/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual } from 'node:util';
import { assessReviewCompletion } from './completion-assessment.js';
import { withCompletionPublication } from './completion-publication.js';
import { RecoveryError } from './recovery-types.js';
import { reviewedBuildFingerprint } from '../build-freshness.js';
import { authorPartyOf } from '../../review/party.js';
import type { PreparedCompletionPublication, CompletionPublicationResult } from './completion-publication.js';
import type { CompletionValidationContext } from './completion-types.js';
import type { RecoveryStore } from './recovery-store.js';
import type { ArtifactStore, HeadSnapshot } from '../../artifact-core/store.js';
import type { Actor } from '../../artifact-core/types.js';

/** Canonical body plus all frozen audit/identity fields; store-owned lifecycle/anchor fields may be added. */
export function matchesCompletionCandidate(head:HeadSnapshot,prepared:PreparedCompletionPublication):boolean {
 const candidate=prepared.candidate;
 return isDeepStrictEqual(head.head.body,candidate.body)
  &&Object.entries(candidate.meta).every(([key,value])=>isDeepStrictEqual(head.head.meta[key],value));
}
export interface CompletionPublisherDeps {
 /** Existing daemon-owned repository lifecycle store, not another filesystem writer. */
 readonly canonical: ArtifactStore; readonly actor: Actor;
 /** Re-read canonical BUILD/approved pins and authenticated party inside the artifact queue. */
 readonly current: () => Promise<{readonly context:CompletionValidationContext;readonly buildRecord:unknown}>;
}
export async function publishCompletionCandidate(store:RecoveryStore,leaseId:string,generation:number,intentRef:string|null,
 context:CompletionValidationContext,deps:CompletionPublisherDeps):Promise<CompletionPublicationResult<HeadSnapshot>> {
 return withCompletionPublication(store,leaseId,generation,intentRef,context,async(prepared,assertCurrent)=>{
  const {intent,candidate}=prepared;
  const persisted=await deps.canonical.mutateContentAndLog(intent.artifactId,deps.actor,async(head)=>{
   assertCurrent();
   const current=await deps.current();
   const assessment=await assessReviewCompletion(store.replay(),current.context);
   if(assessment.outcome!=='publishable')throw new RecoveryError(assessment.outcome==='stale'?'stale':'invalid-input',assessment.reasons.join(' '));
   if(authorPartyOf(current.context.build.meta)!==intent.authorParty||current.context.reviewerParty!==intent.reviewerParty
    ||reviewedBuildFingerprint(current.buildRecord)!==candidate.body.subject.buildFingerprint)throw new RecoveryError('stale','BUILD content or authenticated parties changed before publication.');
   assertCurrent();
   if(head&&head.revision===(intent.expectedRevision??0)+1&&matchesCompletionCandidate(head,prepared))return undefined;
   if((head?.revision??null)!==intent.expectedRevision||(head?.digest??null)!==intent.expectedHeadDigest)
    throw new RecoveryError('invalid-input','Canonical review head conflicts with the frozen expected revision or bytes.');
   const {runId,createdAt,model,elapsedMs,repoIndexedAt,schemaVersion,reviewedBy}=candidate.meta;
   return {payload:{body:{...candidate.body},citations:[]},metadata:{runId,createdAt,model,elapsedMs,repoIndexedAt,schemaVersion,reviewedBy},assertCurrent,
    options:{outcome:{result:candidate.body.verdict,summary:`Investigation ${intent.operationId}`,data:{operationId:intent.operationId}},addresses:[]}};
  });
  assertCurrent();
  if(!matchesCompletionCandidate(persisted,prepared))throw new RecoveryError('corrupt','Persisted canonical review differs from its frozen candidate.');
  return persisted;
 });
}
