/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import { decodeDesign,DesignCheckpointSchema,isDesignAdmission,requireDesign } from './contracts.js';
import type { DesignReviewCheckpoint } from './contracts.js';
import { loadStoredDesignCheckpoint,qualifiedDesignProjection,updateStoredDesignCheckpoint } from './checkpoint.js';
import { designActionEvolution } from './action-state.js';

/** Read-only ordinary execution view. No discarded or renumbered durable
 * attempts: technical admission history stays in the same v2 checkpoint. */
export async function loadWorkerDesignCheckpoint(project:string,id:string):Promise<DesignReviewCheckpoint|undefined>{
 const stored=await loadStoredDesignCheckpoint(project,id);return stored&&qualifiedDesignProjection(stored);
}
/** Merge execution against the fresh serialized family snapshot. Native guard
 * updates and original admission metadata never come from an old job copy. */
export const saveWorkerDesignCheckpoint:typeof import('./checkpoint.js').saveDesignCheckpoint=async(project,input)=>{
 const candidate=decodeDesign(DesignCheckpointSchema,structuredClone(input));
 await updateStoredDesignCheckpoint(project,candidate.reviewId,stored=>{
  requireDesign(stored&&stored.schemaVersion===2,'missing_checkpoint','Durable version-2 design admission missing');
  const last=candidate.attempts.at(-1)!;
  const source=stored.attempts.at(-1)!;
  const restart=!isDesignAdmission(source)&&last.number===source.number+1&&source.actions?.find(a=>a.validation==='unverified'&&a.operation==='restart_full'&&a.resultAttempt===last.number);
  requireDesign(last.number===source.number||restart,'review_conflict','Stale design worker save');
  const projected=qualifiedDesignProjection(stored);
  requireDesign(!projected||projected.artifactId===candidate.artifactId,'foreign_checkpoint','Design subject mismatch');
  const byNumber=new Map(candidate.attempts.map(a=>[a.number,a]));
  const attempts=stored.attempts.map(old=>{
   const next=byNumber.get(old.number);
   if(!next){requireDesign(isDesignAdmission(old),'immutable_history','Worker cannot discard qualified feedback');return old;}
   if(isDesignAdmission(old))return{...next,startedAt:old.startedAt,reviewer:old.reviewer,submitted:old.submitted,actionId:old.actionId,operation:old.operation,acceptedAt:old.acceptedAt,...(old.resourceGuard?{resourceGuard:old.resourceGuard}:{})};
   const {resourceGuard:_guard,submitted:_input,actionId:_action,operation:_operation,acceptedAt:_accepted,...prior}=old;
   if(old.number!==last.number){
    const {actions:oldActions,...oldBody}=prior,{actions:newActions,...newBody}=next;
    requireDesign(same(oldBody,newBody)&&oldActions?.length===(newActions?.length)&&((oldActions??[]).every((a,i)=>!!newActions?.[i]&&designActionEvolution(a,newActions[i]!))),'immutable_history','Worker cannot rewrite prior design feedback');
   }
   return{...next,...(old.submitted?{submitted:old.submitted}:{}),...(old.actionId?{actionId:old.actionId}:{}),...(old.operation?{operation:old.operation}:{}),...(old.acceptedAt?{acceptedAt:old.acceptedAt}:{}),...(old.resourceGuard?{resourceGuard:old.resourceGuard}:{})};
  });
  if(restart)attempts.push({...last,acceptedAt:restart.acceptedAt});
  requireDesign(candidate.attempts.every(a=>stored.attempts.some(old=>old.number===a.number)||!!restart&&a.number===last.number),'review_conflict','Design attempt must be durably admitted first');
  return{...stored,schemaVersion:2,artifactId:candidate.artifactId,subject:candidate.subject,submitted:candidate.submitted,attempts};
 });
};
