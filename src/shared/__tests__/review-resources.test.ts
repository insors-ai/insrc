/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REVIEW_OPEN_LEASES, validateReviewResourceGuard } from '../review-resources.js';
import type { ReviewResourceGuard } from '../review-resources.js';

test('bounded exact review lease and clearance receipt contracts reject invalid input', () => {
 const key = { project: '/project', family: 'code' as const, reviewId: 'review-1' };
 const lease = { operationId: 'op-1', workerIncarnation: 'worker-1', kind: 'cli', openedAt: '2026-11-09T00:00:00.000Z' };
 const guard: ReviewResourceGuard = { daemonInstance: 'daemon-1', openLeases: [lease] };
 validateReviewResourceGuard(guard, key);
 const before = structuredClone(guard);
 assert.throws(() => validateReviewResourceGuard({ ...guard, openLeases: Array(MAX_REVIEW_OPEN_LEASES + 1).fill(lease) }, key));
 assert.deepEqual(guard, before, 'overflow is refused without truncating unresolved leases');
 assert.throws(() => validateReviewResourceGuard({ ...guard, openLeases: [lease, lease] }, key), /Duplicate/);
 assert.throws(() => validateReviewResourceGuard({ ...guard, openLeases: [{ ...lease, openedAt: '2026-99-99T00:00:00Z' }] }, key), /timestamp/);
 assert.throws(() => validateReviewResourceGuard({ ...guard, transcript: 'forbidden' }, key));
 const cleared: ReviewResourceGuard = { daemonInstance: 'daemon-1', openLeases: [], clearance: {
  at: lease.openedAt, reason: 'Verified native operation ended', approvalReceipt: {
   requestId: 'request-1', decision: 'approve', reviewKey: key, guardDigest: 'a'.repeat(64), leaseIds: ['op-1'],
  },
 } };
 validateReviewResourceGuard(cleared, key);
 for (const foreign of [{ ...key, reviewId: 'other' }, { ...key, project: '/other' }, { ...key, family: 'design' as const }]) {
  assert.throws(() => validateReviewResourceGuard(cleared, foreign), /Foreign/);
 }
 for (const patch of [{ decision: 'deny' }, { guardDigest: 'bad' }, { leaseIds: [] }, { leaseIds: ['op-1', 'op-1'] }, { leaseIds: Array.from({ length: MAX_REVIEW_OPEN_LEASES + 1 }, (_, i) => `op-${i}`) }]) {
  assert.throws(() => validateReviewResourceGuard({ ...cleared, clearance: { ...cleared.clearance, approvalReceipt: { ...cleared.clearance!.approvalReceipt, ...patch } } }, key));
 }
 assert.throws(() => validateReviewResourceGuard({ ...cleared, clearance: { ...cleared.clearance, reason: 'x'.repeat(2049) } }, key));
 // This checks structure only; a fabricated well-shaped receipt still needs
 // the host's actual pending broker outcome before it can clear anything.
 assert.deepEqual(guard, before);
});
