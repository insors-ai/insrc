/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Input / output shapes for `insrc_workflow_step`.
 *
 * See plans/workflow-implementation.md §7.2 for the protocol.
 */

import type { WorkflowName, WorkflowPlan } from '../../workflow/types.js';

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type WorkflowStepPhase =
	| 'start'
	| 'plan'
	| 'step'
	| 'synthesize'
	| 'resolve_question'
	| 'review_deferred';

export interface WorkflowStepInputStart {
	readonly phase:    'start';
	readonly workflow: WorkflowName;
	readonly focus:    string;
	readonly repo?:    string;
	readonly params?:  Record<string, unknown>;
}

export interface WorkflowStepInputPlan {
	readonly phase: 'plan';
	readonly plan:  WorkflowPlan;
	readonly state: string;
}

export interface WorkflowStepInputStep {
	readonly phase:    'step';
	readonly stepId:   string;
	readonly response: Record<string, unknown>;
	readonly state:    string;
}

export interface WorkflowStepInputSynthesize {
	readonly phase:    'synthesize';
	readonly artifact: Record<string, unknown>;
	readonly state:    string;
}

/** Record ONE answer to an upstream-artifact open question. Pre-run gate:
 *  no `state` token — the upstream artifact is addressed by workflow+params.
 *  Exactly one of `choice` (with status resolved) / `defer` / `ignore`. */
export interface WorkflowStepInputResolveQuestion {
	readonly phase:      'resolve_question';
	readonly workflow:   WorkflowName;
	readonly params?:    Record<string, unknown>;
	readonly questionId: string;
	readonly choice?:    string;
	readonly defer?:     boolean;
	readonly ignore?:    boolean;
	readonly rationale?: string;
	readonly repo?:      string;
}

/** List the Epic's deferred open questions (with regenerated options) for
 *  the review flow. Stateless; addressed by `params.epicHash | epicSlug`. */
export interface WorkflowStepInputReviewDeferred {
	readonly phase:   'review_deferred';
	readonly params?: Record<string, unknown>;
	readonly repo?:   string;
}

export type WorkflowStepInput =
	| WorkflowStepInputStart
	| WorkflowStepInputPlan
	| WorkflowStepInputStep
	| WorkflowStepInputSynthesize
	| WorkflowStepInputResolveQuestion
	| WorkflowStepInputReviewDeferred;

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface WorkflowStepEmitPlan {
	readonly next:     'emit_plan';
	readonly guidance: string;
	readonly prompt:   string;
	readonly userTurn: string;
	readonly schema:   Record<string, unknown>;
	readonly state:    string;
}

export interface WorkflowStepEmitStep {
	readonly next:     'emit_step';
	readonly guidance: string;
	readonly stepId:   string;
	readonly runner:   string;
	readonly prompt:   string;
	readonly userTurn: string;
	readonly schema:   Record<string, unknown>;
	readonly state:    string;
}

export interface WorkflowStepEmitSynthesize {
	readonly next:     'emit_synthesize';
	readonly guidance: string;
	readonly prompt:   string;
	readonly userTurn: string;
	readonly schema:   Record<string, unknown>;
	readonly state:    string;
}

export interface WorkflowStepDone {
	readonly next:     'done';
	readonly path:     string;
	readonly markdown: string;
	readonly artifact: unknown;
	/** The just-produced artifact's still-open questions (if any). The
	 *  controller MAY offer to resolve them now via phase='resolve_question'
	 *  (optional — the stage is complete regardless). */
	readonly openQuestions?: readonly { readonly questionId: string; readonly text: string }[];
	/** In-CLI approval gate instruction: the controller must present the
	 *  artifact summary, ASK the user, and only on an in-chat yes call
	 *  insrc_workflow_approve. Never auto-approve. */
	readonly pendingApproval?: {
		readonly artifactPath: string;
		readonly epicHash?:    string;
		readonly guidance:     string;
	};
}

/** One upstream-artifact open question with daemon-generated options. */
export interface WorkflowStepQuestion {
	readonly questionId:     string;
	readonly text:           string;
	readonly options:        readonly { readonly label: string; readonly detail: string }[];
	readonly recommendation: string;
}

/** The mandatory stage-start gate: the immediate-upstream artifact has
 *  unresolved open questions. Resolve each via phase='resolve_question',
 *  then re-call phase='start'. */
export interface WorkflowStepResolveQuestions {
	readonly next:      'resolve_questions';
	readonly questions: readonly WorkflowStepQuestion[];
}

/** Every upstream open question is now resolved / ignored / deferred —
 *  re-call phase='start' to proceed. */
export interface WorkflowStepReady {
	readonly next:    'ready';
	readonly message: string;
}

/** The Epic's deferred questions (with regenerated options + the exact
 *  resolve_question call to make for each). */
export interface WorkflowStepDeferred {
	readonly next:      'deferred';
	readonly questions: readonly (WorkflowStepQuestion & {
		readonly kind:       'define' | 'hld' | 'lld';
		readonly storyId?:   string;
		readonly resolveWith: { readonly workflow: WorkflowName; readonly params: Record<string, unknown> };
	})[];
}

export interface WorkflowStepError {
	readonly next:  'error';
	readonly error: {
		readonly code:      string;
		readonly message:   string;
		readonly retryable: boolean;
	};
}

export type WorkflowStepOutput =
	| WorkflowStepEmitPlan
	| WorkflowStepEmitStep
	| WorkflowStepEmitSynthesize
	| WorkflowStepDone
	| WorkflowStepResolveQuestions
	| WorkflowStepReady
	| WorkflowStepDeferred
	| WorkflowStepError;

// ---------------------------------------------------------------------------
// MCP envelope
// ---------------------------------------------------------------------------

export interface WorkflowStepMcpEnvelope {
	readonly content:  { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
	readonly [key: string]: unknown;
}
