import type { Json, MemoryFailureCode, Scope, SourceIdentity } from '../types.js';

/** Package-private sc4 storage types. No native SDK or public wire additions. */
export type Lifecycle = 'candidate' | 'active' | 'conflicted' | 'superseded' | 'expired' | 'deleted';
export type MemoryKind = 'directive' | 'fact' | 'decision' | 'progress' | 'lesson';
export type Origin = 'user' | 'host-policy' | 'artifact' | 'assistant' | 'tool' | 'document';
export interface ProcessingVersion { readonly processor: string; readonly normalizer: string | null; readonly prompt: string | null; readonly schema: 1; }
export interface EmbeddingProfile { readonly model: string; readonly dimension: number; readonly normalizationVersion: string; }
export interface Validity { readonly validFrom: number | null; readonly validUntil: number | null; }
export interface Authority { readonly origin: Origin; readonly sourceIds: readonly string[]; readonly policyVersion: string; }
export interface Assertion { readonly subject: string; readonly category: string; readonly predicate: string; readonly value: Json; readonly polarity: 'positive' | 'negative'; readonly conditions: readonly Json[]; }
export interface CurrentPayload extends Validity {
  readonly schemaVersion: 1; readonly memoryId: string; readonly kind: MemoryKind;
  readonly assertion: Assertion; readonly text: string; readonly scope: Scope;
  readonly authority: Authority; readonly status: Lifecycle; readonly revisionId: string;
  readonly createdAt: number; readonly updatedAt: number; readonly sourceIds: readonly string[];
  readonly relatedMemoryIds: readonly string[]; readonly supersedesMemoryId: string | null;
}
export type MutationReason = 'create' | 'evidence-added' | 'correct' | 'conflict' | 'resolve' | 'supersede' | 'expire' | 'forget';
export interface RevisionPayload {
  readonly schemaVersion: 1; readonly revisionId: string; readonly memoryId: string;
  readonly predecessorRevisionId: string | null;
  readonly mutationReason: { readonly code: MutationReason; readonly explanation: string };
  readonly sourceEvent: { readonly operationId: string; readonly identityDigest: string; readonly payloadHash: string };
  readonly processingVersion: ProcessingVersion; readonly committedGeneration: string;
  readonly createdAt: number; readonly snapshot: CurrentPayload;
}
export interface SourcePayload extends Validity {
  readonly schemaVersion: 1; readonly sourceId: string; readonly identity: SourceIdentity;
  readonly operationId: string; readonly contentHash: string;
  readonly attribution: { readonly origin: Origin; readonly policyVersion: string };
  readonly span: { readonly unit: 'utf8-byte'; readonly start: number; readonly end: number };
  readonly location: { readonly kind: 'admitted-excerpt'; readonly text: string } | { readonly kind: 'durable-reference'; readonly reference: string };
  readonly occurredAt: number | null; readonly admittedAt: number;
}
export interface EvidencePayload {
  readonly schemaVersion: 1; readonly evidenceId: string; readonly memoryId: string;
  readonly revisionId: string; readonly sourceId: string; readonly sourceContentHash: string;
  readonly relation: 'supports' | 'contradicts'; readonly createdByOperationId: string;
}
export interface AffectedRevision { readonly memoryId: string; readonly previousRevisionId: string | null; readonly revisionId: string; }
export interface ReceiptPayload {
  readonly schemaVersion: 1; readonly operationId: string; readonly eventId: string;
  readonly identityDigest: string; readonly payloadHash: string; readonly scope: Scope;
  readonly scopeEpoch: string; readonly state: 'committed' | 'failed' | 'quarantined' | 'cleanup-pending';
  readonly generation: string; readonly queueTerminal: true; readonly affectedRevisions: readonly AffectedRevision[];
  readonly sourceIds: readonly string[]; readonly tombstoneIds: readonly string[];
  readonly rejectedByTombstoneIds: readonly string[]; readonly processingVersion: ProcessingVersion;
  readonly errorCode: MemoryFailureCode | null; readonly committedAt: number;
}
export type ForgetSelector = { readonly kind: 'memory'; readonly memoryId: string }
  | { readonly kind: 'source'; readonly sourceId: string }
  | { readonly kind: 'subject'; readonly subjectKeyHash: string }
  | { readonly kind: 'session'; readonly sessionId: string }
  | { readonly kind: 'conversation'; readonly producerId: string; readonly sessionId: string }
  | { readonly kind: 'project' };
export interface TombstonePayload {
  readonly schemaVersion: 1; readonly tombstoneId: string; readonly selector: ForgetSelector;
  readonly namespaceKey: string; readonly scopeEpoch: string; readonly invalidFromGeneration: string;
  readonly queueId: string; readonly cutoffSequence: string; readonly mode: 'closed-lifecycle';
  readonly createdByOperationId: string; readonly createdAt: number;
}
export interface RootPayload {
  readonly schemaVersion: 1; readonly kind: 'root'; readonly storeId: string;
  readonly generation: string; readonly embeddingModel: string; readonly embeddingDimension: number;
  readonly normalizationVersion: string; readonly queueId: string | null; readonly createdAt: number;
}
export interface NamespacePayload {
  readonly schemaVersion: 1; readonly kind: 'namespace'; readonly namespaceKey: string;
  readonly scope: Scope; readonly scopeEpoch: string; readonly createdAt: number;
}
export interface PayloadByKind {
  readonly current: CurrentPayload; readonly revision: RevisionPayload; readonly source: SourcePayload;
  readonly evidence: EvidencePayload; readonly receipt: ReceiptPayload; readonly tombstone: TombstonePayload;
  readonly control: RootPayload | NamespacePayload;
}
export type RowKind = keyof PayloadByKind;
/** Every column is explicit; no inferred Arrow schema or undefined values. */
export interface RowEnvelope {
  readonly rowId: string; readonly projectId: string; readonly namespaceKey: string; readonly scopeEpoch: string;
  readonly sessionId: string | null; readonly branch: string | null; readonly environment: string | null;
  readonly entityId: string | null; readonly revisionId: string | null; readonly sourceId: string | null;
  readonly operationId: string | null; readonly payloadHash: string | null; readonly identityDigest: string | null;
  readonly generation: string | null; readonly status: string | null;
  readonly validFrom: number | null; readonly validUntil: number | null;
  readonly embedding: readonly number[] | null;
}
export type StoreRow = { [K in RowKind]: RowEnvelope & { readonly rowKind: K; readonly payload: PayloadByKind[K] } }[RowKind];
export type EncodedRow = RowEnvelope & { readonly rowKind: RowKind; readonly payload: string };
