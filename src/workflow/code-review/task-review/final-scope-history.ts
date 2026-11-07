/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual } from 'node:util';
import { decodeReview, reviewJsonLimit, requireReview, reviewPath } from './contracts.js';
import type { CompletedReviewSummary, ReviewAttempt } from './contracts.js';
import { FinalScopeSnapshotSchema } from './final-scope-contracts.js';
import type { FinalScopeSnapshot, ReviewedSegment } from './final-scope-contracts.js';
import { projectionIdentity } from './projection.js';
import { normalizeProjectedSegments } from './projection-intervals.js';
import { attributionIdentity, validateAcceptedBindings, validateSavedAttribution } from './attribution-binding.js';
import type { PreparedReviewPacket } from './packet.js';

/** Caller has independently prepared source objects and restored accepted task identities. */
export function captureFinalScope(prepared: PreparedReviewPacket, attempt: ReviewAttempt): FinalScopeSnapshot {
 validateSavedAttribution(attempt);
 const p = prepared.projection, h = attempt.header;
 requireReview(p && h.finalScopeIdentity === p.identity && h.attributionState !== 'pending', 'finalScope', 'Missing verified terminal final scope');
 const candidate = {
  revision:p.revision, identity:p.identity,
  entries:p.entries.map(e=>({originChangeIndex:e.originChangeIndex,path:e.path,blobOid:e.after?.oid??null,findingScope:e.findingScope,segments:e.segments})),
  dispositions:p.dispositions,selectedTaskIds:h.selectedTaskIds,testCount:prepared.packet.tests.length,attributionIdentity:h.attributionIdentity,
  ...(h.attributionState==='accepted'?{attributionState:'accepted',tasks:h.acceptedAttribution!.map(row=>({...row,identity:h.taskScopeIdentities!.find(b=>b.taskId===row.taskId)!.identity}))}:
   {attributionState:'unmapped_failure',tasks:[],attributionFailure:h.attributionFailure}),
 };
 requireReview(Buffer.byteLength(JSON.stringify(candidate))<=reviewJsonLimit(),'projection_limit','Final snapshot exceeds storage capacity');
 return decodeReview(FinalScopeSnapshotSchema,candidate);
}

/** Synchronous immutable-history validation. Never reads Git or invokes a reviewer. */
export function validateFinalScope(review: CompletedReviewSummary): FinalScopeSnapshot | undefined {
 const scope=review.scope, pinned=scope.reviewRevision!==undefined;
 if(!pinned){
  requireReview(scope.finalScope===undefined&&review.finalScopeIdentity===undefined&&review.attributionIdentity===undefined&&review.taskScopeIdentities===undefined,'finalScope','Unpinned history carries final authority');return;
 }
 requireReview(scope.finalScope,'finalScope','Pinned history requires its final snapshot');
 const s=decodeReview(FinalScopeSnapshotSchema,scope.finalScope);
 const origins=scope.reviewSet.flatMap(p=>p.files.map(f=>({commit:p.commit,parent:p.parent,path:f.path,previousPath:f.previousPath??f.path,segments:f.segments})));
 requireReview(s.revision===scope.reviewRevision&&s.identity===review.finalScopeIdentity&&s.attributionIdentity===review.attributionIdentity,'finalScope','Final snapshot/root binding mismatch');
 requireReview(s.entries.length===origins.length&&s.entries.every((e,i)=>e.originChangeIndex===i),'finalScope','Missing or reordered final entries');
 requireReview(s.identity===projectionIdentity(s.revision,origins,s.entries,s.dispositions),'finalScope','Final projection identity mismatch');
 requireReview(isDeepStrictEqual([...s.selectedTaskIds].sort(),review.tasks.map(t=>t.taskId).sort()),'finalScope','Final selected task mismatch');
 const partitions=new Map<string,ReviewedSegment[]>(),active=new Map<number,ReviewedSegment[]>(),edges=new Map<string,Set<string>>();
 const key=(c:number,i:number)=>`${c}/${i}`;
 for(const d of s.dispositions){
  const origin=origins[d.source.changeIndex],segment=origin?.segments[d.source.segmentIndex];
  requireReview(segment,'finalScope','Unknown disposition source');
  const k=key(d.source.changeIndex,d.source.segmentIndex),parts=partitions.get(k)??[];parts.push(d.sourcePart);partitions.set(k,parts);
  requireReview(d.kind==='superseded'?d.finalSegments.length===0&&d.replacementWitnesses.length>0:d.replacementWitnesses.length===0,'finalScope','Invalid disposition outcome');
  requireReview(d.kind==='superseded'||d.finalSegments.length>0,'finalScope','Active disposition lacks final selection');
  requireReview(d.kind!=='surviving'||'after'in d.sourcePart&&d.finalSegments.every(r=>'after'in r),'finalScope','Invalid surviving partition');
  requireReview(d.kind!=='deleted'||'deletionAt'in d.sourcePart&&d.finalSegments.every(r=>'deletionAt'in r),'finalScope','Invalid deleted partition');
  for(const r of d.finalSegments)if('after'in r)requireReview(r.after[0]<=r.after[1],'finalScope','Reversed final interval');
  const spans=active.get(d.source.changeIndex)??[];for(const span of d.finalSegments)spans.push(span);active.set(d.source.changeIndex,spans);
  for(const w of d.replacementWitnesses){
   requireReview(origins[w.changeIndex]?.segments[w.segmentIndex]&&origins[w.changeIndex]!.commit!==origin!.commit&&s.entries[w.changeIndex]!.path===s.entries[d.source.changeIndex]!.path,'finalScope','Foreign replacement witness');
   const targets=edges.get(k)??new Set<string>();targets.add(key(w.changeIndex,w.segmentIndex));edges.set(k,targets);
  }
 }
 for(const [c,o]of origins.entries())for(const [i,segment]of o.segments.entries()){
  const parts=partitions.get(key(c,i))??[];
  if(segment.after){
   const ranges=parts.map(p=>{requireReview('after'in p,'finalScope','Wrong source partition kind');return p.after;}).sort((a,b)=>a[0]-b[0]);
   let cursor=segment.after[0];for(const r of ranges){requireReview(r[0]===cursor&&r[1]>=r[0]&&r[1]<=segment.after[1],'finalScope','Overlapping or missing source partition');cursor=r[1]+1;}
   requireReview(cursor===segment.after[1]+1,'finalScope','Incomplete source partition');
  }else requireReview(parts.length===1&&'deletionAt'in parts[0]!&&parts[0].deletionAt===segment.deletionAt,'finalScope','Invalid deletion partition');
 }
 // Kahn traversal avoids recursion on the maximum-size witness graph.
 const degree=new Map<string,number>();for(const [from,to]of edges){if(!degree.has(from))degree.set(from,0);for(const target of to)degree.set(target,(degree.get(target)??0)+1);}
 const queue=[...degree].filter(([,n])=>n===0).map(([k])=>k);let visited=0;
 for(let i=0;i<queue.length;i++){visited++;for(const to of edges.get(queue[i]!)??[]){degree.set(to,degree.get(to)!-1);if(degree.get(to)===0)queue.push(to);}}
 requireReview(visited===degree.size,'finalScope','Cyclic witness graph');
 for(const e of s.entries){reviewPath(e.path);requireReview(isDeepStrictEqual(normalizeProjectedSegments(active.get(e.originChangeIndex)??[]),e.segments),'finalScope','Final entry differs from disposition union');}
 if(s.attributionState==='accepted'){
  requireReview(review.taskScopeIdentities,'finalScope','Accepted history lacks task identities');
  validateAcceptedBindings({attempt:review.attempt,selectedTaskIds:s.selectedTaskIds,finalScopeIdentity:s.identity,attributionIdentity:s.attributionIdentity,acceptedAttribution:s.tasks.map(({identity:_id,...row})=>row),taskScopeIdentities:review.taskScopeIdentities},origins.length,s.testCount);
  requireReview(isDeepStrictEqual(s.tasks.map(({taskId,identity})=>({taskId,identity})),review.taskScopeIdentities),'finalScope','Task snapshot identity mismatch');
  for(const row of s.tasks)for(const d of s.dispositions)if(row.changeIndexes.includes(d.source.changeIndex))requireReview(d.replacementWitnesses.every(w=>row.changeIndexes.includes(w.changeIndex)),'finalScope','Task omits replacement witness');
  for(const row of s.tasks){const origin=review.origins?.find(o=>o.taskId===row.taskId);requireReview(row.decision.action==='reuse'?origin?.sourceAttempt===row.decision.sourceAttempt&&origin.reason===row.decision.reason:origin===undefined,'finalScope','Reuse provenance disagrees with accepted decision');}
 }else{
  requireReview(review.taskScopeIdentities===undefined&&!review.origins?.length&&s.attributionIdentity===attributionIdentity('unmapped_failure',s.identity,s.selectedTaskIds,s.testCount,[]),'finalScope','Invalid unmapped attribution binding');
  requireReview(Buffer.byteLength(s.attributionFailure.code)<=64&&Buffer.byteLength(s.attributionFailure.summary)<=8192,'finalScope','Oversize attribution failure');
  requireReview(review.tasks.every(t=>(t.status==='failed'||t.status==='incomplete')&&!t.findings.length&&t.testCoverage.assessment!=='verified'),'finalScope','Unmapped failure claims assessed scope');
 }
 return s;
}
