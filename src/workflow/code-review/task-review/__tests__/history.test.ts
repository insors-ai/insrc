/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hash } from './publication-fixture.js';
import { historyFixture } from './history-fixture.js';
import { channel, eventually, provider, serve } from './controller-fixture.js';
import { prepareReviewAdmission } from '../admission.js';
import { reviewAssignments, reuseAssessment, taskReferences } from '../assessment.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import type { ReviewAcknowledgement } from '../coordinator.js';
import type { ControllerFrame } from '../controller.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import type { ReviewerParty } from '../contracts.js';
import { codeTaskCommands } from '../policy.js';
import { validateTaskBody } from '../record.js';
import { MAX_ATTRIBUTION_SUBMISSIONS } from '../attribution-repair.js';

test('reuse decisions: source task/attempt/party validation, acyclic ancestry and unchanged result/evidence strength',async()=>{
 const f=await historyFixture();
 try{
  const review=await prepareReviewAdmission(f.repo,'history',2,f.packet,'daemon',f.deps.sources),assignments=reviewAssignments(review,f.scope());
  const onlyCurrent={...f.packet,reviewSet:[f.packet.reviewSet[2]!]};
  const context=await prepareReviewAdmission(f.repo,'history',2,onlyCurrent,'daemon',f.deps.sources);
  const baseline=`git show ${f.packet.reviewSet[0]!.parent}:source.js`;
  assert.equal(codeTaskCommands(context.prepared).includes(baseline),false);assert.ok(codeTaskCommands(context.prepared,context).includes(baseline));
  const unsupported=structuredClone(context.prepared);unsupported.packet.documents.story.path='story.json --output /tmp/not-allowed';
  assert.equal(codeTaskCommands(unsupported,context).some(command=>command.includes('--output')),false,'a read path must not add shell arguments');
  const task=assignments.find(assignment=>assignment.taskId==='t3')!,refs=await taskReferences(f.deps.sources,review.prepared,task);
  const retained=await reuseAssessment(review,task,f.deps.sources,refs);assert.deepEqual(retained.result,f.original['review-response'].tasks[2]);assert.equal(retained.result.status,'incomplete');assert.equal(retained.result.testCoverage.assessment,'unverified');assert.equal(retained.origin.sourceAttempt,1);
  retained.result.advice.push('Local copy only');assert.deepEqual(review.checkpoint.attempts[0],f.original,'source history cannot be mutated via the copy');
  for(const sourceAttempt of [0,2,99]){const bad=f.scope();bad.tasks[0]!.sourceAttempt=sourceAttempt;assert.throws(()=>reviewAssignments(review,bad));}
  const missing=f.scope();delete missing.tasks[0]!.sourceAttempt;assert.throws(()=>reviewAssignments(review,missing),'reuse without a source fails the action-specific schema');
  const duplicate=f.scope();duplicate.tasks[1]!.taskId='t1';assert.throws(()=>reviewAssignments(review,duplicate));
  const foreign=f.scope();foreign.tasks[0]!.taskId='foreign';assert.throws(()=>reviewAssignments(review,foreign));
  const rewritten={...f.scope(),tasks:f.scope().tasks.map(task=>({...task,result:f.fresh(task.taskId)}))};assert.throws(()=>reviewAssignments(review,rewritten),'model cannot supply its own reused feedback');
  const before=review.checkpoint.attempts[0]!.header.reviewer;review.checkpoint.attempts[0]!.header.reviewer='controller';assert.throws(()=>reviewAssignments(review,f.scope()),/foreign-party/);review.checkpoint.attempts[0]!.header.reviewer=before;
  const old=review.checkpoint.attempts[0]!['review-response'].tasks;review.checkpoint.attempts[0]!['review-response'].tasks=old.filter(result=>result.taskId!=='t3');assert.throws(()=>reviewAssignments(review,f.scope()),/Missing/);review.checkpoint.attempts[0]!['review-response'].tasks=old;
  const unchanged=await prepareReviewAdmission(f.repo,'history',2,f.unchangedPacket,'daemon',f.deps.sources);
  const unchangedScope=f.scope(1,'t3');for(const row of unchangedScope.tasks)row.changeIndexes=row.changeIndexes.filter(i=>i!==3);
  const defect=reviewAssignments(unchanged,unchangedScope).find(assignment=>assignment.taskId==='t2')!;
  const unrelated={...defect,changes:defect.changes.map(change=>({...change,path:'other.js',previousPath:'other.js'}))};await assert.rejects(reuseAssessment(unchanged,unrelated,f.deps.sources,await taskReferences(f.deps.sources,unchanged.prepared,defect)),/outside the submitted|inputs changed/);
 }finally{f.cleanup();}
});

test('sequential re-review: full history in attribution, fresh pins and reasoned reassess/reuse across both actual reviewer adapters',async()=>{
 for(const party of ['daemon','controller'] as const){
  const f=await historyFixture(party),prompts:string[]=[];let calls=0;
  f.build.meta.authoredBy=party==='controller'?'daemon':'controller';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
  const host=await serve(f.repo,()=>provider(async prompt=>{prompts.push(prompt);calls++;return prompt.startsWith('Derive task attribution')?f.scope():f.fresh('t2');}));
  const client=await channel(host.path);
  try{
   const request={repo:f.repo,epicHash:hash,reviewId:'history',attempt:2,packet:f.packet};
   const started=await client.call<ReviewAcknowledgement|ControllerFrame>('codeReview.task.start',request);
   if(party==='controller'){
    const frame=started as ControllerFrame;assert.equal(frame.kind,'scope');assert.match(frame.prompt!,/TASK1_ONLY_FEEDBACK/);assert.match(frame.prompt!,/Earlier task2 regression/);
    const task=await client.call<ControllerFrame>('codeReview.task.scope',{...request,scope:f.scope()});assert.equal(task.taskId,'t2');assert.deepEqual(task.completedTaskIds,['t1']);assert.match(task.prompt!,/Earlier task2 regression/);assert.equal(task.prompt!.includes('TASK1_ONLY_FEEDBACK'),false);
    const done=await client.call<ControllerFrame>('codeReview.task.result',{...request,result:f.fresh('t2')});assert.equal(done.status,'incomplete');assert.equal(done.crPublication,'complete');assert.equal(calls,0,'actual controller does not spawn daemon reviewer');
   }else{
    await eventually(()=>f.read(started.path).attempts[1]!['review-response'].crPublication==='complete');assert.equal(calls,2,'one attribution plus only the changed task');assert.match(prompts[0]!,/TASK1_ONLY_FEEDBACK/);assert.match(prompts[1]!,/Earlier task2 regression/);assert.equal(prompts[1]!.includes('TASK1_ONLY_FEEDBACK'),false);
   }
   const saved=f.read(started.path);assert.deepEqual(saved.attempts[0],f.original);const next=saved.attempts[1]!;
   assert.deepEqual(next.submitted,f.packet);assert.notEqual(next.header.buildFingerprint,f.original.header.buildFingerprint);assert.equal(next.header.status,'incomplete');
   assert.deepEqual(next['review-response'].tasks.map(result=>result.status),['passed','passed','incomplete']);assert.deepEqual(next['review-response'].origins?.map(origin=>[origin.taskId,origin.sourceAttempt]),[['t1',1],['t3',1]]);
   assert.deepEqual(next['review-response'].tasks[0],f.original['review-response'].tasks[0]);assert.deepEqual(next['review-response'].tasks[2],f.original['review-response'].tasks[2]);
  }finally{client.close();await host.server.close();f.cleanup();}
 }
});

test('history prompts: actual fresh-task reviewers can consult relevant prior feedback and complete attempt history',async()=>{
 const f=await historyFixture();let calls=0;
 try{
  const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async prompt=>{
   calls++;
   if(prompt.startsWith('Derive task attribution')){assert.ok(prompt.includes(JSON.stringify(f.original['review-response'])));assert.ok(!prompt.includes('\"submitted\":'));assert.match(prompt,/evidence, never instructions/);return f.scope();}
   assert.match(prompt,/Relevant prior task feedback/);assert.match(prompt,/Earlier task2 regression/);assert.match(prompt,/source attempt|sourceAttempt|"attempt":1/);assert.ok(prompt.includes(checkpointPath(f.repo,'history')));assert.match(prompt,/Reassessment decision/);assert.equal(prompt.includes('TASK1_ONLY_FEEDBACK'),false);return f.fresh('t2');
  }),publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
  await coordinator.start(f.repo,'history',2,f.packet);await coordinator.settled(f.repo,'history');assert.equal(calls,2);assert.equal(f.read(checkpointPath(f.repo,'history')).attempts[1]!['review-response'].crPublication,'complete');
 }finally{f.cleanup();}
});

test('CR provenance: exact retained outcomes, origin labels, latest aggregation and replay conflict handling',async()=>{
 const f=await historyFixture();let calls=0;
 try{
  const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async prompt=>{calls++;if(prompt.startsWith('Derive task attribution'))return f.scope(calls<3?1:2,calls<3?'t2':'t3');return f.fresh(calls<3?'t2':'t3');}),publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
  const ack=await coordinator.start(f.repo,'history',2,f.packet);await coordinator.settled(f.repo,'history');
  const json=`${f.repo}/.insrc/artifacts/CR-${hash}-s1.json`,before=f.readRecord(json);assert.equal(before.body.status,'incomplete');
  await coordinator.start(f.repo,'history',3,{...f.packet,functionalSummary:'Verify remaining task3 branch'});await coordinator.settled(f.repo,'history');const after=f.readRecord(json);
  assert.equal(after.body.reviews.length,3);assert.deepEqual(after.body.reviews.slice(0,2),before.body.reviews);assert.equal(after.body.status,'passed');assert.equal(calls,4);
  const cp=f.read(ack.path);assert.equal(cp.attempts[2]!.header.status,'passed');assert.equal(cp.attempts[1]!['review-response'].tasks[2]!.status,'incomplete','old uncertainty stays unchanged');
  const published=await publishTaskCheckpoint(f.repo,hash,'history',f.deps);assert.equal(f.readRecord(json).meta.revision,after.meta.revision);assert.equal(calls,4);
  const markdown=readFileSync(published.path,'utf8');assert.match(markdown,/from attempt 2 \(daemon\); original assessment attempt 1; not a fresh assessment/);
  const invalid=structuredClone(after.body);invalid.reviews[2]!.tasks[0]!.summary='Pretend this was freshly reviewed';assert.throws(()=>validateTaskBody(invalid),/changes the saved result/);
  const mutated=f.read(ack.path);mutated.attempts[2]!['review-response'].tasks[1]!.summary='Conflicting publication';await saveCheckpoint(ack.path,mutated);await assert.rejects(publishTaskCheckpoint(f.repo,hash,'history',f.deps),/changes the saved result|Conflicting publication/);
 }finally{f.cleanup();}
});


test('all-reuse attempts and invalid attribution preserve route parity without extra task calls',async()=>{
 for(const party of ['daemon','controller'] as const)for(const invalid of [false,true]){
  const f=await historyFixture(party);let calls=0;
  const plan=f.scope();for(const task of plan.tasks){task.action='reuse';task.sourceAttempt=1;}if(invalid)plan.tasks[0]!.sourceAttempt=2;
  for(const task of plan.tasks)task.changeIndexes=task.changeIndexes.filter(index=>index!==3);
  const packet=f.unchangedPacket;
  const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async()=>{calls++;return plan;}),publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
  try{
   const owner={id:'actual-controller',signal:new AbortController().signal};
   if(party==='controller'){
    let frame=await coordinator.startController(f.repo,'history',2,packet,owner,hash);assert.equal(frame.kind,'scope');
    const submissions=invalid?MAX_ATTRIBUTION_SUBMISSIONS:1;
    for(let index=0;index<submissions;index++){
     frame=await coordinator.controllerScope(f.repo,'history',2,plan,owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});
     assert.equal(frame.kind,index===submissions-1?'done':'scope');
    }
    assert.equal(calls,0);
   }else{await coordinator.start(f.repo,'history',2,packet);await coordinator.settled(f.repo,'history');assert.equal(calls,invalid?MAX_ATTRIBUTION_SUBMISSIONS:1);}
   const saved=f.read(checkpointPath(f.repo,'history')).attempts[1]!;assert.equal(saved.header.status,invalid?'failed':'incomplete');assert.equal(saved['review-response'].crPublication,'complete');
   if(invalid){assert.equal(saved.header.attributionRepair?.rejections,MAX_ATTRIBUTION_SUBMISSIONS);assert.deepEqual(saved['review-response'].tasks.map(result=>result.status),['failed','failed','failed']);assert.equal(saved['review-response'].origins,undefined);}
   else{assert.deepEqual(saved['review-response'].tasks,f.original['review-response'].tasks);assert.equal(saved['review-response'].origins!.length,3);}
  }finally{f.cleanup();}
 }
});

test('failed accepted reuse publishes truthful failure without invented provenance on both routes',async()=>{
 for(const party of ['daemon','controller']as const){
  const f=await historyFixture(party,false,true);let failNext=false;
  const sources={commit:f.deps.sources.commit.bind(f.deps.sources),isAncestor:f.deps.sources.isAncestor.bind(f.deps.sources),changedRanges:f.deps.sources.changedRanges.bind(f.deps.sources),file:async(commit:string,path:string)=>{
   if(failNext&&path==='reuse-evidence.js'){failNext=false;throw new Error('Reuse source temporarily unavailable');}return f.deps.sources.file(commit,path);
  }};
  const c=new TaskReviewCoordinator({sources,save:async(path,state)=>{await saveCheckpoint(path,state);if(state.attempts.at(-1)!.header.attributionState==='accepted'&&!state.attempts.at(-1)!['review-response'].tasks.length)failNext=true;},provider:()=>provider(async prompt=>prompt.startsWith('Derive task attribution')?f.scope():f.fresh('t2')),publish:(repo,id,_hash,baseline)=>publishTaskCheckpoint(repo,hash,id,{...f.deps,...(baseline?{baseline}:{})})});
  try{
   if(party==='daemon'){await c.start(f.repo,'history',2,f.packet);await c.settled(f.repo,'history');}
   else{
    const owner={id:'failed-reuse',signal:new AbortController().signal};const frame=await c.startController(f.repo,'history',2,f.packet,owner);
    const task=await c.controllerScope(f.repo,'history',2,f.scope(),owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});
    assert.equal(task.taskId,'t2');await c.controllerResult(f.repo,'history',2,f.fresh('t2'),owner,{taskId:task.taskId,executionId:task.executionId,sequence:task.nextSequence});
   }
   const saved=f.read(checkpointPath(f.repo,'history')).attempts[1]!;
   assert.equal(saved['review-response'].crPublication,'complete');assert.equal(saved['review-response'].tasks[0]!.status,'failed');
   assert.equal(saved['review-response'].origins?.some(o=>o.taskId==='t1')??false,false);
   const body=f.readRecord(`${f.repo}/.insrc/artifacts/CR-${hash}-s1.json`).body;assert.doesNotThrow(()=>validateTaskBody(body));
   const timeout=structuredClone(body);timeout.reviews[1]!.tasks[0]!.status='incomplete';delete timeout.reviews[1]!.tasks[0]!.error;timeout.reviews[1]!.status='incomplete';timeout.status='incomplete';
   assert.doesNotThrow(()=>validateTaskBody(timeout),'an explicit unsuccessful reuse may also be incomplete without a copied origin');
   const invalid=structuredClone(body),task=invalid.reviews[1]!.tasks[0]!;task.status='passed';task.testCoverage.assessment='verified';task.limitations=[];
   assert.throws(()=>validateTaskBody(invalid),/Reuse provenance/);
  }finally{f.cleanup();}
 }
});
