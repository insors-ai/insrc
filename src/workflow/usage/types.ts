/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Immutable usage domain contracts. No persistence, provider parsing or root resolution. */
import type { ArtifactIdKind } from '../artifact-ids.js';

export const USAGE_SCHEMA_VERSION = 1 as const;
export const USAGE_LIMITS = Object.freeze({
  sourceBytes: 16 * 1024,
  depth: 32,
  nodes: 4096,
  idCharacters: 256,
  referenceItems: 1024,
  groupRecords: 1024,
  groupBytes: 8 * 1024 * 1024,
  maxCounter: Number.MAX_SAFE_INTEGER,
  maxSequence: Number.MAX_SAFE_INTEGER,
});
export const USAGE_SOURCE_DOMAIN = 'insrc.usage.source.v1\0';

export type UsageRootKind = Extract<ArtifactIdKind, 'EPIC' | 'STORY' | 'ISSUE' | 'SPEC'>;
export type UsageQuality = 'reported' | 'estimated' | 'pending' | 'unavailable' | 'legacy' | 'missing' | 'unsupported' | 'conflict';
export type ObservationGranularity = 'model-call' | 'invocation-total' | 'cumulative-snapshot';
export type ModelKind = 'completion' | 'embedding';
export type NormalizedActivity =
  | 'definition-author' | 'definition-review' | 'epic-design' | 'epic-design-review'
  | 'story-design' | 'story-revision' | 'design-review' | 'plan-author' | 'plan-refine'
  | 'task-implement' | 'task-repair' | 'task-probe' | 'task-validate'
  | 'shared-validate' | 'code-review' | 'issue-framing' | 'spec-framing' | 'workflow-context';
export type NormalizedCounters = Readonly<{
  inputUncachedTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
}>;
export type CounterBucket = keyof NormalizedCounters;
export type UsageMetric = 'processed' | CounterBucket;

export type UsageBinding = Readonly<{
  repo: string;
  rootArtifactId: string;
  artifactId: string;
  workItemId: string;
  workflowRunId: string;
  version: string;
  provenance: 'stored-owner' | 'workflow-reservation' | 'committed-transfer';
}>;
export type BindingResolution =
  | Readonly<{ kind: 'resolved'; binding: UsageBinding }>
  | Readonly<{ kind: 'unresolved' | 'conflict'; reasons: readonly string[] }>;
export type BindingRequest = Readonly<{
  artifactId: string;
  workflowRunId: string;
  expectedRootId?: string | undefined;
  subjectId?: string | undefined;
}>;
export type UsageAttributionInput = Readonly<{
  activity: string;
  chargedArtifactId: string;
  subjectArtifactId: string;
  reviewedArtifactId?: string | undefined;
  taskId?: string | undefined;
  storyBuildId?: string | undefined;
  parentBinding?: UsageBinding | undefined;
}>;
export interface UsageAttributionPolicy {
  validate(input: UsageAttributionInput): readonly string[];
}

/** Describes inspected evidence, not an assertion that a host currently submits telemetry. */
export type SourceCapability = Readonly<{
  capabilityId: string;
  provider: string;
  transport: string;
  version: string | null;
  sourceRevision: string | null;
  evidenceRefs: readonly string[];
  granularity: ObservationGranularity | 'unknown';
  physicalCallCoverage: 'complete' | 'partial' | 'unknown';
  observedModelIdentity: 'reported' | 'requested-only' | 'unknown';
  inputConvention: 'disjoint' | 'inclusive-cache' | 'exclusive-cache' | 'unknown';
  reasoningInOutput: boolean | 'unknown';
  supportedCounterBuckets: readonly CounterBucket[];
  baselineRequired: boolean;
  qualification: 'source-inspected' | 'recorded-fixture' | 'unqualified';
}>;
export type UsageContext = Readonly<{
  logicalRequestId: string;
  invocationId: string | null;
  nativeSessionId: string | null;
  parentCallId: string | null;
  workflow: string;
  runId: string;
  stepId: string;
  activity: NormalizedActivity;
  attempt: number;
  source: Readonly<{ provider: string; transport: string; version: string | null; evidenceId: string }>;
  granularity: ObservationGranularity;
  modelSliceId: string;
  modelKind: ModelKind;
  requestedModel: string;
  reportedModel: string | null;
  review: Readonly<{ round: number; recordId: string | null }> | null;
  binding: UsageBinding;
}>;
export type Observation = Readonly<{
  outcome: 'success' | 'error' | 'timeout' | 'cancelled' | 'interrupted';
  reportedModel: string | null;
  finishedAt: string;
  quality: 'reported' | 'estimated' | 'unavailable';
  counters: NormalizedCounters;
  normalizationVersion: 'disjoint-v1';
  nativeUnit: string;
  sourceCapabilityId: string;
  reason: string | null;
  cumulative: Readonly<{ nativeSessionId: string; baselineEventId: string; frameId: string }> | null;
}>;
export type AccountingGroup =
  | Readonly<{ invocationId: string; modelSliceId: string; isolatedCallId: null }>
  | Readonly<{ invocationId: null; modelSliceId: string; isolatedCallId: string }>;
export type CorrectionControl = Readonly<{
  supersedesEventId: string;
  reason: string;
  provenanceEventIds: readonly string[];
}>;
export type ReconciliationControl = Readonly<{
  group: AccountingGroup;
  candidateEventIds: readonly string[];
  selectedEventIds: readonly string[];
  excludedEventIds: readonly string[];
  previousReconciliationEventId: string | null;
  coverage: 'aggregate-fallback' | 'complete-leaf';
  sourceCapabilityId: string;
  evidenceEventIds: readonly string[];
  reason: string;
}>;
export type BindingControl = Readonly<{
  binding: UsageBinding;
  expectedPreviousVersion: string | null;
  reason: string;
  authorityEvidenceId: string;
}>;
export type OriginalObservationRef = Readonly<{ rootArtifactId: string; eventId: string; callId: string }>;
export type TransferIdentity = Readonly<{
  transferId: string;
  originalObservationRef: OriginalObservationRef;
  sourceRootId: string;
  destinationRootId: string;
  fromArtifactId: string;
  destinationArtifactId: string;
  expectedBindingVersion: string;
  reason: string;
}>;
export type TransferPreparedControl = TransferIdentity & Readonly<{
  mode: 'cross-root'; preparedEventId: null; acceptedEventId: null;
}>;
export type TransferAcceptedControl = TransferIdentity & Readonly<{
  mode: 'cross-root'; preparedEventId: string; acceptedEventId: null;
}>;
export type TransferCommittedControl = TransferIdentity & (
  | Readonly<{ mode: 'same-root'; preparedEventId: null; acceptedEventId: null }>
  | Readonly<{ mode: 'cross-root'; preparedEventId: string; acceptedEventId: string }>
);
export type BatchCommitControl = Readonly<{
  batchId: string;
  eventIds: readonly string[];
  priorDigest: string;
  groupDigest: string;
}>;

type Envelope<K extends string> = Readonly<{
  schemaVersion: typeof USAGE_SCHEMA_VERSION;
  eventId: string;
  rootArtifactId: string;
  artifactId: string;
  sequence: number;
  recordedAt: string;
  recordKind: K;
  payloadDigest: string;
}>;
export type RequestStarted = Envelope<'request.started'> & Readonly<{
  callId: string; context: UsageContext; observation: null; control: null;
}>;
export type RequestFinished = Envelope<'request.finished'> & Readonly<{
  callId: string; context: null; observation: Observation; control: null;
}>;
export type UsageCorrected = Envelope<'usage.corrected'> & Readonly<{
  callId: string; context: null; observation: Observation; control: CorrectionControl;
}>;
export type UsageReconciled = Envelope<'usage.reconciled'> & Readonly<{
  callId: null; context: null; observation: null; control: ReconciliationControl;
}>;
type ControlRecord<K extends string, C> = Envelope<K> & Readonly<{
  callId: null; context: null; observation: null; control: C;
}>;
export type RootReserved = ControlRecord<'root.reserved', BindingControl>;
export type ArtifactBound = ControlRecord<'artifact.bound', BindingControl>;
export type BindingReconciled = ControlRecord<'binding.reconciled', BindingControl>;
export type BatchCommit = ControlRecord<'batch.commit', BatchCommitControl>;
export type TransferPrepared = ControlRecord<'transfer.prepared', TransferPreparedControl>;
export type TransferAccepted = ControlRecord<'transfer.accepted', TransferAcceptedControl>;
export type TransferCommitted = ControlRecord<'transfer.committed', TransferCommittedControl>;
export type LedgerRecord = RequestStarted | RequestFinished | UsageCorrected | UsageReconciled
  | RootReserved | ArtifactBound | BindingReconciled | BatchCommit
  | TransferPrepared | TransferAccepted | TransferCommitted;
export type RecordKind = LedgerRecord['recordKind'];
export type SourcePayload = LedgerRecord extends infer R
  ? R extends LedgerRecord ? Omit<R, 'sequence' | 'recordedAt' | 'payloadDigest'> : never
  : never;

/** Opaque references supplied by snapshot services; this domain does not define their IO format. */
export type ClosureEvidence = Readonly<{
  rootWatermarkRefs: readonly Readonly<{ rootArtifactId: string; watermarkId: string }>[];
  expectedEventIds: readonly string[];
  expectedRecordCount: number;
  eventSetDigest: string;
  referenceOnlyEventIds: readonly string[];
  sourceCapabilities: readonly SourceCapability[];
  expectedBindingVersions: readonly Readonly<{ rootArtifactId: string; artifactId: string; version: string }>[];
  coverageState: 'observed' | 'partial' | 'legacy' | 'missing' | 'unsupported';
  selectedCurrentEventId?: string | undefined;
  baselineEventId?: string | undefined;
}>;
export type AccountingScope = Readonly<{
  group: AccountingGroup;
  metric: UsageMetric;
  expectedBindings: readonly UsageBinding[];
  evidence: ClosureEvidence;
  closure: 'complete-observed-group' | 'partial';
}>;
type OwnerTrace = Readonly<{
  callId: string;
  captureRootArtifactId: string;
  captureArtifactId: string;
  basisEventIds: readonly string[];
  provenanceEventIds: readonly string[];
}>;
export type EffectiveOwner = OwnerTrace & (
  | Readonly<{ state: 'resolved' | 'pending'; rootArtifactId: string; artifactId: string; ownerVersion: string }>
  | Readonly<{ state: 'conflict' | 'unavailable'; rootArtifactId: null; artifactId: null; ownerVersion: null }>
);
export interface EffectiveAccounting {
  readonly knownTokens: string;
  readonly estimatedTokens: string;
  readonly quality: readonly UsageQuality[];
  readonly basisEventIds: readonly string[];
  readonly notices: readonly string[];
  readonly effectiveOwners?: readonly EffectiveOwner[] | undefined;
}
export interface UsageReducer {
  validate(record: LedgerRecord): readonly string[];
  reduce(records: AsyncIterable<LedgerRecord>, scope: Readonly<Record<string, unknown>>): Promise<EffectiveAccounting>;
}
export type UsageValidationNotice = string;
export type UsageAccountingNotice = string;
export type UsageAttributionNotice = string;
export interface UsageNotice {
  readonly code: string;
  readonly path: string;
  readonly eventIds: readonly string[];
}
export interface UsageDomainError extends Error {
  readonly code: 'resource-limit' | 'source-unavailable';
}
