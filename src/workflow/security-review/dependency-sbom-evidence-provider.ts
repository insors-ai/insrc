/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * createDependencySbomEvidenceProvider (s2/t7), Epic add-dedicated-security-reviews.
 *
 * Thin EvidenceProvider adapter over collectDependencyAdvisories (s2/t6):
 * captures repoPath in the returned provider's closure and maps each
 * SecurityAdvisoryMatch into a bare SecurityEvidence (no locator -- a
 * dependency-advisory match is not anchored to a code location).
 *
 * contentStable:false means the collection's own pinned scope did not hold
 * (a target changed, became unreadable, or a manager's required-input
 * closure grew mid-audit) -- its matches were computed against a scope that
 * no longer describes the repository, so run() rejects rather than emitting
 * them as if they were ordinary, trustworthy evidence.
 */

import type { EvidenceProvider, EvidenceProviderInput, EvidenceProviderOutput } from '../review-round/evidence-provider.js';
import { collectDependencyAdvisories } from './collect-dependency-advisories.js';

export function createDependencySbomEvidenceProvider(repoPath: string): EvidenceProvider {
	return {
		category: 'dependency-sbom',
		async run(input: EvidenceProviderInput): Promise<EvidenceProviderOutput> {
			const result = await collectDependencyAdvisories(repoPath, input.targets);
			if (!result.contentStable) {
				throw new Error(`createDependencySbomEvidenceProvider: collection scope for '${repoPath}' was not stable (contentStable:false) -- refusing to emit evidence against an invalidated scope`);
			}
			return { evidence: result.matches.map(() => ({ providerCategory: 'dependency-sbom' })) };
		},
	};
}
