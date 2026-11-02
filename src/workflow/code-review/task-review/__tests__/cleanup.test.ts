import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, symlinkSync, lstatSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, hash } from './publication-fixture.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import { cleanupStoryCheckpoints } from '../cleanup.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { approveArtifactByJsonPath, approveWorkflowTarget } from '../../../gates.js';
import { lifecycleFor } from '../../../../daemon/lifecycle-registry.js';
import { reviewedBuildFingerprint } from '../../build-freshness.js';
import { cleanupApprovedTaskReviews } from '../../../../daemon/task-review-rpc.js';
import { eventually } from './controller-fixture.js';

async function setup(){
 const f=await fixture(true),buildPath=join(f.repo,`.insrc/artifacts/BUILD-${hash}-s1.json`);
 await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
 const task=f.checkpoint('task-review');task.taskId='t1';task.attempts[0]!.submitted.taskId='t1';
 await saveCheckpoint(checkpointPath(f.repo,'task-review'),task);await publishTaskCheckpoint(f.repo,hash,'task-review',f.deps);
 const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>{throw new Error('Cleanup must not run models');}});
 const afterBuildApproval=async()=>{
  const status=JSON.parse(readFileSync(buildPath,'utf8')).meta.lifecycle.status;assert.equal(status,'approved');
  const value=await coordinator.withStoryCleanup(f.repo,hash,'s1',()=>cleanupStoryCheckpoints(f.repo,hash,'s1',{sources:f.deps.sources}));
  assert.equal(value.busy,false);if(value.busy)throw new Error('busy');return value.result;
 };
 return {...f,buildPath,coordinator,afterBuildApproval,lifecycle:lifecycleFor(f.repo).service};
}

test('Successful story BUILD approval removes only matching fully preserved task/story checkpoints',async()=>{
 for(const route of ['direct','single','batch']){
  const f=await setup();try{
   const before=reviewedBuildFingerprint(JSON.parse(readFileSync(f.buildPath,'utf8')));
   const result=route==='direct'?await approveArtifactByJsonPath(f.buildPath,{lifecycle:f.lifecycle,afterBuildApproval:f.afterBuildApproval}):
    (await approveWorkflowTarget({repoPath:f.repo,...(route==='batch'?{epicHash:hash}:{artifactPath:f.buildPath}),lifecycle:f.lifecycle,afterBuildApproval:f.afterBuildApproval})).approved.find(r=>r.path===f.buildPath)!.result;
   assert.equal(result.cleanup?.deleted.length,2);assert.deepEqual(result.cleanup?.errors,[]);
   assert.ok(existsSync(join(f.repo,`.insrc/artifacts/CR-${hash}-s1.json`)));
   assert.equal(reviewedBuildFingerprint(JSON.parse(readFileSync(f.buildPath,'utf8'))),before);
  }finally{f.cleanup();}
 }
});

test('Cleanup defers for active admission/execution/publication and excludes concurrent starts under story fence',async()=>{
 const f=await setup();let release!:()=>void;try{
  const waiting=new Promise<void>(resolve=>{release=resolve;});
  const publication=f.coordinator.publishStored(f.repo,'publication',hash,async()=>{await waiting;});
  await eventually(()=>f.coordinator.isActive(f.repo,'publication'));
  assert.deepEqual(await f.coordinator.withStoryCleanup(f.repo,hash,'s1',async()=>{throw new Error('No active cleanup');}),{busy:true});
  release();await publication;
  await f.coordinator.withStoryCleanup(f.repo,hash,'s1',async()=>{
   await assert.rejects(f.coordinator.start(f.repo,'racing',1,f.packet,{epicHash:hash}),/cleanup-in-progress/);
   const unrelated={...structuredClone(f.packet),storyId:'s2'};
   // Distinct known story passes this fence and fails normal Plan identity validation instead.
   await assert.rejects(f.coordinator.start(f.repo,'unrelated',1,unrelated,{epicHash:hash}),error=>error instanceof Error&&!error.message.includes('cleanup-in-progress'));
  });
 }finally{release?.();f.cleanup();}
});

test('Rejected approval, task validation and CR publication never clean checkpoints; repeated approval retries partial cleanup',async()=>{
 const f=await setup();try{
  assert.ok(existsSync(checkpointPath(f.repo,'publication')),'CR completion does not clean');
  const build=JSON.parse(readFileSync(f.buildPath,'utf8'));build.body.summary='Unreviewed change';writeFileSync(f.buildPath,JSON.stringify(build));
  let called=0;await assert.rejects(approveArtifactByJsonPath(f.buildPath,{lifecycle:f.lifecycle,afterBuildApproval:async()=>{called++;return {deleted:[],retained:[],errors:[]};}}));assert.equal(called,0);
  writeFileSync(f.buildPath,JSON.stringify(f.build));
  let fail=true;
  const cleanup=async()=>{
   const value=await f.coordinator.withStoryCleanup(f.repo,hash,'s1',()=>cleanupStoryCheckpoints(f.repo,hash,'s1',{sources:f.deps.sources,unlink:async path=>{if(fail&&String(path).endsWith('task-review.json'))throw new Error('disk failure');await unlink(path);}}));
   if(value.busy)throw new Error('busy');return value.result;
  };
  const first=await approveArtifactByJsonPath(f.buildPath,{lifecycle:f.lifecycle,afterBuildApproval:cleanup});assert.equal(first.cleanup?.deleted.length,1);assert.equal(first.cleanup?.retained.length,1);
  assert.equal(JSON.parse(readFileSync(f.buildPath,'utf8')).meta.lifecycle.status,'approved');
  fail=false;const retry=await approveArtifactByJsonPath(f.buildPath,{lifecycle:f.lifecycle,afterBuildApproval:cleanup});assert.equal(retry.cleanup?.deleted.length,1);assert.deepEqual(retry.cleanup?.errors,[]);
 }finally{f.cleanup();}
});

test('Cleanup retains malformed/symlink/foreign/future/unrepresented history and reports filesystem failures',async()=>{
 const f=await setup();try{
  const root=join(f.repo,'.insrc/tmp/code-review');
  writeFileSync(join(root,'broken.json'),'{bad');symlinkSync(checkpointPath(f.repo,'publication'),join(root,'link.json'));
  const future=f.checkpoint('future') as unknown as {schemaVersion:number};future.schemaVersion=99;writeFileSync(join(root,'future.json'),JSON.stringify(future));
  const foreign=f.checkpoint('foreign');foreign.project='/another/project';await saveCheckpoint(join(root,'foreign.json'),foreign);
  const unfinished=f.checkpoint('unfinished');delete unfinished.attempts[0]!.header.completedAt;unfinished.attempts[0]!['review-response'].tasks=[];await saveCheckpoint(join(root,'unfinished.json'),unfinished);
  const unrepresented=f.checkpoint('unrepresented');unrepresented.attempts[0]!.header.status='passed';unrepresented.attempts[0]!['review-response'].crPublication='complete';await saveCheckpoint(join(root,'unrepresented.json'),unrepresented);
  const result=await f.afterBuildApproval().catch(()=>null);assert.equal(result,null,'approval must precede deletion');
  const approved=await approveArtifactByJsonPath(f.buildPath,{lifecycle:f.lifecycle,afterBuildApproval:f.afterBuildApproval});
  assert.equal(approved.cleanup?.deleted.length,2);assert.equal(approved.cleanup?.retained.length,6);assert.equal(approved.cleanup?.errors.length,6);
  for(const name of ['broken','future','foreign','unfinished','unrepresented'])assert.ok(existsSync(join(root,name+'.json')));
  assert.ok(lstatSync(join(root,'link.json')).isSymbolicLink());
 }finally{f.cleanup();}
});


test('daemon cleanup owner requires approved lifecycle and preserves pointed native diagnostics',async()=>{
 const f=await setup();try{
  await assert.rejects(cleanupApprovedTaskReviews({repo:f.repo,epicHash:hash,storyId:'s1'}),/approval/);
  const cp=f.checkpoint('diagnostic');cp.attempts[0]!['review-response'].failureDiagnostics=[{phase:'assessment',taskId:'t1',resolved:true,diagnostic:{provider:'codex',issues:[{code:'MISSING_REQUIRED_FIELD',field:'findings',correction:'Return findings as a top-level JSON array.',occurrences:2}],lastRejectedFeedback:{preview:'PRIVATE_PREVIEW_CANARY',truncated:false}}}];
  await saveCheckpoint(checkpointPath(f.repo,'diagnostic'),cp);const published=await publishTaskCheckpoint(f.repo,hash,'diagnostic',f.deps);
  const summary=f.readRecord(published.jsonPath).body.reviews.find(r=>r.reviewId==='diagnostic')!.summary;
  assert.match(summary,/MISSING_REQUIRED_FIELD/);assert.doesNotMatch(summary,/PRIVATE_PREVIEW_CANARY/);
  const result=await approveArtifactByJsonPath(f.buildPath,{lifecycle:f.lifecycle,afterBuildApproval:(repo,epicHash,storyId)=>cleanupApprovedTaskReviews({repo,epicHash,storyId})});
  assert.equal(result.cleanup?.deleted.length,3);assert.deepEqual(result.cleanup?.errors,[]);
 }finally{f.cleanup();}
});
