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
