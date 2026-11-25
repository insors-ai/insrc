/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_security_review_step` MCP/step-call handler (s3/t6), Epic
 * add-dedicated-security-reviews. Routes the request to t5's
 * handleSecurityReviewStep and nowhere else; this file's only job is the
 * JSON-RPC envelope shape (StepEnvelope: {content, isError?}) every other
 * step tool already uses, input validation (rejecting a malformed or
 * fresh/resumed-conflicting shape before handleSecurityReviewStep ever runs),
 * and forwarding the step host's own cancellation signal.
 */

import { getLogger } from '../../shared/logger.js';
import {
	handleSecurityReviewStep,
} from '../../workflow/security-review/handle-security-review-step.js';
import type {
	SecurityReviewStepRequest, SecurityReviewStepResponse,
} from '../../workflow/security-review/handle-security-review-step.js';

const log = getLogger('daemon:security-review-step');

export interface SecurityReviewStepEnvelope {
	readonly content: readonly { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
}

function errorEnvelope(message: string): SecurityReviewStepEnvelope {
	return { content: [{ type: 'text', text: JSON.stringify({ next: 'error', error: { message } }, null, 2) }], isError: true };
}

/**
 * Accepts ONLY an unambiguous fresh shape ({repoPath, targets}, no
 * state/proceed) or an unambiguous resumed shape ({state, proceed}, no
 * repoPath/targets) -- a request naming fields from BOTH branches is refused
 * outright as conflicting, never silently resolved by preferring one branch.
 * epicHash/storyId, when either is given on a fresh request, must be given as
 * a pair (handleSecurityReviewStep's own identity contract requires both or
 * neither -- a lone one is a malformed request, not a cue to derive instead).
 */
function isValidRequest(input: unknown): input is SecurityReviewStepRequest {
	if (typeof input !== 'object' || input === null) return false;
	const r = input as Record<string, unknown>;
	if (r['phase'] !== 'start') return false;

	const hasState = r['state'] !== undefined;
	const hasFreshFields = r['repoPath'] !== undefined || r['targets'] !== undefined;
	if (hasState) {
		if (hasFreshFields) return false; // conflicting fresh+resumed fields on one request
		return typeof r['state'] === 'string' && r['state'].length > 0 && typeof r['proceed'] === 'boolean';
	}
	if (r['proceed'] !== undefined) return false; // resumed-only field on a fresh request

	const epicHashGiven = r['epicHash'] !== undefined;
	const storyIdGiven = r['storyId'] !== undefined;
	if (epicHashGiven !== storyIdGiven) return false; // epicHash/storyId must be given as a pair

	return typeof r['repoPath'] === 'string' && r['repoPath'].length > 0
		&& typeof r['targets'] === 'object' && r['targets'] !== null
		&& (!epicHashGiven || typeof r['epicHash'] === 'string')
		&& (!storyIdGiven || typeof r['storyId'] === 'string');
}

export async function handleSecurityReviewStepCall(input: unknown, signal?: AbortSignal): Promise<SecurityReviewStepEnvelope> {
	if (!isValidRequest(input)) {
		return errorEnvelope(
			"insrc_security_review_step: input must be an unambiguous { phase:'start', repoPath, targets, epicHash?, storyId? } " +
			"(epicHash/storyId as a pair, never just one) or an unambiguous { phase:'start', state, proceed }, never a mix of both.",
		);
	}
	try {
		const response: SecurityReviewStepResponse = await handleSecurityReviewStep(input, signal);
		return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.warn({ err: message }, 'insrc_security_review_step: dispatch error');
		return errorEnvelope(message);
	}
}
