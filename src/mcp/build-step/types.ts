/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Input / output shapes for `insrc_build_step` — the lean, controller-driven
 * build surface.
 *
 * The daemon does NOT edit code here. It resolves a task, gates it (admission
 * + open-question), templatizes the implement instructions for the CONTROLLER
 * to run, and — for `validate` — runs a read-only agentic verdict session
 * itself. Every call is self-contained given the `target`; there is no state
 * token.
 */

import type { BuildAdmissionRefusal } from '../../workflow/runners/build/schemas.js';

// ---------------------------------------------------------------------------
// Phases + inputs
// ---------------------------------------------------------------------------

export type BuildStepPhase = 'implement' | 'validate' | 'resolve_question';

export interface BuildStepInputImplement {
	readonly phase:  'implement';
	/** Task identifier: `#N`, a canonical/slug hierarchical id, or `s1/t3`. */
	readonly target: string;
	readonly repo?:  string;
}

export interface BuildStepInputValidate {
	readonly phase:  'validate';
	readonly target: string;
	readonly repo?:  string;
}

export interface BuildStepInputResolveQuestion {
	readonly phase:      'resolve_question';
	readonly target:     string;
	readonly questionId: string;
	readonly choice?:    string;
	readonly ignore?:    boolean;
	readonly rationale?: string;
	readonly repo?:      string;
}

export type BuildStepInput =
	| BuildStepInputImplement
	| BuildStepInputValidate
	| BuildStepInputResolveQuestion;

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

/** A single open question with daemon-generated solution options. The
 *  CONTROLLER presents each to the human (one at a time, with an ignore
 *  choice) and records the answer via phase='resolve_question'. */
export interface BuildStepQuestion {
	readonly questionId:     string;
	readonly text:           string;
	readonly options:        readonly { readonly label: string; readonly detail: string }[];
	readonly recommendation: string;
}

/** Unresolved open questions block implement until each is resolved/ignored. */
export interface BuildStepResolveQuestions {
	readonly next:      'resolve_questions';
	readonly questions: readonly BuildStepQuestion[];
}

/** Every open question is now resolved/ignored — call implement again. */
export interface BuildStepReady {
	readonly next:    'ready';
	readonly message: string;
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
	| BuildStepResolveQuestions
	| BuildStepReady
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
