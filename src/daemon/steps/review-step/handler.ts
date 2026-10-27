import { safeReviewFailure, reviewTimeoutMessage } from '../../../shared/review-failure.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Top-level dispatcher for `insrc_review_step` — the multi-turn review surface
 * for a design artifact. Mirrors `daemon/steps/workflow-step/handler.ts`.
 *
 * The party that did not author the artifact reviews it; `start` routes by
 * author. Daemon-authored: the controller's loop,
 * start → emit_claims → claims → emit_verdicts → verdicts → done
 * (start → emit_findings → findings → done for an HLD or LLD), where the server
 * does the DETERMINISTIC parts (read artifact, gather evidence, assemble +
 * persist the report) and the CONTROLLER emits the claims + verdicts. Anything
 * else: `start` asks the daemon to review and returns its verdict as `done`.
 */

import { AtomTooLargeError } from '../../../workflow/review-pipeline/pack-into-batches.js';
import { ReviewBudgetError } from '../../../workflow/review-pipeline/budget.js';
import { ReviewCoverageError } from '../../../workflow/review/exact-coverage.js';
import { ReviewTerminalError } from './terminal.js';
import { ReviewStateRefused } from '../../threads/review-state-contract.js';
import { safeReviewId } from '../../../workflow/review-pipeline/call-events.js';
import { appendFileSync } from 'node:fs';

import { getLogger } from '../../../shared/logger.js';
import { SamePartyReviewError } from '../../../workflow/review/party.js';
import { lifecycleFor } from '../../lifecycle-registry.js';
import { handleClaims } from './phases/claims.js';
import { handleFindings } from './phases/findings.js';
import { handleStart } from './phases/start.js';
import { handleVerdicts } from './phases/verdicts.js';
import { repoSchemaRefusalOfInput } from '../../repo-schema-guard.js';
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
			const raw = input as { phase?: unknown; reply?: { callId?: unknown } } | null;
			const phase = typeof raw?.phase === 'string' && ['start', 'claims', 'verdicts', 'findings'].includes(raw.phase) ? raw.phase : 'other';
			appendFileSync(TRACE_PATH, JSON.stringify({ phase, next: result.next, callId: typeof raw?.reply?.callId === 'string' ? safeReviewId(raw.reply.callId) : undefined, ...(result.next === 'error' ? { errorCode: result.error.code } : {}) }) + '\n', 'utf8');
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
	const refusal = repoSchemaRefusalOfInput(step);
	if (refusal !== undefined) return errorResult('repo-schema-unconverted', refusal, false);
	try {
		switch (step.phase) {
			case 'start':    return await handleStart(step, deps);
			case 'claims':   return await handleClaims(step, deps);
			case 'verdicts': return await handleVerdicts(step, deps.lifecycleFor ?? (repoPath => lifecycleFor(repoPath).service), deps);
			case 'findings': return await handleFindings(step, deps.lifecycleFor ?? (repoPath => lifecycleFor(repoPath).service), deps);
			default:
				return errorResult(
					'bad-phase',
					`insrc_review_step: unknown phase '${(step as { phase: string }).phase}'. ` +
					`Expected 'start' | 'claims' | 'verdicts' | 'findings'.`,
					false,
				);
		}
	} catch (err) {
		if (err instanceof ReviewBudgetError) { const out = errorResult(err.code, err.code, (err as { retryable?: boolean }).retryable !== false); return { ...out, error: { ...out.error, ...(err.breakdown ? { budget: err.breakdown } : {}), ...(err.context ? { context: err.context } : {}) } }; }
		if (err instanceof ReviewCoverageError || err instanceof ReviewTerminalError) return errorResult(err.code, err.code === 'review-job-timeout' ? reviewTimeoutMessage(err) : err.code, (err as { retryable?: boolean }).retryable !== false && !['review-job-timeout', 'review-budget-state-stale', 'review-source-changed', 'review-attempt-timeout'].includes(err.code));
		if ((err as { timeoutKind?: unknown } | null)?.timeoutKind === 'review-job') return errorResult('review-job-timeout', reviewTimeoutMessage(err), false);
		if (err instanceof AtomTooLargeError) return errorResult('required-context-over-budget', 'required-context-over-budget', true);
		if (err instanceof ReviewStateRefused) { const result = errorResult(err.reason, err.reason, false); return { ...result, error: { ...result.error, ...(err.evidence ? { evidence: err.evidence } : {}) } }; }
		const msg = err instanceof SamePartyReviewError ? 'This artifact was authored by the controller, so the controller cannot review it; it needs a daemon review.' : safeReviewFailure(err);
		log.warn({ phase: step.phase, errorCode: safeReviewFailure(err) }, 'insrc_review_step: uncaught error');
		return errorResult(err instanceof SamePartyReviewError ? 'same-party-review' : 'internal', msg, false);
	}
}

function errorResult(code: string, message: string, retryable: boolean): ReviewStepError {
	return {
		next:  'error',
		error: { code, message, retryable },
	};
}
