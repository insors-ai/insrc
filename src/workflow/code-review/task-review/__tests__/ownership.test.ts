import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { fixture, hash } from './publication-fixture.js';
import { channel, eventually, provider } from './controller-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { publishTaskCheckpoint } from '../publication.js';
import { IpcServer, directDispatch } from '../../../../daemon/server.js';
import { Router } from '../../../../daemon/threads/router.js';
import { TargetRegistry } from '../../../../daemon/threads/registry.js';
import { serveRequests } from '../../../../daemon/threads/worker-requests.js';
import { startTaskReview, coordinatorFor } from '../../../../daemon/task-review-rpc.js';
import type { ReviewAcknowledgement } from '../coordinator.js';

const scope = (count: number) => ({tasks:Array.from({length:count},(_,i)=>({taskId:`t${i+1}`,changeIndexes:[0],testIndexes:[0]}))});

test('Cross-session and worker/direct duplicate review-id admission starts exactly one execution', async () => {
 const f=await fixture(true); const {port1,port2}=new MessageChannel();let workerCalls=0,calls=0,release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 const registry=new TargetRegistry();registry.register({threadId:999,cls:'session'});
 serveRequests(port2,directDispatch({'codeReview.task.start':async()=>{workerCalls++;throw new Error('Worker must not own reviews');}}));
 const router=new Router({classOf:()=> 'session',registry,routed:new Set(['session']),local:directDispatch({'codeReview.task.start':(raw,trusted)=>startTaskReview(raw,trusted,{provider:()=>provider(async prompt=>{calls++;await pending;return f.result;})})})});
 router.attach(999,port1);
 const path=join(f.repo,'ownership.sock'),server=new IpcServer(router.forward,Date.now,path);await server.listen();
 const a=await channel(path),b=await channel(path),request={repo:f.repo,epicHash:hash,reviewId:'shared',attempt:1,packet:f.packet};
 try {
  const first=await a.call<ReviewAcknowledgement>('codeReview.task.start',request);
  await assert.rejects(b.call('codeReview.task.start',request),/already-running/);
  await assert.rejects(startTaskReview(request,undefined,{provider:()=>{throw new Error('Duplicate provider');}}),/already-running/);
  await eventually(()=>calls===1);assert.equal(workerCalls,0);a.close();release();
  await coordinatorFor(f.repo).settled(f.repo,'shared');
  assert.equal(f.read(first.path).attempts[0]!.header.status,'passed');assert.equal(calls,1);
 } finally {release();a.close();b.close();await server.close();port1.close();port2.close();f.cleanup();}
});

test('Different review ids overlap with serial per-review provider calls and merged CR history', async () => {
 const f=await fixture(true,2),releases=new Map<string,()=>void>(),running=new Map<string,number>();let peak=0;
 const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw new Error('Per-review provider required');},publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
 const make=(id:string)=>provider(async prompt=>{
  const own=(running.get(id)??0)+1;running.set(id,own);assert.equal(own,1);peak=Math.max(peak,[...running.values()].reduce((a,b)=>a+b,0));
  try {if(prompt.startsWith('Derive task attribution')){await new Promise<void>(resolve=>releases.set(id,resolve));return scope(2);}const taskId=prompt.includes('"taskId":"t1"')?'t1':'t2';return {...f.result,taskId};}
  finally {running.set(id,own-1);}
 });
 try {
  await coordinator.start(f.repo,'one',1,f.packet,{provider:()=>make('one'),epicHash:hash});
  await coordinator.start(f.repo,'two',1,f.packet,{provider:()=>make('two'),epicHash:hash});
  await eventually(()=>releases.size===2);assert.equal(peak,2);
  assert.deepEqual(await coordinator.withStoryCleanup(f.repo,hash,'s1',async()=>{throw new Error('Active cleanup');}),{busy:true});
  for(const release of releases.values())release();
  await coordinator.settled(f.repo,'one');await coordinator.settled(f.repo,'two');
  const cr=f.readRecord(join(f.repo,`.insrc/artifacts/CR-${hash}-s1.json`));assert.deepEqual(cr.body.reviews.map(r=>r.reviewId).sort(),['one','two']);assert.ok(cr.body.reviews.every(r=>r.tasks.length===2));
 } finally {for(const release of releases.values())release();await coordinator.settled(f.repo,'one');await coordinator.settled(f.repo,'two');f.cleanup();}
});

test('story fence accounts for admission and publication and releases after failures', async()=>{
 const f=await fixture(true);let entered!:()=>void,unblock!:()=>void;
 const hit=new Promise<void>(resolve=>{entered=resolve;}),wait=new Promise<void>(resolve=>{unblock=resolve;});
 const sources={isAncestor:f.deps.sources.isAncestor.bind(f.deps.sources),file:f.deps.sources.file.bind(f.deps.sources),changedRanges:f.deps.sources.changedRanges.bind(f.deps.sources),commit:async(oid:string)=>{entered();await wait;return f.deps.sources.commit(oid);}};
 const coordinator=new TaskReviewCoordinator({sources,provider:()=>provider(async prompt=>prompt.startsWith('Derive task attribution')?scope(1):f.result)});
 try {
  const starting=coordinator.start(f.repo,'admitting',1,f.packet,{epicHash:hash});await hit;
  assert.deepEqual(await coordinator.withStoryCleanup(f.repo,hash,'s1',async()=>false),{busy:true});unblock();await starting;await coordinator.settled(f.repo,'admitting');
  let release!:()=>void;const pubWait=new Promise<void>(resolve=>{release=resolve;});
  const publishing=coordinator.publishStored(f.repo,'admitting',hash,async()=>{await pubWait;throw new Error('Publication failure');});
  await eventually(()=>coordinator.isActive(f.repo,'admitting'));
  assert.deepEqual(await coordinator.withStoryCleanup(f.repo,hash,'s1',async()=>false),{busy:true});release();await assert.rejects(publishing,/Publication failure/);
  await assert.rejects(coordinator.withStoryCleanup(f.repo,hash,'s1',async()=>{throw new Error('Cleanup failure');}),/Cleanup failure/);
  await coordinator.withStoryCleanup(f.repo,hash,'s1',async()=>{
   await assert.rejects(coordinator.start(f.repo,'blocked',1,f.packet,{epicHash:hash}),/cleanup-in-progress/);
  });
  assert.deepEqual(await coordinator.withStoryCleanup(f.repo,hash,'s1',async()=>true),{busy:false,result:true});
 }finally{unblock();f.cleanup();}
});
