/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Top-level dispatcher for `insrc_review_step` — the multi-turn review surface
 * for a design artifact. Mirrors `mcp/workflow-step/handler.ts`.
 *
 * The party that did not author the artifact reviews it; `start` routes by
 * author. Daemon-authored: the controller's loop,
 * start → emit_claims → claims → emit_verdicts → verdicts → done
 * (start → emit_findings → findings → done for an HLD or LLD), where the server
 * does the DETERMINISTIC parts (read artifact, gather evidence, assemble +
 * persist the report) and the CONTROLLER emits the claims + verdicts. Anything
 * else: `start` asks the daemon to review and returns its verdict as `done`.
 */

import { appendFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { SamePartyReviewError } from '../../workflow/review/party.js';
import { handleClaims } from './phases/claims.js';
import { handleFindings } from './phases/findings.js';
import { handleStart } from './phases/start.js';
import { handleVerdicts } from './phases/verdicts.js';
import type {
	ReviewStepDeps,
	ReviewStepInput,
	ReviewStepMcpEnvelope,
	ReviewStepOutput,
	ReviewStepError,
} from './types.js';

const TRACE_PATH = process.env['INSRC_REVIEW_STEP_TRACE'];

const log = getLogger('mcp:review-step:handler');

export async function handleReviewStep(input: unknown, deps: ReviewStepDeps = {}): Promise<ReviewStepMcpEnvelope> {
	const result = await dispatch(input, deps);
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

async function dispatch(input: unknown, deps: ReviewStepDeps): Promise<ReviewStepOutput> {
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
			case 'start':    return await handleStart(step, deps);
			case 'claims':   return await handleClaims(step);
			case 'verdicts': return handleVerdicts(step);
			case 'findings': return handleFindings(step);
			default:
				return errorResult(
					'bad-phase',
					`insrc_review_step: unknown phase '${(step as { phase: string }).phase}'. ` +
					`Expected 'start' | 'claims' | 'verdicts' | 'findings'.`,
					false,
				);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.warn({ phase: step.phase, err: msg }, 'insrc_review_step: uncaught error');
		return errorResult(err instanceof SamePartyReviewError ? 'same-party-review' : 'internal', msg, false);
	}
}

function errorResult(code: string, message: string, retryable: boolean): ReviewStepError {
	return {
		next:  'error',
		error: { code, message, retryable },
	};
}
