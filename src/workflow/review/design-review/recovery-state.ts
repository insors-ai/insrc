import { randomUUID } from 'node:crypto';
import { DESIGN_LIMITS, requireDesign } from './contracts.js';
import type { DesignAttempt, DesignChunk, DesignUnitState } from './contracts.js';
import { validateDesignPlan } from './results.js';
import { qualifiedDesignAction } from './action-state.js';

/** Fresh execution order filters the full plan; retained coverage is never fabricated as fresh feedback. */
export function selectedDesignChunks(attempt:DesignAttempt):readonly DesignChunk[]{
 if(!attempt.plan){requireDesign(!attempt.impact&&attempt.completedChunks.length===0,'invalid_checkpoint','Feedback/impact has no accepted plan');return[];}
 try{validateDesignPlan(attempt.plan,attempt.inventory);}catch{requireDesign(false,'invalid_checkpoint','Accepted review plan is invalid');}
 requireDesign((attempt.preparationKind??'planning')==='impact'?!!attempt.impact:!attempt.impact,'invalid_checkpoint','Preparation kind disagrees with accepted plan/impact');
 if(!attempt.impact)return attempt.plan.chunks;
 const impact=attempt.impact,selected=[...impact.directChunkIds,...impact.indirectChunkIds,...impact.consistencyChunkIds],retained=impact.retainedCoverage.map(r=>r.chunkId),ids=attempt.plan.chunks.map(c=>c.id);
 requireDesign(new Set([...selected,...retained]).size===ids.length&&selected.length+retained.length===ids.length&&[...selected,...retained].every(id=>ids.includes(id)),'invalid_checkpoint','Selected and retained coverage must partition the complete plan');
 requireDesign(attempt.plan.chunks.every(c=>c.purpose==='consistency'?impact.consistencyChunkIds.includes(c.id)&&!retained.includes(c.id):!impact.consistencyChunkIds.includes(c.id)),'invalid_checkpoint','Consistency must be selected fresh');
 requireDesign(impact.mode!=='full'||retained.length===0,'invalid_checkpoint','Full review cannot retain chunks');
 return attempt.plan.chunks.filter(c=>selected.includes(c.id));
}

/** Accepted feedback is a selected execution prefix, never an instruction to rerun it. */
export function nextDesignUnit(attempt:DesignAttempt):{chunk?:DesignChunk|undefined;preparationKind?:'planning'|'impact'|undefined}|undefined {
 const chunks=selectedDesignChunks(attempt);
 if(!attempt.plan)return{preparationKind:attempt.preparationKind??'planning'};
 requireDesign(attempt.completedChunks.every((result,i)=>chunks[i]?.id===result.chunkId),'invalid_checkpoint','Completed feedback is not a selected plan prefix');
 const chunk=chunks[attempt.completedChunks.length];return chunk?{chunk}:undefined;
}

/** Call only inside a durable admission/commit, before dispatch. */
export function reserveDesignUnit(attempt:DesignAttempt,chunk?:DesignChunk,allowExtra=false,recovering=false,preparationKind:'planning'|'impact'='planning'):string {
 if(!chunk)requireDesign(preparationKind===(attempt.preparationKind??'planning'),'invalid_checkpoint','Reservation preparation kind disagrees with admitted attempt');
 else requireDesign(nextDesignUnit(attempt)?.chunk?.id===chunk.id,'invalid_checkpoint','Reservation must name the next selected chunk');
 const phase=chunk?'chunk_review':preparationKind,unitId=chunk?.id??preparationKind,kind=chunk?'chunk':preparationKind;
 const sealed=attempt.unitSummaries?.some(s=>s.phase===phase&&s.unitId===unitId);
 requireDesign(!sealed,'immutable_history','Cannot dispatch a sealed completed unit');
 let previous=attempt.unit?.phase===phase&&attempt.unit.unitId===unitId?attempt.unit:undefined;
 // An interrupted S1 execution already spent its initial dispatch even though S1 had no unit counters.
 if(recovering&&!previous&&!attempt.unit&&(attempt.current?.kind===kind&&attempt.current.chunkId===chunk?.id||attempt.status==='interrupted'||attempt.status==='running')){
  previous={unitId,phase,executionId:attempt.current?.executionId??randomUUID(),dispatches:1,retriesUsed:0,userDirectedDispatches:0,diagnostics:[]};
 }
 const unit:DesignUnitState=previous?structuredClone(previous):{unitId,phase,executionId:randomUUID(),dispatches:1,retriesUsed:0,userDirectedDispatches:0,diagnostics:[]};
 if(previous){
  if(previous.dispatches<DESIGN_LIMITS.automaticDispatches){requireDesign(!allowExtra,'invalid_decision','Extra execution direction is only valid after exhaustion');unit.dispatches++;unit.retriesUsed++;}
  else{requireDesign(allowExtra,'retry_budget_exhausted','Automatic retry budget exhausted; user direction is required');unit.userDirectedDispatches++;}
 }else requireDesign(!allowExtra,'invalid_decision','No exhausted unit to retry');
 unit.executionId=randomUUID();attempt.unit=unit;
 attempt.current={kind,executionId:unit.executionId,sequence:0,issuedAt:new Date().toISOString(),...(chunk?{chunkId:chunk.id}:{})};
 return unit.executionId;
}

export function sealDesignUnit(attempt:DesignAttempt):void {
 const unit=attempt.unit;requireDesign(unit,'invalid_checkpoint','Completed unit has no dispatch reservation');
 const summaries=attempt.unitSummaries??=[];
 requireDesign(!summaries.some(s=>s.unitId===unit.unitId&&s.phase===unit.phase),'immutable_history','Unit is already sealed');
 const linked=new Set(summaries.flatMap(s=>s.actionIds));
 const actionIds=(attempt.actions??[]).filter(a=>qualifiedDesignAction(a)&&a.operation==='resume'&&!linked.has(a.actionId)).map(a=>a.actionId);
 summaries.push({unitId:unit.unitId,phase:unit.phase,automaticDispatches:unit.dispatches,retriesUsed:unit.retriesUsed,userDirectedDispatches:unit.userDirectedDispatches,diagnostics:structuredClone(unit.diagnostics),actionIds});
 // A user-directed dispatch has one durable outcome, separate from the exhausted automatic budget.
 const action=[...(attempt.actions??[])].reverse().find(a=>a.userDecision?.action==='retry_failed_unit'&&!a.outcome);
 if(unit.userDirectedDispatches&&action)action.outcome={code:'completed',summary:'Unit feedback accepted'};
}
