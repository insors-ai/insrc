/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { fixture, hash } from './publication-fixture.js';
import { checkpointPath, loadStoredCheckpoint, saveStoredCheckpoint } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import { readTaskReviewHistory } from '../history.js';
import { ReviewProgressTracker } from '../progress.js';
import { prepareReviewPacket } from '../packet.js';
import { bindTaskFinalIdentities } from '../attribution-binding.js';
import { inspectTaskCompletion } from '../completion.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { renderTaskReview } from '../record.js';
import { codeReviewArtifactId } from '../../../storage.js';
import { reviewResourceAudits } from '../../../review/resource-audit.js';
import type { AdmissionCheckpoint, CodeAdmissionAttempt, ReviewCheckpoint } from '../contracts.js';

test('failed admission survives successful next attempt publication and post-cleanup reads', async () => {
 const f = await fixture(true);
 try {
  const base = f.checkpoint('admission-history'), path = checkpointPath(f.repo, base.reviewId), time = '2026-11-09T00:00:00.000Z';
  const tracker = new ReviewProgressTracker(); tracker.phase('error');
  const failed: CodeAdmissionAttempt = { phase: 'admission', validation: 'unverified', operation: 'start', acceptedAt: time,
   header: { attempt: 1, reviewer: 'daemon', status: 'failed', createdAt: time, completedAt: time },
   submitted: structuredClone(f.packet), progress: tracker.snapshot(), error: { code: 'projection_limit', field: 'reviewSet', summary: 'Source qualification failed before task selection' },
   resourceGuard: { daemonInstance: 'daemon-1', openLeases: [{ operationId: 'op-1', workerIncarnation: 'worker-1', kind: 'git', openedAt: time }] },
  };
  const cp: AdmissionCheckpoint = { ...base, schemaVersion: 2, attempts: [failed] };
  await saveStoredCheckpoint(path, cp);
  const first = await publishTaskCheckpoint(f.repo, hash, cp.reviewId, f.deps);
  const technical = await readTaskReviewHistory(f.repo, hash, 's1');
  const progress = await new TaskReviewCoordinator().progress(f.repo, cp.reviewId, 1);
  assert.equal(progress.admission!.validation, 'unverified'); assert.equal(progress.admission!.error!.code, 'projection_limit');
  assert.equal(progress.totalTasks, 0); assert.equal(progress.completedTasks, 0);
  assert.equal(technical.status, 'failed'); assert.equal(technical.reviews.length, 0);
  assert.equal(technical.admissionFailures![0]!.attempt.error!.code, 'projection_limit');
  const firstHead = JSON.parse(await readFile(first.jsonPath, 'utf8'));
  assert.ok(inspectTaskCompletion(firstHead, f.build, hash, 's1').gap, 'technical admission never approves BUILD');
  // Simulate the host's confirmed disposal/clearance before admitting any
  // successor. This fixture has no real native operation or inference.
  failed.resourceGuard = { daemonInstance: 'daemon-1', openLeases: [], clearance: { at: time, reason: 'Fixture confirms operation ended', approvalReceipt: {
   requestId: 'clearance-1', decision: 'approve', reviewKey: { project: f.repo, family: 'code', reviewId: cp.reviewId }, guardDigest: 'a'.repeat(64), leaseIds: ['op-1'],
  } } };
  const qualified = structuredClone(base.attempts[0]!); qualified.header.attempt = 2; qualified.header.attributionState = 'pending';
  delete qualified.header.acceptedAttribution; delete qualified.header.taskScopeIdentities; delete qualified.header.attributionIdentity; delete qualified.header.taskIdentityFormat;
  const prepared = await prepareReviewPacket(f.packet, f.deps.sources, true);
  const view: ReviewCheckpoint = { ...base, attempts: [qualified] };
  await bindTaskFinalIdentities({ path, checkpoint: view, attempt: qualified, prepared }, [{ taskId: 't1', changeIndexes: [0], testIndexes: [0], decision: { action: 'reassess', reason: 'Previous attempt never assessed code' } }]);
  cp.attempts = [failed, qualified]; await saveStoredCheckpoint(path, cp);
  await assert.rejects(publishTaskCheckpoint(f.repo, hash, cp.reviewId, { ...f.deps, saveStored: async () => { throw Error('lost checkpoint receipt'); } }), /lost checkpoint receipt/);
  const receipt = await publishTaskCheckpoint(f.repo, hash, cp.reviewId, f.deps);
  const body = await readTaskReviewHistory(f.repo, hash, 's1');
  assert.equal(body.status, 'passed'); assert.deepEqual(body.reviews.map(r => r.attempt), [2]);
  assert.equal(body.admissionFailures![0]!.attempt.header.attempt, 1);
  assert.equal('review-response' in body.admissionFailures![0]!.attempt, false);
  assert.match(renderTaskReview(body), /Technical admission only/);
  const head = JSON.parse(await readFile(receipt.jsonPath, 'utf8'));
  assert.equal(inspectTaskCompletion(head, f.build, hash, 's1').gap, undefined);
  assert.match(inspectTaskCompletion(head,{...f.build,meta:{...f.build.meta,authoredBy:'daemon'}},hash,'s1').gap??'',/independent/);
  assert.match(inspectTaskCompletion(head,{...f.build,meta:{...f.build.meta,authoredBy:undefined}},hash,'s1').gap??'',/independent/);
  const store = f.deps.through.store!, id = codeReviewArtifactId(hash, 's1');
  const count = (await store.history.log(id)).length;
  await publishTaskCheckpoint(f.repo, hash, cp.reviewId, f.deps);
  assert.equal((await store.history.log(id)).length, count, 'publication replay is model-free and idempotent');
  const audits = reviewResourceAudits(await store.history.log(id), id, { project: f.repo, family: 'code', reviewId: cp.reviewId });
  assert.equal(audits.at(-1)!.guards[0]!.resourceGuard.clearance!.approvalReceipt.requestId, 'clearance-1');
  assert.equal((await loadStoredCheckpoint(path))!.attempts.at(-1)!['review-response'].crPublication, 'complete');
  // Working-state removal exercises permanent reads independently of the
  // coordinated cleanup implementation in the later cleanup task.
  await unlink(path);
  assert.deepEqual(await readTaskReviewHistory(f.repo, hash, 's1'), body);
  await writeFile(receipt.jsonPath, JSON.stringify({ ...head, meta: { ...head.meta, schemaVersion: 99 } }));
  await assert.rejects(readTaskReviewHistory(f.repo, hash, 's1'), /Unsupported permanent CR version/);
 } finally { f.cleanup(); }
});

test('published pass then technical admission failure still admits the next qualified attempt',async()=>{
 const f=await fixture(true);
 try{
  const base=f.checkpoint('publication'),path=checkpointPath(f.repo,'publication');
  await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  const first=(await loadStoredCheckpoint(path))!.attempts[0]!;
  const now=new Date().toISOString();
  const failed:CodeAdmissionAttempt={phase:'admission',validation:'unverified',operation:'start',acceptedAt:now,header:{attempt:2,reviewer:'daemon',status:'failed',createdAt:now,completedAt:now},submitted:structuredClone(f.packet),progress:{...new ReviewProgressTracker().snapshot(),phase:'error'},error:{code:'fixture',field:'packet',summary:'Temporary admission failure'}};
  const cp:AdmissionCheckpoint={...base,schemaVersion:2,attempts:[first,failed]};
  await saveStoredCheckpoint(path,cp);await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  assert.equal((await readTaskReviewHistory(f.repo,hash,'s1')).status,'failed');
  const {prepareWorkerCodeAdmission}=await import('../worker-checkpoint.js');
  const {persistReviewWorkerAdmission}=await import('../../../../daemon/threads/review-worker-admission.js');
  await persistReviewWorkerAdmission({key:{project:f.repo,family:'code',reviewId:'publication'},incarnation:'third',attempt:3,reviewer:'daemon',actionId:'third',submitted:f.packet});
  const next=await prepareWorkerCodeAdmission(f.repo,'publication',3,f.packet,'daemon',f.deps.sources,{epicHash:hash});
  assert.equal(next.attempt.header.attempt,3);
  assert.equal(next.attempt.header.attributionState,'pending');
  assert.equal((await loadStoredCheckpoint(path))!.attempts.length,3,'new admission retains both prior attempts');
 }finally{f.cleanup();}
});

test('technical admission publication refuses unsupported CR versions without changing permanent bytes',async()=>{
 const f=await fixture(true);
 try{
  const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  const head=JSON.parse(await readFile(published.jsonPath,'utf8'));head.meta.schemaVersion=99;
  const bytes=JSON.stringify(head);await writeFile(published.jsonPath,bytes);
  const now=new Date().toISOString();
  const failed:CodeAdmissionAttempt={phase:'admission',validation:'unverified',operation:'start',acceptedAt:now,header:{attempt:1,reviewer:'daemon',status:'failed',createdAt:now,completedAt:now},submitted:structuredClone(f.packet),progress:{...new ReviewProgressTracker().snapshot(),phase:'error'},error:{code:'fixture',field:'packet',summary:'Technical failure'}};
  await saveStoredCheckpoint(checkpointPath(f.repo,'technical'),{...f.checkpoint('technical'),schemaVersion:2,attempts:[failed]});
  await assert.rejects(publishTaskCheckpoint(f.repo,hash,'technical',f.deps),/Unsupported prior CR version/);
  assert.equal(await readFile(published.jsonPath,'utf8'),bytes);
 }finally{f.cleanup();}
});
