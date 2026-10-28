/* Copyright (c) Procix Software India. Licensed under the MIT License. */

export interface ReviewSubjectV1 {
 readonly version: 1; readonly subjectId: string; readonly subjectDigest: string;
 readonly repoId: string; readonly rootArtifactId: string; readonly storyId: string;
 readonly build: { readonly artifactId: string; readonly revision: number; readonly sourceCommit: string };
 readonly contracts: readonly { readonly artifactId: string; readonly path: string; readonly revision: number; readonly contentDigest: string }[];
 readonly taskBasis: 'approved-plan' | 'approved-upstream';
 readonly tasks: readonly { readonly id: string; readonly description: string; readonly acceptanceChecks: readonly { readonly id: string; readonly text: string }[] }[];
 readonly packets: readonly CommitPacketV1[]; readonly contextTree: string;
 readonly ambiguities: readonly string[];
}
export interface CommitPacketV1 {
 readonly packetId: string; readonly commitId: string; readonly parentId: string;
 readonly attribution: { readonly basis: string; readonly evidenceRefs: readonly string[] };
 readonly blocks: readonly { readonly blockId: string; readonly oldPath: string | null; readonly newPath: string | null; readonly oldBlob: string | null; readonly newBlob: string | null; readonly oldLines: readonly [number, number] | null; readonly newLines: readonly [number, number] | null; readonly kind: 'text' | 'binary' | 'rename' | 'mode' | 'delete' | 'add'; readonly attributionRefs: readonly string[] }[];
}

export interface ReviewRuntimePortsV1 {
 readonly readEvidence: (subjectId: string, reference: string) => Promise<ReviewReadReceiptV1>;
 readonly stageImmutableValue: (runId: string, value: Readonly<Record<string, unknown>> | string) => Promise<{ readonly reference: string; readonly digest: string }>;
 readonly appendTransition: (runId: string, generation: number, expectedSequence: number, transitionRef: string) => Promise<{ readonly sequence: number; readonly checkpointDigest: string }>;
 readonly recordAttemptUsage: (observation: ReviewUsageObservationV1) => Promise<{ readonly state: 'recorded' | 'pending' | 'unavailable'; readonly receiptRef: string | null }>;
}
export interface ReviewUsageObservationV1 {
 readonly runId: string; readonly attemptId: string; readonly observationId: string;
 readonly activity: 'code-review'; readonly chargedArtifactId: string; readonly subjectArtifactId: string;
 readonly providerRequestId: string | null; readonly quality: 'reported' | 'estimated' | 'unavailable';
 readonly providerId: string; readonly modelId: string | null;
 readonly granularity: 'model-call' | 'invocation-total' | 'cumulative-snapshot';
 readonly counters: { readonly inputUncachedTokens: number | null; readonly cacheReadTokens: number | null; readonly cacheWriteTokens: number | null; readonly outputTokens: number | null; readonly reasoningTokens: number | null };
 readonly nativeObservationRef: string | null;
 readonly allowanceTokens: number; readonly elapsedActiveMs: number;
}
export interface ReviewReadReceiptV1 {
 readonly reference: string; readonly sourceDigest: string; readonly contentRef: string; readonly text: string | null;
 readonly lines: readonly [number, number] | null;
 readonly completeness: 'complete' | 'partial' | 'unavailable'; readonly limitations: readonly string[];
}

/** Trusted adapters are composed by the daemon, never supplied by a reviewer's tool arguments. */
export interface ApprovedWorkSnapshot {
 readonly build: ReviewSubjectV1['build'];
 readonly repoId: string; readonly rootArtifactId: string; readonly storyId: string;
 readonly contracts: ReviewSubjectV1['contracts'];
 readonly taskBasis: ReviewSubjectV1['taskBasis']; readonly tasks: ReviewSubjectV1['tasks'];
 /** Exact immutable contract text indexed by artifact id, not mutable markdown paths. */
 readonly contractText: Readonly<Record<string, string>>;
}
export interface ScopeAttestation {
 readonly ref: string; readonly commitId: string; readonly parentId: string;
 readonly rootArtifactId: string; readonly storyId: string; readonly buildArtifactId: string;
 readonly sourceCommit: string;
 /** An exclusive scope attestation covers every entry, not merely a Story commit trailer. */
 readonly exclusive: boolean;
 readonly blockIds: readonly string[];
}
export interface PacketSelection {
 readonly commitId: string; readonly parentId: string; readonly attestationRef: string;
 /** Omit for all attested entries; an explicit empty selection is invalid. */
 readonly blockIds?: readonly string[] | undefined;
}
export interface PrepareReviewRequest {
 readonly repoId: string; readonly rootArtifactId: string; readonly storyId: string;
 readonly buildArtifactId: string; readonly selections: readonly PacketSelection[];
}
export interface SubjectWorkReader {
 /** Returns a verified canonical snapshot; rejects corrupt, stale, unapproved or mismatched work. */
 readonly readWork: (request: PrepareReviewRequest) => Promise<ApprovedWorkSnapshot>;
 readonly readAttestation: (reference: string) => Promise<ScopeAttestation>;
 /** Revalidates the same pinned revisions, digests and build source binding before admission/resume. */
 readonly assertFresh: (work: ApprovedWorkSnapshot) => Promise<void>;
}
export type SubjectPreparationCode = 'invalid-input' | 'unapproved-contract' | 'stale-contract'
 | 'invalid-object' | 'ambiguous-attribution' | 'unsupported-change' | 'resource-limit';
export class SubjectPreparationError extends Error {
 constructor(readonly code: SubjectPreparationCode, message: string, options?: ErrorOptions) {
  super(message, options); this.name = 'SubjectPreparationError';
 }
}
export class ReviewRuntimePortError extends Error {
 constructor(readonly code: 'invalid-value' | 'invalid-identity' | 'stale-generation' | 'sequence-conflict' | 'unknown-reference', message: string) {
  super(message); this.name = 'ReviewRuntimePortError';
 }
}
export const SUBJECT_LIMITS = Object.freeze({ canonicalBytes: 1024 * 1024, packets: 1000,
 blocks: 10000, sourceBytes: 1024 * 1024, sourceLines: 500, gitBytes: 64 * 1024 * 1024, gitTimeoutMs: 30000 });
