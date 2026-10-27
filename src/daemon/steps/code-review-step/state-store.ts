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
import { codeReviewOperations } from '../../code-review-operations.js';
import type { CodeReviewOperationRegistry } from '../../code-review-operations.js';
import type { CodeReviewPendingState } from './types.js';
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

const leases = new Map<string, () => void>();
export async function savePendingState(payload: CodeReviewPendingState, registry: CodeReviewOperationRegistry = codeReviewOperations): Promise<string> {
 const store = getStepStateStore();
 const token = await store.mint('code-review', payload, Number.MAX_SAFE_INTEGER);
 try {
  const unsubscribe = registry.watchLease(payload.reviewHandle, payload, until => {
   void store.pin('code-review', token, until).catch(() => { leases.get(token)?.(); leases.delete(token); });
  }, () => { leases.delete(token); void store.release('code-review', token); });
  leases.set(token, unsubscribe);
  return token;
 } catch (err) { await store.release('code-review', token); throw err; }
}
export function releaseState(token: string): Promise<void> {
 leases.get(token)?.(); leases.delete(token);
	return getStepStateStore().release('code-review', token);
}

export function _clearCodeReviewStateStoreForTests(): Promise<void> {
	for (const unsubscribe of leases.values()) unsubscribe(); leases.clear();
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

export function saveControllerState(payload: import('./controller-pipeline.js').ControllerPipelineState): Promise<string> {
 return getStepStateStore().mint('code-review', payload, payload.timing.deadlineAt + 600_000);
}
export async function replaceControllerState(token: string, revision: number, payload: import('./controller-pipeline.js').ControllerPipelineState): Promise<void> {
 if (!await getStepStateStore().compareReplace('code-review', token, revision, payload)) throw new Error('Controller state changed concurrently or expired');
 if (payload.terminal !== undefined) await getStepStateStore().pin('code-review', token, Date.now() + 600_000);
}
const controllerLocks = new Map<string, Promise<void>>();
/** Serializes deterministic transitions and final publication; CAS remains authoritative in the shared store. */
export async function withControllerStateLock<T>(token: string, run: () => Promise<T>): Promise<T> {
 const prior = controllerLocks.get(token) ?? Promise.resolve();
 let release!: () => void;
 const current = new Promise<void>(resolve => { release = resolve; });
 controllerLocks.set(token, current);
 await prior;
 try { return await run(); }
 finally { release(); if (controllerLocks.get(token) === current) controllerLocks.delete(token); }
}
