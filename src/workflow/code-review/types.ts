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

import type { Severity } from '../review/types.js';
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
 *  changed (git-derived) plus its approved LLD + PLAN. The build record is
 *  consumed for identity only — it is never re-derived or duplicated. */
export interface CodeReviewSubject {
	readonly repoPath:     string;
	readonly epicHash:     string;
	readonly storyId:      string;
	/** The build record's changed set = the exact subject. git-derived. */
	readonly changedFiles: readonly string[];
	readonly approvedLld:  LldArtifact;
	readonly approvedPlan: PlanArtifact;
	/** Consumed for identity; the code-review stage never re-records this. */
	readonly buildRecord:  StandaloneBuildRecord | null;
}

/** Resolving a subject either yields the subject, or a REASON that is NOT a
 *  verdict: a review without an approved contract or a build has nothing to
 *  judge, so it declines rather than passing/failing. */
export type CodeReviewSubjectResult =
	| { readonly ok: true;  readonly subject: CodeReviewSubject }
	| { readonly ok: false; readonly reason: 'no-approved-contract' | 'no-build-record' };
