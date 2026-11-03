import { randomUUID } from 'node:crypto';
import { DESIGN_LIMITS, requireDesign } from './contracts.js';
import type { DesignAttempt, DesignChunk, DesignUnitState } from './contracts.js';
import { validateDesignPlan } from './results.js';

/** Accepted feedback is a sequential prefix, never an instruction to rerun it. */
export function nextDesignUnit(attempt:DesignAttempt):{chunk?:DesignChunk|undefined}|undefined {
 if(!attempt.plan){requireDesign(attempt.completedChunks.length===0,'invalid_checkpoint','Completed chunks have no accepted plan');return{};}
 validateDesignPlan(attempt.plan,attempt.inventory);
 requireDesign(attempt.completedChunks.every((result,i)=>attempt.plan!.chunks[i]?.id===result.chunkId),'invalid_checkpoint','Completed feedback is not a plan prefix');
 const chunk=attempt.plan.chunks[attempt.completedChunks.length];return chunk?{chunk}:undefined;
}

/** Call only inside a durable admission/commit, before dispatch. */
export function reserveDesignUnit(attempt:DesignAttempt,chunk?:DesignChunk,allowExtra=false,recovering=false):string {
 const phase=chunk?'chunk_review':'planning',unitId=chunk?.id??'planning';
 const sealed=attempt.unitSummaries?.some(s=>s.phase===phase&&s.unitId===unitId);
 requireDesign(!sealed,'immutable_history','Cannot dispatch a sealed completed unit');
 let previous=attempt.unit?.phase===phase&&attempt.unit.unitId===unitId?attempt.unit:undefined;
 // An interrupted S1 execution already spent its initial dispatch even though S1 had no unit counters.
 if(recovering&&!previous&&!attempt.unit&&(attempt.current?.kind===(chunk?'chunk':'planning')&&attempt.current.chunkId===chunk?.id||attempt.status==='interrupted'||attempt.status==='running')){
  previous={unitId,phase,executionId:attempt.current?.executionId??randomUUID(),dispatches:1,retriesUsed:0,userDirectedDispatches:0,diagnostics:[]};
 }
 const unit:DesignUnitState=previous?structuredClone(previous):{unitId,phase,executionId:randomUUID(),dispatches:1,retriesUsed:0,userDirectedDispatches:0,diagnostics:[]};
 if(previous){
  if(previous.dispatches<DESIGN_LIMITS.automaticDispatches){requireDesign(!allowExtra,'invalid_decision','Extra execution direction is only valid after exhaustion');unit.dispatches++;unit.retriesUsed++;}
  else{requireDesign(allowExtra,'retry_budget_exhausted','Automatic retry budget exhausted; user direction is required');unit.userDirectedDispatches++;}
 }else requireDesign(!allowExtra,'invalid_decision','No exhausted unit to retry');
 unit.executionId=randomUUID();attempt.unit=unit;
 attempt.current={kind:chunk?'chunk':'planning',executionId:unit.executionId,sequence:0,issuedAt:new Date().toISOString(),...(chunk?{chunkId:chunk.id}:{})};
 return unit.executionId;
}

export function sealDesignUnit(attempt:DesignAttempt):void {
 const unit=attempt.unit;requireDesign(unit,'invalid_checkpoint','Completed unit has no dispatch reservation');
 const summaries=attempt.unitSummaries??=[];
 requireDesign(!summaries.some(s=>s.unitId===unit.unitId&&s.phase===unit.phase),'immutable_history','Unit is already sealed');
 const linked=new Set(summaries.flatMap(s=>s.actionIds));
 const actionIds=(attempt.actions??[]).filter(a=>a.operation==='resume'&&!linked.has(a.actionId)).map(a=>a.actionId);
 summaries.push({unitId:unit.unitId,phase:unit.phase,automaticDispatches:unit.dispatches,retriesUsed:unit.retriesUsed,userDirectedDispatches:unit.userDirectedDispatches,diagnostics:structuredClone(unit.diagnostics),actionIds});
 // A user-directed dispatch has one durable outcome, separate from the exhausted automatic budget.
 const action=[...(attempt.actions??[])].reverse().find(a=>a.userDecision?.action==='retry_failed_unit'&&!a.outcome);
 if(unit.userDirectedDispatches&&action)action.outcome={code:'completed',summary:'Unit feedback accepted'};
}
