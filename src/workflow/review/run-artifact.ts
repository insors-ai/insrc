/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review-loop entry point over a persisted artifact: load the `.md` +
 * `.json`, run the grounded review, apply the auto-fixable findings, re-run
 * the review on the amended artifact so the verdict reflects the fixes, then
 * persist the amended body/markdown and stamp `meta.review`.
 *
 * This is what a stage's finalize hook and the `insrc workflow review`
 * command both call. The `assisted` / `manual` findings that remain are
 * returned for the interactive user gate; they are NOT auto-applied.
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import type { LLMProvider } from '../../shared/types.js';
import { writeAtomic } from '../storage.js';
import { applyAutoFixes, pendingUserFindings } from './apply.js';
import type { AppliedFix, SkippedFix } from './apply.js';
import { renderReviewReport } from './report.js';
import { runReview } from './review.js';
import type { Finding, ReviewReport, Severity } from './types.js';

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
}

export interface ReviewArtifactResult {
	readonly report:      ReviewReport;
	readonly applied:     readonly AppliedFix[];
	readonly skipped:     readonly SkippedFix[];
	readonly pendingUser: readonly Finding[];
}

const REVIEW_SECTION = '<!-- insrc:review -->';

/** Strip a previously-appended review section so re-runs don't stack. */
function stripReviewSection(md: string): string {
	const i = md.indexOf('\n' + REVIEW_SECTION);
	return i === -1 ? md : md.slice(0, i).replace(/\s+$/, '') + '\n';
}

/**
 * Review an on-disk artifact, apply the auto-fixable findings, and persist
 * the result with `meta.review` stamped. Returns the (post-fix) report plus
 * the findings still needing a human.
 */
export async function reviewArtifactFile(opts: ReviewArtifactOpts): Promise<ReviewArtifactResult> {
	if (!existsSync(opts.jsonPath)) throw new Error(`No artifact json at ${opts.jsonPath}`);
	if (!existsSync(opts.mdPath))   throw new Error(`No artifact md at ${opts.mdPath}`);

	const artifact = JSON.parse(readFileSync(opts.jsonPath, 'utf8')) as { meta: Record<string, unknown>; body: unknown };
	const stage = typeof artifact.meta.workflow === 'string' ? artifact.meta.workflow : 'unknown';
	const rawMd = readFileSync(opts.mdPath, 'utf8');
	const md = stripReviewSection(rawMd);

	const base = {
		repo: opts.repo, stage, provider: opts.provider, model: opts.model,
		...(opts.blockOn !== undefined ? { blockOn: opts.blockOn } : {}),
		...(opts.reviewedAt !== undefined ? { reviewedAt: opts.reviewedAt } : {}),
		...(opts.onProgress !== undefined ? { onProgress: opts.onProgress } : {}),
		...(opts.signal !== undefined ? { signal: opts.signal } : {}),
	};

	const first = await runReview(md, base);
	const fixed = applyAutoFixes(md, artifact.body, first);

	// Re-review the amended artifact so the persisted verdict reflects the
	// auto-fixes (a HIGH that was auto-corrected should no longer block).
	const report = (fixed.applied.length > 0 && opts.reReview !== false)
		? await runReview(fixed.markdown, base)
		: first;

	// Persist: amended body + stamped review into the json; amended md with a
	// rendered review section appended for human visibility.
	const nextJson = { ...artifact, meta: { ...artifact.meta, review: report }, body: fixed.body };
	writeAtomic(opts.jsonPath, JSON.stringify(nextJson, null, 2) + '\n');
	const nextMd = `${fixed.markdown.replace(/\s+$/, '')}\n\n${REVIEW_SECTION}\n\n## Review\n\n${renderReviewReport(report)}\n`;
	writeAtomic(opts.mdPath, nextMd);

	log.info(
		{ stage, verdict: report.verdict, applied: fixed.applied.length, pending: report.findings.length },
		'review:run-artifact: reviewed + persisted',
	);
	return { report, applied: fixed.applied, skipped: fixed.skipped, pendingUser: pendingUserFindings(report) };
}
