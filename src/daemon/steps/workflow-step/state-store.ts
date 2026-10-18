/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Server-side state store for `insrc_workflow_step`.
 *
 * Structurally identical to `daemon/steps/analyze-step/state-store.ts` —
 * same 22-char opaque tokens, same LRU + TTL sweep, same
 * `StateTokenNotFound` semantics. Kept module-local (not shared
 * with analyze) because the state payload shape differs and the
 * TTLs / capacities may drift in the future.
 *
 * See docstring in `daemon/steps/analyze-step/state-store.ts` for the full
 * rationale on why we store server-side rather than round-tripping
 * a blob through the outer LLM.
 */

import { randomBytes } from 'node:crypto';

import { getLogger } from '../../../shared/logger.js';
import type { WorkflowStepStatePayload } from './state.js';

const log = getLogger('mcp:workflow-step:state-store');

const MAX_ENTRIES = 100;
const TTL_MS      = 60 * 60 * 1_000;

/** An upstream artifact and the revision a run read from it when it was created. */
export interface UpstreamRevision {
	readonly artifactId: string;
	readonly revision:   number;
}

/**
 * What a run's store entry carries beside its payload: the acting user when the run was created and the
 * upstream revisions it started from. Absent for a run created when claims are not enforced.
 */
export interface RunEntryMeta {
	readonly owner?:    string | undefined;
	readonly upstream?: readonly UpstreamRevision[] | undefined;
}

interface Entry {
	readonly payload:   WorkflowStepStatePayload;
	readonly meta:      RunEntryMeta | undefined;
	readonly createdAt: number;
	touchedAt:          number;
}

const store = new Map<string, Entry>();

export function saveState(payload: WorkflowStepStatePayload, meta?: RunEntryMeta): string {
	sweep();
	const now = Date.now();
	const token = mintToken();
	store.set(token, { payload, meta, createdAt: now, touchedAt: now });
	if (store.size >= MAX_ENTRIES / 2) {
		log.warn(
			{ size: store.size, cap: MAX_ENTRIES, stage: payload.stage, runId: payload.runId },
			'workflow-step state-store: entries approaching cap',
		);
	}
	return token;
}

export function loadState(token: string): WorkflowStepStatePayload {
	const entry = store.get(token);
	if (entry === undefined) {
		throw new StateTokenNotFound(
			`workflow state token '${token}' not found: the insrc daemon was restarted (runs are held in its memory and a restart loses them), ` +
			`the token went unused for an hour, or the run was already completed. Start the run again with phase='start'.`,
		);
	}
	entry.touchedAt = Date.now();
	return entry.payload;
}

export function releaseState(token: string): void {
	store.delete(token);
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
export function replaceState(previousToken: string | undefined, payload: WorkflowStepStatePayload): string {
	// The replacement keeps the run's meta (its owner and upstream snapshot): read it before the save can sweep the old entry out.
	const meta = previousToken !== undefined ? store.get(previousToken)?.meta : undefined;
	const token = saveState(payload, meta);
	if (previousToken !== undefined && previousToken !== token) {
		releaseState(previousToken);
	}
	return token;
}

/**
 * Every live entry, most recently touched first. Reading the list changes nothing: no entry's expiry moves,
 * and an entry past its time to live is left out (not swept, so the next save does the sweeping as before).
 */
export function listStates(): readonly { token: string; payload: WorkflowStepStatePayload; meta: RunEntryMeta | undefined; touchedAt: number }[] {
	const now = Date.now();
	return [...store.entries()]
		.filter(([, e]) => now - e.touchedAt <= TTL_MS)
		.sort((a, b) => b[1].touchedAt - a[1].touchedAt || b[1].createdAt - a[1].createdAt)
		.map(([token, e]) => ({ token, payload: e.payload, meta: e.meta, touchedAt: e.touchedAt }));
}

export function _clearWorkflowStateStoreForTests(): void {
	store.clear();
}

export function _workflowStateStoreSize(): number {
	return store.size;
}

export class StateTokenNotFound extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'StateTokenNotFound';
	}
}

function mintToken(): string {
	return randomBytes(16)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

function sweep(): void {
	const now = Date.now();
	for (const [k, v] of store) {
		if (now - v.touchedAt > TTL_MS) store.delete(k);
	}
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
