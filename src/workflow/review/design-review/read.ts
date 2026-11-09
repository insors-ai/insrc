/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { FileSidecarStore } from '../../artifact-core/sidecar-store.js';
import type { ChangeLogEntry } from '../../artifact-core/types.js';
import { designArtifactLocator } from './subject.js';
import { validatePermanentDesignReview, storedDesignCheckpointFromRecord } from './history.js';
import type { PermanentDesignReview } from './history.js';
import type { DesignFinding, DesignReviewCheckpoint, StoredDesignCheckpoint } from './contracts.js';
import { requireDesign, isDesignAdmission } from './contracts.js';

export function permanentDesignCheckpoint(project:string,artifactPath:string,reviewId:string,attempt:number):{checkpoint:DesignReviewCheckpoint;entryId:string}{
 const found=permanentStoredDesignCheckpoint(project,artifactPath,reviewId,attempt);
 requireDesign(found.checkpoint.schemaVersion===1,'unsupported_checkpoint','Admission history requires a version-2-aware consumer');
 return {checkpoint:found.checkpoint,entryId:found.entryId};
}
export function permanentStoredDesignCheckpoint(project:string,artifactPath:string,reviewId:string,attempt:number):{checkpoint:StoredDesignCheckpoint;entryId:string}{
 const locator=designArtifactLocator(project,artifactPath),artifactId=locator.id;
 const entries=new FileSidecarStore(project).readRecordsSync<ChangeLogEntry>('log',artifactId);
 const candidates=entries.filter(e=>{
  const d=e.outcome?.data as {kind?:unknown;reviewId?:unknown;applicableAttempt?:unknown}|undefined;
  return e.operation==='review'&&d?.kind==='design-chunk-review'&&d.reviewId===reviewId&&typeof d.applicableAttempt==='number'&&d.applicableAttempt>=attempt;
 });
 let selected:{record:PermanentDesignReview;entryId:string}|undefined;
 for(const entry of candidates){const record=validatePermanentDesignReview(entry.outcome?.data,{project,artifactId:artifactId});if(!selected||record.applicableAttempt>selected.record.applicableAttempt)selected={record,entryId:entry.id};}
 requireDesign(selected,'missing_review_history','Requested review/attempt has no permanent history on this artifact');
 const r=selected.record;
 requireDesign(r.subject.canonicalPath===locator.loaded.path&&(!locator.suppliedDocument||r.subject.documentPath===locator.suppliedDocument),'foreign_review','Artifact locator does not match stored subject');
 const cp=storedDesignCheckpointFromRecord(r);
 requireDesign(cp.attempts.some(a=>a.number===attempt),'missing_attempt','Requested attempt is absent from preserved history');
 const attempts=cp.attempts.filter(a=>a.number<=attempt);
 if(cp.schemaVersion===2&&attempts.every(isDesignAdmission))return{entryId:selected.entryId,checkpoint:{schemaVersion:2,project:cp.project,reviewId:cp.reviewId,attempts}};
 return {entryId:selected.entryId,checkpoint:{...cp,attempts} as StoredDesignCheckpoint};
}
export interface DesignFindingView {readonly attempt:number;readonly chunkId:string;readonly finding:DesignFinding;}
export function designFindingViews(record:PermanentDesignReview):readonly DesignFindingView[]{
 const a=record.attempts.find(a=>a.number===record.applicableAttempt)!;
 const origins=a.report!.impact?.effectiveFindingOrigins??a.completedChunks.flatMap(r=>r.findings.map(f=>({attempt:a.number,chunkId:r.chunkId,findingId:f.id})));
 return origins.map(o=>({attempt:o.attempt,chunkId:o.chunkId,finding:record.attempts.find(a=>a.number===o.attempt)!.completedChunks.find(c=>c.chunkId===o.chunkId)!.findings.find(f=>f.id===o.findingId)!}));
}
/** Current report prose for existing tracker/CLI surfaces; never synthesizes legacy claims. */
export function renderPermanentDesignReview(record:PermanentDesignReview):string{
 const a=record.attempts.find(a=>a.number===record.applicableAttempt)!,r=a.report!;
 const lines=[`## Design review — ${r.status}`,`Attempt ${a.number} · ${r.reviewer} · ${r.counts.HIGH} HIGH, ${r.counts.MED} MED, ${r.counts.LOW} LOW`];
 if(record.schemaVersion===2)for(const failure of record.admissionFailures)lines.push(`Attempt ${failure.number}: technical admission ${failure.status}; no chunk assessment. ${failure.error?`${failure.error.code} (${failure.error.field}): ${failure.error.summary}`:'Admission interrupted.'}`);
 for(const c of r.chunks)lines.push(`### ${c.chunkId}`,c.summary,...c.limitations.map(l=>`- Verification gap: ${l}`),...c.advice.map(l=>`- Advice: ${l}`));
 for(const f of designFindingViews(record))lines.push(`- **${f.finding.severity}** ${f.finding.message} (${f.finding.location}; attempt ${f.attempt}, ${f.chunkId})`);
 return lines.join('\n\n')+'\n';
}
