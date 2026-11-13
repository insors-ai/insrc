import { requireCapacityBaseline } from './capacity.js';
import type { CapacityBaseline } from './capacity.js';
import { completedSummary,failedAttemptSummary } from './summary.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFile, realpath } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { artifactIdMarker, codeReviewArtifactId, codeReviewArtifactPaths, storyRecordFolderArgs, writeAtomic } from '../../storage.js';
import { emptyLifecycle } from '../../artifact-core/decode.js';
import type { RoundWriter } from '../../runners/build/round-writer.js';
import { reviewJsonLimit, requireReview, reviewPath, isCodeAdmission } from './contracts.js';
import type { ReviewCheckpoint, CodeAdmissionAttempt, StoredReviewCheckpoint, ReviewAttempt } from './contracts.js';
import { decodeStoredCheckpoint } from './admission-checkpoint.js';
import { persistReviewResourceAudit, withoutReviewResourceGuard } from '../../review/resource-audit.js';
import { canonicalReviewStory } from './admission.js';
import { prepareReviewPacket } from './packet.js';
import type { ReviewSources } from './sources.js';
import { validateTaskResult, validateResultOrigins } from './results.js';
import { checkpointPath, saveCheckpoint, saveStoredCheckpoint } from './checkpoint.js';
import { mergeTaskSummary, mergeCodeAdmissionFailure, renderTaskReview, resultReferences, validateTaskBody } from './record.js';

import { restoreAcceptedAssignments, validateSavedAttribution } from './attribution-binding.js';
import { captureFinalScope } from './final-scope-history.js';

export interface PublicationDeps { readonly baseline?:CapacityBaseline; readonly sources:ReviewSources; readonly through:RoundWriter; readonly save?:typeof saveCheckpoint; readonly saveStored?:typeof saveStoredCheckpoint; readonly renderWrite?:typeof writeAtomic; }

/** No reviewer invocation: project completed task feedback through the canonical queued store. */
export async function publishTaskCheckpoint(project: string, epicHash:string, reviewId:string, deps:PublicationDeps):Promise<{ path:string; jsonPath:string; status:string }> {
 const canonical = await realpath(project), path = checkpointPath(canonical, reviewId);
 const stored = decodeStoredCheckpoint(JSON.parse(await readFile(path,'utf8')));
 requireReview(stored.project === canonical && stored.reviewId === reviewId, 'checkpoint', 'Checkpoint identity mismatch');
 const latest = stored.attempts.at(-1)!;
 if (isCodeAdmission(latest)) return publishTechnicalAdmission(canonical, epicHash, stored, latest, deps);
 requireReview(latest.header.status!=='failed'||latest['review-response'].crPublication==='complete','attempt','Failed review requires the next attempt; its pending publication cannot rewrite failed feedback');
 const entries: readonly (ReviewAttempt | CodeAdmissionAttempt)[] = stored.attempts;
 const failures = entries.filter((a): a is CodeAdmissionAttempt => isCodeAdmission(a));
 const checkpoint: ReviewCheckpoint = { ...stored, schemaVersion: 1, attempts: entries.filter((a): a is ReviewAttempt => !isCodeAdmission(a)).map(a => { const { acceptedAt: _at, operation: _operation, ...qualified } = withoutReviewResourceGuard(a); return qualified; }) };
 validateResultOrigins(checkpoint.attempts.map(entry => ({ attempt:entry.header.attempt, reviewer:entry.header.reviewer, tasks:entry['review-response'].tasks, origins:entry['review-response'].origins })));
 requireReview(stored.attempts.every((a,i)=>a.header.attempt===i+1),'attempt','Attempt history must be contiguous');
 for(const earlier of checkpoint.attempts.slice(0,-1)){
  requireReview((earlier.header.status==='failed'||earlier['review-response'].crPublication==='complete')&&!['pending','running'].includes(earlier.header.status),'attempt','Earlier attempt must be published');
  validateSavedAttribution(earlier);
  if(earlier.submitted.reviewRevision){
   const priorPrepared=await prepareReviewPacket(earlier.submitted,deps.sources,true,undefined,earlier.header.derived);
   requireReview(priorPrepared.epicHash===epicHash&&canonicalReviewStory(priorPrepared.packet.storyId,epicHash)===canonicalReviewStory(checkpoint.storyId,epicHash)&&priorPrepared.packet.taskId===checkpoint.taskId,'scope','Earlier scope belongs to another subject');
   await restoreAcceptedAssignments({path,checkpoint,attempt:earlier,prepared:priorPrepared});if(earlier.header.attributionState!=='pending')captureFinalScope(priorPrepared,earlier);
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
 await auditResources(stored, id, deps);
 try {
  await store.updateAndLog(id,deps.through.actor,async current=>{
   let priorExists = false;
   let priorHead:Record<string,unknown>|undefined;
   try {
    const prior = JSON.parse(await readFile(paths.json, 'utf8')) as { meta?: { schemaVersion?: unknown } };
    priorHead=prior as Record<string,unknown>;priorExists = true;
    requireReview(prior.meta?.schemaVersion === undefined || [1,2,3].includes(prior.meta.schemaVersion as number), 'CR', 'Unsupported prior CR version');
   } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
   if(deps.baseline)await requireCapacityBaseline(deps.baseline);
   let history: unknown = priorExists ? current.payload.body : undefined;
   for (const failure of failures) history = mergeCodeAdmissionFailure(history, reviewId, failure);
   for(const earlier of stored.attempts.slice(0,-1))if(!isCodeAdmission(earlier)&&earlier.header.status==='failed'&&earlier['review-response'].crPublication==='pending')history=mergeTaskSummary(history,failedAttemptSummary(earlier,reviewId));
   const body=mergeTaskSummary(history,summary);
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
  if (stored.schemaVersion === 2) {
   Object.assign(latest.header, attempt.header); latest['review-response'] = attempt['review-response'];
   if (attempt.progress) latest.progress = attempt.progress;
   await (deps.saveStored ?? saveStoredCheckpoint)(path, stored);
  } else await (deps.save??saveCheckpoint)(path,checkpoint);
  return {path:paths.md,jsonPath:paths.json,status:summary.status};
 } catch(error) {
  // A durable CR may already exist. Replay merges by identity; never rerun a model to repair publication.
  attempt['review-response'].crPublication='pending';
  throw error;
 }
}

async function auditResources(cp: StoredReviewCheckpoint, artifactId: string, deps: PublicationDeps): Promise<void> {
 const store = deps.through.store; requireReview(store, 'publication', 'Canonical round-writer store is required');
 await persistReviewResourceAudit(store, artifactId, { project: cp.project, family: 'code', reviewId: cp.reviewId }, cp.attempts.flatMap(a => a.resourceGuard ? [{ attempt: a.header.attempt, resourceGuard: a.resourceGuard }] : []));
}
async function publishTechnicalAdmission(project: string, hash: string, cp: StoredReviewCheckpoint, latest: CodeAdmissionAttempt, deps: PublicationDeps): Promise<{ path: string; jsonPath: string; status: string }> {
 requireReview(['failed','interrupted'].includes(latest.header.status), 'admission', 'Unverified active admission cannot publish a review');
 const story = canonicalReviewStory(cp.storyId, hash), id = codeReviewArtifactId(hash, story), store = deps.through.store;
 requireReview(store, 'publication', 'Canonical round-writer store is required');
 const folder = storyRecordFolderArgs(project, hash, story, {}, { kind: 'read' });
 const paths = codeReviewArtifactPaths(project, hash, story, folder.epicCreatedAt, folder.workItemKind, folder.epicSlug);
 await auditResources(cp, id, deps);
 await store.updateAndLog(id, deps.through.actor, async current => {
  try {
   const prior=JSON.parse(await readFile(paths.json,'utf8')) as {meta?:{schemaVersion?:unknown}};
   requireReview(prior.meta?.schemaVersion===undefined||[1,2,3].includes(prior.meta.schemaVersion as number),'CR','Unsupported prior CR version');
  } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
  let body: unknown = Object.keys(current.payload.body).length ? current.payload.body : undefined;
  for (const failure of cp.attempts) if (isCodeAdmission(failure)) body = mergeCodeAdmissionFailure(body, cp.reviewId, failure);
  const accepted = validateTaskBody(body);
  if (isDeepStrictEqual(current.payload.body, accepted)) return undefined;
  return { next: { ...current, payload: { body: { ...accepted }, citations: [] } }, options: { outcome: { result: 'admission-failed', summary: `Technical admission ${cp.reviewId}/${latest.header.attempt}; no task assessment` } } };
 }, {}, () => ({ id, description: '', references: [], attachments: [], lifecycle: emptyLifecycle(0), payload: { body: {}, citations: [] } }));
 await store.exclusive(id, async () => { const current = await store.read(id); (deps.renderWrite ?? writeAtomic)(paths.md, `${artifactIdMarker(id)}\n\n${renderTaskReview(current.payload.body)}`); });
 return { path: paths.md, jsonPath: paths.json, status: 'failed' };
}
