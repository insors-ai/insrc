import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './publication-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { saveCheckpoint, loadCheckpoint, checkpointPath } from '../checkpoint.js';
import { decodeReview, TaskResultSchema } from '../contracts.js';
import { prepareReviewPacket } from '../packet.js';
import { persistFailureDiagnostic, validateFailureDiagnostics } from '../diagnostics.js';
import { ReviewOutputFailureError } from '../../../../shared/review-diagnostics.js';
import type { ReviewDiagnosticSnapshot } from '../../../../shared/review-diagnostics.js';
import type { ActivityReviewSessionOpts, LLMProvider } from '../../../../shared/types.js';

export const missing:ReviewDiagnosticSnapshot={provider:'claude',issues:[{code:'MISSING_REQUIRED_FIELD',field:'findings',correction:'Return findings as a top-level JSON array.',occurrences:5}],lastRejectedFeedback:{preview:'{"summary":"rejected"}',truncated:false}};
const provider=(run:(opts:ActivityReviewSessionOpts)=>Promise<unknown>)=>({capabilities:{reviewActivity:true},runReviewSession:async(_p:unknown,_s:unknown,opts:ActivityReviewSessionOpts)=>run(opts)} as unknown as LLMProvider);

test('Old checkpoint unchanged; diagnostics optional and host-owned, absent from model result schema',async()=>{
 const f=await fixture();try{
  const path=checkpointPath(f.repo,'publication'),before=readFileSync(path,'utf8');
  const checkpoint=await loadCheckpoint(path);assert.equal(checkpoint?.attempts[0]!['review-response'].failureDiagnostics,undefined);assert.equal(readFileSync(path,'utf8'),before);
  assert.throws(()=>decodeReview(TaskResultSchema,{...f.result,failureDiagnostics:[missing]}),/Unexpected property/);
  const prepared=await prepareReviewPacket(f.packet,f.deps.sources),entry=checkpoint!.attempts[0]!;
  entry['review-response'].tasks=[];
  const review={prepared,checkpoint:checkpoint!,attempt:entry,path};
  await persistFailureDiagnostic(review,'assessment','t1',missing,()=>saveCheckpoint(path,review.checkpoint));
  assert.deepEqual((await loadCheckpoint(path))!.attempts[0]!['review-response'].failureDiagnostics?.[0]?.diagnostic,missing);
  const bad=structuredClone(review.attempt);bad['review-response'].failureDiagnostics=[{phase:'assessment',taskId:'foreign',diagnostic:structuredClone(missing)}];
  assert.throws(()=>validateFailureDiagnostics(bad),/selected task/);
  const unicode=structuredClone(missing);unicode.issues=[{...unicode.issues[0]!,field:'界'.repeat(200)}];
  await assert.rejects(persistFailureDiagnostic(review,'assessment','t1',unicode,()=>saveCheckpoint(path,review.checkpoint)),/UTF-8/);
 }finally{f.cleanup();}
});
test('Shared attribution diagnostics stored once and projected only to applicable selected scope',async()=>{
 const f=await fixture(true,3);let calls=0;
 try{
  const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async opts=>{calls++;await opts.onDiagnostic!(missing);throw new ReviewOutputFailureError('bad attribution output',missing);})});
  const ack=await c.start(f.repo,'shared-diagnostic',1,f.packet);await c.settled(f.repo,'shared-diagnostic');
  const entry=f.read(ack.path).attempts[0]!;assert.equal(calls,1);assert.equal(entry['review-response'].tasks.length,3);
  assert.ok(entry['review-response'].tasks.every(t=>t.status==='failed'));
  assert.deepEqual(entry['review-response'].failureDiagnostics,[{phase:'attribution',diagnostic:missing}]);
  const foreign=structuredClone(entry);foreign['review-response'].failureDiagnostics![0]!.taskId='t1';assert.throws(()=>validateFailureDiagnostics(foreign),/selected task\/phase/);
 }finally{f.cleanup();}
});
test('Controller diagnostic exchange preserves ownership/sequence replay and never renews inactivity',async()=>{
 const f=await fixture(),life=new AbortController(),owner={id:'diagnostic-owner',signal:life.signal};let now=0;
 const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('No native daemon call');},now:()=>now,timer:()=>()=>{}});
 try{
  const frame=await c.startController(f.repo,'controller-diagnostic',1,f.packet,owner);
  const envelope={taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence};now=1000;
  const event={kind:'diagnostic',phase:'assessment',diagnostic:missing};
  const ack=await c.controllerActivity(f.repo,'controller-diagnostic',1,event,owner,envelope) as {inactivityRemainingMs:number};
  assert.equal(ack.inactivityRemainingMs,1799000,'diagnostic receipt did not reset inactivity');
  const before=readFileSync(frame.path,'utf8');
  assert.deepEqual(await c.controllerActivity(f.repo,'controller-diagnostic',1,event,owner,envelope),ack);assert.equal(readFileSync(frame.path,'utf8'),before);
  await assert.rejects(c.controllerActivity(f.repo,'controller-diagnostic',1,{kind:'diagnostic',phase:'assessment',diagnostic:{...missing,provider:'codex'}},owner,envelope),/Conflicting/);
  await assert.rejects(c.controllerActivity(f.repo,'controller-diagnostic',1,event,{...owner,id:'foreign'},{...envelope,sequence:2}),/wrong-reviewer/);
  const done=await c.controllerResult(f.repo,'controller-diagnostic',1,f.result,owner,{...envelope,sequence:2});assert.equal(done.status,'passed');
  assert.deepEqual(f.read(frame.path).attempts[0]!['review-response'].failureDiagnostics,[{phase:'assessment',taskId:'t1',diagnostic:missing,resolved:true}]);
  await assert.rejects(c.controllerActivity(f.repo,'controller-diagnostic',1,event,owner,{...envelope,sequence:3}));
 }finally{life.abort();f.cleanup();}
});
test('Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure',async()=>{
 const f=await fixture();try{
  let acknowledged=false;
  const c=new TaskReviewCoordinator({sources:f.deps.sources,save:async(path,cp)=>{if(cp.attempts.at(-1)!['review-response'].failureDiagnostics?.length)throw Error('diagnostic disk failure');await saveCheckpoint(path,cp);},provider:()=>provider(async opts=>{await opts.onDiagnostic!(missing);acknowledged=true;return f.result;})});
  const ack=await c.start(f.repo,'diagnostic-write-failure',1,f.packet);await c.settled(f.repo,'diagnostic-write-failure');
  const failed=f.read(ack.path).attempts[0]!;assert.equal(acknowledged,false);assert.deepEqual(failed['review-response'].tasks,[]);assert.equal(failed['review-response'].failureDiagnostics,undefined);
  const feedbackWrite=new TaskReviewCoordinator({sources:f.deps.sources,save:async(path,cp)=>{if(cp.attempts.at(-1)!['review-response'].tasks.length)throw Error('feedback disk failure');await saveCheckpoint(path,cp);},provider:()=>provider(async opts=>{try{await opts.onCandidate(f.result);}catch(error){await opts.onDiagnostic!(missing);throw error;}return f.result;})});
  const stopped=await feedbackWrite.start(f.repo,'feedback-write-before-diagnostic',1,f.packet);await feedbackWrite.settled(f.repo,'feedback-write-before-diagnostic');
  assert.deepEqual(f.read(stopped.path).attempts[0]!['review-response'].tasks,[]);assert.equal(f.read(stopped.path).attempts[0]!['review-response'].failureDiagnostics,undefined);
  const accepted=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async opts=>{await opts.onCandidate(f.result);await opts.onDiagnostic!(missing);throw new ReviewOutputFailureError('wrapper failed',missing);})});
  const good=await accepted.start(f.repo,'accepted-before-diagnostic',1,f.packet);await accepted.settled(f.repo,'accepted-before-diagnostic');
  const entry=f.read(good.path).attempts[0]!;assert.deepEqual(entry['review-response'].tasks,[f.result]);assert.equal(entry['review-response'].failureDiagnostics,undefined);
 }finally{f.cleanup();}
});
test('attempt diagnostic budget removes previews before pointed errors',async()=>{
 const f=await fixture(true,3);try{
  const cp=f.checkpoint('diagnostic-budget'),prepared=await prepareReviewPacket(f.packet,f.deps.sources),entry=cp.attempts[0]!;
  entry['review-response'].tasks=[];
  const review={checkpoint:cp,prepared,attempt:entry,path:'unused'};
  for(const taskId of ['t1','t2','t3'])for(const provider of ['claude','codex'] as const){
   await persistFailureDiagnostic(review,'assessment',taskId,{...missing,provider,lastRejectedFeedback:{preview:'x'.repeat(8192),truncated:false}},async()=>{});
  }
  const entries=entry['review-response'].failureDiagnostics!;assert.ok(Buffer.byteLength(JSON.stringify(entries))<=32768);assert.ok(entries.some(e=>e.diagnostic.truncated));assert.ok(entries.every(e=>e.diagnostic.issues[0]?.code==='MISSING_REQUIRED_FIELD'));
  const hard={provider:'claude' as const,issues:Array.from({length:8},(_,i)=>({code:`ERROR_${i}`,field:'\u0001'.repeat(256),correction:'\u0002'.repeat(256),occurrences:1}))};
  await persistFailureDiagnostic(review,'assessment','t1',hard,async()=>{});
  const before=structuredClone(entry['review-response'].failureDiagnostics);
  await assert.rejects(persistFailureDiagnostic(review,'assessment','t1',{...hard,provider:'codex'},async()=>{}),/32 KiB/);
  assert.deepEqual(entry['review-response'].failureDiagnostics,before,'required issue information is never silently dropped to fit');

 }finally{f.cleanup();}
});

test('controller rejects a late scope diagnostic after valid attribution and retains resolved evidence',async()=>{
 const f=await fixture(true,3),life=new AbortController(),owner={id:'scope-diag-owner',signal:life.signal};
 const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('No native daemon call');}});
 try{
  const frame=await c.startController(f.repo,'scope-diag',1,f.packet,owner);
  const envelope={taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence};
  await c.controllerActivity(f.repo,'scope-diag',1,{kind:'diagnostic',phase:'attribution',diagnostic:missing},owner,envelope);
  const task=await c.controllerScope(f.repo,'scope-diag',1,{tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))},owner,{...envelope,sequence:2});
  assert.equal(task.kind,'task');
  const before=f.read(task.path).attempts[0]!['review-response'];
  await assert.rejects(c.controllerActivity(f.repo,'scope-diag',1,{kind:'diagnostic',phase:'attribution',diagnostic:missing},owner,{taskId:task.taskId,executionId:task.executionId,sequence:task.nextSequence}),/Stale diagnostic phase/);
  assert.deepEqual(f.read(task.path).attempts[0]!['review-response'],before);
  assert.equal(f.read(task.path).attempts[0]!['review-response'].failureDiagnostics?.[0]?.resolved,true);
 }finally{life.abort();await new Promise(resolve=>setImmediate(resolve));f.cleanup();}
});
