/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { DESIGN_LIMITS, DesignPlanSchema, DesignResultSchema, DesignReportSchema, decodeDesign, requireDesign } from './contracts.js';
import type { DesignChunkPlan, DesignChunk, DesignChunkResult, DesignReviewInventory, DesignReviewSubject, DesignReviewConsolidated } from './contracts.js';

export function validateDesignPlan(input: unknown, inventory: DesignReviewInventory): DesignChunkPlan {
 const plan=decodeDesign(DesignPlanSchema,input,DESIGN_LIMITS.requestBytes);
 const units=new Set(inventory.units.map(u=>u.id)), chunks=new Map(plan.chunks.map(c=>[c.id,c]));
 requireDesign(chunks.size===plan.chunks.length,'invalid_plan','Duplicate chunk ids');
 const finals=plan.chunks.filter(c=>c.purpose==='consistency');
 requireDesign(finals.length===1&&finals[0]!.id===plan.finalConsistencyChunkId&&plan.chunks.at(-1)===finals[0], 'invalid_plan','Exactly one final consistency chunk must be last');
 const seen=new Set<string>();
 for(const chunk of plan.chunks) {
  requireDesign(chunk.concerns.length>0,'invalid_plan',`Chunk ${chunk.id} has no review concerns`);
  requireDesign(new Set(chunk.selectors).size===chunk.selectors.length&&chunk.selectors.every(s=>units.has(s)),'invalid_plan',`Unknown/duplicate selectors in ${chunk.id}`);
  requireDesign(new Set(chunk.dependsOn).size===chunk.dependsOn.length&&chunk.dependsOn.every(d=>seen.has(d)),'invalid_plan',`Dependencies of ${chunk.id} must precede it`);
  if(chunk.purpose==='substantive')requireDesign(chunk.selectors.length>0,'invalid_plan',`Substantive chunk ${chunk.id} has no units`);
  seen.add(chunk.id);
 }
 const final=finals[0]!;
 for(const chunk of plan.chunks) if(chunk.purpose==='substantive')requireDesign(final.dependsOn.includes(chunk.id),'invalid_plan',`Final check does not depend on ${chunk.id}`);
 const covered=new Set<string>();
 for(const row of plan.coverage) {
  requireDesign(units.has(row.unitId)&&!covered.has(row.unitId),'invalid_plan',`Unknown/duplicate coverage unit ${row.unitId}`);
  requireDesign(new Set(row.chunkIds).size===row.chunkIds.length,'invalid_plan','Duplicate chunk coverage');
  for(const id of row.chunkIds) {
   const chunk=chunks.get(id);
   requireDesign(chunk?.purpose==='substantive'&&chunk.selectors.includes(row.unitId),'invalid_plan',`Unit ${row.unitId} lacks matching substantive coverage`);
  }
  covered.add(row.unitId);
 }
 requireDesign(covered.size===units.size,'invalid_plan','Plan omits required inventory units');
 for(const chunk of plan.chunks) if(chunk.purpose==='substantive') for(const unit of chunk.selectors)
  requireDesign(plan.coverage.some(r=>r.unitId===unit&&r.chunkIds.includes(chunk.id)),'invalid_plan',`Selector ${unit} lacks coverage mapping`);
 return plan;
}

/** Structural/coverage checks cannot certify semantic truth; that remains the independent reviewer's assessment. */
export function assessDesignResult(input: unknown, chunk: DesignChunk, previous: readonly DesignChunkResult[], requiredReferences: readonly string[] = []): DesignChunkResult {
 const result=decodeDesign(DesignResultSchema,input,DESIGN_LIMITS.resultBytes);
 requireDesign(result.chunkId===chunk.id,'invalid_result','Result is not for the current chunk');
 const ids=new Set(previous.flatMap(r=>r.findings.map(f=>f.id)));
 for(const finding of result.findings) {
  requireDesign(!ids.has(finding.id),'invalid_result',`Finding id ${finding.id} is already used`);ids.add(finding.id);
 }
 const missing=[...new Set([...chunk.selectors,...requiredReferences])].filter(s=>!result.inspectedReferences.includes(s)&&!result.limitations.some(l=>l.includes(s)));
 for(const selector of missing)result.limitations.push(`Required coverage not reported: ${selector}`);
 const blocking=result.findings.some(f=>f.severity==='HIGH'||f.severity==='MED');
 const expected=result.limitations.length?'incomplete':blocking?'changes_requested':'passed';
 if(missing.length)result.status='incomplete';
 requireDesign(result.status===expected,'invalid_result',`Status contradicts findings or mandatory verification limits: received ${result.status}, expected ${expected}; limitations=${result.limitations.length}, HIGH/MED=${result.findings.filter(f=>f.severity==='HIGH'||f.severity==='MED').length}`);
 return result;
}
export function consolidateDesignReview(reviewId: string, attempt: number, subject: DesignReviewSubject, contentIdentity: string, plan: DesignChunkPlan, results: readonly DesignChunkResult[]): DesignReviewConsolidated {
 const ids=new Set(results.map(r=>r.chunkId));
 requireDesign(ids.size===plan.chunks.length&&results.length===plan.chunks.length&&plan.chunks.every(c=>ids.has(c.id)),'incomplete_review','Every planned chunk must have an accepted result');
 const counts={HIGH:0,MED:0,LOW:0};const findings=new Set<string>();
 for(const result of results)for(const finding of result.findings){requireDesign(!findings.has(finding.id),'invalid_result','Finding ids must be unique');findings.add(finding.id);counts[finding.severity]++;}
 const status=results.some(r=>r.status==='incomplete')?'incomplete':counts.HIGH||counts.MED?'changes_requested':'passed';
 return decodeDesign(DesignReportSchema,{reviewId,attempt,artifactId:subject.artifactId,status,counts,chunks:results,limitations:results.flatMap(r=>r.limitations),reviewer:subject.reviewer,reviewedContentIdentity:contentIdentity});
}
