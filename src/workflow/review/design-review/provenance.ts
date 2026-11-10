/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { DESIGN_AGGREGATE_LIMITS, DESIGN_LIMITS, DesignResultSchema, decodeDesign, requireDesign } from './contracts.js';
import type { DesignAttempt, DesignChunk, DesignChunkResult, DesignImpactAssessment, DesignFindingOrigin } from './contracts.js';

export const designFindingKey=(origin:DesignFindingOrigin):string=>JSON.stringify([origin.attempt,origin.chunkId,origin.findingId]);
/** Effective findings include unresolved carried origins, even when the overall report is incomplete. */
export function effectiveDesignFindingOrigins(history:readonly DesignAttempt[],baselineAttempt:number):DesignFindingOrigin[]{
 const baseline=history.find(a=>a.number===baselineAttempt);
 requireDesign(baseline?.report,'invalid_checkpoint','Comparison attempt has no accepted report');
 requireDesign(!baseline.impact||baseline.report.impact,'invalid_checkpoint','Impact report lacks effective finding provenance');
 const origins=baseline.report.impact?.effectiveFindingOrigins??baseline.completedChunks.flatMap(r=>r.findings.map(f=>({attempt:baselineAttempt,chunkId:r.chunkId,findingId:f.id})));
 requireDesign(origins.length<=DESIGN_AGGREGATE_LIMITS.findings&&new Set(origins.map(designFindingKey)).size===origins.length,'invalid_checkpoint','Effective findings exceed bounds or contain duplicate origins');
 for(const origin of origins){
  const a=history.find(a=>a.number===origin.attempt);
  requireDesign(origin.attempt>0&&origin.attempt<=baselineAttempt&&a?.completedChunks.some(r=>r.chunkId===origin.chunkId&&r.findings.some(f=>f.id===origin.findingId)),'invalid_checkpoint','Effective finding origin does not resolve to accepted feedback');
 }
 return origins.map(o=>({...o}));
}

export interface DesignResolvedCoverage {
 readonly attempt: number;
 readonly chunk: DesignChunk;
 readonly result: DesignChunkResult;
}
/** History comes only from the owner checkpoint. Never accept result bodies from a candidate. */
export function resolveDesignCoverage(history: readonly DesignAttempt[], fromAttempt: number, fromChunkId: string,
 beforeAttempt: number, reviewer: DesignAttempt['reviewer'], errorCode = 'invalid_result'): DesignResolvedCoverage {
 requireDesign(history.length <= DESIGN_LIMITS.attempts && history.every((a,i)=>Number.isSafeInteger(a.number)&&a.number>=1&&a.number<=DESIGN_LIMITS.attempts&&(i===0||history[i-1]!.number<a.number)), 'invalid_checkpoint', 'Trusted qualified attempt history is not ordered and unique');
 let limit=beforeAttempt,number=fromAttempt,chunkId=fromChunkId;
 const seen=new Set<string>();
 for(let depth=0;depth<DESIGN_LIMITS.attempts;depth++){
  const key=JSON.stringify([number,chunkId]);
  requireDesign(Number.isSafeInteger(number)&&number>0&&number<limit&&!seen.has(key),errorCode,'Coverage origin must refer strictly backward without cycles');seen.add(key);
  const source=history.find(a=>a.number===number);
  requireDesign(source&&source.number===number&&source.plan&&source.report&&['passed','changes_requested','incomplete'].includes(source.status),errorCode,'Coverage origin has no complete accepted source attempt');
  const root=history.find(a=>a.report)?.report;
  requireDesign(root&&source.report.reviewId===root.reviewId&&source.report.artifactId===root.artifactId&&source.report.attempt===number&&source.report.reviewedContentIdentity===source.baseline.contentIdentity,errorCode,'Coverage origin belongs to a foreign report or baseline');
  requireDesign(reviewer!==undefined&&source.reviewer===reviewer,errorCode,'Coverage origin belongs to another or unknown reviewer party');
  const chunks=source.plan.chunks.filter(c=>c.id===chunkId),results=source.completedChunks.filter(r=>r.chunkId===chunkId);
  requireDesign(chunks.length===1&&chunks[0]!.purpose==='substantive',errorCode,'Coverage origin must name one substantive source chunk');
  const links=source.impact?.retainedCoverage.filter(r=>r.chunkId===chunkId)??[];
  requireDesign(results.length+links.length===1,errorCode,'Coverage origin is missing, duplicated or both fresh and retained');
  if(results.length){
   const result=results[0]!;
   // A trusted source containing malformed feedback is state corruption, not a new model-output retry.
   try{decodeDesign(DesignResultSchema,result,DESIGN_LIMITS.resultBytes);}catch{requireDesign(false,'invalid_checkpoint','Stored coverage result is malformed or oversized');}
   requireDesign((result.status==='passed'||result.status==='changes_requested')&&result.limitations.length===0,errorCode,'Incomplete coverage cannot be retained');
   return{attempt:number,chunk:chunks[0]!,result};
  }
  const link=links[0]!;
  limit=number;number=link.fromAttempt;chunkId=link.fromChunkId;
 }
 requireDesign(false,errorCode,'Coverage provenance exceeds attempt bound');
}

/** Check the immediately preceding mapped coverage first: an older pass cannot bypass a newer gap. */
export function validateDesignRetainedSource(history:readonly DesignAttempt[],baselineAttempt:number,priorChunkId:string,
 retained:DesignImpactAssessment['retainedCoverage'][number],current:Pick<DesignAttempt,'number'|'reviewer'>,errorCode='invalid_result'):DesignResolvedCoverage {
 const baseline=resolveDesignCoverage(history,baselineAttempt,priorChunkId,current.number,current.reviewer,errorCode);
 const candidate=resolveDesignCoverage(history,retained.fromAttempt,retained.fromChunkId,current.number,current.reviewer,errorCode);
 requireDesign(baseline.attempt===candidate.attempt&&baseline.chunk.id===candidate.chunk.id,errorCode,'Retained source bypasses the immediately preceding mapped coverage');
 return candidate;
}
