import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { rm,readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture,hash } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { impactFixture } from '../../../workflow/review/design-review/__tests__/impact-fixtures.js';
import { admissionFixture } from '../../../workflow/review/design-review/__tests__/fixtures.js';
import { checkpointPath,updateStoredCodeCheckpoint } from '../../../workflow/code-review/task-review/checkpoint.js';
import { updateStoredDesignCheckpoint } from '../../../workflow/review/design-review/checkpoint.js';
import { persistReviewWorkerAdmission } from '../review-worker-admission.js';
import { lifecycleFor } from '../../lifecycle-registry.js';
import { ThreadServices } from '../main-services.js';
import { ReviewWorkers } from '../review-workers.js';
import { startReviewWorkerBootstrap } from '../review-worker-bootstrap.js';
import type { StartedReviewWorker } from '../review-worker-bootstrap.js';
import { startWorker } from '../workers.js';
import { reviewCleanupScope,reviewUnknownCleanupScope } from '../../../workflow/review/cleanup-owner.js';
import type { ReviewCleanupTarget } from '../../../workflow/review/cleanup-owner.js';
import { cleanupApprovedTaskReviews } from '../../task-review-rpc.js';
import { cleanupDesignArtifact } from '../../../workflow/review/design-review/cleanup.js';
import { approveArtifactByJsonPath } from '../../../workflow/gates.js';
import { nextLifecycle } from '../../../workflow/artifact-core/lifecycle.js';
import { attributionIdentity } from '../../../workflow/code-review/task-review/attribution-binding.js';

function idle(s:StartedReviewWorker):Promise<unknown>{return new Promise((resolve,reject)=>{const id=Math.random().toString(),message=(raw:any)=>{if(raw?.kind!=='reply'||raw.requestId!==id)return;s.worker.off('message',message);raw.error?reject(new Error(raw.error)):resolve(raw.result);};s.worker.on('message',message);s.worker.postMessage({kind:'request',requestId:id,method:'review.worker.assertIdle',params:s.admission,stream:false});});}

test('approval cleanup retains active targets and preserves both-family permanent history',async t=>{
 for(const family of ['code','design'] as const)await t.test(family,async t=>{
  const code=family==='code'?await fixture(true):undefined,design=family==='design'?impactFixture(t):undefined;
  if(code)t.after(code.cleanup);
  const repo=code?.repo??design!.repo,reviewId=code?'publication':'review-1',epicHash=code?hash:'aaaaaaaaaaaaaaaa';
  const key={project:repo,family,reviewId},path=code?checkpointPath(repo,reviewId):design!.path;
  const target:ReviewCleanupTarget=code?{project:repo,family:'code',epicHash,storyId:'s1'}:{project:repo,family:'design',artifactId:design!.id};
  const guard={daemonInstance:'old-fixture',openLeases:[],clearance:{at:'2026-11-09T00:00:00.000Z',reason:'Fixture-confirmed old disposal',approvalReceipt:{requestId:'fixture-clearance',decision:'approve' as const,reviewKey:key,guardDigest:'a'.repeat(64),leaseIds:['old-operation']}}};
  if(code){
   await rm(path);await persistReviewWorkerAdmission({key,incarnation:'old',attempt:1,reviewer:'daemon',actionId:'failed-first',submitted:code.packet});
   await updateStoredCodeCheckpoint(path,cp=>{
    const failed=cp!.attempts[0]!;if(!('phase'in failed))throw new Error('Admission required');failed.header.status='failed';failed.header.completedAt=new Date().toISOString();failed.progress.phase='error';failed.error={code:'fixture_admission_failed',field:'packet',summary:'Preserve pointed technical failure'};failed.resourceGuard=guard;
    const done=code.checkpoint().attempts[0]!;done.header.attempt=2;done.header.status='passed';done.header.reassessmentSummary='Reassess after technical-only admission failure';
    done.header.acceptedAttribution=done.header.acceptedAttribution!.map(row=>({...row,decision:{action:'reassess' as const,reason:'Prior admission did not assess this task'}}));
    done.header.attributionIdentity=attributionIdentity('accepted',done.header.finalScopeIdentity!,done.header.selectedTaskIds,done.submitted.tests.length,done.header.acceptedAttribution.map(row=>({...row,identity:done.header.taskScopeIdentities!.find(b=>b.taskId===row.taskId)!.identity})));
    return{...cp!,schemaVersion:2,attempts:[failed,done]};
   });
  }else{
   const failed=admissionFixture(design!).attempts[0]!;failed.status='failed';failed.finishedAt=new Date().toISOString();failed.error={code:'fixture_admission_failed',field:'artifactPath',summary:'Preserve pointed technical failure'};failed.resourceGuard=guard;
   design!.baseline.number=2;design!.baseline.report!.attempt=2;design!.baseline.publication={reviewId,attempt:2,state:'pending'};
   await updateStoredDesignCheckpoint(repo,reviewId,()=>({...design!.checkpoint,schemaVersion:2,attempts:[failed,design!.baseline]}));
  }
  const calls=new Int32Array(new SharedArrayBuffer(4)),services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
  let current:StartedReviewWorker|undefined;
  const registry=new ReviewWorkers({services,resolveScope:async k=>({reviewer:'daemon',subject:design?.id??`BUILD-${hash}-s1`,cleanupScope:k.reviewId==='active-admission'?reviewUnknownCleanupScope(repo,family):reviewCleanupScope(target),epicHash}),authorizeNative:async(_key,command)=>assert.equal(command.command,'git'),resolveBinary:async c=>c,track:()=>{},start:async(svc,input,port,deps)=>{const s=await startReviewWorkerBootstrap(svc,input,port,{...deps,start:(s,n,_script,extra,created)=>startWorker(s,n,'__tests__/helpers/review-maintenance',{workerData:{...extra!.workerData,calls:calls.buffer},transferList:extra!.transferList},created)});current=s;return s;}});
  t.after(()=>registry.shutdown());const context={connectionIdentity:'cleanup-fixture',daemonEpoch:'epoch',connectionSignal:new AbortController().signal};
  const published=await registry.publishStored({key,attempt:2,actionId:'publish',submitted:{},maintenance:true},context) as any;
  assert.equal(published.status,'passed',JSON.stringify(published));
  await registry.shutdown();
  const lifecycle=lifecycleFor(repo);
  if(design){const actor={id:'person:fixture',kind:'person' as const,properties:{}};await lifecycle.store.updateAndLog(design.id,actor,head=>({next:{...head,lifecycle:nextLifecycle(head,'approve',actor,new Date().toISOString())},options:{operation:'approve'}}));}
  // A fresh, unverified admission on the same subject must block actual
  // approval-cleanup consumers, even before execution discovers its inventory.
  const active={...key,reviewId:'active-admission'};
  await registry.admit({key:active,attempt:1,actionId:'active',submitted:code?code.packet:{phase:'start',repo,reviewId:active.reviewId,attempt:1,artifactPath:design!.json}},context);
  const held=code?(await approveArtifactByJsonPath(join(repo,`.insrc/artifacts/BUILD-${hash}-s1.json`),{lifecycle:lifecycle.service,afterBuildApproval:()=>cleanupApprovedTaskReviews({repo,epicHash,storyId:'s1'})})).cleanup!:await cleanupDesignArtifact(repo,design!.id);
  assert.equal(held.deleted.length,0);assert.ok(held.retained.length>0);assert.ok(existsSync(path));
  await registry.shutdown();
  // Hold the real artifact queue while a persistence-only retry is running.
  // Cleanup must consult the owner, not infer idleness from terminal counts.
  await registry.admit({key,attempt:2,actionId:'publication-race',submitted:{},maintenance:true},context);
  let release!:()=>void,entered!:()=>void;const holding=new Promise<void>(r=>{entered=r;});
  const id=design?.id??`CR-${hash}-s1`;
  const blocked=lifecycle.store.exclusive(id,async()=>{entered();await new Promise<void>(r=>{release=r;});});await holding;
  const publishing=registry.publishStored({key,attempt:2,actionId:'publication-race',submitted:{}},context);
  try{
   let busy=false;for(let i=0;i<500&&!busy;i++){try{await idle(current!);}catch{busy=true;}if(!busy)await new Promise(r=>setTimeout(r,10));}assert.equal(busy,true);
   await assert.rejects(registry.publishStored({key,attempt:2,actionId:'concurrent-retry',submitted:{}},context),/publication.*active/);
   assert.notEqual(current!.worker.threadId,-1,'a rejected competing retry must not terminate the publishing owner');
   const retained=code?await cleanupApprovedTaskReviews({repo,epicHash,storyId:'s1'}):await cleanupDesignArtifact(repo,design!.id);
   assert.equal(retained.deleted.length,0);assert.ok(retained.retained.length>0);
  }finally{release();await blocked;await publishing;}
  if(code){
   const permanent=join(repo,`.insrc/artifacts/${id}.json`),raw=await readFile(permanent,'utf8'),head=JSON.parse(raw),checkpointBytes=await readFile(path,'utf8');
   await writeFile(permanent,JSON.stringify({...head,meta:{...head.meta,schemaVersion:2}}));
   const refused=await cleanupApprovedTaskReviews({repo,epicHash,storyId:'s1'});
   assert.equal(refused.deleted.length,0);assert.ok(refused.retained.includes(path));assert.match(refused.errors.join(' '),/capability mismatch/);
   assert.equal(await readFile(path,'utf8'),checkpointBytes,'invalid permanent history cannot mutate or delete the checkpoint');
   await writeFile(permanent,raw);
  }
  const cleaned=code?await cleanupApprovedTaskReviews({repo,epicHash,storyId:'s1'}):await cleanupDesignArtifact(repo,design!.id);
  assert.ok(cleaned.deleted.includes(path),JSON.stringify(cleaned));assert.equal(existsSync(path),false);
  const history=await registry.storedProgress(key,2,code?{epicHash,storyId:'s1'}:{artifactPath:design!.json,includeResult:true}) as any;
  assert.equal(history.status,'passed');
  const failed=await registry.storedProgress(key,1,code?{epicHash,storyId:'s1'}:{artifactPath:design!.json}) as any;
  assert.equal(failed.admission.validation,'unverified');assert.equal(failed.status,'failed');
  const log=await lifecycle.store.history.log(id);
  assert.ok(log.some(e=>(e.outcome?.data as any)?.kind==='review-resource-audit'),'clearance receipts survive checkpoint deletion');
  if(code){
   const permanent=join(repo,`.insrc/artifacts/${id}.json`),raw=await readFile(permanent,'utf8'),head=JSON.parse(raw);
   try{
    await writeFile(permanent,JSON.stringify({...head,meta:{...head.meta,schemaVersion:99}}));
    await assert.rejects(registry.storedProgress(key,2,{epicHash,storyId:'s1'}),/Unsupported permanent CR version/);
    await writeFile(permanent,JSON.stringify({...head,meta:{...head.meta,schemaVersion:2}}));
    await assert.rejects(registry.storedProgress(key,2,{epicHash,storyId:'s1'}),/capability mismatch/);
   }finally{await writeFile(permanent,raw);}
  }
  assert.equal(Atomics.load(calls,0),0);
 });
});
