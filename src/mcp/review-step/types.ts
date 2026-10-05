/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Input / output shapes for `insrc_review_step` — the controller-driven,
 * multi-turn review surface.
 *
 * The daemon does the DETERMINISTIC parts (read the artifact, gather
 * evidence, assemble + persist the report); the CONTROLLER (the MCP client
 * model — Claude / Codex) emits the CLAIMS and the VERDICTS. This moves the
 * review's LLM reasoning off the same provider that authored the artifact —
 * genuine "two sets of eyes". Mirrors `insrc_workflow_step`'s envelope.
 *
 * Loop: start → emit_claims → claims → emit_verdicts → verdicts → done.
 */

import type { DesignIntent, RawTemplateAnswer } from '../../workflow/review/template.js';
import type { Claim, Evidence, ReviewReport, ReviewVerdict } from '../../workflow/review/types.js';

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/** `findings` is the design-review path: for an HLD or LLD, `start` returns
 *  `emit_findings` and the controller answers once with phase='findings'. Every
 *  other artifact keeps start → claims → verdicts. */
export type ReviewStepPhase = 'start' | 'claims' | 'verdicts' | 'findings';

/** Kick off a review over a persisted artifact. `artifact` is the `.md`
 *  (or `.html`) path; the canonical `.json` is resolved via `jsonPathForMd`.
 *  A `.json` path is also accepted (its `.md` sibling is derived). */
export interface ReviewStepInputStart {
	readonly phase:    'start';
	readonly artifact: string;
	readonly repo?:    string | undefined;
}

/** The controller's extracted claims (matching `EXTRACT_SCHEMA`). */
export interface ReviewStepInputClaims {
	readonly phase:  'claims';
	readonly claims: { readonly claims?: readonly Claim[] | undefined };
	readonly state:  string;
}

/** The controller's per-claim verdicts (one entry per claim, keyed by
 *  `claimId`; each entry is a Finding-without-claimId payload). */
export interface ReviewStepInputVerdicts {
	readonly phase:    'verdicts';
	readonly verdicts: { readonly verdicts?: readonly RawVerdict[] | undefined };
	readonly state:    string;
}

/** One controller-emitted verdict: a `VERIFY_SCHEMA` finding plus its
 *  `claimId`, so the server can re-key it back to the claim. */
export interface RawVerdict {
	readonly claimId:     string;
	readonly severity:    string;
	readonly evidence:    string;
	readonly action:      string;
	readonly fixability:  string;
	readonly proposedFix?: unknown;
}

/** The controller's answer to a design-review template (matching
 *  `TEMPLATE_ANSWER_SCHEMA`): every check item, with the premises examined. */
export interface ReviewStepInputFindings {
	readonly phase:    'findings';
	readonly findings: RawTemplateAnswer;
	readonly state:    string;
}

export type ReviewStepInput =
	| ReviewStepInputStart
	| ReviewStepInputClaims
	| ReviewStepInputVerdicts
	| ReviewStepInputFindings;

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface ReviewStepEmitClaims {
	readonly next:     'emit_claims';
	readonly guidance: string;
	readonly stage:    string;
	readonly prompt:   { readonly system: string; readonly user: string };
	readonly schema:   Record<string, unknown>;
	readonly state:    string;
}

/** `start` on a design document (HLD / LLD): the review template to answer. */
export interface ReviewStepEmitFindings {
	readonly next:     'emit_findings';
	readonly guidance: string;
	readonly stage:    string;
	/** The id of the template in use (`design-issue` / `design-spec`). */
	readonly template: string;
	readonly prompt:   { readonly system: string; readonly user: string };
	readonly schema:   Record<string, unknown>;
	readonly state:    string;
}

export interface ReviewStepEmitVerdicts {
	readonly next:     'emit_verdicts';
	readonly guidance: string;
	readonly prompt:   { readonly system: string; readonly user: string };
	readonly schema:   Record<string, unknown>;
	/** The DETERMINISTIC evidence the server gathered per claim (ground
	 *  truth the controller must judge against — nothing else). */
	readonly evidence: readonly Evidence[];
	readonly state:    string;
}

export interface ReviewStepDone {
	readonly next:     'done';
	readonly verdict:  ReviewVerdict;
	readonly counts:   ReviewReport['counts'];
	/** The rendered review report (markdown), suitable for display. */
	readonly report:   string;
	/** Number of `auto` findings whose edits were applied to the artifact. */
	readonly applied:  number;
	/** Number of findings still needing a human (assisted / manual). */
	readonly pending:  number;
	readonly path:     string;
	readonly jsonPath: string;
}

export interface ReviewStepError {
	readonly next:  'error';
	readonly error: {
		readonly code:      string;
		readonly message:   string;
		readonly retryable: boolean;
	};
}

export type ReviewStepOutput =
	| ReviewStepEmitClaims
	| ReviewStepEmitFindings
	| ReviewStepEmitVerdicts
	| ReviewStepDone
	| ReviewStepError;

// ---------------------------------------------------------------------------
// Server-side run state (held under an opaque token in the state-store)
// ---------------------------------------------------------------------------

export interface ReviewStepStatePayload {
	readonly runId:       string;
	readonly startedAtMs: number;
	readonly mdPath:      string;
	readonly jsonPath:    string;
	readonly repo:        string;
	readonly stage:       string;
	readonly markdown:    string;
	/** Set at `start` for a design document: which review template applies. Its
	 *  presence is what marks the run as a template review. */
	readonly templateIntent?: DesignIntent | undefined;
	/** Set after the `claims` turn. */
	readonly claims?:     readonly Claim[] | undefined;
	/** Set after the `claims` turn (the gathered ground truth). */
	readonly evidence?:   readonly Evidence[] | undefined;
}

// ---------------------------------------------------------------------------
// MCP envelope
// ---------------------------------------------------------------------------

export interface ReviewStepMcpEnvelope {
	readonly content:  { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
	readonly [key: string]: unknown;
}
