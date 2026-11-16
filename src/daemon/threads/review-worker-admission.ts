/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual } from 'node:util';
import { appendCodeAdmission } from '../../workflow/code-review/task-review/admission-checkpoint.js';
import { parsePacket,isCodeAdmission } from '../../workflow/code-review/task-review/contracts.js';
import { updateStoredCodeCheckpoint,loadStoredCheckpoint } from '../../workflow/code-review/task-review/checkpoint.js';
import { ReviewProgressTracker } from '../../workflow/code-review/task-review/progress.js';
import { updateStoredDesignCheckpoint } from '../../workflow/review/design-review/checkpoint.js';
import { decodeDesign,DesignRequestSchemas,isDesignAdmission } from '../../workflow/review/design-review/contracts.js';
import { reviewWorkerCheckpoint } from './review-worker-contract.js';
import type { ReviewAdmissionReceipt,ReviewBootstrapInput } from './review-worker-contract.js';
import { requestSignature } from '../../workflow/review/design-review/request-signature.js';
import { admitDesignRecovery } from '../../workflow/review/design-review/action-admission.js';
import type { ReviewPreparationBootstrap } from './review-worker-preparation.js';
import { decodePreparationCheckpoint,loadPreparationCheckpoint } from '../../workflow/review/preparation-checkpoint.js';
import { upgradePreparationHistory } from '../../workflow/review/preparation-migration.js';
import { writeReviewBytes } from '../../workflow/code-review/task-review/checkpoint.js';
import { reviewJsonLimit } from '../../config/review.js';
import { reviewProgressPublication } from './review-progress.js';
import type { ReviewProgressPublication } from './review-progress.js';
import { observeStoredDesignCheckpoint } from '../../workflow/review/design-review/progress.js';
import { loadStoredDesignCheckpoint } from '../../workflow/review/design-review/checkpoint.js';
import { preparationSemanticHistory } from '../../workflow/review/preparation-semantic-history.js';
import { preparationPersistence, withPreparationPersistence } from '../../workflow/review/preparation-persistence.js';
import type { PreparationPersistence } from '../../workflow/review/preparation-persistence.js';
import type { CodePreparationCheckpoint,DesignPreparationCheckpoint } from '../../workflow/review/preparation-checkpoint.js';

/** Existing format-3 history is already fenced by main before a replacement
 * worker starts. This temporary owner lets the lightweight preboot append only
 * validated semantic admission metadata while retaining every operational
 * reference. The full preparation owner adopts the result immediately after
 * runtime rebinding. */
function admissionPersistence(input:CodePreparationCheckpoint|DesignPreparationCheckpoint,key:ReviewBootstrapInput['key']):PreparationPersistence{
 let current=structuredClone(input);
 return{
  path:reviewWorkerCheckpoint(key),
  read:async()=>preparationSemanticHistory(current),
  write:async value=>{
   if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.has(value,'runtime')||Reflect.has(value,'context')||Reflect.has(value,'migration')||Reflect.get(value,'schemaVersion')===3)throw new Error('Admission persistence accepts semantic history only');
   const {schemaVersion:_version,...semantic}=structuredClone(value as Record<string,unknown>);
   const candidate={...semantic,schemaVersion:3,runtime:current.runtime,...(current.context?{context:current.context}:{}),...(current.migration?{migration:current.migration}:{})};
   const checked=decodePreparationCheckpoint(candidate,key);if(checked.format!=='current')throw new Error('Admission persistence must retain current history');
   await writeReviewBytes(reviewWorkerCheckpoint(key),JSON.stringify(checked.checkpoint)+'\n',reviewJsonLimit());current=structuredClone(checked.checkpoint);
  },
  observe:async()=>{throw new Error('Admission persistence cannot accept execution observations');},
 };
}

/** Only bounded input/history persistence: no Git, artifact qualification or
 * model dispatch. Family execution/recovery adapters consume this in t9/t10. */
export async function persistReviewWorkerAdmission(input:ReviewBootstrapInput):Promise<ReviewAdmissionReceipt>{
 // The legacy/migration assembly admits from inside the full preparation
 // owner. Reuse that authority instead of installing the preboot-only shim.
 if(preparationPersistence(reviewWorkerCheckpoint(input.key)))return persistReviewWorkerAdmissionOwned(input);
 const loaded=await loadPreparationCheckpoint(input.key);
 if(loaded?.format==='current')return withPreparationPersistence(admissionPersistence(loaded.checkpoint,input.key),()=>persistReviewWorkerAdmissionOwned(input));
 return persistReviewWorkerAdmissionOwned(input);
}
async function persistReviewWorkerAdmissionOwned(input:ReviewBootstrapInput):Promise<ReviewAdmissionReceipt>{
 const path=reviewWorkerCheckpoint(input.key),now=new Date().toISOString();
 if(input.key.family==='code'){
  const parsed=parsePacket(input.submitted);if(!parsed.reviewRevision)throw new Error('Explicit review revision required');
  const packet={...parsed,reviewRevision:parsed.reviewRevision};
  await updateStoredCodeCheckpoint(path,prior=>{
  const last=prior?.attempts.at(-1);
  if(input.operation==='resume'){
   if(!prior||!last||last.header.attempt!==input.attempt||last.header.reviewer!==input.reviewer||!isDeepStrictEqual(last.submitted,packet))throw new Error('Resume input is pinned to the latest saved attempt');
   if(prior.attempts.some(a=>a.resourceGuard?.openLeases.length))throw new Error('Unresolved review resources require explicit clearance');
   if(last.header.status==='failed')throw new Error('Failed review requires the next attempt');
   if(!isCodeAdmission(last))return prior;
   // Explicit replacement-worker recovery makes a lost active admission
   // visibly interrupted before acknowledging it. It never replaces input.
   return{...prior,schemaVersion:2,attempts:[...prior.attempts.slice(0,-1),{...last,operation:'resume',header:{...last.header,status:'interrupted',completedAt:last.header.completedAt??now},progress:{...last.progress,phase:'interrupted'}}]};
  }
  if(last?.header.attempt===input.attempt){
   if(last.resourceGuard?.clearance)throw new Error('Resource clearance requires a separate explicit resume');
   if(!isCodeAdmission(last)&&['passed','changes_requested'].includes(last.header.status)&&last['review-response'].crPublication==='complete'&&last.header.reviewer===input.reviewer&&isDeepStrictEqual(last.submitted,packet))return prior!;
   if(!isCodeAdmission(last)||!['pending','running'].includes(last.header.status)||last.header.reviewer!==input.reviewer||!isDeepStrictEqual(last.submitted,packet))throw new Error('Pinned admission cannot be replaced');
   // Identical lost-ack replay consumes no new attempt and still fsyncs.
   return prior!;
  }else{
   const cp=appendCodeAdmission({project:input.key.project,reviewId:input.key.reviewId,storyId:packet.storyId,...(packet.taskId?{taskId:packet.taskId}:{})},{phase:'admission',validation:'unverified',operation:'start',acceptedAt:now,header:{attempt:input.attempt,reviewer:input.reviewer,status:'pending',createdAt:now},submitted:packet,progress:new ReviewProgressTracker().snapshot()},prior);
   return cp;
  }
  });
 }else{
  if(input.submitted&&typeof input.submitted==='object'&&Reflect.get(input.submitted,'phase')==='recover'){
   const recovery=decodeDesign(DesignRequestSchemas.recover,input.submitted);
   if(recovery.repo!==input.key.project||recovery.reviewId!==input.key.reviewId||recovery.attempt+(recovery.operation==='restart_full'?1:0)!==input.attempt||recovery.actionId!==input.actionId)throw new Error('Foreign design recovery admission');
   if(recovery.operation==='retry_publication') {
    await updateStoredDesignCheckpoint(input.key.project,input.key.reviewId,cp=>{if(!cp||cp.attempts.at(-1)?.number!==input.attempt)throw new Error('Stored publication attempt missing');if(cp.attempts.at(-1)!.status==='failed')throw new Error('Failed review requires the next attempt');return cp;});
   } else {
    await admitDesignRecovery(input.key.project,input.key.reviewId,recovery);
    if(recovery.operation==='restart_full')await updateStoredDesignCheckpoint(input.key.project,input.key.reviewId,cp=>{
     if(!cp)throw new Error('Restart history missing');const last=cp.attempts.at(-1)!;
     if(last.number===input.attempt)return cp;
     if(last.number!==recovery.attempt||isDesignAdmission(last)||last.status!=='invalidated')throw new Error('Restart requires invalidated predecessor');
     return{...cp,schemaVersion:2,attempts:[...cp.attempts,{phase:'admission',validation:'unverified',number:input.attempt,reviewer:input.reviewer,status:'pending',operation:'recover',actionId:`restart-${requestSignature(recovery).slice(0,64)}`,submitted:{attempt:recovery.attempt,recovery:{operation:recovery.operation,...(recovery.userDecision?{userDecision:recovery.userDecision}:{})}},acceptedAt:now,startedAt:now,progress:{phase:'admission',totalChunks:0,completedChunks:0,checkpointPath:path,sequence:0,observedAt:now,freshness:'live'}}]};
    });
   }
   return{kind:'review-admission-saved',key:input.key,incarnation:input.incarnation,attempt:input.attempt,checkpointPath:path};
  }
  const request=decodeDesign(DesignRequestSchemas.start,input.submitted);
  if(request.repo!==input.key.project||request.reviewId!==input.key.reviewId||request.attempt!==input.attempt)throw new Error('Foreign design admission');
  await updateStoredDesignCheckpoint(input.key.project,input.key.reviewId,prior=>{
   const last=prior?.attempts.at(-1);
   if(last?.number===input.attempt){if('resourceGuard'in last&&last.resourceGuard?.clearance)throw new Error('Resource clearance requires a separate explicit recover action');if(last.reviewer!==input.reviewer||!('actionId'in last)||last.actionId!==input.actionId||!('submitted'in last)||!isDeepStrictEqual(last.submitted,{artifactPath:request.artifactPath,attempt:input.attempt}))throw new Error('Pinned admission cannot be replaced');return prior!;}
   return{...prior,schemaVersion:2,project:input.key.project,reviewId:input.key.reviewId,attempts:[...(prior?.attempts??[]),{phase:'admission',validation:'unverified',number:input.attempt,reviewer:input.reviewer,status:'pending',operation:'start',actionId:input.actionId,submitted:{artifactPath:request.artifactPath,attempt:input.attempt},acceptedAt:now,startedAt:now,progress:{phase:'admission',totalChunks:0,completedChunks:0,checkpointPath:path,sequence:0,observedAt:now,freshness:'live'}}]};
  });
 }
 return{kind:'review-admission-saved',key:input.key,incarnation:input.incarnation,attempt:input.attempt,checkpointPath:path};
}

/** Bind durable semantic input to the exact initializing runtime without
 * loading source, projection, history-qualification or model machinery. */
export async function bindReviewWorkerAdmission(input:ReviewBootstrapInput,bootstrap:ReviewPreparationBootstrap):Promise<void>{
 const loaded=await loadPreparationCheckpoint(input.key);
 if(!loaded)throw new Error('Durable review admission missing');
 let next;
 if(loaded.format==='historical')next=upgradePreparationHistory(loaded.checkpoint,input.key,bootstrap.runtime);
 else{
  const current=loaded.checkpoint;
  const runtime={runtimeId:bootstrap.runtime.runtimeId,inputDigest:bootstrap.runtime.checkpointBinding.inputDigest};
  if(isDeepStrictEqual(current.runtime,runtime))return;
  if(!bootstrap.handoff||!isDeepStrictEqual(current.runtime,bootstrap.handoff.previousRuntime))throw new Error('Preparation runtime binding mismatch');
  const {context:_context,...rest}=current;
  next={...rest,runtime,...(!bootstrap.handoff.resetContext&&current.context?{context:current.context}:{})};
 }
 const checked=decodePreparationCheckpoint(next,input.key);if(checked.format!=='current')throw new Error('Runtime-bound admission must use the current checkpoint format');
 await writeReviewBytes(reviewWorkerCheckpoint(input.key),JSON.stringify(checked.checkpoint)+'\n',reviewJsonLimit());
}

/** The first honest observation is derived only from the durable admission.
 * It claims no qualified scope, completed work, source activity or provider
 * dispatch and is available before the heavier family runtime is loaded. */
export async function reviewWorkerAdmissionProgress(input:ReviewBootstrapInput):Promise<ReviewProgressPublication>{
 if(input.key.family==='code'){
  const cp=await loadStoredCheckpoint(reviewWorkerCheckpoint(input.key)),last=cp?.attempts.at(-1);
  if(!last||last.header.attempt!==input.attempt||!isCodeAdmission(last))throw new Error('Durable code admission observation missing');
  return reviewProgressPublication(input,1,{reviewId:input.key.reviewId,attempt:input.attempt,status:last.header.status,crPublication:'pending',executionState:'starting',completedTasks:0,totalTasks:0,interrupted:false,hasError:!!last.error,freshness:'live',progress:last.progress,admission:{validation:'unverified',...(last.error?{error:last.error}:{})}});
 }
 const cp=await loadStoredDesignCheckpoint(input.key.project,input.key.reviewId),last=cp?.attempts.at(-1);
 if(!cp||!last||last.number!==input.attempt||!isDesignAdmission(last))throw new Error('Durable design admission observation missing');
 return reviewProgressPublication(input,1,observeStoredDesignCheckpoint(cp,{active:true}));
}
