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
 * - Two clients over the same MCP subprocess share the store. They
 *   see each other's tokens as opaque strings -- no leakage because
 *   the token is unguessable.
 */

import { randomBytes } from 'node:crypto';

import { getLogger } from '../../shared/logger.js';
import type { StepStatePayload } from './state.js';

const log = getLogger('mcp:analyze-step:state-store');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Cap on live entries. LRU eviction runs when a new entry lands on a
 *  full store. 100 concurrent runs per MCP subprocess is far above
 *  any real workload. */
const MAX_ENTRIES = 100;

/** How long a stale entry lives. Sweep runs on every save. */
const TTL_MS = 60 * 60 * 1_000;   // 1 hour

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface Entry {
	readonly payload:   StepStatePayload;
	// Millisecond timestamps for TTL + LRU.
	readonly createdAt: number;
	touchedAt:          number;
}

const store = new Map<string, Entry>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store the payload under a freshly-generated token and return the
 * token. Runs a TTL + LRU sweep before insertion so pathological
 * loops can't grow the store unbounded.
 */
export function saveState(payload: StepStatePayload): string {
	sweep();
	const now = Date.now();
	const token = mintToken();
	store.set(token, { payload, createdAt: now, touchedAt: now });
	// Observability: cheap gauge on store health. If this climbs
	// past MAX_ENTRIES/2 sustained, someone is leaving runs open --
	// probably a client that stops mid-loop without ever hitting
	// phase='bundle' (which releases the entry).
	if (store.size >= MAX_ENTRIES / 2) {
		log.warn(
			{ size: store.size, cap: MAX_ENTRIES, stage: payload.stage, runId: payload.runId },
			'state-store: entries approaching cap',
		);
	}
	return token;
}

/**
 * Look up a state by token. Throws `StateTokenNotFound` when the
 * token is unknown (client is holding a token from a prior daemon
 * process, or the entry was evicted).
 */
export function loadState(token: string): StepStatePayload {
	const entry = store.get(token);
	if (entry === undefined) {
		throw new StateTokenNotFound(
			`state token '${token}' not found: server restarted, TTL expired, ` +
			`or the run was already completed. Restart with phase='start'.`,
		);
	}
	entry.touchedAt = Date.now();
	return entry.payload;
}

/**
 * Discard the state under a token. Called once the run reaches
 * next='done' so completed runs don't pin memory. Not an error if
 * the token is already gone.
 */
export function releaseState(token: string): void {
	store.delete(token);
}

/** For unit tests: wipe every entry. */
export function _clearStateStoreForTests(): void {
	store.clear();
}

/** For unit tests + observability. */
export function _stateStoreSize(): number {
	return store.size;
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mintToken(): string {
	// URL-safe base64. 16 bytes -> 22 chars, no padding. This is the
	// shape the outer LLM has to reproduce verbatim across tool calls,
	// so we want it short + character-class-uniform (no `=`, no `+/`,
	// no leading whitespace ambiguity).
	return randomBytes(16)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

function sweep(): void {
	const now = Date.now();
	// (1) Drop TTL-expired entries.
	for (const [k, v] of store) {
		if (now - v.touchedAt > TTL_MS) store.delete(k);
	}
	// (2) LRU cap. If still over, evict the least-recently-touched.
	if (store.size >= MAX_ENTRIES) {
		const arr = [...store.entries()].sort(
			(a, b) => a[1].touchedAt - b[1].touchedAt,
		);
		while (store.size >= MAX_ENTRIES && arr.length > 0) {
			const [k] = arr.shift()!;
			store.delete(k);
		}
	}
}
