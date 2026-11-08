/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import { createHash } from 'node:crypto';
import type { Static } from '@sinclair/typebox';
import { contentHash } from '../../artifact-core/lifecycle.js';
import { validateDesignCheckpointIdentity } from './checkpoint.js';
import { consolidateDesignReview } from './results.js';
import { DesignCheckpointSchema, DesignStatusSchema, decodeDesign, requireDesign } from './contracts.js';
import type { DesignReviewCheckpoint } from './contracts.js';
export { DesignPublicationSchema } from './contracts.js';
export type { DesignPublication } from './contracts.js';

const digest = Type.String({ pattern: '^[a-f0-9]{64}$' });
const text = Type.String({ minLength: 1, maxLength: 8192 });
const party = Type.Union([Type.Literal('daemon'), Type.Literal('controller')]);
export const PermanentDesignReviewSchema = Type.Object({
 kind: Type.Literal('design-chunk-review'), schemaVersion: Type.Literal(1),
 reviewId: DesignCheckpointSchema.properties.reviewId,
 project: DesignCheckpointSchema.properties.project,
 artifactId: DesignCheckpointSchema.properties.artifactId,
 subject: DesignCheckpointSchema.properties.subject,
 submitted: DesignCheckpointSchema.properties.submitted,
 reviewer: party, attempts: DesignCheckpointSchema.properties.attempts,
 applicableAttempt: Type.Integer({ minimum: 1, maximum: 128 }), status: DesignStatusSchema,
 binding: Type.Object({
  sourceRevision: Type.Object({ number: Type.Integer({ minimum: 0 }), contentHash: digest }, { additionalProperties: false }),
  reviewedContentIdentity: digest, documentDigest: digest, workflowDigest: digest, author: party,
 }, { additionalProperties: false }),
 preservationDigest: digest,
}, { additionalProperties: false });
export type PermanentDesignReview = Static<typeof PermanentDesignReviewSchema>;

/** Canonical keys are handled by the existing artifact hash. Only observer/owner state is excluded.
 * Feedback, baselines, plans, model attribution, counters, failures and recovery actions remain.
 */
export function designPreservationDigest(checkpoint: DesignReviewCheckpoint): string {
 const attempts = checkpoint.attempts.map(({ progress: _progress, current: _current, publication: _publication, ...meaningful }) => meaningful);
 return contentHash('design-review-preservation-v1', { body: { ...checkpoint, attempts }, citations: [] });
}
export function designWorkflowDigest(workflow: DesignReviewCheckpoint['subject']['workflow']): string {
 return contentHash('design-review-workflow-v1', { body: workflow, citations: [] });
}
/** Pure validation shared by publishers, readers, approval and cleanup. No filesystem or model calls. */
export function validatePermanentDesignReview(input: unknown, expected: { project: string; artifactId: string }): PermanentDesignReview {
 const record = decodeDesign(PermanentDesignReviewSchema, input);
 requireDesign(record.project === expected.project && record.artifactId === expected.artifactId, 'foreign_review', 'Permanent review belongs to another artifact');
 const checkpoint: DesignReviewCheckpoint = {
  schemaVersion: 1, reviewId: record.reviewId, project: record.project, artifactId: record.artifactId,
  subject: record.subject, submitted: record.submitted, attempts: record.attempts,
 };
 validateDesignCheckpointIdentity(record.project, record.reviewId, checkpoint);
 const applicable = record.attempts.at(-1);
 requireDesign(applicable && applicable.number === record.applicableAttempt && applicable.report &&
  ['passed','changes_requested','incomplete'].includes(applicable.status) && record.status === applicable.status &&
  applicable.report.status === applicable.status, 'invalid_review_history', 'Applicable attempt must be the latest complete report');
 requireDesign(record.reviewer === record.subject.reviewer && applicable.reviewer === record.reviewer &&
  record.binding.author !== record.reviewer && applicable.report.reviewer === record.reviewer,
  'invalid_review_history', 'Permanent review party binding is inconsistent');
 requireDesign(record.binding.reviewedContentIdentity === applicable.baseline.contentIdentity &&
  record.binding.documentDigest === applicable.baseline.subjectFingerprints.document &&
  record.binding.workflowDigest === designWorkflowDigest(record.subject.workflow),
  'invalid_review_history', 'Permanent review subject binding is inconsistent');
 for (const attempt of record.attempts) {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  const raw = attempt.baseline.reviewedContent;
  requireDesign(sha(raw.canonical) === attempt.baseline.subjectFingerprints.canonical &&
   sha(raw.document) === attempt.baseline.subjectFingerprints.document &&
   sha(`${raw.canonical}\0${raw.document}`) === attempt.baseline.contentIdentity,
   'invalid_review_history', 'Preserved baseline fingerprints do not match its content');
  if (!attempt.report) continue;
  requireDesign(attempt.plan, 'invalid_review_history', 'Reported attempt has no plan');
  const report = consolidateDesignReview(record.reviewId, attempt.number,
   { ...record.subject, reviewer: attempt.reviewer ?? attempt.report.reviewer }, attempt.baseline.contentIdentity,
   attempt.plan, attempt.completedChunks, attempt.impact ? { impact: attempt.impact, attempts: record.attempts.slice(0, attempt.number) } : undefined);
  requireDesign(contentHash('', { body: report, citations: [] }) === contentHash('', { body: attempt.report, citations: [] }),
   'invalid_review_history', 'Permanent report differs from accepted feedback');
 }
 requireDesign(record.preservationDigest === designPreservationDigest(checkpoint), 'invalid_review_history', 'Permanent attempt preservation digest does not match');
 return record;
}
