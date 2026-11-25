/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * runSecurityReview (s3), Epic add-dedicated-security-reviews.
 *
 * The Story's own orchestrator: drives the two-round security review through
 * the shared review-round/ machinery, folding s1's selected model and s2's
 * dependency-advisory evidence into one in-memory SecurityReviewReport.
 * Entirely new surface -- review-round/ itself is unchanged (HLD sc3).
 */

import { createHash } from 'node:crypto';

import type { VerificationReceipt } from '../review-round/receipt-record.js';
import type { ReconciliationResult } from '../review-round/reconciliation.js';
import type { SecurityFinding } from '../review-round/security-finding.js';
import type { ReviewTargets } from '../artifact-core/types.js';
import { computeContentIdentity } from './content-identity.js';
import type { SecurityAdvisoryEvidence, SecurityAdvisoryMatch } from './collect-dependency-advisories.js';
import type { SecurityModelSelection } from '../../config/analyze.js';

/** Thrown when a recomputed contentIdentity no longer matches the one s2's
 *  evidence was collected against, or when s2's own contentStable flag is
 *  false -- the review refuses rather than report against a moving target. */
export class ContentIdentityMismatchError extends Error {
	constructor(expected: string, actual: string, contentStable: boolean) {
		super(`content identity mismatch (contentStable:${contentStable}): expected '${expected}', got '${actual}'`);
		this.name = 'ContentIdentityMismatchError';
	}
}

/** Thrown when s1's SecurityModelSelection is status:'unavailable' -- no
 *  fallback model is ever attempted. */
export class SecurityModelUnavailableError extends Error {
	constructor(blockerReason: string) {
		super(blockerReason);
		this.name = 'SecurityModelUnavailableError';
	}
}

/**
 * The Story's own in-memory return shape (resolved open question qfab24fea) --
 * never persisted as a tracked artifact. receiptId is set only on the code
 * findings the corresponding round's own CLI execution actually produced;
 * dependency-advisory findings (s2's output) never carry one.
 */
export interface SecurityReviewReport {
	readonly findings: readonly SecurityFinding[];
	readonly unresolvedDependencies: readonly string[];
	readonly unavailableSources: readonly string[];
	readonly reconciliation: readonly ReconciliationResult[];
	readonly receipts: { readonly round1: VerificationReceipt; readonly round2: VerificationReceipt };
	readonly effectiveModel: { readonly provider: string; readonly modelId?: string };
	readonly baseReportMarkdown: string;
	readonly supplementalMarkdown: string;
}

/**
 * Pure and synchronous: epicHash = sha256('security-review:'+contentIdentity),
 * truncated to the SAME 16-lowercase-hex-character shape every Epic-scoped
 * artifact id in this codebase already requires (src/workflow/tracker/
 * resolve.ts's LLD_RE/STORY_RE); storyId is the fixed literal 's1', which
 * satisfies that same regex's (s\d+) group. Used only when a caller's
 * request did not itself supply an epicHash/storyId to stamp the review's
 * receipt with.
 */
export function deriveReceiptIdentity(contentIdentity: string): { readonly epicHash: string; readonly storyId: string } {
	const epicHash = createHash('sha256').update(`security-review:${contentIdentity}`).digest('hex').slice(0, 16);
	return { epicHash, storyId: 's1' };
}

/**
 * Recomputes contentIdentity over the SAME targets s2 was given and compares
 * it against advisoryEvidence's own pinned value; also refuses on
 * contentStable:false even when the identity strings still match (s2's own
 * collection window was itself unstable, so its evidence cannot be trusted
 * at face value).
 */
export async function verifyContentIdentityMatch(repoPath: string, targets: ReviewTargets, advisoryEvidence: SecurityAdvisoryEvidence): Promise<void> {
	const recomputed = await computeContentIdentity(repoPath, targets);
	if (recomputed !== advisoryEvidence.contentIdentity || !advisoryEvidence.contentStable) {
		throw new ContentIdentityMismatchError(advisoryEvidence.contentIdentity, recomputed, advisoryEvidence.contentStable);
	}
}

/** One confirmed dependency-advisory match, as a SecurityFinding: checkId is
 *  the fixed literal 'dependency-advisory' (distinct from a code finding's
 *  own checkId, which names the specific vulnerability class); receiptId is
 *  never set -- no round's CLI execution produced this finding, s2's
 *  controller-side audit did. */
function advisoryMatchToFinding(match: SecurityAdvisoryMatch): SecurityFinding {
	return {
		id: `dependency-advisory:${match.coordinate}:${match.advisoryId}`,
		category: 'security',
		severity: match.severity,
		kind: 'security',
		checkId: 'dependency-advisory',
		evidence: [{ providerCategory: 'dependency-advisory', locator: { kind: 'package', value: match.coordinate } }],
		fixability: `Upgrade ${match.coordinate} away from the affected range ${match.affectedVersions}.`,
		enforcementMode: 'advisory',
	};
}

/** Supplemental markdown (HLD: "a supplemental report structure stay private
 *  to s3") separating confirmed affected dependencies and unverified coverage
 *  from the generic review-round renderer's code-finding-only output (ac3). */
function renderSupplementalMarkdown(advisoryEvidence: SecurityAdvisoryEvidence): string {
	const matchRows = advisoryEvidence.matches.map(m =>
		`| ${m.coordinate} | ${m.advisoryId} | ${m.affectedVersions} | ${m.severity} | ${m.provenance} |`).join('\n');
	const matchesSection = advisoryEvidence.matches.length > 0
		? `| Coordinate | Advisory | Affected versions | Severity | Provenance |\n| :--- | :--- | :--- | :--- | :--- |\n${matchRows}`
		: 'None confirmed.';
	const gapsSection = [...advisoryEvidence.unresolvedDependencies, ...advisoryEvidence.unavailableSources].length > 0
		? [...advisoryEvidence.unresolvedDependencies.map(d => `- ${d} (unresolved)`), ...advisoryEvidence.unavailableSources.map(s => `- ${s} (unavailable)`)].join('\n')
		: 'None.';
	return `## Confirmed affected dependencies\n\n${matchesSection}\n\n## Unverified coverage\n\n${gapsSection}\n`;
}

/**
 * Pure: folds s2's dependency-advisory evidence (as SecurityFindings, never
 * receipt-stamped), the already round-stamped code findings (each already
 * carrying its own round's receipt.id, set by the caller before this is
 * invoked), the reconciliation result, both rounds' receipts and the
 * dispatched modelSelection into one in-memory SecurityReviewReport.
 * effectiveModel is copied verbatim from modelSelection, never re-resolved.
 */
export function assembleSecurityReport(
	advisoryEvidence: SecurityAdvisoryEvidence,
	codeFindings: readonly SecurityFinding[],
	reconciliation: readonly ReconciliationResult[],
	receipts: { readonly round1: VerificationReceipt; readonly round2: VerificationReceipt },
	modelSelection: SecurityModelSelection & { readonly status: 'configured' },
	baseReport: { readonly path: string; readonly markdown: string },
): SecurityReviewReport {
	const advisoryFindings = advisoryEvidence.matches.map(advisoryMatchToFinding);
	return {
		findings: [...advisoryFindings, ...codeFindings],
		unresolvedDependencies: advisoryEvidence.unresolvedDependencies,
		unavailableSources: advisoryEvidence.unavailableSources,
		reconciliation,
		receipts,
		effectiveModel: { provider: modelSelection.provider, modelId: modelSelection.modelId },
		baseReportMarkdown: baseReport.markdown,
		supplementalMarkdown: renderSupplementalMarkdown(advisoryEvidence),
	};
}
