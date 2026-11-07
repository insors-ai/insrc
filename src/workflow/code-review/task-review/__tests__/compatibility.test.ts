/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { historyFixture } from './history-fixture.js';
import { fixture, hash } from './publication-fixture.js';
import { channel, eventually, provider, serve } from './controller-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import type { ControllerFrame } from '../controller.js';
import { checkpointPath, loadCheckpoint, saveCheckpoint } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import { codeTaskCommands } from '../policy.js';
import { prepareReviewPacket } from '../packet.js';
import { claudeReviewSessionArgs } from '../../../../agent/providers/cli-provider.js';
import { validateTaskBody } from '../record.js';
import { validateAgainstSchema } from '../../../../agent/providers/structured-output.js';

const attribution={tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))};

test('recovery end-to-end: real IPC/Git, both adapters, interruption boundaries and correct attempt metadata',async()=>{
 const f=await historyFixture('controller');f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
 const host=await serve(f.repo,()=>{throw new Error('Controller route must not start a daemon reviewer');});
 const first=await channel(host.path),foreign=await channel(host.path);let second:Awaited<ReturnType<typeof channel>>|undefined;
 try{
  const request={repo:f.repo,epicHash:hash,reviewId:'history',attempt:2,packet:f.packet};
  const start=await first.call<ControllerFrame>('codeReview.task.start',request);assert.equal(start.kind,'scope');
  const task=await first.call<ControllerFrame>('codeReview.task.scope',{...request,scope:f.scope()});assert.equal(task.taskId,'t2');assert.deepEqual(task.completedTaskIds,['t1']);
  const before=f.read(start.path);assert.equal(before.attempts[1]!['review-response'].origins![0]!.sourceAttempt,1);first.close();await eventually(()=>f.read(start.path).attempts[1]!.header.interrupted===true);
  await assert.rejects(foreign.call('codeReview.task.assignment',{...request}),/explicit retrigger/);
  second=await channel(host.path);const resumed=await second.call<ControllerFrame>('codeReview.task.start',{...request,packet:undefined,operation:'resume'});
  assert.equal(resumed.attempt,2);assert.deepEqual(resumed.completedTaskIds,['t1']);assert.deepEqual(resumed.pendingTaskIds,['t2','t3']);assert.deepEqual(f.read(start.path).attempts[0],f.original);
  const continued=resumed;assert.equal(continued.taskId,'t2');
  const done=await second.call<ControllerFrame>('codeReview.task.result',{...request,result:f.fresh('t2')});assert.equal(done.status,'incomplete');assert.equal(done.crPublication,'complete');
  const saved=f.read(start.path);assert.equal(saved.attempts[1]!['review-response'].origins!.filter(origin=>origin.taskId==='t1').length,1);assert.deepEqual(saved.attempts[1]!['review-response'].tasks[0],before.attempts[1]!['review-response'].tasks[0]);
  const replay=await second.call<ControllerFrame>('codeReview.task.start',{...request,packet:undefined,operation:'resume'});assert.equal(replay.kind,'done');assert.equal(replay.status,'incomplete');
 }finally{first.close();foreign.close();second?.close();await host.server.close();f.cleanup();}
 // Daemon execution interrupted at a failed durable write: only saved task results survive.
 const d=await fixture(true,3);let fail=true;const counts=new Map<string,number>();
 const reviewer=()=>provider(async prompt=>{if(prompt.startsWith('Derive task attribution'))return attribution;const taskId=/"taskId":"(t\d+)"/.exec(prompt)![1]!;counts.set(taskId,(counts.get(taskId)??0)+1);return {...d.result,taskId};});
 try{
  const initial=new TaskReviewCoordinator({sources:d.deps.sources,provider:reviewer,save:async(path,state)=>{if(fail&&state.reviewId==='durability'&&state.attempts[0]!['review-response'].tasks.length===2){fail=false;throw new Error('Simulated task-result disk failure');}await saveCheckpoint(path,state);},publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,d.deps)});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(counts.size,0,'constructing a coordinator does not auto-resume existing files');
  const ack=await initial.start(d.repo,'durability',1,d.packet);await initial.settled(d.repo,'durability');const retained=d.read(ack.path);assert.deepEqual(retained.attempts[0]!['review-response'].tasks.map(task=>task.taskId),['t1']);
  const restarted=new TaskReviewCoordinator({sources:d.deps.sources,provider:reviewer,publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,d.deps)});
  await restarted.start(d.repo,'durability',1,undefined,{operation:'resume'});await restarted.settled(d.repo,'durability');
  assert.deepEqual(d.read(ack.path).attempts[0]!['review-response'].tasks[0],retained.attempts[0]!['review-response'].tasks[0]);assert.equal(counts.get('t1'),1);assert.equal(counts.get('t2'),2,'only the unsaved interrupted task may repeat');assert.equal(counts.get('t3'),1);assert.equal(d.read(ack.path).attempts[0]!['review-response'].crPublication,'complete');
 }finally{d.cleanup();}
});

test('unavailable pinned source rejects recovery without mutation or provider use and releases reservation',async()=>{
 const f=await fixture();let calls=0;
 const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{calls++;throw new Error('No model needed for publication recovery');},publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
 const commit=f.packet.reviewSet[0]!.commit,object=join(f.repo,'.git','objects',commit.slice(0,2),commit.slice(2)),bytes=readFileSync(object),path=checkpointPath(f.repo,'publication'),checkpoint=readFileSync(path,'utf8');
 try{
  unlinkSync(object);await assert.rejects(coordinator.start(f.repo,'publication',1,undefined,{operation:'resume'}),/unavailable|source|commit/);assert.equal(calls,0);assert.equal(coordinator.isActive(f.repo,'publication'),false);assert.equal(readFileSync(path,'utf8'),checkpoint);
  writeFileSync(object,bytes);await coordinator.start(f.repo,'publication',1,undefined,{operation:'resume'});await coordinator.settled(f.repo,'publication');assert.equal(calls,0);assert.equal(f.read(path).attempts[0]!['review-response'].crPublication,'complete');
 }finally{f.cleanup();}
});

test('old checkpoint and CR compatibility: absent origin fields mean containing-attempt assessment',async()=>{
 const f=await fixture();
 try{
  const path=checkpointPath(f.repo,'publication'),before=readFileSync(path,'utf8'),old=await loadCheckpoint(path);assert.equal(old!.attempts[0]!['review-response'].origins,undefined);assert.equal(readFileSync(path,'utf8'),before,'read does not backfill old history');
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),record=f.readRecord(published.jsonPath);assert.equal(record.body.reviews[0]!.origins,undefined);assert.equal(record.body.reviews[0]!.attempt,1);
  const raw=readFileSync(published.jsonPath,'utf8');assert.deepEqual(validateTaskBody(record.body),record.body);assert.equal(readFileSync(published.jsonPath,'utf8'),raw);assert.equal(readFileSync(published.path,'utf8').includes('not a fresh assessment'),false);
 }finally{f.cleanup();}
});

test('migration compatibility: preserve origin-bearing history and reject unsupported downgrade readers',async()=>{
 const f=await historyFixture();
 try{
  const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async prompt=>prompt.startsWith('Derive task attribution')?f.scope():f.fresh('t2')),publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
  await coordinator.start(f.repo,'history',2,f.packet);await coordinator.settled(f.repo,'history');
  const json=join(f.repo,`.insrc/artifacts/CR-${hash}-s1.json`),original=readFileSync(json,'utf8'),body=f.readRecord(json).body;
  const frozen=JSON.parse(readFileSync(new URL('./fixtures/s1-task-body-schema.json',import.meta.url),'utf8')) as {sourceCommit:string;sourcePath:string;schema:Record<string,unknown>};
  assert.match(frozen.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(frozen.sourcePath,'src/workflow/code-review/task-review/record.ts');
  assert.equal(validateAgainstSchema(frozen.schema,body).ok,false,'the actual frozen S1 strict-reader schema refuses new fields');assert.deepEqual(validateTaskBody(body),body,'current reader preserves the new record');
  const old=structuredClone(body);for(const summary of old.reviews){delete summary.origins;delete summary.reassessmentSummary;}
  assert.equal(validateAgainstSchema(frozen.schema,old).ok,true,'old-form records remain valid under the frozen production schema');
  assert.equal(readFileSync(json,'utf8'),original,'downgrade rejection never strips stored provenance');assert.equal(body.reviews.length,2);assert.equal(body.reviews[1]!.origins!.length,2);
 }finally{f.cleanup();}
});


test('committed test-record evidence receives exact native read grants without widening design defaults',async()=>{
 const f=await fixture();
 try{
  const path=`.insrc/artifacts/TESTS-${hash}-s1.json`;f.put(path,{meta:{workflow:'tests',epicHash:hash,storyId:'s1'},body:{tasks:[]}});f.git('add',path);f.git('commit','-qm','test evidence');const commit=f.git('rev-parse','HEAD'),ref=`${commit}:${path}`;
  f.packet.tests[0]!.evidenceReferences=[ref,`${commit}:bad --output /tmp/unrelated`,'HEAD:.env'];
  const prepared=await prepareReviewPacket(f.packet,f.deps.sources),commands=codeTaskCommands(prepared),args=claudeReviewSessionArgs({},[],commands);
  assert.ok(commands.includes(`git show ${ref}`));assert.equal(commands.some(command=>command.includes('--output')||command.includes('HEAD:.env')),false);
  assert.ok(args[args.indexOf('--allowedTools')+1]!.includes(`Bash(git show ${ref})`));
  const design=claudeReviewSessionArgs({},[]);assert.equal(design[design.indexOf('--tools')+1],'Read,Grep,Glob');
 }finally{f.cleanup();}
});
