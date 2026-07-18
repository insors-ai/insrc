/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Input / output shapes for `insrc_workflow_step`.
 *
 * See plans/workflow-implementation.md §7.2 for the protocol.
 */

import type { BuildAdmissionRefusal } from '../../workflow/runners/build/schemas.js';
import type { WorkflowName, WorkflowPlan } from '../../workflow/types.js';

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type WorkflowStepPhase = 'start' | 'plan' | 'step' | 'synthesize';

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

export type WorkflowStepInput =
	| WorkflowStepInputStart
	| WorkflowStepInputPlan
	| WorkflowStepInputStep
	| WorkflowStepInputSynthesize;

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
}

export interface WorkflowStepError {
	readonly next:  'error';
	readonly error: {
		readonly code:      string;
		readonly message:   string;
		readonly retryable: boolean;
	};
}

/** The `build` stage's start-turn admission refusal (Story s2, sc2/sc3).
 *  Emitted BEFORE any work list is materialized when the Story's plan is
 *  missing / unapproved / stale — a typed, serializable refusal rather than
 *  a protocol error (it is a valid outcome of a newly-registered stage, not
 *  a failure). Additive: sibling stages never emit it. */
export interface WorkflowStepRefused {
	readonly next:     'refused';
	readonly workflow: WorkflowName;
	readonly storyId:  string;
	readonly refusal:  BuildAdmissionRefusal;
}

export type WorkflowStepOutput =
	| WorkflowStepEmitPlan
	| WorkflowStepEmitStep
	| WorkflowStepEmitSynthesize
	| WorkflowStepDone
	| WorkflowStepError
	| WorkflowStepRefused;

// ---------------------------------------------------------------------------
// MCP envelope
// ---------------------------------------------------------------------------

export interface WorkflowStepMcpEnvelope {
	readonly content:  { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
	readonly [key: string]: unknown;
}
