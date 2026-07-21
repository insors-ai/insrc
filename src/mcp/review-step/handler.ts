/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Top-level dispatcher for `insrc_review_step` — the controller-driven,
 * multi-turn review surface. Mirrors `mcp/workflow-step/handler.ts`.
 *
 * Loop: start → emit_claims → claims → emit_verdicts → verdicts → done.
 * The server does the DETERMINISTIC parts (read artifact, gather evidence,
 * assemble + persist the report); the CONTROLLER emits the claims + verdicts.
 */

import { appendFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { handleClaims } from './phases/claims.js';
import { handleStart } from './phases/start.js';
import { handleVerdicts } from './phases/verdicts.js';
import type {
	ReviewStepInput,
	ReviewStepMcpEnvelope,
	ReviewStepOutput,
	ReviewStepError,
} from './types.js';

const TRACE_PATH = process.env['INSRC_REVIEW_STEP_TRACE'];

const log = getLogger('mcp:review-step:handler');

export async function handleReviewStep(input: unknown): Promise<ReviewStepMcpEnvelope> {
	const result = await dispatch(input);
	if (TRACE_PATH !== undefined) {
		try {
			appendFileSync(TRACE_PATH, JSON.stringify({ input, output: result }) + '\n', 'utf8');
		} catch { /* trace is best-effort */ }
	}
	return {
		content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
		...(result.next === 'error' ? { isError: true } : {}),
	};
}

async function dispatch(input: unknown): Promise<ReviewStepOutput> {
	if (typeof input !== 'object' || input === null || !('phase' in input)) {
		return errorResult(
			'bad-input',
			'insrc_review_step: input must be an object with a `phase` field.',
			false,
		);
	}
	const step = input as ReviewStepInput;
	try {
		switch (step.phase) {
			case 'start':    return handleStart(step);
			case 'claims':   return await handleClaims(step);
			case 'verdicts': return handleVerdicts(step);
			default:
				return errorResult(
					'bad-phase',
					`insrc_review_step: unknown phase '${(step as { phase: string }).phase}'. ` +
					`Expected 'start' | 'claims' | 'verdicts'.`,
					false,
				);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ phase: step.phase, err: msg }, 'insrc_review_step: uncaught error');
		return errorResult('internal', msg, false);
	}
}

function errorResult(code: string, message: string, retryable: boolean): ReviewStepError {
	return {
		next:  'error',
		error: { code, message, retryable },
	};
}
