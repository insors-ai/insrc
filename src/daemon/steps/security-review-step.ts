/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_security_review_step` MCP/step-call handler (s3/t6), Epic
 * add-dedicated-security-reviews. Routes the request to t5's
 * handleSecurityReviewStep and nowhere else; this file's only job is the
 * JSON-RPC envelope shape (StepEnvelope: {content, isError?}) every other
 * step tool already uses.
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

function isValidRequest(input: unknown): input is SecurityReviewStepRequest {
	if (typeof input !== 'object' || input === null) return false;
	const r = input as Record<string, unknown>;
	if (r['phase'] !== 'start') return false;
	if (typeof r['state'] === 'string') return typeof r['proceed'] === 'boolean';
	return typeof r['repoPath'] === 'string' && typeof r['targets'] === 'object' && r['targets'] !== null;
}

export async function handleSecurityReviewStepCall(input: unknown): Promise<SecurityReviewStepEnvelope> {
	if (!isValidRequest(input)) {
		return errorEnvelope(
			"insrc_security_review_step: input must be { phase:'start', repoPath, targets, epicHash?, storyId? } " +
			"or { phase:'start', state, proceed }.",
		);
	}
	try {
		const response: SecurityReviewStepResponse = await handleSecurityReviewStep(input);
		return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.warn({ err: message }, 'insrc_security_review_step: dispatch error');
		return errorEnvelope(message);
	}
}
