/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Input / output shapes for `insrc_code_review_step` (code-review S008) — the
 * controller-driven, multi-turn CODE-review surface.
 *
 * The daemon does the DETERMINISTIC parts (resolve the subject, serve grounding
 * over IPC, fold the four dimensions + persist the record via the SAME sc5
 * `runCodeReview`); the CONTROLLER (the MCP client model) supplies each
 * dimension's JUDGEMENT — genuine "two sets of eyes" over the code, off the same
 * provider that authored it. Mirrors `insrc_review_step`'s envelope verbatim.
 *
 * Loop: start → emit_judgements → judgements → done  (or error at any turn).
 */

import type { LLMMessage } from '../../shared/types.js';
import type { ReviewVerdict } from '../../workflow/review/types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult } from '../../workflow/code-review/types.js';

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type CodeReviewStepPhase = 'start' | 'judgements';

/** Kick off a code review over a built Story. The daemon resolves the fixed
 *  subject + serves grounding; the controller then judges each dimension. */
export interface CodeReviewStepInputStart {
	readonly phase:    'start';
	readonly epicHash: string;
	readonly storyId:  string;
	readonly repo?:    string | undefined;
}

/** The controller's four dimension judgements (one DimensionResult per
 *  dimension), carried back with the opaque state token. */
export interface CodeReviewStepInputJudgements {
	readonly phase:      'judgements';
	readonly judgements: { readonly judgements?: readonly DimensionResult[] | undefined };
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
	readonly next:     'emit_judgements';
	readonly guidance: string;
	/** The four per-dimension prompts (buildAdherence/Conventions/Coverage/Quality),
	 *  in fixed order — the reasoning charge the controller judges against. */
	readonly prompts:  readonly LLMMessage[][];
	/** JSON Schema the controller's `{ judgements: DimensionResult[] }` must match. */
	readonly schema:   Record<string, unknown>;
	/** The daemon-served grounding — the controller's read-only ground truth. */
	readonly grounding: CodeReviewGrounding;
	readonly state:    string;
}

export interface CodeReviewStepDone {
	readonly next:     'done';
	readonly verdict:  ReviewVerdict;
	readonly counts:   CodeReviewStepCounts;
	readonly path:     string;
	readonly jsonPath: string;
}

export interface CodeReviewStepError {
	readonly next:  'error';
	readonly error: {
		readonly code:      string;
		readonly message:   string;
		readonly retryable: boolean;
	};
}

export type CodeReviewStepOutput =
	| CodeReviewStepEmitJudgements
	| CodeReviewStepDone
	| CodeReviewStepError;

// ---------------------------------------------------------------------------
// Server-side run state (held under an opaque token in the state-store)
// ---------------------------------------------------------------------------

export interface CodeReviewStepStatePayload {
	readonly runId:       string;
	readonly startedAtMs: number;
	readonly repo:        string;
	readonly epicHash:    string;
	readonly storyId:     string;
	/** The resolved sc1 subject (used to key + scope the record on the judgements turn). */
	readonly subject:     CodeReviewSubject;
	/** The daemon-served grounding, replayed to the runner's assembleGrounding. */
	readonly grounding:   CodeReviewGrounding;
}

// ---------------------------------------------------------------------------
// MCP envelope
// ---------------------------------------------------------------------------

export interface CodeReviewStepMcpEnvelope {
	readonly content:  { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
	readonly [key: string]: unknown;
}
