/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * RoleRouter (Epic per-role-per-step, Story S003 — sc3).
 *
 * The single choke point that resolves a reasoning-model provider PER ROLE.
 * Every reasoning site names its RoleId; the router maps it to a capability
 * tier (roleTiers > taxonomy defaultTier), clamps critical roles up to the
 * configured coreFloor via the sc2 CoreFloorGuard, resolves the tier's
 * {runner, model}, and builds the concrete provider through the existing
 * CliProvider/Ollama path — never a direct REST backend (k1).
 *
 * Chosen shape (LLD a3 — two-phase split):
 *   - resolveRole(role, cfg, repoPath?)  → RoleResolution   (PURE — precedence
 *     merge + sc2 clamp, no provider constructed; the assertable heart of ac3).
 *   - materialize(resolution)            → ResolvedProvider (construction via
 *     buildShaperProvider/buildSummariserProvider, memoized per (role,repoPath)).
 *   resolveProviderForRole is their composition; consumers see only the router.
 *
 * Precedence (ac3): byRepo role tier → global role tier → taxonomy defaultTier,
 * clamped by the core floor (byRepo → global); the tier's runner, model and
 * effort then come ONLY from the global tier as the model registry resolved it
 * (Epic ce99b72065d03b1b s3) — a repo picks a tier for a role, never the model
 * behind it.
 *
 * Scope: S003 reroutes only the run-wide workflow seam (prepareWorkflowRun); the
 * ~11 per-operation analyze buildShaperProvider sites are S005. Per-output model
 * attribution (sc5) is S004 — the router only guarantees a resolution record is
 * attached.
 */

import type { AnalyzeConfig, AnalyzeShaperProviderKind, TierEffort, TierName, TierModel } from '../../config/analyze.js';
import type { FallbackReason, ModelRegistry } from '../../daemon/model-registry.js';
import type { RoleId } from '../../config/role-taxonomy.js';
import { roleDescriptor } from '../../config/role-taxonomy.js';
import { applyCoreFloor } from '../../config/core-floor-guard.js';
import { buildShaperProvider, buildSummariserProvider, resolveShaperKind } from './shaper-provider.js';
import type { LLMProvider } from '../../shared/types.js';

/** Tier used for a RoleId outside the closed taxonomy (total function — the
 *  router never throws for an unknown role; it simply gets no floor protection). */
const UNKNOWN_ROLE_TIER: TierName = 'mid';

/** Fixed role attributed to the background doc-summariser. */
const SUMMARISER_ROLE: RoleId = 'indexer.summarise';

/** The side-effect-free record every resolution emits (sc3). Produced by the
 *  pure resolveRole BEFORE any construction, so ac3 precedence + the sc2 floor
 *  clamp are assertable at zero subprocess cost. `runner` is the type-level
 *  surface of the k1 no-REST invariant. */
export interface RoleResolution {
	readonly role:           RoleId;
	readonly tier:           TierName;
	readonly runner:         AnalyzeShaperProviderKind;
	readonly model:          string;
	/** The reasoning effort of the global tier the role resolves to; absent:
	 *  the CLI's default. */
	readonly effort?:        TierEffort | undefined;
	readonly clampedByFloor: boolean;
	/** Set when the tier's configured model was rejected or unlisted and the
	 *  tier default ran instead (decision A). */
	readonly fallback?:      { readonly reason: FallbackReason; readonly requested: string } | undefined;
}

/** The RoleRouter return shape (sc3): a constructed provider + its resolution. */
export interface ResolvedProvider {
	readonly provider:   LLMProvider;
	readonly resolution: RoleResolution;
}

/** Construction deps carried by a RoleRouter instance (per the run): the
 *  per-run client default and the CLI timeout (which feed the resolveShaperKind
 *  fallback chain BELOW any tier assignment), and the registry the providers
 *  are built from (default: the daemon thread's getModelRegistry()). */
export interface RoleRouterDeps {
	readonly clientDefault?: AnalyzeShaperProviderKind | undefined;
	readonly cliTimeoutMs?:  number | undefined;
	readonly registry?:      ModelRegistry | undefined;
}

/** The sc3 public surface. */
export interface RoleRouter {
	/** Resolve (and memoize per (role,repoPath)) the provider for a reasoning role. */
	resolveProviderForRole(role: RoleId, cfg: AnalyzeConfig, repoPath?: string): ResolvedProvider;
	/** Resolve the background doc-summariser (follows the cheap tier, k-summariser). */
	resolveSummariser(cfg: AnalyzeConfig): ResolvedProvider;
}

/** resolveRole's result plus the private tier-model signal materialize needs to
 *  decide whether to pin roleRunner/roleModel (tier-defined) or fall through to
 *  the legacy path (undefined). Internal — the public shape is RoleResolution. */
interface InternalResolution {
	readonly resolution: RoleResolution;
	readonly roleRunner?: AnalyzeShaperProviderKind | undefined;
	readonly roleModel?:  string | undefined;
}

function resolveRoleInternal(
	role:     RoleId,
	cfg:      AnalyzeConfig,
	repoPath: string | undefined,
	deps:     RoleRouterDeps,
): InternalResolution {
	const byRepo = repoPath !== undefined ? cfg.tiering.byRepo?.[repoPath] : undefined;
	const descriptor = roleDescriptor(role);

	// 1. Tier assignment (ac3): byRepo roleTiers → global roleTiers → taxonomy
	//    defaultTier → unknown-role default. A roleTiers value pointing at a
	//    non-existent tier still names a valid TierName (parseTiering guarantees
	//    it), so the assignment is always a TierName; a missing tiers[] entry is
	//    handled at step 3 by falling to the legacy model.
	const assignedTier: TierName =
		byRepo?.roleTiers?.[role] ?? cfg.tiering.roleTiers?.[role] ?? descriptor?.defaultTier ?? UNKNOWN_ROLE_TIER;

	// 2. Core-floor clamp — critical roles only (the guard passes peripheral +
	//    unknown roles through). The guard applies its built-in default when the
	//    merged floor is absent; precedence of the floor (byRepo > global) is
	//    resolved HERE (the merge the s2 guard deliberately does not do).
	let tier = assignedTier;
	let clampedByFloor = false;
	if (descriptor !== undefined) {
		const mergedFloor = byRepo?.coreFloor ?? cfg.tiering.coreFloor;
		const outcome = applyCoreFloor({
			role:         descriptor,
			resolvedTier: assignedTier,
			...(mergedFloor !== undefined ? { configuredFloor: mergedFloor } : {}),
		});
		tier = outcome.effectiveTier;
		clampedByFloor = outcome.clamped;
	}

	// 3. Tier model: the global tier as loadAnalyzeConfig resolved it through
	//    the registry (always present on a loaded config; the legacy chain below
	//    covers a hand-built config without tiers).
	const globalExplicit = cfg.shaperProviderExplicit ? cfg.shaperProvider : undefined;
	const tierModel: TierModel | undefined = cfg.tiering.tiers?.[tier];

	// Effective runner: the tier's runner (top priority via resolveShaperKind's
	// roleResolved) or, absent a tier model, the legacy chain. This is the SAME
	// admission point materialize's buildShaperProvider will use, so the record
	// and the constructed provider agree on the runner (k1 centralized).
	const runner = resolveShaperKind({
		globalExplicit,
		clientDefault:  deps.clientDefault,
		roleResolved:   tierModel?.runner,
	});
	const model = tierModel?.model ?? cfg.shaperModel;
	const effort = tierModel?.effort;
	const fallback = cfg.tierResolutions?.[tier]?.fallback;

	return {
		resolution: { role, tier, runner, model, ...(effort !== undefined ? { effort } : {}), clampedByFloor, ...(fallback !== undefined ? { fallback } : {}) },
		...(tierModel !== undefined ? { roleRunner: tierModel.runner, roleModel: tierModel.model } : {}),
	};
}

/**
 * Pure precedence-merge + sc2 floor clamp → RoleResolution, with ZERO provider
 * construction. Exposed for unit tests (the assertable heart of ac3 + the floor).
 */
export function resolveRole(
	role:      RoleId,
	cfg:       AnalyzeConfig,
	repoPath:  string | undefined,
	deps:      RoleRouterDeps = {},
): RoleResolution {
	return resolveRoleInternal(role, cfg, repoPath, deps).resolution;
}

/** Build the concrete provider for an already-resolved role. Feeds the tier's
 *  runner/model through ShaperProviderOverrides so a mid/cheap CLI tier can pin
 *  a concrete model (e.g. sonnet/haiku) that cfg.shaperModel alone cannot
 *  express; the legacy precedence inside buildShaperProvider is untouched. */
function materialize(internal: InternalResolution, cfg: AnalyzeConfig, deps: RoleRouterDeps): ResolvedProvider {
	const provider = buildShaperProvider(cfg, {
		...(deps.clientDefault !== undefined ? { clientDefault: deps.clientDefault } : {}),
		...(deps.registry      !== undefined ? { registry:      deps.registry      } : {}),
		...(deps.cliTimeoutMs  !== undefined ? { cliTimeoutMs:  deps.cliTimeoutMs  } : {}),
		...(internal.roleRunner !== undefined ? { roleRunner: internal.roleRunner } : {}),
		...(internal.roleModel  !== undefined ? { roleModel:  internal.roleModel  } : {}),
		// Always stated, null when the tier has none, so a routed role never runs at core's effort.
		roleEffort: internal.resolution.effort ?? null,
	});
	return { provider, resolution: internal.resolution };
}

/**
 * Construct a RoleRouter for one run. Holds a per-(role,repoPath) memo so
 * repeated per-step resolutions never rebuild a CliProvider subprocess wrapper.
 */
export function createRoleRouter(deps: RoleRouterDeps = {}): RoleRouter {
	const cache = new Map<string, ResolvedProvider>();
	return {
		resolveProviderForRole(role, cfg, repoPath) {
			const key = `${role} ${repoPath ?? ''}`;
			const hit = cache.get(key);
			if (hit !== undefined) return hit;
			const built = materialize(resolveRoleInternal(role, cfg, repoPath, deps), cfg, deps);
			cache.set(key, built);
			return built;
		},
		resolveSummariser(cfg) {
			// Delegate to the summariser factory so the summariser's own provider
			// rule (it follows the cheap tier) is wrapped, not re-implemented; stamp a resolution so
			// summariser access is attributed like every other role.
			const provider = buildSummariserProvider(cfg, deps.registry !== undefined ? { registry: deps.registry } : undefined);
			const fallback = cfg.tierResolutions?.cheap?.fallback;
			const resolution: RoleResolution = {
				role:           SUMMARISER_ROLE,
				tier:           'cheap',
				runner:         cfg.summariserProvider,
				model:          cfg.summariserModel,
				...(cfg.summariserEffort !== undefined ? { effort: cfg.summariserEffort } : {}),
				clampedByFloor: false,
				...(fallback !== undefined ? { fallback } : {}),
			};
			return { provider, resolution };
		},
	};
}
