/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Server-side state store for `insrc_workflow_step`.
 *
 * Structurally identical to `mcp/analyze-step/state-store.ts` —
 * same 22-char opaque tokens, same LRU + TTL sweep, same
 * `StateTokenNotFound` semantics. Kept module-local (not shared
 * with analyze) because the state payload shape differs and the
 * TTLs / capacities may drift in the future.
 *
 * See docstring in `mcp/analyze-step/state-store.ts` for the full
 * rationale on why we store server-side rather than round-tripping
 * a blob through the outer LLM.
 */

import { randomBytes } from 'node:crypto';

import { getLogger } from '../../shared/logger.js';
import type { WorkflowStepStatePayload } from './state.js';

const log = getLogger('mcp:workflow-step:state-store');

const MAX_ENTRIES = 100;
const TTL_MS      = 60 * 60 * 1_000;

interface Entry {
	readonly payload:   WorkflowStepStatePayload;
	readonly createdAt: number;
	touchedAt:          number;
}

const store = new Map<string, Entry>();

export function saveState(payload: WorkflowStepStatePayload): string {
	sweep();
	const now = Date.now();
	const token = mintToken();
	store.set(token, { payload, createdAt: now, touchedAt: now });
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
			`workflow state token '${token}' not found: server restarted, TTL expired, ` +
			`or the run was already completed. Restart with phase='start'.`,
		);
	}
	entry.touchedAt = Date.now();
	return entry.payload;
}

export function releaseState(token: string): void {
	store.delete(token);
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
