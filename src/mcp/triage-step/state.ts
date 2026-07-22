/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Opaque state token for `insrc_triage`. The payload (focus + repo + runId) is
 * tiny and carries no server-side handle, so it rides base64 JSON in the token
 * itself — no store to persist or GC between the two turns.
 */

import type { TriageState } from './types.js';

export function encodeState(state: TriageState): string {
	return Buffer.from(JSON.stringify(state), 'utf8').toString('base64');
}

export function decodeState(token: string): TriageState {
	let parsed: unknown;
	try {
		parsed = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
	} catch {
		throw new Error(`insrc_triage: state token is not valid base64 JSON.`);
	}
	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(`insrc_triage: decoded state is not an object.`);
	}
	const s = parsed as Partial<TriageState>;
	if (typeof s.runId !== 'string' || typeof s.focus !== 'string' || typeof s.repo !== 'string') {
		throw new Error(`insrc_triage: state token missing runId/focus/repo.`);
	}
	return { runId: s.runId, focus: s.focus, repo: s.repo };
}
