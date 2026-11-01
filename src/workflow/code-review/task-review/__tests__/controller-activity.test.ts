import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, hash } from './publication-fixture.js';
import { channel, serve, eventually } from './controller-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import type { ControllerFrame } from '../controller.js';
import type { LLMProvider, ReviewSessionOpts } from '../../../../shared/types.js';
import { saveCheckpoint, checkpointPath } from '../checkpoint.js';
import { workflowReviewStart } from '../../../../daemon/workflow-review-rpc.js';

test('real IPC activity protocol fences owners, sequences, replays and resumed execution generations',async()=>{
 const f=await fixture();f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
 const host=await serve(f.repo,()=>{throw Error('No daemon provider on controller route');});
 const first=await channel(host.path),foreign=await channel(host.path);let resumed:Awaited<ReturnType<typeof channel>>|undefined;
 const base={repo:f.repo,epicHash:hash,reviewId:'activity-wire',attempt:1,packet:f.packet};
 try{
  await assert.rejects(first.rawCall('codeReview.task.start',base),/activity-v1/);
  const frame=await first.rawCall<ControllerFrame>('codeReview.task.start',{...base,timingProtocol:'activity-v1'});
  assert.equal(frame.timing?.mode,'activity');assert.equal(frame.timing?.inactivityMs,1800000);assert.ok(!('remainingMs' in frame));
  const message={repo:f.repo,reviewId:base.reviewId,attempt:1,taskId:frame.taskId,executionId:frame.executionId,sequence:1,event:{kind:'model_output'}};
  await assert.rejects(foreign.rawCall('codeReview.task.activity',message),/wrong-reviewer/);
  await assert.rejects(first.rawCall('codeReview.task.activity',{...message,sequence:2}),/Out-of-order/);
  const ack=await first.rawCall('codeReview.task.activity',message);
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.deepEqual(await first.rawCall('codeReview.task.activity',message),ack,'replay returns saved receipt');
  const poll=await first.rawCall<ControllerFrame>('codeReview.task.assignment',{repo:f.repo,reviewId:base.reviewId,attempt:1});
  assert.ok(poll.timing!.inactivityRemainingMs<1799990,'neither replay nor poll renews grace');
  await assert.rejects(first.rawCall('codeReview.task.activity',{...message,event:{kind:'tool_started',toolId:'changed'}}),/Conflicting/);
  await assert.rejects(first.rawCall('codeReview.task.activity',{...message,taskId:'wrong'}),/Conflicting/);
  first.close();await eventually(()=>f.read(frame.path).attempts[0]!.header.interrupted===true);
  resumed=await channel(host.path);
  const next=await resumed.rawCall<ControllerFrame>('codeReview.task.start',{...base,operation:'resume',timingProtocol:'activity-v1'});
  assert.notEqual(next.executionId,frame.executionId);
  await assert.rejects(resumed.rawCall('codeReview.task.activity',message),/Stale or wrong/);
  const result={repo:f.repo,reviewId:base.reviewId,attempt:1,taskId:next.taskId,executionId:next.executionId,sequence:next.nextSequence,result:f.result};
  const done=await resumed.rawCall<ControllerFrame>('codeReview.task.result',result);assert.equal(done.kind,'done');assert.equal(done.status,'passed');
  assert.deepEqual(await resumed.rawCall('codeReview.task.result',result),done);
  assert.deepEqual(f.read(next.path).attempts[0]!.submitted,f.packet);
 }finally{first.close();foreign.close();resumed?.close();await host.server.close();f.cleanup();}
});
test('controller and daemon share inactivity outcomes; controller write failure never returns accepted feedback',async()=>{
 const f=await fixture();const life=new AbortController(),owner={id:'controller',signal:life.signal};let clock=0,wake:(()=>void)|undefined;
 try{
  const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('No provider');},now:()=>clock,timer:fn=>{wake=fn;return()=>{};}});
  const start=await c.startController(f.repo,'controller-quiet',1,f.packet,owner,hash);
  clock=600000;await c.controllerActivity(f.repo,'controller-quiet',1,{kind:'model_output'},owner,{taskId:start.taskId,executionId:start.executionId,sequence:start.nextSequence});
  assert.equal((await c.controllerAssignment(f.repo,'controller-quiet',1,owner)).timing!.inactivityRemainingMs,1800000);
  clock+=1800000;wake!();await c.settled(f.repo,'controller-quiet');
  const controllerResult=f.read(start.path).attempts[0]!['review-response'].tasks[0]!;assert.equal(controllerResult.status,'incomplete');
  const daemon=new TaskReviewCoordinator({sources:f.deps.sources,now:()=>clock,timer:fn=>{wake=fn;return()=>{};},provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async(_p:string,_s:unknown,opts:ReviewSessionOpts)=>{
   clock+=1800000;wake!();return new Promise((_,reject)=>opts.signal!.addEventListener('abort',()=>reject(opts.signal!.reason),{once:true}));
  }} as unknown as LLMProvider)});
  const a=await daemon.start(f.repo,'daemon-quiet',1,f.packet);await daemon.settled(f.repo,'daemon-quiet');assert.deepEqual(f.read(a.path).attempts[0]!['review-response'].tasks[0],controllerResult);
  let writes=0;const broken=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('No provider');},save:async(path,cp)=>{writes++;if(cp.attempts.at(-1)!['review-response'].tasks.length)throw Error('write rejected');await saveCheckpoint(path,cp);}});
  const b=await broken.startController(f.repo,'controller-write',1,f.packet,owner,hash);
  await assert.rejects(broken.controllerResult(f.repo,'controller-write',1,f.result,owner,{taskId:b.taskId,executionId:b.executionId,sequence:b.nextSequence}),/write rejected/);
  assert.deepEqual(f.read(checkpointPath(f.repo,'controller-write')).attempts[0]!['review-response'].tasks,[]);
  assert.equal(broken.isActive(f.repo,'controller-write'),false);
  await assert.rejects(workflowReviewStart(),{message:'PENDING REVIEW RE-IMPLEMENTATION'});
 }finally{life.abort();f.cleanup();}
});

test('controller feedback queued before expiry commits before a later inactivity callback',async()=>{
 const f=await fixture(),life=new AbortController(),owner={id:'race-controller',signal:life.signal};
 let clock=0,wake:(()=>void)|undefined,block=false;
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),reading=new Promise<void>(resolve=>{entered=resolve;});
 const read=f.deps.sources.file.bind(f.deps.sources);
 f.deps.sources.file=async(...args)=>{if(block){block=false;entered();await gate;}return read(...args);};
 const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('No provider');},now:()=>clock,timer:fn=>{wake=fn;return()=>{};}});
 try{
  const start=await c.startController(f.repo,'controller-race',1,f.packet,owner,hash);clock=1_799_999;block=true;
  const submitting=c.controllerResult(f.repo,'controller-race',1,f.result,owner,{taskId:start.taskId,executionId:start.executionId,sequence:start.nextSequence});
  await reading;clock=1_800_001;wake!();release();
  const done=await submitting;assert.equal(done.status,'passed');assert.deepEqual(f.read(start.path).attempts[0]!['review-response'].tasks,[f.result]);
 }finally{release();life.abort();f.cleanup();}
});
