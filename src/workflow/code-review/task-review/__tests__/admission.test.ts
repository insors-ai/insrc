import { bindTaskFinalIdentities } from '../attribution-binding.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, hash } from './publication-fixture.js';
import { prepareReviewAdmission } from '../admission.js';
import { checkpointPath, saveCheckpoint, loadCheckpoint } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import { validateTaskBody } from '../record.js';
import { decodeReview, CheckpointSchema, MAX_REVIEW_JSON_BYTES } from '../contracts.js';
import { TaskReviewCoordinator } from '../coordinator.js';

test('recovery admission: saved pins, latest-only resume, contiguous attempts and immutable prior sections', async () => {
 const f=await fixture(true,3);
 try {
  const fresh=await prepareReviewAdmission(f.repo,'fresh',1,f.packet,'daemon',f.deps.sources);
  assert.equal(fresh.attempt.header.attempt,1);assert.equal(existsSync(fresh.path),false,'preparation has no disk mutation');
  const state=f.checkpoint('resume'),path=checkpointPath(f.repo,'resume');
  state.attempts[0]!['review-response'].tasks=state.attempts[0]!['review-response'].tasks.slice(0,1);delete state.attempts[0]!.header.completedAt;state.attempts[0]!.header.interrupted=true;
  await saveCheckpoint(path,state);const bytes=readFileSync(path,'utf8');
  const resumed=await prepareReviewAdmission(f.repo,'resume',1,undefined,'daemon',f.deps.sources,{operation:'resume',epicHash:hash});
  assert.deepEqual(resumed.checkpoint,state);assert.equal(resumed.attempt.header.buildFingerprint,state.attempts[0]!.header.buildFingerprint);
  for(const attempt of [0,-1,1.1,Number.MAX_SAFE_INTEGER+1])await assert.rejects(prepareReviewAdmission(f.repo,'resume',attempt,undefined,'daemon',f.deps.sources,{operation:'resume'}));
  await assert.rejects(prepareReviewAdmission(f.repo,'resume',2,undefined,'daemon',f.deps.sources,{operation:'resume'}),/latest attempt/);
  await assert.rejects(prepareReviewAdmission(f.repo,'resume',1,{...f.packet,functionalSummary:'Changed'},'daemon',f.deps.sources,{operation:'resume'}),/pinned/);
  await assert.rejects(prepareReviewAdmission(f.repo,'resume',1,{...f.packet,reviewRevision:f.packet.reviewSet[0]!.parent!},'daemon',f.deps.sources,{operation:'resume'}),/pinned/);
  await assert.rejects(prepareReviewAdmission(f.repo,'resume',1,undefined,'controller',f.deps.sources,{operation:'resume'}),/wrong-reviewer/);
  await assert.rejects(prepareReviewAdmission(f.repo,'resume',2,f.packet,'daemon',f.deps.sources),/terminal and published/);
  await assert.rejects(prepareReviewAdmission(f.repo,'missing',1,undefined,'daemon',f.deps.sources,{operation:'resume'}),/missing-checkpoint/);
  await assert.rejects(prepareReviewAdmission(f.repo,'missing',2,f.packet,'daemon',f.deps.sources),/missing-checkpoint/);
  assert.equal(readFileSync(path,'utf8'),bytes,'every refusal preserves saved input/results');
  const complete=f.checkpoint('complete'),completePath=checkpointPath(f.repo,'complete');await saveCheckpoint(completePath,complete);
  await publishTaskCheckpoint(f.repo,hash,'complete',f.deps);const prior=await loadCheckpoint(completePath);
  const changed={...f.packet,functionalSummary:'Review fixes'};
  const next=await prepareReviewAdmission(f.repo,'complete',2,changed,'daemon',f.deps.sources);
  assert.deepEqual(next.checkpoint.attempts[0],prior!.attempts[0]);assert.equal(next.attempt.header.attempt,2);assert.deepEqual(next.attempt.submitted,changed);assert.equal(next.attempt['review-response'].tasks.length,0);
  assert.deepEqual(await loadCheckpoint(completePath),prior,'preparing a new attempt does not write');
  for(const ordinal of [1,3])await assert.rejects(prepareReviewAdmission(f.repo,'complete',ordinal,changed,'daemon',f.deps.sources),/sequential/);
  await saveCheckpoint(completePath,next.checkpoint);
  const r2=await prepareReviewAdmission(f.repo,'complete',2,undefined,'daemon',f.deps.sources,{operation:'resume'});assert.equal(r2.attempt.header.attempt,2);
  await assert.rejects(prepareReviewAdmission(f.repo,'complete',1,undefined,'daemon',f.deps.sources,{operation:'resume'}),/latest attempt/);
  const gap=structuredClone(next.checkpoint);gap.attempts[1]!.header.attempt=3;f.put('.insrc/tmp/code-review/gap.json',{...gap,reviewId:'gap'});
  await assert.rejects(prepareReviewAdmission(f.repo,'gap',3,undefined,'daemon',f.deps.sources,{operation:'resume'}),/contiguous/);
  const foreign=structuredClone(state);foreign.reviewId='foreign';foreign.project=join(f.repo,'other');f.put('.insrc/tmp/code-review/foreign.json',foreign);
  await assert.rejects(prepareReviewAdmission(f.repo,'foreign',1,undefined,'daemon',f.deps.sources,{operation:'resume'}),/identity mismatch/);
  f.put('.insrc/tmp/code-review/corrupt.json','{');await assert.rejects(prepareReviewAdmission(f.repo,'corrupt',1,undefined,'daemon',f.deps.sources,{operation:'resume'}));
  f.put('.insrc/tmp/code-review/huge.json',' '.repeat(MAX_REVIEW_JSON_BYTES+1));await assert.rejects(loadCheckpoint(checkpointPath(f.repo,'huge')),/bounded checkpoint/);
  symlinkSync(path,checkpointPath(f.repo,'linked'));await assert.rejects(loadCheckpoint(checkpointPath(f.repo,'linked')));
 } finally {f.cleanup();}
});

test('interrupted unpinned attempts remain readable but cannot execute on resume', async () => {
 const f = await fixture();
 try {
  const state = f.checkpoint('unpinned');
  delete state.attempts[0]!.submitted.reviewRevision;
  for (const key of ['finalScopeIdentity','attributionState','acceptedAttribution','taskScopeIdentities','attributionIdentity','attributionFailure'] as const) delete state.attempts[0]!.header[key];
  const path = checkpointPath(f.repo, 'unpinned');
  await saveCheckpoint(path, state);
  const bytes = readFileSync(path, 'utf8');
  assert.deepEqual(await loadCheckpoint(path), state);
  await assert.rejects(prepareReviewAdmission(f.repo, 'unpinned', 1, undefined, 'daemon', f.deps.sources, { operation: 'resume' }), /Interrupted unpinned history is read-only/);
  assert.equal(readFileSync(path, 'utf8'), bytes);
 } finally { f.cleanup(); }
});

test('zero-segment fresh admission rejects before history source work, checkpoint replacement or provider dispatch on both routes', async () => {
 const f = await fixture();
 try {
  await publishTaskCheckpoint(f.repo, hash, 'publication', f.deps);
  const path = checkpointPath(f.repo, 'publication'), bytes = readFileSync(path, 'utf8');
  const packet = structuredClone(f.packet); packet.reviewSet[0]!.files[0]!.segments = [];
  let reads = 0, providers = 0, publications = 0;
  const unexpected = async (): Promise<never> => { reads++; throw new Error('Unexpected source read'); };
  const coordinator = new TaskReviewCoordinator({ sources: { commit: unexpected, file: unexpected, changedRanges: unexpected, isAncestor: unexpected },
   provider: () => { providers++; throw new Error('Unexpected provider dispatch'); },
   publish: async () => { publications++; throw new Error('Unexpected publication'); } });
  for (const party of ['daemon', 'controller'] as const) for (const existing of [false, true]) {
   const id = existing ? 'publication' : `zero-${party}`, ordinal = existing ? 2 : 1;
   if (party === 'daemon') await assert.rejects(coordinator.start(f.repo, id, ordinal, packet), /scope_conflict/);
   else await assert.rejects(coordinator.startController(f.repo, id, ordinal, packet, { id: 'controller', signal: new AbortController().signal }, hash), /scope_conflict/);
   assert.equal(readFileSync(path, 'utf8'), bytes);
   if (!existing) assert.equal(existsSync(checkpointPath(f.repo, id)), false);
  }
  assert.equal(reads, 0); assert.equal(providers, 0); assert.equal(publications, 0);
 } finally { f.cleanup(); }
});

test('attempt schema compatibility: optional origins and old checkpoint/CR meaning', async () => {
 const f=await fixture();
 try {
  const path=checkpointPath(f.repo,'publication'),old=await loadCheckpoint(path);
  assert.deepEqual(decodeReview(CheckpointSchema,old),old);assert.equal(old!.attempts[0]!['review-response'].origins,undefined);
  const first=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  const record=f.readRecord(first.jsonPath);assert.equal(record.body.reviews[0]!.origins,undefined);
  const next=await prepareReviewAdmission(f.repo,'publication',2,f.packet,'daemon',f.deps.sources);
  const source=next.checkpoint.attempts[0]!,entry=next.attempt;
  entry.header.completedAt=source.header.completedAt!;entry.header.reassessmentSummary='Selected task is unchanged';entry['review-response'].tasks=structuredClone(source['review-response'].tasks);
  await bindTaskFinalIdentities(next,[{taskId:'t1',changeIndexes:[0],testIndexes:[0],decision:{action:'reuse',sourceAttempt:1,reason:'Same selected behavior and verified evidence'}}]);
  entry['review-response'].origins=[{taskId:'t1',sourceAttempt:1,reason:'Same selected behavior and verified evidence'}];
  await saveCheckpoint(path,next.checkpoint);const second=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);
  const saved=f.readRecord(second.jsonPath);assert.equal(saved.body.reviews.length,2);assert.deepEqual(saved.body.reviews[0],record.body.reviews[0]);assert.deepEqual(saved.body.reviews[1]!.origins,entry['review-response'].origins);
  assert.equal(saved.body.reviews[1]!.reassessmentSummary,entry.header.reassessmentSummary);
  assert.match(readFileSync(second.path,'utf8'), /Reused task t1 feedback from attempt 1/);
  const invalid=structuredClone(saved.body);invalid.reviews[1]!.origins![0]!.sourceAttempt=2;assert.throws(()=>validateTaskBody(invalid),/earlier attempt|Reuse provenance/);
  const altered=structuredClone(saved.body);altered.reviews[1]!.tasks[0]!.advice=['Changed feedback'];assert.throws(()=>validateTaskBody(altered),/changes the saved result/);
  const bytes=readFileSync(path,'utf8');
  const tooLarge=structuredClone(next.checkpoint);tooLarge.attempts[1]!['review-response'].summary='x'.repeat(MAX_REVIEW_JSON_BYTES);
  await assert.rejects(saveCheckpoint(path,tooLarge));assert.equal(readFileSync(path,'utf8'),bytes);
  // A publication flag is not proof: admission also checks the permanent CR.
  const cr=JSON.parse(readFileSync(second.jsonPath,'utf8'));cr.body.reviews=[];writeFileSync(second.jsonPath,JSON.stringify(cr));
  await assert.rejects(prepareReviewAdmission(f.repo,'publication',3,f.packet,'daemon',f.deps.sources));
 } finally {f.cleanup();}
});
