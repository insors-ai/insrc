/** Read-only historical review compatibility. No live review execution. */
import type { ReviewResolution } from "../../types.js";
import type { Finding, ReviewReport, ReviewVerdict, Severity } from "./types.js";
/** The severities that block approval while unresolved. */
export const BLOCKING: ReadonlySet<Severity> = new Set<Severity>(['HIGH', 'MED']);
export type ReviewAction = 'apply' | 'accept' | 'override' | 'defer';
export interface ResolveReviewResult {
    readonly findingId: string;
    readonly status: ReviewResolution['status'];
    readonly appliedEdits?: number | undefined;
    readonly effectiveVerdict: ReviewVerdict;
    readonly remainingBlocking: number;
}
/** The findings still needing a human: non-LOW findings without a resolution. */
export function listPendingReviewFindings(report: ReviewReport, resolutions: Readonly<Record<string, ReviewResolution>> | undefined): readonly Finding[] {
    const res = resolutions ?? {};
    return report.findings.filter(f => f.severity !== 'LOW' && res[f.claimId] === undefined);
}
/** The verdict AFTER resolutions: `block` while any HIGH/MED finding is
 *  unresolved; otherwise `pass`. */
export function effectiveReviewVerdict(report: ReviewReport, resolutions: Readonly<Record<string, ReviewResolution>> | undefined): ReviewVerdict {
    const res = resolutions ?? {};
    const unresolvedBlocking = report.findings.some(f => BLOCKING.has(f.severity) && res[f.claimId] === undefined);
    return unresolvedBlocking ? 'block' : 'pass';
}
