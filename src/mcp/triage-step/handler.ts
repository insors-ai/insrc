/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Top-level dispatcher for `insrc_triage` — the controller-driven size
 * classifier + workflow-entry router. Mirrors `mcp/review-step/handler.ts`.
 *
 * Loop: start → emit_classification → classify → done. The server is
 * deterministic (build the prompt, validate the emitted result, map size →
 * route, pre-fill the next call); the CONTROLLER does the sizing, grounded on
 * its own `insrc_analyze_step` passes. See `plans/feature-triage-router.md`.
 */

import { getLogger } from '../../shared/logger.js';
import { handleStart } from './phases/start.js';
import { handleClassify } from './phases/classify.js';
import type { TriageInput, TriageMcpEnvelope, TriageOutput } from './types.js';

const log = getLogger('mcp:triage-step:handler');

export async function handleTriageStep(input: unknown): Promise<TriageMcpEnvelope> {
	const result = await dispatch(input);
	return {
		content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
		...(result.next === 'error' ? { isError: true } : {}),
	};
}

async function dispatch(input: unknown): Promise<TriageOutput> {
	if (typeof input !== 'object' || input === null || !('phase' in input)) {
		return { next: 'error', code: 'bad-input', message: 'insrc_triage: input must be an object with a `phase` field.' };
	}
	const step = input as TriageInput;
	try {
		switch (step.phase) {
			case 'start':    return await handleStart(step);
			case 'classify': return handleClassify(step);
			default:
				return { next: 'error', code: 'bad-phase', message: `insrc_triage: unknown phase '${(step as { phase?: string }).phase}'.` };
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.warn({ err: message }, 'insrc_triage: dispatch error');
		return { next: 'error', code: 'exception', message };
	}
}
