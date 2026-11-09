/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { designFixture, admissionFixture } from './fixtures.js';
import { decodeStoredDesignCheckpoint } from '../admission-checkpoint.js';
import { DesignCheckpointSchema, decodeDesign, isDesignAdmission } from '../contracts.js';
import { loadDesignCheckpoint, loadStoredDesignCheckpoint, saveDesignCheckpoint, updateStoredDesignCheckpoint } from '../checkpoint.js';

test('historical design attempts and unverified admission retain separate semantics', async t => {
 const f = designFixture(t);
 await saveDesignCheckpoint(f.repo, f.checkpoint);
 const bytes = await readFile(f.path, 'utf8');
 assert.deepEqual(await loadStoredDesignCheckpoint(f.repo, 'review-1'), f.checkpoint);
 assert.equal(await readFile(f.path, 'utf8'), bytes, 'legacy read does not rewrite accepted history');
 const cp = admissionFixture(f), admission = cp.attempts[0]!;
 assert.ok(isDesignAdmission(admission));
 assert.throws(() => decodeDesign(DesignCheckpointSchema, cp), 'old consumers reject admission format');
 for (const patch of [{ baseline: f.prepared.baseline }, { inventory: f.prepared.inventory }, { plan: {} }, { report: {} }, { completedChunks: [] }, { status: 'passed' }, { validation: 'verified' }]) {
  assert.throws(() => decodeStoredDesignCheckpoint({ ...cp, attempts: [{ ...admission, ...patch }] }));
 }
 for (const schemaVersion of [0, 3]) assert.throws(() => decodeStoredDesignCheckpoint({ ...cp, schemaVersion }));
 const recovery = { ...admission, operation: 'recover', submitted: { attempt: 1, recovery: { operation: 'resume' } } };
 decodeStoredDesignCheckpoint({ ...cp, attempts: [recovery] });
 assert.throws(() => decodeStoredDesignCheckpoint({ ...cp, attempts: [{ ...recovery, submitted: { attempt: 1 } }] }), /exact recovery input/);
 assert.throws(() => decodeStoredDesignCheckpoint({ ...cp, attempts: [{ ...recovery, submitted: { attempt: 1, recovery: { operation: 'restart_full' } } }] }), /source attempt/);
 // A second isolated identity is enough to test admission persistence without
 // pretending an active qualified attempt can be replaced by an admission.
 cp.reviewId = 'admission-1'; admission.progress.checkpointPath = f.path.replace('review-1.json', 'admission-1.json');
 await updateStoredDesignCheckpoint(f.repo, cp.reviewId, () => cp);
 assert.deepEqual(await loadStoredDesignCheckpoint(f.repo, cp.reviewId), cp);
 await assert.rejects(loadDesignCheckpoint(f.repo, cp.reviewId), /version-2-aware/);
 await assert.rejects(updateStoredDesignCheckpoint(f.repo, cp.reviewId, current => {
  assert.ok(current?.schemaVersion === 2); const a = current.attempts[0]!; assert.ok(isDesignAdmission(a));
  a.submitted.artifactPath = f.md; return current;
 }), /pinned/);
 await assert.rejects(updateStoredDesignCheckpoint(f.repo, cp.reviewId, current => {
  assert.ok(current?.schemaVersion === 2); const a = current.attempts[0]!; assert.ok(isDesignAdmission(a)); a.actionId = 'replacement'; return current;
 }), /pinned/);
 assert.deepEqual(await loadStoredDesignCheckpoint(f.repo, cp.reviewId), cp);
 await updateStoredDesignCheckpoint(f.repo, cp.reviewId, current => {
  assert.ok(current?.schemaVersion === 2); const a = current.attempts[0]!; assert.ok(isDesignAdmission(a));
  a.status = 'failed'; a.finishedAt = a.startedAt; a.error = { code: 'subject_missing', field: 'artifactPath', summary: 'Requested subject does not exist' }; return current;
 });
 await assert.rejects(updateStoredDesignCheckpoint(f.repo, cp.reviewId, current => {
  assert.ok(current?.schemaVersion === 2); const a = current.attempts[0]!; assert.ok(isDesignAdmission(a)); a.status = 'pending'; delete a.finishedAt; delete a.error; return current;
 }), /explicit recovery/);
 assert.equal(await readFile(f.path, 'utf8'), bytes, 'unrelated historical checkpoint is untouched');
});
