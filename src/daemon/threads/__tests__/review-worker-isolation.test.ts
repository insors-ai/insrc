import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { productionFixture } from './helpers/review-production-fixture.js';
import { until,workerRpc } from './helpers/review-clearance-fixture.js';
import { cleanupApprovedTaskReviews } from '../../task-review-rpc.js';
import { cleanupDesignArtifact } from '../../../workflow/review/design-review/cleanup.js';
import { hash } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';

test('code code design design and mixed reviews use distinct real worker threads',async t=>{
 const f=await productionFixture(t),a=await f.peer(),b=await f.peer();
 const requests=[{family:'code',request:f.codeRequest('code-a'),peer:a},{family:'code',request:f.codeRequest('code-b'),peer:a},
  {family:'code',request:f.codeRequest('code-c'),peer:b},
  {family:'design',request:f.designRequest('design-a'),peer:a},{family:'design',request:f.designRequest('design-b',1),peer:a},{family:'design',request:f.designRequest('design-c',2),peer:b}] as const;
 for(const r of requests){
  const ack=await r.peer.call(`${r.family==='code'?'task':'design'}Review.start`,r.request);
  assert.equal(ack.reviewer,'daemon','tracked controller author selects independent daemon');
  const saved=JSON.parse(await readFile(ack.checkpointPath,'utf8'));assert.equal(saved.attempts.at(-1).phase,'admission');
 }
 const owners=[...f.started.values()];assert.equal(new Set(owners.map(w=>w.threadId)).size,6);assert.ok(owners.every(w=>w.threadId>0));
 // These are the same cleanup consumers called by actual approval. Both
 // unverified admission and another review on a shared story retain files.
 const retainedCode=await cleanupApprovedTaskReviews({repo:f.code.repo,epicHash:hash,storyId:'s1'});
 assert.equal(retainedCode.deleted.length,0);assert.ok(retainedCode.retained.length>0);
 const retainedDesign=await cleanupDesignArtifact(f.design.repo,f.design.id);
 assert.equal(retainedDesign.deleted.length,0);assert.ok(retainedDesign.retained.length>0);
 await assert.rejects(a.call('designReview.start',f.designRequest('same-subject')),/subject or cleanup busy/);
 for(const r of requests)await f.release(r.request.reviewId);
 for(const r of requests){
  const owner=f.started.get(r.request.reviewId)!;
  const before=f.started.size;
  try{await r.peer.call(`${r.family==='code'?'task':'design'}Review.start`,r.request);}catch(error){assert.match(String(error),/active|duplicate|already/);}
  assert.equal(f.started.size,before);assert.equal(f.started.get(r.request.reviewId),owner);
  // Immutable server identity is checked before coordinator dispatch.
  if(r.family==='code'){
   await assert.rejects(workerRpc(owner,'review.worker.describe',{...owner.admission,incarnation:'forged'}),/stale/);
   await assert.rejects(workerRpc(owner,'review.worker.describe',{...owner.admission,key:{...owner.admission.key,reviewId:'foreign'}}),/stale/);
  }
 }
 for(const r of requests)await until(async()=>{
  const p=await r.peer.call(`${r.family==='code'?'task':'design'}Review.progress`,r.request);
  if(p.status==='failed')throw new Error(JSON.stringify(p));return p.status==='passed';
 });
});

test('blocked admission permits progress daemon status and an unrelated review before release',async t=>{
 const f=await productionFixture(t),peer=await f.peer(),observer=await f.peer();
 for(const family of ['code','design'] as const){
  const request=family==='code'?f.codeRequest('blocked-code'):f.designRequest('blocked-design');
  const method=family==='code'?'taskReview':'designReview';
  await peer.call(`${method}.start`,request);
  const owner=f.started.get(request.reviewId)!,barrier=f.barriers.get(request.reviewId)!;
  let blocking:Promise<unknown>|undefined;
  if(family==='code'){
   await until(async()=> (await workerRpc(owner,'fixture.stats')).entered);
   blocking=workerRpc(owner,'fixture.block');await until(()=>Atomics.load(barrier,6)===1);
  }else await until(()=>Atomics.load(barrier,0)===1);
  try{
   const progress=await observer.call(`${method}.progress`,request);
   assert.equal(progress.status,'pending');assert.equal(progress.admission.validation,'unverified');
   const status=await observer.call('daemon.status',{});assert.ok(status);
   const threads=await observer.call('daemon.threads',{});
   assert.ok(threads.some((w:any)=>w.threadId===owner.threadId&&w.reviewProgress.reviewId===request.reviewId));
   const other=f.codeRequest(`independent-${family}`);await observer.call('taskReview.start',other);await f.release(other.reviewId);
   await until(async()=>{const p=await observer.call('taskReview.progress',other);if(p.status==='failed')throw Error(JSON.stringify(p));return p.status==='passed';});
   assert.equal(Atomics.load(barrier,family==='code'?7:1),0,'independent review finishes while CPU barrier is closed');
   // Observer disconnect never cancels daemon-owned work.
   const transient=await f.peer();await transient.call(`${method}.progress`,request);transient.close();
  }finally{await f.release(request.reviewId);await blocking;}
  await until(async()=> (await peer.call(`${method}.progress`,request)).status==='passed');
 }
});

test('installed production routing bounds never-ready and pre-save-hung boot without fallback',async t=>{
 for(const mode of ['never-ready','before-save'] as const)await t.test(mode,async t=>{
  const f=await productionFixture(t,mode),peer=await f.peer();
  await assert.rejects(peer.call('taskReview.start',f.codeRequest('hung-'+mode)),/review_worker_bootstrap_timeout/);
  const failed=f.createdWorkers.get('hung-'+mode)!;
  await until(()=>failed.threadId===-1);assert.equal(f.started.has('hung-'+mode),false);
  const other=f.codeRequest('after-'+mode);await peer.call('taskReview.start',other);await f.release(other.reviewId);
  await until(async()=> (await peer.call('taskReview.progress',other)).status==='passed');
 });
});
