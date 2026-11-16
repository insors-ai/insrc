import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { publishedCleanupFixture } from '../../../workflow/review/__tests__/prepared-publication-fixture.js';
import { ThreadServices } from '../main-services.js';
import { ReviewWorkers } from '../review-workers.js';
import { reviewRuntimePath } from '../review-runtime-store.js';
import { reviewWorkerCheckpoint } from '../review-worker-contract.js';
import { contextRoot } from '../../../workflow/review/prepared-context.js';
import { saveStoredCheckpoint, loadStoredCheckpoint } from '../../../workflow/code-review/task-review/checkpoint.js';
import { updateStoredDesignCheckpoint } from '../../../workflow/review/design-review/checkpoint.js';
import { productionFixture } from './helpers/review-production-fixture.js';
import { until } from './helpers/review-clearance-fixture.js';

for (const family of ['code', 'design'] as const) test(`production approval cleanup removes ${family} runtime checkpoint and contexts from permanent proof without launching a reviewer`, async t => {
 const f = await publishedCleanupFixture(family, t), services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: 'fixture' }));
 let launches = 0;
 const registry = new ReviewWorkers({ services, resolveScope: async () => { throw Error('Cleanup must not admit a reviewer'); }, authorizeNative: async () => { throw Error('Cleanup must not run native work'); }, resolveBinary: async () => { throw Error('No binary'); }, track: () => {}, start: async () => { launches++; throw Error('No reviewer'); } });
 t.after(() => registry.shutdown());
 const result = await registry.cleanupApproved(f.target);
 assert.deepEqual(result.errors, []); assert.deepEqual(result.retained, []); assert.deepEqual(result.deleted, [reviewWorkerCheckpoint(f.key)]);
 for (const path of [reviewRuntimePath(f.key), reviewWorkerCheckpoint(f.key), contextRoot(f.key)]) await assert.rejects(access(path), { code: 'ENOENT' });
 assert.equal(launches, 0);
 assert.deepEqual(await registry.cleanupApproved(f.target), { deleted: [], retained: [], errors: [] });
});

test('Production source-light lifecycle matrix for CodePreparation, StagedPacketConstruction, StagedPacketSources, workers, routes, checkpoint/recovery/progress/cancel/publication/approval/cleanup, mandatory coverage, and unchanged latest-document design review.', async t => {
 const f = await productionFixture(t, undefined, { fullStory: true }), peer = await f.peer();
 for (const family of ['code', 'design'] as const) {
  const request = family === 'code' ? f.codeRequest('cutover-code') : f.designRequest('cutover-design');
  const method = family === 'code' ? 'taskReview' : 'designReview';
  const ack = await peer.call(`${method}.start`, request); await f.release(request.reviewId);
  await until(async () => (await peer.call(`${method}.progress`, request)).status === 'passed');
  const runtimePath = reviewRuntimePath({ project: family === 'code' ? f.code.repo : f.design.repo, family, reviewId: request.reviewId });
  await until(async () => { const runtime = JSON.parse(await readFile(runtimePath, 'utf8')); return runtime.state === 'terminal' && !!runtime.publicationBoundary; });
  const bytes = await readFile(ack.checkpointPath, 'utf8'), cp = JSON.parse(bytes), runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
  assert.equal(cp.schemaVersion, 3); assert.equal(runtime.state, 'terminal'); assert.ok(runtime.publicationBoundary, `${family} publication boundary missing`); assert.equal(cp.runtime.runtimeId, runtime.runtimeId);
  assert.ok(cp.attempts.every((a: object) => !('resourceGuard' in a)));
  const key = { project: family === 'code' ? f.code.repo : f.design.repo, family, reviewId: request.reviewId };
  const manifests = await Promise.all((await readdir(contextRoot(key), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(async entry => {
   try { return JSON.parse(await readFile(`${contextRoot(key)}/${entry.name}/manifest.json`, 'utf8')); } catch { return undefined; }
  }));
  const viewIds = new Set(manifests.flatMap(manifest => manifest?.encoding === 'staged-values-v2' ? manifest.views.map((view: { id: string }) => view.id) : []));
  if (family === 'code') for (const id of ['execution-packet', 'source-locators', 'baseline-workspace']) assert.ok(viewIds.has(id), `missing source-light production view ${id}`);
  else for (const id of ['design-subject', 'design-baseline', 'design-inventory']) assert.ok(viewIds.has(id), `missing latest-document design view ${id}`);
  if (family === 'code') { const semantic = await loadStoredCheckpoint(ack.checkpointPath); assert.ok(semantic); await assert.rejects(saveStoredCheckpoint(ack.checkpointPath, semantic), /downgrade forbidden/); }
  else await assert.rejects(updateStoredDesignCheckpoint(f.design.repo, request.reviewId, old => old!), /downgrade forbidden/);
  assert.equal(await readFile(ack.checkpointPath, 'utf8'), bytes);
  if (family === 'code') {
   const { lifecycleFor } = await import('../../lifecycle-registry.js'), { nextLifecycle } = await import('../../../workflow/artifact-core/lifecycle.js');
   const { hash } = await import('../../../workflow/code-review/task-review/__tests__/publication-fixture.js');
   const actor = { id: 'person:source-light-fixture', kind: 'person' as const, properties: {} };
   await lifecycleFor(f.code.repo).store.updateAndLog(`BUILD-${hash}-s1`, actor, head => ({ next: { ...head, lifecycle: nextLifecycle(head, 'approve', actor, new Date().toISOString()) }, options: { operation: 'approve' } }));
   let cleaned!: Awaited<ReturnType<typeof f.host.registry.cleanupApproved>>;
   await until(async () => { cleaned = await f.host.registry.cleanupApproved({ project: f.code.repo, family: 'code', epicHash: hash, storyId: 's1' }); return cleaned.errors.length === 0; });
   assert.deepEqual(cleaned.errors, []); assert.deepEqual(cleaned.retained, []); assert.deepEqual(cleaned.deleted, [ack.checkpointPath]);
   for (const path of [reviewRuntimePath(key), ack.checkpointPath, contextRoot(key)]) await assert.rejects(access(path), { code: 'ENOENT' });
  }
 }
});

test('explicit production publication recovery reuses accepted feedback after worker reclamation', async t => {
 const f = await productionFixture(t,undefined,{fullStory:true}), peer = await f.peer(), request = f.codeRequest('publication-recovery');
 const ack = await peer.call('taskReview.start', request); await f.release(request.reviewId);
 await until(async () => (await peer.call('taskReview.progress', request)).crPublication === 'complete');
 const before = JSON.parse(await readFile(ack.checkpointPath, 'utf8'));
 const priorCalls=Atomics.load(f.barriers.get(request.reviewId)!,5);assert.ok(priorCalls>0);
 await f.host.registry.shutdown();

 const recovered = await peer.call('taskReview.publish', request);

 assert.equal(recovered.status, 'passed');
 const after = JSON.parse(await readFile(ack.checkpointPath, 'utf8'));
 assert.deepEqual(after.attempts, before.attempts);
 assert.notEqual(after.runtime.runtimeId, before.runtime.runtimeId);
 assert.equal(Atomics.load(f.barriers.get(request.reviewId)!,5),0);
 const {lifecycleFor}=await import('../../lifecycle-registry.js');const {nextLifecycle}=await import('../../../workflow/artifact-core/lifecycle.js');
 const {hash}=await import('../../../workflow/code-review/task-review/__tests__/publication-fixture.js');
 const actor={id:'person:fixture',kind:'person' as const,properties:{}};
 await lifecycleFor(f.code.repo).store.updateAndLog(`BUILD-${hash}-s1`,actor,head=>({next:{...head,lifecycle:nextLifecycle(head,'approve',actor,new Date().toISOString())},options:{operation:'approve'}}));
 const cleaned=await f.host.registry.cleanupApproved({project:f.code.repo,family:'code',epicHash:hash,storyId:'s1'});
 assert.deepEqual(cleaned.errors,[]);assert.deepEqual(cleaned.retained,[]);assert.deepEqual(cleaned.deleted,[ack.checkpointPath]);

});

test('production next-attempt admission migrates closed historical evidence and retains the exact prior input', async t => {
 const f=await productionFixture(t),peer=await f.peer(),request=f.codeRequest('historical-cutover');
 const key={project:f.code.repo,family:'code' as const,reviewId:request.reviewId};
 const {persistReviewWorkerAdmission}=await import('../review-worker-admission.js');
 const {updateStoredCodeCheckpoint}=await import('../../../workflow/code-review/task-review/checkpoint.js');
 await persistReviewWorkerAdmission({key,incarnation:'historical-worker',attempt:1,reviewer:'daemon',actionId:'old-start',submitted:request.packet});
 await updateStoredCodeCheckpoint(reviewWorkerCheckpoint(key),prior=>{
  assert.ok(prior);const a=prior.attempts[0]!;assert.ok('phase'in a);
  a.header.status='failed';a.header.completedAt=new Date().toISOString();a.error={code:'old_failure',field:'admission',summary:'Historical technical failure'};a.progress.phase='error';a.resourceGuard={daemonInstance:'old-daemon',openLeases:[]};return prior;
 });
 const before=JSON.parse(await readFile(reviewWorkerCheckpoint(key),'utf8'));
 await peer.call('taskReview.start',{...request,attempt:2});await f.release(request.reviewId);
 await until(async()=>{const p=await peer.call('taskReview.progress',{...request,attempt:2});if(p.hasError||p.status==='failed'){const cp=JSON.parse(await readFile(reviewWorkerCheckpoint(key),'utf8'));throw new Error(JSON.stringify(cp.attempts.at(-1)));}return p.crPublication==='complete';});
 const after=JSON.parse(await readFile(reviewWorkerCheckpoint(key),'utf8'));
 assert.equal(after.schemaVersion,3);assert.equal(after.attempts.length,2);assert.equal(after.migration.sourceVersion,2);
 const {resourceGuard:_guard,...retained}=before.attempts[0];assert.deepEqual(after.attempts[0],retained);
 assert.deepEqual(after.migration.guards,[{attempt:1,guard:before.attempts[0].resourceGuard}]);
});

test('a production re-review preserves the earlier publication without treating it as the new attempt boundary',async t=>{
 const f=await productionFixture(t),peer=await f.peer(),request=f.codeRequest('second-attempt-boundary');
 const ack=await peer.call('taskReview.start',request);await f.release(request.reviewId);
 await until(async()=> (await peer.call('taskReview.progress',request)).crPublication==='complete');
 const before=JSON.parse(await readFile(ack.checkpointPath,'utf8'));
 await f.host.registry.shutdown();
 await peer.call('taskReview.start',{...request,attempt:2});await f.release(request.reviewId);
 await until(async()=>{const p=await peer.call('taskReview.progress',{...request,attempt:2});if(p.hasError||p.status==='failed'){const cp=JSON.parse(await readFile(ack.checkpointPath,'utf8'));throw new Error(JSON.stringify(cp.attempts.at(-1)));}return p.crPublication==='complete';});
 const after=JSON.parse(await readFile(ack.checkpointPath,'utf8'));
 assert.equal(after.attempts.length,2);assert.deepEqual(after.attempts[0],before.attempts[0]);
 const runtime=JSON.parse(await readFile(reviewRuntimePath({project:f.code.repo,family:'code',reviewId:request.reviewId}),'utf8'));
 assert.equal(runtime.attempt,2);assert.equal(runtime.state,'terminal');assert.ok(runtime.publicationBoundary);
});

test('an explicit production resubmission recovers the initialize-before-checkpoint crash window without losing runtime proof',async t=>{
 const f=await productionFixture(t,'before-save',{hangOnce:true}),peer=await f.peer(),request=f.codeRequest('hung-initialization-recovery');
 const key={project:f.code.repo,family:'code' as const,reviewId:request.reviewId};
 await assert.rejects(peer.call('taskReview.start',request),/bootstrap_timeout/);
 await until(()=>f.createdWorkers.get(request.reviewId)!.threadId===-1);
 const before=JSON.parse(await readFile(reviewRuntimePath(key),'utf8'));
 assert.equal(before.state,'initializing');assert.equal(before.sequence,0);
 await assert.rejects(access(reviewWorkerCheckpoint(key)),{code:'ENOENT'});
 await peer.call('taskReview.start',request);await f.release(request.reviewId);
 await until(async()=> (await peer.call('taskReview.progress',request)).crPublication==='complete');
 const after=JSON.parse(await readFile(reviewRuntimePath(key),'utf8'));
 assert.equal(after.runtimeId,before.runtimeId);assert.notEqual(after.workerIncarnation,before.workerIncarnation);
 const cp=JSON.parse(await readFile(reviewWorkerCheckpoint(key),'utf8'));assert.equal(cp.attempts.length,1);assert.equal(cp.runtime.runtimeId,before.runtimeId);
});
