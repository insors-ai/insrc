/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { historicalFixture, historicalOids, historicalPaths, historicalHash, immutableText, rootLookup } from './historical-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { publishTaskCheckpoint } from '../publication.js';
import { channel,serve,provider } from './controller-fixture.js';
import type { ControllerFrame } from '../controller.js';
import { validateTaskBody } from '../record.js';

test('historical reproduction: exact immutable sources prove the old root failure and included fix without raw checkpoint claims',()=>{
 const old=immutableText(historicalOids.early,historicalPaths.source),fixed=immutableText(historicalOids.fixed,historicalPaths.source);
 assert.throws(()=>rootLookup(old),/foreign report or baseline/);assert.doesNotThrow(()=>rootLookup(fixed));
 const cr=JSON.parse(readFileSync('.insrc/artifacts/CR-9b04adb36cac716d-s3.json','utf8')) as {body:{reviews:{scope:{reviewSet:{commit:string}[]};tasks:{taskId:string;status:string;findings:{message:string}[]}[]}[]}};
 const first=cr.body.reviews[0]!;assert.ok(Object.values(historicalOids).every(oid=>first.scope.reviewSet.some(p=>p.commit===oid)));
 assert.equal(first.tasks.find(t=>t.taskId==='t3')!.status,'changes_requested');assert.equal(first.tasks.find(t=>t.taskId==='t9')!.status,'passed');
 assert.ok(first.tasks.find(t=>t.taskId==='t3')!.findings.some(f=>f.message.includes('history[0]')));
 assert.ok(first.tasks.some(t=>t.findings.some(f=>f.message.includes('requiredReferences'))));
});

test('historical reproduction: both reviewer routes inspect asserted final code and tests, suppress stale root finding and retain genuine requiredReferences defect',async()=>{
 for(const route of ['daemon','controller']as const){
  const f=await historicalFixture();let assessments=0,active=0,maxActive=0;
  try{
   const assess=async(prompt:string)=>{
    active++;maxActive=Math.max(maxActive,active);
    try{
     const task=JSON.parse(/\nTask: (.+)\nPinned documents:/.exec(prompt)![1]!) as {taskId:string;changes:{commit:string;path:string;blocks:{code?:string}[];origin:{commit:string}}[]};
     assessments++;assert.ok(task.changes.every(c=>c.commit===f.fixed));
     const code=task.changes.flatMap(c=>c.blocks.flatMap(b=>b.code?[b.code]:[])).join('\n');
     assert.ok(!code.includes('WORKTREE_CANARY')&&!code.includes('UNRELATED_HEAD_CANARY'));
     assert.ok(!code.includes('const root=history[0]?.report;'),'historical defect text is not reviewed code');
     assert.ok(code.includes('const root=history.find(a=>a.report)?.report;'),'actual final fix block must reach reviewer');
     const finalBlob=await f.deps.sources.file(f.fixed,historicalPaths.source);assert.equal(Buffer.from(finalBlob!.bytes).toString('utf8'),f.finalSource);assert.doesNotThrow(()=>rootLookup(Buffer.from(finalBlob!.bytes).toString('utf8')));
     const tests=task.changes.filter(c=>c.path===historicalPaths.fixTest).flatMap(c=>c.blocks.map(b=>b.code??'')).join('\n');
     assert.match(tests,/delete first\.report/);assert.match(tests,/resolveDesignCoverage\(\[first,second\],2,'keep',3,'daemon'\)/);
     assert.match(prompt,/Builder-reported tests:/);assert.match(prompt,/correction after an invalidated first attempt and full restart/);
     if(task.taskId==='t3'){
      const current=task.changes.filter(c=>c.path===historicalPaths.coverage).flatMap(c=>c.blocks.map(b=>b.code??'')).join('\n');
      assert.match(current,/assessDesignResult\(results\[i\].*,\[\],/);assert.ok(!f.oldTest.includes('requiredReferences')&&!f.fixTest.includes('requiredReferences'),'supplied assertions do not cover the genuine missing-reference path');
     }
     return f.result(task.taskId);
    }finally{active--;}
   };
   let path:string;
   if(route==='daemon'){
    const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async prompt=>prompt.startsWith('Derive task attribution')?f.scope:assess(prompt)),publish:(repo,id,_hash,baseline)=>publishTaskCheckpoint(repo,historicalHash,id,{...f.deps,...(baseline?{baseline}:{})})});
    const ack=await c.start(f.repo,'historical-synthetic',1,f.packet);path=ack.path;await c.settled(f.repo,'historical-synthetic');
   }else{
    f.build.meta.authoredBy='daemon';f.put(f.buildPath,f.build);const host=await serve(f.repo,()=>{throw new Error('Controller cannot spawn a daemon reviewer');}),client=await channel(host.path),request={repo:f.repo,epicHash:historicalHash,reviewId:'historical-synthetic',attempt:1};
    try{
     let frame=await client.call<ControllerFrame>('codeReview.task.start',{...request,packet:f.packet});path=frame.path;
     frame=await client.call<ControllerFrame>('codeReview.task.scope',{...request,scope:f.scope});
     while(frame.kind==='task')frame=await client.call<ControllerFrame>('codeReview.task.result',{...request,result:await assess(frame.prompt!)});
     assert.equal(frame.kind,'done');
    }finally{client.close();await host.server.close();}
   }
   const cp=f.read(path!),a=cp.attempts[0]!;assert.equal(assessments,2);assert.equal(maxActive,1);assert.equal(a['review-response'].crPublication,'complete');assert.equal(a.header.status,'changes_requested');
   assert.deepEqual(a['review-response'].tasks.map(t=>[t.taskId,t.status]),[['t3','changes_requested'],['t9','passed']]);
   assert.ok(a['review-response'].tasks.flatMap(t=>t.findings).every(f=>f.location.startsWith(historicalPaths.coverage+':')));
   assert.match(cp.attempts[0]!.submitted.functionalSummary,/Labelled synthetic/);assert.match(cp.attempts[0]!.submitted.functionalSummary,/NOT recovered/);
   assert.deepEqual(a.submitted.reviewSet,f.packet.reviewSet);assert.notEqual(f.git('rev-parse','HEAD'),f.fixed);
   const record=JSON.parse(readFileSync(`${f.repo}/.insrc/artifacts/CR-${historicalHash}-s1.json`,'utf8')) as {body:unknown};assert.equal(validateTaskBody(record.body).status,'changes_requested');
  }finally{f.cleanup();}
 }
});
