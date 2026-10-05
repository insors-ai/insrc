/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_review_step` phase='findings' handler — the DESIGN-review path.
 *
 * For an HLD or LLD, `start` hands the controller the review template instead
 * of the extract prompt. The controller checks every item with its own tools
 * and answers once; this phase validates that answer with the SAME validator
 * the reviewer session uses (`validateTemplateAnswer`) and stamps the review.
 *
 * A rejected answer stamps nothing and keeps the run's state, so the controller
 * can correct it and call `findings` again.
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from '../../../shared/logger.js';
import { writeAtomic } from '../../../workflow/storage.js';
import {
	computeReviewVerdict, DEFAULT_BLOCK_ON_SEVERITIES, pendingUserFindings, renderReviewReport, REVIEW_SECTION,
	reviewTemplateFor, stripReviewSection, tallyFindings, validateTemplateAnswer,
} from '../../../workflow/review/index.js';
import type { ReviewReport } from '../../../workflow/review/index.js';
import { loadState, releaseState } from '../state-store.js';
import type { ReviewStepDone, ReviewStepError, ReviewStepInputFindings } from '../types.js';

const log = getLogger('mcp:review-step:findings');

const REVIEW_MODEL = 'client';

export function handleFindings(input: ReviewStepInputFindings): ReviewStepDone | ReviewStepError {
	if (typeof input.state !== 'string' || input.state.length === 0) {
		throw new Error(`insrc_review_step[findings]: missing \`state\` token from the prior start response.`);
	}
	const state = loadState(input.state);
	if (state.templateIntent === undefined) {
		throw new Error(
			`insrc_review_step[findings]: this run reviews a ${state.stage} artifact, which is not a design document — ` +
			`call phase='claims' then phase='verdicts'.`,
		);
	}

	const template = reviewTemplateFor(state.templateIntent);
	const result = validateTemplateAnswer(template, input.findings);
	if (!result.ok) {
		log.warn({ runId: state.runId, template: template.id, errors: result.errors.length }, 'insrc_review_step[findings]: answer rejected; nothing stamped');
		return {
			next: 'error',
			error: {
				code: 'invalid-findings',
				message:
					`The answer does not satisfy checklist ${template.id}; nothing was stamped. Correct it and call ` +
					`phase='findings' again with the same state.\n` + result.errors.map(e => `- ${e}`).join('\n'),
				retryable: true,
			},
		};
	}

	const findings = result.findings;
	const report: ReviewReport = {
		artifact:   state.stage,
		stage:      state.stage,
		verdict:    computeReviewVerdict(findings, DEFAULT_BLOCK_ON_SEVERITIES),
		findings,
		counts:     tallyFindings(findings),
		template:   template.id,
		reviewedAt: new Date().toISOString(),
		model:      REVIEW_MODEL,
		// These phases are the controller's review.
		reviewedBy: 'controller',
	};

	if (!existsSync(state.jsonPath)) throw new Error(`insrc_review_step[findings]: no artifact json at ${state.jsonPath}`);
	if (!existsSync(state.mdPath))   throw new Error(`insrc_review_step[findings]: no artifact md at ${state.mdPath}`);

	// A design is not edited by its review: stamp meta.review and append the
	// rendered report; the body is written back untouched.
	const artifact = JSON.parse(readFileSync(state.jsonPath, 'utf8')) as { meta: Record<string, unknown>; body: unknown };
	const md = stripReviewSection(readFileSync(state.mdPath, 'utf8'));
	writeAtomic(state.jsonPath, JSON.stringify({ ...artifact, meta: { ...artifact.meta, review: report } }, null, 2) + '\n');
	writeAtomic(state.mdPath, `${md.replace(/\s+$/, '')}\n\n${REVIEW_SECTION}\n\n## Review\n\n${renderReviewReport(report)}\n`);

	const pending = pendingUserFindings(report).length;
	releaseState(input.state);

	log.info(
		{ runId: state.runId, stage: state.stage, template: template.id, verdict: report.verdict, pending },
		'insrc_review_step[findings]: validated + persisted design review (model=client)',
	);

	return {
		next:     'done',
		verdict:  report.verdict,
		counts:   report.counts,
		report:   renderReviewReport(report),
		applied:  0,
		pending,
		path:     state.mdPath,
		jsonPath: state.jsonPath,
	};
}
