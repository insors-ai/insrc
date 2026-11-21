/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SecurityFinding (LLD s1 t1, standalone Story add-securityfinding-capability-
 * family-delegates-framing): a structural subtype of the review framework's
 * base Finding (finding.ts), carrying the security review type's own fields.
 * A plain TS interface extending Finding structurally -- matching this
 * codebase's own plain-interface, zero-base-class-idiom convention (confirmed
 * via convention.detect: baseClassIdioms: [] everywhere in src/workflow/)
 * rather than a real class hierarchy. Because SecurityFinding IS a Finding,
 * reconciliation.ts's and review-report.ts's existing Finding-typed logic
 * accepts it unchanged -- ordinary structural polymorphism, no unwrap step.
 *
 * SecurityEvidence's locator field is typed as the base Locator (not
 * SecurityLocator, built by a later Task in this same Story): a SecurityLocator
 * is a structural superset of Locator, so it is already assignable here once
 * it exists -- no change to this file will be needed when it lands.
 */

import type { Finding } from './finding.js';
import type { Locator } from '../artifact-core/types.js';

export type SecurityEnforcementMode = 'advisory' | 'warning' | 'blocking';
export type SecurityConfidence = 'high' | 'medium' | 'low';

/** One evidence item produced by an EvidenceProvider (a later Task in this
 *  Story) and attached to a SecurityFinding. */
export interface SecurityEvidence {
	readonly providerCategory: string;
	readonly locator?:         Locator | undefined;
}

/**
 * A structural subtype of Finding (kind:'security' is the discriminant).
 * The revision-anchored override fields (overriddenBy/overrideReason/
 * overriddenAt) are a visible annotation on top of the finding's own
 * originally-computed enforcementMode, per the LLD's own decision -- never a
 * separate override record. receiptId is the id of a corroborating
 * VerificationReceipt (a later Task), never the receipt object itself.
 */
export interface SecurityFinding extends Finding {
	readonly kind:              'security';
	readonly checkId:           string;
	readonly violatedPolicyRef?: string | undefined;
	readonly evidence:          readonly SecurityEvidence[];
	readonly fixability?:       string | undefined;
	readonly confidence?:       SecurityConfidence | undefined;
	readonly enforcementMode:   SecurityEnforcementMode;
	readonly overriddenBy?:     string | undefined;
	readonly overrideReason?:   string | undefined;
	readonly overriddenAt?:     string | undefined;
	readonly receiptId?:        string | undefined;
	/** Set only on a risk-family-verdict finding (makeRiskFamilyVerdictFinding);
	 *  absent on an ordinary SecurityFinding produced by a capability delegate. */
	readonly riskFamilyVerdict?: RiskFamilyVerdict | undefined;
}

/** True only for an object whose `kind` discriminant is exactly 'security'.
 *  TypeScript's structural typing alone does not prevent a malformed
 *  discriminant at runtime (e.g. a caller constructing the right fields with
 *  `kind: 'Security'` or no kind at all); this is the one check responsible
 *  for catching that. */
export function isSecurityFinding(finding: Finding): finding is SecurityFinding {
	return (finding as { kind?: unknown }).kind === 'security';
}

export type RiskFamilyVerdict = 'applicable' | 'not-applicable' | 'uncertain';

/**
 * A risk-family verdict (applicable/not-applicable/uncertain + reason), for
 * every family including not-applicable ones, represented as an
 * informational, zero-severity SecurityFinding for durable audit visibility
 * -- not a separate type, per the LLD's own decision. The verdict itself is
 * carried in `riskFamilyVerdict`, distinct from `fixability`'s free-text
 * `reason` slot (the two otherwise-identical not-applicable and uncertain
 * findings below would be indistinguishable without it).
 */
export function makeRiskFamilyVerdictFinding(
	id: string, familyId: string, verdict: RiskFamilyVerdict, reason: string,
): SecurityFinding {
	return {
		id,
		category: 'security',
		severity: 'INFO',
		kind: 'security',
		checkId: familyId,
		evidence: [],
		fixability: reason,
		enforcementMode: 'advisory',
		confidence: verdict === 'uncertain' ? 'low' : undefined,
		riskFamilyVerdict: verdict,
	};
}

/**
 * True when a policy override's recorded `overriddenAt` revision no longer
 * matches the Scope's current revision -- a direct string comparison, not an
 * exception (the policy-evaluation checkpoint re-evaluates enforcementMode as
 * if no override existed, forcing a fresh human decision). An override with
 * no `overriddenAt` at all is never stale: there is nothing to compare.
 */
export function isOverrideStale(overriddenAt: string | undefined, currentRevision: string): boolean {
	return overriddenAt !== undefined && overriddenAt !== currentRevision;
}
