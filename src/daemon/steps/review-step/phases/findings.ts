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
 * A rejected answer records nothing and keeps the run's state, so the controller
 * can correct it and call `findings` again.
 */

import { hasControllerDesignJob, resumeControllerDesignReview } from '../controller.js';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { getLogger } from '../../../../shared/logger.js';
import type { LifecycleService } from '../../../../workflow/artifact-core/lifecycle-service.js';
import type { Actor } from '../../../../workflow/artifact-core/types.js';
import { persistReview } from '../../../../workflow/review/persist-review.js';
import {
	computeReviewVerdict, DEFAULT_BLOCK_ON_SEVERITIES, pendingUserFindings, renderReviewReport,
	reviewTemplateFor, stripReviewSection, tallyFindings, validateTemplateAnswer,
} from '../../../../workflow/review/index.js';
import type { ReviewReport } from '../../../../workflow/review/index.js';
import { authorPartyOf, SamePartyReviewError } from '../../../../workflow/review/party.js';
import { withReviewTerminal } from '../terminal.js';
import type { ReviewTerminalGuard } from '../terminal.js';
import { assertExactReviewIds } from '../../../../workflow/review/exact-coverage.js';
import { ReviewBudgetError } from '../../../../workflow/review-pipeline/budget.js';
import type { RawTemplateAnswer } from '../../../../workflow/review/template.js';
import type { ReviewStepDone, ReviewStepError, ReviewStepInputFindings, ReviewStepOutput, ReviewStepDeps, ReviewStepStatePayload } from '../types.js';
import { LifecycleConflictError } from '../../../../workflow/artifact-core/types.js';

const log = getLogger('mcp:review-step:findings');

const REVIEW_MODEL = 'client';

/** Who the store records for the controller's review, and who the lifecycle names as its reviewer. */
const REVIEWER: Actor = { id: 'insrc:review', kind: 'system', properties: {} };
const CONTROLLER: Actor = { id: 'insrc:controller', kind: 'agent', properties: {} };

export async function handleFindings(
	input: ReviewStepInputFindings,
	lifecycleFor: (repoPath: string) => LifecycleService,
	deps: ReviewStepDeps = {},
): Promise<ReviewStepOutput> {
	if (await hasControllerDesignJob(input.state)) return resumeControllerDesignReview(input, { ...deps, lifecycleFor });
	return withReviewTerminal(input, (state, answer, guard) => persistTemplateFindings(state, answer as RawTemplateAnswer, lifecycleFor, guard));
}

export async function persistTemplateFindings(state: ReviewStepStatePayload, answer: RawTemplateAnswer, lifecycleFor: (repoPath: string) => LifecycleService, guard: ReviewTerminalGuard): Promise<ReviewStepDone | ReviewStepError> {
	if (state.templateIntent === undefined) {
		throw new Error(
			`insrc_review_step[findings]: this run reviews a ${state.stage} artifact, which is not a design document — ` +
			`call phase='claims' then phase='verdicts'.`,
		);
	}

	const template = reviewTemplateFor(state.templateIntent);
	const expected = state.controller?.expectedItemIds;
	if (!expected) throw new ReviewBudgetError('review-budget-state-stale');
	assertExactReviewIds(template.items.map(item => item.id), expected, 'review-template-set-mismatch');
	const result = validateTemplateAnswer(template, answer);
	if (!result.ok) {
		log.warn({ runId: state.runId, template: template.id, errors: result.errors.length }, 'insrc_review_step[findings]: answer rejected; nothing recorded');
		return {
			next: 'error',
			error: {
				code: 'invalid-findings',
				message:
					`The answer does not satisfy checklist ${template.id}; nothing was recorded. Correct it and call ` +
					`phase='findings' again with the same state.\n` + result.errors.map(e => `- ${e}`).join('\n'),
				retryable: true,
			},
		};
	}

	const items = Array.isArray(answer?.items) ? answer.items as { item?: unknown }[] : [];
	assertExactReviewIds(expected, items.map(item => item?.item), 'review-template-set-mismatch');

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

	// The head is checked (and any write a crash left staged is finished) BEFORE it is read, as in the verdicts phase.
	const artifactId = basename(state.jsonPath).replace(/\.json$/, '');
	const lifecycle = lifecycleFor(state.repo);
	guard.beginSideEffects();
	const seen = await lifecycle.inspect(artifactId);
	guard.assertActive();
	if (seen !== undefined && !seen.integrity.ok) throw new LifecycleConflictError(artifactId, seen.integrity.reason);
	// A design is not edited by its review: the report becomes the review entry of its log and the lifecycle review names it; the
	// body is untouched.
	const artifact = JSON.parse(readFileSync(state.jsonPath, 'utf8')) as { meta: Record<string, unknown>; body: unknown };
	// This phase records the CONTROLLER's review, so it does not record one on work
	// the controller authored. `start` already sends such work to the daemon; this
	// holds the rule at the point of the record, whatever led here.
	if (authorPartyOf(artifact.meta) === 'controller') {
		throw new SamePartyReviewError('controller', `this ${state.stage} artifact`);
	}
	const md = stripReviewSection(readFileSync(state.mdPath, 'utf8'));
	await persistReview({
		artifactId, jsonPath: state.jsonPath, mdPath: state.mdPath, lifecycle,
		assertActive: guard.assertActive, report, reviewer: CONTROLLER, party: 'controller', recorder: REVIEWER, markdown: md,
	});

	const pending = pendingUserFindings(report).length;

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
