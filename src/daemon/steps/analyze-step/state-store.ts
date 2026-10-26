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
 * Attached session-memory calls use a separate bounded owner/revision store below.
 * Their payloads never cross the shared worker/hub store; cancel/end invalidates
 * them, and an opaque token alone grants no access.
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

import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { assertAnalysisConnectionExecution } from '../../../analyze/connection-access.js';
import { assertSessionReuse, sessionReuseWindow } from '../../../analyze/session-reuse.js';
import { ConnectionExecutionError } from '../../../shared/step-context.js';
import type { ConnectionExecutionContext, SessionConnectionExecution } from '../../../shared/step-context.js';
import { getStepStateStore } from '../../threads/step-state.js';
import type { StepStatePayload } from './state.js';

interface PrivateState {
	readonly owner: string;
	readonly fingerprint: string;
	readonly signal: AbortSignal;
	readonly payload: StepStatePayload;
	expiresAt: number;
	timer: ReturnType<typeof setTimeout>;
}
const privateStates = new Map<string, PrivateState>();
const signalTokens = new WeakMap<AbortSignal, { readonly tokens: Set<string>; readonly abort: () => void }>();
const PRIVATE_TTL_MS = 60 * 60 * 1000;
const MAX_PRIVATE_STATES = 100;

function dropPrivate(token: string): void {
	const entry = privateStates.get(token);
	if (!entry) return;
	privateStates.delete(token);
	clearTimeout(entry.timer);
	const bucket = signalTokens.get(entry.signal);
	bucket?.tokens.delete(token);
	if (bucket?.tokens.size === 0) {
		entry.signal.removeEventListener('abort', bucket.abort);
		signalTokens.delete(entry.signal);
	}
}

async function privateEntry(token: string, execution: SessionConnectionExecution): Promise<PrivateState> {
	await assertSessionReuse(execution);
	const window = sessionReuseWindow(execution);
	const entry = privateStates.get(token);
	// Inspect only ownership metadata until the live revision check succeeds.
	if (!entry || entry.owner !== window.owner || entry.fingerprint !== window.fingerprint || entry.signal.aborted || performance.now() >= entry.expiresAt) {
		throw new ConnectionExecutionError('session-expired');
	}
	window.check();
	clearTimeout(entry.timer);
	entry.expiresAt = performance.now() + PRIVATE_TTL_MS;
	entry.timer = setTimeout(() => dropPrivate(token), PRIVATE_TTL_MS);
	entry.timer.unref();
	return entry;
}

async function mintPrivate(payload: StepStatePayload, execution: SessionConnectionExecution): Promise<string> {
	await assertSessionReuse(execution);
	if (privateStates.size >= MAX_PRIVATE_STATES) throw new ConnectionExecutionError('resource-limit');
	const window = sessionReuseWindow(execution);
	const signal = execution.lifetime.signal;
	const token = randomBytes(24).toString('base64url');
	window.check();
	const timer = setTimeout(() => dropPrivate(token), PRIVATE_TTL_MS);
	timer.unref();
	privateStates.set(token, { owner: window.owner, fingerprint: window.fingerprint, signal, payload, timer, expiresAt: performance.now() + PRIVATE_TTL_MS });
	let bucket = signalTokens.get(signal);
	if (!bucket) {
		const tokens = new Set<string>();
		const abort = () => { for (const value of [...tokens]) dropPrivate(value); };
		bucket = { tokens, abort };
		signalTokens.set(signal, bucket);
		signal.addEventListener('abort', abort, { once: true });
	}
	bucket.tokens.add(token);
	if (signal.aborted) {
		dropPrivate(token);
		throw new ConnectionExecutionError('session-expired');
	}
	return token;
}

/** Private source state never enters the shared worker/hub store or its structured clone. */
export function _privateStateCountForTests(): number { return privateStates.size; }

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
export function saveState(payload: StepStatePayload, execution?: ConnectionExecutionContext): Promise<string> {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode === 'session-memory') return mintPrivate(payload, execution);
	return getStepStateStore().mint('analyze', payload);
}

/**
 * Look up a state by token. Throws `StateTokenNotFound` when the
 * token is unknown (client is holding a token from a prior daemon
 * process, or the entry was evicted).
 */
export async function loadState(token: string, execution?: ConnectionExecutionContext): Promise<StepStatePayload> {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode === 'session-memory') { const entry = await privateEntry(token, execution); sessionReuseWindow(execution).check(); return entry.payload; }
	if (privateStates.has(token)) throw new ConnectionExecutionError('session-expired');
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
export async function releaseState(token: string, execution?: ConnectionExecutionContext): Promise<void> {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode === 'session-memory') { await privateEntry(token, execution); dropPrivate(token); return; }
	if (privateStates.has(token)) throw new ConnectionExecutionError('session-expired');
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
export async function replaceState(previousToken: string | undefined, payload: StepStatePayload, execution?: ConnectionExecutionContext): Promise<string> {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode === 'session-memory') { if (previousToken !== undefined) await privateEntry(previousToken, execution); const next = await mintPrivate(payload, execution); if (previousToken !== undefined) dropPrivate(previousToken); return next; }
	if (previousToken !== undefined && privateStates.has(previousToken)) throw new ConnectionExecutionError('session-expired');
	return getStepStateStore().update('analyze', previousToken, payload);
}

/** For unit tests: wipe every entry. */
export function _clearStateStoreForTests(): Promise<void> {
	for (const token of [...privateStates.keys()]) dropPrivate(token);
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
