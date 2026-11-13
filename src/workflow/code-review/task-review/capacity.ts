import { checkpointBytes } from './checkpoint.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { artifactJsonPath, codeReviewArtifactId } from '../../storage.js';
import { TaskReviewInputError, reviewJsonLimit, requireReview } from './contracts.js';
import type { ReviewCheckpoint, TaskReviewResult } from './contracts.js';
import type { AdmittedReview } from './execution.js';
import { failAttribution, unmappedTaskFailure } from './attribution-failure.js';
import { taskFailure } from './assessment.js';
import { completedSummary,failedAttemptSummary } from './summary.js';
import type { CompletedReviewSummary } from './contracts.js';
import { latestReviewStatus, mergeTaskSummary, validateTaskBody } from './record.js';
import { MAX_ATTEMPT_DIAGNOSTIC_BYTES, validateFailureDiagnostics } from './diagnostics.js';

export interface CapacityBaseline { readonly head?: Record<string,unknown>; readonly path:string; readonly identity:string|null; }
const pretty=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
const size=(value:unknown)=>Buffer.byteLength(JSON.stringify(value));
const hash=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
export async function readCapacityBaseline(project:string,epicHash:string,storyId:string):Promise<CapacityBaseline>{
 const path=artifactJsonPath(project,codeReviewArtifactId(epicHash,storyId.replace(/^STORY-[a-f0-9]{16}-/,'')));
 try{const bytes=await readFile(path,'utf8');requireReview(Buffer.byteLength(bytes)<=reviewJsonLimit(),'projection_limit','Existing CR envelope exceeds review capacity');return{path,identity:hash(bytes),head:JSON.parse(bytes) as Record<string,unknown>};}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{path,identity:null};throw error;}
}
/** Called under the canonical store queue. An append by another review is
 * expected concurrency; altered/deleted prior history or metadata is a conflict.
 * The caller rechecks the actual merged envelope before its journalled write. */
export async function requireCapacityBaseline(baseline:CapacityBaseline):Promise<void>{
 let bytes:string|undefined;try{bytes=await readFile(baseline.path,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if((bytes===undefined?null:hash(bytes))===baseline.identity)return;
 requireReview(bytes!==undefined,'publication','CR capacity baseline disappeared; explicit recovery required');
 const current=JSON.parse(bytes) as Record<string,unknown>,body=validateTaskBody(current['body']);
 const prior=baseline.head?validateTaskBody(baseline.head['body']):undefined;
 requireReview(body.reviews.length>(prior?.reviews.length??0)&&(prior?.reviews??[]).every((r,i)=>isDeepStrictEqual(r,body.reviews[i])),'publication','CR capacity baseline history changed; explicit recovery required');
 if(baseline.head){
  const stable=(head:Record<string,unknown>)=>{const meta={...(head['meta'] as Record<string,unknown>)};for(const key of ['lifecycle','revision','reviewedBy'])delete meta[key];return{...head,meta,body:undefined};};
  requireReview(isDeepStrictEqual(stable(baseline.head),stable(current)),'publication','CR capacity baseline metadata changed; explicit recovery required');
 }
}

export function capacityTaskFailure(taskId:string,timedOut:boolean):TaskReviewResult{return taskFailure(taskId,'Task could not complete within qualified storage capacity. See review diagnostics.',timedOut);}

// Future diagnostic JSON is <=32 KiB INCLUDING escaping. At any diagnostic
// token the indented checkpoint is at depth <=12: at most 26 whitespace bytes
// per compact byte. The pointed CR summary can escape each compact byte once
// more (<=6 bytes). These are upper bounds, not another retention/shrinking pass.
const diagnosticReserve=(2*12+3)*MAX_ATTEMPT_DIAGNOSTIC_BYTES;
// Existing schemas: reassessmentSummary 65536 chars; repair 8192 UTF-8 bytes;
// response.error 65536 chars. A UTF-8 byte/code unit needs <=6 JSON bytes.
// 16 KiB covers bounded progress, timestamps, active task id and fixed metadata;
// 64 KiB covers newly created canonical identity/lifecycle metadata.
export const TERMINAL_METADATA_RESERVE=diagnosticReserve+6*(65536+8192+65536)+16*1024;
export const CANONICAL_METADATA_RESERVE=64*1024;
export interface CapacityMeasurement { readonly checkpoint:number; readonly checkpointCompact:number; readonly summary:number; readonly body:number; readonly envelope:number; }

/** Pure qualification; no save, provider, source read or truncation. */
export function terminalCapacity(review:AdmittedReview,baseline:CapacityBaseline,limit=reviewJsonLimit()):readonly CapacityMeasurement[]{
 requireReview(limit<=reviewJsonLimit()&&limit>0,'projection_limit','Invalid reduced capacity limit');
 if(!review.prepared.projection)return[];
 const result:CapacityMeasurement[]=[];
 for(const timedOut of [false,true]){
  const checkpoint:ReviewCheckpoint=structuredClone(review.checkpoint),attempt=checkpoint.attempts.at(-1)!;
  validateFailureDiagnostics(attempt);
  // Replace ONLY latest mutable fields in this private estimate with their full
  // schema upper bounds below. Actual records/diagnostics are never modified.
  delete attempt['review-response'].failureDiagnostics;delete attempt['review-response'].error;
  delete attempt.header.reassessmentSummary;delete attempt.header.attributionRepair;delete attempt.progress;
  if(attempt.header.attributionState==='pending')failAttribution(attempt,new Error('\0'.repeat(8192)),timedOut);
  const selected=attempt.header.selectedTaskIds;
  for(const id of selected.filter(id=>!attempt['review-response'].tasks.some(t=>t.taskId===id))){
   const decision=attempt.header.acceptedAttribution?.find(r=>r.taskId===id)?.decision;
   if(decision?.action==='reuse'){
    const source=checkpoint.attempts.find(a=>a.header.attempt===decision.sourceAttempt)?.['review-response'].tasks.find(t=>t.taskId===id);
    requireReview(source,'origins','Missing accepted reuse result for capacity qualification');
    attempt['review-response'].tasks=[...attempt['review-response'].tasks,source];
    attempt['review-response'].origins=[...(attempt['review-response'].origins??[]),{taskId:id,sourceAttempt:decision.sourceAttempt,reason:decision.reason}];
   }else attempt['review-response'].tasks=[...attempt['review-response'].tasks,attempt.header.attributionState==='failed'?unmappedTaskFailure(id,timedOut):capacityTaskFailure(id,timedOut)];
  }
  attempt.header.completedAt='9999-12-31T23:59:59.999Z';attempt.header.status=timedOut?'incomplete':'failed';delete attempt.header.activeTaskId;
  attempt['review-response'].crPublication='complete';attempt['review-response'].crPath=baseline.path.replace(/\.json$/,'.md');
  const summary=completedSummary(review.prepared,attempt,checkpoint.reviewId);
  attempt.header.status=summary.status;attempt['review-response'].summary='All selected task assessments are terminal. CR publication complete.';
  const prior=baseline.head?.['body'] as {reviews?:readonly CompletedReviewSummary[];status?:unknown}|undefined;
  const retained=checkpoint.attempts.slice(0,-1).filter(a=>a.header.status==='failed'&&a['review-response'].crPublication==='pending').map(a=>failedAttemptSummary(a,checkpoint.reviewId));
  const kept=[...(prior?.reviews?.filter(r=>r.reviewId!==checkpoint.reviewId||r.attempt!==attempt.header.attempt)??[])];
  for(const failure of retained)if(!kept.some(r=>r.reviewId===failure.reviewId&&r.attempt===failure.attempt))kept.push(failure);
  const current=kept.length?{kind:'code-review',format:'task-based',storyId:summary.storyId,...prior,reviews:kept,status:latestReviewStatus(kept)}:undefined;
  const body={kind:'code-review',format:'task-based',storyId:summary.storyId,status:latestReviewStatus([...(current?.reviews??[]),summary]),reviews:[...(current?.reviews??[]),summary]};
  // Actual envelope/prefix are retained; only missing creation metadata uses reserve.
  const envelope={...(baseline.head??{meta:{workflow:'code-review',schemaVersion:2},citations:[]}),body};
  const serializedCheckpointBytes=Buffer.byteLength(pretty(checkpoint));
  const measure={checkpoint:serializedCheckpointBytes+TERMINAL_METADATA_RESERVE,checkpointCompact:size(checkpoint)+TERMINAL_METADATA_RESERVE,summary:size(summary)+TERMINAL_METADATA_RESERVE,body:size(body)+TERMINAL_METADATA_RESERVE,envelope:Buffer.byteLength(pretty(envelope))+TERMINAL_METADATA_RESERVE+CANONICAL_METADATA_RESERVE};
  requireReview(Object.values(measure).every(n=>n<=limit),'projection_limit','Complete terminal review envelopes exceed storage capacity; submit a smaller explicit review unit');
  requireReview(checkpointBytes(checkpoint)===pretty(checkpoint),'projection_limit','Checkpoint serialization disagrees with capacity qualification');mergeTaskSummary(current,summary);
  result.push(measure);
 }
 return result;
}
export function qualifyReviewCapacity(review:AdmittedReview):void{if(review.capacity)terminalCapacity(review,review.capacity);}

/** Refuse an entire oversize result; retain a truthful fixed failure, never a truncated pass. */
export function capacityCheckedResult(review:AdmittedReview,result:TaskReviewResult):TaskReviewResult {
 if(!review.capacity)return result;
 const candidate=(value:TaskReviewResult):AdmittedReview=>{
  const attempt={...review.attempt,'review-response':{...review.attempt['review-response'],tasks:[...review.attempt['review-response'].tasks,value]}};
  return{...review,attempt,checkpoint:{...review.checkpoint,attempts:review.checkpoint.attempts.map(a=>a===review.attempt?attempt:a)}};
 };
 try{qualifyReviewCapacity(candidate(result));return result;}
 catch(error){if(!(error instanceof TaskReviewInputError)||error.field!=='projection_limit')throw error;const failed=capacityTaskFailure(result.taskId,false);qualifyReviewCapacity(candidate(failed));return failed;}
}
