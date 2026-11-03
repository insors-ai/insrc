/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { performance } from 'node:perf_hooks';
import type { ReviewActivityEvent } from '../../../shared/review-activity.js';
import { currentDesignAttempt, requireDesign } from './contracts.js';
import type { DesignReviewCheckpoint, DesignReviewProgress, DesignReviewConsolidated, DesignChunkResult, DesignReviewStatus } from './contracts.js';

export interface DesignClock { now(): number; wall(): string; }
const clock:DesignClock={now:()=>performance.now(),wall:()=>new Date().toISOString()};
export class DesignProgressTracker {
 private readonly started:number;
 private unitStarted:number|undefined;
 private readonly sessions=new Map<string,number>();
 private readonly tools=new Set<string>();
 private value:DesignReviewProgress;
 constructor(path:string,private readonly time:DesignClock=clock,previous?:DesignReviewProgress){
  this.started=time.now()-(previous?.reviewElapsedMs??0);this.value={status:'pending',phase:'planning',completedChunks:0,totalChunks:0,lastMeaningfulActivityAt:null,activeToolCount:0,requiresUserInput:false,checkpointPath:path,sequence:previous?.sequence??0,reviewElapsedMs:0,unitElapsedMs:null,observedAt:time.wall(),freshness:'live'};
 }
 unit(phase:'planning'|'chunk_review',chunkId?:string,completed=0,total=0):void{
  this.sessions.clear();this.tools.clear();this.unitStarted=this.time.now();
  this.value.status='running';this.value.phase=phase;this.value.completedChunks=completed;this.value.totalChunks=total;
  this.value.lastMeaningfulActivityAt=null;this.value.activeToolCount=0;
  if(chunkId)this.value.activeChunkId=chunkId;else delete this.value.activeChunkId;
  this.touch();
 }
 phase(phase:DesignReviewProgress['phase'],completed=this.value.completedChunks,total=this.value.totalChunks):void{
  this.value.phase=phase;this.value.completedChunks=completed;this.value.totalChunks=total;this.touch();
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
  if(this.tools.size)this.value.phase='tool_running';else if(this.value.phase==='tool_running')this.value.phase=this.value.activeChunkId?'chunk_review':'planning';
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
 readonly guidance:string;
 readonly completedResults: readonly DesignChunkResult[];
 readonly nextCompletedChunk:number;
 readonly report?:DesignReportMetadata|undefined;
 readonly failure?:{readonly code:string;readonly summary:string}|undefined;
}
export function observeDesignCheckpoint(checkpoint:DesignReviewCheckpoint,options:{active?:boolean|undefined;liveProgress?:DesignReviewProgress|undefined;afterCompletedChunk?:number|undefined;includeResult?:boolean|undefined}={}):DesignObservation{
 const attempt=currentDesignAttempt(checkpoint),cursor=options.afterCompletedChunk??0;
 requireDesign(Number.isSafeInteger(cursor)&&cursor>=0&&cursor<=attempt.completedChunks.length,'invalid_cursor','Cursor exceeds completed feedback');
 const progress={...(options.liveProgress??attempt.progress)},live=options.active===true;
 progress.freshness=live?'live':'stored';
 if(!live&&(attempt.status==='pending'||attempt.status==='running'))progress.status='interrupted';else progress.status=attempt.status;
 progress.completedChunks=attempt.completedChunks.length;progress.totalChunks=attempt.plan?.chunks.length??0;
 if(attempt.recovery)progress.recovery=structuredClone(attempt.recovery);
 else if(progress.status==='interrupted')progress.recovery={attempt:attempt.number,status:'interrupted',reason:'daemon_restarted',completedChunkIds:attempt.completedChunks.map(c=>c.chunkId),requiresUserInput:true};
 const completedResults=options.includeResult?attempt.completedChunks.slice(cursor,cursor+1):[];
 const report=attempt.report;
 progress.requiresUserInput=['paused','invalidated','failed','interrupted'].includes(progress.status);
 const guidance=['pending','running'].includes(progress.status)?'Review in progress. Show progress and wait for full completion before corrections, resolution or approval.':progress.requiresUserInput?'Review stopped. Await user input; S1 does not automatically retry, resume or reassign.':'Review complete. Read all completed feedback before taking action; checkpoint feedback alone does not approve the artifact.';
 return {...progress,guidance,completedResults:structuredClone(completedResults),nextCompletedChunk:cursor+completedResults.length,...(attempt.failure?{failure:{...attempt.failure}}:{}),...(report?{report:{reviewId:report.reviewId,attempt:report.attempt,artifactId:report.artifactId,status:report.status,counts:{...report.counts},reviewer:report.reviewer,reviewedContentIdentity:report.reviewedContentIdentity}}:{})};
}
