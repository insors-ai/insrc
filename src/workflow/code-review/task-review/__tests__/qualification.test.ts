/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,unlinkSync } from 'node:fs';
import { fixture,hash } from './publication-fixture.js';
import { provider,channel,serve,eventually } from './controller-fixture.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { publishTaskCheckpoint } from '../publication.js';
import { readCapacityBaseline,requireCapacityBaseline } from '../capacity.js';
import { validateTaskBody } from '../record.js';
import type { ControllerFrame } from '../controller.js';
import { checkpointPath } from '../checkpoint.js';

const durable=(path:string)=>{const cp=JSON.parse(readFileSync(path,'utf8'));for(const a of cp.attempts)delete a.progress;return cp;};
const mapped={tasks:['t1','t2'].map(taskId=>({taskId,changeIndexes:[0],testIndexes:[0]}))};
test('qualification: independent IDs and final pins publish concurrently on both routes without changing each others feedback',async()=>{
 for(const route of ['daemon','controller']as const){const f=await fixture(true,2);try{
  unlinkSync(checkpointPath(f.repo,'publication'));
  const p1=structuredClone(f.packet),p2=structuredClone(f.packet);p1.functionalSummary='ONE';p2.functionalSummary='TWO';f.put('unrelated.js','HEAD_ONLY_CANARY\n');f.git('add','unrelated.js');f.git('commit','-qm','unrelated pin movement');p2.reviewRevision=f.git('rev-parse','HEAD');
  const output=(taskId:string,pin:string)=>({...f.result,taskId,inspectedReferences:[`${pin}:source.js`],testCoverage:{...f.result.testCoverage,evidenceReferences:[`${pin}:test.js`]}});
  let onePath:string,twoPath:string;
  if(route==='daemon'){
   let release!:()=>void;const gate=new Promise<void>(r=>{release=r;}),entered=new Set<string>(),active=new Map<string,number>();let maxWithin=0;
   const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async prompt=>{
    if(prompt.startsWith('Derive task attribution'))return mapped;
    const id=prompt.includes('Functional summary: ONE')?'ONE':'TWO',pin=id==='ONE'?p1.reviewRevision!:p2.reviewRevision!,task=JSON.parse(/\nTask: (.+)\nPinned documents:/.exec(prompt)![1]!) as {taskId:string;changes:{commit:string}[]};
    assert.ok(task.changes.every(x=>x.commit===pin));active.set(id,(active.get(id)??0)+1);maxWithin=Math.max(maxWithin,active.get(id)!);entered.add(id);
    try{await gate;return output(task.taskId,pin);}finally{active.set(id,active.get(id)!-1);}
   }),publish:(repo,id,_hash,baseline)=>publishTaskCheckpoint(repo,hash,id,{...f.deps,...(baseline?{baseline}:{})})});
   const one=await c.start(f.repo,'one',1,p1),two=await c.start(f.repo,'two',1,p2);onePath=one.path;twoPath=two.path;
   try{await eventually(()=>entered.size===2);assert.deepEqual(await c.withStoryCleanup(f.repo,hash,'s1',async()=>{throw Error('Active reviews must exclude cleanup');}),{busy:true});}finally{release();}
   await c.settled(f.repo,'one');await c.settled(f.repo,'two');assert.equal(maxWithin,1);
  }else{
   f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);const host=await serve(f.repo,()=>{throw Error('No controller daemon provider');}),one=await channel(host.path),two=await channel(host.path),common={repo:f.repo,epicHash:hash,attempt:1};
   try{
    let a=await one.call<ControllerFrame>('codeReview.task.start',{...common,reviewId:'one',packet:p1}),b=await two.call<ControllerFrame>('codeReview.task.start',{...common,reviewId:'two',packet:p2});onePath=a.path;twoPath=b.path;
    a=await one.call<ControllerFrame>('codeReview.task.scope',{...common,reviewId:'one',scope:mapped});b=await two.call<ControllerFrame>('codeReview.task.scope',{...common,reviewId:'two',scope:mapped});
    const before=durable(twoPath);while(a.kind==='task')a=await one.call<ControllerFrame>('codeReview.task.result',{...common,reviewId:'one',result:output(a.taskId!,p1.reviewRevision!)});assert.deepEqual(durable(twoPath),before,'one completion does not mutate the other checkpoint');
    const completedOne=durable(onePath);while(b.kind==='task')b=await two.call<ControllerFrame>('codeReview.task.result',{...common,reviewId:'two',result:output(b.taskId!,p2.reviewRevision!)});assert.deepEqual(durable(onePath),completedOne);
   }finally{one.close();two.close();await host.server.close();}
  }
  for(const [path,pin]of [[onePath!,p1.reviewRevision],[twoPath!,p2.reviewRevision]]){const a=f.read(path!).attempts[0]!;assert.equal(a.submitted.reviewRevision,pin);assert.equal(a['review-response'].crPublication,'complete');assert.equal(a.header.status,'passed');assert.equal(a['review-response'].tasks.length,2);}
  const record=JSON.parse(readFileSync(`${f.repo}/.insrc/artifacts/CR-${hash}-s1.json`,'utf8'))as{body:unknown};assert.deepEqual(validateTaskBody(record.body).reviews.map(r=>r.reviewId).sort(),['one','two']);
 }finally{f.cleanup();}}
});

test('qualification: canonical appended reviews requalify while altered baseline history or metadata is an explicit conflict',async()=>{
 const f=await fixture();try{
  const absent=await readCapacityBaseline(f.repo,hash,'s1');await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);await requireCapacityBaseline(absent);
  const baseline=await readCapacityBaseline(f.repo,hash,'s1'),other=f.checkpoint('other');const {saveCheckpoint}=await import('../checkpoint.js');await saveCheckpoint(checkpointPath(f.repo,'other'),other);await publishTaskCheckpoint(f.repo,hash,'other',f.deps);await requireCapacityBaseline(baseline);
  const {writeFileSync}=await import('node:fs');const current=JSON.parse(readFileSync(baseline.path,'utf8'));current.meta.capacityPadding='external edit';writeFileSync(baseline.path,JSON.stringify(current));await assert.rejects(requireCapacityBaseline(baseline),/metadata changed/);
  delete current.meta.capacityPadding;current.body.reviews.shift();writeFileSync(baseline.path,JSON.stringify(current));await assert.rejects(requireCapacityBaseline(baseline),/history changed/);
 }finally{f.cleanup();}
});

test('qualification: all 35 exact LLD subjects and ac1-ac5 have existing behavioral test references',async()=>{
 const ts=(await import('typescript')).default;
 const lld=JSON.parse(readFileSync('.insrc/artifacts/LLD-599f1d0bd42e0c37-s1.json','utf8'))as{body:{testStrategy:{testLevels:{subjects:string[]}[]}}};
 const manifest=JSON.parse(readFileSync('design/task-review-final-scope-qualification.json','utf8'))as{subjects:{subjectNumber:number;lldSubject:string;cases:{file:string;title:string}[]}[];acceptance:Record<string,number[]>;historicalEvidence:{reproduction:string}};
 assert.deepEqual(manifest.subjects.map(s=>s.lldSubject),lld.body.testStrategy.testLevels.flatMap(l=>l.subjects));assert.equal(manifest.subjects.length,35);
 const cache=new Map<string,Set<string>>();
 for(const [i,subject]of manifest.subjects.entries()){
  assert.equal(subject.subjectNumber,i+1);assert.ok(subject.cases.length);
  for(const c of subject.cases){
   let titles=cache.get(c.file);if(!titles){titles=new Set<string>();const tree=ts.createSourceFile(c.file,readFileSync(c.file,'utf8'),ts.ScriptTarget.Latest,true);const visit=(node:import('typescript').Node):void=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='test'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))titles!.add(node.arguments[0].text);ts.forEachChild(node,visit);};visit(tree);cache.set(c.file,titles);}
   assert.ok(titles.has(c.title),`Subject ${i+1} cites missing behavioral case ${c.file}: ${c.title}`);
  }
 }
 assert.deepEqual(Object.keys(manifest.acceptance).sort(),['ac1','ac2','ac3','ac4','ac5']);
 for(const ids of Object.values(manifest.acceptance)){assert.ok(ids.length);assert.ok(ids.every(i=>Number.isInteger(i)&&i>=1&&i<=35));}
 assert.match(manifest.historicalEvidence.reproduction,/not recovered raw checkpoint/);
});
