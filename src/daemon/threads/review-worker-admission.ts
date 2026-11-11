/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual } from 'node:util';
import { appendCodeAdmission } from '../../workflow/code-review/task-review/admission-checkpoint.js';
import { parsePacket,isCodeAdmission } from '../../workflow/code-review/task-review/contracts.js';
import { loadStoredCheckpoint,saveStoredCheckpoint } from '../../workflow/code-review/task-review/checkpoint.js';
import { ReviewProgressTracker } from '../../workflow/code-review/task-review/progress.js';
import { updateStoredDesignCheckpoint } from '../../workflow/review/design-review/checkpoint.js';
import { decodeDesign,DesignRequestSchemas,isDesignAdmission } from '../../workflow/review/design-review/contracts.js';
import { reviewWorkerCheckpoint } from './review-worker-contract.js';
import type { ReviewAdmissionReceipt,ReviewBootstrapInput } from './review-worker-contract.js';

/** Only bounded input/history persistence: no Git, artifact qualification or
 * model dispatch. Family execution/recovery adapters consume this in t9/t10. */
export async function persistReviewWorkerAdmission(input:ReviewBootstrapInput):Promise<ReviewAdmissionReceipt>{
 const path=reviewWorkerCheckpoint(input.key),now=new Date().toISOString();
 if(input.key.family==='code'){
  const parsed=parsePacket(input.submitted);if(!parsed.reviewRevision)throw new Error('Explicit review revision required');
  const packet={...parsed,reviewRevision:parsed.reviewRevision},prior=await loadStoredCheckpoint(path),last=prior?.attempts.at(-1);
  if(last?.header.attempt===input.attempt){
   if(!isCodeAdmission(last)||!['pending','running'].includes(last.header.status)||last.header.reviewer!==input.reviewer||!isDeepStrictEqual(last.submitted,packet))throw new Error('Pinned admission cannot be replaced');
   // Identical lost-ack replay consumes no new attempt and still fsyncs.
   await saveStoredCheckpoint(path,prior!);
  }else{
   const cp=appendCodeAdmission({project:input.key.project,reviewId:input.key.reviewId,storyId:packet.storyId,...(packet.taskId?{taskId:packet.taskId}:{})},{phase:'admission',validation:'unverified',operation:'start',acceptedAt:now,header:{attempt:input.attempt,reviewer:input.reviewer,status:'pending',createdAt:now},submitted:packet,progress:new ReviewProgressTracker().snapshot()},prior);
   await saveStoredCheckpoint(path,cp);
  }
 }else{
  const request=decodeDesign(DesignRequestSchemas.start,input.submitted);
  if(request.repo!==input.key.project||request.reviewId!==input.key.reviewId||request.attempt!==input.attempt)throw new Error('Foreign design admission');
  await updateStoredDesignCheckpoint(input.key.project,input.key.reviewId,prior=>{
   const last=prior?.attempts.at(-1);
   if(last?.number===input.attempt){if(!isDesignAdmission(last)||!['pending','running'].includes(last.status)||last.reviewer!==input.reviewer||last.actionId!==input.actionId||!isDeepStrictEqual(last.submitted,{artifactPath:request.artifactPath,attempt:input.attempt}))throw new Error('Pinned admission cannot be replaced');return prior!;}
   return{...prior,schemaVersion:2,project:input.key.project,reviewId:input.key.reviewId,attempts:[...(prior?.attempts??[]),{phase:'admission',validation:'unverified',number:input.attempt,reviewer:input.reviewer,status:'pending',operation:'start',actionId:input.actionId,submitted:{artifactPath:request.artifactPath,attempt:input.attempt},acceptedAt:now,startedAt:now,progress:{phase:'admission',totalChunks:0,completedChunks:0,checkpointPath:path,sequence:0,observedAt:now,freshness:'live'}}]};
  });
 }
 return{kind:'review-admission-saved',key:input.key,incarnation:input.incarnation,attempt:input.attempt,checkpointPath:path};
}
