/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { performance } from 'node:perf_hooks';
import type { ReviewActivityEvent } from '../../../shared/review-activity.js';
import { currentDesignAttempt, requireDesign, isDesignAdmission } from './contracts.js';
import type { StoredDesignCheckpoint } from './contracts.js';
import { qualifiedDesignProjection } from './checkpoint.js';
import type { DesignPublication, DesignReviewCheckpoint, DesignReviewProgress, DesignReviewConsolidated, DesignChunkResult, DesignReviewStatus, DesignAttempt } from './contracts.js';
import { selectedDesignChunks, nextDesignUnit } from './recovery-state.js';

export function designCoverageProgress(attempt:DesignAttempt):Pick<DesignReviewProgress,'completedChunks'|'totalChunks'|'coverageProgress'>{
 const selected=selectedDesignChunks(attempt);nextDesignUnit(attempt);
 if(!attempt.plan)return{completedChunks:0,totalChunks:0};
 const plannedChunks=attempt.plan.chunks.length,selectedChunks=selected.length,reviewedChunks=attempt.completedChunks.length,retainedChunks=attempt.impact?.retainedCoverage.length??0;
 requireDesign(plannedChunks===selectedChunks+retainedChunks&&reviewedChunks<=selectedChunks,'invalid_checkpoint','Coverage counters do not form a complete partition');
 return{completedChunks:reviewedChunks,totalChunks:selectedChunks,coverageProgress:{plannedChunks,selectedChunks,reviewedChunks,retainedChunks,effectiveCompletedChunks:reviewedChunks+retainedChunks}};
}

export interface DesignClock { now(): number; wall(): string; }
const clock:DesignClock={now:()=>performance.now(),wall:()=>new Date().toISOString()};
export class DesignProgressTracker {
 private readonly started:number;
 private unitStarted:number|undefined;
 private unitPhase:'planning'|'impact'|'chunk_review'='planning';
 private readonly sessions=new Map<string,number>();
 private readonly tools=new Set<string>();
 private value:DesignReviewProgress;
 constructor(path:string,private readonly time:DesignClock=clock,previous?:DesignReviewProgress){
  this.started=time.now()-(previous?.reviewElapsedMs??0);this.value={status:'pending',phase:'planning',completedChunks:0,totalChunks:0,lastMeaningfulActivityAt:null,activeToolCount:0,requiresUserInput:false,checkpointPath:path,sequence:previous?.sequence??0,reviewElapsedMs:0,unitElapsedMs:null,observedAt:time.wall(),freshness:'live'};
 }
 unit(phase:'planning'|'impact'|'chunk_review',chunkId?:string,completed=0,total=0):void{
  this.unitPhase=phase;this.sessions.clear();this.tools.clear();this.unitStarted=this.time.now();
  this.value.status='running';this.value.phase=phase;this.value.completedChunks=completed;this.value.totalChunks=total;
  this.value.lastMeaningfulActivityAt=null;this.value.activeToolCount=0;
  if(chunkId)this.value.activeChunkId=chunkId;else delete this.value.activeChunkId;
  this.touch();
 }
 phase(phase:DesignReviewProgress['phase'],completed=this.value.completedChunks,total=this.value.totalChunks):void{
  this.value.phase=phase;this.value.completedChunks=completed;this.value.totalChunks=total;this.touch();
 }
 coverage(attempt:DesignAttempt):void{
  const counts=designCoverageProgress(attempt);this.value.completedChunks=counts.completedChunks;this.value.totalChunks=counts.totalChunks;
  if(counts.coverageProgress)this.value.coverageProgress=counts.coverageProgress;else delete this.value.coverageProgress;
 }
 status(status:DesignReviewStatus):void{
  this.value.status=status;this.value.requiresUserInput=['paused','invalidated','failed','interrupted'].includes(status);
  if(status!=='running'){this.tools.clear();this.value.activeToolCount=0;delete this.value.activeChunkId;this.value.phase='complete';}
  this.touch();
 }
 /** Activity only; observing/polling this tracker never renews grace. Native/provider or controller monitor owns timing. */
 activity(event:ReviewActivityEvent):boolean{
  if(event.kind==='heartbeat'||!event.sessionId||event.sessionId.length>256||!Number.isSafeInteger(event.sequence)||event.sequence<1)return false;
  const previous=this.sessions.get(event.sessionId);
  if(previous!==undefined&&event.sequence<=previous||previous===undefined&&(event.kind!=='session_started'||this.sessions.size>=8)||previous!==undefined&&event.kind==='session_started')return false;
  const key=JSON.stringify([event.sessionId,event.toolId]);
  if(event.kind==='tool_started'){
   if(!event.toolId||this.tools.has(key)||this.tools.size>=128)return false;this.tools.add(key);
  }else if(event.kind==='tool_completed'){
   if(!event.toolId||!this.tools.delete(key))return false;
  }
  this.sessions.set(event.sessionId,event.sequence);this.value.activeToolCount=this.tools.size;
  if(event.kind!=='session_started')this.value.lastMeaningfulActivityAt=this.time.wall();
  if(this.tools.size)this.value.phase='tool_running';else if(this.value.phase==='tool_running')this.value.phase=this.unitPhase;
  this.touch();return true;
 }
 snapshot():DesignReviewProgress{
  const elapsed=(start:number)=>Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(this.time.now()-start)));
  return {...this.value,observedAt:this.time.wall(),reviewElapsedMs:elapsed(this.started),unitElapsedMs:this.unitStarted===undefined?null:elapsed(this.unitStarted)};
 }
 private touch():void{this.value.sequence++;this.value.observedAt=this.time.wall();}
}
export type DesignReportMetadata=Pick<DesignReviewConsolidated,'reviewId'|'attempt'|'artifactId'|'status'|'counts'|'reviewer'|'reviewedContentIdentity'>;
export interface DesignObservation extends DesignReviewProgress {
 readonly publication?:DesignPublication|undefined;
 readonly source?:'history'|'checkpoint'|undefined;
 readonly guidance:string;
 readonly completedResults: readonly DesignChunkResult[];
 readonly nextCompletedChunk:number;
 readonly report?:DesignReportMetadata|undefined;
 readonly failure?:{readonly code:string;readonly summary:string;readonly field?:string|undefined}|undefined;
 readonly admission?:{readonly validation:'unverified'}|undefined;
}
export function observeStoredDesignCheckpoint(checkpoint:StoredDesignCheckpoint,options:Parameters<typeof observeDesignCheckpoint>[1]={}):DesignObservation{
 const attempt=checkpoint.attempts.at(-1)!;
 if(!isDesignAdmission(attempt))return observeDesignCheckpoint(qualifiedDesignProjection(checkpoint)!,options);
 requireDesign((options.afterCompletedChunk??0)===0,'invalid_cursor','Admission has no completed chunk feedback');
 const active=options.active===true,status=!active&&['pending','running'].includes(attempt.status)?'interrupted':attempt.status;
 return {status,phase:'admission',admission:{validation:'unverified'},completedChunks:0,totalChunks:0,
  lastMeaningfulActivityAt:null,activeToolCount:0,requiresUserInput:!active,checkpointPath:attempt.progress.checkpointPath,
  sequence:attempt.progress.sequence,reviewElapsedMs:Math.max(0,Date.parse(attempt.finishedAt??attempt.progress.observedAt)-Date.parse(attempt.acceptedAt)),unitElapsedMs:null,
  observedAt:attempt.progress.observedAt,freshness:active?'live':'stored',completedResults:[],nextCompletedChunk:0,
  ...(attempt.error?{failure:attempt.error}:{}),
  guidance:active?'Preparing review; scope is not verified. Wait for admission.':'Technical admission did not complete a review. Wait for user direction; changed input requires the next attempt.',
 };
}
export function observeDesignCheckpoint(checkpoint:DesignReviewCheckpoint,options:{active?:boolean|undefined;liveProgress?:DesignReviewProgress|undefined;afterCompletedChunk?:number|undefined;includeResult?:boolean|undefined}={}):DesignObservation{
 const attempt=currentDesignAttempt(checkpoint),cursor=options.afterCompletedChunk??0;
 requireDesign(Number.isSafeInteger(cursor)&&cursor>=0&&cursor<=attempt.completedChunks.length,'invalid_cursor','Cursor exceeds completed feedback');
 const progress={...(options.liveProgress??attempt.progress)},live=options.active===true;
 progress.freshness=live?'live':'stored';
 if(!live&&(attempt.status==='pending'||attempt.status==='running'))progress.status='interrupted';else progress.status=attempt.status;
 const counts=designCoverageProgress(attempt);progress.completedChunks=counts.completedChunks;progress.totalChunks=counts.totalChunks;
 if(counts.coverageProgress)progress.coverageProgress=counts.coverageProgress;else delete progress.coverageProgress;
 if(attempt.recovery)progress.recovery=structuredClone(attempt.recovery);
 else if(progress.status==='interrupted')progress.recovery={attempt:attempt.number,status:'interrupted',reason:'daemon_restarted',completedChunkIds:attempt.completedChunks.map(c=>c.chunkId),requiresUserInput:true};
 if(attempt.unit)progress.retriesUsed=attempt.unit.retriesUsed;else delete progress.retriesUsed;
 if(attempt.current)progress.executionId=attempt.current.executionId;else delete progress.executionId;
 if(progress.recovery?.failedUnit)progress.failedUnit={...progress.recovery.failedUnit};else delete progress.failedUnit;
 const completedResults=options.includeResult?attempt.completedChunks.slice(cursor,cursor+1):[];
 if(attempt.publication?.state==='pending'&&attempt.status!=='invalidated'){progress.status=attempt.publication.error?'failed':'running';progress.phase='publishing';}
 const report=['passed','changes_requested','incomplete'].includes(progress.status)?attempt.report:undefined;
 progress.requiresUserInput=['paused','invalidated','failed','interrupted'].includes(progress.status);
 const guidance=['pending','running'].includes(progress.status)?'Review in progress. Show progress and wait for full completion before corrections, resolution or approval.':progress.status==='interrupted'?'Review interrupted. Explicitly request recover with operation resume for the unchanged subject; do not repeat completed chunks.':progress.status==='paused'?'Technical retries exhausted. Ask the user before recover/resume with a retry_failed_unit decision; each action authorizes one additional execution.':progress.status==='invalidated'?'Reviewed artifact changed. Notify the user and obtain approval for recover/restart_full with a restart_full decision; no completed chunk is reused.':progress.status==='failed'?'Review failed. Report the failure and wait for user direction; do not automatically resubmit.':'Review complete. Read all completed feedback before taking action; checkpoint feedback alone does not approve the artifact.';
 return {...progress,...(attempt.publication?{publication:structuredClone(attempt.publication)}:{}),guidance,completedResults:structuredClone(completedResults),nextCompletedChunk:cursor+completedResults.length,...(attempt.publication?.error?{failure:{...attempt.publication.error}}:attempt.failure?{failure:{...attempt.failure}}:{}),...(report?{report:{reviewId:report.reviewId,attempt:report.attempt,artifactId:report.artifactId,status:report.status,counts:{...report.counts},reviewer:report.reviewer,reviewedContentIdentity:report.reviewedContentIdentity}}:{})};
}
