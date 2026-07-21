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

import { getLogger } from '../../../shared/logger.js';
import {
	buildVerifyPrompt, gatherEvidence, normalizeClaimsEnvelope, renderEvidence,
} from '../../../workflow/review/index.js';
import type { Claim, Evidence } from '../../../workflow/review/types.js';
import { VERDICTS_SCHEMA } from '../schema.js';
import { loadState, updateState } from '../state-store.js';
import type { ReviewStepEmitVerdicts, ReviewStepInputClaims } from '../types.js';

const log = getLogger('mcp:review-step:claims');

export async function handleClaims(input: ReviewStepInputClaims): Promise<ReviewStepEmitVerdicts> {
	if (typeof input.state !== 'string' || input.state.length === 0) {
		throw new Error(`insrc_review_step[claims]: missing \`state\` token from the prior start response.`);
	}
	const state = loadState(input.state);

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

/** Compose ONE batched judge prompt covering every claim. The judge SYSTEM is
 *  claim-independent; the user body is the per-claim premise+evidence blocks
 *  (each headed by its claimId) at the tail (CLAUDE.md rule 7). */
function buildBatchedVerifyPrompt(
	claims:   readonly Claim[],
	evidence: readonly Evidence[],
): { system: string; user: string } {
	const evidenceById = new Map(evidence.map(e => [e.claimId, e] as const));
	const sampleClaim: Claim = claims[0] ?? { id: '', kind: 'semantic', text: '', anchors: [], probe: {} };
	const sampleEv: Evidence = evidenceById.get(sampleClaim.id) ?? { claimId: sampleClaim.id, grepResults: [], reads: [] };
	const baseSystem = buildVerifyPrompt(sampleClaim, sampleEv).system;

	const system = [
		baseSystem,
		'',
		'You are judging MULTIPLE premises in one turn. Emit ONE verdict per premise as',
		'an array under `verdicts`; each verdict MUST carry the `claimId` it judges so it',
		'can be keyed back to its premise. Judge each premise ONLY against ITS OWN evidence',
		'block below — never borrow grounding across premises.',
	].join('\n');

	const blocks = claims.map((c) => {
		const ev = evidenceById.get(c.id) ?? { claimId: c.id, grepResults: [], reads: [] };
		return `### CLAIM ${c.id}\n\n${renderEvidence(c, ev)}`;
	});

	const user = [
		`Judge all ${claims.length} premise(s) below. Emit the verdicts JSON now.`,
		'',
		blocks.join('\n\n'),
	].join('\n');

	return { system, user };
}
