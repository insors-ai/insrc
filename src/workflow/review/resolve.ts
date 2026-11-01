import { reviewUnavailable } from '../review-unavailable.js';
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


import type { Actor } from '../artifact-core/types.js';
import type { ReviewResolution } from '../types.js';
import type { Finding, ReviewReport, ReviewVerdict, Severity } from './types.js';


/** The severities that block approval while unresolved. */
export const BLOCKING: ReadonlySet<Severity> = new Set<Severity>(['HIGH', 'MED']);

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
	meta: Record<string, unknown>;
	body: unknown;
	[k: string]: unknown;
}

/** Who a resolution is recorded as when the caller names nobody: the person at the command. */
const RESOLVER: Actor = { id: 'insrc:user', kind: 'person', properties: {} };

/**
 * Resolve one review finding on a persisted artifact. `apply` mutates the
 * artifact (body + md) with the finding's edits; the others just record the
 * decision. The report is read from the review entry of the artifact's log and
 * the decision is a further entry there. Returns the post-resolution effective verdict + how many blocking
 * findings remain, so a caller can drive the loop until it clears.
 */
export async function resolveReviewFinding(...args: readonly unknown[]): Promise<ResolveReviewResult> { return reviewUnavailable(...args); }
