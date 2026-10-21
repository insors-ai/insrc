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
import { basename } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import type { LLMProvider } from '../../shared/types.js';
import { headConflict } from '../gates.js';
import type { LifecycleService } from '../artifact-core/lifecycle-service.js';
import { LifecycleConflictError } from '../artifact-core/types.js';
import type { Actor } from '../artifact-core/types.js';
import { writeArtifact, writeAtomic } from '../storage.js';
import { applyAutoFixes, pendingUserFindings } from './apply.js';
import { reviewFixModeFor } from '../team/approval-gate.js';
import type { AppliedFix, SkippedFix } from './apply.js';
import { authorPartyOf, SamePartyReviewError } from './party.js';
import { renderReviewReport } from './report.js';
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
	 * The lifecycle service. With it the full integrity check (the head against its change log) runs before the review, and the
	 * log is brought in step with the auto-fix write right after it, so the next approval is not refused as head-ahead-of-log.
	 */
	readonly lifecycle?: LifecycleService | undefined;
	/** The actor the service records; the review itself when absent. */
	readonly actor?: Actor | undefined;
}

export interface ReviewArtifactResult {
	readonly report:      ReviewReport;
	readonly applied:     readonly AppliedFix[];
	readonly skipped:     readonly SkippedFix[];
	readonly pendingUser: readonly Finding[];
}

/** The marker that opens the rendered review section appended to an artifact's md. */
export const REVIEW_SECTION = '<!-- insrc:review -->';

/** Strip a previously-appended review section so re-runs don't stack. */
export function stripReviewSection(md: string): string {
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
	// A head whose stored content hash no longer matches its content is not reviewed or stamped until a person resolves it.
	const conflict = headConflict(opts.jsonPath);
	if (conflict !== undefined) throw new LifecycleConflictError(conflict.artifactId, conflict.reason);
	const artifactId = basename(opts.jsonPath).replace(/\.json$/, '');
	const reviewer: Actor = opts.actor ?? { id: 'insrc:review', kind: 'system', properties: {} };
	if (opts.lifecycle !== undefined) {
		const seen = await opts.lifecycle.inspect(artifactId);
		if (seen !== undefined && !seen.integrity.ok) throw new LifecycleConflictError(artifactId, seen.integrity.reason);
	}

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

	// Persist: amended body + stamped review into the json; amended md with a
	// rendered review section appended for human visibility.
	// This function is the DAEMON's review, on both of its paths (the pipeline
	// for a DEF and the one-session template review for a design).
	const stamped: ReviewReport = { ...report, reviewedBy: 'daemon' };
	const nextJson = { ...artifact, meta: { ...artifact.meta, review: stamped }, body: fixed.body };
	// auto-fixes change the body (content); a report-only review changes only meta.
	if (opts.lifecycle !== undefined && fixed.applied.length > 0) {
		// With a service the content goes through the store (staged, logged, revisioned); the review stamp then follows as a meta-only write.
		const stored = JSON.parse(readFileSync(opts.jsonPath, 'utf8')) as { citations?: unknown };
		const citations = Array.isArray(stored.citations) ? stored.citations : [];
		await opts.lifecycle.updateContent(artifactId, reviewer, { body: fixed.body as Record<string, unknown>, citations });
		const current = JSON.parse(readFileSync(opts.jsonPath, 'utf8')) as { meta: Record<string, unknown> };
		writeArtifact(opts.jsonPath, { ...current, meta: { ...current.meta, review: stamped } }, 'meta-only');
	} else {
		writeArtifact(opts.jsonPath, nextJson, fixed.applied.length > 0 ? 'content' : 'meta-only');
	}
	const nextMd = `${fixed.markdown.replace(/\s+$/, '')}\n\n${REVIEW_SECTION}\n\n## Review\n\n${renderReviewReport(report)}\n`;
	// raw-write: markdown render of the review.
	writeAtomic(opts.mdPath, nextMd);

	log.info(
		{ stage, verdict: report.verdict, applied: fixed.applied.length, pending: report.findings.length },
		'review:run-artifact: reviewed + persisted',
	);
	return { report: stamped, applied: fixed.applied, skipped: fixed.skipped, pendingUser: pendingUserFindings(report) };
}
