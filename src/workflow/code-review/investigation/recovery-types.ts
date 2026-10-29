/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { LedgerBasis, TrustedInspectionReceipt } from './ledger-types.js';
import type { InvestigationPolicy, InvestigationState } from './continuation-types.js';
import { ledgerSnapshot } from './ledger-identity.js';

export interface ReviewRecoveryV1 {
 readonly schemaVersion: 1; readonly runId: string; readonly subjectDigest: string; readonly policyDigest: string;
 readonly state: 'prepared' | 'running' | 'paused' | 'completion-requested' | 'completed' | 'cancelled' | 'stale';
 readonly journalSequence: number; readonly acceptedCheckpointDigest: string;
 readonly owner: { readonly leaseId: string; readonly generation: number; readonly expiresAt: string } | null;
 readonly attempts: readonly { readonly attemptId: string; readonly requestDigest: string; readonly state: 'issued' | 'partially-accepted' | 'accepted' | 'failed' | 'uncertain' | 'cancelled'; readonly acceptedSequence: number | null; readonly usageReceipt: string | null }[];
 readonly activeMsConsumed: number; readonly continuationsConsumed: number;
 readonly blockCheckpoints: readonly { readonly blockId: string; readonly progressId: string; readonly sequence: number; readonly checkpointDigest: string }[];
 readonly outstandingWork: readonly string[]; readonly completionReceipt: string | null;
}
export interface ResumeCompatibilityV1 {
 readonly kind: 'compatible' | 'stale' | 'unsupported';
 readonly invalidatedEvidenceIds: readonly string[]; readonly reasons: readonly string[]; readonly extensionRequired: boolean;
}
export type RecoveryErrorCode = 'invalid-input' | 'corrupt' | 'unsupported' | 'stale' | 'ownership-lost'
 | 'storage-unavailable' | 'uncertain-append' | 'budget-exhausted' | 'publication-uncertain';
export class RecoveryError extends Error {
 constructor(readonly code: RecoveryErrorCode, message: string, options?: ErrorOptions) {
  super(message, options); this.name = 'RecoveryError';
 }
}
export interface RecoveryCompatibility {
 readonly engine: 1; readonly evidence: 1; readonly toolsDigest: string; readonly providerDigest: string;
}
export interface RecoveryManifest {
 readonly version: 1; readonly runId: string; readonly subjectDigest: string; readonly policyDigest: string;
 readonly basis: LedgerBasis; readonly initial: InvestigationState; readonly policy: InvestigationPolicy;
 readonly compatibility: RecoveryCompatibility; readonly receipts: readonly TrustedInspectionReceipt[];
}
export type RecoveryEventKind = 'lease' | 'release' | 'block' | 'attempt-issued' | 'attempt-settled'
 | 'usage-pending' | 'usage-recorded' | 'state' | 'extension' | 'publication-intent';
export interface RecoveryEvent {
 readonly version: 1; readonly ordinal: number; readonly previousDigest: string; readonly eventId: string;
 readonly runId: string; readonly subjectDigest: string; readonly policyDigest: string;
 readonly generation: number; readonly kind: RecoveryEventKind; readonly payloadRef: string; readonly digest: string;
}
export { INVESTIGATION_RUNTIME_PATH as RECOVERY_NAMESPACE } from '../../../shared/review-runtime-paths.js';
export const RECOVERY_LIMITS = Object.freeze({ valueBytes: 1024 * 1024, journalBytes: 64 * 1024 * 1024, events: 100000 });
export function recoveryId(value: unknown): asserts value is string {
 if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value))
  throw new RecoveryError('invalid-input', 'Invalid recovery identity.');
}
export function recoveryDigest(value: unknown): asserts value is string {
 if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new RecoveryError('invalid-input', 'Invalid recovery digest.');
}
export function recoveryInteger(value: unknown, minimum = 0): asserts value is number {
 if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new RecoveryError('invalid-input', 'Invalid recovery integer.');
}
/** Defensive canonical copy: no getters, prototypes or toJSON may cross persistence. */
export function recoveryValue<T>(value: T): T {
 try { return ledgerSnapshot(value); }
 catch (cause) { throw new RecoveryError('invalid-input', 'Invalid recovery value.', { cause }); }
}
export function recoveryRecord(value: unknown): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RecoveryError('invalid-input', 'Expected recovery object.');
 return value as Record<string, unknown>;
}
export function recoveryVersion(value: unknown): asserts value is 1 {
 if (value !== 1) throw new RecoveryError('unsupported', 'Unsupported recovery version.');
}

/** Opaque protocol identity; unlike run IDs, this is never a filesystem component. */
export function recoveryLabel(value:unknown):asserts value is string {
 if(typeof value!=="string"||!value.trim()||value.length>512||value.includes("\0"))throw new RecoveryError("invalid-input","Invalid recovery record identity.");
}

/** Internal immutable binding; canonical review content remains opaque to recovery. */
export interface RecoveryPublicationBinding {
 readonly version: 1; readonly intentRef: string; readonly intentDigest: string;
 readonly checkpointDigest: string; readonly acceptedGeneration: number;
}
