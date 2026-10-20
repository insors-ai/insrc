/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_review_step` phase='claims' handler.
 *
 * The controller has extracted the artifact's load-bearing premises. The
 * server now does the DETERMINISTIC middle pass — `gatherEvidence` re-runs
 * each claim's probes (greps + `path:line` reads) against the real source
 * tree (NO LLM here). It then hands the ground-truth evidence back to the
 * controller with a single BATCHED judge prompt: one array of verdicts,
 * one entry per claim, keyed by claimId.
 */

import { getLogger } from '../../../../shared/logger.js';
import {
	buildBatchedVerifyPrompt, gatherEvidence, normalizeClaimsEnvelope,
} from '../../../../workflow/review/index.js';
import type { Claim } from '../../../../workflow/review/types.js';
import { VERDICTS_SCHEMA } from '../schema.js';
import { loadState, updateState } from '../state-store.js';
import type { ReviewStepEmitVerdicts, ReviewStepInputClaims } from '../types.js';

const log = getLogger('mcp:review-step:claims');

export async function handleClaims(input: ReviewStepInputClaims): Promise<ReviewStepEmitVerdicts> {
	if (typeof input.state !== 'string' || input.state.length === 0) {
		throw new Error(`insrc_review_step[claims]: missing \`state\` token from the prior start response.`);
	}
	const state = loadState(input.state);
	if (state.templateIntent !== undefined) {
		throw new Error(
			`insrc_review_step[claims]: this run reviews a design document against a template — ` +
			`call phase='findings', not phase='claims'.`,
		);
	}

	const claims = normalizeClaimsEnvelope(input.claims ?? {});
	const evidence = await gatherEvidence(claims as Claim[], state.repo);
	updateState(input.state, { ...state, claims, evidence });

	const prompt = buildBatchedVerifyPrompt(claims, evidence);
	log.info({ runId: state.runId, stage: state.stage, claims: claims.length }, 'insrc_review_step[claims]: gathered evidence, emitting verdicts prompt');

	return {
		next:     'emit_verdicts',
		guidance:
			`Judge EACH premise below against ONLY its gathered evidence and emit a ` +
			`verdicts JSON (one entry per claim, keyed by claimId) matching the schema, ` +
			`then call insrc_review_step with phase="verdicts", verdicts=<your JSON>, ` +
			`state=<the state field verbatim>.`,
		prompt,
		schema:   VERDICTS_SCHEMA,
		evidence,
		state:    input.state,
	};
}
