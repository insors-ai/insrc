/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Input / output shapes for `insrc_build_step` — the lean, controller-driven
 * build surface.
 *
 * The daemon does NOT edit code here. It resolves a task, runs the admission
 * gate, templatizes the implement instructions for the CONTROLLER to run, and
 * — for `validate` — runs a read-only agentic verdict session itself. Every
 * call is self-contained given the `target`; there is no state token.
 *
 * Open questions are NOT gated at build: they are resolved at the START of
 * each consuming stage on its immediate-upstream artifact (see
 * `workflow/questions.ts` + `insrc_workflow_step`). Build's upstream PLAN
 * carries no open questions.
 */

import type { BuildAdmissionRefusal } from '../../workflow/runners/build/schemas.js';

// ---------------------------------------------------------------------------
// Phases + inputs
// ---------------------------------------------------------------------------

export type BuildStepPhase = 'implement' | 'validate';

/** Standalone build context — a triage-routed Small (LLD → build) or Trivial
 *  (build only) feature. Present ⇒ the implement phase bypasses task/tracker
 *  resolution and sources its spec from the standalone LLD (Small) or the
 *  `focus` scope statement (Trivial). See `plans/feature-triage-router.md`. */
export interface BuildStandaloneContext {
	readonly standalone: true;
	/** The standalone story identity (self-minted hash + `S001`). Required for
	 *  Small (locates the LLD); optional for Trivial. */
	readonly epicHash?:  string | undefined;
	readonly storyId?:   string | undefined;
	/** The scope statement — the spec for a Trivial (no-LLD) build. */
	readonly focus?:     string | undefined;
	readonly sizeClass?: string | undefined;
	readonly triageRationale?: string | undefined;
}

export interface BuildStepInputImplement {
	readonly phase:  'implement';
	/** Task identifier: `#N`, a canonical/slug hierarchical id, or `s1/t3`.
	 *  Ignored for a standalone build (spec comes from `standalone`). */
	readonly target: string;
	readonly repo?:  string;
	/** Present for a triage-routed no-plan build. */
	readonly standalone?: BuildStandaloneContext | undefined;
}

export interface BuildStepInputValidate {
	readonly phase:  'validate';
	readonly target: string;
	readonly repo?:  string;
}

export type BuildStepInput =
	| BuildStepInputImplement
	| BuildStepInputValidate;

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** The daemon-supplied implement prompt. The CONTROLLER executes it (edits,
 *  tests, commits) — the daemon does NOT edit here. */
export interface BuildStepImplement {
	readonly next:       'implement';
	readonly taskId:     string;
	readonly workflowId: string;
	readonly issueRef?:  string | undefined;
	readonly prompt:     string;
}

/** Admission refused — the Story's plan is missing / unapproved / stale. */
export interface BuildStepRefused {
	readonly next:    'refused';
	readonly refusal: BuildAdmissionRefusal;
}

/** The daemon's read-only validation verdict for a task. */
export interface BuildStepDone {
	readonly next:    'done';
	readonly verdict: unknown;
	readonly passed:  boolean;
}

export interface BuildStepError {
	readonly next:  'error';
	readonly error: {
		readonly code:      string;
		readonly message:   string;
		readonly retryable: boolean;
	};
}

export type BuildStepOutput =
	| BuildStepImplement
	| BuildStepRefused
	| BuildStepDone
	| BuildStepError;

// ---------------------------------------------------------------------------
// MCP envelope
// ---------------------------------------------------------------------------

export interface BuildStepMcpEnvelope {
	readonly content:  { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
	readonly [key: string]: unknown;
}
