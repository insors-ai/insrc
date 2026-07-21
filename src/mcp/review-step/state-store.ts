/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Server-side state store for `insrc_review_step`.
 *
 * Structurally identical to `mcp/workflow-step/state-store.ts` — an opaque
 * 22-char token → server-side run state, with an LRU + TTL sweep. The state
 * itself is NOT round-tripped through the outer LLM; only the token travels
 * in the response `state` field.
 */

import { randomBytes } from 'node:crypto';

import { getLogger } from '../../shared/logger.js';
import type { ReviewStepStatePayload } from './types.js';

const log = getLogger('mcp:review-step:state-store');

const MAX_ENTRIES = 100;
const TTL_MS      = 60 * 60 * 1_000;

interface Entry {
	payload:            ReviewStepStatePayload;
	readonly createdAt: number;
	touchedAt:          number;
}

const store = new Map<string, Entry>();

export function saveState(payload: ReviewStepStatePayload): string {
	sweep();
	const now = Date.now();
	const token = mintToken();
	store.set(token, { payload, createdAt: now, touchedAt: now });
	if (store.size >= MAX_ENTRIES / 2) {
		log.warn(
			{ size: store.size, cap: MAX_ENTRIES, stage: payload.stage, runId: payload.runId },
			'review-step state-store: entries approaching cap',
		);
	}
	return token;
}

export function loadState(token: string): ReviewStepStatePayload {
	const entry = store.get(token);
	if (entry === undefined) {
		throw new StateTokenNotFound(
			`review state token '${token}' not found: server restarted, TTL expired, ` +
			`or the run was already completed. Restart with phase='start'.`,
		);
	}
	entry.touchedAt = Date.now();
	return entry.payload;
}

/** Replace the payload under an existing token in place (keeps the token
 *  stable across turns). */
export function updateState(token: string, payload: ReviewStepStatePayload): void {
	const entry = store.get(token);
	if (entry === undefined) {
		throw new StateTokenNotFound(
			`review state token '${token}' not found while updating: restart with phase='start'.`,
		);
	}
	entry.payload = payload;
	entry.touchedAt = Date.now();
}

export function releaseState(token: string): void {
	store.delete(token);
}

export function _clearReviewStateStoreForTests(): void {
	store.clear();
}

export function _reviewStateStoreSize(): number {
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
