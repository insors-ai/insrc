/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { FileSidecarStore } from '../../artifact-core/sidecar-store.js';
import type { ChangeLogEntry } from '../../artifact-core/types.js';
import { designArtifactLocator } from './subject.js';
import { validatePermanentDesignReview } from './history.js';
import type { PermanentDesignReview } from './history.js';
import type { DesignFinding, DesignReviewCheckpoint } from './contracts.js';
import { requireDesign } from './contracts.js';

export function permanentDesignCheckpoint(project:string,artifactPath:string,reviewId:string,attempt:number):{checkpoint:DesignReviewCheckpoint;entryId:string}{
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
 return {entryId:selected.entryId,checkpoint:{schemaVersion:1,reviewId:r.reviewId,project:r.project,artifactId:r.artifactId,subject:r.subject,submitted:r.submitted,attempts:r.attempts.slice(0,attempt)}};
}
export interface DesignFindingView {readonly attempt:number;readonly chunkId:string;readonly finding:DesignFinding;}
export function designFindingViews(record:PermanentDesignReview):readonly DesignFindingView[]{
 const a=record.attempts[record.applicableAttempt-1]!;
 const origins=a.report!.impact?.effectiveFindingOrigins??a.completedChunks.flatMap(r=>r.findings.map(f=>({attempt:a.number,chunkId:r.chunkId,findingId:f.id})));
 return origins.map(o=>({attempt:o.attempt,chunkId:o.chunkId,finding:record.attempts[o.attempt-1]!.completedChunks.find(c=>c.chunkId===o.chunkId)!.findings.find(f=>f.id===o.findingId)!}));
}
/** Current report prose for existing tracker/CLI surfaces; never synthesizes legacy claims. */
export function renderPermanentDesignReview(record:PermanentDesignReview):string{
 const a=record.attempts[record.applicableAttempt-1]!,r=a.report!;
 const lines=[`## Design review — ${r.status}`,`Attempt ${a.number} · ${r.reviewer} · ${r.counts.HIGH} HIGH, ${r.counts.MED} MED, ${r.counts.LOW} LOW`];
 for(const c of r.chunks)lines.push(`### ${c.chunkId}`,c.summary,...c.limitations.map(l=>`- Verification gap: ${l}`),...c.advice.map(l=>`- Advice: ${l}`));
 for(const f of designFindingViews(record))lines.push(`- **${f.finding.severity}** ${f.finding.message} (${f.finding.location}; attempt ${f.attempt}, ${f.chunkId})`);
 return lines.join('\n\n')+'\n';
}
