import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './publication-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { readTaskReviewProgress } from '../../../../daemon/task-review-rpc.js';
import { pollTaskReviewProgress,formatReviewProgress } from '../progress-client.js';
import type { ReviewProgressView } from '../progress-view.js';
import { ReviewProgressTracker } from '../progress.js';

test('Read-only progress IPC validates scope and never invokes providers',async()=>{
 const f=await fixture();let calls=0;
 try{
  const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{calls++;throw Error('Must not invoke model');}});
  const path=f.repo+'/.insrc/tmp/code-review/publication.json',before=f.read(path);
  const view=await c.progress(f.repo,'publication',1);assert.equal(view.freshness,'unknown');assert.equal(view.progress,null);assert.equal(view.completedTasks,1);
  assert.deepEqual(await readTaskReviewProgress({repo:f.repo,reviewId:'publication',attempt:1}),view);
  await assert.rejects(readTaskReviewProgress({repo:f.repo,reviewId:'../escape',attempt:1}));
  await assert.rejects(c.progress(f.repo,'publication',2),/Missing attempt/);
  await assert.rejects(c.progress(f.repo,'publication',0),/positive/);
  assert.equal(calls,0);assert.equal(c.isActive(f.repo,'publication'),false);assert.deepEqual(f.read(path),before);
 }finally{f.cleanup();}
});
test('Polling helper emits immediate transitions and45sec updates and cancels cleanly',async()=>{
 const request={repo:'/repo',reviewId:'progress',attempt:1};let now=0,calls=0;const emitted:{at:number;text:string}[]=[];
 const p=new ReviewProgressTracker().snapshot();
 const base:ReviewProgressView={reviewId:'progress',attempt:1,status:'running',crPublication:'pending',completedTasks:0,totalTasks:1,interrupted:false,hasError:false,freshness:'live',progress:p};
 const life=new AbortController();
 const final=await pollTaskReviewProgress(request,{signal:life.signal,now:()=>now,sleep:async ms=>{assert.equal(ms,5000);now+=ms;},read:async()=>{
  calls++;return {...base,crPublication:now>=60000?'complete':'pending',progress:{...p,phase:now>=50000?'tool_running':'task_review'}};
 },onUpdate:text=>emitted.push({at:now,text})});
 assert.deepEqual(emitted.map(e=>e.at),[0,45000,50000,60000]);assert.equal(calls,13);assert.equal(final.crPublication,'complete');assert.ok(!emitted.some(e=>e.text.includes('%')));
 const stale=formatReviewProgress({...base,freshness:'stale'});assert.match(stale,/current process activity unknown/);assert.match(stale,/last meaningful activity unknown/);
 const cancel=new AbortController();let updates=0;
 const pending=pollTaskReviewProgress(request,{signal:cancel.signal,read:()=>new Promise(()=>{}),onUpdate:()=>updates++});cancel.abort(new Error('cancelled'));
 await assert.rejects(pending,/cancelled/);assert.equal(updates,0);
 await assert.rejects(pollTaskReviewProgress(request,{signal:life.signal,read:async()=>({...base,reviewId:'foreign'}),onUpdate:()=>updates++}),/identity mismatch/);assert.equal(updates,1);
});
