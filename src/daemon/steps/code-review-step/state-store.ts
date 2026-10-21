/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Server-side state store for `insrc_code_review_step` (code-review S008).
 *
 * Structurally identical to `daemon/steps/review-step/state-store.ts` — an opaque
 * 22-char token → server-side run state (the resolved subject + grounding),
 * with an LRU + TTL sweep. The state itself is NOT round-tripped through the
 * outer LLM; only the token travels in the response `state` field (ac2).
 */

import { getStepStateStore } from '../../threads/step-state.js';
import type { CodeReviewStepStatePayload } from './types.js';

// The entries live in the daemon's shared step-state store (Epic 86197ac6
// s1), kind 'code-review': each stage consumes its token and mints the next.

export function saveState(payload: CodeReviewStepStatePayload): Promise<string> {
	return getStepStateStore().mint('code-review', payload);
}

export async function loadState(token: string): Promise<CodeReviewStepStatePayload> {
	const entry = await getStepStateStore().read<CodeReviewStepStatePayload>('code-review', token);
	if (entry === undefined) {
		throw new StateTokenNotFound(
			`code-review state token '${token}' not found: the insrc daemon was restarted (runs are held in its memory and a restart loses them), ` +
			`the token went unused for an hour, or the run was already completed. Start the run again with phase='start'.`,
		);
	}
	return entry.payload;
}

export function releaseState(token: string): Promise<void> {
	return getStepStateStore().release('code-review', token);
}

export function _clearCodeReviewStateStoreForTests(): Promise<void> {
	return getStepStateStore().clearForTests('code-review');
}

export function _codeReviewStateStoreSize(): Promise<number> {
	return getStepStateStore().sizeForTests('code-review');
}

export class StateTokenNotFound extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'StateTokenNotFound';
	}
}
