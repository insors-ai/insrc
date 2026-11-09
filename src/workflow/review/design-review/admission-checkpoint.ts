/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import { validateReviewResourceGuard } from '../../../shared/review-resources.js';
import { decodeDesign, isDesignAdmission, requireDesign, StoredDesignCheckpointSchema } from './contracts.js';
import type { DesignAdmissionCheckpoint, StoredDesignCheckpoint } from './contracts.js';

/** Decode only; the disk reader also applies canonical identity and qualified
 * feedback checks. No admission baseline, inventory or report is invented. */
export function decodeStoredDesignCheckpoint(input: unknown): StoredDesignCheckpoint {
 const cp = decodeDesign(StoredDesignCheckpointSchema, input);
 if (cp.schemaVersion === 1) return cp;
 requireDesign(cp.attempts.every((a, i) => a.number === i + 1), 'invalid_checkpoint', 'Attempt sequence is not contiguous');
 const actions = new Set<string>();
 for (const [i, attempt] of cp.attempts.entries()) {
  if (attempt.resourceGuard) validateReviewResourceGuard(attempt.resourceGuard, { project: cp.project, family: 'design', reviewId: cp.reviewId });
  if (!isDesignAdmission(attempt)) continue;
  requireDesign(!actions.has(attempt.actionId), 'invalid_checkpoint', 'Duplicate admission action identity'); actions.add(attempt.actionId);
  requireDesign(attempt.submitted.attempt === attempt.number, 'invalid_checkpoint', 'Submission attempt mismatch');
  const terminal = attempt.status === 'failed' || attempt.status === 'interrupted';
  requireDesign(terminal === (attempt.finishedAt !== undefined), 'invalid_checkpoint', 'Admission completion time disagrees with status');
  for (const time of [attempt.acceptedAt, attempt.startedAt, attempt.finishedAt, attempt.progress.observedAt]) if (time !== undefined) requireDesign(Number.isFinite(Date.parse(time)), 'invalid_checkpoint', 'Invalid admission timestamp');
  requireDesign(attempt.status !== 'failed' || attempt.error, 'invalid_checkpoint', 'Failed admission needs technical error');
  requireDesign(i === cp.attempts.length - 1 || terminal, 'invalid_checkpoint', 'Earlier admission is still active');
 }
 return cp;
}

/** Runs within the sole serialized checkpoint write path. Resource-only
 * changes cannot authorize inference, rebind input or rewrite accepted work.
 * Native closure support is added with the host lease service; until then no
 * unresolved intent can be removed through these foundational contracts. */
export function checkDesignAdmissionEvolution(previous: StoredDesignCheckpoint, next: DesignAdmissionCheckpoint): void {
 requireDesign(previous.project === next.project && previous.reviewId === next.reviewId, 'foreign_checkpoint', 'Checkpoint identity mismatch');
 requireDesign(next.attempts.length >= previous.attempts.length && next.attempts.length <= previous.attempts.length + 1, 'immutable_history', 'Cannot remove or skip attempts');
 for (const [i, old] of previous.attempts.entries()) {
  const current = next.attempts[i]!;
  if (isDesignAdmission(old)) {
   requireDesign(isDesignAdmission(current), 'invalid_checkpoint', 'Admission qualification requires the family qualification transition');
   requireDesign(same(old.submitted, current.submitted) && old.actionId === current.actionId && old.operation === current.operation && old.reviewer === current.reviewer && old.acceptedAt === current.acceptedAt && old.startedAt === current.startedAt, 'immutable_history', 'Cannot replace pinned admission input/action');
   if (old.status === 'failed' || old.status === 'interrupted') requireDesign(same({ ...old, resourceGuard: undefined }, { ...current, resourceGuard: undefined }), 'immutable_history', 'Terminal admission requires explicit recovery or next attempt');
  } else {
   requireDesign(!isDesignAdmission(current), 'immutable_history', 'Cannot downgrade qualified history');
   // The disk writer checks the qualified projection with the existing
   // execution evolution validator, including all accepted feedback.
   if (i < previous.attempts.length - 1) requireDesign(same({ ...old, resourceGuard: undefined }, { ...current, resourceGuard: undefined }), 'immutable_history', 'Cannot rewrite prior qualified history');
  }
  const guard = 'resourceGuard' in old ? old.resourceGuard : undefined;
  for (const lease of guard?.openLeases ?? []) {
   requireDesign(current.resourceGuard && current.resourceGuard.daemonInstance === guard?.daemonInstance && current.resourceGuard.openLeases.some(saved => same(saved, lease)), 'resource_pending', 'Cannot discard or replace an unresolved native intent');
  }
 }
 if (next.attempts.length > previous.attempts.length) {
  const last = previous.attempts.at(-1)!;
  requireDesign(isDesignAdmission(last) ? last.status === 'failed' || last.status === 'interrupted' : ['passed','changes_requested','incomplete'].includes(last.status) && last.report?.status === last.status && last.publication?.state === 'complete', 'invalid_checkpoint', 'New admission requires an explicit terminal predecessor');
 }
}
