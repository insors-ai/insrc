/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { ReviewSubjectV1, ReviewReadReceiptV1 } from './types.js';

export interface EvidenceV1 {
 readonly evidenceId: string; readonly subjectDigest: string;
 readonly kind: 'changed-block' | 'context-source' | 'artifact' | 'test-result' | 'caller-impact';
 readonly source: { readonly path: string; readonly revision: string; readonly digest: string; readonly lines: readonly [number, number] | null };
 readonly role: 'changed-scope' | 'context-only'; readonly inspectedByAttempt: string;
 readonly completeness: 'complete' | 'partial' | 'unavailable'; readonly limitations: readonly string[];
 readonly contentRef: string;
}
export interface CoverageV1 {
 readonly rowId: string; readonly subjectDigest: string; readonly requirementRef: string;
 readonly category: 'task' | 'acceptance' | 'design' | 'change' | 'criterion' | 'impact';
 readonly disposition: 'pending' | 'satisfied' | 'finding' | 'unverified' | 'not-applicable';
 readonly evidenceIds: readonly string[]; readonly findingIds: readonly string[];
 readonly rationale: string; readonly assessedByAttempt: string | null;
}
export interface ReviewLedgerV1 {
 readonly runId: string; readonly subjectDigest: string;
 readonly evidence: readonly EvidenceV1[]; readonly coverage: readonly CoverageV1[];
 readonly findings: readonly { readonly findingId: string; readonly criterion: string; readonly severity: 'HIGH' | 'MED' | 'LOW'; readonly confidence: 'breach' | 'observation'; readonly evidenceIds: readonly string[]; readonly expectationRefs: readonly string[]; readonly message: string }[];
}

export type LedgerFinding = ReviewLedgerV1['findings'][number];
export type LedgerCategory = CoverageV1['category'];
export interface LedgerRequirement {
 readonly requirementRef: string; readonly category: LedgerCategory; readonly text: string;
 readonly allowNotApplicable: boolean; readonly needs: 'inspection' | 'test-pass';
}
export interface LedgerCriterion {
 readonly id: string; readonly text: string; readonly allowNotApplicable: boolean;
}
export interface LedgerBasis {
 readonly runId: string; readonly subject: ReviewSubjectV1;
 readonly policyVersion: string; readonly criteria: readonly LedgerCriterion[];
 readonly requirements: readonly LedgerRequirement[]; readonly basisDigest: string;
}
export interface LedgerAttempt {
 readonly runId: string; readonly subjectDigest: string; readonly attemptId: string;
}
/** Daemon-owned inspection service outputs, NOT fields a reviewer can attest through a tool call.
 * Source reads must have occurred; tests/index records must have been verified and inspected. */
export interface TrustedInspectionReceipt {
 readonly receiptId: string; readonly attempt: LedgerAttempt;
 readonly kind: EvidenceV1['kind']; readonly source: EvidenceV1['source'];
 readonly role: EvidenceV1['role']; readonly completeness: EvidenceV1['completeness'];
 readonly limitations: readonly string[]; readonly contentRef: string;
 readonly readReceipt: ReviewReadReceiptV1 | null;
 readonly blockId: string | null; readonly artifactId: string | null;
 readonly testResult: 'pass' | 'fail' | 'skipped' | 'unknown' | null;
 readonly index: { readonly sourceCommit: string; readonly indexId: string;
  readonly freshness: 'fresh' | 'stale' | 'unknown'; readonly coverage: 'complete' | 'partial' | 'unknown' } | null;
}
/** Reviewer input references inspection records; it cannot supply trusted provenance. */
export interface LedgerDelta {
 readonly receiptIds: readonly string[];
 readonly findings: readonly LedgerFinding[];
 readonly assessments: readonly CoverageV1[];
}
export interface LedgerValidationContext {
 readonly attempt: LedgerAttempt;
 /** Include prior immutable receipts for replay/history validation; never reinterpret a new read as an old receipt. */
 readonly receipts: readonly TrustedInspectionReceipt[];
}
export type ReviewLedgerErrorCode = 'invalid-input' | 'subject-mismatch' | 'provenance-mismatch'
 | 'unknown-reference' | 'conflicting-replay' | 'unsupported-obligation' | 'resource-limit';
export class ReviewLedgerError extends Error {
 constructor(readonly code: ReviewLedgerErrorCode, message: string, options?: ErrorOptions) {
  super(message, options); this.name = 'ReviewLedgerError';
 }
}
export const LEDGER_LIMITS = Object.freeze({ canonicalBytes: 1024 * 1024, rows: 10000, evidence: 10000, findings: 10000 });
