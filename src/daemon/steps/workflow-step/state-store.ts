/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Server-side state store for `insrc_workflow_step`.
 *
 * Structurally identical to `daemon/steps/analyze-step/state-store.ts` —
 * same 22-char opaque tokens, same LRU + TTL sweep, same
 * `StateTokenNotFound` semantics, under its own step kind.
 *
 * See docstring in `daemon/steps/analyze-step/state-store.ts` for the full
 * rationale on why we store server-side rather than round-tripping
 * a blob through the outer LLM.
 */

import { getStepStateStore } from '../../threads/step-state.js';
import type { WorkflowStepStatePayload } from './state.js';

// The entries live in the daemon's shared step-state store (Epic 86197ac6
// s1), kind 'workflow': a run resumes on whichever thread serves the next turn.

export function saveState(payload: WorkflowStepStatePayload): Promise<string> {
	return getStepStateStore().mint('workflow', payload);
}

export async function loadState(token: string): Promise<WorkflowStepStatePayload> {
	const entry = await getStepStateStore().read<WorkflowStepStatePayload>('workflow', token);
	if (entry === undefined) {
		throw new StateTokenNotFound(
			`workflow state token '${token}' not found: the insrc daemon was restarted (runs are held in its memory and a restart loses them), ` +
			`the token went unused for an hour, or the run was already completed. Start the run again with phase='start'.`,
		);
	}
	return entry.payload;
}

export function releaseState(token: string): Promise<void> {
	return getStepStateStore().release('workflow', token);
}

/**
 * Mint the next-turn token for `payload` AND release the superseded
 * `previousToken` in one call — the release-superseded-on-save primitive that
 * keeps an active run to ~1 live entry regardless of turn count (so a long
 * turn-by-turn run never crowds itself out of the LRU cap). Mint-BEFORE-release:
 * the new token is saved first, so a failure never leaves the run with zero live
 * tokens; the previous entry is dropped only when `previousToken` is defined AND
 * distinct from the freshly-minted token (never deletes the just-minted one).
 * `previousToken === undefined` (the first save) behaves exactly like saveState.
 */
export function replaceState(previousToken: string | undefined, payload: WorkflowStepStatePayload): Promise<string> {
	return getStepStateStore().update('workflow', previousToken, payload);
}

export function _clearWorkflowStateStoreForTests(): Promise<void> {
	return getStepStateStore().clearForTests('workflow');
}

export function _workflowStateStoreSize(): Promise<number> {
	return getStepStateStore().sizeForTests('workflow');
}

export class StateTokenNotFound extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'StateTokenNotFound';
	}
}
