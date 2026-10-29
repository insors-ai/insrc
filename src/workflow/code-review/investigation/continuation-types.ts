/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { LLMProvider, StructuredSchema } from '../../../shared/types.js';
import type { ReviewBudgetPolicy, ReviewExecutionBudget } from '../../../shared/review-budget.js';
import type { ReviewRuntimePortsV1, ReviewReadReceiptV1, ReviewUsageObservationV1 } from './types.js';
import type { CoverageV1, EvidenceV1, ReviewLedgerV1, LedgerBasis, LedgerValidationContext, TrustedInspectionReceipt } from './ledger-types.js';

export interface InvestigationTurnV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number;
 readonly attemptId: string; readonly requestDigest: string; readonly policyDigest: string;
 readonly assignment: readonly string[]; readonly navigationRefs: readonly string[];
 readonly unresolvedRefs: readonly string[]; readonly priorAcceptedCheckpoint: string;
 readonly limits: { readonly attemptMs: number; readonly activeMsRemaining: number; readonly continuationsRemaining: number; readonly inclusiveTokenLimit: number };
}
export interface InvestigationReplyV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number; readonly attemptId: string;
 readonly acceptedBlockReceiptIds: readonly string[]; readonly lastAcceptedSequence: number;
 readonly inspectedEvidenceIds: readonly string[]; readonly coverageUpdates: readonly CoverageV1[];
 readonly findings: ReviewLedgerV1['findings'];
 readonly next: { readonly kind: 'continue' | 'request-completion' | 'pause'; readonly remainingWork: readonly string[]; readonly reason: string };
}
export interface ImpactCapabilityV1 {
 readonly mode: 'source-only' | 'indexed-impact';
 readonly index: { readonly revision: string; readonly freshness: 'compatible' | 'stale' | 'unknown'; readonly completeness: 'partial' | 'unknown' } | null;
 readonly queryChangedEntityCallers: ((entityRef: string) => Promise<readonly EvidenceV1[]>) | null;
}
export interface ReviewBlockProgressV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number; readonly attemptId: string;
 readonly progressId: string; readonly expectedSequence: number; readonly blockId: string;
 readonly disposition: 'reviewed' | 'needs-followup' | 'unverified';
 readonly evidenceIds: readonly string[]; readonly notes: string; readonly coverageUpdates: readonly CoverageV1[];
 readonly findings: ReviewLedgerV1['findings']; readonly outstandingWork: readonly string[];
}
export interface BlockCheckpointReceiptV1 {
 readonly runId: string; readonly subjectDigest: string; readonly generation: number;
 readonly progressId: string; readonly blockId: string; readonly sequence: number; readonly checkpointDigest: string;
}

export type InvestigationErrorCode = 'invalid-binding' | 'unsupported-backend' | 'invalid-progress'
 | 'acceptance-conflict' | 'budget-refused' | 'cancelled' | 'provider-failed' | 'impact-unavailable';
export class InvestigationError extends Error {
 constructor(readonly code: InvestigationErrorCode, message: string, options?: ErrorOptions) { super(message,options);this.name='InvestigationError'; }
}
export interface InvestigationPolicy {
 readonly budget: ReviewBudgetPolicy; readonly digest: string;
 readonly activeLimitMs: number; readonly attemptLimit: number; readonly providerLimitMs: number;
 readonly hostContextReserveTokens: number;
}
export interface InvestigationBackend {
 readonly provider: LLMProvider;
 readonly qualification: { readonly providerId: string; readonly profileDigest: string;
  readonly pinnedReads: boolean; readonly readOnly: boolean;
  readonly progressMode: 'in-session-progress' | 'block-yield'; readonly cancellable: boolean };
 readonly execute: (turn: InvestigationTurnV1, tools: InvestigationTools, signal: AbortSignal) => Promise<InvestigationReplyV1>;
}
export interface InvestigationTools {
 /** Supplemental evidence identity preserves the base sc6 read receipt and makes progress references usable. */
 readonly read: (reference: string) => Promise<ReviewReadReceiptV1 & { readonly evidenceId: string }>;
 readonly impact: ImpactCapabilityV1;
 readonly progress: (value: ReviewBlockProgressV1) => Promise<BlockCheckpointReceiptV1>;
 readonly seed: Readonly<Record<string, unknown>>;
 readonly execution: { readonly budget: ReviewExecutionBudget; readonly timeoutMs: number; readonly stallMs: number;
  readonly internalRetry: false };
}
export interface AcceptedBlockProgress {
 readonly payloadDigest: string; readonly progress: ReviewBlockProgressV1; readonly receipt: BlockCheckpointReceiptV1;
}
export interface InvestigationState {
 readonly ledger: ReviewLedgerV1; readonly sequence: number; readonly checkpoint: string;
 readonly accepted: readonly AcceptedBlockProgress[];
 readonly consumedActiveMs: number; readonly attempts: number;
 readonly uncertainProgressId: string | null;
 readonly usage: readonly { readonly observation: ReviewUsageObservationV1; readonly state: 'recorded' | 'pending' | 'unavailable'; readonly receiptRef: string | null }[];
}
/** Trusted owner/role/receipt/backend composition, not a serialized model capability claim. */
export interface InvestigationContext {
 readonly basis: LedgerBasis; readonly state: InvestigationState; readonly policy: InvestigationPolicy;
 readonly generation: number; readonly authorParty: 'controller' | 'daemon'; readonly reviewerParty: 'controller' | 'daemon';
 readonly role: 'review'; readonly tier: 'core'; readonly providerId: string;
 readonly backend: InvestigationBackend; readonly ports: ReviewRuntimePortsV1;
 readonly validation: LedgerValidationContext;
 readonly schema: StructuredSchema; readonly seed: Readonly<Record<string, unknown>>;
 readonly now: () => number;
 readonly assertFresh: () => Promise<void>;
 readonly assertOwner: (generation: number) => void;
 readonly inspect: (reference: string, attemptId: string, signal: AbortSignal) => Promise<{ readonly read: ReviewReadReceiptV1; readonly inspection: TrustedInspectionReceipt }>;
 readonly impact: ImpactCapabilityV1;
 /** Resolves only packet-bound changed entities. Null explicitly means ambiguous/missing mapping. */
 readonly changedEntity: (reference: string) => { readonly blockId: string; readonly sourceDigest: string } | null;
 readonly impactReceipts: (evidence: readonly EvidenceV1[]) => readonly TrustedInspectionReceipt[];
 readonly observeUsage: (attemptId: string) => ReviewUsageObservationV1 | null;
 readonly signal?: AbortSignal | undefined;
 /** Called after accepted changes and accounting; s4's owner persists/reconciles this view. */
 readonly onState: (state: InvestigationState) => void;
}
export interface BlockProgressTransitionV1 {
 readonly version: 1; readonly kind: 'block-progress'; readonly progress: ReviewBlockProgressV1;
 readonly payloadDigest: string; readonly candidateLedgerRef: string; readonly basisRef: string; readonly trustedReceiptRefs: readonly string[];
 readonly predecessorCheckpoint: string;
}
