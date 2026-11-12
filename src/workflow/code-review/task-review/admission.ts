import { readCapacityBaseline, qualifyReviewCapacity } from './capacity.js';
import { captureFinalScope } from './final-scope-history.js';
import { validateFailureDiagnostics } from './diagnostics.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFile, realpath } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId } from '../../storage.js';
import { reviewedBuildFingerprint } from '../build-freshness.js';
import { decodeReview, CheckpointSchema, requireReview, ReviewRequestSchema, SavedReviewRequestSchema, reviewPath, parsePacket } from './contracts.js';
import type { ReviewAttempt, ReviewerParty, ReviewOperation, ReviewCheckpoint, CodeAdmissionAttempt } from './contracts.js';
import { checkpointPath, loadCheckpoint } from './checkpoint.js';
import { prepareReviewPacket } from './packet.js';
import { readStoryRoute } from './route-source.js';
import type { PreparedReviewPacket } from './packet.js';
import type { ReviewSources } from './sources.js';
import type { AdmittedReview } from './execution.js';
import { aggregateTaskStatus, validateTaskResult, validateResultOrigins } from './results.js';
import { resultReferences, validateTaskBody } from './record.js';
import { restoreAcceptedAssignments, taskInputFingerprint } from './attribution-binding.js';
import type { TaskInputFingerprint } from './attribution-binding.js';

export function canonicalReviewStory(story: string, hash: string): string {
 const local = story.startsWith(`STORY-${hash}-`) ? story.slice(`STORY-${hash}-`.length) : story;
 requireReview(/^s\d+$/.test(local), 'storyId', 'Expected canonical story identity');
 return local;
}

/** Read and validate admission without writing or starting a provider. The coordinator owns reservation and save. */
export interface ReviewAdmissionContext {
 readonly operation?:ReviewOperation|undefined;
 readonly epicHash?:string|undefined;
 /** Internal worker handoff, after discriminating the full stored checkpoint.
  * No renumbering: the qualified view excludes technical-only attempts. */
 readonly accepted?:{readonly admission:CodeAdmissionAttempt;readonly prior:ReviewCheckpoint|undefined;readonly historyLength:number}|undefined;
 readonly qualifiedHistory?:ReviewCheckpoint|undefined;
}
export async function prepareReviewAdmission(project: string, reviewId: string, attempt: number, input: unknown,
 reviewer: ReviewerParty, sources: ReviewSources, context: ReviewAdmissionContext = {}): Promise<AdmittedReview> {
 const request = decodeReview(context.operation === 'resume' ? SavedReviewRequestSchema : ReviewRequestSchema, { reviewId, attempt, ...(input !== undefined ? { packet: input } : {}), ...(context.operation !== undefined ? { operation: context.operation } : {}) });
 const operation = request.operation ?? 'start';
 const capacity=async(review:AdmittedReview):Promise<AdmittedReview>=>{if(review.prepared.projection&&review.attempt['review-response'].crPublication!=='complete'){review.capacity=await readCapacityBaseline(review.checkpoint.project,review.prepared.epicHash,review.checkpoint.storyId);qualifyReviewCapacity(review);}return review;};
 // Refuse invalid fresh selections before re-reading any saved source history.
 // Resume still decodes its immutable packet under historical rules below.
 if (operation === 'start' && request.packet !== undefined) parsePacket(request.packet);
 const canonical = await realpath(project), path = checkpointPath(canonical, request.reviewId);
 const saved = context.accepted ? context.accepted.prior : context.qualifiedHistory??await loadCheckpoint(path);
 if(context.accepted){
  const accepted=context.accepted.admission;
  requireReview(operation==='start'&&accepted.header.attempt===attempt&&accepted.header.reviewer===reviewer&&['pending','running'].includes(accepted.header.status)&&isDeepStrictEqual(accepted.submitted,request.packet),'admission','Pinned worker admission mismatch');
 }
 let priorPrepared: PreparedReviewPacket | undefined;
 const priorTaskInputs=new Map<number,ReadonlyMap<string,TaskInputFingerprint>>();
 if (saved) {
  requireReview(saved.project === canonical && saved.reviewId === reviewId, 'checkpoint', 'Checkpoint identity mismatch');
  requireReview(saved.attempts.every((entry, index) => context.accepted||context.qualifiedHistory ? entry.header.attempt<=(context.accepted?attempt-1:attempt)&&(index===0||entry.header.attempt>saved.attempts[index-1]!.header.attempt) : entry.header.attempt === index + 1), 'attempt', 'Attempt history must be contiguous');
  for (const [index, entry] of saved.attempts.entries()) {
   requireReview(Number.isFinite(Date.parse(entry.header.createdAt)) && (!entry.header.completedAt || Number.isFinite(Date.parse(entry.header.completedAt))), 'checkpoint', 'Invalid attempt timestamp');
   validateFailureDiagnostics(entry);
   const prepared = await prepareReviewPacket(entry.submitted, sources, true, undefined, entry.header.derived);
   requireReview(!entry.submitted.reviewRevision || entry.header.finalScopeIdentity === prepared.projection?.identity, 'attribution', 'Saved final scope does not match pinned source');
   const boundAssignments = await restoreAcceptedAssignments({ path, checkpoint: saved, attempt: entry, prepared, priorTaskInputs });
   if(boundAssignments)priorTaskInputs.set(entry.header.attempt,new Map(boundAssignments.map(a=>[a.taskId,taskInputFingerprint(prepared,a)])));
   requireReview(!priorPrepared || priorPrepared.epicHash === prepared.epicHash, 'scope', 'Attempt belongs to another epic');
   requireReview(canonicalReviewStory(saved.storyId, prepared.epicHash) === canonicalReviewStory(prepared.packet.storyId, prepared.epicHash) && saved.taskId === prepared.packet.taskId, 'scope', 'Attempt belongs to another story/task');
   const selected = prepared.tasks.filter(task => !saved.taskId || task.id === saved.taskId).map(task => task.id);
   requireReview(new Set(entry.header.selectedTaskIds).size === selected.length && isDeepStrictEqual([...entry.header.selectedTaskIds].sort(), [...selected].sort()), 'tasks', 'Saved selected tasks disagree with pinned Plan');
   const results = entry['review-response'].tasks;
   requireReview(new Set(results.map(result => result.taskId)).size === results.length && results.every(result => selected.includes(result.taskId)), 'tasks', 'Duplicate or foreign saved result');
   for (const result of results) {
    const refs = resultReferences(result);
    for (const reference of refs) {
     const match = /^([a-f0-9]{40}|[a-f0-9]{64}):(.+)$/.exec(reference);
     requireReview(match, 'evidence', 'Expected committed evidence reference'); reviewPath(match[2]!);
     await sources.commit(match[1]!); requireReview(await sources.file(match[1]!, match[2]!), 'evidence', 'Unresolved saved evidence reference');
    }
    validateTaskResult(result, { taskId: result.taskId, changes: boundAssignments?.find(a => a.taskId === result.taskId)?.changes ?? (entry.submitted.reviewRevision ? [] : prepared.changes), evidenceReferences: refs });
   }
   if (!['pending', 'running'].includes(entry.header.status)) requireReview(results.length === selected.length && entry.header.completedAt && aggregateTaskStatus(results) === entry.header.status, 'checkpoint', 'Terminal attempt disagrees with saved tasks');
   if (entry['review-response'].crPublication === 'complete') requireReview(entry.header.completedAt && !['pending', 'running'].includes(entry.header.status), 'checkpoint', 'Published attempt is not terminal');
   if (index < saved.attempts.length - 1) requireReview(entry['review-response'].crPublication === 'complete' && !['pending', 'running'].includes(entry.header.status), 'attempt', 'Earlier attempt was not published');
   if (entry['review-response'].crPublication === 'complete') {
    const cr = JSON.parse(await readFile(artifactJsonPath(canonical, codeReviewArtifactId(prepared.epicHash, canonicalReviewStory(saved.storyId, prepared.epicHash))), 'utf8')) as { meta?: { schemaVersion?: number }; body?: unknown };
    requireReview(cr.meta?.schemaVersion === 2 || cr.meta?.schemaVersion === 3, 'publication', 'Expected task-based CR history');
    const summary = validateTaskBody(cr.body).reviews.find(review => review.reviewId === reviewId && review.attempt === entry.header.attempt);
    const scope = { ...(entry.submitted.reviewRevision?{reviewRevision:entry.submitted.reviewRevision,finalScope:captureFinalScope(prepared,entry)}:{}),storyId: entry.submitted.storyId, ...(entry.submitted.taskId ? { taskId: entry.submitted.taskId } : {}), documents: entry.submitted.documents, reviewSet: entry.submitted.reviewSet };
    requireReview(summary && summary.reviewer === entry.header.reviewer && summary.status === entry.header.status && summary.completedAt === entry.header.completedAt
     && summary.finalScopeIdentity === entry.header.finalScopeIdentity && summary.attributionIdentity === entry.header.attributionIdentity && isDeepStrictEqual(summary.taskScopeIdentities,entry.header.taskScopeIdentities)
     && summary.buildFingerprint === entry.header.buildFingerprint && isDeepStrictEqual(summary.scope, scope) && isDeepStrictEqual(summary.tasks, results)
     && isDeepStrictEqual(summary.origins, entry['review-response'].origins), 'publication', 'Published CR disagrees with pinned attempt');
   }
   priorPrepared = prepared;
  }
  validateResultOrigins(saved.attempts.map(entry => ({ attempt: entry.header.attempt, reviewer: entry.header.reviewer, tasks: entry['review-response'].tasks, origins: entry['review-response'].origins })));
 }
 const latest = saved?.attempts.at(-1);
 if (operation === 'resume') {
  requireReview(saved && latest && priorPrepared, 'checkpoint', 'missing-checkpoint');
  requireReview(latest.header.status!=='failed','attempt','Failed review requires the next attempt');
  requireReview(latest.header.attempt === attempt, 'attempt', 'attempt-conflict: resume must select latest attempt');
  requireReview(latest.header.reviewer === reviewer, 'reviewer', 'wrong-reviewer');
  requireReview(request.packet === undefined || isDeepStrictEqual(request.packet, latest.submitted), 'packet', 'attempt-conflict: resume input is pinned');
  requireReview(!['pending', 'running'].includes(latest.header.status) || latest.submitted.reviewRevision !== undefined, 'reviewRevision', 'Interrupted unpinned history is read-only; submit a new pinned attempt');
  requireReview(!context.epicHash || context.epicHash === priorPrepared.epicHash, 'epicHash', 'Pinned Plan belongs to another review subject');
  return capacity({ path, checkpoint: saved, attempt: latest, prepared: priorPrepared, priorTaskInputs });
 }
 requireReview(request.packet, 'packet', 'Start requires a committed packet');
 requireReview(context.accepted ? attempt===context.accepted.historyLength+1 : saved ? attempt === saved.attempts.length + 1 : attempt === 1, 'attempt', saved ? 'attempt-conflict: expected next sequential attempt' : 'missing-checkpoint: first attempt must be 1');
 if (latest) requireReview(!['pending', 'running'].includes(latest.header.status) && latest['review-response'].crPublication === 'complete', 'attempt', 'attempt-conflict: previous attempt must be terminal and published');
 // The route comes from the Story's stored artifacts, never from the packet. Resume and publication re-read stored history and pass none.
 const route = context.epicHash ? await readStoryRoute(canonical, context.epicHash, canonicalReviewStory(request.packet.storyId, context.epicHash)) : undefined;
 const prepared = await prepareReviewPacket(request.packet, sources, false, route);
 requireReview(!context.epicHash || context.epicHash === prepared.epicHash, 'epicHash', 'Pinned Plan belongs to another review subject');
 if (saved && priorPrepared) requireReview(prepared.epicHash === priorPrepared.epicHash && canonicalReviewStory(prepared.packet.storyId, prepared.epicHash) === canonicalReviewStory(saved.storyId, prepared.epicHash) && prepared.packet.taskId === saved.taskId, 'scope', 'New attempt changes review subject');
 const entry: ReviewAttempt = { header: { attempt, reviewer, status: 'pending', createdAt: context.accepted?.admission.header.createdAt??new Date().toISOString(), selectedTaskIds: prepared.tasks.filter(task => !prepared.packet.taskId || task.id === prepared.packet.taskId).map(task => task.id), ...(prepared.derived ? { derived: prepared.derived } : {}) }, submitted: prepared.packet,
  'review-response': { summary: 'Review admitted; CR publication pending.', tasks: [], crPublication: 'pending' } };
 if (prepared.projection) { entry.header.finalScopeIdentity = prepared.projection.identity; entry.header.attributionState = 'pending'; }
 if (!prepared.packet.taskId) {
  try { entry.header.buildFingerprint = reviewedBuildFingerprint(JSON.parse(await readFile(artifactJsonPath(canonical, buildArtifactId(prepared.epicHash, canonicalReviewStory(prepared.packet.storyId, prepared.epicHash))), 'utf8'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
 }
 const checkpoint = saved ? { ...saved, attempts: [...saved.attempts, entry] } : { schemaVersion: 1 as const, reviewId, project: canonical, storyId: prepared.packet.storyId, ...(prepared.packet.taskId ? { taskId: prepared.packet.taskId } : {}), attempts: [entry] };
 // Include the appended input in the existing whole-checkpoint bound before any caller can save it.
 decodeReview(CheckpointSchema, checkpoint);
 return capacity({ path, checkpoint, attempt: entry, prepared, priorTaskInputs });
}
