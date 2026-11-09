/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { impactFixture } from './impact-fixtures.js';
import { admissionFixture } from './fixtures.js';
import { isDesignAdmission } from '../contracts.js';
import type { DesignAdmissionCheckpoint, ResourceDesignAttempt } from '../contracts.js';
import { updateStoredDesignCheckpoint, loadStoredDesignCheckpoint, qualifiedDesignProjection } from '../checkpoint.js';
import { createRepoLifecycle } from '../../../artifact-core/repo-lifecycle.js';
import { designAdmissionFailures, publishDesignAdmissionFailure, recordDesignAdmission, requireCurrentDesignApproval } from '../approval.js';
import { publishDesignReview } from '../publication.js';
import { consolidateDesignReview } from '../results.js';
import { designPreservationDigest, validatePermanentDesignReview } from '../history.js';
import { permanentStoredDesignCheckpoint, renderPermanentDesignReview } from '../read.js';
import { reviewResourceAudits } from '../../resource-audit.js';

test('technical admission diagnostics remain non-review evidence across publication', async t => {
 const f = impactFixture(t), lifecycle = createRepoLifecycle(f.repo), cp = admissionFixture(f), failed = cp.attempts[0]!;
 assert.ok(isDesignAdmission(failed));
 failed.status = 'failed'; failed.finishedAt = failed.startedAt; failed.error = { code: 'subject_unavailable', field: 'artifactPath', summary: 'Subject qualification failed before planning' };
 await updateStoredDesignCheckpoint(f.repo, cp.reviewId, () => cp);
 const failureId = await publishDesignAdmissionFailure(f.repo, f.id, cp.reviewId, failed);
 assert.equal(await publishDesignAdmissionFailure(f.repo, f.id, cp.reviewId, failed), failureId);
 assert.equal(designAdmissionFailures(await lifecycle.history.log(f.id), f.repo, f.id).length, 1);
 await assert.rejects(publishDesignReview(cp), /no consolidated report/);
 const headBefore = await lifecycle.store.readWithHistory(f.id);
 await assert.rejects(requireCurrentDesignApproval(f.repo, headBefore, headBefore.changeLog), /no permanent/);
 const pending = structuredClone(failed); pending.number = 2; pending.submitted.attempt = 2; pending.actionId = 'start-2'; pending.status = 'pending'; delete pending.finishedAt; delete pending.error;
 await updateStoredDesignCheckpoint(f.repo, cp.reviewId, current => {
  assert.ok(current?.schemaVersion === 2); current.attempts.push(pending); return current;
 });
 const qualified: ResourceDesignAttempt = { ...structuredClone(f.checkpoint.attempts[0]!), number: 2, status: 'pending',
  startedAt: pending.startedAt, acceptedAt: pending.acceptedAt, actionId: pending.actionId, operation: pending.operation,
  submitted: pending.submitted, reviewer: pending.reviewer, resourceGuard: { daemonInstance: 'daemon-1', openLeases: [] },
 };
 await updateStoredDesignCheckpoint(f.repo, cp.reviewId, current => {
  assert.ok(current?.schemaVersion === 2); current.artifactId = f.id; current.subject = f.prepared.subject; current.attempts[1] = qualified; return current;
 });
 let current = (await loadStoredDesignCheckpoint(f.repo, cp.reviewId))!; assert.ok(current.schemaVersion === 2);
 await recordDesignAdmission(qualifiedDesignProjection(current)!);
 await updateStoredDesignCheckpoint(f.repo, cp.reviewId, saved => {
  assert.ok(saved?.schemaVersion === 2); const a = saved.attempts[1]!; assert.ok(!isDesignAdmission(a));
  a.plan = f.plan; a.completedChunks = structuredClone(f.baseline.completedChunks); a.status = 'passed'; a.finishedAt = pending.startedAt;
  a.report = consolidateDesignReview(cp.reviewId, 2, f.prepared.subject, a.baseline.contentIdentity, a.plan, a.completedChunks); return saved;
 });
 current = (await loadStoredDesignCheckpoint(f.repo, cp.reviewId))!;
 const receipt = await publishDesignReview(current);
 assert.equal((await publishDesignReview(current)).artifactHistoryEntryId, receipt.artifactHistoryEntryId, 'lost receipt replay does not re-review');
 await updateStoredDesignCheckpoint(f.repo, cp.reviewId, saved => {
  assert.ok(saved?.schemaVersion === 2); const a = saved.attempts[1]!; assert.ok(!isDesignAdmission(a)); a.publication = receipt; return saved;
 });
 const beforeGuardUpdate = (await loadStoredDesignCheckpoint(f.repo, cp.reviewId))!, digest = designPreservationDigest(beforeGuardUpdate);
 await updateStoredDesignCheckpoint(f.repo, cp.reviewId, saved => {
  assert.ok(saved?.schemaVersion === 2); saved.attempts[1]!.resourceGuard = { daemonInstance: 'daemon-2', openLeases: [], clearance: {
   at: pending.startedAt, reason: 'Trusted fixture host recorded confirmed historical disposal', approvalReceipt: {
    requestId: 'clearance-later', decision: 'approve', reviewKey: { project: f.repo, family: 'design', reviewId: cp.reviewId }, guardDigest: 'b'.repeat(64), leaseIds: ['historical-op'],
   },
  } }; return saved;
 });
 const updated = (await loadStoredDesignCheckpoint(f.repo, cp.reviewId))!;
 assert.equal(designPreservationDigest(updated), digest);
 assert.equal((await publishDesignReview(updated)).artifactHistoryEntryId, receipt.artifactHistoryEntryId);
 const log = await lifecycle.history.log(f.id);
 assert.equal(log.filter(e => e.operation === 'review').length, 1);
 const permanent = validatePermanentDesignReview(log.find(e => e.id === receipt.artifactHistoryEntryId)!.outcome!.data, { project: f.repo, artifactId: f.id });
 assert.equal(permanent.schemaVersion, 2); assert.deepEqual(permanent.attempts.map(a => a.number), [2]);
  assert.throws(() => validatePermanentDesignReview({ ...permanent, schemaVersion: 99 }, { project: f.repo, artifactId: f.id }));
  const changed = structuredClone(permanent);
  assert.ok(changed.schemaVersion === 2); changed.admissionFailures[0]!.submitted.artifactPath = f.md;
  assert.throws(() => validatePermanentDesignReview(changed, { project: f.repo, artifactId: f.id }), /preservation digest/);
 assert.match(renderPermanentDesignReview(permanent), /technical admission failed; no chunk assessment/);
 const head = await lifecycle.store.readWithHistory(f.id);
 await requireCurrentDesignApproval(f.repo, head, head.changeLog);
 const audit = reviewResourceAudits(log, f.id, { project: f.repo, family: 'design', reviewId: cp.reviewId });
 assert.equal(audit.at(-1)!.guards[0]!.resourceGuard.clearance!.approvalReceipt.requestId, 'clearance-later');
 // A later failed admission is a technical failure, not a replacement pass.
 const later = { ...structuredClone(failed), number: 3, actionId: 'start-3', submitted: { ...failed.submitted, attempt: 3 } };
 await publishDesignAdmissionFailure(f.repo, f.id, cp.reviewId, later);
 const afterFailure = await lifecycle.store.readWithHistory(f.id);
 await assert.rejects(requireCurrentDesignApproval(f.repo, afterFailure, afterFailure.changeLog), /later or untracked/);
 // Exercise permanent reads after removal of working state; actual fenced
 // cleanup and native-resource reclamation are qualified by the cleanup task.
 await unlink(f.path);
 const read = permanentStoredDesignCheckpoint(f.repo, f.json, cp.reviewId, 2).checkpoint;
 assert.equal(read.schemaVersion, 2); assert.equal(isDesignAdmission(read.attempts[0]!), true);
 assert.equal(read.attempts[1]!.number, 2);
 const failedRead = permanentStoredDesignCheckpoint(f.repo, f.json, cp.reviewId, 1).checkpoint;
 assert.ok(failedRead.schemaVersion === 2 && isDesignAdmission(failedRead.attempts[0]!)); assert.equal('subject' in failedRead, false);
});
