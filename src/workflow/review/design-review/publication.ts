/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import type { ArtifactStore } from '../../artifact-core/store.js';
import type { Actor, ChangeLogEntry } from '../../artifact-core/types.js';
import { LifecycleConflictError } from '../../artifact-core/types.js';
import { checkHeadIntegrity, checkIntegrity, nextLifecycle, contentHash } from '../../artifact-core/lifecycle.js';
import { checkSidecarEntrySize, designHistoryLimit } from '../../artifact-core/sidecar.js';
import { reviewReference } from '../report-log.js';
import { authorPartyOf } from '../party.js';
import { readDesignFile, assertDesignSubjectUnchanged, prepareDesignSubject } from './subject.js';
import { designCheckpointPath, qualifiedDesignProjection } from './checkpoint.js';
import { designPreservationDigest, designWorkflowDigest, validatePermanentDesignReview } from './history.js';
import type { PermanentDesignReview } from './history.js';
import { requireDesign, DesignReviewError, isDesignAdmission } from './contracts.js';
import type { DesignReviewCheckpoint, DesignPublication, StoredDesignCheckpoint } from './contracts.js';
import { persistReviewResourceAudit } from '../resource-audit.js';
import { decodeArtifactHead } from '../../artifact-core/decode.js';

const sha=(raw:string)=>createHash('sha256').update(raw).digest('hex');
/** Lifecycle writers retain the source head and may add its default envelope.
 * Compare every other source field, including metadata and relationships. */
function sourceHeadDigest(id:string,raw:string):string{
 const head=JSON.parse(raw) as {meta:Record<string,unknown>;[key:string]:unknown},artifact=decodeArtifactHead(id,raw).artifact;
 const {lifecycle:_lifecycle,...meta}=head.meta;
 meta['envelope']??={description:artifact.description,...(artifact.parent?{parent:artifact.parent}:{}),references:artifact.references,...(artifact.binding?{binding:artifact.binding}:{}),attachments:artifact.attachments};
 return contentHash('design-source-head-v1',{body:{...head,meta},citations:[]});
}
export interface DesignPublicationDeps { readonly store?:ArtifactStore; readonly historyLimit?:(()=>number); }
/** Refuse a known impossible minimum before spending provider work. Growth is
 * checked again by the exact frame/journal writer and remains persistence-only.
 */
export function preflightDesignPublication(cp:StoredDesignCheckpoint,limit:number=designHistoryLimit()):void {
 const minimum=Buffer.byteLength(JSON.stringify(cp.attempts.map(a=>{
  if(isDesignAdmission(a)){const {progress:_p,...evidence}=a;return evidence;}
  const {progress:_p,current:_c,publication:_r,...evidence}=a;return evidence;
 })));
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
export async function publishDesignReview(input:StoredDesignCheckpoint,deps:DesignPublicationDeps={}):Promise<DesignPublication> {
 const cp=qualifiedDesignProjection(input);
 requireDesign(cp&&input.attempts.at(-1)?.number===cp.attempts.at(-1)?.number&&!isDesignAdmission(input.attempts.at(-1)!),'publication_incomplete','Unverified admission has no consolidated report');
 const store=deps.store??createRepoLifecycle(cp.project).store,attempt=cp.attempts.at(-1)!;
 requireDesign(attempt.report,'publication_incomplete','No consolidated report to publish');
 const preservation=designPreservationDigest(input),id=sha(`design-review-v1\0${cp.project}\0${cp.artifactId}\0${cp.reviewId}\0${attempt.number}\0${preservation}`);
 await persistReviewResourceAudit(store,cp.artifactId,{project:cp.project,family:'design',reviewId:cp.reviewId},input.attempts.flatMap(a=>'resourceGuard' in a&&a.resourceGuard?[{attempt:a.number,resourceGuard:a.resourceGuard}]:[]));
 const author=authorPartyOf(JSON.parse(attempt.baseline.reviewedContent.canonical).meta);
 requireDesign(author!=='unknown'&&author!==cp.subject.reviewer,'publication_party','Unknown or non-independent author');
 const actor:Actor={id:`agent:design-review-${cp.subject.reviewer}`,kind:'agent',properties:{party:cp.subject.reviewer}};
 let published:ChangeLogEntry|undefined;
 let acceptedPostHeadHash:string|undefined;
 await store.updateAndLog(cp.artifactId,actor,current=>{
  const prior=current.changeLog.find(e=>e.id===id);
  if(prior){
   const record=validatePermanentDesignReview(prior.outcome?.data,{project:cp.project,artifactId:cp.artifactId});
   requireDesign(record.preservationDigest===preservation,'publication_conflict','Conflicting publication history');
   const unchangedHead=prior.targetHeadHash===sha(readDesignFile(cp.project,cp.subject.canonicalPath));
   if(!unchangedHead){
    // A lifecycle-only approval/signoff must not force a second review write or
    // discard its approval. Prove the current approval chain and all original
    // source/document/workflow bindings instead of accepting arbitrary edits.
    const rv=current.lifecycle.review,prepared=prepareDesignSubject(cp.project,cp.subject.canonicalPath);
    const rawHead=readDesignFile(cp.project,cp.subject.canonicalPath);
    const approvalEntry=[...current.changeLog].reverse().find(e=>e.operation==='approve'&&e.revision?.number===current.lifecycle.revision.number);
    requireDesign(['approved','in-signoff','signed-off','completed'].includes(current.lifecycle.status)&&
     current.lifecycle.approval?.revision===current.lifecycle.revision.number&&checkIntegrity(current,current.changeLog).ok&&
     approvalEntry?.actor.id===current.lifecycle.approval.by.id&&
     rawHead===JSON.stringify(JSON.parse(rawHead),null,2)+'\n'&&sourceHeadDigest(cp.artifactId,rawHead)===sourceHeadDigest(cp.artifactId,attempt.baseline.reviewedContent.canonical)&&
     rv?.report?.fragment===prior.id&&rv.report.entityId===cp.artifactId&&rv.report.type==='change-log-entry'&&rv.report.relation==='reviews'&&rv.revision===record.binding.sourceRevision.number&&
     rv.party===record.reviewer&&rv.reviewer.id===prior.actor.id&&rv.verdict===(attempt.report!.status==='passed'?'pass':'block')&&(['HIGH','MED','LOW'] as const).every(k=>rv.counts[k]===attempt.report!.counts[k])&&
     current.lifecycle.revision.number===record.binding.sourceRevision.number&&
     (current.lifecycle.revision.contentHash||contentHash(current.description,current.payload))===record.binding.sourceRevision.contentHash&&
     authorPartyOf(JSON.parse(readDesignFile(cp.project,cp.subject.canonicalPath)).meta)===record.binding.author&&
     designWorkflowDigest(prepared.subject.workflow)===record.binding.workflowDigest,
     'artifact_changed','Published head changed before receipt recovery');
   }
   requireDesign(sha(readDesignFile(cp.project,cp.subject.documentPath))===attempt.baseline.subjectFingerprints.document,'artifact_changed','Document changed before receipt recovery');
   acceptedPostHeadHash=sha(readDesignFile(cp.project,cp.subject.canonicalPath));
   published=prior;return undefined;
  }
  assertDesignSubjectUnchanged(cp.subject,attempt.baseline);
  requireDesign(checkHeadIntegrity({description:current.description,payload:current.payload,lifecycle:current.lifecycle}).ok,'artifact_changed','Reviewed head integrity changed');
  const normalized=historyCheckpoint(cp),common={kind:'design-chunk-review' as const,
   reviewId:cp.reviewId,project:cp.project,artifactId:cp.artifactId,subject:cp.subject,
   reviewer:cp.subject.reviewer,applicableAttempt:attempt.number,status:attempt.report!.status,
   binding:{sourceRevision:{number:current.lifecycle.revision.number,contentHash:current.lifecycle.revision.contentHash||contentHash(current.description,current.payload)},
    reviewedContentIdentity:attempt.baseline.contentIdentity,documentDigest:attempt.baseline.subjectFingerprints.document,
    workflowDigest:designWorkflowDigest(cp.subject.workflow),author},preservationDigest:preservation};
  const record:PermanentDesignReview=input.schemaVersion===1
   ?{...common,schemaVersion:1,submitted:cp.submitted,attempts:normalized.attempts}
   :{...common,schemaVersion:2,...(input.submitted?{submitted:input.submitted}:{}),
     attempts:input.attempts.filter(a=>!isDesignAdmission(a)).map(a=>{const clean=normalized.attempts.find(n=>n.number===a.number)!;return{...a,...clean};}),
     admissionFailures:input.attempts.filter(isDesignAdmission).map(a=>({...a,progress:{...a.progress,freshness:'stored' as const,sequence:0}}))};
  validatePermanentDesignReview(record,{project:cp.project,artifactId:cp.artifactId});
  const verdict=attempt.report!.status==='passed'?'pass':'block',at=attempt.finishedAt??attempt.startedAt;
  const lifecycle=nextLifecycle({id:current.id,lifecycle:current.lifecycle},'review',actor,at,
   {review:{reviewer:actor,party:cp.subject.reviewer,verdict,counts:attempt.report!.counts,report:reviewReference(cp.artifactId,id)}});
  const outcome={result:verdict,summary:`Design review ${cp.reviewId} attempt ${attempt.number}`,data:record};
  checkSidecarEntrySize({artifactId:cp.artifactId,entry:{id,actor,timestamp:at,operation:'review',outcome}},(deps.historyLimit??designHistoryLimit)());
  return {next:{...current,lifecycle},options:{expectedDocument:{path:cp.subject.documentPath,hash:attempt.baseline.subjectFingerprints.document},entryId:id,expectedHeadHash:attempt.baseline.subjectFingerprints.canonical,operation:'review',outcome}};
 }).then(result=>{published??=result.entry;}).catch(error=>{
  if(error instanceof LifecycleConflictError&&error.reason==='head-changed-after-stage')throw new DesignReviewError('artifact_changed',error.message);
  throw error;
 });
 requireDesign(published?.targetHeadHash,'publication_incomplete','Publication has no durable head receipt');
 // Read back the journal-completed entry and exact owned post-state, never refresh the baseline.
 const entry=(await store.history.log(cp.artifactId)).find(e=>e.id===id);
 requireDesign(entry&&JSON.stringify(entry)===JSON.stringify(published),'publication_incomplete','Published history readback differs');
 validatePermanentDesignReview(entry.outcome?.data,{project:cp.project,artifactId:cp.artifactId});
 const canonicalAfter=acceptedPostHeadHash??published.targetHeadHash;
 requireDesign(sha(readDesignFile(cp.project,cp.subject.canonicalPath))===canonicalAfter&&
  sha(readDesignFile(cp.project,cp.subject.documentPath))===attempt.baseline.subjectFingerprints.document,'artifact_changed','Subject changed during publication');
 return {reviewId:cp.reviewId,attempt:attempt.number,state:'complete',artifactHistoryEntryId:id,reportReference:id,
  canonicalBefore:attempt.baseline.subjectFingerprints.canonical,canonicalAfter};
}
