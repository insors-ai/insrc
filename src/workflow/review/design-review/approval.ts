/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { artifactJsonPath } from '../../storage.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import type { ArtifactStore } from '../../artifact-core/store.js';
import type { Artifact, ChangeLogEntry } from '../../artifact-core/types.js';
import { ReviewRequiredError } from '../../artifact-core/types.js';
import type { HeadPayload } from '../../artifact-core/codecs.js';
import { contentHash } from '../../artifact-core/lifecycle.js';
import { prepareDesignSubject, readDesignFile } from './subject.js';
import { designPreservationDigest, designWorkflowDigest, validatePermanentDesignReview } from './history.js';
import { loadDesignCheckpoint } from './checkpoint.js';
import type { DesignReviewCheckpoint } from './contracts.js';
import { designArtifactActive } from './fence.js';

interface Admission {kind:'design-review-admission';schemaVersion:1;project:string;artifactId:string;reviewId:string;attempt:number;ordinal:number;contentIdentity:string;}
function admissions(log:readonly ChangeLogEntry[],project:string,id:string):Admission[]{
 return log.flatMap(e=>{
  const d=e.outcome?.data as Partial<Admission>|undefined;
  if(d?.kind!=='design-review-admission'||d.project!==project||d.artifactId!==id)return[];
  if(d.schemaVersion!==1||typeof d.reviewId!=='string'||!d.reviewId|| (d.attempt??0)<1||(d.attempt??0)>128||!Number.isSafeInteger(d.attempt)||!Number.isSafeInteger(d.ordinal)||(d.ordinal??0)<1||typeof d.contentIdentity!=='string'||!/^([a-f0-9]{64})$/.test(d.contentIdentity))throw new ReviewRequiredError('Design admission history is malformed');
  return[d as Admission];
 });
}
/** A small revision-less entry in the existing artifact log, not another execution ledger. */
export async function recordDesignAdmission(cp:DesignReviewCheckpoint,store:ArtifactStore=createRepoLifecycle(cp.project).store):Promise<void>{
 const a=cp.attempts.at(-1)!,id=createHash('sha256').update(`design-admission\0${cp.project}\0${cp.artifactId}\0${cp.reviewId}\0${a.number}\0${a.baseline.contentIdentity}\0${a.actions?.at(-1)?.actionId??"start"}`).digest('hex');
 await store.exclusive(cp.artifactId,async()=>{
  const log=await store.history.log(cp.artifactId);const prior=log.find(e=>e.id===id);
  if(prior){const d=admissions([prior],cp.project,cp.artifactId)[0];if(!d||d.reviewId!==cp.reviewId||d.attempt!==a.number||d.contentIdentity!==a.baseline.contentIdentity)throw new ReviewRequiredError('Conflicting design admission replay');return;}
  const ordinal=admissions(log,cp.project,cp.artifactId).reduce((max,d)=>Math.max(max,d.ordinal),0)+1;
  if(!Number.isSafeInteger(ordinal))throw new ReviewRequiredError('Design admission history ordinal exhausted');
  const data:Admission={kind:'design-review-admission',schemaVersion:1,project:cp.project,artifactId:cp.artifactId,reviewId:cp.reviewId,attempt:a.number,ordinal,contentIdentity:a.baseline.contentIdentity};
  await store.history.appendLog(cp.artifactId,{id,actor:{id:`agent:design-review-${cp.subject.reviewer}`,kind:'agent',properties:{party:cp.subject.reviewer}},timestamp:a.startedAt,operation:'request-review',outcome:{result:'admitted',summary:`Design review ${cp.reviewId} attempt ${a.number}`,data}});
 });
}
/** Called inside the artifact queue, under the coordinator fence. No providers or nested writes. */
export async function requireCurrentDesignApproval(projectInput:string,head:Artifact<HeadPayload>,log:readonly ChangeLogEntry[],override?:string):Promise<string>{
 const project=realpathSync(projectInput),path=artifactJsonPath(project,head.id),raw=readDesignFile(project,path),hash=createHash('sha256').update(raw).digest('hex');
 if(override?.trim())return hash;
 const reject=(why:string):never=>{throw new ReviewRequiredError(`${head.id}: ${why}; review the current design or explicitly approve with an override`);};
 if(designArtifactActive(project,head.id))reject('design review is active');
 const rv=head.lifecycle.review,ref=rv?.report;
 if(!rv||!ref||ref.type!=='change-log-entry'||ref.relation!=='reviews'||ref.entityId!==head.id||!ref.fragment)reject('no permanent design-review reference');
 const entry=log.find(e=>e.id===ref!.fragment);
 if(!entry||entry.operation!=='review'||(entry.outcome?.data as {kind?:unknown}|undefined)?.kind!=='design-chunk-review')reject('missing new-format review history');
 const record=validatePermanentDesignReview(entry!.outcome!.data,{project,artifactId:head.id}),report=record.attempts.at(-1)!.report!;
 if(report.status!=='passed'||report.counts.HIGH||report.counts.MED)reject(`review is ${report.status}`);
 const prepared=prepareDesignSubject(project,path),revision=head.lifecycle.revision;
 if(record.reviewer!==prepared.subject.reviewer||record.binding.author===record.reviewer||rv!.party!==record.reviewer||entry!.actor.id!==rv!.reviewer.id)reject('review is not independently bound to the current author');
 if(record.binding.sourceRevision.number!==revision.number||record.binding.sourceRevision.contentHash!==(revision.contentHash||contentHash(head.description,head.payload))||rv!.revision!==revision.number)reject('review revision is stale');
 if(record.binding.documentDigest!==prepared.baseline.subjectFingerprints.document||record.binding.workflowDigest!==designWorkflowDigest(prepared.subject.workflow))reject('document or workflow context changed');
 if(entry!.targetHeadHash!==hash||rv!.verdict!=='pass'||(['HIGH','MED','LOW'] as const).some(k=>rv!.counts[k]!==report.counts[k]))reject('reviewed head or compact evidence changed');
 const latest=admissions(log,project,head.id).sort((a,b)=>b.ordinal-a.ordinal)[0];
 if(!latest||latest.reviewId!==record.reviewId||latest.attempt!==record.applicableAttempt||latest.contentIdentity!==record.binding.reviewedContentIdentity)reject('a later or untracked review admission has no applicable completed publication');
 const cp=await loadDesignCheckpoint(project,record.reviewId);
 if(cp){const a=cp.attempts.at(-1)!;if(a.number!==record.applicableAttempt||a.status!=='passed'||a.publication?.state!=='complete'||a.publication.artifactHistoryEntryId!==entry!.id||designPreservationDigest(cp)!==record.preservationDigest)reject('latest review work is unfinished or not preserved');}
 return hash;
}
