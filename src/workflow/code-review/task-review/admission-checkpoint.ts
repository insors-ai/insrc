/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual } from 'node:util';
import { validateReviewResourceGuard } from '../../../shared/review-resources.js';
import { validateFailureDiagnostics } from './diagnostics.js';
import { validateSavedAttribution } from './attribution-binding.js';
import { decodeReview, isCodeAdmission, requireReview, StoredCheckpointSchema } from './contracts.js';
import type { AdmissionCheckpoint, CodeAdmissionAttempt, ReviewAttempt, StoredReviewCheckpoint } from './contracts.js';

/** No source/provider work here. Full qualification remains the family's
 * source-pin, route, attribution and capacity admission, never this codec. */
export function decodeStoredCheckpoint(input: unknown): StoredReviewCheckpoint {
 const checkpoint: StoredReviewCheckpoint = decodeReview(StoredCheckpointSchema, input);
 if (checkpoint.schemaVersion === 2) {
  for (const [index, attempt] of checkpoint.attempts.entries()) {
   requireReview(attempt.header.attempt === index + 1, 'attempt', 'Attempt history must be contiguous');
   requireReview(attempt.submitted.storyId === checkpoint.storyId && attempt.submitted.taskId === checkpoint.taskId, 'scope', 'Foreign admission subject');
   if (attempt.resourceGuard) validateReviewResourceGuard(attempt.resourceGuard, { project: checkpoint.project, family: 'code', reviewId: checkpoint.reviewId });
   if (isCodeAdmission(attempt)) {
    requireReview(Number.isFinite(Date.parse(attempt.acceptedAt)) && Number.isFinite(Date.parse(attempt.header.createdAt)), 'admission', 'Invalid admission timestamp');
    const terminal = attempt.header.status === 'failed' || attempt.header.status === 'interrupted';
    requireReview(terminal === (attempt.header.completedAt !== undefined), 'admission', 'Admission terminal state needs completion time');
    if (attempt.header.completedAt) requireReview(Number.isFinite(Date.parse(attempt.header.completedAt)), 'admission', 'Invalid admission completion time');
    requireReview(attempt.header.status !== 'failed' || attempt.error, 'admission', 'Failed admission needs technical error');
    requireReview(attempt.progress.task === null && attempt.progress.completedTasks === 0 && attempt.progress.taskElapsedMs === null, 'admission', 'Unverified admission has no task inventory');
    const phase = terminal ? attempt.header.status === 'failed' ? 'error' : 'interrupted' : 'scope_preparation';
    requireReview(attempt.progress.phase === phase, 'admission', 'Invalid admission progress phase');
    requireReview(index === checkpoint.attempts.length - 1 || terminal, 'attempt', 'Earlier admission is still active');
   } else {
    validateFailureDiagnostics(attempt); validateSavedAttribution(attempt);
   }
  }
 } else for (const attempt of checkpoint.attempts) { validateFailureDiagnostics(attempt); validateSavedAttribution(attempt); }
 return checkpoint;
}

/** Append only: a corrected failed submission consumes a new attempt. The
 * caller serializes this transition with the family's checkpoint writer. */
export function appendCodeAdmission(identity: Pick<AdmissionCheckpoint, 'project' | 'reviewId' | 'storyId' | 'taskId'>,
 input: CodeAdmissionAttempt, prior?: StoredReviewCheckpoint): AdmissionCheckpoint {
 const previous = prior && decodeStoredCheckpoint(prior);
 if (previous) requireReview(previous.project === identity.project && previous.reviewId === identity.reviewId && previous.storyId === identity.storyId && previous.taskId === identity.taskId, 'checkpoint', 'Checkpoint identity mismatch');
 requireReview(input.header.attempt === (previous?.attempts.length ?? 0) + 1, 'attempt', 'Expected next sequential attempt; same-attempt input is pinned');
 const latest = previous?.attempts.at(-1);
 if (latest) requireReview(isCodeAdmission(latest)
  ? latest.header.status === 'failed' || latest.header.status === 'interrupted'
  : !['pending', 'running'].includes(latest.header.status) && latest['review-response'].crPublication === 'complete', 'attempt', 'Previous attempt must be terminal');
 return decodeStoredCheckpoint({ ...identity, schemaVersion: 2, attempts: [...(previous?.attempts ?? []), input] }) as AdmissionCheckpoint;
}

/** Explicit recovery only. A failed admission cannot retry itself. */
export function resumeCodeAdmission(checkpoint: AdmissionCheckpoint, attempt: number, submitted: unknown): CodeAdmissionAttempt {
 const saved = decodeStoredCheckpoint(checkpoint).attempts.at(-1);
 requireReview(saved && isCodeAdmission(saved) && saved.header.attempt === attempt, 'attempt', 'Expected latest admission attempt');
 requireReview(saved.header.status === 'interrupted', 'attempt', 'Only interrupted admission can resume; failed input requires a new attempt');
 requireReview(isDeepStrictEqual(saved.submitted, submitted), 'packet', 'Resume input is pinned');
 return saved;
}

/** Invoke only AFTER normal full qualification. This preserves the original
 * packet, admission time and current resource fence; it cannot attest pins. */
export function qualifyCodeAdmission(checkpoint: AdmissionCheckpoint, qualified: ReviewAttempt): AdmissionCheckpoint {
 const saved = decodeStoredCheckpoint(checkpoint).attempts.at(-1);
 requireReview(saved && isCodeAdmission(saved) && ['pending', 'running'].includes(saved.header.status), 'admission', 'Expected active admission');
 requireReview(qualified.header.attempt === saved.header.attempt && qualified.header.reviewer === saved.header.reviewer && isDeepStrictEqual(qualified.submitted, saved.submitted), 'packet', 'Qualified input is pinned');
 requireReview(qualified.header.createdAt === saved.header.createdAt, 'admission', 'Admission creation time is pinned');
 requireReview(qualified.header.status === 'pending' && qualified['review-response'].crPublication === 'pending' && qualified['review-response'].tasks.length === 0, 'admission', 'Qualification cannot supply completed review results');
 const next = { ...qualified, acceptedAt: saved.acceptedAt, operation: saved.operation, ...(saved.resourceGuard ? { resourceGuard: saved.resourceGuard } : {}) };
 requireReview(!qualified.resourceGuard || isDeepStrictEqual(qualified.resourceGuard, saved.resourceGuard), 'resourceGuard', 'Qualification cannot replace unresolved resources');
 return decodeStoredCheckpoint({ ...checkpoint, attempts: [...checkpoint.attempts.slice(0, -1), next] }) as AdmissionCheckpoint;
}
