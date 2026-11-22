/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * EvidenceProvider (LLD s1 t3, standalone Story add-securityfinding-
 * capability-family-delegates-framing): a dedicated interface/registry for
 * the five deterministic evidence-provider categories (secret scanning,
 * SAST, dependency/SBOM, IaC/container, language-native checks), distinct
 * from the general ~110-entry tool registry but still routed through daemon
 * IPC so it stays within the existing tool boundary. Every provider
 * implements the same input/output contract, feeding SecurityFinding.evidence
 * uniformly regardless of category.
 *
 * Extension-point only: this Story defines the interface/registry shape, not
 * any provider's internals, the daemon-IPC wiring, or the registry's actual
 * implementation -- confirmed out of scope by the LLD's own non-goals.
 */

import type { ReviewTargets } from '../artifact-core/types.js';
import type { SecurityEvidence } from './security-finding.js';

export type EvidenceProviderCategory = 'secret-scan' | 'sast' | 'dependency-sbom' | 'iac-container' | 'language-native';

/** The common input every provider category receives, regardless of what it scans. */
export interface EvidenceProviderInput {
	readonly category: EvidenceProviderCategory;
	readonly targets:  ReviewTargets;
}

/** The common output every provider category produces, regardless of what it scans. */
export interface EvidenceProviderOutput {
	readonly evidence: readonly SecurityEvidence[];
}

/** One evidence-provider category's implementation, routed through daemon IPC. */
export interface EvidenceProvider {
	readonly category: EvidenceProviderCategory;
	run(input: EvidenceProviderInput): Promise<EvidenceProviderOutput>;
}

/** Looks up a registered EvidenceProvider by category; distinct from the
 *  general tool registry (daemon/tools/). */
export type EvidenceProviderRegistry = ReadonlyMap<EvidenceProviderCategory, EvidenceProvider>;
