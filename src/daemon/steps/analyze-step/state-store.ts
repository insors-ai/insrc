/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Server-side state store for `insrc_analyze_step`.
 *
 * ## Why this exists
 *
 * The V1 design encoded the full state payload (intent + plan +
 * executed outputs + narrow-pause blob) into a base64+gzip blob and
 * handed it back to the client to echo on the next turn. That's
 * stateless server-side but assumed the client could reproduce a
 * multi-KB base64 string verbatim across turns.
 *
 * Live-tested 2026-07-10 with Claude Code (haiku-4-5): the LLM
 * transcribed the state token character-by-character and made
 * observable mistakes -- one 'r' flipped to 'b' at position 1566 of
 * a 2612-char emitted state, plus the trailing base64 '==' padding
 * silently dropped. Both corruptions produced zlib decode failures
 * ('invalid distance too far back' / 'incorrect data check') and
 * killed the multi-turn run.
 *
 * The fix is to hold the actual state server-side, keyed by a short
 * opaque token the model can reproduce reliably. Token: 16 random
 * bytes rendered as URL-safe base64 (22 chars, no padding). Same
 * shape a session id would take.
 *
 * ## Trade-offs
 *
 * - Server becomes stateful within a single MCP subprocess lifetime.
 *   Daemon restart mid-run kills active runs -- symmetric with the
 *   Ollama-path failure mode (lose the in-progress LLM call).
 * - Memory grows with concurrent runs. Guarded by LRU cap +
 *   TTL sweep on every write.
 * - Every client of the daemon shares the store. They
 *   see each other's tokens as opaque strings -- no leakage because
 *   the token is unguessable.
 */

import { getStepStateStore } from '../../threads/step-state.js';
import type { StepStatePayload } from './state.js';

// The entries live in the daemon's shared step-state store (Epic 86197ac6
// s1), kind 'analyze': its 100-entry LRU cap and 1-hour TTL sweep on every
// save keep pathological loops from growing it unbounded, and a run resumes
// on whichever thread serves the next turn.

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store the payload under a freshly-generated token and return the
 * token. Runs a TTL + LRU sweep before insertion so pathological
 * loops can't grow the store unbounded.
 */
export function saveState(payload: StepStatePayload): Promise<string> {
	return getStepStateStore().mint('analyze', payload);
}

/**
 * Look up a state by token. Throws `StateTokenNotFound` when the
 * token is unknown (client is holding a token from a prior daemon
 * process, or the entry was evicted).
 */
export async function loadState(token: string): Promise<StepStatePayload> {
	const entry = await getStepStateStore().read<StepStatePayload>('analyze', token);
	if (entry === undefined) {
		throw new StateTokenNotFound(
			`state token '${token}' not found: the insrc daemon was restarted (runs are held in its memory and a restart loses them), ` +
			`the token went unused for an hour, or the run was already completed. Start the run again with phase='start'.`,
		);
	}
	return entry.payload;
}

/**
 * Discard the state under a token. Called once the run reaches
 * next='done' so completed runs don't pin memory. Not an error if
 * the token is already gone.
 */
export function releaseState(token: string): Promise<void> {
	return getStepStateStore().release('analyze', token);
}

/**
 * Mint the next-turn token for `payload` AND release the superseded
 * `previousToken` in one call — the release-superseded-on-save primitive that
 * keeps an active run to ~1 live entry regardless of turn count (so a long
 * turn-by-turn run never crowds itself out of the LRU cap). Mint-BEFORE-release:
 * the new token is saved first, so a failure never leaves the run with zero live
 * tokens; the previous entry is dropped only when `previousToken` is defined AND
 * distinct from the freshly-minted token. `previousToken === undefined` behaves
 * exactly like saveState (mirrors the workflow-step store primitive).
 */
export function replaceState(previousToken: string | undefined, payload: StepStatePayload): Promise<string> {
	return getStepStateStore().update('analyze', previousToken, payload);
}

/** For unit tests: wipe every entry. */
export function _clearStateStoreForTests(): Promise<void> {
	return getStepStateStore().clearForTests('analyze');
}

/** For unit tests + observability. */
export function _stateStoreSize(): Promise<number> {
	return getStepStateStore().sizeForTests('analyze');
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StateTokenNotFound extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'StateTokenNotFound';
	}
}
