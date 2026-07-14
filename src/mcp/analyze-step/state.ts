/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * State codec for the multi-turn `insrc_analyze_step` tool.
 *
 * Between turns, the server hands the outer client an opaque `state`
 * token which the client passes back verbatim on the next call. The
 * server holds the actual state payload in an in-memory store
 * (see state-store.ts) keyed by that token.
 *
 * ## History
 *
 * V1 encoded the full state payload (intent + plan + executed outputs
 * + narrow-pause blob) into a base64+gzip blob (2-5 KB) and expected
 * the client to echo it verbatim. That worked for machine-driven
 * smoke tests but broke live with Claude Code (haiku-4-5): the outer
 * LLM transcribed the base64 string character-by-character and made
 * observable mistakes -- one 'r' flipped to 'b' at position 1566 of a
 * 2612-char emitted state, plus the trailing '==' padding silently
 * dropped. Both corruptions produced zlib decode failures and killed
 * the run mid-loop.
 *
 * V2 shortens the token to 22 chars (16 random bytes, URL-safe
 * base64, no padding) and stores the actual payload server-side.
 * See state-store.ts for the store's TTL + LRU eviction contract.
 */

import type { ClassifiedIntent } from '../../shared/analyze-types.js';
import type {
	ExecutedPlan,
	ExplorationPlan,
	ExplorationType,
	StepPlanResumeState,
} from '../../analyze/explore/index.js';
import type { SynthesizerPromptKey } from '../../analyze/context/synthesizer.js';

import { loadState, saveState, StateTokenNotFound } from './state-store.js';

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

/** Bump when adding required fields. Decoder rejects unrecognised versions. */
export const STATE_VERSION = 2 as const;

export type StepStage =
	| 'awaiting_plan'    // start returned emit_plan; client should send phase='plan'
	| 'awaiting_narrow'  // stepPlan paused on a narrow-LLM exploration; client should send phase='narrow'
	| 'awaiting_bundle'; // execute done; client should send phase='bundle'

/** Extra fields the state blob carries while `stepPlan` is paused on a
 *  narrow-LLM exploration. Rehydrated on the phase='narrow' turn so
 *  the finalizer + resume knows where it left off. */
export interface NarrowPause {
	readonly explorationId:   string;
	readonly explorationType: ExplorationType;
	/** Runner-specific opaque blob the finalize step needs. */
	readonly preparedBlob:    unknown;
	/** Multi-turn executor's resume state: prior results + outputs. */
	readonly resumeState:     StepPlanResumeState;
}

export interface StepStatePayload {
	readonly version:        typeof STATE_VERSION;
	readonly runId:          string;
	readonly repoPath:       string;
	/** Repo watermark at the moment of `start`. Invalidates the run if
	 *  the repo re-indexes mid-loop. */
	readonly repoIndexedAt:  number | null;
	readonly intent:         ClassifiedIntent;
	/** Which synthesizer prompt key this run resolves to
	 *  (code | docs | data | infra | adherence | capability). Baked in
	 *  at `start` so the `plan` handler doesn't need to re-derive it. */
	readonly synthesizerKey: SynthesizerPromptKey;
	/** The exploration plan the client emitted on the previous
	 *  `plan` phase. Present in the `awaiting_narrow` and
	 *  `awaiting_bundle` stages. */
	readonly plan?:          ExplorationPlan;
	/** The full ExecutedPlan captured after the `plan` phase ran the
	 *  deterministic + server-side narrow-LLM explorations. Present
	 *  in the `awaiting_bundle` stage. */
	readonly executed?:      ExecutedPlan;
	/** Present while the multi-turn executor is paused on a narrow-LLM
	 *  exploration. The next `phase='narrow'` call finalizes the LLM
	 *  output for `narrow.explorationId` and resumes stepPlan with
	 *  `narrow.resumeState`. */
	readonly narrow?:        NarrowPause;
	readonly stage:          StepStage;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StepStateDecodeError extends Error {
	readonly code: 'malformed' | 'wrong-version' | 'wrong-stage';
	constructor(code: StepStateDecodeError['code'], msg: string) {
		super(msg);
		this.code = code;
		this.name = 'StepStateDecodeError';
	}
}

// ---------------------------------------------------------------------------
// Save / load  (V2: server-side store keyed by short opaque token)
// ---------------------------------------------------------------------------

/**
 * Save the payload server-side and return the short opaque token the
 * client should echo on the next turn. The token is 22 URL-safe
 * base64 chars derived from 16 random bytes -- short enough for the
 * outer LLM to reproduce verbatim without transcription errors.
 *
 * (Kept the `encodeState` name so the phase handlers don't need to
 * change; the on-wire shape changed underneath.)
 */
export function encodeState(payload: StepStatePayload): string {
	if (payload.version !== STATE_VERSION) {
		throw new StepStateDecodeError(
			'wrong-version',
			`encodeState: payload version ${String(payload.version)} != expected ${STATE_VERSION}`,
		);
	}
	return saveState(payload);
}

/**
 * Look up the payload for a state token. Returns the STORED payload
 * verbatim -- no re-parsing, no re-decompressing. Throws
 * StepStateDecodeError on unknown tokens (server restarted, TTL
 * expired, malformed token shape).
 */
export function decodeState(token: string): StepStatePayload {
	if (typeof token !== 'string' || token.length < 8 || token.length > 128) {
		throw new StepStateDecodeError(
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
			throw new StepStateDecodeError('malformed', err.message);
		}
		throw err;
	}
}

// ---------------------------------------------------------------------------
// Stage assertion helpers
// ---------------------------------------------------------------------------

export function assertStage(payload: StepStatePayload, expected: StepStage): void {
	if (payload.stage !== expected) {
		throw new StepStateDecodeError(
			'wrong-stage',
			`state stage='${payload.stage}'; expected '${expected}'. ` +
			`The client called insrc_analyze_step out of order -- restart with phase='start'.`,
		);
	}
}
