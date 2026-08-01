/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * State codec for `insrc_workflow_step`. The MCP tool holds the
 * actual state server-side (keyed by a 22-char opaque token) and
 * hands the token to the outer LLM to echo verbatim across turns.
 *
 * See `mcp/analyze-step/state.ts` for the V1→V2 story behind the
 * token approach.
 */

import type {
	ExecutorState,
	WorkflowIntent,
} from '../../workflow/types.js';

import { loadState, saveState, StateTokenNotFound } from './state-store.js';

export const STATE_VERSION = 1 as const;

/** Stage names track the phases the outer LLM walks through. */
export type WorkflowStepStage =
	| 'awaiting_plan'          // start returned emit_plan
	| 'awaiting_llm_step'      // executor is paused on an llm-pause runner
	| 'awaiting_synthesize';   // all steps done; client should emit the artifact

/** Per-run elicitation continuation state for the `brainstorm` stage
 *  (Epic `frame-epic-new-pre-workflow-brainstorm`, sc3). Carried INSIDE the
 *  existing WorkflowStepStatePayload so it rides the existing state-store
 *  save/load/release opaque-token machinery — no new store, no new field (k9).
 *  S001 defined the shape + wiring; S003 (Phase B — convergence) pins its
 *  semantics as the running mirror of the `elicit` runner's convergence:
 *   - `workingStatement` — the current understanding, folded from the user's
 *     answers and shown back every turn (ac2);
 *   - `answered` — the points already settled, so they are never re-asked (ac1);
 *   - `openQuestions` — the still-unresolved gaps (mirrors the runner's
 *     `openItems`), which the next turn probes (ac4).
 *  The shape is unchanged from S001 and round-trips through the state-store
 *  byte-for-byte across every paused convergence turn; only the meaning is now
 *  load-bearing rather than a placeholder. */
export interface BrainstormElicitState {
	readonly workingStatement: string;
	readonly answered:         readonly string[];
	readonly openQuestions:    readonly string[];
}

export interface WorkflowStepStatePayload {
	readonly version:  typeof STATE_VERSION;
	readonly runId:    string;
	/** Trace-log directory key. Epic-scoped workflows key by the
	 *  16-char Epic hash; `stub` uses a display slug from the focus. */
	readonly epicKey:  string;
	readonly startedAtMs: number;
	readonly intent:   WorkflowIntent;
	/** Full executor state; kept as an ExecutorState so resume /
	 *  synthesize turns can pick up exactly where the executor
	 *  left off. */
	readonly executor?: ExecutorState;
	/** Present in `awaiting_synthesize`: the finalized step outputs
	 *  the synthesizer prompt renders. */
	readonly stepOutputs?: Readonly<Record<string, unknown>>;
	/** Present only for `brainstorm` runs: the elicitation continuation state
	 *  (sc3). Optional + additive — every existing stage leaves it unset and its
	 *  save/load round-trip is unchanged (k8/k9). */
	readonly brainstorm?: BrainstormElicitState;
	readonly stage:    WorkflowStepStage;
}

export class WorkflowStateDecodeError extends Error {
	readonly code: 'malformed' | 'wrong-version' | 'wrong-stage';
	constructor(code: WorkflowStateDecodeError['code'], msg: string) {
		super(msg);
		this.code = code;
		this.name = 'WorkflowStateDecodeError';
	}
}

export function encodeState(payload: WorkflowStepStatePayload): string {
	if (payload.version !== STATE_VERSION) {
		throw new WorkflowStateDecodeError(
			'wrong-version',
			`encodeState: payload version ${String(payload.version)} != expected ${STATE_VERSION}`,
		);
	}
	return saveState(payload);
}

export function decodeState(token: string): WorkflowStepStatePayload {
	if (typeof token !== 'string' || token.length < 8 || token.length > 128) {
		throw new WorkflowStateDecodeError(
			'malformed',
			`state token is not a valid shape (expected 22-char URL-safe base64; got ${
				typeof token === 'string' ? `length=${token.length}` : typeof token
			}).`,
		);
	}
	try {
		return loadState(token);
	} catch (err) {
		if (err instanceof StateTokenNotFound) {
			throw new WorkflowStateDecodeError('malformed', err.message);
		}
		throw err;
	}
}

export function assertStage(
	payload: WorkflowStepStatePayload,
	expected: WorkflowStepStage,
): void {
	if (payload.stage !== expected) {
		throw new WorkflowStateDecodeError(
			'wrong-stage',
			`state stage='${payload.stage}'; expected '${expected}'. ` +
			`The client called insrc_workflow_step out of order -- restart with phase='start'.`,
		);
	}
}
