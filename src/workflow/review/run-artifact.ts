/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review-loop entry point over a persisted artifact: load the `.md` +
 * `.json`, run the grounded review, apply the auto-fixable findings, re-run
 * the review on the amended artifact so the verdict reflects the fixes, then
 * persist the amended body/markdown and record the review on the lifecycle.
 *
 * This is what a stage's finalize hook and the `insrc workflow review`
 * command both call. The `assisted` / `manual` findings that remain are
 * returned for the interactive user gate; they are NOT auto-applied.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import type { LLMProvider } from '../../shared/types.js';
import type { LifecycleService } from '../artifact-core/lifecycle-service.js';
import { LifecycleConflictError } from '../artifact-core/types.js';
import type { Actor } from '../artifact-core/types.js';
import { applyAutoFixes, pendingUserFindings } from './apply.js';
import { reviewFixModeFor } from '../team/approval-gate.js';
import type { AppliedFix, SkippedFix } from './apply.js';
import { authorPartyOf, SamePartyReviewError } from './party.js';
import { persistReview, stripReviewSection } from './persist-review.js';
export { REVIEW_SECTION, stripReviewSection } from './persist-review.js';
import { runReview } from './review.js';
import { isDesignStage, resolveDesignReview } from './template.js';
import type { Finding, ReviewReport, Severity } from './types.js';
import type { EntitiesForRepoReader } from './source-roots.js';

const log = getLogger('review');

export interface ReviewArtifactOpts {
	readonly mdPath:    string;
	readonly jsonPath:  string;
	readonly repo:      string;
	readonly provider:  LLMProvider;
	readonly model:     string;
	readonly blockOn?:  readonly Severity[] | undefined;
	/** Re-run the review after auto-fixes so the stamped verdict reflects
	 *  them. Default true; set false to skip the second (costly) pass. */
	readonly reReview?: boolean | undefined;
	/** Injected clock for the stamped `reviewedAt` (tests pass a fixed one). */
	readonly reviewedAt?: string | undefined;
	readonly onProgress?: ((msg: string) => void) | undefined;
	readonly signal?:   AbortSignal | undefined;
	/** Reads a repository's indexed entities for the source roots. Passed by a
	 *  caller outside the daemon (the CLI), which may not open the store. */
	readonly readEntitiesForRepo?: EntitiesForRepoReader | undefined;
	/**
	 * The lifecycle service the review is recorded through: the full integrity check (the head against its change log) runs before the
	 * review, and the auto-fix, the review entry and the lifecycle review are written through it.
	 */
	readonly lifecycle: LifecycleService;
	/** The actor the service records; the review itself when absent. */
	readonly actor?: Actor | undefined;
}

export interface ReviewArtifactResult {
	readonly report:      ReviewReport;
	readonly applied:     readonly AppliedFix[];
	readonly skipped:     readonly SkippedFix[];
	readonly pendingUser: readonly Finding[];
}

/**
 * Review an on-disk artifact, apply the auto-fixable findings, and persist
 * the result with the review recorded on the lifecycle. Returns the (post-fix) report plus
 * the findings still needing a human.
 */
export async function reviewArtifactFile(opts: ReviewArtifactOpts): Promise<ReviewArtifactResult> {
	if (!existsSync(opts.jsonPath)) throw new Error(`No artifact json at ${opts.jsonPath}`);
	if (!existsSync(opts.mdPath))   throw new Error(`No artifact md at ${opts.mdPath}`);
	const artifactId = basename(opts.jsonPath).replace(/\.json$/, '');
	const reviewer: Actor = opts.actor ?? { id: 'insrc:review', kind: 'system', properties: {} };
	// A review is recorded through the lifecycle of the repository that holds the artifact.
	const lifecycle = opts.lifecycle;
	// inspect first: it finishes a write a crash left staged, so a state the journal repairs is not refused below. This is before any model is called.
	const seen = await lifecycle.inspect(artifactId);
	if (seen !== undefined && !seen.integrity.ok) throw new LifecycleConflictError(artifactId, seen.integrity.reason);

	const artifact = JSON.parse(readFileSync(opts.jsonPath, 'utf8')) as { meta: Record<string, unknown>; body: unknown };
	const stage = typeof artifact.meta.workflow === 'string' ? artifact.meta.workflow : 'unknown';
	// This function is the daemon's review, so it does not review the daemon's own
	// work. Checked before anything is sent to a model. It holds for every caller:
	// the daemon's review request, the TUI review service, and any other.
	if (authorPartyOf(artifact.meta) === 'daemon') throw new SamePartyReviewError('daemon', `this ${stage} artifact`);
	const rawMd = readFileSync(opts.mdPath, 'utf8');
	const md = stripReviewSection(rawMd);

	// A design document is reviewed against the template its intent selects; the
	// intent and the review's deadline come from the artifact store. Template
	// findings carry no edits, so the auto-fix + re-review steps below are no-ops
	// for a design: it is reviewed once and never edited.
	const design = isDesignStage(stage)
		? resolveDesignReview(opts.repo, typeof artifact.meta['epicHash'] === 'string' ? artifact.meta['epicHash'] : undefined)
		: undefined;

	const base = {
		repo: opts.repo, stage, provider: opts.provider, model: opts.model,
		...(design !== undefined ? { intent: design.intent, deadlineMs: design.deadlineMs } : {}),
		...(opts.blockOn !== undefined ? { blockOn: opts.blockOn } : {}),
		...(opts.reviewedAt !== undefined ? { reviewedAt: opts.reviewedAt } : {}),
		...(opts.onProgress !== undefined ? { onProgress: opts.onProgress } : {}),
		...(opts.signal !== undefined ? { signal: opts.signal } : {}),
		...(opts.readEntitiesForRepo !== undefined ? { readEntitiesForRepo: opts.readEntitiesForRepo } : {}),
	};

	const first = await runReview(md, base);
	// A reviewer who does not hold the stage reports findings but writes no fix (the review is never refused).
	const fixed = reviewFixModeFor(opts.jsonPath) === 'apply-auto-fixes'
		? applyAutoFixes(md, artifact.body, first)
		: ({ body: artifact.body, markdown: md, applied: [], skipped: [] } as ReturnType<typeof applyAutoFixes>);

	// Re-review the amended artifact so the persisted verdict reflects the
	// auto-fixes (a HIGH that was auto-corrected should no longer block).
	const report = (fixed.applied.length > 0 && opts.reReview !== false)
		? await runReview(fixed.markdown, base)
		: first;

	// Persist: the auto-fix (content, through the store), the review (its report as the review entry of the log and the lifecycle
	// review that names it) and the markdown, in that order. This function is the DAEMON's review, on both of its paths (the
	// pipeline for a DEF and the one-session template review for a design).
	const stamped: ReviewReport = { ...report, reviewedBy: 'daemon' };
	const stored = JSON.parse(readFileSync(opts.jsonPath, 'utf8')) as { citations?: unknown };
	const citations = Array.isArray(stored.citations) ? stored.citations : [];
	await persistReview({
		artifactId, jsonPath: opts.jsonPath, mdPath: opts.mdPath, lifecycle,
		report: stamped, reviewer: { id: 'insrc:daemon', kind: 'agent', properties: {} }, party: 'daemon', recorder: reviewer,
		...(fixed.applied.length > 0 ? { fix: { body: fixed.body as Record<string, unknown>, citations } } : {}),
		markdown: fixed.markdown,
	});

	log.info(
		{ stage, verdict: report.verdict, applied: fixed.applied.length, pending: report.findings.length },
		'review:run-artifact: reviewed + persisted',
	);
	return { report: stamped, applied: fixed.applied, skipped: fixed.skipped, pendingUser: pendingUserFindings(report) };
}
