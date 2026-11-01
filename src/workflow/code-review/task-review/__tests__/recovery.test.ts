/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, hash } from './publication-fixture.js';
import { channel, eventually, provider, serve } from './controller-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import type { ReviewAcknowledgement } from '../coordinator.js';
import type { ControllerFrame } from '../controller.js';
import type { TaskReviewResult } from '../contracts.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';

const scope=(count:number)=>({tasks:Array.from({length:count},(_v,i)=>({taskId:`t${i+1}`,changeIndexes:[0],testIndexes:[0]}))});

test('interrupted recovery: only absent tasks rerun and terminal failed/incomplete tasks are skipped', async()=>{
 for(const status of ['passed','changes_requested','incomplete','failed'] as const){
  const f=await fixture(true,3);let calls=0;
  try{
   const state=f.checkpoint('resume'),entry=state.attempts[0]!,prior=structuredClone(f.result);
   prior.status=status;
   if(status==='changes_requested')prior.findings=[{severity:'MED',location:'source.js:1',message:'Required behavior differs',rationale:'Selected body does not meet the required value',evidenceReferences:[f.result.inspectedReferences[0]!]}];
   if(status==='incomplete'){prior.limitations=['Required branch evidence missing'];prior.testCoverage.assessment='unverified';}
   if(status==='failed')prior.error='Reviewer transport failed';
   entry['review-response'].tasks=[prior,{...structuredClone(f.result),taskId:'t3'}];entry.header.interrupted=true;delete entry.header.completedAt;
   await saveCheckpoint(checkpointPath(f.repo,'resume'),state);const preserved=structuredClone(entry['review-response'].tasks);
   const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async prompt=>{calls++;if(prompt.startsWith('Derive task attribution'))return scope(3);assert.match(prompt,/"taskId":"t2"/);return {...f.result,taskId:'t2'};}),publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
   const ack=await coordinator.start(f.repo,'resume',1,undefined,{operation:'resume'});
   assert.equal(calls,0);assert.equal(ack.attempt,1);assert.deepEqual(ack.completedTaskIds,['t1','t3']);assert.deepEqual(ack.pendingTaskIds,['t2']);
   await assert.rejects(coordinator.start(f.repo,'resume',1,undefined,{operation:'resume'}),/already-running/);
   await coordinator.settled(f.repo,'resume');
   const completed=f.read(ack.path).attempts[0]!;
   assert.deepEqual(completed['review-response'].tasks.slice(0,2),preserved);assert.equal(completed['review-response'].tasks[2]!.taskId,'t2');assert.equal(calls,2,'one attribution and one unfinished assessment');
   assert.equal(completed.header.status,status);assert.equal(completed.header.interrupted,undefined);assert.equal(completed['review-response'].crPublication,'complete');
  }finally{f.cleanup();}
 }
});

test('controller recovery: new trusted connection, old-owner refusal, disconnect retention and daemon lifetime distinction', async()=>{
 const f=await fixture(true,2);f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
 const state=f.checkpoint('controller-resume');state.attempts[0]!.header.reviewer='controller';state.attempts[0]!.header.interrupted=true;delete state.attempts[0]!.header.completedAt;state.attempts[0]!['review-response'].tasks=[structuredClone(f.result)];await saveCheckpoint(checkpointPath(f.repo,'controller-resume'),state);
 const host=await serve(f.repo,()=>{throw new Error('Actual controller must not spawn provider');});
 const a=await channel(host.path),foreign=await channel(host.path);let b:Awaited<ReturnType<typeof channel>>|undefined,c:Awaited<ReturnType<typeof channel>>|undefined;
 try{
  const request={repo:f.repo,epicHash:hash,reviewId:'controller-resume',attempt:1,operation:'resume'};
  const first=await a.call<ControllerFrame>('codeReview.task.start',request);assert.equal(first.kind,'scope');assert.deepEqual(first.completedTaskIds,['t1']);
  await assert.rejects(foreign.call('codeReview.task.assignment',request),/wrong-reviewer/);
  await a.call('codeReview.task.scope',{...request,scope:scope(2)});a.close();await eventually(()=>f.read(first.path).attempts[0]!.header.interrupted===true);
  b=await channel(host.path);const rebound=await b.call<ControllerFrame>('codeReview.task.start',request);assert.equal(rebound.attempt,1);assert.deepEqual(rebound.pendingTaskIds,['t2']);
  const task=await b.call<ControllerFrame>('codeReview.task.scope',{...request,scope:scope(2)});assert.equal(task.taskId,'t2');
  const done=await b.call<ControllerFrame>('codeReview.task.result',{...request,result:{...f.result,taskId:'t2'}});assert.equal(done.kind,'done');assert.equal(done.crPublication,'complete');
  c=await channel(host.path);const replay=await c.call<ControllerFrame>('codeReview.task.start',request);assert.equal(replay.kind,'done');
  await assert.rejects(b.call('codeReview.task.assignment',request),/wrong-reviewer/);
  const next={...request,operation:'start',attempt:2,packet:f.packet};const second=await c.call<ControllerFrame>('codeReview.task.start',next);assert.equal(second.attempt,2);assert.deepEqual(second.completedTaskIds,[]);
  b.close();await eventually(()=>b!.socket.destroyed);
  await assert.rejects(foreign.call('codeReview.task.start',next),/already-running/,'closing the previous owner must not release the new attempt');
  c.close();await eventually(()=>f.read(first.path).attempts[1]!.header.interrupted===true);
 }finally{a.close();foreign.close();b?.close();c?.close();await host.server.close();f.cleanup();}
 // The same explicit recovery survives submitter disconnect on the daemon route.
 const daemon=await fixture(true,2);let release:((result:TaskReviewResult)=>void)|undefined;
 const pending=daemon.checkpoint('daemon-resume');pending.attempts[0]!['review-response'].tasks=[structuredClone(daemon.result)];delete pending.attempts[0]!.header.completedAt;await saveCheckpoint(checkpointPath(daemon.repo,'daemon-resume'),pending);
 const server=await serve(daemon.repo,()=>provider(async prompt=>prompt.startsWith('Derive task attribution')?scope(2):new Promise(resolve=>{release=resolve;})));
 const client=await channel(server.path);
 try{
  const ack=await client.call<ReviewAcknowledgement>('codeReview.task.start',{repo:daemon.repo,epicHash:hash,reviewId:'daemon-resume',attempt:1,operation:'resume'});client.close();await eventually(()=>Boolean(release));release!({...daemon.result,taskId:'t2'});
  await eventually(()=>daemon.read(ack.path).attempts[0]!['review-response'].crPublication==='complete');assert.equal(daemon.read(ack.path).attempts[0]!.header.status,'passed');
 }finally{client.close();await server.server.close();daemon.cleanup();}
});

test('publication recovery: saved feedback projects once with zero provider calls and conflict-free replay',async()=>{
 const f=await fixture();let calls=0,publications=0;
 try{
  const make=()=>new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{calls++;throw new Error('No model for publication recovery');},publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,{...f.deps,...(++publications===1?{renderWrite:()=>{throw new Error('render temporarily unavailable');}}:{})})});
  const first=make(),ack=await first.start(f.repo,'publication',1,undefined,{operation:'resume'});await first.settled(f.repo,'publication');
  const retained=f.read(ack.path);assert.match(retained.attempts[0]!['review-response'].error!,/render temporarily unavailable/);assert.equal(retained.attempts[0]!['review-response'].crPublication,'pending');
  const json=`${f.repo}/.insrc/artifacts/CR-${hash}-s1.json`,before=f.readRecord(json);
  const second=make();await second.start(f.repo,'publication',1,undefined,{operation:'resume'});await second.settled(f.repo,'publication');
  assert.deepEqual(f.read(ack.path).attempts[0]!['review-response'].tasks,retained.attempts[0]!['review-response'].tasks);assert.equal(f.read(ack.path).attempts[0]!['review-response'].crPublication,'complete');assert.equal(f.read(ack.path).attempts[0]!['review-response'].error,undefined);assert.equal(f.readRecord(json).meta.revision,before.meta.revision);assert.equal(calls,0);
  const bytes=readFileSync(ack.path,'utf8');const done=await make().start(f.repo,'publication',1,undefined,{operation:'resume'});assert.equal(done.status,'passed');assert.deepEqual(done.pendingTaskIds,[]);assert.equal(readFileSync(ack.path,'utf8'),bytes);
 }finally{f.cleanup();}
});

test('retrigger metadata: resume and sequential attempts return the pinned attempt/status and preserved task IDs',async()=>{
 const f=await fixture();let calls=0;
 try{
  const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async prompt=>{calls++;return prompt.startsWith('Derive task attribution')?{summary:'Assess current input',tasks:[{taskId:'t1',changeIndexes:[0],testIndexes:[0],action:'reassess',reason:'New attempt requires fresh assessment'}]}:structuredClone(f.result);}),publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
  const first=await coordinator.start(f.repo,'metadata',1,f.packet);assert.equal(first.reviewer,'daemon');assert.deepEqual(first.pendingTaskIds,['t1']);await coordinator.settled(f.repo,'metadata');
  const prior=structuredClone(f.read(first.path).attempts[0]);
  const packet={...f.packet,storyId:`STORY-${hash}-s1`,functionalSummary:'New pinned attempt summary'};
  const second=await coordinator.start(f.repo,'metadata',2,packet);assert.equal(second.attempt,2);assert.equal(second.reviewId,first.reviewId);assert.equal(second.path,first.path);assert.equal(second.status,'pending');assert.deepEqual(second.completedTaskIds,[]);await coordinator.settled(f.repo,'metadata');
  const saved=f.read(first.path);assert.deepEqual(saved.attempts[0],prior);assert.equal(saved.attempts[1]!.header.attempt,2);assert.equal(saved.attempts[1]!.header.status,'passed');
  const done=await coordinator.start(f.repo,'metadata',2,undefined,{operation:'resume'});assert.equal(done.attempt,2);assert.equal(done.status,'passed');assert.deepEqual(done.completedTaskIds,['t1']);assert.equal(calls,3);assert.equal(f.readRecord(`${f.repo}/.insrc/artifacts/CR-${hash}-s1.json`).body.reviews.length,2);
 }finally{f.cleanup();}
});


test('controller recovery preserves every terminal outcome and selects missing task IDs',async()=>{
 for(const status of ['passed','changes_requested','incomplete','failed'] as const){
  const f=await fixture(true,3),owner={id:'controller',signal:new AbortController().signal};
  try{
   const state=f.checkpoint('sparse'),entry=state.attempts[0]!,prior=structuredClone(f.result);
   entry.header.reviewer='controller';delete entry.header.completedAt;prior.status=status;
   if(status==='changes_requested')prior.findings=[{severity:'MED',location:'source.js:1',message:'Selected behavior differs',rationale:'Required value is not maintained',evidenceReferences:[f.result.inspectedReferences[0]!]}];
   if(status==='incomplete'){prior.limitations=['Required verification unavailable'];prior.testCoverage.assessment='unverified';}
   if(status==='failed')prior.error='Reviewer unavailable';
   entry['review-response'].tasks=[prior,{...structuredClone(f.result),taskId:'t3'}];await saveCheckpoint(checkpointPath(f.repo,'sparse'),state);
   const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw new Error('Actual controller must not spawn provider');},publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
   const frame=await coordinator.startController(f.repo,'sparse',1,undefined,owner,hash,'resume');assert.equal(frame.kind,'scope');
   const task=await coordinator.controllerScope(f.repo,'sparse',1,scope(3),owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});assert.equal(task.taskId,'t2');
   const done=await coordinator.controllerResult(f.repo,'sparse',1,{...f.result,taskId:'t2'},owner,{taskId:task.taskId,executionId:task.executionId,sequence:task.nextSequence});assert.equal(done.kind,'done');assert.equal(done.status,status);
   assert.deepEqual(f.read(frame.path).attempts[0]!['review-response'].tasks.slice(0,2),entry['review-response'].tasks);
  }finally{f.cleanup();}
 }
});
