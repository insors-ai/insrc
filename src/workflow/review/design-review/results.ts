/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { DESIGN_LIMITS, DesignPlanSchema, designChunkResultSchema, allowsDesignFindingDecisions, DesignReportSchema, DesignImpactOutputSchema, decodeDesign, requireDesign } from './contracts.js';
import type { DesignChunkPlan, DesignChunk, DesignChunkResult, DesignReviewInventory, DesignReviewSubject, DesignReviewConsolidated, DesignAttempt, DesignImpactAssessment, DesignFindingOrigin, DesignReportImpact } from './contracts.js';
import { designFindingKey, effectiveDesignFindingOrigins, validateDesignRetainedSource, resolveDesignCoverage } from './provenance.js';

const equalIds=(a:readonly string[],b:readonly string[])=>a.length===b.length&&new Set(a).size===a.length&&new Set(b).size===b.length&&a.every(x=>b.includes(x));

/** Live acceptance and stored-report verification must require the same evidence. */
export function designRequiredReferences(subject:DesignReviewSubject,chunk:DesignChunk,checkpointPath:string):readonly string[]{
 return[subject.documentPath,...(chunk.purpose==='consistency'?[checkpointPath]:[])];
}

/** Validate structural claims; semantic impact assessment belongs to the independent reviewer. */
export function validateDesignImpact(input:unknown,current:DesignAttempt,history:readonly DesignAttempt[]):{plan:DesignChunkPlan;impact:DesignImpactAssessment}{
 requireDesign(current.preparationKind==='impact','invalid_checkpoint','Impact output requires an admitted impact attempt');
 requireDesign(history.length===current.number-1&&history.every((a,i)=>a.number===i+1),'invalid_checkpoint','Comparison history must be the immutable prior prefix');
 const baseline=history.at(-1);
 requireDesign(baseline?.report&&['passed','changes_requested','incomplete'].includes(baseline.status)&&baseline.report.status===baseline.status,'invalid_checkpoint','Impact comparison requires the immediately preceding complete report');
 const candidate=decodeDesign(DesignImpactOutputSchema,input,DESIGN_LIMITS.requestBytes),plan=validateDesignPlan(candidate.plan,current.inventory),impact=candidate.impact;
 requireDesign(impact.baselineAttempt===baseline.number,'invalid_plan','Impact must compare the immediately preceding attempt');
 const full=!!impact.uncertainReason||!baseline.plan||!current.reviewer||baseline.reviewer!==current.reviewer;
 requireDesign(!full||impact.mode==='full','invalid_plan','Uncertainty or unusable comparison context requires explicit full mode');
 const chunks=new Map(plan.chunks.map(c=>[c.id,c])),prior=new Map(baseline.plan?.chunks.map(c=>[c.id,c])??[]);
 const substantive=plan.chunks.filter(c=>c.purpose==='substantive').map(c=>c.id),consistency=plan.chunks.filter(c=>c.purpose==='consistency').map(c=>c.id);
 const selected=[...impact.directChunkIds,...impact.indirectChunkIds],retained=impact.retainedCoverage.map(r=>r.chunkId);
 requireDesign(new Set(selected).size===selected.length&&selected.every(id=>chunks.get(id)?.purpose==='substantive'),'invalid_plan','Selected substantive IDs are unknown or overlapping');
 requireDesign(new Set(retained).size===retained.length&&retained.every(id=>chunks.get(id)?.purpose==='substantive'&&!selected.includes(id)),'invalid_plan','Retained IDs are unknown, duplicate or selected');
 requireDesign(equalIds([...selected,...retained],substantive)&&equalIds(impact.consistencyChunkIds,consistency),'invalid_plan','Impact must cover all substantive chunks and select fresh consistency');
 if(impact.mode==='full')requireDesign(retained.length===0&&equalIds(selected,substantive),'invalid_plan','Full mode must select the whole current plan');
 const priorSeen=new Set<string>(),currentSeen=new Set<string>();
 for(const row of impact.chunkMapping){
  requireDesign(row.priorIds.length+row.currentIds.length>0,'invalid_plan','Mapping cannot have two empty sides');
  for(const id of row.priorIds){requireDesign(prior.has(id)&&!priorSeen.has(id),'invalid_plan','Mapping has unknown or repeated prior ID');priorSeen.add(id);}
  for(const id of row.currentIds){requireDesign(chunks.has(id)&&!currentSeen.has(id),'invalid_plan','Mapping has unknown or repeated current ID');currentSeen.add(id);}
 }
 requireDesign(substantive.every(id=>currentSeen.has(id))&&[...prior.values()].filter(c=>c.purpose==='substantive').every(c=>priorSeen.has(c.id)),'invalid_plan','Mapping must explain current and prior substantive scope');
 for(const ref of impact.retainedCoverage){
  const row=impact.chunkMapping.find(m=>m.currentIds.includes(ref.chunkId));
  requireDesign(row?.priorIds.length===1&&row.currentIds.length===1,'invalid_plan','Retention requires a one-to-one mapped source');
  const old=prior.get(row.priorIds[0]!)!,now=chunks.get(ref.chunkId)!;
  requireDesign(old.purpose==='substantive'&&equalIds(old.selectors,now.selectors)&&equalIds(old.concerns,now.concerns),'invalid_plan','Retained selectors and concerns must match');
  const dependencies=old.dependsOn.map(id=>{const mapping=impact.chunkMapping.find(m=>m.priorIds.includes(id));requireDesign(mapping?.priorIds.length===1&&mapping.currentIds.length===1,'invalid_plan','Retained dependency lacks one-to-one compatibility');return mapping.currentIds[0]!;});
  requireDesign(equalIds(dependencies,now.dependsOn),'invalid_plan','Retained dependencies changed incompatibly');
  validateDesignRetainedSource(history,baseline.number,old.id,ref,current);
 }
 const expected=effectiveDesignFindingOrigins(history,baseline.number).map(designFindingKey);
 requireDesign(equalIds(impact.carriedFindingIds,expected),'invalid_plan','Impact must carry every known effective finding origin');
 return{plan,impact};
}

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
export function assessDesignResult(input: unknown, chunk: DesignChunk, previous: readonly DesignChunkResult[], requiredReferences: readonly string[] = [], impactContext?:{attempt:DesignAttempt;history:readonly DesignAttempt[]}): DesignChunkResult {
 const result=decodeDesign(designChunkResultSchema(chunk,impactContext?.attempt),input,DESIGN_LIMITS.resultBytes);
 requireDesign(result.chunkId===chunk.id,'invalid_result','Result is not for the current chunk');
 const ids=new Set(impactContext?[]:previous.flatMap(r=>r.findings.map(f=>f.id)));
 for(const finding of result.findings) {
  requireDesign(!ids.has(finding.id),'invalid_result',`Finding id ${finding.id} is already used`);ids.add(finding.id);
 }
 requireDesign(result.findings.length===0||result.inspectedReferences.length>0,'invalid_result','Findings must rest on at least one inspected reference; a result that inspected nothing cannot carry findings');
 const missing=[...new Set([...chunk.selectors,...requiredReferences])].filter(s=>!result.inspectedReferences.includes(s)&&!result.limitations.some(l=>l.includes(s)));
 for(const selector of missing)result.limitations.push(`Required coverage not reported: ${selector}`);
 const before=result.limitations.length;
 reconcileDesignFindings(result,chunk,previous,impactContext);
 const blocking=result.findings.some(f=>f.severity==='HIGH'||f.severity==='MED');
 const expected=result.limitations.length?'incomplete':blocking?'changes_requested':'passed';
 if(missing.length||result.limitations.length>before)result.status='incomplete';
 requireDesign(result.status===expected,'invalid_result',`Status contradicts findings or mandatory verification limits: received ${result.status}, expected ${expected}; limitations=${result.limitations.length}, HIGH/MED=${result.findings.filter(f=>f.severity==='HIGH'||f.severity==='MED').length}`);
 return result;
}
function reconcileDesignFindings(result:DesignChunkResult,chunk:DesignChunk,previous:readonly DesignChunkResult[],context?:{attempt:DesignAttempt;history:readonly DesignAttempt[]}):void{
 const final=allowsDesignFindingDecisions(chunk,context?.attempt);
 requireDesign(result.findingDecisions===undefined||final,'invalid_result','Finding decisions are allowed only on an impact final consistency chunk');
 if(!final||!context)return;
 const {attempt,history}=context,origins=effectiveDesignFindingOrigins(history,attempt.impact!.baselineAttempt),known=new Set(origins.map(designFindingKey));
 const seen=new Set<string>(),fresh=[...previous,result];
 // Reconciliation omissions carry their findings and keep the report incomplete;
 // they are not missing inspection of another finding assessed by this chunk.
 const decided=new Set((result.findingDecisions??[]).map(d=>designFindingKey(d.source)));
 const reconciliationGaps=new Set(origins.filter(o=>!decided.has(designFindingKey(o))).map(o=>`Required finding reconciliation not reported: ${designFindingKey(o)}`));
 for(const decision of result.findingDecisions??[]){
  const key=designFindingKey(decision.source);
  requireDesign(known.has(key)&&!seen.has(key),'invalid_result','Unknown or duplicate finding decision source');seen.add(key);
  if(decision.action==='carry')continue;
  requireDesign(decision.reviewedInChunkIds.every(id=>fresh.some(r=>r.chunkId===id&&r.inspectedReferences.length>0&&(r.status!=='incomplete'&&r.limitations.length===0||r===result&&r.limitations.length>0&&r.limitations.every(l=>reconciliationGaps.has(l))))),'invalid_result','Resolution requires accepted fresh inspection without mandatory gaps');
  for(const retained of attempt.impact!.retainedCoverage){
   const source=resolveDesignCoverage(history,retained.fromAttempt,retained.fromChunkId,attempt.number,attempt.reviewer,'invalid_checkpoint');
   requireDesign(source.attempt!==decision.source.attempt||source.chunk.id!==decision.source.chunkId,'invalid_result','A finding in retained-only coverage must carry until its owning chunk is freshly selected');
  }
  if(decision.action==='superseded')requireDesign(fresh.some(r=>r.chunkId===decision.supersededBy.chunkId&&r.findings.some(f=>f.id===decision.supersededBy.findingId)),'invalid_result','Superseded finding must identify an accepted current replacement');
 }
 const omitted=origins.filter(o=>!seen.has(designFindingKey(o)));
 for(const origin of omitted){const limit=`Required finding reconciliation not reported: ${designFindingKey(origin)}`;if(!result.limitations.includes(limit))result.limitations.push(limit);}
}

export function consolidateDesignReview(reviewId: string, attempt: number, subject: DesignReviewSubject, contentIdentity: string, plan: DesignChunkPlan, results: readonly DesignChunkResult[],impactContext?:{impact:DesignImpactAssessment;attempts:readonly DesignAttempt[]}): DesignReviewConsolidated {
 if(impactContext)return consolidateImpactReview(reviewId,attempt,subject,contentIdentity,plan,results,impactContext);
 const ids=new Set(results.map(r=>r.chunkId));
 requireDesign(ids.size===plan.chunks.length&&results.length===plan.chunks.length&&plan.chunks.every(c=>ids.has(c.id)),'incomplete_review','Every planned chunk must have an accepted result');
 const counts={HIGH:0,MED:0,LOW:0};const findings=new Set<string>();
 for(const result of results)for(const finding of result.findings){requireDesign(!findings.has(finding.id),'invalid_result','Finding ids must be unique');findings.add(finding.id);counts[finding.severity]++;}
 const status=results.some(r=>r.status==='incomplete')?'incomplete':counts.HIGH||counts.MED?'changes_requested':'passed';
 return decodeDesign(DesignReportSchema,{reviewId,attempt,artifactId:subject.artifactId,status,counts,chunks:results,limitations:results.flatMap(r=>r.limitations),reviewer:subject.reviewer,reviewedContentIdentity:contentIdentity});
}

function consolidateImpactReview(reviewId:string,attempt:number,subject:DesignReviewSubject,contentIdentity:string,plan:DesignChunkPlan,results:readonly DesignChunkResult[],context:{impact:DesignImpactAssessment;attempts:readonly DesignAttempt[]}):DesignReviewConsolidated{
 const current=context.attempts[attempt-1],history=context.attempts.slice(0,attempt-1);
 requireDesign(current&&current.number===attempt&&current.reviewer===subject.reviewer&&current.baseline.contentIdentity===contentIdentity&&JSON.stringify(current.impact)===JSON.stringify(context.impact)&&JSON.stringify(current.plan)===JSON.stringify(plan)&&JSON.stringify(current.completedChunks)===JSON.stringify(results),'invalid_checkpoint','Consolidation context differs from accepted attempt');
 try{validateDesignImpact({plan,impact:context.impact},current,history);}catch{requireDesign(false,'invalid_checkpoint','Accepted impact/provenance is inconsistent');}
 const retained=new Set(context.impact.retainedCoverage.map(r=>r.chunkId)),selected=plan.chunks.filter(c=>!retained.has(c.id));
 requireDesign(results.length===selected.length,'incomplete_review','Every selected chunk must have an accepted fresh result');
 requireDesign(results.every((r,i)=>r.chunkId===selected[i]!.id)&&new Set(results.map(r=>r.chunkId)).size===results.length,'invalid_checkpoint','Fresh results do not match selected execution order');
 for(let i=0;i<results.length;i++){
  const assessed=assessDesignResult(results[i],selected[i]!,results.slice(0,i),designRequiredReferences(subject,selected[i]!,current.progress.checkpointPath),{attempt:current,history});
  requireDesign(JSON.stringify(assessed)===JSON.stringify(results[i]),'invalid_checkpoint','Accepted finding reconciliation is incomplete or inconsistent');
 }
 const final=results.find(r=>r.chunkId===plan.finalConsistencyChunkId)!;
 const baseline=effectiveDesignFindingOrigins(history,context.impact.baselineAttempt);
 const decisions=final.findingDecisions??[],dispositions=new Map(decisions.map(d=>[designFindingKey(d.source),d.action]));
 const carried=baseline.filter(o=>!dispositions.has(designFindingKey(o))||dispositions.get(designFindingKey(o))==='carry');
 const effective:DesignFindingOrigin[]=[...carried,...results.flatMap(r=>r.findings.map(f=>({attempt,chunkId:r.chunkId,findingId:f.id})))];
 requireDesign(effective.length<=DESIGN_LIMITS.findings&&new Set(effective.map(designFindingKey)).size===effective.length,'result_too_large','Effective findings exceed bounds or contain duplicate origins');
 const counts={HIGH:0,MED:0,LOW:0};
 for(const origin of effective){const source=context.attempts[origin.attempt-1]?.completedChunks.find(r=>r.chunkId===origin.chunkId)?.findings.find(f=>f.id===origin.findingId);requireDesign(source,'invalid_checkpoint','Effective finding origin is missing');counts[source.severity]++;}
 const impact:DesignReportImpact={baselineAttempt:context.impact.baselineAttempt,mode:context.impact.mode,
  coverageOrigins:plan.chunks.map(c=>{const ref=context.impact.retainedCoverage.find(r=>r.chunkId===c.id);return ref?{...ref,kind:'retained'}:{chunkId:c.id,kind:'fresh'};}),
  findingDecisions:decisions,effectiveFindingOrigins:effective};
 const limitations=results.flatMap(r=>r.limitations),status=limitations.length||results.some(r=>r.status==='incomplete')?'incomplete':counts.HIGH||counts.MED?'changes_requested':'passed';
 return decodeDesign(DesignReportSchema,{reviewId,attempt,artifactId:subject.artifactId,status,counts,chunks:results,limitations,reviewer:subject.reviewer,reviewedContentIdentity:contentIdentity,impact});
}
