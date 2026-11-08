import { qualifyReviewCapacity } from './capacity.js';
import type { CapacityBaseline } from './capacity.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import type { ReviewCheckpoint, ReviewAttempt } from './contracts.js';
import type { PreparedReviewPacket } from './packet.js';
import type { TaskInputFingerprint } from './attribution-binding.js';
import { saveCheckpoint, loadCheckpoint, CheckpointSaveError } from './checkpoint.js';
import { aggregateTaskStatus } from './results.js';
export interface AdmittedReview { path:string;checkpoint:ReviewCheckpoint;attempt:ReviewAttempt;prepared:PreparedReviewPacket; priorTaskInputs?: ReadonlyMap<number,ReadonlyMap<string,TaskInputFingerprint>> | undefined; storageFailure?: CheckpointSaveError | undefined; capacity?: CapacityBaseline | undefined; }
export interface AcceptanceFence { readonly prior: ReviewCheckpoint; readonly candidate: ReviewCheckpoint; readonly error: CheckpointSaveError; }
export interface ReviewPersistence { readonly save?:typeof saveCheckpoint|undefined; readonly read?:typeof loadCheckpoint|undefined; readonly onAcceptanceFailure?: ((fence: AcceptanceFence) => void) | undefined; readonly publish?:((project:string,id:string,epicHash:string,baseline?:CapacityBaseline)=>Promise<unknown>)|undefined; }
export async function persistReview(review:AdmittedReview,deps:ReviewPersistence):Promise<void>{if(review.storageFailure)throw review.storageFailure;if(review.attempt['review-response'].crPublication!=='complete')qualifyReviewCapacity(review);await(deps.save??saveCheckpoint)(review.path,review.checkpoint);}
/** No failed acceptance can dispatch or roll back, even if rename made it visible. */
export async function persistAcceptedAttribution(review: AdmittedReview, deps: ReviewPersistence, prior: ReviewCheckpoint): Promise<void> {
 if (review.storageFailure) throw review.storageFailure;
 const candidate = structuredClone(review.checkpoint);
 try { await persistReview(review, deps); }
 catch (cause) {
  const error = cause instanceof CheckpointSaveError ? cause : new CheckpointSaveError('uncertain', cause);
  review.storageFailure = error;
  try {
   const visible = await (deps.read ?? loadCheckpoint)(review.path);
   error.visibleState = visible && isDeepStrictEqual(visible, candidate) ? 'candidate' : visible && isDeepStrictEqual(visible, prior) ? 'prior' : 'unverifiable';
   if (error.visibleState !== 'unverifiable') { review.checkpoint = visible!; review.attempt = visible!.attempts.at(-1)!; }
  } catch { error.visibleState = 'unverifiable'; }
  error.message += `; visible state ${error.visibleState}; explicit resume required, no automatic retry`;
  deps.onAcceptanceFailure?.({ prior: structuredClone(prior), candidate, error });
  throw error;
 }
}
/** Completion metadata and CR durability have the same ordering for both parties. */
export async function completeReview(review:AdmittedReview,deps:ReviewPersistence):Promise<void>{
 const entry=review.attempt;
 entry.header.completedAt??=new Date().toISOString();entry['review-response'].summary='All selected task assessments are terminal. CR publication pending.';
 await persistReview(review,deps);
 if(deps.publish){
  try{
   await deps.publish(review.checkpoint.project,review.checkpoint.reviewId,review.prepared.epicHash,review.capacity);
   const stored=JSON.parse(await readFile(review.path,'utf8')) as ReviewCheckpoint;
   review.checkpoint=stored;review.attempt=stored.attempts.at(-1)!;
  }catch(error){if(entry.progress)entry.progress={...entry.progress,phase:'error',processState:'unknown',activeToolCount:0};entry['review-response'].error=`CR publication failed: ${error instanceof Error?error.message:String(error)}`;await persistReview(review,deps);}
 }else{if(entry.progress)entry.progress={...entry.progress,phase:'complete',processState:'unknown',activeToolCount:0,completedTasks:entry['review-response'].tasks.length};entry.header.status=aggregateTaskStatus(entry['review-response'].tasks);await persistReview(review,deps);}
}
