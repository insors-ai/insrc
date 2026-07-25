/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * CoreFloorGuard (Epic per-role-per-step, Story S002 — sc2).
 *
 * A pure transform that clamps a critical reasoning role's resolved tier UP to
 * the configured minimum capability (the `coreFloor`) whenever the assignment
 * would drop it below that floor. This is the Epic's accuracy-primary guardrail:
 * a critical design/review/implement role must never be silently served by a
 * weaker model than the operator's floor allows.
 *
 * Scope discipline (per the s2 LLD, boundary.internal):
 *   - The guard resolves NO providers — its sole downstream consumer is the s3
 *     RoleRouter, which reads FloorOutcome.effectiveTier to pick a TierModel.
 *   - The guard does NO precedence resolution — FloorInput.configuredFloor
 *     arrives already merged (global vs byRepo) from the s3 router.
 *   - The built-in default floor, the rankOf comparison, the criticality read,
 *     and the clamp log call site all stay module-private.
 *
 * Contracts consumed (never redefined here):
 *   - sc4 ReasoningRoleTaxonomy — RoleDescriptor.criticality + the rankOf
 *     tier ordering { cheap:0, mid:1, core:2 } (from ./role-taxonomy.js).
 *   - sc1 AnalyzeTieringConfig — the TierName union (from ./analyze.js).
 */

import type { TierName } from './analyze.js';
import type { RoleDescriptor } from './role-taxonomy.js';
import { reasoningRoleTaxonomy } from './role-taxonomy.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('core-floor-guard');

/** The tier ordering imported from sc4 — not re-declared here (LLD step 2). */
const { rankOf } = reasoningRoleTaxonomy();

/**
 * Module-private minimum capability applied to critical roles when no
 * `configuredFloor` is supplied (ac2). Governs ONLY the clamp decision — it
 * must never surface beyond this module nor alter the legacy unset-shaperProvider
 * fallback path. `'mid'` mirrors the catalog default for `models.analyze.coreFloor`.
 */
const BUILT_IN_DEFAULT_FLOOR: TierName = 'mid';

/** Input to {@link applyCoreFloor}: a resolved role/tier plus the already-merged floor. */
export interface FloorInput {
	/** The role, from sc4; `criticality` decides clamp (critical) vs pass-through (peripheral). */
	role:            RoleDescriptor;
	/** The tier the router resolved for this role before the floor is applied. */
	resolvedTier:    TierName;
	/** The merged coreFloor (sc1); absent ⇒ the module-private built-in default. */
	configuredFloor?: TierName | undefined;
}

/** Result of {@link applyCoreFloor}: the effective tier after clamping. */
export interface FloorOutcome {
	/** The tier after clamping — `>= floor` for critical roles. */
	effectiveTier: TierName;
	/** True when a critical downgrade was raised to the floor. */
	clamped:       boolean;
	/** Present only when a clamp was applied. */
	reason?:       'below-core-floor' | undefined;
}

/** The sc2 surface: the pure clamp transform. */
export type ApplyCoreFloor = (input: FloorInput) => FloorOutcome;

/**
 * Thrown when a tier value reaching the guard is outside the sc4 union
 * {core,mid,cheap} — an uninterpretable `configuredFloor` (e.g. a `'high'` typo
 * that escaped catalog validation) or an off-contract `resolvedTier` from a
 * router/contract bug. The guard fails LOUD rather than let a critical role pass
 * below an uninterpretable floor (which would silently violate ac1).
 */
export class InvalidTierError extends Error {
	constructor(
		readonly value: string,
		readonly field: 'configuredFloor' | 'resolvedTier',
	) {
		super(
			field === 'configuredFloor'
				? `coreFloor config value '${value}' is not a known tier (core|mid|cheap) — ` +
				  `fix the models.analyze.coreFloor / byRepo[...].coreFloor key`
				: `resolvedTier '${value}' is not a known tier (core|mid|cheap) — ` +
				  `the RoleRouter handed the CoreFloorGuard an off-contract tier`,
		);
		this.name = 'InvalidTierError';
	}
}

/** Look a tier up in the sc4 rankOf ordering, throwing InvalidTierError when off-contract. */
function rankOrThrow(tier: TierName, field: 'configuredFloor' | 'resolvedTier'): number {
	const rank = rankOf[tier];
	if (rank === undefined) throw new InvalidTierError(tier, field);
	return rank;
}

/**
 * Clamp a critical role's `resolvedTier` up to the effective floor
 * (`configuredFloor`, or the built-in default when absent); pass peripheral roles
 * through unchanged. Pure — no I/O beyond the clamp/anomaly log.
 *
 * @throws {InvalidTierError} on an off-contract `configuredFloor` or `resolvedTier`.
 */
export const applyCoreFloor: ApplyCoreFloor = (input) => {
	const { role, resolvedTier, configuredFloor } = input;

	// Fail-loud on an off-contract resolvedTier — we cannot rank an unknown tier.
	const resolvedRank = rankOrThrow(resolvedTier, 'resolvedTier');

	// Peripheral roles are never floored (ac3) — pass through even below the minimum.
	// A malformed criticality (neither 'critical' nor 'peripheral') fails SAFE to
	// the accuracy-preserving branch: treat as critical + clamp, and log the anomaly.
	const criticality = role.criticality;
	if (criticality === 'peripheral') {
		return { effectiveTier: resolvedTier, clamped: false };
	}
	if (criticality !== 'critical') {
		log.warn(
			{ roleId: role.id, criticality },
			'unclassifiable role.criticality — failing safe to critical (clamping to the effective floor)',
		);
	}

	// Critical (or fail-safe-critical): resolve the effective floor and clamp up if below it.
	const floorTier = configuredFloor ?? BUILT_IN_DEFAULT_FLOOR;
	const floorRank = rankOrThrow(floorTier, 'configuredFloor');

	if (resolvedRank < floorRank) {
		log.info(
			{ roleId: role.id, resolvedTier, floor: floorTier },
			'critical role below coreFloor — clamping up to the floor',
		);
		return { effectiveTier: floorTier, clamped: true, reason: 'below-core-floor' };
	}

	// At or above the floor — no spurious clamp (strict below-floor only).
	return { effectiveTier: resolvedTier, clamped: false };
};
