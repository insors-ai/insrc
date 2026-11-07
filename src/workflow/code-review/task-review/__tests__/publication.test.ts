/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { LLMProvider } from '../../../../shared/types.js';
import { emptyLifecycle } from '../../../artifact-core/decode.js';
import { codeReviewArtifactId } from '../../../storage.js';
import { enforceCodeReviewGate } from '../../gate.js';
import { saveCheckpoint, checkpointPath } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import { renderTaskReview, validateTaskBody } from '../record.js';
import { TaskReviewCoordinator } from '../coordinator.js';

import { fixture, hash } from './publication-fixture.js';

test('task-based CR: version-2 validation/rendering and no retired-format fallback',async()=>{
 const f=await fixture();try{
  const id=codeReviewArtifactId(hash,'s1');
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),record=f.readRecord(published.jsonPath);
  assert.equal(record.meta.schemaVersion,2);assert.equal(record.meta.reviewedBy,'daemon');assert.equal(record.meta.epicSlug,'review-fixture');
  assert.ok(!('dimensions' in record.body));assert.equal(validateTaskBody(record.body).reviews.length,1);
  const rendered=readFileSync(published.path,'utf8');assert.match(rendered,/task t1/);assert.match(rendered,/Optional clarity improvement/);assert.match(rendered,/source.js/);
  assert.equal(renderTaskReview(record.body).includes('dimension'),false);
  const history=await f.deps.through.store!.history.log(id);
 }finally{f.cleanup();}
});

test('CR publication: idempotent scoped summary and retained checkpoint on publication failure',async()=>{
 const f=await fixture();try{
  const path=checkpointPath(f.repo,'publication');
  await assert.rejects(publishTaskCheckpoint(f.repo,hash,'publication',{...f.deps,renderWrite:()=>{throw new Error('render disk failure');}}),/render disk failure/);
  const retained=f.read(path);assert.equal(retained.attempts[0]!.header.status,'running');assert.equal(retained.attempts[0]!['review-response'].crPublication,'pending');assert.equal(retained.attempts[0]!['review-response'].tasks.length,1);
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  const count=f.readRecord(published.jsonPath).meta.revision;
  await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  assert.equal(f.readRecord(published.jsonPath).body.reviews.length,1);assert.equal(f.readRecord(published.jsonPath).meta.revision,count,'identical replay adds no revision');
  const done=f.read(path);assert.equal(done.attempts[0]!.header.status,'passed');assert.equal(done.attempts[0]!['review-response'].crPublication,'complete');
  done.attempts[0]!['review-response'].tasks[0]!.advice.push('conflicting replay');writeFileSync(path,JSON.stringify(done));
  await assert.rejects(publishTaskCheckpoint(f.repo,hash,'publication',f.deps),/Conflicting publication/);
 }finally{f.cleanup();}
});

test('concurrent canonical publications preserve both summaries and the latest readable projection',async()=>{
 const f=await fixture();try{
  await saveCheckpoint(checkpointPath(f.repo,'other'),f.checkpoint('other'));
  const [a,b]=await Promise.all([publishTaskCheckpoint(f.repo,hash,'publication',f.deps),publishTaskCheckpoint(f.repo,hash,'other',f.deps)]);
  const record=f.readRecord(a.jsonPath);assert.deepEqual(record.body.reviews.map(r=>r.reviewId).sort(),['other','publication']);
  const markdown=readFileSync(b.path,'utf8');assert.match(markdown,/publication — attempt 1/);assert.match(markdown,/other — attempt 1/);
 }finally{f.cleanup();}
});

test('CR readers: partial task scope, incomplete/failed results and unknown versions cannot satisfy story review',async()=>{
 for(const status of ['passed','incomplete','failed','changes_requested'] as const){
  const f=await fixture();try{
   const cp=f.checkpoint(),result=cp.attempts[0]!!['review-response'].tasks[0]!;result.status=status;
   if(status==='incomplete'){result.limitations=['Unknown behavior'];result.testCoverage.assessment='unverified';}
   if(status==='failed')result.error='Provider failure';
   if(status==='changes_requested')result.findings=[{severity:'HIGH',location:'source.js:1',message:'Wrong condition',rationale:'Contradicts requirement',evidenceReferences:[result.inspectedReferences[0]!]}];
   await saveCheckpoint(checkpointPath(f.repo,'publication'),cp);
   const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
   assert.equal(enforceCodeReviewGate(f.repo,hash,'s1',{}).status,'blocked',status);
   const record=f.readRecord(published.jsonPath);record.meta.schemaVersion=99;writeFileSync(published.jsonPath,JSON.stringify(record));
   assert.equal(enforceCodeReviewGate(f.repo,hash,'s1',{}).status,'blocked','unknown versions never become no-review');
   assert.equal(enforceCodeReviewGate(f.repo,hash,'s1',{overrideReview:'Explicit test override'}).status,'overridden');
  }finally{f.cleanup();}
 }
 const f=await fixture(true);try{
  await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  assert.equal(enforceCodeReviewGate(f.repo,hash,'s1').status,'pass','complete bound whole-story assessment can pass');
  f.build.body.summary='Build changed';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
  assert.equal(enforceCodeReviewGate(f.repo,hash,'s1').status,'blocked','stale BUILD binding cannot pass');
 }finally{f.cleanup();}
});

test('coordinator marks an attempt terminal only after canonical CR publication is durable',async()=>{
 const f=await fixture();try{
  unlinkSync(checkpointPath(f.repo,'publication'));
  let terminalBeforeRender=false;
  const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async()=>f.result}) as unknown as LLMProvider,publish:(project,id)=>publishTaskCheckpoint(project,hash,id,{...f.deps,renderWrite:(path,content)=>{
   terminalBeforeRender=!['pending','running'].includes(f.read(checkpointPath(f.repo,id)).attempts[0]!.header.status);
   mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,content);
  }})});
  const ack=await coordinator.start(f.repo,'publication',1,f.packet);await coordinator.settled(f.repo,'publication');
  const saved=f.read(ack.path);assert.equal(terminalBeforeRender,false);assert.equal(saved.attempts[0]!.header.status,'passed');assert.equal(saved.attempts[0]!['review-response'].crPublication,'complete');
 }finally{f.cleanup();}
});


test('publication refuses an unknown stored CR version without overwriting future data',async()=>{
 const f=await fixture();try{
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  const record=f.readRecord(published.jsonPath);record.meta.schemaVersion=99;
  const future=JSON.stringify(record);writeFileSync(published.jsonPath,future);
  await assert.rejects(publishTaskCheckpoint(f.repo,hash,'publication',f.deps),/Unsupported prior CR version/);
  assert.equal(readFileSync(published.jsonPath,'utf8'),future);
  const unrevisioned = JSON.parse(future) as { meta: Record<string, unknown> };
  delete unrevisioned.meta['revision']; delete unrevisioned.meta['lifecycle'];
  const futureWithoutRevision = JSON.stringify(unrevisioned); writeFileSync(published.jsonPath, futureWithoutRevision);
  await assert.rejects(publishTaskCheckpoint(f.repo,hash,'publication',f.deps),/Unsupported prior CR version/);
  assert.equal(readFileSync(published.jsonPath,'utf8'),futureWithoutRevision);
 }finally{f.cleanup();}
});

test('canonical story aliases retain original submitted scope while using one CR identity',async()=>{
 const f=await fixture();try{
  const cp=f.checkpoint();cp.storyId=`STORY-${hash}-s1`;cp.attempts[0]!.submitted.storyId=cp.storyId;
  await saveCheckpoint(checkpointPath(f.repo,'publication'),cp);
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),record=f.readRecord(published.jsonPath);
  assert.equal(record.body.storyId,'s1');assert.equal(record.body.reviews[0]!.scope.storyId,cp.storyId);
 }finally{f.cleanup();}
});

test('CR publication: a stored review of a Story with a Plan (LLD and Plan, no story document) publishes',async()=>{
 const f=await fixture();try{
  const path=checkpointPath(f.repo,'publication'),stored=f.read(path);
  delete (f.packet.documents as { story?: unknown }).story;await f.refreshBinding();
  const updated=f.checkpoint();writeFileSync(path,JSON.stringify(updated));
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  assert.equal(f.readRecord(published.jsonPath).body.reviews.length,1);
  assert.equal(f.read(path).attempts[0]!['review-response'].crPublication,'complete');
 }finally{f.cleanup();}
});
