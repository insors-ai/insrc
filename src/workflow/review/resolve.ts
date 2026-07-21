/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Interactive review-resolution gate (R3). The review cycle detects findings
 * and auto-fixes the `auto` ones; this walks the remaining `assisted`/`manual`
 * findings — the ones needing a human — one at a time. Each is resolved by one
 * of four actions, mirroring the open-question gate:
 *
 *   - `apply`    — apply the finding's proposed edits to the artifact (assisted
 *                  findings that carry `artifactEdits`).
 *   - `accept`   — record a manual decision / chosen option (you fixed it or
 *                  picked an option; the finding is considered handled).
 *   - `override` — accept the artifact as-is despite the finding, with a reason.
 *   - `defer`    — decide later; tracked as debt but no longer blocks.
 *
 * A resolved/overridden/deferred finding stops counting toward the block
 * verdict, so `approve` clears once every HIGH/MED finding has been handled
 * (`effectiveReviewVerdict`).
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { writeAtomic } from '../storage.js';
import type { ReviewResolution } from '../types.js';
import { applyOneFinding } from './apply.js';
import type { Finding, ReviewReport, ReviewVerdict, Severity } from './types.js';

const log = getLogger('review');

const BLOCKING: ReadonlySet<Severity> = new Set<Severity>(['HIGH', 'MED']);

export type ReviewAction = 'apply' | 'accept' | 'override' | 'defer';

export interface ResolveReviewResult {
	readonly findingId:        string;
	readonly status:           ReviewResolution['status'];
	readonly appliedEdits?:    number | undefined;
	readonly effectiveVerdict: ReviewVerdict;
	readonly remainingBlocking: number;
}

/** The findings still needing a human: non-LOW findings without a resolution. */
export function listPendingReviewFindings(
	report: ReviewReport,
	resolutions: Readonly<Record<string, ReviewResolution>> | undefined,
): readonly Finding[] {
	const res = resolutions ?? {};
	return report.findings.filter(f => f.severity !== 'LOW' && res[f.claimId] === undefined);
}

/** The verdict AFTER resolutions: `block` while any HIGH/MED finding is
 *  unresolved; otherwise `pass`. */
export function effectiveReviewVerdict(
	report: ReviewReport,
	resolutions: Readonly<Record<string, ReviewResolution>> | undefined,
): ReviewVerdict {
	const res = resolutions ?? {};
	const unresolvedBlocking = report.findings.some(f => BLOCKING.has(f.severity) && res[f.claimId] === undefined);
	return unresolvedBlocking ? 'block' : 'pass';
}

interface ArtifactShape {
	meta: {
		review?: ReviewReport;
		reviewResolutions?: Record<string, ReviewResolution>;
		[k: string]: unknown;
	};
	body: unknown;
	[k: string]: unknown;
}

/**
 * Resolve one review finding on a persisted artifact. `apply` mutates the
 * artifact (body + md) with the finding's edits; the others just record the
 * decision. Returns the post-resolution effective verdict + how many blocking
 * findings remain, so a caller can drive the loop until it clears.
 */
export function resolveReviewFinding(
	mdPath: string,
	jsonPath: string,
	findingId: string,
	action: ReviewAction,
	note?: string,
	now: () => string = () => new Date().toISOString(),
): ResolveReviewResult {
	if (!existsSync(jsonPath)) throw new Error(`No artifact json at ${jsonPath}`);
	const artifact = JSON.parse(readFileSync(jsonPath, 'utf8')) as ArtifactShape;
	const review = artifact.meta.review;
	if (review === undefined) throw new Error('artifact carries no review to resolve');
	const finding = review.findings.find(f => f.claimId === findingId);
	if (finding === undefined) throw new Error(`no finding '${findingId}' in this artifact's review`);

	let status: ReviewResolution['status'];
	let appliedEdits: number | undefined;
	let resolvedNote = note;

	if (action === 'apply') {
		if (!existsSync(mdPath)) throw new Error(`No artifact md at ${mdPath}`);
		const edits = finding.proposedFix?.artifactEdits ?? [];
		if (edits.length === 0) throw new Error(`finding '${findingId}' has no artifactEdits to apply — use accept/override/defer`);
		const md = readFileSync(mdPath, 'utf8');
		const one = applyOneFinding(md, artifact.body, finding.claimId, finding.ref, edits);
		if (one.applied === undefined) throw new Error(`finding '${findingId}' edits did not match the artifact (stale) — use accept/override/defer`);
		writeAtomic(mdPath, one.markdown);
		artifact.body = one.body;
		appliedEdits = one.applied.edits.length;
		status = 'resolved';
		resolvedNote = note ?? `auto-applied ${appliedEdits} edit(s)`;
	} else if (action === 'accept') {
		status = 'resolved';
	} else if (action === 'override') {
		status = 'overridden';
	} else {
		status = 'deferred';
	}

	const resolution: ReviewResolution = {
		findingId, status,
		...(resolvedNote !== undefined && resolvedNote.length > 0 ? { note: resolvedNote } : {}),
		resolvedAt: now(),
	};
	const reviewResolutions = { ...(artifact.meta.reviewResolutions ?? {}), [findingId]: resolution };
	artifact.meta = { ...artifact.meta, reviewResolutions };
	writeAtomic(jsonPath, JSON.stringify(artifact, null, 2) + '\n');

	const effectiveVerdict = effectiveReviewVerdict(review, reviewResolutions);
	const remainingBlocking = review.findings.filter(
		f => BLOCKING.has(f.severity) && reviewResolutions[f.claimId] === undefined,
	).length;
	log.info({ findingId, status, effectiveVerdict, remainingBlocking }, 'review:resolve: recorded resolution');
	return { findingId, status, appliedEdits, effectiveVerdict, remainingBlocking };
}
