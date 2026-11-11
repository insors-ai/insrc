import test from 'node:test';
import assert from 'node:assert/strict';
import { clearanceFixture,pause } from './helpers/review-clearance-fixture.js';

async function approve(f:Awaited<ReturnType<typeof clearanceFixture>>,input:object){
 const pending=f.peer.call('review.resource.clear',input);const request=await f.peer.request();
 assert.equal(request.toolId,'review_resource_clearance');
 assert.deepEqual((request.arguments as any).reviewKey,f.key);
 assert.deepEqual(await f.peer.call('approval.answer',{requestId:'wrong-review',decision:'approve'}),{accepted:false});
 assert.deepEqual(await f.peer.call('approval.answer',{requestId:request.requestId,decision:'approve'}),{accepted:true});
 return pending;
}
test('existing local broker approval binds exact guards and requires a separate resume',async t=>{
 for(const family of ['code','design'] as const)await t.test(family,async t=>{
  const f=await clearanceFixture(t,family);f.peer.subscribe();await pause();
  const before=await f.recovery.inspect(f.key,f.local);assert.equal(before.remaining,2);
  await assert.rejects(f.peer.call('review.resource.clear',{reason:'checked',approvalReceipt:{decision:'approve'}}),/caller approval receipts/);
  const result=await approve(f,{reason:'Operator verified the fixture operations ended'});
  assert.equal(result.status,'cleared');assert.equal(result.remaining,0);
  const after=await f.recovery.inspect(f.key,f.local);assert.equal(after.remaining,0);
  assert.equal(after.guards[0]!.resourceGuard.clearance!.approvalReceipt.guardDigest,before.digest);
  assert.equal(f.started.size,0,'clearance must not admit or resume a review');assert.equal(f.nativeCalls(),0);
  const {persistReviewWorkerAdmission}=await import('../review-worker-admission.js');
  await assert.rejects(persistReviewWorkerAdmission(f.input),/explicit (resume|recover)/);
  assert.equal((await f.peer.call('review.resource.clear',{reason:'replay'})).status,'already-clear');
 });
});
test('stale partial repeated or lost-response clearance preserves remaining fences and audit receipts',async t=>{
 const f=await clearanceFixture(t);f.peer.subscribe();await pause();
 const partial=await approve(f,{reason:'Only first operation verified',leaseIds:['op-a']});
 assert.equal(partial.status,'partially-cleared');assert.equal(partial.remaining,1);
 const first=await f.recovery.inspect(f.key,f.local);const receipt=first.guards[0]!.resourceGuard.clearance;
 await assert.rejects(f.peer.call('review.resource.clear',{reason:'stale selection',leaseIds:['op-a']}),/exact set/);
 assert.deepEqual((await f.recovery.inspect(f.key,f.local)).guards[0]!.resourceGuard.clearance,receipt);
 f.failAudit(true);
 // Existing receipt must be audited before the next approval can replace it.
 await assert.rejects(f.peer.call('review.resource.clear',{reason:'audit unavailable'}),/audit unavailable/);
 assert.equal((await f.recovery.inspect(f.key,f.local)).remaining,1);
 f.failAudit(false);
 assert.equal((await approve(f,{reason:'Remaining operation verified'})).status,'cleared');
 const final=await f.recovery.inspect(f.key,f.local);
 assert.notEqual(final.guards[0]!.resourceGuard.clearance!.approvalReceipt.requestId,receipt!.approvalReceipt.requestId);
 assert.equal((await f.peer.call('review.resource.clear',{reason:'lost response replay'})).status,'already-clear');
 assert.equal(f.nativeCalls(),0);assert.equal(f.started.size,0);
 const log=await f.lifecycle.store.history.log(f.artifactId);
 const receipts=log.flatMap(entry=>{const data=entry.outcome?.data as any;return data?.kind==='review-resource-audit'?data.guards.flatMap((row:any)=>row.resourceGuard.clearance?[row.resourceGuard.clearance.approvalReceipt.requestId]:[]):[];});
 assert.deepEqual(new Set(receipts),new Set([receipt!.approvalReceipt.requestId,final.guards[0]!.resourceGuard.clearance!.approvalReceipt.requestId]));
 assert.equal(log.length,2,'exactly one audit per saved partial receipt');
});

test('denial expiry disconnect and changed retained guards cannot grant clearance',async t=>{
 const f=await clearanceFixture(t,'code',1500);
 assert.equal((await f.peer.call('review.resource.clear',{reason:'No attached approval client'})).reason,'no-client');
 f.peer.subscribe();await pause();
 let pending=f.peer.call('review.resource.clear',{reason:'Declined'}),request=await f.peer.request();
 await f.peer.call('approval.answer',{requestId:request.requestId,decision:'decline'});assert.equal((await pending).reason,'declined');
 pending=f.peer.call('review.resource.clear',{reason:'Expired'});request=await f.peer.request();assert.equal((await pending).reason,'timed-out');
 assert.equal((await f.peer.call('approval.answer',{requestId:request.requestId,decision:'approve'})).accepted,false);
 // A retained-history change between display and answer invalidates the digest.
 const {updateStoredCodeCheckpoint}=await import('../../../workflow/code-review/task-review/checkpoint.js');
 const {join}=await import('node:path');
 pending=f.peer.call('review.resource.clear',{reason:'Changed while awaiting approval'});request=await f.peer.request();
 await updateStoredCodeCheckpoint(join(f.repo,'.insrc/tmp/code-review',`${f.key.reviewId}.json`),cp=>({...cp!,attempts:cp!.attempts.map(a=>({...a,resourceGuard:{...a.resourceGuard!,openLeases:[...a.resourceGuard!.openLeases,{operationId:'late-operation',workerIncarnation:'old-worker',kind:'cli',openedAt:new Date().toISOString()}]}}))}));
 await f.peer.call('approval.answer',{requestId:request.requestId,decision:'approve'});await assert.rejects(pending,/Stale review resource clearance/);
 assert.equal((await f.recovery.inspect(f.key,f.local)).remaining,3);
 pending=f.peer.call('review.resource.clear',{reason:'Disconnected'});request=await f.peer.request();
 const rejected=assert.rejects(pending,/disconnected/);f.peer.close();await rejected;await f.recovery.drained();
 assert.equal(f.broker.answer(request.requestId,'approve').accepted,false);
 assert.equal((await f.recovery.inspect(f.key,f.local)).remaining,3);
});

test('receipt survives a post-application audit failure and replay repairs its audit without inference',async t=>{
 const f=await clearanceFixture(t);f.peer.subscribe();await pause();
 const pending=f.peer.call('review.resource.clear',{reason:'Verified all fixture operations'}),request=await f.peer.request();
 // The pre-approval audit succeeded; fail the audit after the durable receipt save.
 f.failAudit(true);await f.peer.call('approval.answer',{requestId:request.requestId,decision:'approve'});
 await assert.rejects(pending,/audit unavailable/);
 const saved=await f.recovery.inspect(f.key,f.local);assert.equal(saved.remaining,0);
 assert.equal(saved.guards[0]!.resourceGuard.clearance!.approvalReceipt.requestId,request.requestId);
 f.failAudit(false);assert.equal((await f.peer.call('review.resource.clear',{reason:'Recover lost response'})).status,'already-clear');
 assert.deepEqual((await f.recovery.inspect(f.key,f.local)).guards,saved.guards);assert.equal(f.started.size,0);
});

test('cleared failed attempts accept only a separate explicit next submission and preserve the failed record',async t=>{
 for(const family of ['code','design'] as const)await t.test(family,async t=>{
  const f=await clearanceFixture(t,family);f.peer.subscribe();await pause();
  const {loadStoredCheckpoint,updateStoredCodeCheckpoint,checkpointPath}=await import('../../../workflow/code-review/task-review/checkpoint.js');
  const {loadStoredDesignCheckpoint,updateStoredDesignCheckpoint}=await import('../../../workflow/review/design-review/checkpoint.js');
  const load=()=>family==='code'?loadStoredCheckpoint(checkpointPath(f.repo,f.key.reviewId)):loadStoredDesignCheckpoint(f.repo,f.key.reviewId);
  if(family==='code')await updateStoredCodeCheckpoint(checkpointPath(f.repo,f.key.reviewId),cp=>({...cp!,attempts:cp!.attempts.map(a=>({...a,header:{...a.header,status:'failed',completedAt:new Date().toISOString()},error:{code:'fixture_failure',field:'admission',summary:'Fixture technical failure'},progress:{...a.progress!,phase:'error'}}))}));
  else await updateStoredDesignCheckpoint(f.repo,f.key.reviewId,cp=>({...cp!,attempts:cp!.attempts.map(a=>({...a,status:'failed',finishedAt:new Date().toISOString(),failure:{code:'fixture_failure',summary:'Fixture technical failure'},progress:{...a.progress,status:'failed',phase:'complete',requiresUserInput:true}}))}));
  assert.equal((await approve(f,{reason:'All failed-attempt fixture operations verified ended'})).status,'cleared');
  const failed=structuredClone((await load())!.attempts[0]);
  assert.equal(f.started.size,0,'clearance dispatches no work');assert.equal(f.nativeCalls(),0);
  const {persistReviewWorkerAdmission}=await import('../review-worker-admission.js');
  await assert.rejects(persistReviewWorkerAdmission(f.input),/explicit (resume|recover)/);
  const input={...f.input,attempt:2,actionId:'explicit-next-attempt',submitted:family==='code'?f.f.packet:{phase:'start',repo:f.repo,reviewId:f.key.reviewId,attempt:2,artifactPath:f.d!.json}};
  const ack=await f.registry.admit(input,f.local);
  assert.deepEqual((await load())!.attempts[0],failed);
  assert.equal((await load())!.attempts.length,2);
  if(family==='design'){
   const barrier=f.barriers.get(f.key.reviewId)!;assert.equal(Atomics.load(barrier,2),0);
   await f.registry.execute(ack,f.local);Atomics.store(barrier,1,1);Atomics.notify(barrier,1);
   const {until}=await import('./helpers/review-clearance-fixture.js');
   await until(async()=> (await loadStoredDesignCheckpoint(f.repo,f.key.reviewId))!.attempts[1]!.status==='passed');
   assert.equal(Atomics.load(barrier,2),3,'new failed-attempt submission starts fresh planning and reviews');
   assert.deepEqual((await load())!.attempts[0],failed);
  }
 });
});
