/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFile } from 'node:fs/promises';
import type { ReviewCheckpoint, ReviewAttempt } from './contracts.js';
import type { PreparedReviewPacket } from './packet.js';
import { saveCheckpoint } from './checkpoint.js';
import { aggregateTaskStatus } from './results.js';
export interface AdmittedReview { path:string;checkpoint:ReviewCheckpoint;attempt:ReviewAttempt;prepared:PreparedReviewPacket; }
export interface ReviewPersistence { readonly save?:typeof saveCheckpoint|undefined; readonly publish?:((project:string,id:string,epicHash:string)=>Promise<unknown>)|undefined; }
export async function persistReview(review:AdmittedReview,deps:ReviewPersistence):Promise<void>{await(deps.save??saveCheckpoint)(review.path,review.checkpoint);}
/** Completion metadata and CR durability have the same ordering for both parties. */
export async function completeReview(review:AdmittedReview,deps:ReviewPersistence):Promise<void>{
 const entry=review.attempt;
 entry.header.completedAt??=new Date().toISOString();entry['review-response'].summary='All selected task assessments are terminal. CR publication pending.';
 await persistReview(review,deps);
 if(deps.publish){
  try{
   await deps.publish(review.checkpoint.project,review.checkpoint.reviewId,review.prepared.epicHash);
   const stored=JSON.parse(await readFile(review.path,'utf8')) as ReviewCheckpoint;
   review.checkpoint=stored;review.attempt=stored.attempts.at(-1)!;
  }catch(error){entry['review-response'].error=`CR publication failed: ${error instanceof Error?error.message:String(error)}`;await persistReview(review,deps);}
 }else{entry.header.status=aggregateTaskStatus(entry['review-response'].tasks);await persistReview(review,deps);}
}
