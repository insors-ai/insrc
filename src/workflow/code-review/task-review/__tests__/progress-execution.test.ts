import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,hash } from './publication-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import type { LLMProvider,ActivityReviewSessionOpts } from '../../../../shared/types.js';
import { checkpointPath } from '../checkpoint.js';

test('Daemon and controller produce equivalent progress without renewing inactivity on heartbeat',async()=>{
 const f=await fixture();const life=new AbortController(),owner={id:'controller',signal:life.signal};let now=0;
 try{
  const c=new TaskReviewCoordinator({sources:f.deps.sources,now:()=>now,provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async(_p:string,_s:unknown,opts:ActivityReviewSessionOpts)=>{
   await opts.onActivity({sessionId:'native',sequence:1,kind:'session_started'});
   now=1000;await opts.onActivity({sessionId:'native',sequence:2,kind:'model_output'});
   await opts.onActivity({sessionId:'native',sequence:3,kind:'heartbeat'});
   return f.result;
  }} as unknown as LLMProvider)});
  const a=await c.start(f.repo,'daemon-progress',1,f.packet);await c.settled(f.repo,'daemon-progress');
  const d=f.read(a.path).attempts[0]!.progress!;assert.equal(d.phase,'complete');assert.equal(d.completedTasks,1);assert.ok(d.lastMeaningfulActivityAt);assert.equal(d.processState,'unknown');
  const b=await c.startController(f.repo,'controller-progress',1,f.packet,owner,hash);
  now=2000;await c.controllerActivity(f.repo,'controller-progress',1,{kind:'model_output'},owner,{taskId:b.taskId,executionId:b.executionId,sequence:b.nextSequence});
  const frame=await c.controllerAssignment(f.repo,'controller-progress',1,owner);assert.equal(frame.timing!.inactivityRemainingMs,1800000);
  await c.controllerResult(f.repo,'controller-progress',1,f.result,owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});
  const p=f.read(b.path).attempts[0]!.progress!;assert.equal(p.phase,d.phase);assert.equal(p.completedTasks,d.completedTasks);assert.ok(p.lastMeaningfulActivityAt);assert.equal(p.task!.id,d.task!.id);
 }finally{life.abort();f.cleanup();}
});
test('Terminal task result supersedes pending progress and stops timers',async()=>{
 const f=await fixture();const life=new AbortController(),owner={id:'controller',signal:life.signal};
 try{
  const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('No provider');}});
  const a=await c.startController(f.repo,'terminal-progress',1,f.packet,owner,hash);
  const frame=await c.controllerResult(f.repo,'terminal-progress',1,f.result,owner,{taskId:a.taskId,executionId:a.executionId,sequence:a.nextSequence});assert.equal(frame.kind,'done');
  const disk=f.read(checkpointPath(f.repo,'terminal-progress'));assert.deepEqual(disk.attempts[0]!['review-response'].tasks,[f.result]);assert.equal(disk.attempts[0]!.progress!.phase,'complete');assert.equal(c.isActive(f.repo,'terminal-progress'),false);
  await assert.rejects(c.controllerActivity(f.repo,'terminal-progress',1,{kind:'model_output'},owner,{taskId:a.taskId,executionId:a.executionId,sequence:2}));
  assert.deepEqual(f.read(a.path),disk);
 }finally{life.abort();f.cleanup();}
});
