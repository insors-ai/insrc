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
import type { BuildRecord } from '../runners/build/standalone-record.js';
import type { TestRecord } from '../runners/build/test-record.js';
import type { PipelineCalls, ReviewMaterialSnapshot } from '../review-pipeline/types.js';

// ---------------------------------------------------------------------------
// sc3 — the per-dimension finding vocabulary (owned here, emitted by s2-s5)
// ---------------------------------------------------------------------------

/** The review dimensions the code-review stage judges. The base four are always
 *  present; `functional-coverage` (sc2 — S001), `diagram` (sc4 — S003), and `ux`
 *  (sc4 — S004) are CONDITIONAL, included only when the review subject carries the
 *  triggering content (a functionalDefinition / an erDefinition-or-diagram companion
 *  / a uxDefinition-or-ux-mock companion or a recorded 'ux' adherence selection). */
export type ReviewDimension = 'adherence' | 'conventions' | 'coverage' | 'quality' | 'functional-coverage' | 'diagram' | 'ux';

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
	/** coverage (ISSUE-b47dadc7): what the finding is about. */
	readonly findingKind?: CoverageFindingKind | undefined;
	/** coverage: the entityId of the prepared symbol a 'symbol-coverage' finding names. */
	readonly symbolId?: string | undefined;
}

/** What a coverage finding is about (ISSUE-b47dadc7). */
export type CoverageFindingKind = 'symbol-coverage' | 'promised-test' | 'other';

/** A coverage HIGH lowered to LOW because its evidence does not support a breach. */
export interface LoweredFinding {
	readonly location: string;
	readonly reason:   string;
	readonly symbolId?: string | undefined;
	readonly expectationRef?: string | undefined;
}

/** All findings one dimension produced for a Story. */
export interface DimensionResult {
	readonly dimension: ReviewDimension;
	readonly findings:  readonly DimensionFinding[];
	/**
	 * Findings the reviewer submitted that were DROPPED because their file is
	 * outside the Story's changed set (ISSUE-11e4fa88). Carried verbatim so a
	 * quiet dimension can be told apart from one whose findings were filtered
	 * away: an absent key means nothing was dropped.
	 *
	 * NOT part of the verdict. `counts` and `verdict` fold over `findings` only;
	 * nothing here can block or warn. Omitted (not empty) when there is nothing to
	 * report, so a record with no drops is byte-identical to one written before
	 * this field existed.
	 */
	readonly outOfScope?: readonly DimensionFinding[] | undefined;
	/** Coverage HIGHs lowered to LOW, each with why (ISSUE-b47dadc7). Not part of
	 *  the verdict beyond the lowered severity; omitted when nothing was lowered. */
	readonly lowered?: readonly LoweredFinding[] | undefined;
	/** How many calls of each stage the dimension took, when it took more than one
	 *  (ISSUE-aef82b03: judged as a bounded review job). Absent for one call. */
	readonly parts?: { readonly map: number; readonly reduce: number; readonly compare: number } | undefined;
	/** Calls the review pipeline made per role when the dimension was divided (Epic
	 *  8315a11f). Absent on a single-chunk review; `parts` is no longer written. */
	readonly pipelineCalls?: PipelineCalls | undefined;
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
	/** Test-file callers that reach this symbol, each `<test file>#<caller name>`
	 *  (the file joins it to the Story's test record; ISSUE-1102dc71). */
	readonly testsReaching: readonly string[];
	/** Whether the coverage dimension judges this symbol (ISSUE-b47dadc7): a
	 *  function, method or class in a non-test file. Absent on a diff-review row
	 *  and on summaries built before the field existed. */
	readonly coverageEligible?: boolean | undefined;
	/** The coverage judge's evidence class for an eligible symbol (ISSUE-b47dadc7). */
	readonly coverageEvidence?: CoverageEvidence | undefined;
}

/** How far the graph and the Story's test record show a symbol is exercised. */
export type CoverageEvidence = 'reached-passing' | 'reached-not-passing' | 'no-edge-story-tests-pass' | 'no-edge-no-tests';

/** What every judge slot is told about the run (ISSUE-b47dadc7). */
export interface JudgeContext {
	/** 'degraded' when the grounding is the diff, not the graph. */
	readonly groundingMode: 'full' | 'degraded';
	/** The review's snapshot, taken once by runCodeReview (Epic 8315a11f); absent: the judge takes it. */
	readonly snapshot?: ReviewMaterialSnapshot | undefined;
	/** Cancels the review, including a call in flight. */
	readonly signal?: AbortSignal | undefined;
	/** Told as each review pipeline call of the judge starts (ISSUE-1973e125). */
	readonly onCallEvent?: ((event: import('../review-pipeline/call-events.js').ReviewCallEvent) => void) | undefined;
	readonly onCall?: ((call: { readonly stage: string; readonly role: string }) => void) | undefined;
}

/** The IPC-served grounding bundle — structured summaries only, never file text. */
export interface CodeReviewGrounding {
	readonly symbols: readonly ChangedSymbolSummary[];
}

// ---------------------------------------------------------------------------
// sc1 — the fixed per-Story review subject + its resolution result
// ---------------------------------------------------------------------------

/** Why a code review fell back from the graph to the diff (ISSUE-1102dc71):
 *  the wait for a fresh index ran out (with what it was still waiting on), the
 *  caller declined the wait, or the fresh graph had no symbols for the Story. */
export type CodeReviewFallbackReason =
	| { readonly kind: 'freshness-timeout'; readonly waitedMs: number; readonly inFlight: boolean; readonly pendingCodeIndexJobs: number; readonly staleFiles: readonly string[] }
	| { readonly kind: 'declined' }
	| { readonly kind: 'hollow-grounding' };

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
/** How a review's changed set was scoped (ISSUE-b47dadc7): the committed range by
 *  the Story's `Insrc-Story` trailer or by its first-parent commits. 'working-tree'
 *  is kept for records written before ISSUE-b97752e9; a Story's review no longer
 *  produces it. */
export type ChangeSetAttribution = 'story-trailer' | 'first-parent-range' | 'working-tree';

export interface CodeReviewSubject {
	readonly repoPath:     string;
	readonly epicHash:     string;
	readonly storyId:      string;
	/** The build record's changed set = the exact subject. git-derived. */
	readonly changedFiles: readonly string[];
	readonly approvedLld:  LldArtifact | null;
	readonly approvedPlan: PlanArtifact | null;
	/** The Story's BUILD record: its meta gives identity, its tasks the per-task
	 *  validate result. The code-review stage never re-records this. */
	readonly buildRecord:  BuildRecord | null;
	/** The Story's TESTS record: the gate's per-file, per-title results, which
	 *  the coverage dimension judges pass-state from (ISSUE-1102dc71). */
	readonly testRecord:   TestRecord | null;
	/** How `changedFiles` was scoped; absent when the changed-file seam did not say. */
	readonly changeSetAttribution?: ChangeSetAttribution | undefined;
	/** Story files that another Story's excluded commit also changed: a full review
	 *  judges them whole (stated limit, ISSUE-b47dadc7). */
	readonly sharedWithExcluded?: readonly string[] | undefined;
	/** Uncommitted files left out because no Story commit changed them (sorted);
	 *  absent when none (ISSUE-b97752e9). */
	readonly excludedFromScope?: readonly string[] | undefined;
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
 readonly callEvents?: readonly import('../review-pipeline/call-events.js').ReviewCallEvent[] | undefined;
	readonly epicHash:   string;
	readonly storyId:    string;
	/** How the review was grounded: `'full'` = the graph-grounded path (the four
	 *  dimension judges over freshly-indexed symbol summaries); `'degraded'` = the
	 *  diff-only fallback (s10), where the judges reason over the changed-file diff
	 *  hunks rather than graph symbol summaries because the index could not be made
	 *  fresh. Story s9 (the indexing-readiness gate) only ever writes `'full'`; s10
	 *  (the diff-only degraded fallback) is the sole producer of `'degraded'`. A
	 *  downstream completion gate distinguishes a full graph-grounded review from a
	 *  degraded one by this field. */
	readonly groundingMode: 'full' | 'degraded';
	/** Why a `degraded` review fell back to the diff (ISSUE-1102dc71). Absent on a
	 *  full review and on records written before this field. */
	readonly fallbackReason?: CodeReviewFallbackReason | undefined;
	/** The exact review subject: the Story's changed files (git-derived). */
	readonly subject:    {
		readonly changedFiles: readonly string[];
		/** Build content reviewed; absent on older records, which use timestamp checks. */
		readonly buildFingerprint?: string | undefined;
		/** Optional on read: records written before ISSUE-b47dadc7 lack both. */
		readonly changeSetAttribution?: ChangeSetAttribution | undefined;
		readonly sharedWithExcluded?: readonly string[] | undefined;
		/** What the review left out and why: uncommitted files no Story commit
		 *  changed (ISSUE-b97752e9). Absent when none, and on older records. */
		readonly excludedFromScope?: readonly string[] | undefined;
	};
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
	/** The party that ran this code review. Absent on older records. */
	readonly reviewedBy?: 'controller' | 'daemon' | undefined;
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
