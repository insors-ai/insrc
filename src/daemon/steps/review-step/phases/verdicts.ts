/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_review_step` phase='verdicts' handler — the final, deterministic pass.
 *
 * The controller has judged every premise. The server re-keys each verdict to
 * its claim (via `normalizeFinding`), assembles a `ReviewReport` using the
 * engine's own verdict policy (default blockOn HIGH+MED), then persists EXACTLY
 * like `reviewArtifactFile`: apply the `auto` fixes to the md + body, stamp
 * the lifecycle review into the json, append the rendered report to the md.
 *
 * The stamped review `model` is `'client'` — the CONTROLLER (the MCP
 * client model) authored this review, off the provider that wrote the
 * artifact. That independence is the whole point of this tool.
 */

import { hasControllerDesignJob, resumeControllerDesignReview } from '../controller.js';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { getLogger } from '../../../../shared/logger.js';
import type { LifecycleService } from '../../../../workflow/artifact-core/lifecycle-service.js';
import { LifecycleConflictError } from '../../../../workflow/artifact-core/types.js';
import type { Actor } from '../../../../workflow/artifact-core/types.js';
import {
	applyAutoFixes, computeReviewVerdict, DEFAULT_BLOCK_ON_SEVERITIES, normalizeFinding,
	pendingUserFindings, renderReviewReport, stripReviewSection, tallyFindings,
} from '../../../../workflow/review/index.js';
import type { Claim, Finding, RawFinding, ReviewReport } from '../../../../workflow/review/index.js';
import { authorPartyOf, SamePartyReviewError } from '../../../../workflow/review/party.js';
import { persistReview } from '../../../../workflow/review/persist-review.js';
import { reviewFixModeFor } from '../../../../workflow/team/approval-gate.js';
import { withReviewTerminal } from '../terminal.js';
import type { ReviewTerminalGuard } from '../terminal.js';
import { assertExactReviewIds, validateVerdictCoverage } from '../../../../workflow/review/exact-coverage.js';
import { ReviewBudgetError } from '../../../../workflow/review-pipeline/budget.js';
import type { ReviewStepDone, ReviewStepInputVerdicts, ReviewStepOutput, ReviewStepDeps, ReviewStepStatePayload, RawVerdict } from '../types.js';

const log = getLogger('mcp:review-step:verdicts');

const REVIEW_MODEL = 'client';

/** Who the store records for the controller's review: the review itself, as the daemon's review does. */
const REVIEWER: Actor = { id: 'insrc:review', kind: 'system', properties: {} };
const CONTROLLER: Actor = { id: 'insrc:controller', kind: 'agent', properties: {} };

/**
 * `lifecycleFor` gives the service of the run's repository. The head is checked
 * against its change log before anything is recorded, and the review is persisted by `persistReview`.
 */
export async function handleVerdicts(
	input: ReviewStepInputVerdicts,
	lifecycleFor: (repoPath: string) => LifecycleService,
	deps: ReviewStepDeps = {},
): Promise<ReviewStepOutput> {
	if (await hasControllerDesignJob(input.state)) return resumeControllerDesignReview(input, { ...deps, lifecycleFor });
	return withReviewTerminal(input, (state, answer, guard) => persistPremiseVerdicts(state, answer as { verdicts?: readonly RawVerdict[] | undefined }, lifecycleFor, guard));
}

export async function persistPremiseVerdicts(state: ReviewStepStatePayload, answer: { verdicts?: readonly RawVerdict[] | undefined }, lifecycleFor: (repoPath: string) => LifecycleService, guard: ReviewTerminalGuard): Promise<ReviewStepDone> {
	if (state.claims === undefined) {
		throw new Error(`insrc_review_step[verdicts]: no claims in run state — call phase='claims' before phase='verdicts'.`);
	}

	const protocol = state.controller;
	if (!protocol?.expectedClaimIds || !protocol.assignedClaimIds) throw new ReviewBudgetError('review-budget-state-stale');
	assertExactReviewIds(state.claims.map(claim => claim.id), protocol.expectedClaimIds, 'verdict-coverage-invalid');
	const rawVerdicts = validateVerdictCoverage({ expected: protocol.expectedClaimIds, assigned: protocol.assignedClaimIds,
		completed: protocol.completedVerdicts ?? [], received: answer.verdicts, extractionComplete: protocol.extractionComplete === true });
	const claimById = new Map<string, Claim>(state.claims.map(c => [c.id, c] as const));
	const findings: Finding[] = [];
	for (const v of rawVerdicts) {
		const claim = claimById.get(v.claimId)!;
		const raw = {
			severity:    v.severity,
			evidence:    v.evidence,
			action:      v.action,
			fixability:  v.fixability,
			proposedFix: v.proposedFix,
		} as unknown as RawFinding;
		findings.push(normalizeFinding(claim, raw));
	}

	const report: ReviewReport = {
		artifact:   state.stage,
		stage:      state.stage,
		verdict:    computeReviewVerdict(findings, DEFAULT_BLOCK_ON_SEVERITIES),
		findings,
		counts:     tallyFindings(findings),
		reviewedAt: new Date().toISOString(),
		model:      REVIEW_MODEL,
		// These phases are the controller's review.
		reviewedBy: 'controller',
	};

	// Persist EXACTLY like reviewArtifactFile: apply the auto-fixes, stamp
	// the lifecycle review, append the rendered report to the md.
	if (!existsSync(state.jsonPath)) throw new Error(`insrc_review_step[verdicts]: no artifact json at ${state.jsonPath}`);
	if (!existsSync(state.mdPath))   throw new Error(`insrc_review_step[verdicts]: no artifact md at ${state.mdPath}`);

	// The head is checked (and any write a crash left staged is finished) BEFORE it is read: everything below works on the head as it is afterwards.
	// A head whose stored hash no longer matches its content, or that is out of step with its change log, is not reviewed until a person resolves it.
	const artifactId = basename(state.jsonPath).replace(/\.json$/, '');
	const lifecycle = lifecycleFor(state.repo);
	guard.admitCompletion?.({ next: 'done', verdict: report.verdict, counts: report.counts, report: renderReviewReport(report), applied: Number.MAX_SAFE_INTEGER, pending: pendingUserFindings(report).length, path: state.mdPath, jsonPath: state.jsonPath });
	guard.beginSideEffects();
	const seen = await lifecycle.inspect(artifactId);
	guard.assertActive(); guard.assertSource?.();
	if (seen !== undefined && !seen.integrity.ok) throw new LifecycleConflictError(artifactId, seen.integrity.reason);
	const artifact = JSON.parse(readFileSync(state.jsonPath, 'utf8')) as { meta: Record<string, unknown>; body: unknown; citations?: unknown | undefined };
	// This phase records the CONTROLLER's review, so it does not record one on work
	// the controller authored. `start` already sends such work to the daemon; this
	// holds the rule at the point of the record, whatever led here.
	if (authorPartyOf(artifact.meta) === 'controller') {
		throw new SamePartyReviewError('controller', `this ${state.stage} artifact`);
	}
	const md = stripReviewSection(readFileSync(state.mdPath, 'utf8'));
	// A reviewer who does not hold the stage reports findings but writes no fix (the review is never refused).
	const fixed = (await reviewFixModeFor(state.jsonPath)) === 'apply-auto-fixes'
		? applyAutoFixes(md, artifact.body, report)
		: ({ body: artifact.body, markdown: md, applied: [], skipped: [] } as ReturnType<typeof applyAutoFixes>);

	const pending = pendingUserFindings(report).length;
	const completed: ReviewStepOutput = {
		next:     'done',
		verdict:  report.verdict,
		counts:   report.counts,
		report:   renderReviewReport(report),
		applied:  fixed.applied.length,
		pending,
		path:     state.mdPath,
		jsonPath: state.jsonPath,
	};

	guard.admitCompletion?.(completed);

	// The one persist path: the auto-fix goes through the store (it answers no feedback), the report becomes the review entry of the
	// log and the lifecycle review names it, and the markdown is written last.
	await persistReview({
		artifactId, jsonPath: state.jsonPath, mdPath: state.mdPath, lifecycle, assertActive: guard.assertActive, assertSource: guard.assertSource, report, reviewer: CONTROLLER, party: 'controller', recorder: REVIEWER,
		...(fixed.applied.length > 0 ? { fix: { body: fixed.body as Record<string, unknown>, citations: Array.isArray(artifact.citations) ? artifact.citations : [] } } : {}),
		markdown: fixed.markdown,
	});
	log.info(
		{ runId: state.runId, stage: state.stage, verdict: report.verdict, applied: fixed.applied.length, pending },
		'insrc_review_step[verdicts]: assembled + persisted review (model=client)',
	);

	return completed;}
