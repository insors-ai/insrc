/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Input / output shapes for `insrc_code_review_step` (code-review S008) — the
 * multi-turn CODE-review surface.
 *
 * The party that did not write the code reviews it. For code the DAEMON wrote
 * the reviewer is the controller: the daemon does the DETERMINISTIC parts
 * (resolve the subject, serve grounding over IPC, fold the four dimensions +
 * persist the record via the SAME sc5 `runCodeReview`) and the CONTROLLER (the
 * MCP client model) supplies each dimension's JUDGEMENT. For code the
 * controller wrote, or whose author is not recorded, `start` sends it to the
 * daemon and returns the daemon's verdict as `done`. Mirrors
 * `insrc_review_step`'s envelope verbatim.
 *
 * Loop: start → emit_judgements → judgements → done  (or error at any turn).
 */

import type { ReviewControllerBudgetDeclaration, ReviewBudgetBreakdown } from '../../../shared/review-budget.js';
import type { ControllerReviewReply } from '../../../workflow/review-pipeline/controller.js';
import type { ControllerCodeReviewState } from './controller.js';
import type { ReviewCompletionReceipt } from '../../threads/review-state-contract.js';
import type { LLMMessage } from '../../../shared/types.js';
import type { ReviewVerdict } from '../../../workflow/review/types.js';
import type { CodeReviewFallbackReason, CodeReviewGrounding, CodeReviewSubject, DimensionResult } from '../../../workflow/code-review/types.js';

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type CodeReviewStepPhase = 'start' | 'judgements';

/** Kick off a code review over a built Story. The daemon resolves the fixed
 *  subject + serves grounding; the controller then judges each dimension.
 *
 *  s9 (indexing-readiness gate): when `start` finds the index STALE for the
 *  changed files it returns a `confirm_wait` result carrying an opaque `state`.
 *  The caller resumes by re-calling `start` with that `state` plus `proceed`:
 *  `proceed:true` begins the bounded block-and-poll (wait for a fresh index);
 *  `proceed:false` aborts the review (fail-closed, no verdict). A plain start
 *  call (no `state`/`proceed`) is unchanged. */
export interface CodeReviewStepInputStart {
	readonly phase:    'start';
	readonly reviewBudget?: ReviewControllerBudgetDeclaration | undefined;
	readonly reply?: ControllerReviewReply | undefined;
	readonly epicHash?: string | undefined;
	readonly storyId?:  string | undefined;
	readonly repo?:    string | undefined;
	/** Resume past a `confirm_wait`: true = wait for a fresh index, false = abort. */
	readonly proceed?: boolean | undefined;
	/** The opaque state token returned by a prior `confirm_wait` turn. */
	readonly state?:   string | undefined;
}

/** The controller's four dimension judgements (one DimensionResult per
 *  dimension), carried back with the opaque state token. */
export interface CodeReviewStepInputJudgements {
	readonly phase:      'judgements';
	readonly reviewBudget?: ReviewControllerBudgetDeclaration | undefined;
	readonly reply?: ControllerReviewReply | undefined;
	readonly judgements?: { readonly judgements?: readonly DimensionResult[] | undefined } | undefined;
	readonly state:      string;
}

export type CodeReviewStepInput =
	| CodeReviewStepInputStart
	| CodeReviewStepInputJudgements;

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** Severity totals mirroring the CR body.counts. */
export interface CodeReviewStepCounts {
	readonly high: number;
	readonly med:  number;
	readonly low:  number;
}

export interface CodeReviewStepEmitJudgements {
	readonly call?: Readonly<Record<string, string | number>> | undefined;
	readonly timing?: Readonly<Record<string, string | number>> | undefined;
	readonly next:     'emit_judgements';
	readonly guidance: string;
	/** The four per-dimension prompts (buildAdherence/Conventions/Coverage/Quality),
	 *  in fixed order — the reasoning charge the controller judges against. */
	readonly prompts:  readonly LLMMessage[][];
	/** JSON Schema the controller's `{ judgements: DimensionResult[] }` must match. */
	readonly schema:   Record<string, unknown>;
	/** The daemon-served grounding — the controller's read-only ground truth. */
	readonly grounding?: CodeReviewGrounding | undefined;
	readonly state:    string;
}

/** s9: the index is stale for the changed files. The controller relays the
 *  stale-file list to the user and resumes `start` with the opaque `state` and
 *  `proceed:true` (wait) or `proceed:false` (abort). Returned both on the initial
 *  stale detection and as the timeout re-prompt. */
export interface CodeReviewStepConfirmWait {
	readonly call?: Readonly<Record<string, string | number>> | undefined;
	readonly timing?: Readonly<Record<string, string | number>> | undefined;
	readonly next:         'confirm_wait';
	readonly guidance:     string;
	/** The changed files whose index watermark is behind their mtime. */
	readonly staleFiles:   readonly string[];
	/** Whether the index queue is still processing (the other half of the signal). */
	readonly isProcessing: boolean;
	readonly state:        string;
}

export interface CodeReviewStepDone {
	readonly next:     'done';
	readonly verdict:  ReviewVerdict;
	readonly counts:   CodeReviewStepCounts;
	readonly path:     string;
	readonly jsonPath: string;
	/** Set when the tool sent the code to the daemon for review (code the
	 *  controller wrote, or whose author is not known); absent when the
	 *  controller reviewed it through this tool's own judgements phase. */
	readonly reviewedBy?:    'daemon' | undefined;
	/** How a daemon review was grounded; `degraded` means on the diff. */
	readonly groundingMode?: 'full' | 'degraded' | undefined;
	/** Why the review fell back to the diff (ISSUE-1102dc71); absent on a full review. */
	readonly fallbackReason?: CodeReviewFallbackReason | undefined;
	/** The model the daemon reviewed with. */
	readonly model?:         string | undefined;
	/**
	 * Present ONLY when findings were dropped as out of scope (ISSUE-11e4fa88): how
	 * many, per dimension, and the size of the changed set they were tested
	 * against. The dropped findings themselves are on the record (`outOfScope`).
	 * `verdict` and `counts` above do not include them.
	 */
	readonly scopeDropped?: {
		readonly count:        number;
		readonly changedFiles: number;
		readonly byDimension:  Readonly<Record<string, number>>;
	} | undefined;
}

export interface CodeReviewStepError {
	readonly next:  'error';
	readonly error: {
		readonly code:      string;
		readonly message:   string;
		readonly retryable: boolean;
		readonly context?: { readonly stage?: string | undefined; readonly callId?: string | undefined; readonly unitId?: string | undefined; readonly shortfallTokens?: number | undefined } | undefined;
		readonly evidence?: { artifactId?: string | undefined; runId?: string | undefined } | undefined;
		readonly budget?: ReviewBudgetBreakdown | undefined;
	};
}

export type CodeReviewStepOutput =
	| CodeReviewStepEmitJudgements
	| CodeReviewStepConfirmWait
	| CodeReviewStepDone
	| { readonly next: 'already_completed'; readonly receipt: ReviewCompletionReceipt }
	| CodeReviewStepError;

// ---------------------------------------------------------------------------
// Server-side run state (held under an opaque token in the state-store)
// ---------------------------------------------------------------------------

export interface CodeReviewStepStatePayload {
	readonly controller?: ControllerCodeReviewState | undefined;
	readonly runId:       string;
	readonly startedAtMs: number;
	readonly repo:        string;
	readonly epicHash:    string;
	readonly storyId:     string;
	/** The resolved sc1 subject (used to key + scope the record on the judgements turn). */
	readonly subject:     CodeReviewSubject;
	/** The daemon-served grounding, replayed to the runner's assembleGrounding.
	 *  UNDEFINED in a `confirm_wait` state saved by the s9 gate — at that point
	 *  grounding has not been fetched yet (the gate precedes fetchGrounding); the
	 *  post-poll path fetches it and saves the full payload before emit_judgements. */
	readonly grounding?:  CodeReviewGrounding | undefined;
	/** s10: `'degraded'` marks a diff-only fallback state (the decline branch built
	 *  its grounding from the changed-file diff, not the graph). The judgements turn
	 *  reads this to drive `runCodeReview` with `groundingMode:'degraded'` +
	 *  `capVerdictAtWarn:true`; the graph path omits it (⇒ `'full'`, uncapped). */
	readonly groundingMode?: 'degraded' | undefined;
	/** Why this degraded state fell back to the diff; carried to the judgements
	 *  turn so the record it writes says why (ISSUE-1102dc71). */
	readonly fallbackReason?: CodeReviewFallbackReason | undefined;
}

// ---------------------------------------------------------------------------
// MCP envelope
// ---------------------------------------------------------------------------

export interface CodeReviewStepMcpEnvelope {
	readonly content:  { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean | undefined;
	readonly [key: string]: unknown;
}
