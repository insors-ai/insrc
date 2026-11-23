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
 */

import type { EvidenceProvider, EvidenceProviderInput, EvidenceProviderOutput } from '../review-round/evidence-provider.js';
import { collectDependencyAdvisories } from './collect-dependency-advisories.js';

export function createDependencySbomEvidenceProvider(repoPath: string): EvidenceProvider {
	return {
		category: 'dependency-sbom',
		async run(input: EvidenceProviderInput): Promise<EvidenceProviderOutput> {
			const result = await collectDependencyAdvisories(repoPath, input.targets);
			return { evidence: result.matches.map(() => ({ providerCategory: 'dependency-sbom' })) };
		},
	};
}
