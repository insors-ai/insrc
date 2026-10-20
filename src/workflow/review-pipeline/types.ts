/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review pipeline's shared contracts (Epic 8315a11f, HLD sc1-sc5; owned by
 * Story s1). Every review (each code-review dimension, each design review) runs
 * pre-processor -> review -> post-processor through one job of these shapes.
 * Everything here but the adapter is plain, serialisable data.
 */

import type { LLMMessage, StructuredSchema } from '../../shared/types.js';

// -- sc1 ReviewMaterial ------------------------------------------------------

/** One indivisible unit of a review's material: a changed symbol, a document section. Never cut. */
export interface ReviewAtom {
	readonly id:      string;
	/** How a message names it: file#name for a symbol, the heading for a section. */
	readonly label:   string;
	readonly text:    string;
	readonly file?:   string | undefined;
	readonly module?: string | undefined;
}

export type RelationKind = 'calls' | 'same-file' | 'same-module' | 'references';

/** Grouping precedence: atoms joined by an earlier kind are kept together longer. */
export const RELATION_PRECEDENCE: readonly RelationKind[] = ['calls', 'same-file', 'same-module', 'references'];

export interface ReviewRelation {
	readonly from: string;
	readonly to:   string;
	readonly kind: RelationKind;
}

export interface ReviewObligation {
	readonly key:      string;
	readonly kind:     'clause' | 'requirement' | 'promised-test' | 'module-conventions' | 'check-item';
	readonly text:     string;
	readonly atomIds?: readonly string[] | undefined;
}

export interface ReviewMaterial {
	readonly atoms:       readonly ReviewAtom[];
	readonly relations:   readonly ReviewRelation[];
	readonly obligations: readonly ReviewObligation[];
	/** Atoms every call may read beside its chunk (the adapter renders them). */
	readonly context?:    readonly ReviewAtom[] | undefined;
}

// -- sc2 ReviewAdapter -------------------------------------------------------

/** How a call is run. */
export type ExecutionMode =
	| { readonly mode: 'structured'; readonly cwd?: string | undefined; readonly timeoutMs?: number | undefined }
	/** `deadlineMs` is the per-session limit; the job hands each session only what remains of its deadline. */
	| { readonly mode: 'reviewer-session'; readonly cwd: string; readonly deadlineMs: number; readonly tools: 'read-only' };

/** One call an adapter asks for: today's messages and schema, and how to run it. */
export interface ChunkPrompt {
	readonly messages:  readonly LLMMessage[];
	readonly schema:    StructuredSchema;
	readonly execution: ExecutionMode;
	/** What the call judges, when one stage makes several calls (a premise's id). */
	readonly key?:      string | undefined;
}

/** Committed stage outputs, by stage id. */
export type StageOutputs = Readonly<Record<string, unknown>>;

/** One answered call of a model stage. A model stage's output is these, in issue order. */
export interface StageAnswer {
	readonly key?:     string | undefined;
	readonly chunkId?: string | undefined;
	readonly atomIds:  readonly string[];
	readonly answer:   unknown;
}

export type FailurePolicy = 'fail-review' | 'record-not-judged' | 'record-observation';

export interface AdapterStage {
	readonly id:    string;
	readonly kind:  'model' | 'deterministic';
	readonly after: readonly string[];
	/** Today's calls for the whole review (a model stage). `snapshot` is the job's, as
	 *  completed so far (a verify stage reads the claims and evidence from it). */
	singleCalls(prior: StageOutputs, snapshot: ReviewMaterialSnapshot): readonly ChunkPrompt[];
	/** The calls that read one chunk (a model stage, divided review). */
	chunkCalls(chunk: ReviewChunk, prior: StageOutputs, snapshot: ReviewMaterialSnapshot): readonly ChunkPrompt[];
	/** A deterministic stage's work; it reads only `prior` and the snapshot. */
	run?(prior: StageOutputs, snapshot: ReviewMaterialSnapshot): Promise<unknown>;
	readonly onCallFailure: FailurePolicy;
	/** Semantic problems with an answer already checked against the schema; empty = valid.
	 *  Non-empty is an invalid answer, and the reasons become the re-issue's correction. */
	validate?(answer: unknown, call: ReviewCall): readonly string[];
	/** The re-issued prompt for an invalid answer. Absent: the reasons are appended to the
	 *  first system message (or prepended as one). */
	withCorrection?(prompt: ChunkPrompt, reasons: readonly string[]): ChunkPrompt;
	/** A stage whose committed output completes the snapshot (premise claims, probe evidence). */
	readonly snapshotField?: 'claims' | 'evidence' | undefined;
	/** The output's snapshot form when `snapshotField` is set. Default: the output itself. */
	toSnapshot?(output: unknown): readonly unknown[];
}

export interface EvidenceNote {
	readonly noteId:  string;
	readonly key:     string;
	readonly text:    string;
	readonly atomIds: readonly string[];
}

export interface GatherPlan<R> {
	readonly obligationCall: (key: string, evidence: readonly EvidenceNote[]) => ChunkPrompt;
	/** Answer: one EvidenceNote under the same key. */
	readonly reduceCall:     (key: string, batch: readonly EvidenceNote[]) => ChunkPrompt;
	/** A quarter of the limit. */
	readonly noteCapChars:   number;
	/** One or more calls that together judge a cross-chunk relation. */
	readonly relationCall?:  ((pair: readonly [ReviewAtom, ReviewAtom]) => readonly ChunkPrompt[]) | undefined;
	readonly merge:          (parts: readonly R[]) => R;
}

/** What the adapter's finish step gets beside the outputs. */
export interface FinishContext {
	readonly notJudged: readonly NotJudged[];
	readonly divided:   boolean;
}

export interface ReviewAdapter<R> {
	readonly kind:      'code-review' | 'design-review';
	readonly dimension: string;
	material(): ReviewMaterial;
	stagesFor(path: ReviewPath): readonly AdapterStage[];
	finish(outputs: StageOutputs, context: FinishContext): R;
	readonly gather?:   GatherPlan<R> | undefined;
	/** Text for a related atom held in another chunk. Deterministic; no model call. Absent: its label. */
	neighbourSummary?(atom: ReviewAtom, material: ReviewMaterial): string;
	/** Today's error when the review's time limit passes. Absent: ReviewSessionTimeoutError. */
	deadlineError?(limitMs: number): Error;
}

export type ReviewPath = 'daemon' | 'controller';

// -- sc3 ReviewChunk and ChunkPlan ------------------------------------------

export interface NeighbourSummary {
	readonly atomId:      string;
	readonly label:       string;
	readonly summary:     string;
	readonly heldInChunk: string;
}

export interface ReviewChunk {
	readonly id:         string;
	readonly atomIds:    readonly string[];
	readonly neighbours: readonly NeighbourSummary[];
	/** The rendered call's size, envelope included. */
	readonly chars:      number;
}

export interface ChunkPlan {
	readonly limitChars:     number;
	readonly single:         boolean;
	readonly chunks:         readonly ReviewChunk[];
	readonly crossRelations: readonly ReviewRelation[];
}

// -- sc4 CallEnvelope --------------------------------------------------------

export type CallRole = 'single' | 'chunk' | 'reduce' | 'obligation' | 'relation' | 'merge';

export interface CallCarries {
	readonly chunkId?: string | undefined;
	readonly atomIds:  readonly string[];
	readonly noteIds:  readonly string[];
	readonly key?:     string | undefined;
}

/** One call the job asks to be made, enveloped. Plain data. */
export interface ReviewCall {
	readonly callId:    string;
	/** 1, or 2 for the pipeline's one re-issue. */
	readonly attempt:   number;
	readonly stage:     string;
	readonly role:      CallRole;
	/** As sent: the adapter's messages with the envelope instruction last. */
	readonly messages:  readonly LLMMessage[];
	/** As sent: `{ callId, answer }` around the adapter's schema. */
	readonly schema:    StructuredSchema;
	readonly execution: ExecutionMode;
	/** The sent prompt's size in characters. */
	readonly chars:     number;
	readonly carries:   CallCarries;
	/** The adapter's own prompt, kept so a re-issue is enveloped afresh. */
	readonly prompt:    ChunkPrompt;
}

export interface EnvelopedAnswer {
	readonly callId: string;
	readonly answer: unknown;
}

export type FailureCause = 'size-refusal' | 'transient' | 'stall' | 'identifier-mismatch' | 'invalid-answer';

// -- sc5 ReviewPipelineJob ---------------------------------------------------

/** Taken once at prepare and frozen; a stage may complete `claims` / `evidence` once. Never re-queried. */
export interface ReviewMaterialSnapshot {
	readonly kind:          'code-review' | 'design-review';
	readonly grounding?:    unknown;
	readonly fileFacts?:    Readonly<Record<string, { readonly exists: boolean }>> | undefined;
	readonly documentText?: string | undefined;
	readonly claims?:       readonly unknown[] | undefined;
	readonly evidence?:     readonly unknown[] | undefined;
}

/** A call that failed both attempts in a stage whose policy keeps the review going. */
export interface NotJudged {
	readonly stage:  string;
	readonly key:    string;
	readonly cause:  string;
	readonly policy: 'record-not-judged' | 'record-observation';
}

/** Calls made per role, when the review was divided. */
export interface PipelineCalls {
	readonly chunk:      number;
	readonly obligation: number;
	readonly relation:   number;
	readonly merge:      number;
}

export interface ReviewPipelineJob {
	readonly reviewId:   string;
	readonly path:       ReviewPath;
	readonly snapshot:   ReviewMaterialSnapshot;
	readonly kind:       'code-review' | 'design-review';
	readonly dimension:  string;
	readonly phase:      'review' | 'reduce' | 'gather' | 'done';
	readonly plan:       ChunkPlan;
	/** The current stage's id; '' once done. */
	readonly stage:      string;
	readonly outputs:    StageOutputs;
	readonly pending:    readonly ReviewCall[];
	readonly answered:   readonly { readonly callId: string; readonly stage: string; readonly answer: unknown }[];
	/** The current model stage's answers so far. */
	readonly stageAnswers: readonly StageAnswer[];
	/** Answers of gather calls that do not become notes (obligation, relation, merge). */
	readonly gathered:   readonly { readonly role: CallRole; readonly key?: string | undefined; readonly answer: unknown }[];
	readonly notes:      readonly EvidenceNote[];
	readonly noteProvenance: Readonly<Record<string, readonly string[]>>;
	readonly notJudged:  readonly NotJudged[];
	readonly issuedHashes: readonly string[];
	/** Calls made per role. */
	readonly counts:     Readonly<Record<CallRole, number>>;
	/** Epoch ms after which no reviewer-session call is issued; absent when the review has none. */
	readonly deadlineAt?: number | undefined;
	/** The per-session limit (capped at 30 minutes) and the whole budget it was planned with. */
	readonly sessionLimitMs?: number | undefined;
	readonly deadlineBudgetMs?: number | undefined;
	/** The material's fingerprint at prepare: a rebuilt adapter must give the same material. */
	readonly materialHash: string;
	readonly seq:        number;
	/** The adapter's finished result once done. */
	readonly result?:    unknown;
}
