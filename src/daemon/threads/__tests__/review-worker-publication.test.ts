import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,hash } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { impactFixture } from '../../../workflow/review/design-review/__tests__/impact-fixtures.js';
import { saveCheckpoint,checkpointPath,updateStoredCodeCheckpoint } from '../../../workflow/code-review/task-review/checkpoint.js';
import { saveDesignCheckpoint,updateStoredDesignCheckpoint } from '../../../workflow/review/design-review/checkpoint.js';
import { createRepoLifecycle } from '../../../workflow/artifact-core/repo-lifecycle.js';
import { ThreadServices } from '../main-services.js';
import { ReviewWorkers } from '../review-workers.js';
import { startReviewWorkerBootstrap } from '../review-worker-bootstrap.js';
import { startWorker } from '../workers.js';

test('publication retry after worker exit or lost receipt performs zero provider calls',async t=>{
 for(const family of ['code','design'] as const)await t.test(family,async t=>{
  const code=family==='code'?await fixture():undefined,design=family==='design'?impactFixture(t):undefined;
  if(code)t.after(code.cleanup);
  const repo=code?.repo??design!.repo,reviewId=code?'publication':'review-1',epicHash=code?hash:'aaaaaaaaaaaaaaaa';
  if(code){const cp=code.checkpoint();cp.attempts[0]!.header.status='passed';await saveCheckpoint(checkpointPath(repo,reviewId),cp);}
  else{design!.checkpoint.attempts=[design!.baseline];design!.baseline.publication={reviewId,attempt:1,state:'pending'};await saveDesignCheckpoint(repo,design!.checkpoint);}
  const calls=new Int32Array(new SharedArrayBuffer(4));
  const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
  const registry=new ReviewWorkers({services,resolveScope:async()=>({reviewer:'daemon',subject:design?.id??`${repo}:s1`,cleanupScope:`${repo}:s1`,epicHash}),authorizeNative:async(_key,command)=>{assert.equal(command.command,'git');},resolveBinary:async c=>c,track:()=>{},start:(svc,input,port,deps)=>startReviewWorkerBootstrap(svc,input,port,{...deps,start:(s,n,_script,extra,created)=>startWorker(s,n,'__tests__/helpers/review-maintenance',{workerData:{...extra!.workerData,calls:calls.buffer},transferList:extra!.transferList},created)})});
  t.after(()=>registry.shutdown());
  const key={project:repo,family,reviewId},context={connectionIdentity:'publication-reader',daemonEpoch:'epoch',connectionSignal:new AbortController().signal};
  const input={key,attempt:1,actionId:'publish-stored',submitted:{}};
  const first=await registry.publishStored(input,context);assert.ok(first);
  const history=createRepoLifecycle(repo).history,id=design?.id??`CR-${hash}-s1`;
  const before=(await history.log(id)).filter(e=>e.operation==='review'||e.operation==='update'||e.operation==='create').length;
  await registry.shutdown();
  // Lose only the operational receipt; retain all completed feedback and pins.
  if(code)await updateStoredCodeCheckpoint(checkpointPath(repo,reviewId),cp=>{const last=cp!.attempts.at(-1)!;if(!('review-response'in last))throw new Error('Qualified evidence required');last['review-response'].crPublication='pending';return cp!;});
  else await updateStoredDesignCheckpoint(repo,reviewId,cp=>{const last=cp!.attempts.at(-1)!;if('phase'in last)throw new Error('Qualified evidence required');last.publication={reviewId,attempt:1,state:'pending'};return cp!;});
  await registry.publishStored({...input,actionId:'retry-lost-receipt'},context);
  assert.equal(Atomics.load(calls,0),0);
  assert.equal((await history.log(id)).filter(e=>e.operation==='review'||e.operation==='update'||e.operation==='create').length,before,'retry must preserve one permanent publication');
 });
});

test('cold public design publication admission does not alter execution actions or preservation identity',async t=>{
 const f=impactFixture(t);await saveDesignCheckpoint(f.repo,{...f.checkpoint,attempts:[f.baseline]});
 const {loadStoredDesignCheckpoint}=await import('../../../workflow/review/design-review/checkpoint.js');
 const {persistReviewWorkerAdmission}=await import('../review-worker-admission.js');
 const {designPreservationDigest}=await import('../../../workflow/review/design-review/history.js');
 const before=(await loadStoredDesignCheckpoint(f.repo,'review-1'))!,request={phase:'recover',repo:f.repo,reviewId:'review-1',attempt:1,actionId:'cold-publication',operation:'retry_publication'};
 await persistReviewWorkerAdmission({key:{project:f.repo,family:'design',reviewId:'review-1'},incarnation:'cold-publication',attempt:1,reviewer:before.subject!.reviewer,actionId:request.actionId,subject:f.id,submitted:request});
 const after=(await loadStoredDesignCheckpoint(f.repo,'review-1'))!;
 assert.deepEqual(after.attempts[0]!.actions,before.attempts[0]!.actions);
 assert.equal(designPreservationDigest(after),designPreservationDigest(before));
});

test('terminal drain retries idleness without requiring another checkpoint update',async t=>{
 const f=await fixture(true);t.after(f.cleanup);
 const cp=f.checkpoint('terminal-drain');cp.attempts[0]!.header.status='passed';cp.attempts[0]!['review-response'].crPublication='complete';
 await saveCheckpoint(checkpointPath(f.repo,cp.reviewId),cp);
 const busy=new Int32Array(new SharedArrayBuffer(8));Atomics.store(busy,0,1);
 let current:Awaited<ReturnType<typeof startReviewWorkerBootstrap>>|undefined;
 const registry=new ReviewWorkers({services:new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'})),resolveScope:async()=>({reviewer:'daemon',subject:`BUILD-${hash}-s1`,cleanupScope:`${f.repo}:s1`,epicHash:hash}),authorizeNative:async()=>{throw Error('No native work allowed');},resolveBinary:async()=>{throw Error('No CLI allowed');},track:()=>{},start:async(svc,input,port,deps)=>{current=await startReviewWorkerBootstrap(svc,input,port,{...deps,start:(s,n,_script,extra,created)=>startWorker(s,n,'__tests__/helpers/review-terminal-drain',{workerData:{...extra!.workerData,fixtureBusy:busy.buffer},transferList:extra!.transferList},created)});return current;}});
 t.after(async()=>{Atomics.store(busy,0,0);await registry.shutdown();});
 const ctx={connectionIdentity:'terminal-drain',daemonEpoch:'epoch',connectionSignal:new AbortController().signal};
 const ack=await registry.admit({key:{project:f.repo,family:'code',reviewId:cp.reviewId},attempt:1,actionId:'start',submitted:f.packet},ctx);
 await registry.execute(ack,ctx);
 const until=async(check:()=>boolean)=>{const end=Date.now()+10000;while(!check()){if(Date.now()>end)throw Error('Terminal drain condition timed out');await new Promise(r=>setTimeout(r,20));}};
 await until(()=>Atomics.load(busy,1)>0);
 const {readFile}=await import('node:fs/promises');const bytes=await readFile(checkpointPath(f.repo,cp.reviewId),'utf8');
 Atomics.store(busy,0,0);
 await until(()=>registry.identity(ack.key)===undefined);await current!.reclaimed;
 assert.equal(await readFile(checkpointPath(f.repo,cp.reviewId),'utf8'),bytes,'drain does not need a new checkpoint or model call');
});
