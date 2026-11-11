/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, hash } from './publication-fixture.js';
import { appendCodeAdmission, decodeStoredCheckpoint, qualifyCodeAdmission, resumeCodeAdmission } from '../admission-checkpoint.js';
import { checkpointPath, loadCheckpoint, loadStoredCheckpoint, saveCheckpoint, saveStoredCheckpoint } from '../checkpoint.js';
import { CheckpointSchema, decodeReview, isCodeAdmission } from '../contracts.js';
import type { CodeAdmissionAttempt } from '../contracts.js';
import { ReviewProgressTracker } from '../progress.js';
import { publishTaskCheckpoint } from '../publication.js';
import { prepareReviewAdmission } from '../admission.js';

test('unverified admission and resource guards preserve pinned code history and refuse approval', async () => {
 const f = await fixture();
 try {
  const historical = f.checkpoint('admission-contract'), qualified = historical.attempts[0]!;
  const oldPath = checkpointPath(f.repo, 'historical-contract');
  await saveCheckpoint(oldPath, { ...historical, reviewId: 'historical-contract' });
  const oldBytes = readFileSync(oldPath, 'utf8');
  assert.deepEqual(await loadStoredCheckpoint(oldPath), await loadCheckpoint(oldPath));
  assert.equal(readFileSync(oldPath, 'utf8'), oldBytes, 'historical reads do not migrate content');
  const time = '2026-11-09T00:00:00.000Z';
  const input: CodeAdmissionAttempt = {
   phase: 'admission', validation: 'unverified', operation: 'start', acceptedAt: time,
   header: { attempt: 1, reviewer: 'daemon', status: 'pending', createdAt: time },
   submitted: structuredClone(f.packet), progress: new ReviewProgressTracker().snapshot(),
   resourceGuard: { daemonInstance: 'daemon-1', openLeases: [{ operationId: 'operation-1', workerIncarnation: 'worker-1', kind: 'git', openedAt: time }] },
  };
  const identity = { project: f.repo, reviewId: historical.reviewId, storyId: historical.storyId, ...(historical.taskId ? { taskId: historical.taskId } : {}) };
  const checkpoint = appendCodeAdmission(identity, input);
  const path = checkpointPath(f.repo, checkpoint.reviewId);
  await saveStoredCheckpoint(path, checkpoint);
  assert.deepEqual(await loadStoredCheckpoint(path), checkpoint);
  const bytes = readFileSync(path, 'utf8');
  input.submitted.functionalSummary = 'caller mutation';
  assert.deepEqual(checkpoint.attempts[0]!.submitted, f.packet, 'construction snapshots the packet');
  assert.throws(() => decodeReview(CheckpointSchema, checkpoint), 'version-one readers must reject admission');
  await assert.rejects(loadCheckpoint(path), /version-2-aware/);
  await assert.rejects(publishTaskCheckpoint(f.repo, hash, checkpoint.reviewId, f.deps));
  let reads = 0;
  const unexpected = async (): Promise<never> => { reads++; throw new Error('Unexpected source call'); };
  await assert.rejects(prepareReviewAdmission(f.repo, checkpoint.reviewId, 1, undefined, 'daemon', { commit: unexpected, file: unexpected, changedRanges: unexpected, isAncestor: unexpected, pathChanges: unexpected }, { operation: 'resume' }), /version-2-aware/);
  assert.equal(reads, 0, 'qualified-only consumers fail before source/model work');
  assert.equal(readFileSync(path, 'utf8'), bytes, 'refusals preserve the exact saved submission');
  for (const patch of [
   { 'review-response': { summary: 'Passed', tasks: [], crPublication: 'complete' } },
   { validation: 'verified' }, { header: { ...input.header, selectedTaskIds: [] } },
   { header: { ...input.header, status: 'passed' } },
   { header: { ...input.header, buildFingerprint: 'invented' } },
   { progress: { ...input.progress, completedTasks: 1 } },
   { progress: { ...input.progress, phase: 'complete' } },
  ]) assert.throws(() => decodeStoredCheckpoint({ ...checkpoint, attempts: [{ ...checkpoint.attempts[0], ...patch }] }));
  for (const schemaVersion of [0, 3, 999]) assert.throws(() => decodeStoredCheckpoint({ ...checkpoint, schemaVersion }));
  assert.throws(() => qualifyCodeAdmission(checkpoint, qualified), /creation time/);
  const prepared = structuredClone(qualified);
  prepared.header.createdAt = time; prepared.header.status = 'pending'; delete prepared.header.completedAt;
  prepared['review-response'].tasks = [];
  const changed = structuredClone(prepared); changed.submitted.functionalSummary = 'changed';
  assert.throws(() => qualifyCodeAdmission(checkpoint, changed), /pinned/);
  const accepted = qualifyCodeAdmission(checkpoint, prepared);
  assert.equal(isCodeAdmission(accepted.attempts[0]!), false);
  assert.deepEqual(accepted.attempts[0]!.resourceGuard, checkpoint.attempts[0]!.resourceGuard);
  assert.equal(accepted.attempts[0]!.acceptedAt, time);
  assert.deepEqual(accepted.attempts[0]!.submitted, f.packet);
  const interrupted = structuredClone(checkpoint), entry = interrupted.attempts[0]!;
  assert.ok(isCodeAdmission(entry)); entry.header.status = 'interrupted'; entry.header.completedAt = time; entry.progress.phase = 'interrupted';
  assert.deepEqual(resumeCodeAdmission(interrupted, 1, f.packet), entry);
  assert.throws(() => resumeCodeAdmission(interrupted, 1, { ...f.packet, functionalSummary: 'changed' }), /pinned/);
  assert.throws(() => resumeCodeAdmission(interrupted, 2, f.packet), /latest/);
  entry.header.status = 'failed'; entry.progress.phase = 'error'; entry.error = { code: 'projection_limit', field: 'packet', summary: 'Existing projection bound exceeded' };
  decodeStoredCheckpoint(interrupted);
  assert.throws(() => resumeCodeAdmission(interrupted, 1, f.packet), /new attempt/);
  const nextInput = { ...structuredClone(entry), header: { attempt: 2, reviewer: 'daemon' as const, status: 'pending' as const, createdAt: time }, progress: new ReviewProgressTracker().snapshot() };
  delete nextInput.error; delete nextInput.resourceGuard;
  const next = appendCodeAdmission(identity, nextInput, interrupted);
  assert.deepEqual(next.attempts[0], entry, 'failed input and unresolved resources remain in history');
  assert.throws(() => appendCodeAdmission(identity, { ...nextInput, header: { ...nextInput.header, attempt: 1 } }, interrupted), /sequential/);
  assert.throws(() => appendCodeAdmission(identity, { ...nextInput, header: { ...nextInput.header, attempt: 3 } }, interrupted), /sequential/);
  assert.throws(() => appendCodeAdmission({ ...identity, reviewId: 'foreign' }, nextInput, interrupted), /identity/);
  await saveStoredCheckpoint(path, next);
  assert.deepEqual(await loadStoredCheckpoint(path), next);
 } finally { f.cleanup(); }
});
