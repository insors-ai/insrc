/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { promises as fs, constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { consolidateDesignReview } from './results.js';
import { serializeDesignCheckpoint } from './capacity.js';
import { ArtifactIds } from '../../artifact-ids.js';
import { artifactJsonPath } from '../../storage.js';
import { DESIGN_LIMITS, DesignCheckpointSchema, DesignReviewError, DesignReviewPersistenceError, decodeDesign, requireDesign } from './contracts.js';
import type { DesignReviewCheckpoint, DesignAttempt, DesignUnitState, DesignUnitSummary } from './contracts.js';

const same=(a:unknown,b:unknown):boolean=>JSON.stringify(a)===JSON.stringify(b);
function checkUnit(unit:DesignUnitState|DesignUnitSummary):void {
 const dispatches='dispatches' in unit?unit.dispatches:unit.automaticDispatches;
 requireDesign(unit.retriesUsed===dispatches-1&&unit.diagnostics.length<=dispatches,'invalid_checkpoint','Unit retry counters do not match reserved dispatches');
}
function checkRecovery(attempt:DesignAttempt):void {
 const actions=attempt.actions??[],summaries=attempt.unitSummaries??[];
 const keys=new Set<string>();
 for(const action of actions){
  requireDesign(action.sourceAttempt===attempt.number,'invalid_checkpoint','Recovery action belongs to another attempt');
  requireDesign(action.resultAttempt===attempt.number+(action.operation==='restart_full'?1:0),'invalid_checkpoint','Recovery action names an invalid resulting attempt');
  const decision=action.userDecision?.action;
  requireDesign(action.operation==='restart_full'?decision==='restart_full':decision===undefined||action.operation==='resume'&&decision==='retry_failed_unit','invalid_checkpoint','Recovery decision does not match action');
 }
 for(const summary of summaries){
  checkUnit(summary);const key=`${summary.phase}\0${summary.unitId}`;
  requireDesign(!keys.has(key),'invalid_checkpoint','Duplicate completed unit summary');keys.add(key);
  requireDesign(new Set(summary.actionIds).size===summary.actionIds.length&&summary.actionIds.every(id=>actions.some(a=>a.actionId===id)),'invalid_checkpoint','Unit summary names an unknown or duplicate action');
  if(summary.phase==='impact')requireDesign(attempt.plan&&attempt.impact,'invalid_checkpoint','Completed impact summary has no atomic plan/impact pair');
  if(summary.phase==='planning')requireDesign(attempt.plan,'invalid_checkpoint','Completed planning summary has no accepted plan');
  if(summary.phase==='chunk_review')requireDesign(attempt.completedChunks.some(c=>c.chunkId===summary.unitId),'invalid_checkpoint','Completed unit summary has no accepted chunk');
 }
 if(attempt.unit){
  checkUnit(attempt.unit);
  const sealed=summaries.find(s=>s.phase===attempt.unit!.phase&&s.unitId===attempt.unit!.unitId);
  if(sealed)requireDesign(sealed.automaticDispatches===attempt.unit.dispatches&&sealed.retriesUsed===attempt.unit.retriesUsed&&sealed.userDirectedDispatches===attempt.unit.userDirectedDispatches&&same(sealed.diagnostics,attempt.unit.diagnostics),'immutable_history','Cannot reopen a sealed unit');
 }
 const directed=summaries.reduce((count,s)=>count+s.userDirectedDispatches,0)+(attempt.unit&&!keys.has(`${attempt.unit.phase}\0${attempt.unit.unitId}`)?attempt.unit.userDirectedDispatches:0);
 requireDesign(directed<=actions.filter(a=>a.userDecision?.action==='retry_failed_unit').length,'invalid_checkpoint','User-directed dispatch lacks an approved action');
 if(attempt.recovery)requireDesign(attempt.recovery.attempt===attempt.number&&attempt.recovery.status===attempt.status&&same(attempt.recovery.completedChunkIds,attempt.completedChunks.map(c=>c.chunkId)),'invalid_checkpoint','Recovery state does not match attempt');
}
function checkEvolution(previous:DesignReviewCheckpoint,next:DesignReviewCheckpoint):void {
 requireDesign(same(previous.submitted,next.submitted),'immutable_history','Cannot replace initial submission');
 requireDesign(next.attempts.length>=previous.attempts.length&&next.attempts.length<=previous.attempts.length+1,'immutable_history','Cannot remove or skip attempts');
 if(next.attempts.length>previous.attempts.length){
  const source=next.attempts[previous.attempts.length-1];
  const old=previous.attempts.at(-1)!,added=next.attempts.at(-1)!;
  const correction=['passed','changes_requested','incomplete'].includes(old.status)&&old.report?.status===old.status&&
   added.preparationKind==='impact'&&previous.attempts.every((a,i)=>same(a,next.attempts[i]));
  const restart=old.status==='invalidated'&&source?.status==='invalidated'&&
   (added.preparationKind??'planning')==='planning'&&!added.impact&&
   source.actions?.some(a=>a.operation==='restart_full'&&a.userDecision?.action==='restart_full'&&a.resultAttempt===next.attempts.length);
  requireDesign(correction||restart,'immutable_history','New attempt requires a complete terminal correction or approved full restart of invalidated work');
 }
 if(next.attempts.length===previous.attempts.length)requireDesign(same(previous.subject,next.subject),'immutable_history','Cannot replace an active subject');
 for(const old of previous.attempts){
  const current=next.attempts[old.number-1];
  requireDesign(current,'immutable_history','Cannot remove an admitted attempt');
  if(old.number<previous.attempts.length){requireDesign(same(old,current),'immutable_history','Cannot change a prior attempt');continue;}
  requireDesign(same(current.baseline,old.baseline)&&same(current.inventory,old.inventory),'immutable_history','Cannot replace an admitted baseline/inventory');
  requireDesign(same(current.preparationKind,old.preparationKind),'immutable_history','Cannot replace preparation kind');
  requireDesign(!old.impact||same(current.impact,old.impact),'immutable_history','Cannot replace accepted impact');
  requireDesign(!old.plan||same(current.plan,old.plan),'immutable_history','Cannot replace an accepted plan');
  requireDesign(old.completedChunks.every((r,i)=>same(r,current.completedChunks[i])),'immutable_history','Cannot replace completed feedback');
  requireDesign(!old.report||same(current.report,old.report),'immutable_history','Cannot replace an accepted report');
  requireDesign((old.unitSummaries??[]).every((r,i)=>same(r,current.unitSummaries?.[i])),'immutable_history','Cannot replace a sealed unit summary');
  for(const [i,action] of (old.actions??[]).entries()){
   const updated=current.actions?.[i];
   requireDesign(updated&&same({...action,outcome:undefined},{...updated,outcome:undefined})&&(!action.outcome||same(action.outcome,updated.outcome)),'immutable_history','Cannot replace action identity or a filled outcome');
  }
  if(old.unit){
   const unit=current.unit;
   if(unit?.unitId===old.unit.unitId&&unit.phase===old.unit.phase){
    requireDesign(unit.dispatches>=old.unit.dispatches&&unit.retriesUsed>=old.unit.retriesUsed&&unit.userDirectedDispatches>=old.unit.userDirectedDispatches&&old.unit.diagnostics.every((d,i)=>same(d,unit.diagnostics[i])),'immutable_history','Cannot decrease unit reservations or diagnostics');
   }else{
    const sealed=current.unitSummaries?.find(s=>s.unitId===old.unit!.unitId&&s.phase===old.unit!.phase);
    requireDesign(sealed&&sealed.automaticDispatches===old.unit.dispatches&&sealed.retriesUsed===old.unit.retriesUsed&&sealed.userDirectedDispatches===old.unit.userDirectedDispatches&&same(sealed.diagnostics,old.unit.diagnostics),'immutable_history','Cannot discard unsealed unit counters');
   }
  }
 }
}

export function designCheckpointPath(project: string, reviewId: string): string {
 requireDesign(isAbsolute(project)&&resolve(project)===project,'invalid_project','Expected canonical absolute project');
 requireDesign(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(reviewId),'invalid_review_id','Expected literal review identifier');
 return join(project,'.insrc/tmp/design-review',`${reviewId}.json`);
}
async function checkDirectories(project: string, create: boolean): Promise<boolean> {
 requireDesign(await fs.realpath(project)===project,'invalid_project','Project must be canonical');
 let path=project;
 for(const part of ['.insrc','tmp','design-review']) {
  path=join(path,part);
  let stat;
  try { stat=await fs.lstat(path); }
  catch(error) {
   if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
   if(!create)return false;
   try {await fs.mkdir(path,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
   stat=await fs.lstat(path);
  }
  requireDesign(stat.isDirectory()&&!stat.isSymbolicLink()&&await fs.realpath(path)===path,'invalid_checkpoint_path','Checkpoint directory is not canonical');
 }
 return true;
}
export function validateDesignCheckpointIdentity(project: string, id: string, checkpoint: DesignReviewCheckpoint): void {
 const key=ArtifactIds.parse(checkpoint.artifactId);
 requireDesign(checkpoint.reviewId===id&&checkpoint.project===project&&checkpoint.subject.project===project&&checkpoint.subject.artifactId===checkpoint.artifactId,'foreign_checkpoint','Checkpoint identity does not match request');
 requireDesign(key&&['DEF','HLD','LLD'].includes(key.kind)&&key.kind===checkpoint.subject.kind,'foreign_checkpoint','Invalid checkpoint subject');
 requireDesign(checkpoint.subject.canonicalPath===artifactJsonPath(project,checkpoint.artifactId),'foreign_checkpoint','Noncanonical subject in checkpoint');
 const doc=relative(join(project,'docs'),checkpoint.subject.documentPath);
 requireDesign(doc!==''&&!doc.startsWith('..')&&!isAbsolute(doc),'foreign_checkpoint','Subject document must remain in project docs');
 requireDesign(checkpoint.attempts.every((a,i)=>a.number===i+1),'invalid_checkpoint','Attempt sequence is not contiguous');
 const actionIds=checkpoint.attempts.flatMap(a=>(a.actions??[]).map(action=>action.actionId));
 requireDesign(new Set(actionIds).size===actionIds.length,'invalid_checkpoint','Duplicate recovery action identity');
 for(const attempt of checkpoint.attempts) {
  checkRecovery(attempt);
  requireDesign((attempt.preparationKind??'planning')==='impact'?!!attempt.plan===!!attempt.impact:!attempt.impact,'invalid_checkpoint','Impact preparation requires an atomic plan/impact pair; full planning cannot retain coverage');
  requireDesign((attempt.actions??[]).every(a=>a.resultAttempt<=checkpoint.attempts.length),'invalid_checkpoint','Recovery action names an absent attempt');
  requireDesign(attempt.progress.checkpointPath===designCheckpointPath(project,id),'foreign_checkpoint','Progress names another checkpoint');
  requireDesign(attempt.completedChunks.every(r=>Buffer.byteLength(JSON.stringify(r))<=DESIGN_LIMITS.resultBytes),'result_too_large','Stored chunk result exceeds page limit');
  const ids=new Set(attempt.completedChunks.map(r=>r.chunkId));
  requireDesign(ids.size===attempt.completedChunks.length,'invalid_checkpoint','Duplicate accepted chunk results');
  requireDesign(attempt.completedChunks.every(r=>r.findingDecisions===undefined||!!attempt.impact&&r.chunkId===attempt.plan?.finalConsistencyChunkId),'invalid_checkpoint','Stored finding decisions are not on an impact final result');
  if(attempt.report)requireDesign(!!attempt.report.impact===!!attempt.impact,'invalid_checkpoint','Report impact projection presence disagrees with accepted impact');
  if(attempt.report&&attempt.impact){
   requireDesign(attempt.plan,'invalid_checkpoint','Impact report lacks accepted plan');
   try{const report=consolidateDesignReview(id,attempt.number,{...checkpoint.subject,reviewer:attempt.reviewer??checkpoint.subject.reviewer},attempt.baseline.contentIdentity,attempt.plan,attempt.completedChunks,{impact:attempt.impact,attempts:checkpoint.attempts});requireDesign(same(report,attempt.report),'invalid_checkpoint','Report provenance differs from accepted review');}
   catch{requireDesign(false,'invalid_checkpoint','Impact report does not match accepted state');}
  }
  if(attempt.report) requireDesign(attempt.report.reviewId===id&&attempt.report.attempt===attempt.number&&attempt.report.artifactId===checkpoint.artifactId&&attempt.report.reviewedContentIdentity===attempt.baseline.contentIdentity&&JSON.stringify(attempt.report.chunks)===JSON.stringify(attempt.completedChunks),'invalid_checkpoint','Report does not match accepted attempt');
 }
}
export async function loadDesignCheckpoint(project: string, reviewId: string): Promise<DesignReviewCheckpoint | undefined> {
 const path=designCheckpointPath(project,reviewId);
 if(!await checkDirectories(project,false))return undefined;
 let file;
 try {file=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
 try {
  const stat=await file.stat();
  requireDesign(stat.isFile()&&stat.size<=DESIGN_LIMITS.checkpointBytes,'checkpoint_too_large','Expected bounded regular checkpoint');
  const bytes=Buffer.alloc(stat.size+1);let size=0;
  while(size<bytes.length){const read=await file.read(bytes,size,bytes.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}
  requireDesign(size<=stat.size,'checkpoint_changed','Checkpoint changed while reading');
  let parsed:unknown;
  try{parsed=JSON.parse(bytes.subarray(0,size).toString('utf8'));}catch{throw new DesignReviewError('invalid_checkpoint','Checkpoint is not valid JSON');}
  const checkpoint=decodeDesign(DesignCheckpointSchema,parsed);
  validateDesignCheckpointIdentity(project,reviewId,checkpoint);return checkpoint;
 } finally {await file.close();}
}
/** A failed pre-rename write leaves the previous accepted snapshot intact. No advance may follow a rejected save. */
export async function saveDesignCheckpoint(project: string, input: DesignReviewCheckpoint): Promise<void> {
 try{
 const checkpoint=decodeDesign(DesignCheckpointSchema,input),path=designCheckpointPath(project,checkpoint.reviewId);
 validateDesignCheckpointIdentity(project,checkpoint.reviewId,checkpoint);
 await checkDirectories(project,true);
 // Refuse corrupt/foreign existing state instead of destroying it on a new write.
 const previous=await loadDesignCheckpoint(project,checkpoint.reviewId);
 requireDesign(!previous||previous.artifactId===checkpoint.artifactId,'foreign_checkpoint','Cannot replace another subject');
 if(previous)checkEvolution(previous,checkpoint);
 const raw=serializeDesignCheckpoint(checkpoint);
 requireDesign(Buffer.byteLength(raw)<=DESIGN_LIMITS.checkpointBytes,'checkpoint_too_large','Checkpoint exceeds limit');
 const temporary=`${path}.${randomUUID()}.tmp`;
 let created=false;
 try {
  const file=await fs.open(temporary,'wx',0o600);
  created=true;
  try {await file.writeFile(raw);await file.sync();}finally{await file.close();}
  await fs.rename(temporary,path);
  const directory=await fs.open(dirname(path),'r');
  try{await directory.sync();}finally{await directory.close();}
 } finally {
  if(created)await fs.unlink(temporary).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='ENOENT')throw e;});
 }
 }catch(error){
  if(error instanceof DesignReviewError)throw error;
  throw new DesignReviewPersistenceError(error instanceof Error?error.message:'Checkpoint save failed');
 }
}
