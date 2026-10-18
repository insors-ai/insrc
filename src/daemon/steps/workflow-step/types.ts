/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Input / output shapes for `insrc_workflow_step`.
 *
 * See docs/plans/workflow-implementation.md §7.2 for the protocol.
 */

import type { IssueReadiness } from '../../../workflow/draft-issues.js';
import type { WorkflowName, WorkflowPlan } from '../../../workflow/types.js';

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type WorkflowStepPhase =
	| 'start'
	| 'plan'
	| 'step'
	| 'synthesize'
	| 'resolve_question'
	| 'review_deferred'
	| 'park'
	| 'resume';

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

/** Hand the unit's unfinished work to whoever takes it over: commit the drafts and a checkpoint of the run to the handoff branch. */
export interface WorkflowStepInputPark {
	readonly phase:     'park';
	readonly epicHash:  string;
	readonly storyId?:  string | undefined;
	readonly repo?:     string | undefined;
	/** The state token of the run to park; omitted, the owner's run for the unit is found. */
	readonly runToken?: string | undefined;
}

/** Take over parked work: restore it and return the turn the run stopped at (or tell the controller to start the stage afresh). */
export interface WorkflowStepInputResume {
	readonly phase:     'resume';
	readonly epicHash:  string;
	readonly storyId?:  string | undefined;
	readonly repo?:     string | undefined;
	/** The stage's workflow, when it cannot be told from the committed artifacts. */
	readonly workflow?: string | undefined;
}

export type WorkflowStepInput =
	| WorkflowStepInputStart
	| WorkflowStepInputPlan
	| WorkflowStepInputStep
	| WorkflowStepInputSynthesize
	| WorkflowStepInputResolveQuestion
	| WorkflowStepInputReviewDeferred
	| WorkflowStepInputPark
	| WorkflowStepInputResume;

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
	/** Team repos only: whether every unit of the draft has its tracker issue. */
	readonly issueReadiness?: IssueReadiness | undefined;
	/** Team repos only, and only when not ready: what the author is told (the stage cannot be claimed yet). */
	readonly notice?:  string | undefined;
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

/** The park went through: the branch the work is on and what else happened. */
export interface WorkflowStepParked {
	readonly next:           'parked';
	readonly branch:         string;
	readonly commit:         string;
	/** 'run': the checkpoint carries a run of the stage; 'draft': only the draft files travelled. */
	readonly variant:        'run' | 'draft';
	readonly noted:          boolean;
	readonly noteFailure?:   string | undefined;
	readonly cleanupWarning?: string | undefined;
}

/** The parked stage has no run to continue: start it afresh with `workflow` and `params` (`draftRestored`: its draft is back in the tree). */
export interface WorkflowStepRestart {
	readonly next:          'restart';
	readonly workflow:      string;
	readonly params:        Record<string, unknown>;
	readonly reason:        string;
	readonly draftRestored: boolean;
}

/** Nothing parked is left to take over. */
export interface WorkflowStepNothingToResume {
	readonly next:   'nothing_to_resume';
	readonly reason: string;
}

export type WorkflowStepOutput =
	| WorkflowStepEmitPlan
	| WorkflowStepEmitStep
	| WorkflowStepEmitSynthesize
	| WorkflowStepDone
	| WorkflowStepResolveQuestions
	| WorkflowStepReady
	| WorkflowStepDeferred
	| WorkflowStepParked
	| WorkflowStepRestart
	| WorkflowStepNothingToResume
	| WorkflowStepError;

// ---------------------------------------------------------------------------
// MCP envelope
// ---------------------------------------------------------------------------

export interface WorkflowStepMcpEnvelope {
	readonly content:  { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
	readonly [key: string]: unknown;
}
