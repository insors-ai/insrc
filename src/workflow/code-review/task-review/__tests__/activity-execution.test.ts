import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fixture } from './publication-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { ReviewActivityUnsupportedError } from '../../../../shared/review-activity.js';
import type { LLMProvider, ActivityReviewSessionOpts, ReviewSessionOpts } from '../../../../shared/types.js';
const provider=(run:(opts:ActivityReviewSessionOpts)=>Promise<unknown>):LLMProvider=>({capabilities:{reviewActivity:true},runReviewSession:async(_prompt: string,_schema:unknown,opts:ReviewSessionOpts)=>{assert.equal(opts.mode,'activity');return run(opts as ActivityReviewSessionOpts);}} as unknown as LLMProvider);

test('daemon review progresses beyond old deadlines and expires only after 30 quiet minutes without retry',async()=>{
 const f=await fixture();let time=0,wake:(()=>void)|undefined,calls=0;
 try{
  const c=new TaskReviewCoordinator({sources:f.deps.sources,now:()=>time,timer:fn=>{wake=fn;return()=>{};},provider:()=>provider(async opts=>{
   calls++;assert.ok(!('deadlineMs' in opts));await opts.onActivity({sessionId:'native',sequence:1,kind:'session_started'});
   for(let sequence=2;sequence<=7;sequence++){time+=1_200_000;await opts.onActivity({sessionId:'native',sequence,kind:'model_output'});wake!();}
   return f.result;
  })});
  const ack=await c.start(f.repo,'long-progress',1,f.packet);await c.settled(f.repo,'long-progress');assert.equal(f.read(ack.path).attempts[0]!['review-response'].tasks[0]!.status,'passed');assert.equal(calls,1);
  const quiet=new TaskReviewCoordinator({sources:f.deps.sources,now:()=>time,timer:fn=>{wake=fn;return()=>{};},provider:()=>provider(async opts=>{
   calls++;time+=1_800_000;wake!();return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true}));
  })});
  const q=await quiet.start(f.repo,'quiet',1,f.packet);await quiet.settled(f.repo,'quiet');assert.equal(f.read(q.path).attempts[0]!['review-response'].tasks[0]!.status,'incomplete');assert.equal(calls,2);
  await quiet.start(f.repo,'quiet',1,undefined,{operation:'resume'});await quiet.settled(f.repo,'quiet');assert.equal(calls,2,'terminal task not repeated by resume');
 }finally{f.cleanup();}
});
test('accepted feedback is durable before receipt and survives CLI failure or conflicting duplicates',async()=>{
 const f=await fixture();let calls=0;
 try{
  const id='accepted';const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async opts=>{
   calls++;assert.deepEqual(await opts.onCandidate(f.result),{accepted:true});
   const disk=f.read(checkpointPath(f.repo,id));assert.equal(disk.attempts[0]!['review-response'].tasks[0]!.status,'passed');
   await assert.rejects(opts.onCandidate({...f.result,summary:'conflicting final value'}),/Conflicting accepted/);
   throw Error('CLI wrapper failed after durable receipt');
  })});
  const a=await c.start(f.repo,id,1,f.packet);await c.settled(f.repo,id);
  assert.deepEqual(f.read(a.path).attempts[0]!['review-response'].tasks,[f.result]);assert.equal(calls,1);
 }finally{f.cleanup();}
});
test('unsaved or invalid feedback never passes and persistence failure preserves the last durable checkpoint',async()=>{
 const f=await fixture();let writes=0,calls=0;
 try{
  const c=new TaskReviewCoordinator({sources:f.deps.sources,save:async(path,cp)=>{writes++;if(cp.attempts.at(-1)!['review-response'].tasks.length)throw Error('write rejected');await saveCheckpoint(path,cp);},provider:()=>provider(async opts=>{calls++;await opts.onCandidate(f.result);return f.result;})});
  const a=await c.start(f.repo,'write-failure',1,f.packet);await c.settled(f.repo,'write-failure');assert.deepEqual(f.read(a.path).attempts[0]!['review-response'].tasks,[]);assert.equal(calls,1);
  const invalid=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async opts=>{calls++;await opts.onCandidate({...f.result,taskId:'wrong'});return f.result;})});
  const b=await invalid.start(f.repo,'invalid-candidate',1,f.packet);await invalid.settled(f.repo,'invalid-candidate');assert.equal(f.read(b.path).attempts[0]!['review-response'].tasks[0]!.status,'failed');assert.equal(calls,2);
 }finally{f.cleanup();}
});
test('unsupported activity providers refuse before checkpoint writes or model execution',async()=>{
 const f=await fixture();let calls=0;
 try{
  const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>({capabilities:{},runReviewSession:async()=>{calls++;return f.result;}} as unknown as LLMProvider)});
  await assert.rejects(c.start(f.repo,'unsupported',1,f.packet),ReviewActivityUnsupportedError);
  assert.equal(existsSync(checkpointPath(f.repo,'unsupported')),false);assert.equal(calls,0);assert.equal(c.isActive(f.repo,'unsupported'),false);
 }finally{f.cleanup();}
});
