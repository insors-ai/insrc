import { requireCapacityBaseline } from './capacity.js';
import type { CapacityBaseline } from './capacity.js';
import { completedSummary } from './summary.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFile, realpath } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { artifactIdMarker, codeReviewArtifactId, codeReviewArtifactPaths, storyRecordFolderArgs, writeAtomic } from '../../storage.js';
import { emptyLifecycle } from '../../artifact-core/decode.js';
import type { RoundWriter } from '../../runners/build/round-writer.js';
import { decodeReview, CheckpointSchema, reviewJsonLimit, requireReview, reviewPath } from './contracts.js';
import type { ReviewCheckpoint } from './contracts.js';
import { canonicalReviewStory } from './admission.js';
import { prepareReviewPacket } from './packet.js';
import type { ReviewSources } from './sources.js';
import { validateTaskResult, validateResultOrigins } from './results.js';
import { checkpointPath, saveCheckpoint } from './checkpoint.js';
import { mergeTaskSummary, renderTaskReview, resultReferences, validateTaskBody } from './record.js';

import { restoreAcceptedAssignments, validateSavedAttribution } from './attribution-binding.js';
import { captureFinalScope } from './final-scope-history.js';

export interface PublicationDeps { readonly baseline?:CapacityBaseline; readonly sources:ReviewSources; readonly through:RoundWriter; readonly save?:typeof saveCheckpoint; readonly renderWrite?:typeof writeAtomic; }

/** No reviewer invocation: project completed task feedback through the canonical queued store. */
export async function publishTaskCheckpoint(project: string, epicHash:string, reviewId:string, deps:PublicationDeps):Promise<{ path:string; jsonPath:string; status:string }> {
 const canonical = await realpath(project), path = checkpointPath(canonical, reviewId);
 const checkpoint:ReviewCheckpoint = decodeReview(CheckpointSchema, JSON.parse(await readFile(path,'utf8')));
 requireReview(checkpoint.project === canonical && checkpoint.reviewId === reviewId && checkpoint.schemaVersion === 1, 'checkpoint', 'Checkpoint identity mismatch');
 validateResultOrigins(checkpoint.attempts.map(entry => ({ attempt:entry.header.attempt, reviewer:entry.header.reviewer, tasks:entry['review-response'].tasks, origins:entry['review-response'].origins })));
 requireReview(checkpoint.attempts.every((a,i)=>a.header.attempt===i+1),'attempt','Attempt history must be contiguous');
 for(const earlier of checkpoint.attempts.slice(0,-1)){
  requireReview(earlier['review-response'].crPublication==='complete'&&!['pending','running'].includes(earlier.header.status),'attempt','Earlier attempt must be published');
  validateSavedAttribution(earlier);
  if(earlier.submitted.reviewRevision){
   const priorPrepared=await prepareReviewPacket(earlier.submitted,deps.sources,true,undefined,earlier.header.derived);
   requireReview(priorPrepared.epicHash===epicHash&&canonicalReviewStory(priorPrepared.packet.storyId,epicHash)===canonicalReviewStory(checkpoint.storyId,epicHash)&&priorPrepared.packet.taskId===checkpoint.taskId,'scope','Earlier scope belongs to another subject');
   await restoreAcceptedAssignments({path,checkpoint,attempt:earlier,prepared:priorPrepared});captureFinalScope(priorPrepared,earlier);
  }
 }
 const attempt = checkpoint.attempts.at(-1)!;
 const prepared = await prepareReviewPacket(attempt.submitted, deps.sources, true, undefined, attempt.header.derived);
 requireReview(prepared.epicHash === epicHash && canonicalReviewStory(checkpoint.storyId,epicHash) === canonicalReviewStory(prepared.packet.storyId,epicHash) && checkpoint.taskId === prepared.packet.taskId, 'scope', 'Checkpoint belongs to another review subject');
 const expected = prepared.tasks.filter(t=>!prepared.packet.taskId || t.id===prepared.packet.taskId).map(t=>t.id).sort();
 requireReview(isDeepStrictEqual([...attempt.header.selectedTaskIds].sort(),expected) && isDeepStrictEqual(attempt['review-response'].tasks.map(t=>t.taskId).sort(),expected), 'tasks', 'Selected tasks have not all completed');
 validateSavedAttribution(attempt);
 const assignments=await restoreAcceptedAssignments({path,checkpoint,attempt,prepared});
 const finalScope=prepared.packet.reviewRevision?captureFinalScope(prepared,attempt):undefined;
 requireReview(attempt.header.completedAt, 'attempt', 'Assessment completion timestamp is missing');
 for(const result of attempt['review-response'].tasks) {
  const refs=resultReferences(result);
  for(const ref of refs) {
   const match=/^([a-f0-9]{40}|[a-f0-9]{64}):(.+)$/.exec(ref);
   requireReview(match,'evidence','Expected explicit committed evidence reference'); reviewPath(match[2]!);
   await deps.sources.commit(match[1]!);
   requireReview(await deps.sources.file(match[1]!,match[2]!), 'evidence','Missing committed evidence');
  }
  validateTaskResult(result,{taskId:result.taskId,changes:finalScope?assignments?.find(a=>a.taskId===result.taskId)?.changes??[]:prepared.changes,evidenceReferences:refs});
 }
 const summary=completedSummary(prepared,attempt,reviewId),storyId=summary.storyId;
 const store=deps.through.store; requireReview(store,'publication','Canonical round-writer store is required');
 const id=codeReviewArtifactId(epicHash,storyId), folder=storyRecordFolderArgs(canonical,epicHash,storyId,{},{kind:'read'});
 const paths=codeReviewArtifactPaths(canonical,epicHash,storyId,folder.epicCreatedAt,folder.workItemKind,folder.epicSlug);
 try {
  await store.updateAndLog(id,deps.through.actor,async current=>{
   let priorExists = false;
   let priorHead:Record<string,unknown>|undefined;
   try {
    const prior = JSON.parse(await readFile(paths.json, 'utf8')) as { meta?: { schemaVersion?: unknown } };
    priorHead=prior as Record<string,unknown>;priorExists = true;
    requireReview(prior.meta?.schemaVersion === undefined || prior.meta.schemaVersion === 1 || prior.meta.schemaVersion === 2, 'CR', 'Unsupported prior CR version');
   } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
   if(deps.baseline)await requireCapacityBaseline(deps.baseline);
   const body=mergeTaskSummary(priorExists?current.payload.body:undefined,summary);
   const envelope={...(priorHead??{meta:{workflow:'code-review',schemaVersion:2}}),body,citations:[]};
   requireReview(Buffer.byteLength(JSON.stringify(envelope,null,2)+'\n')<=reviewJsonLimit(),'projection_limit','Merged CR envelope exceeds storage capacity');
   if(isDeepStrictEqual(body,current.payload.body)) return undefined;
   const {changeLog:_log,...head}=current;
   return {next:{...head,payload:{body:{...body},citations:[]}},options:{addresses:[],outcome:{result:summary.status,summary:`Task-based review ${reviewId}/${summary.attempt}: ${summary.status}`}}};
  },{},()=>({id,description:'',references:[],attachments:[],lifecycle:emptyLifecycle(0),payload:{body:{},citations:[]}}));
  // Render under the SAME queue; concurrent publications cannot leave an older projection last.
  await store.exclusive(id,async()=>{
   const record=await store.read(id);
   (deps.renderWrite??writeAtomic)(paths.md,`${artifactIdMarker(id)}\n\n${renderTaskReview(validateTaskBody(record.payload.body))}`);
  });
  attempt['review-response'].crPath=paths.md; attempt['review-response'].crPublication='complete'; delete attempt['review-response'].error;
  attempt['review-response'].summary='All selected task assessments are terminal. CR publication complete.';
  // Keep the completed feedback summary immutable; publication metadata is separate.
  attempt.header.status=summary.status;
  if(attempt.progress)attempt.progress={...attempt.progress,phase:'complete',processState:'unknown',activeToolCount:0,completedTasks:attempt['review-response'].tasks.length};
  await (deps.save??saveCheckpoint)(path,checkpoint);
  return {path:paths.md,jsonPath:paths.json,status:summary.status};
 } catch(error) {
  // A durable CR may already exist. Replay merges by identity; never rerun a model to repair publication.
  attempt['review-response'].crPublication='pending';
  throw error;
 }
}
