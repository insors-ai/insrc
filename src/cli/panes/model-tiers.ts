/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure overlay logic for the Model Tiers pane (standalone S001; Epic
 * ce99b72065d03b1b, Story s5).
 *
 * `computeEffectiveTiers` is the single source of truth the pane renders AND
 * edits against, so what the user sees and what a persisted edit resolves to
 * can never diverge. It overlays the config tiering (from `parseTiering`) onto
 * the daemon's model definitions (models.definitions) and the
 * `reasoningRoleTaxonomy()` role→tier defaults, then clamps critical roles up
 * to the `coreFloor` via the shipped `applyCoreFloor` guard. Every family,
 * model and effort the pane offers comes from the definitions answer; the TUI
 * holds no list of its own (k2). No I/O.
 */

import type { AnalyzeTiering, TierModel, TierName } from '../../config/analyze.js';
import type { Criticality } from '../../config/role-taxonomy.js';
import { reasoningRoleTaxonomy } from '../../config/role-taxonomy.js';
import { applyCoreFloor } from '../../config/core-floor-guard.js';
import type { ModelDefinitionsResult } from '../services/models.js';

type FamilyEntry = ModelDefinitionsResult['families'][number];
type ModelEntry = FamilyEntry['models'][number];

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

/** A tier as the pane shows it: the configured or default {runner, model, effort},
 *  and whether its family serves the model (an unserved one runs the tier default
 *  until it is approved and the daemon restarted). A family with a `host` runs a
 *  CLI on Ollama: its served model carries `hosting`, and a model it does not
 *  declare is `notSupported` (the tier does not run; nothing is substituted). */
export interface EffectiveTier extends TierModel {
	readonly served:       boolean;
	readonly hosting?:     'cloud' | 'local' | undefined;
	readonly notSupported: boolean;
}

export interface EffectiveTiers {
	/** The {runner,model,effort} backing each tier: config value or the definitions' default. */
	readonly tiers:           Readonly<Record<TierName, EffectiveTier>>;
	readonly tierSource:      Readonly<Record<TierName, 'config' | 'default'>>;
	readonly coreFloor:       TierName;
	readonly coreFloorSource: 'config' | 'default';
	readonly roles:           readonly EffectiveRole[];
	/** roleTiers keys in config that name no current taxonomy role (stale/renamed). */
	readonly staleOverrides:  readonly { readonly id: string; readonly tier: TierName }[];
}

export const TIER_NAMES: readonly TierName[] = ['core', 'mid', 'cheap'];

// ── lookups over the definitions answer ─────────────────────────────────────

export function familyOf(defs: ModelDefinitionsResult, id: string): FamilyEntry | undefined {
	return defs.families.find(f => f.id === id);
}

/** The model a family serves under `idOrAlias`, or undefined. */
export function servedModel(defs: ModelDefinitionsResult, familyId: string, idOrAlias: string): ModelEntry | undefined {
	return familyOf(defs, familyId)?.models.find(m => m.id === idOrAlias || m.aliases.includes(idOrAlias));
}

/** The tier a family would run by default: its tierDefaults[tier], else its
 *  tool-loop model with no effort (the local family), else its first model. */
export function familyDefaultTier(defs: ModelDefinitionsResult, familyId: string, tier: TierName): TierModel | undefined {
	const family = familyOf(defs, familyId);
	if (family === undefined) return undefined;
	const td = family.tierDefaults?.[tier];
	if (td !== undefined) {
		const model = servedModel(defs, familyId, td.model);
		return { runner: family.id, model: model?.id ?? td.model, ...(td.effort !== undefined ? { effort: td.effort } : {}) };
	}
	const pick = family.toolLoopModel ?? family.models[0]?.id;
	return pick !== undefined ? { runner: family.id, model: pick, effort: '' } : undefined;
}

/** Whether `familyId` serves `model`, and for a family with a host the model's
 *  hosting or that the model is not supported. */
function hostStatus(defs: ModelDefinitionsResult, familyId: string, model: string): Pick<EffectiveTier, 'served' | 'hosting' | 'notSupported'> {
	const served = servedModel(defs, familyId, model);
	const hosted = familyOf(defs, familyId)?.host !== undefined;
	return {
		served:       served !== undefined,
		...(hosted && served?.hosting !== undefined ? { hosting: served.hosting } : {}),
		notSupported: hosted && served === undefined,
	};
}

/**
 * Resolve the effective tiers, tier models, coreFloor, and per-role tiers by
 * overlaying `tiering` (config) onto the definitions' defaults + the role
 * taxonomy. A tier that does not survive parseTiering (unset, or an empty
 * model) shows the default family's tier default, with the configured effort
 * when tiering.efforts holds one (an explicit '' stays '') — the precedence the
 * daemon applies. Pure — safe to call on every render.
 */
export function computeEffectiveTiers(tiering: AnalyzeTiering, defs: ModelDefinitionsResult): EffectiveTiers {
	const tiers = {} as Record<TierName, EffectiveTier>;
	const tierSource = {} as Record<TierName, 'config' | 'default'>;
	for (const t of TIER_NAMES) {
		const configured = tiering.tiers?.[t];
		if (configured !== undefined) {
			tiers[t] = { ...configured, ...hostStatus(defs, configured.runner, configured.model) };
			tierSource[t] = 'config';
			continue;
		}
		const def = familyDefaultTier(defs, defs.defaultFamily, t);
		const effort = tiering.efforts?.[t] ?? def?.effort;
		const runner = def?.runner ?? defs.defaultFamily;
		const model  = def?.model ?? '';
		tiers[t] = { runner, model, ...(effort !== undefined ? { effort } : {}), ...(def !== undefined ? hostStatus(defs, runner, model) : { served: false, notSupported: false }) };
		tierSource[t] = 'default';
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

// ── tier edits (each yields the whole tier object the pane writes) ─────────

/** The config path a whole tier object is written at (one config.write per edit). */
export function tierPath(tier: TierName): string {
	return `models.tiers.${tier}`;
}

/** The tier after switching to `familyId`: that family's default for the tier. */
export function switchFamily(defs: ModelDefinitionsResult, tier: TierName, familyId: string): TierModel | undefined {
	return familyDefaultTier(defs, familyId, tier);
}

/** The tier after switching to a model its family serves: canonical id, and the
 *  current effort only when the new model accepts it. */
export function switchModel(defs: ModelDefinitionsResult, current: TierModel, idOrAlias: string): TierModel | undefined {
	const model = servedModel(defs, current.runner, idOrAlias);
	if (model === undefined) return undefined;
	const effort = current.effort !== undefined && current.effort !== '' && model.efforts.includes(current.effort) ? current.effort : '';
	return { runner: current.runner, model: model.id, effort };
}

/** The effort choices for a tier: '' (the CLI's default) then its model's efforts;
 *  none for a model its family does not serve. */
export function effortChoices(defs: ModelDefinitionsResult, current: TierModel): readonly string[] {
	const model = servedModel(defs, current.runner, current.model);
	return model === undefined ? [] : ['', ...model.efforts];
}

/** The item after `current` in `list`, wrapping; the first item when `current` is absent. */
export function nextInCycle(list: readonly string[], current: string | undefined): string | undefined {
	if (list.length === 0) return undefined;
	return list[(list.indexOf(current ?? '') + 1) % list.length];
}

/** What a typed model id means for a family: a model it serves (by id or alias),
 *  an id to check through the family's CLI, or a refusal (a family without a
 *  CLI, or one running its CLI on a host, only offers its listed models). */
export type TypedModel =
	| { readonly kind: 'served'; readonly model: string }
	| { readonly kind: 'check' }
	| { readonly kind: 'refused'; readonly reason: string };

export function resolveTypedModel(defs: ModelDefinitionsResult, familyId: string, typed: string): TypedModel {
	const model = servedModel(defs, familyId, typed);
	if (model !== undefined) return { kind: 'served', model: model.id };
	const family = familyOf(defs, familyId);
	if (family === undefined) return { kind: 'refused', reason: `unknown family ${familyId}` };
	if (family.cliKind === undefined || family.host !== undefined) return { kind: 'refused', reason: `only listed ${family.displayName} models are selectable` };
	return { kind: 'check' };
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
