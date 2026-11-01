import test from 'node:test';
import { createServer,createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LLMProvider } from '../../../../shared/types.js';
import { saveCheckpoint,checkpointPath } from '../checkpoint.js';
import assert from 'node:assert/strict';
import { fixture } from './publication-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { readTaskReviewProgress } from '../../../../daemon/task-review-rpc.js';
import { pollTaskReviewProgress,formatReviewProgress,readReviewProgress } from '../progress-client.js';
import type { ReviewProgressView } from '../progress-view.js';
import { ReviewProgressTracker } from '../progress.js';

test('Read-only progress IPC validates scope and never invokes providers',async()=>{
 const f=await fixture();let calls=0;
 try{
  const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{calls++;throw Error('Must not invoke model');}});
  const path=f.repo+'/.insrc/tmp/code-review/publication.json',before=f.read(path);
  const view=await c.progress(f.repo,'publication',1);assert.equal(view.freshness,'unknown');assert.equal(view.progress,null);assert.equal(view.executionState,'inactive');assert.equal(view.completedTasks,1);
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
 const base:ReviewProgressView={reviewId:'progress',attempt:1,status:'running',executionState:'active',crPublication:'pending',completedTasks:0,totalTasks:1,interrupted:false,hasError:false,freshness:'live',progress:p};
 const life=new AbortController();
 const final=await pollTaskReviewProgress(request,{signal:life.signal,now:()=>now,sleep:async ms=>{assert.equal(ms,5000);now+=ms;},read:async()=>{
  calls++;return {...base,crPublication:now>=60000?'complete':'pending',progress:{...p,phase:now>=50000?'tool_running':'task_review'}};
 },onUpdate:text=>emitted.push({at:now,text})});
 assert.deepEqual(emitted.map(e=>e.at),[0,45000,50000,60000]);assert.equal(calls,13);assert.equal(final.crPublication,'complete');assert.ok(!emitted.some(e=>e.text.includes('%')));
 const stale=formatReviewProgress({...base,freshness:'stale'});assert.match(stale,/current process activity unknown/);assert.match(stale,/last meaningful activity unknown/);
 const cancel=new AbortController();let updates=0;
 const pending=pollTaskReviewProgress(request,{signal:cancel.signal,read:()=>new Promise(()=>{}),onUpdate:()=>updates++});cancel.abort(new Error('cancelled'));
 await assert.rejects(pending,/cancelled/);assert.equal(updates,0);
 const late=new AbortController();
 await assert.rejects(pollTaskReviewProgress(request,{signal:late.signal,read:async()=>{late.abort(new Error('cancelled before update'));return base;},onUpdate:()=>updates++}),/cancelled before update/);assert.equal(updates,0);
 await assert.rejects(pollTaskReviewProgress(request,{signal:life.signal,read:async()=>({...base,reviewId:'foreign'}),onUpdate:()=>updates++}),/identity mismatch/);assert.equal(updates,1);
});

test('Inactive execution stops polling without rewriting saved task status or restarting review',async()=>{
 const f=await fixture();let modelCalls=0;
 const c=new TaskReviewCoordinator({sources:f.deps.sources,save:async(path,cp)=>{
  if(cp.attempts.at(-1)!['review-response'].tasks.length)throw Error('disk full');await saveCheckpoint(path,cp);
 },provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async()=>{modelCalls++;return f.result;}} as unknown as LLMProvider)});
 try{
  const id='fatal-progress';await c.start(f.repo,id,1,f.packet);await c.settled(f.repo,id);
  const prior=f.read(checkpointPath(f.repo,id));
  for(const observer of [c,new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw Error('Must not restart');}})]){
   let reads=0,sleeps=0;const messages:string[]=[];
   const result=await pollTaskReviewProgress({repo:f.repo,reviewId:id,attempt:1},{signal:new AbortController().signal,read:async()=>{reads++;return observer.progress(f.repo,id,1);},sleep:async()=>{sleeps++;throw Error('Must not keep polling stopped execution');},onUpdate:text=>messages.push(text)});
   assert.equal(result.executionState,'inactive');assert.equal(result.status,'running');assert.equal(result.completedTasks,0);assert.equal(reads,1);assert.equal(sleeps,0);assert.match(messages[0]!,/explicit recovery required/);
  }
  assert.equal(modelCalls,1);assert.deepEqual(f.read(checkpointPath(f.repo,id)),prior);
 }finally{f.cleanup();}
});

test('Cancellation closes the real observation socket before its RPC deadline',async()=>{
 const root=mkdtempSync(join(tmpdir(),'review-observer-')),path=join(root,'ipc.sock'),life=new AbortController();
 let received!:()=>void,closed!:()=>void;const requestSeen=new Promise<void>(resolve=>{received=resolve;}),socketClosed=new Promise<void>(resolve=>{closed=resolve;});
 const server=createServer(socket=>{socket.on('data',data=>{assert.equal(JSON.parse(data.toString()).method,'codeReview.task.progress');received();});socket.on('close',()=>closed());});
 try{
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(path,resolve);});
  let connection:Socket|undefined,updates=0;
  const pending=pollTaskReviewProgress({repo:root,reviewId:'cancel',attempt:1},{signal:life.signal,read:request=>readReviewProgress(request,life.signal,()=>connection=createConnection(path)),onUpdate:()=>updates++});
  await requestSeen;life.abort(new Error('observer cancelled'));await assert.rejects(pending,/observer cancelled/);assert.equal(connection!.destroyed,true);assert.equal(updates,0);
  await socketClosed;
 }finally{life.abort();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(root,{recursive:true,force:true});}
});
