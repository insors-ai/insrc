/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import { validateReviewResourceGuard,reviewGuardDigest } from '../../../shared/review-resources.js';
import type { ReviewAuthorizedClearance } from '../../../shared/review-resources.js';
import { decodeDesign, isDesignAdmission, requireDesign, StoredDesignCheckpointSchema } from './contracts.js';
import type { DesignAdmissionCheckpoint, StoredDesignCheckpoint } from './contracts.js';
import type { ReviewResourceGuard } from '../../../shared/review-resources.js';
import { designActionEvolution } from './action-state.js';

/** Decode only; the disk reader also applies canonical identity and qualified
 * feedback checks. No admission baseline, inventory or report is invented. */
export function decodeStoredDesignCheckpoint(input: unknown): StoredDesignCheckpoint {
 const cp = decodeDesign(StoredDesignCheckpointSchema, input);
 if (cp.schemaVersion === 1) return cp;
 requireDesign(cp.attempts.every((a, i) => a.number === i + 1), 'invalid_checkpoint', 'Attempt sequence is not contiguous');
 const actions = new Set<string>();
 for (const [i, attempt] of cp.attempts.entries()) {
  if (attempt.resourceGuard) validateReviewResourceGuard(attempt.resourceGuard, { project: cp.project, family: 'design', reviewId: cp.reviewId });
  for(const action of attempt.actions??[]){requireDesign(!actions.has(action.actionId)&&action.sourceAttempt===attempt.number&&action.resultAttempt===attempt.number+(action.operation==='restart_full'?1:0),'invalid_checkpoint','Invalid or duplicate recovery action');actions.add(action.actionId);}
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
 * Only exact closures supplied by the registered host lease service permit
 * intent removal; ordinary checkpoint writes retain every unresolved lease. */
export function checkDesignAdmissionEvolution(previous: StoredDesignCheckpoint, next: DesignAdmissionCheckpoint,hostConfirmedClosures:readonly ReviewResourceGuard['openLeases'][number][]=[],authorizedClearance?:ReviewAuthorizedClearance): void {
 if(authorizedClearance&&!same(previous,next)){
  const key={project:previous.project,family:'design' as const,reviewId:previous.reviewId};
  const rows=previous.attempts.flatMap(a=>'resourceGuard'in a&&a.resourceGuard?[{attempt:a.number,resourceGuard:a.resourceGuard}]:[]);
  requireDesign(same(key,authorizedClearance.approvalReceipt.reviewKey)&&reviewGuardDigest(key,rows)===authorizedClearance.approvalReceipt.guardDigest,'resource_pending','Clearance is not bound to the current guard snapshot');
 }
 requireDesign(previous.project === next.project && previous.reviewId === next.reviewId, 'foreign_checkpoint', 'Checkpoint identity mismatch');
 requireDesign(next.attempts.length >= previous.attempts.length && next.attempts.length <= previous.attempts.length + 1, 'immutable_history', 'Cannot remove or skip attempts');
 for (const [i, old] of previous.attempts.entries()) {
  const current = next.attempts[i]!;
  const oldActions=old.actions??[],newActions=current.actions??[];
  requireDesign(newActions.length>=oldActions.length&&oldActions.every((a,n)=>!!newActions[n]&&designActionEvolution(a,newActions[n]!)),'immutable_history','Cannot replace recovery action input or qualification');
  if (isDesignAdmission(old)) {
   if (isDesignAdmission(current)) {
    requireDesign(same(old.submitted, current.submitted) && old.actionId === current.actionId && old.operation === current.operation && old.reviewer === current.reviewer && old.acceptedAt === current.acceptedAt && old.startedAt === current.startedAt, 'immutable_history', 'Cannot replace pinned admission input/action');
    if (old.status === 'failed' || old.status === 'interrupted') requireDesign(same({ ...old, actions:undefined,resourceGuard: undefined }, { ...current,actions:undefined, resourceGuard: undefined }), 'immutable_history', 'Terminal admission requires explicit recovery or next attempt');
   } else {
    const resumed=old.status==='interrupted'&&oldActions.some(a=>a.operation==='resume'&&a.validation==='unverified'&&newActions.some(n=>n.actionId===a.actionId&&n.validation==='qualified'));
    requireDesign((['pending','running'].includes(old.status)||resumed) && same(old.submitted, current.submitted) && current.actionId === old.actionId && current.operation === old.operation && current.acceptedAt === old.acceptedAt && current.startedAt === old.startedAt && current.reviewer === old.reviewer, 'immutable_history', 'Qualification must preserve the active pinned admission');
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
   const approved=authorizedClearance&&same(current.resourceGuard?.clearance,authorizedClearance)&&authorizedClearance.approvalReceipt.leaseIds.includes(lease.operationId);
   requireDesign(current.resourceGuard && current.resourceGuard.daemonInstance === guard?.daemonInstance && (current.resourceGuard.openLeases.some(saved => same(saved, lease))||hostConfirmedClosures.some(closed=>same(closed,lease))||approved), 'resource_pending', 'Cannot discard or replace an unresolved native intent');
  }
 }
 if (next.attempts.length > previous.attempts.length) {
  const last = previous.attempts.at(-1)!;
  const added=next.attempts.at(-1)!;
  if(!isDesignAdmission(added)){
   requireDesign(!isDesignAdmission(last)&&last.status==='invalidated'&&added.number===last.number+1,'invalid_checkpoint','New qualified attempt requires a preaccepted restart');
   const action=last.actions?.find(a=>a.validation==='unverified'&&a.operation==='restart_full'&&a.resultAttempt===added.number&&a.userDecision?.action==='restart_full');
   const source=next.attempts.find(a=>a.number===last.number);
   requireDesign(action&&source&&!isDesignAdmission(source)&&source.actions?.some(a=>a.actionId===action.actionId&&a.signature===action.signature&&a.validation==='qualified'),'invalid_checkpoint','Restart must qualify its exact durable recovery action');
   const freshReservation=!added.current&&!added.unit||added.current?.kind==='planning'&&added.unit?.phase==='planning'&&added.current.executionId===added.unit.executionId&&added.unit.dispatches===1&&added.unit.retriesUsed===0&&added.unit.userDirectedDispatches===0&&!added.unit.diagnostics.length;
   requireDesign(added.status==='pending'&&!added.plan&&!added.impact&&!added.report&&!added.completedChunks.length&&freshReservation&&!added.publication,'invalid_checkpoint','Restart qualification cannot supply review results or duplicate dispatch');
   return;
  }
  requireDesign(isDesignAdmission(last) ? last.status === 'failed' || last.status === 'interrupted' : ['passed','changes_requested','incomplete'].includes(last.status) && last.report?.status === last.status && last.publication?.state === 'complete', 'invalid_checkpoint', 'New admission requires an explicit terminal predecessor');
 }
}
