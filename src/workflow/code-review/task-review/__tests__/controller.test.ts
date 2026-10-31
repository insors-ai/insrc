/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startTaskReview } from '../../../../daemon/task-review-rpc.js';
import type { ControllerFrame } from '../controller.js';
import type { TaskReviewResult } from '../contracts.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { publishTaskCheckpoint } from '../publication.js';
import { fixture, hash } from './publication-fixture.js';
import { channel, eventually, provider, serve } from './controller-fixture.js';

test('controller parity: actual independent-party routing and equivalent assignment/result/CR semantics',async()=>{
 const f=await fixture();let calls=0;
 f.result.limitations=['Required branch evidence is unavailable'];f.result.testCoverage.assessment='partial';
 const host=await serve(f.repo,()=>provider(async()=>{calls++;return structuredClone(f.result);}));
 const client=await channel(host.path);
 try{
  const ack=await client.call<{path:string}>('codeReview.task.start',{repo:f.repo,epicHash:hash,reviewId:'daemon-route',attempt:1,packet:f.packet,reviewer:'controller',party:'controller'});
  await eventually(()=>f.read(ack.path).attempts[0]!['review-response'].crPublication==='complete');
  assert.equal(f.read(ack.path).attempts[0]!.header.reviewer,'daemon','caller party labels cannot select the reviewer');
  f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
  const frame=await client.call<ControllerFrame>('codeReview.task.start',{repo:f.repo,epicHash:hash,reviewId:'controller-route',attempt:1,packet:f.packet,reviewer:'daemon'});
  assert.equal(frame.reviewer,'controller');assert.equal(frame.kind,'task');assert.equal(frame.taskId,'t1');assert.ok(frame.remainingMs!>0&&frame.remainingMs!<=300000);
  const done=await client.call<ControllerFrame>('codeReview.task.result',{repo:f.repo,reviewId:'controller-route',attempt:1,result:f.result});
  assert.equal(done.kind,'done');assert.equal(done.crPublication,'complete');assert.equal(done.status,'incomplete');assert.equal(calls,1,'actual controller review never spawns a daemon CLI reviewer');
  const record=f.readRecord(join(f.repo,`.insrc/artifacts/CR-${hash}-s1.json`));
  assert.deepEqual(record.body.reviews.map(review=>review.reviewer),['daemon','controller']);
  assert.deepEqual(record.body.reviews[0]!.tasks,record.body.reviews[1]!.tasks);
  assert.deepEqual(record.body.reviews[0]!.scope,record.body.reviews[1]!.scope);
 }finally{client.close();await host.server.close();f.cleanup();}
});

test('controller submissions: replay idempotency, conflicting/foreign result refusal and missing-checkpoint errors',async()=>{
 const f=await fixture();f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
 const host=await serve(f.repo,()=>{throw new Error('Controller must not resolve a provider');});
 const client=await channel(host.path),foreign=await channel(host.path);
 try{
  const start=await client.call<ControllerFrame>('codeReview.task.start',{repo:f.repo,epicHash:hash,reviewId:'controller-replay',attempt:1,packet:f.packet});
  const params={repo:f.repo,reviewId:'controller-replay',attempt:1,result:f.result};
  await assert.rejects(startTaskReview({repo:f.repo,epicHash:hash,reviewId:'untrusted-owner',attempt:1,packet:f.packet,owner:{id:'forged',signal:{}}}),/Trusted controller connection lifetime/);
  assert.equal(existsSync(checkpointPath(f.repo,'untrusted-owner')),false);
  const before=readFileSync(start.path,'utf8');
  await assert.rejects(foreign.call('codeReview.task.result',{...params,owner:'forged',reviewer:'controller',connectionIdentity:'forged'}),/wrong-reviewer/);
  assert.equal(readFileSync(start.path,'utf8'),before);
  await assert.rejects(client.call('codeReview.task.result',{...params,result:{...f.result,taskId:'foreign'}}),/Wrong or unassigned task/);
  assert.equal(readFileSync(start.path,'utf8'),before);
  await assert.rejects(client.call('codeReview.task.result',{...params,attempt:2}),/Attempt mismatch/);
  assert.equal(readFileSync(start.path,'utf8'),before);
  const done=await client.call<ControllerFrame>('codeReview.task.result',params);
  const after=readFileSync(start.path,'utf8'),cr=readFileSync(join(f.repo,`.insrc/artifacts/CR-${hash}-s1.json`),'utf8');
  assert.equal((await client.call<ControllerFrame>('codeReview.task.result',params)).status,done.status);
  assert.equal(readFileSync(start.path,'utf8'),after);assert.equal(readFileSync(join(f.repo,`.insrc/artifacts/CR-${hash}-s1.json`),'utf8'),cr);
  await assert.rejects(client.call('codeReview.task.result',{...params,result:{...f.result,advice:['Conflicting feedback']}}),/Conflicting accepted submission/);
  assert.equal(readFileSync(start.path,'utf8'),after);
  await assert.rejects(client.call('codeReview.task.assignment',{repo:f.repo,reviewId:'missing',attempt:1}),/missing-checkpoint/);
  assert.equal(existsSync(checkpointPath(f.repo,'missing')),false);
  const daemon=f.checkpoint('daemon-owned');daemon.attempts[0]!.header.reviewer='daemon';await saveCheckpoint(checkpointPath(f.repo,'daemon-owned'),daemon);
  await assert.rejects(client.call('codeReview.task.result',{...params,reviewId:'daemon-owned'}),/wrong-reviewer/);
 }finally{client.close();foreign.close();await host.server.close();f.cleanup();}
});

test('review disconnect: stop controller work and retain completed tasks while daemon reviewer outlives submitter',async()=>{
 const f=await fixture(true,2);f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
 let release:((value:TaskReviewResult)=>void)|undefined;
 const host=await serve(f.repo,()=>provider(()=>new Promise(resolve=>{release=resolve;})));
 const controller=await channel(host.path);let daemonClient:Awaited<ReturnType<typeof channel>>|undefined;
 try{
  const frame=await controller.call<ControllerFrame>('codeReview.task.start',{repo:f.repo,epicHash:hash,reviewId:'controller-stop',attempt:1,packet:f.packet});assert.equal(frame.kind,'scope');
  const scoped=await controller.call<ControllerFrame>('codeReview.task.scope',{repo:f.repo,reviewId:'controller-stop',attempt:1,scope:{tasks:['t1','t2'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))}});assert.equal(scoped.taskId,'t1');
  const next=await controller.call<ControllerFrame>('codeReview.task.result',{repo:f.repo,reviewId:'controller-stop',attempt:1,result:f.result});assert.equal(next.taskId,'t2');
  controller.close();await eventually(()=>f.read(frame.path).attempts[0]!.header.interrupted===true);
  const stopped=f.read(frame.path);assert.deepEqual(stopped.attempts[0]!['review-response'].tasks.map(result=>result.taskId),['t1']);assert.equal(stopped.attempts[0]!.header.activeTaskId,'t2');
  daemonClient=await channel(host.path);
  await assert.rejects(daemonClient.call('codeReview.task.assignment',{repo:f.repo,reviewId:'controller-stop',attempt:1}),/explicit retrigger/);
  f.build.meta.authoredBy='controller';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
  const ack=await daemonClient.call<{path:string}>('codeReview.task.start',{repo:f.repo,epicHash:hash,reviewId:'daemon-survives',attempt:1,packet:{...f.packet,taskId:'t1'}});
  daemonClient.close();await eventually(()=>release!==undefined);release!(structuredClone(f.result));
  await eventually(()=>f.read(ack.path).attempts[0]!['review-response'].crPublication==='complete');
  assert.equal(f.read(ack.path).attempts[0]!.header.status,'passed');assert.equal(f.read(ack.path).attempts[0]!.header.reviewer,'daemon');
 }finally{controller.close();daemonClient?.close();await host.server.close();f.cleanup();}
});


test('controller deadlines remain task-local and accepted replays cannot reset the next budget',async()=>{
 const f=await fixture(true,2),lifetime=new AbortController();let clock=0;const callbacks:(()=>void)[]=[];
 const owner={id:'trusted-test-channel',signal:lifetime.signal};
 const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw new Error('No daemon reviewer');},now:()=>clock,timer:callback=>{callbacks.push(callback);return()=>{};},publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
 try{
  const initial=await coordinator.startController(f.repo,'controller-clock',1,f.packet,owner,hash);assert.equal(initial.kind,'scope');
  await coordinator.controllerScope(f.repo,'controller-clock',1,{tasks:['t1','t2'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))},owner);
  clock=1000;const next=await coordinator.controllerResult(f.repo,'controller-clock',1,f.result,owner);assert.equal(next.taskId,'t2');assert.equal(next.remainingMs,600000);
  callbacks[0]!(); // Simulate an already queued first-task timer after cancellation.
  const pending=await coordinator.controllerAssignment(f.repo,'controller-clock',1,owner);
  assert.equal(pending.kind,'task');assert.equal(pending.taskId,'t2');assert.equal(f.read(pending.path).attempts[0]!['review-response'].tasks.length,1);
  clock=2000;const replay=await coordinator.controllerResult(f.repo,'controller-clock',1,f.result,owner);assert.equal(replay.remainingMs,599000);
  clock=601001;await assert.rejects(coordinator.controllerResult(f.repo,'controller-clock',1,{...f.result,taskId:'t2'},owner),/deadline expired/);
  callbacks[1]!();const done=await coordinator.controllerAssignment(f.repo,'controller-clock',1,owner);
  assert.equal(done.kind,'done');assert.deepEqual(f.read(done.path).attempts[0]!['review-response'].tasks.map(result=>result.status),['passed','incomplete']);
 }finally{lifetime.abort();await coordinator.settled(f.repo,'controller-clock');f.cleanup();}
});
