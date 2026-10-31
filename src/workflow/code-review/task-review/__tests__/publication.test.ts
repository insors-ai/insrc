/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGitTools } from '../../../../daemon/tools/builtins/git/index.js';
import { roundWriterFor } from '../../../../daemon/lifecycle-registry.js';
import type { LLMProvider } from '../../../../shared/types.js';
import { emptyLifecycle } from '../../../artifact-core/decode.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId } from '../../../storage.js';
import { enforceCodeReviewGate } from '../../gate.js';
import { reviewedBuildFingerprint } from '../../build-freshness.js';
import { RegistryReviewSources } from '../sources.js';
import type { ReviewCheckpoint, ReviewPacket, TaskReviewResult } from '../contracts.js';
import { saveCheckpoint, checkpointPath } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import type { TaskReviewBody } from '../record.js';
import { renderTaskReview, validateTaskBody } from '../record.js';
import { TaskReviewCoordinator } from '../coordinator.js';

registerGitTools();
const hash='1234567890abcdef', date='2026-10-31T14:00:00.000Z';
async function fixture(full=false) {
 const repo=mkdtempSync(join(tmpdir(),'task-review-publication-'));
 const git=(...args:string[])=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
 const put=(path:string,value:unknown)=>{mkdirSync(join(repo,path,'..'),{recursive:true});writeFileSync(join(repo,path),typeof value==='string'?value:JSON.stringify(value));};
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');
 const meta={epicHash:hash,storyId:'s1',repoPath:repo,createdAt:date,epicCreatedAt:date,epicSlug:'review-fixture'};
 const storyPath=`.insrc/artifacts/DEF-${hash}.json`,lldPath=`.insrc/artifacts/LLD-${hash}-s1.json`,planPath=`.insrc/artifacts/PLAN-${hash}-s1.json`;
 put(storyPath,{meta:{...meta,workflow:'define'},body:{stories:[{id:'s1'}]}});
 put(lldPath,{meta:{...meta,workflow:'design.story'},body:{}});
 put(planPath,{meta:{...meta,workflow:'plan'},body:{tasks:[{id:'t1',title:'Calculate',summary:'Calculate total',size:'S',order:1,dependsOn:[],acceptanceChecks:['Behavior holds'],derivedFrom:['c1'],tests:[{level:'unit',name:'Behavior'}]}]},citations:[{id:'c1',kind:'stakeholder',ref:'Fixture'}]});
 const build={meta:{...meta,workflow:'build',authoredBy:'controller'},body:{kind:'build',summary:'Fixture build',tasks:[{id:'t1',passed:true}]}};
 put(`.insrc/artifacts/BUILD-${hash}-s1.json`,build);
 put('source.js','export const total = 1;\n');put('test.js','// Assertion evidence fixture\n');git('add','.');git('commit','-qm','base');const parent=git('rev-parse','HEAD');
 put('source.js','export const total = 2;\n');git('add','.');git('commit','-qm','selected');const commit=git('rev-parse','HEAD');
 const packet:ReviewPacket={storyId:'s1',...(!full?{taskId:'t1'}:{}),functionalSummary:'Fixture',documents:{story:{path:storyPath,commit:parent},lld:{path:lldPath,commit:parent},plan:{path:planPath,commit:parent}},reviewSet:[{commit,parent,files:[{path:'source.js',segments:[{before:[1,1],after:[1,1]}]}]}],tests:[{file:'test.js',cases:['Behavior'],command:'node --test test.js',result:'not_run',executionDetails:'Schema/queue fixture, not a model review',evidenceReferences:[]}]};
 const result:TaskReviewResult={taskId:'t1',status:'passed',summary:'Inspected behavior',findings:[],testCoverage:{assessment:'verified',explanation:'Relevant assertions inspected',evidenceReferences:[`${commit}:test.js`]},limitations:[],advice:['Optional clarity improvement'],inspectedReferences:[`${commit}:source.js`],executedTests:[]};
 const checkpoint=(id='publication'):ReviewCheckpoint=>({schemaVersion:1,reviewId:id,project:repo,storyId:'s1',...(!full?{taskId:'t1'}:{}),attempts:[{header:{attempt:1,reviewer:'daemon',status:'running',createdAt:date,completedAt:date,selectedTaskIds:['t1'],...(full?{buildFingerprint:reviewedBuildFingerprint(build)}:{})},submitted:structuredClone(packet),'review-response':{summary:'All assessments done; publication pending',tasks:[structuredClone(result)],crPublication:'pending'}}]});
 const sources=new RegistryReviewSources({repoPath:repo,sessionId:'publication-test',requestId:1,send:()=>{}}),through=roundWriterFor(repo);
 const deps={sources,through};
 const read=(path:string):ReviewCheckpoint=>JSON.parse(readFileSync(path,'utf8')) as ReviewCheckpoint;
 const readRecord=(path:string):{meta:{schemaVersion:number;reviewedBy:string;epicSlug?:string;revision?:number};body:TaskReviewBody}=>JSON.parse(readFileSync(path,'utf8'));
 await saveCheckpoint(checkpointPath(repo,'publication'),checkpoint());
 return {repo,git,put,packet,result,checkpoint,deps,read,readRecord,build,cleanup:()=>rmSync(repo,{recursive:true,force:true})};
}

test('task-based CR: version-2 validation/rendering and version-1 compatibility without fabricated dimensions',async()=>{
 const f=await fixture();try{
  const id=codeReviewArtifactId(hash,'s1');
  await f.deps.through.store!.write({id,description:'',references:[],attachments:[],lifecycle:emptyLifecycle(0),payload:{body:{kind:'code-review',verdict:'pass',counts:{high:0,med:0,low:0},dimensions:[]},citations:[]}},f.deps.through.actor);
  assert.equal(enforceCodeReviewGate(f.repo,hash,'s1',{checkBuildFreshness:false}).status,'pass');
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps),record=f.readRecord(published.jsonPath);
  assert.equal(record.meta.schemaVersion,2);assert.equal(record.meta.reviewedBy,'daemon');assert.equal(record.meta.epicSlug,'review-fixture');
  assert.ok(!('dimensions' in record.body));assert.equal(validateTaskBody(record.body).reviews.length,1);
  const rendered=readFileSync(published.path,'utf8');assert.match(rendered,/task t1/);assert.match(rendered,/Optional clarity improvement/);assert.match(rendered,/source.js/);
  assert.equal(renderTaskReview(record.body).includes('dimension'),false);
  const history=await f.deps.through.store!.history.log(id);
  assert.ok(history.length>=2,'v1 is retained in canonical history when v2 replaces its projection');
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
   assert.equal(enforceCodeReviewGate(f.repo,hash,'s1',{enforce:false}).status,'blocked',status);
   const record=f.readRecord(published.jsonPath);record.meta.schemaVersion=99;writeFileSync(published.jsonPath,JSON.stringify(record));
   assert.equal(enforceCodeReviewGate(f.repo,hash,'s1',{enforce:false}).status,'blocked','unknown versions never become no-review');
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
  const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>({runReviewSession:async()=>f.result}) as unknown as LLMProvider,publish:(project,id)=>publishTaskCheckpoint(project,hash,id,{...f.deps,renderWrite:(path,content)=>{
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
