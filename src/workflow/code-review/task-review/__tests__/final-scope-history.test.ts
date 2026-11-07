import { attributionIdentity } from '../attribution-binding.js';
import { ReviewSessionTimeoutError } from '../../../../agent/providers/cli-provider.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, hash } from './publication-fixture.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import { renderTaskReview, validateTaskBody } from '../record.js';
import { failAttribution, unmappedTaskFailure } from '../attribution-failure.js';
import { projectionIdentity } from '../projection.js';

test('final history: source-verified shifted renamed per-task scope roundtrips offline and idempotently',async()=>{
 const f=await fixture();try{
  renameSync(join(f.repo,'source.js'),join(f.repo,'renamed.js'));
  f.put('renamed.js','// inserted\nexport const total = 2;\n');f.git('add','.');f.git('commit','-qm','rename and shift');
  const revision=f.git('rev-parse','HEAD');f.packet.reviewSet.push({commit:revision,parent:f.packet.reviewRevision!,files:[{path:'renamed.js',previousPath:'source.js',segments:[{after:[1,1]}]}]});f.packet.reviewRevision=revision;await f.refreshBinding();
  const cp=f.checkpoint(),result=cp.attempts[0]!['review-response'].tasks[0]!;
  result.status='changes_requested';result.inspectedReferences=[`${revision}:renamed.js`];
  result.findings=[{severity:'MED',location:'renamed.js:2',message:'Required behavior missing',rationale:'Requirement mismatch',evidenceReferences:result.inspectedReferences}];
  await saveCheckpoint(checkpointPath(f.repo,'publication'),cp);
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),body=f.readRecord(published.jsonPath).body;
  assert.equal(body.reviews[0]!.scope.finalScope!.entries[0]!.path,'renamed.js');
  const bytes=readFileSync(published.jsonPath,'utf8');await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);assert.equal(readFileSync(published.jsonPath,'utf8'),bytes);
  f.cleanup();assert.deepEqual(validateTaskBody(body),body);assert.match(renderTaskReview(body),/renamed.js:2/);
  const bad=structuredClone(body);bad.reviews[0]!.tasks[0]!.findings[0]!.location='source.js:1';assert.throws(()=>validateTaskBody(bad),/outside/);
 }finally{f.cleanup();}
});

test('final history: missing bindings partitions witnesses task subsets and foreign locations reject offline',async()=>{
 const f=await fixture(true,2);try{
  await f.refreshBinding([{taskId:'t1',changeIndexes:[0],testIndexes:[0]},{taskId:'t2',changeIndexes:[],testIndexes:[]}]);
  await saveCheckpoint(checkpointPath(f.repo,'publication'),f.checkpoint());
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),body=f.readRecord(published.jsonPath).body;
  for(const mutate of [
   (b:typeof body)=>{delete b.reviews[0]!.scope.finalScope;},
   (b:typeof body)=>{delete b.reviews[0]!.finalScopeIdentity;},
   (b:typeof body)=>{b.reviews[0]!.scope.finalScope!.tasks[0]!.changeIndexes=[];},
   (b:typeof body)=>{b.reviews[0]!.scope.finalScope!.testCount++;},
   (b:typeof body)=>{const r=b.reviews[0]!,s=r.scope.finalScope!;s.dispositions=[];const origins=r.scope.reviewSet.flatMap(p=>p.files.map(f=>({commit:p.commit,parent:p.parent,path:f.path,previousPath:f.previousPath??f.path,segments:f.segments})));s.identity=projectionIdentity(s.revision,origins,s.entries,s.dispositions);r.finalScopeIdentity=s.identity;},
   (b:typeof body)=>{const t=b.reviews[0]!.tasks[1]!;t.status='changes_requested';t.findings=[{severity:'MED',location:'source.js:1',message:'Foreign',rationale:'Not assigned',evidenceReferences:t.inspectedReferences}];b.reviews[0]!.status='changes_requested';b.status='changes_requested';},
  ]){const bad=structuredClone(body);mutate(bad);assert.throws(()=>validateTaskBody(bad));}
 }finally{f.cleanup();}
});

test('final history: unmapped attribution preserves bounded true failure without fabricated scopes or accepted downgrade',async()=>{
 const f=await fixture(true,2);try{
  const cp=f.checkpoint(),a=cp.attempts[0]!;
  assert.throws(()=>failAttribution(a,new Error('must not downgrade'),false),/downgraded/);
  delete a.header.acceptedAttribution;delete a.header.taskScopeIdentities;delete a.header.attributionIdentity;a.header.attributionState='pending';a['review-response'].tasks=[];
  failAttribution(a,new Error('Provider rejected scope: '+ 'é'.repeat(10000)),false);
  assert.ok(Buffer.byteLength(a.header.attributionFailure!.summary)<=8192);
  a['review-response'].tasks=a.header.selectedTaskIds.map(id=>unmappedTaskFailure(id,false));
  await saveCheckpoint(checkpointPath(f.repo,'publication'),cp);
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),body=f.readRecord(published.jsonPath).body,r=body.reviews[0]!;
  assert.equal(r.scope.finalScope!.attributionState,'unmapped_failure');assert.deepEqual(r.scope.finalScope!.tasks,[]);assert.equal(r.taskScopeIdentities,undefined);
  assert.match(renderTaskReview(body),/Provider rejected scope/);assert.equal(validateTaskBody(body).status,'failed');
  const bad=structuredClone(body);bad.reviews[0]!.tasks[0]!.findings=[{severity:'MED',location:'source.js:1',message:'Invented',rationale:'No mapping',evidenceReferences:[]}];assert.throws(()=>validateTaskBody(bad));
 }finally{f.cleanup();}
});

test('final history: fresh native and controller attribution failures publish all tasks and allow only the next attempt',async()=>{
 const {TaskReviewCoordinator}=await import('../coordinator.js');
 const {prepareReviewAdmission}=await import('../admission.js');
 const {channel,serve,provider}=await import('./controller-fixture.js');
 for(const route of ['daemon','daemon-timeout','controller']as const){
  const f=await fixture(true,2);let calls=0;
  try{
   if(route!=='controller'){
    const c=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>provider(async()=>{calls++;if(route==='daemon-timeout')throw new ReviewSessionTimeoutError(300000);throw new Error('Provider scope failure');}),publish:(repo,id)=>publishTaskCheckpoint(repo,hash,id,f.deps)});
    await c.start(f.repo,'unmapped',1,f.packet);await c.settled(f.repo,'unmapped');assert.equal(calls,1);
   }else{
    f.build.meta.authoredBy='daemon';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
    const host=await serve(f.repo,()=>{throw new Error('No daemon model permitted');}),client=await channel(host.path);
    try{
     await client.call('codeReview.task.start',{repo:f.repo,epicHash:hash,reviewId:'unmapped',attempt:1,packet:f.packet});
     for(let i=0;i<3;i++)await client.call('codeReview.task.scope',{repo:f.repo,epicHash:hash,reviewId:'unmapped',attempt:1,scope:{tasks:[{taskId:`foreign${i}`,changeIndexes:[0],testIndexes:[0]}]}});
    }finally{client.close();await host.server.close();}
   }
   const saved=f.read(checkpointPath(f.repo,'unmapped')),a=saved.attempts[0]!;
   assert.equal(a.header.attributionState,'failed');assert.equal(a['review-response'].crPublication,'complete');assert.equal(a['review-response'].tasks.length,2);
   assert.ok(a['review-response'].tasks.every(t=>t.status===(route==='daemon-timeout'?'incomplete':'failed')&&!t.findings.length));
   const next=await prepareReviewAdmission(f.repo,'unmapped',2,f.packet,route==='controller'?'controller':'daemon',f.deps.sources);assert.equal(next.attempt.header.attributionState,'pending');assert.deepEqual(next.checkpoint.attempts[0],a);
  }finally{f.cleanup();}
 }
});

test('final history: completed no-pin records retain byte-identical read-only coordinates',async()=>{
 const f=await fixture();try{
  const cp=f.checkpoint(),a=cp.attempts[0]!;delete a.submitted.reviewRevision;
  for(const k of ['finalScopeIdentity','attributionState','acceptedAttribution','taskScopeIdentities','attributionIdentity']as const)delete a.header[k];
  await saveCheckpoint(checkpointPath(f.repo,'publication'),cp);
  const p=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),body=f.readRecord(p.jsonPath).body,bytes=JSON.stringify(body);
  assert.equal(body.reviews[0]!.scope.finalScope,undefined);assert.equal(JSON.stringify(validateTaskBody(body)),bytes);
  const {prepareReviewAdmission}=await import('../admission.js');const saved=readFileSync(checkpointPath(f.repo,'publication'),'utf8');
  await prepareReviewAdmission(f.repo,'publication',1,undefined,'daemon',f.deps.sources,{operation:'resume'});assert.equal(readFileSync(checkpointPath(f.repo,'publication'),'utf8'),saved);
  await assert.rejects(prepareReviewAdmission(f.repo,'fresh-unpinned',1,a.submitted,'daemon',f.deps.sources),/reviewRevision/);assert.equal(readFileSync(checkpointPath(f.repo,'publication'),'utf8'),saved);
 }finally{f.cleanup();}
});

test('final history: replacement witness closure and graph are checked independently of recomputed digests',async()=>{
 const f=await fixture(true,2);try{
  f.put('source.js','export const total = 3;\n');f.git('add','source.js');f.git('commit','-qm','selected replacement');const revision=f.git('rev-parse','HEAD');
  f.packet.reviewSet.push({commit:revision,parent:f.packet.reviewRevision!,files:[{path:'source.js',segments:[{after:[1,1]}]}]});f.packet.reviewRevision=revision;
  await f.refreshBinding([{taskId:'t1',changeIndexes:[0,1],testIndexes:[0]},{taskId:'t2',changeIndexes:[1],testIndexes:[0]}]);await saveCheckpoint(checkpointPath(f.repo,'publication'),f.checkpoint());
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),body=f.readRecord(published.jsonPath).body;
  assert.ok(body.reviews[0]!.scope.finalScope!.dispositions.some(d=>d.replacementWitnesses.length));
  const resign=(b:typeof body)=>{const r=b.reviews[0]!,s=r.scope.finalScope!;const origins=r.scope.reviewSet.flatMap(p=>p.files.map(f=>({commit:p.commit,parent:p.parent,path:f.path,previousPath:f.previousPath??f.path,segments:f.segments})));r.finalScopeIdentity=s.identity=projectionIdentity(s.revision,origins,s.entries,s.dispositions);r.attributionIdentity=s.attributionIdentity=attributionIdentity('accepted',s.identity,s.selectedTaskIds,s.testCount,s.tasks);};
  const omitted=structuredClone(body);omitted.reviews[0]!.scope.finalScope!.tasks[0]!.changeIndexes=[0];resign(omitted);assert.throws(()=>validateTaskBody(omitted),/omits replacement witness/);
  const foreign=structuredClone(body);foreign.reviews[0]!.scope.finalScope!.dispositions.find(d=>d.kind==='superseded')!.replacementWitnesses=[{changeIndex:1,segmentIndex:99}];resign(foreign);assert.throws(()=>validateTaskBody(foreign),/Foreign replacement witness/);
  const empty=structuredClone(body);empty.reviews[0]!.scope.finalScope!.dispositions.find(d=>d.kind==='superseded')!.replacementWitnesses=[];resign(empty);assert.throws(()=>validateTaskBody(empty),/Invalid disposition/);
 }finally{f.cleanup();}
});
