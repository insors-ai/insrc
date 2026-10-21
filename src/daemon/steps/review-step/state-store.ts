/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Server-side state store for `insrc_review_step`.
 *
 * Structurally identical to `daemon/steps/workflow-step/state-store.ts` — an opaque
 * 22-char token → server-side run state, with an LRU + TTL sweep, except that
 * the token stays the same across turns. The state
 * itself is NOT round-tripped through the outer LLM; only the token travels
 * in the response `state` field.
 */

import { getStepStateStore } from '../../threads/step-state.js';
import type { ReviewStepStatePayload } from './types.js';

// The entries live in the daemon's shared step-state store (Epic 86197ac6
// s1), kind 'review', whose token stays stable across turns.

export function saveState(payload: ReviewStepStatePayload): Promise<string> {
	return getStepStateStore().mint('review', payload);
}

export async function loadState(token: string): Promise<ReviewStepStatePayload> {
	const entry = await getStepStateStore().read<ReviewStepStatePayload>('review', token);
	if (entry === undefined) {
		throw new StateTokenNotFound(
			`review state token '${token}' not found: the insrc daemon was restarted (runs are held in its memory and a restart loses them), ` +
			`the token went unused for an hour, or the run was already completed. Start the run again with phase='start'.`,
		);
	}
	return entry.payload;
}

/** Replace the payload under an existing token in place (keeps the token
 *  stable across turns). */
export async function updateState(token: string, payload: ReviewStepStatePayload): Promise<void> {
	try {
		await getStepStateStore().update('review', token, payload);
	} catch (err) {
		// The shared store's miss, raised here or re-raised across the hub under its name.
		if ((err as Error | undefined)?.name !== 'StepStateNotFound') throw err;
		throw new StateTokenNotFound(
			`review state token '${token}' not found while updating: the insrc daemon was restarted, the token went unused for an hour, ` +
			`or the run was already completed. Start the run again with phase='start'.`,
		);
	}
}

export function releaseState(token: string): Promise<void> {
	return getStepStateStore().release('review', token);
}

export function _clearReviewStateStoreForTests(): Promise<void> {
	return getStepStateStore().clearForTests('review');
}

export function _reviewStateStoreSize(): Promise<number> {
	return getStepStateStore().sizeForTests('review');
}

export class StateTokenNotFound extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'StateTokenNotFound';
	}
}
