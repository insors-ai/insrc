/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_review_step` phase='start' handler.
 *
 * 1. Resolve the repo path (explicit param > INSRC_REPO env).
 * 2. Resolve the artifact's md + json paths (`jsonPathForMd`).
 * 3. Read the artifact markdown; read `meta.workflow` as the review stage.
 * 4. Seed the run state under an opaque token.
 * 5. Return emit_claims — the controller extracts the load-bearing premises.
 */

import { existsSync, readFileSync } from 'node:fs';

import { resolveRepoPath } from '../../resolve-repo.js';

import { getLogger } from '../../../../shared/logger.js';
import { jsonPathForMd } from '../../../../workflow/gates.js';
import {
	authorPartyOf, isDesignStage, resolveDesignReview, stripReviewSection,
} from '../../../../workflow/review/index.js';
import { startControllerDesignReview } from '../controller.js';
import { ReviewStreamError } from '../../../../shared/review-stream.js';
import { stepDaemonClient } from '../../daemon-client.js';
import type {
	ReviewStepDeps, ReviewStepDone, ReviewStepError, ReviewStepInputStart,
	ReviewStepStatePayload, ReviewStepOutput,
} from '../types.js';

const log = getLogger('mcp:review-step:start');

export async function handleStart(
	input: ReviewStepInputStart,
	deps:  ReviewStepDeps = {},
): Promise<ReviewStepOutput> {
	const repo = await resolveRepoPath(input.repo);
	if (repo === undefined) {
		throw new Error(
			`insrc_review_step[start]: no repo. Pass \`repo\` explicitly or set INSRC_REPO ` +
			`in the MCP server's environment.`,
		);
	}
	if (typeof input.artifact !== 'string' || input.artifact.length === 0) {
		throw new Error(`insrc_review_step[start]: \`artifact\` (a .md / .html / .json path) is required.`);
	}

	const { mdPath, jsonPath } = resolvePaths(input.artifact);
	if (!existsSync(jsonPath)) throw new Error(`insrc_review_step[start]: no artifact json at ${jsonPath}`);
	if (!existsSync(mdPath))   throw new Error(`insrc_review_step[start]: no artifact md at ${mdPath}`);

	const artifact = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: Record<string, unknown> };
	const stage = typeof artifact.meta?.['workflow'] === 'string' ? (artifact.meta['workflow'] as string) : 'unknown';
	const markdown = readFileSync(mdPath, 'utf8');

	// The party that did not author the work reviews it. This tool's own phases
	// are the CONTROLLER's review, so they run only for work the daemon authored.
	// Controller-authored work, and work whose author is not known, goes to the
	// daemon — decided here, before any prompt is handed back.
	if (authorPartyOf(artifact.meta) !== 'daemon') {
		return await reviewByDaemon({ repo, mdPath, jsonPath, stage }, deps);
	}

	// A design document (HLD / LLD) is reviewed against a template: the
	// controller checks every item with its own tools and answers once.
	if (isDesignStage(stage)) {
		const epicHash = typeof artifact.meta?.['epicHash'] === 'string' ? (artifact.meta['epicHash'] as string) : undefined;
		const plan = resolveDesignReview(repo, epicHash);
		const design = stripReviewSection(markdown);
		const designState: ReviewStepStatePayload = {
			runId:       `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			startedAtMs: Date.now(),
			mdPath, jsonPath, repo, stage,
			markdown:    design,
			templateIntent: plan.intent,
		};
		return startControllerDesignReview(designState, input.reviewBudget, deps, plan.deadlineMs);
	}

	const state: ReviewStepStatePayload = {
		runId:       `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		startedAtMs: Date.now(),
		mdPath,
		jsonPath,
		repo,
		stage,
		markdown,
	};
	return startControllerDesignReview(state, input.reviewBudget, deps);
}


/** Outer transport ceilings, distinct from the pipeline's dynamic ten-minute
 * budget per logical model work unit and its bounded per-attempt timers. A
 * known shorter outer ceiling is surfaced explicitly, never silently extended. */
export const DESIGN_REVIEW_WAIT_MS = 31 * 60_000;
export const PIPELINE_REVIEW_WAIT_MS = 90 * 60_000;

/** How long the tool waits with no frame from the daemon before it gives up.
 *  workflow.review sends a heartbeat every minute while a review runs
 *  (WORKFLOW_REVIEW_HEARTBEAT_MS), so only a daemon that has stopped sending
 *  is cut; the ceilings above still bound the whole review (ISSUE-562b1bb5). */
export const DESIGN_REVIEW_IDLE_MS = 5 * 60_000;

/** The retryable causes: the same call can succeed once the cause is gone. */
const RETRYABLE: ReadonlySet<string> = new Set(['unreachable', 'closed', 'timeout']);

async function reviewByDaemon(
	a:    { readonly repo: string; readonly mdPath: string; readonly jsonPath: string; readonly stage: string },
	deps: ReviewStepDeps,
): Promise<ReviewStepDone | ReviewStepError> {
	const timeoutMs = isDesignStage(a.stage) ? DESIGN_REVIEW_WAIT_MS : PIPELINE_REVIEW_WAIT_MS;
	log.info({ stage: a.stage, mdPath: a.mdPath, timeoutMs, idleMs: DESIGN_REVIEW_IDLE_MS }, 'insrc_review_step[start]: not daemon-authored; asking the daemon to review');
	try {
		const done = await (deps.reviewByDaemon ?? stepDaemonClient().reviewArtifactStream)(
			{ artifactPath: a.mdPath, repo: a.repo },
			{
				timeoutMs, idleMs: DESIGN_REVIEW_IDLE_MS,
				...(deps.progress !== undefined ? { onFrame: (_stream: 'progress' | 'delta', data: unknown) => deps.progress!(data) } : {}),
				...(deps.signal !== undefined ? { signal: deps.signal } : {}),
			},
		);
		return {
			next:       'done',
			verdict:    done.verdict as ReviewStepDone['verdict'],
			counts:     done.counts,
			report:     done.report,
			applied:    done.applied,
			pending:    done.pending,
			path:       a.mdPath,
			jsonPath:   a.jsonPath,
			reviewedBy: 'daemon',
		};
	} catch (err) {
		// No controller review is offered in its place: the controller authored
		// this work (or may have), so its review would not be a second pair of eyes.
		const failure = err instanceof ReviewStreamError ? err.failure : 'failed';
		const cause = err instanceof Error ? err.message : String(err);
		log.warn({ stage: a.stage, mdPath: a.mdPath, failure, cause }, 'insrc_review_step[start]: the daemon review did not complete; nothing stamped');
		return {
			next: 'error',
			error: {
				code: `daemon-review-${failure}`,
				message:
					`The daemon review of this ${a.stage} artifact did not complete: ${cause}. No review was recorded. ` +
					`The daemon reviews this artifact because the daemon did not author it; the review is not replaced ` +
					`by a controller review. Fix the cause and call insrc_review_step again, or approve with an override reason.`,
				retryable: RETRYABLE.has(failure),
			},
		};
	}
}

/** Resolve the artifact's (md, json) pair. Given a `.md`/`.html` path the
 *  canonical json is found via `jsonPathForMd`; given a `.json` path its
 *  `.md` sibling is derived by extension swap. */
function resolvePaths(artifact: string): { mdPath: string; jsonPath: string } {
	if (artifact.endsWith('.json')) {
		return { jsonPath: artifact, mdPath: artifact.replace(/\.json$/, '.md') };
	}
	return { mdPath: artifact, jsonPath: jsonPathForMd(artifact) };
}
