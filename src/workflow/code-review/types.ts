/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review Epic (E20260803 / 761a43a6fa645815), Story S001 — the three
 * cross-cutting contracts the whole code-review stage is built on. This module
 * declares TYPES ONLY (T001); the resolver, grounding assembler, and daemon IPC
 * live in sibling files.
 *
 *   - sc1 `CodeReviewSubject` / `CodeReviewSubjectResult` — the fixed per-Story
 *     review subject (git-derived changed files + approved LLD/PLAN), resolved
 *     without ever producing a verdict when a contract or build is missing.
 *   - sc2 `ChangedSymbolSummary` / `CodeReviewGrounding` — daemon-served
 *     structured summaries of the changed symbols (no raw file dumps).
 *   - sc3 `ReviewDimension` / `DimensionFinding` / `DimensionResult` — the
 *     per-dimension finding vocabulary the four dimension Stories (s2-s5) emit,
 *     reusing `Severity` from the existing artifact-review types VERBATIM so the
 *     eventual aggregate record speaks one severity vocabulary.
 */

import type { Severity, ReviewVerdict } from '../review/types.js';
import type { ArtifactMetaBase } from '../types.js';
import type { LldArtifact } from '../artifacts/lld.js';
import type { PlanArtifact } from '../artifacts/plan.js';
import type { StandaloneBuildRecord } from '../runners/build/standalone-record.js';

// ---------------------------------------------------------------------------
// sc3 — the per-dimension finding vocabulary (owned here, emitted by s2-s5)
// ---------------------------------------------------------------------------

/** The four review dimensions the code-review stage judges. */
export type ReviewDimension = 'adherence' | 'conventions' | 'coverage' | 'quality';

/** One finding a dimension raises. `severity` is the review `Severity` VERBATIM
 *  (reused, not redefined) so findings fold into one ReviewReport-shaped record. */
export interface DimensionFinding {
	readonly dimension: ReviewDimension;
	readonly severity:  Severity;
	/** `file:line` inside the Story's changed set. */
	readonly location:  string;
	readonly message:   string;
	/** adherence: the named approved clause the code departs from. */
	readonly expectationRef?: string | undefined;
	/** quality: the existing duplication counterpart, when one is claimed. */
	readonly counterpartRef?: string | undefined;
	/** conventions: a signal sampled from too few examples is an observation, not a breach. */
	readonly confidence?: 'observation' | 'breach' | undefined;
}

/** All findings one dimension produced for a Story. */
export interface DimensionResult {
	readonly dimension: ReviewDimension;
	readonly findings:  readonly DimensionFinding[];
}

// ---------------------------------------------------------------------------
// sc2 — daemon-served grounding (structured entity summaries, no raw file text)
// ---------------------------------------------------------------------------

/** A structured summary of one changed symbol, assembled from the graph. */
export interface ChangedSymbolSummary {
	/** Stable identity of the graph entity (the internal id, stringified). */
	readonly entityId:  string;
	readonly file:      string;
	readonly kind:      string;
	readonly name:      string;
	readonly signature: string;
	/** Names of entities that call this symbol. */
	readonly callers:   readonly string[];
	/** Names of entities this symbol calls. */
	readonly callees:   readonly string[];
	/** Names of test entities that reach this symbol (graph edges test -> symbol). */
	readonly testsReaching: readonly string[];
}

/** The IPC-served grounding bundle — structured summaries only, never file text. */
export interface CodeReviewGrounding {
	readonly symbols: readonly ChangedSymbolSummary[];
}

// ---------------------------------------------------------------------------
// sc1 — the fixed per-Story review subject + its resolution result
// ---------------------------------------------------------------------------

/** The fixed subject of a code review: exactly the files the Story's build
 *  changed (git-derived) plus its approved LLD + PLAN — BOTH optional. The
 *  build record is consumed for identity only — it is never re-derived or
 *  duplicated.
 *
 *  `approvedLld` / `approvedPlan` are each nullable, so the review MODE is a
 *  derivable predicate over their presence: (A) both present →
 *  implementation-correctness; (B) LLD only → LLD-contract review; (C) neither
 *  → pure code review with no design contract. The conventions + quality
 *  dimensions read neither, so they are mode-agnostic. */
export interface CodeReviewSubject {
	readonly repoPath:     string;
	readonly epicHash:     string;
	readonly storyId:      string;
	/** The build record's changed set = the exact subject. git-derived. */
	readonly changedFiles: readonly string[];
	readonly approvedLld:  LldArtifact | null;
	readonly approvedPlan: PlanArtifact | null;
	/** Consumed for identity; the code-review stage never re-records this. */
	readonly buildRecord:  StandaloneBuildRecord | null;
}

/** Resolving a subject either yields the subject, or a REASON that is NOT a
 *  verdict. Since NEITHER contract is required any more, a missing/unapproved
 *  LLD/PLAN is no longer a failure (it maps to a null field on the subject);
 *  the only decline reason is `no-build-record` — a review with no changed
 *  files has nothing to judge, so it declines rather than passing/failing. */
export type CodeReviewSubjectResult =
	| { readonly ok: true;  readonly subject: CodeReviewSubject }
	| { readonly ok: false; readonly reason: 'no-build-record' };

// ---------------------------------------------------------------------------
// sc4 — the aggregate persisted code-review record (owned here, produced by
// the S006 runner). Mirrors the WorkflowArtifact `{ meta, body }` shape so the
// storage + meta machinery is reused, and mirrors the review vocabulary
// (ReviewVerdict + counts, VERBATIM from ../review/types.js) so a downstream
// reader interprets one verdict language.
// ---------------------------------------------------------------------------

/** The persisted code-review body: the four dimension results + the folded
 *  verdict + severity counts. `kind` + `subject` keep it distinct in kind from
 *  the design-artifact review, and `verdict`/`counts` mirror ReviewReport so no
 *  second interpretation is needed. */
export interface CodeReviewBody {
	readonly kind:       'code-review';
	readonly epicHash:   string;
	readonly storyId:    string;
	/** How the review was grounded: `'full'` = the graph-grounded path (the four
	 *  dimension judges over freshly-indexed symbol summaries). Story s9 (the
	 *  indexing-readiness gate) only ever writes `'full'`; the sibling diff-only
	 *  fallback story widens this to `'full' | 'degraded'`. A downstream completion
	 *  gate distinguishes a full graph-grounded review from a degraded one by this
	 *  field. */
	readonly groundingMode: 'full';
	/** The exact review subject: the Story's changed files (git-derived). */
	readonly subject:    { readonly changedFiles: readonly string[] };
	/** All four dimension results (adherence / conventions / coverage / quality). */
	readonly dimensions: readonly DimensionResult[];
	/** Folded from the aggregated finding severities: any HIGH → block,
	 *  else any MED → warn, else pass. Reused VERBATIM from ../review/types.js. */
	readonly verdict:    ReviewVerdict;
	/** True severity totals over every dimension's findings. */
	readonly counts:     { readonly high: number; readonly med: number; readonly low: number };
}

/** Meta for a code-review record. Mirrors every {@link ArtifactMetaBase} field
 *  (so meta-stamping + the review/approval machinery are reused) but narrows the
 *  discriminant `workflow` to `'code-review'`: the record is produced by the
 *  runner directly, not by a chain workflow, so it is NOT a `WorkflowName`.
 *  `epicHash`/`storyId` are required (they key the `CR-<epic>-<story>` id). */
export interface CodeReviewMeta extends Omit<ArtifactMetaBase, 'workflow'> {
	readonly workflow: 'code-review';
	readonly epicHash: string;
	readonly storyId:  string;
}

/** The persisted code-review artifact — the same `{ meta, body }` shape as
 *  LldArtifact / PlanArtifact, written at `CR-<epic>-<story>`. */
export interface CodeReviewArtifact {
	readonly meta: CodeReviewMeta;
	readonly body: CodeReviewBody;
}

/** Schema version for the sc4 payload. Bump on a breaking body-shape change. */
export const CODE_REVIEW_SCHEMA_VERSION = 1;

/** The runner's return type. The `ok:false` arm is the ac5 no-pass-on-partial-
 *  failure signal — a run that fails partway returns it and writes nothing. */
export type CodeReviewOutcome =
	| { readonly ok: true;  readonly artifact: CodeReviewArtifact }
	| { readonly ok: false; readonly error: string };
