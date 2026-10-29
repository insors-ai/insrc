/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { PartyOrUnknown } from '../../review/party.js';
import type { RecoveryCompatibility } from './recovery-types.js';

export interface CompletionAssessmentV1 {
 readonly runId: string; readonly subjectDigest: string; readonly checkpointDigest: string;
 readonly outcome: 'publishable' | 'incomplete' | 'stale' | 'conflict';
 readonly unresolvedRows: readonly string[]; readonly reasons: readonly string[];
 readonly requiredCriteria: readonly string[];
}
export interface ReviewCompletionReceiptV1 {
 readonly receiptId: string; readonly runId: string; readonly subjectDigest: string;
 readonly terminalCheckpointDigest: string; readonly artifactId: string; readonly artifactRevision: number;
 readonly verdict: 'pass' | 'warn' | 'block'; readonly coverageRef: string;
}
/** Supplied by the daemon's current canonical readers/authenticated session, never by the reviewer reply. */
export interface CompletionValidationContext {
 readonly subjectDigest: string; readonly policyDigest: string; readonly compatibility: RecoveryCompatibility;
 readonly build: { readonly artifactId: string; readonly revision: number; readonly sourceCommit: string; readonly meta: unknown };
 readonly reviewerParty: PartyOrUnknown;
 /** Already resolved from trusted requirement decisions and inspected reviewer conflict evidence. */
 readonly expectationConflicts: readonly { readonly reference: string; readonly reason: string }[];
 /** Re-read approved contracts and exact selected source objects; throws when any pin is stale. */
 readonly assertFresh: () => Promise<void>;
}
