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
  if (attempt.operation === 'start') requireDesign(attempt.submitted.artifactPath && !attempt.submitted.recovery && attempt.submitted.attempt === attempt.number, 'invalid_checkpoint', 'Invalid start submission identity');
  else {
   const recovery = attempt.submitted.recovery;
   requireDesign(recovery && !attempt.submitted.artifactPath, 'invalid_checkpoint', 'Recovery admission needs its exact recovery input');
   requireDesign(attempt.submitted.attempt === attempt.number - (recovery.operation === 'restart_full' ? 1 : 0), 'invalid_checkpoint', 'Recovery source attempt mismatch');
   requireDesign(recovery.operation !== 'restart_full' || recovery.userDecision?.action === 'restart_full', 'invalid_checkpoint', 'Full restart requires its explicit user decision');
  }
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
   if (isDesignAdmission(current)) {
    requireDesign(same(old.submitted, current.submitted) && old.actionId === current.actionId && old.operation === current.operation && old.reviewer === current.reviewer && old.acceptedAt === current.acceptedAt && old.startedAt === current.startedAt, 'immutable_history', 'Cannot replace pinned admission input/action');
    if (old.status === 'failed' || old.status === 'interrupted') requireDesign(same({ ...old, resourceGuard: undefined }, { ...current, resourceGuard: undefined }), 'immutable_history', 'Terminal admission requires explicit recovery or next attempt');
   } else {
    requireDesign(['pending','running'].includes(old.status) && same(old.submitted, current.submitted) && current.actionId === old.actionId && current.operation === old.operation && current.acceptedAt === old.acceptedAt && current.startedAt === old.startedAt && current.reviewer === old.reviewer, 'immutable_history', 'Qualification must preserve the active pinned admission');
    requireDesign(current.status === 'pending' && !current.plan && !current.impact && !current.report && !current.completedChunks.length && !current.current && !current.unit && !current.publication, 'invalid_checkpoint', 'Qualification cannot supply review results or dispatch authority');
   }
  } else {
   requireDesign(!isDesignAdmission(current), 'immutable_history', 'Cannot downgrade qualified history');
   for (const field of ['submitted','acceptedAt','actionId','operation']) requireDesign(same(Reflect.get(old,field),Reflect.get(current,field)), 'immutable_history', 'Cannot replace qualified admission identity');
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
  requireDesign(isDesignAdmission(next.attempts.at(-1)!), 'invalid_checkpoint', 'New attempts must first persist unverified admission');
  requireDesign(isDesignAdmission(last) ? last.status === 'failed' || last.status === 'interrupted' : ['passed','changes_requested','incomplete'].includes(last.status) && last.report?.status === last.status && last.publication?.state === 'complete', 'invalid_checkpoint', 'New admission requires an explicit terminal predecessor');
 }
}
