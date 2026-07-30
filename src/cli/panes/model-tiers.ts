/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure overlay logic for the Model Tiers pane (standalone S001).
 *
 * `computeEffectiveTiers` is the single source of truth the pane renders AND
 * edits against, so what the user sees and what a persisted edit resolves to
 * can never diverge. It overlays the config tiering (from `parseTiering`) onto
 * the built-in `DEFAULT_TIERS` and the `reasoningRoleTaxonomy()` role→tier
 * defaults, then clamps critical roles up to the `coreFloor` via the shipped
 * `applyCoreFloor` guard. No I/O — the pane does all config read/write through
 * the daemon-owned config service.
 */

import type { AnalyzeTiering, TierModel, TierName } from '../../config/analyze.js';
import { DEFAULT_TIERS } from '../../config/analyze.js';
import type { Criticality } from '../../config/role-taxonomy.js';
import { reasoningRoleTaxonomy } from '../../config/role-taxonomy.js';
import { applyCoreFloor } from '../../config/core-floor-guard.js';

/** The coreFloor applied when none is configured — mirrors the guard's built-in default. */
export const DEFAULT_CORE_FLOOR: TierName = 'mid';

export interface EffectiveRole {
	readonly id:            string;
	readonly criticality:   Criticality;
	/** Tier assigned by roleTiers override or the taxonomy default (pre-clamp). */
	readonly assignedTier:  TierName;
	/** Tier actually used after the coreFloor clamp (>= floor for critical roles). */
	readonly effectiveTier: TierName;
	/** True when the coreFloor raised this critical role above its assignment. */
	readonly clamped:       boolean;
	/** Where the assignment came from. */
	readonly source:        'taxonomy' | 'override';
}

export interface EffectiveTiers {
	/** The {runner,model} backing each tier: config value or the built-in default. */
	readonly tiers:           Readonly<Record<TierName, TierModel>>;
	readonly tierSource:      Readonly<Record<TierName, 'config' | 'default'>>;
	readonly coreFloor:       TierName;
	readonly coreFloorSource: 'config' | 'default';
	readonly roles:           readonly EffectiveRole[];
	/** roleTiers keys in config that name no current taxonomy role (stale/renamed). */
	readonly staleOverrides:  readonly { readonly id: string; readonly tier: TierName }[];
}

const TIER_NAMES: readonly TierName[] = ['core', 'mid', 'cheap'];

/**
 * Resolve the effective tiers, tier models, coreFloor, and per-role tiers by
 * overlaying `tiering` (config) onto DEFAULT_TIERS + the role taxonomy.
 * Pure — safe to call on every render.
 */
export function computeEffectiveTiers(tiering: AnalyzeTiering): EffectiveTiers {
	const tiers: Record<TierName, TierModel> = { core: DEFAULT_TIERS.core, mid: DEFAULT_TIERS.mid, cheap: DEFAULT_TIERS.cheap };
	const tierSource: Record<TierName, 'config' | 'default'> = { core: 'default', mid: 'default', cheap: 'default' };
	for (const t of TIER_NAMES) {
		const configured = tiering.tiers?.[t];
		if (configured !== undefined) { tiers[t] = configured; tierSource[t] = 'config'; }
	}

	const coreFloor: TierName = tiering.coreFloor ?? DEFAULT_CORE_FLOOR;
	const coreFloorSource: 'config' | 'default' = tiering.coreFloor !== undefined ? 'config' : 'default';

	const taxonomy = reasoningRoleTaxonomy();
	const roleIds = new Set(taxonomy.roles.map(r => r.id));

	const roles: EffectiveRole[] = taxonomy.roles.map(r => {
		const override = tiering.roleTiers?.[r.id];
		const assignedTier: TierName = override ?? r.defaultTier;
		const outcome = applyCoreFloor({ role: r, resolvedTier: assignedTier, configuredFloor: tiering.coreFloor });
		return {
			id:            r.id,
			criticality:   r.criticality,
			assignedTier,
			effectiveTier: outcome.effectiveTier,
			clamped:       outcome.clamped,
			source:        override !== undefined ? 'override' : 'taxonomy',
		};
	});

	// roleTiers entries naming a role the taxonomy no longer has — surfaced, never dropped.
	const staleOverrides = Object.entries(tiering.roleTiers ?? {})
		.filter(([id]) => !roleIds.has(id))
		.map(([id, tier]) => ({ id, tier }));

	return { tiers, tierSource, coreFloor, coreFloorSource, roles, staleOverrides };
}

/** The config dot-path for a tier's runner/model field (for config.write). */
export function tierFieldPath(tier: TierName, field: 'runner' | 'model'): string {
	return `models.tiers.${tier}.${field}`;
}

/** The config dot-path for a role's tier override.
 *  WARNING: role ids contain dots (e.g. "context.assemble"), so this per-role
 *  dotted path CANNOT be handed to `config.write` — the daemon splits on every
 *  '.' and would mis-nest the leaf (roleTiers.context.assemble) where
 *  parseTiering expects the flat key tasks["context.assemble"]. Write the
 *  whole map at `ROLE_TIERS_PATH` via `nextRoleTiers` instead. Retained only
 *  for display / reference. */
export function roleTierPath(roleId: string): string {
	return `models.tasks.${roleId}`;
}

/** The dotless config path for the ENTIRE task→tier map (`models.tasks`). The
 *  map is written whole (not per-role) so role ids keep their dots as flat
 *  keys. */
export const ROLE_TIERS_PATH = 'models.tasks';

/** Compute the sparse roleTiers map to persist after setting `roleId` to
 *  `tier`, or clearing its override when `tier` is null. Role ids stay FLAT
 *  keys (they contain dots). Pure — the pane writes the result at
 *  `ROLE_TIERS_PATH`. */
export function nextRoleTiers(
	current: Readonly<Record<string, TierName>> | undefined,
	roleId: string,
	tier: TierName | null,
): Record<string, TierName> {
	const next: Record<string, TierName> = { ...(current ?? {}) };
	if (tier === null) delete next[roleId];
	else next[roleId] = tier;
	return next;
}

/** The config dot-path for the coreFloor. */
export const CORE_FLOOR_PATH = 'models.coreFloor';

/** Whether `v` is a valid tier name (for edit validation). */
export function isTierName(v: string): v is TierName {
	return v === 'core' || v === 'mid' || v === 'cheap';
}
