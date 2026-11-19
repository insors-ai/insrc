/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The fixed finding taxonomy and severity scale (HLD sc2, owned by this Story).
 * severity stays an unconstrained string -- no abstract review-type class hierarchy
 * exists to type-check it against; a review type's own grounding/steering declares
 * its own severity vocabulary, falling back to DEFAULT_SEVERITY_SCALE when it
 * declares none.
 */

export type FindingCategory = 'correctness' | 'functional-completeness' | 'security' | 'quality' | 'maintainability';

/** id gives a finding a stable identity across rounds (HLD sc2 rev4); assigned by
 *  whatever review type's hook produces the finding (sc1's RoundDriverHooks.ground()). */
export interface Finding {
	readonly id:       string;
	readonly category: FindingCategory;
	readonly severity: string;
}

/** The fallback scale a review type's steering/prompt falls back to when it
 *  declares no severity scale of its own. Documentation only -- not enforced
 *  structurally, since severity stays a plain string. */
export const DEFAULT_SEVERITY_SCALE: readonly string[] = ['HIGH', 'MED'] as const;
