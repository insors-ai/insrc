/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import type { ArtifactStore } from '../../artifact-core/store.js';
import type { Actor, ChangeLogEntry } from '../../artifact-core/types.js';
import { LifecycleConflictError } from '../../artifact-core/types.js';
import { checkHeadIntegrity, nextLifecycle, contentHash } from '../../artifact-core/lifecycle.js';
import { checkSidecarEntrySize, designHistoryLimit } from '../../artifact-core/sidecar.js';
import { reviewReference } from '../report-log.js';
import { authorPartyOf } from '../party.js';
import { readDesignFile, assertDesignSubjectUnchanged } from './subject.js';
import { designCheckpointPath } from './checkpoint.js';
import { designPreservationDigest, designWorkflowDigest, validatePermanentDesignReview } from './history.js';
import type { PermanentDesignReview } from './history.js';
import { requireDesign, DesignReviewError } from './contracts.js';
import type { DesignReviewCheckpoint, DesignPublication } from './contracts.js';

const sha=(raw:string)=>createHash('sha256').update(raw).digest('hex');
export interface DesignPublicationDeps { readonly store?:ArtifactStore; readonly historyLimit?:(()=>number); }
/** Refuse a known impossible minimum before spending provider work. Growth is
 * checked again by the exact frame/journal writer and remains persistence-only.
 */
export function preflightDesignPublication(cp:DesignReviewCheckpoint,limit:number=designHistoryLimit()):void {
 const minimum=Buffer.byteLength(JSON.stringify(cp.attempts.map(({progress:_p,current:_c,publication:_r,...a})=>a)));
 requireDesign(limit<=designHistoryLimit()&&minimum<=limit,'publication_capacity','Known review history exceeds permanent publication capacity before dispatch');
}
/** Observer fields have a canonical stored projection. They are not review evidence.
 * This keeps retry payloads byte-identical without retaining a second checkpoint copy.
 */
function historyCheckpoint(cp:DesignReviewCheckpoint):DesignReviewCheckpoint {
 return {...cp,attempts:cp.attempts.map(({current:_current,publication:_publication,...a})=>({...a,
  progress:{status:a.status,phase:'complete',completedChunks:a.completedChunks.length,totalChunks:a.plan?.chunks.length??0,
   lastMeaningfulActivityAt:null,activeToolCount:0,requiresUserInput:['paused','invalidated','interrupted','failed'].includes(a.status),
   checkpointPath:designCheckpointPath(cp.project,cp.reviewId),sequence:0,reviewElapsedMs:0,unitElapsedMs:null,
   observedAt:a.finishedAt??a.startedAt,freshness:'stored'},
 }))};
}
/** Atomic journalled publication under the artifact store's existing queue; never calls a provider. */
export async function publishDesignReview(cp:DesignReviewCheckpoint,deps:DesignPublicationDeps={}):Promise<DesignPublication> {
 const store=deps.store??createRepoLifecycle(cp.project).store,attempt=cp.attempts.at(-1)!;
 requireDesign(attempt.report,'publication_incomplete','No consolidated report to publish');
 const preservation=designPreservationDigest(cp),id=sha(`design-review-v1\0${cp.project}\0${cp.artifactId}\0${cp.reviewId}\0${attempt.number}\0${preservation}`);
 const author=authorPartyOf(JSON.parse(attempt.baseline.reviewedContent.canonical).meta);
 requireDesign(author!=='unknown'&&author!==cp.subject.reviewer,'publication_party','Unknown or non-independent author');
 const actor:Actor={id:`agent:design-review-${cp.subject.reviewer}`,kind:'agent',properties:{party:cp.subject.reviewer}};
 let published:ChangeLogEntry|undefined;
 await store.updateAndLog(cp.artifactId,actor,current=>{
  const prior=current.changeLog.find(e=>e.id===id);
  if(prior){
   const record=validatePermanentDesignReview(prior.outcome?.data,{project:cp.project,artifactId:cp.artifactId});
   requireDesign(record.preservationDigest===preservation,'publication_conflict','Conflicting publication history');
   requireDesign(prior.targetHeadHash===sha(readDesignFile(cp.project,cp.subject.canonicalPath)), 'artifact_changed','Published head changed before receipt recovery');
   requireDesign(sha(readDesignFile(cp.project,cp.subject.documentPath))===attempt.baseline.subjectFingerprints.document,'artifact_changed','Document changed before receipt recovery');
   published=prior;return undefined;
  }
  assertDesignSubjectUnchanged(cp.subject,attempt.baseline);
  requireDesign(checkHeadIntegrity({description:current.description,payload:current.payload,lifecycle:current.lifecycle}).ok,'artifact_changed','Reviewed head integrity changed');
  const normalized=historyCheckpoint(cp),record:PermanentDesignReview={kind:'design-chunk-review',schemaVersion:1,
   reviewId:cp.reviewId,project:cp.project,artifactId:cp.artifactId,subject:cp.subject,submitted:cp.submitted,
   reviewer:cp.subject.reviewer,attempts:normalized.attempts,applicableAttempt:attempt.number,status:attempt.report!.status,
   binding:{sourceRevision:{number:current.lifecycle.revision.number,contentHash:current.lifecycle.revision.contentHash||contentHash(current.description,current.payload)},
    reviewedContentIdentity:attempt.baseline.contentIdentity,documentDigest:attempt.baseline.subjectFingerprints.document,
    workflowDigest:designWorkflowDigest(cp.subject.workflow),author},preservationDigest:preservation};
  validatePermanentDesignReview(record,{project:cp.project,artifactId:cp.artifactId});
  const verdict=attempt.report!.status==='passed'?'pass':'block',at=attempt.finishedAt??attempt.startedAt;
  const lifecycle=nextLifecycle({id:current.id,lifecycle:current.lifecycle},'review',actor,at,
   {review:{reviewer:actor,party:cp.subject.reviewer,verdict,counts:attempt.report!.counts,report:reviewReference(cp.artifactId,id)}});
  const outcome={result:verdict,summary:`Design review ${cp.reviewId} attempt ${attempt.number}`,data:record};
  checkSidecarEntrySize({artifactId:cp.artifactId,entry:{id,actor,timestamp:at,operation:'review',outcome}},(deps.historyLimit??designHistoryLimit)());
  return {next:{...current,lifecycle},options:{entryId:id,expectedHeadHash:attempt.baseline.subjectFingerprints.canonical,operation:'review',outcome}};
 }).then(result=>{published??=result.entry;}).catch(error=>{
  if(error instanceof LifecycleConflictError&&error.reason==='head-changed-after-stage')throw new DesignReviewError('artifact_changed',error.message);
  throw error;
 });
 requireDesign(published?.targetHeadHash,'publication_incomplete','Publication has no durable head receipt');
 // Read back the journal-completed entry and exact owned post-state, never refresh the baseline.
 const entry=(await store.history.log(cp.artifactId)).find(e=>e.id===id);
 requireDesign(entry&&JSON.stringify(entry)===JSON.stringify(published),'publication_incomplete','Published history readback differs');
 validatePermanentDesignReview(entry.outcome?.data,{project:cp.project,artifactId:cp.artifactId});
 requireDesign(sha(readDesignFile(cp.project,cp.subject.canonicalPath))===published.targetHeadHash&&
  sha(readDesignFile(cp.project,cp.subject.documentPath))===attempt.baseline.subjectFingerprints.document,'artifact_changed','Subject changed during publication');
 return {reviewId:cp.reviewId,attempt:attempt.number,state:'complete',artifactHistoryEntryId:id,reportReference:id,
  canonicalBefore:attempt.baseline.subjectFingerprints.canonical,canonicalAfter:published.targetHeadHash};
}
