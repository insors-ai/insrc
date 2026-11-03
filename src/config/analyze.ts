/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Analyze-framework config loader.
 *
 * Models are named in ONE place — the three `models.tiers.{core,mid,cheap}`
 * entries. Everything else is DERIVED: the interactive shaper provider/model
 * from `tiers.core`, the background summariser from `tiers.cheap`. This loader
 * reads the flat `models.*` surface:
 *   - models.tiers / models.tasks / models.coreFloor / models.byRepo — tiering
 *   - models.shaper.maxToolTurns / .structuredOutputRetries /
 *     .ollamaNumPredict  -- shaper runtime knobs (NOT model specs)
 *   - models.maxPlanDepth.{XS,S,M,L,XL}
 *
 * Read from `~/.insrc/config.json` if present, else fall back to defaults
 * declared below. Cached in-process for the daemon's lifetime; main() drops
 * the cache once, right after the boot reconcile (`resetAnalyzeConfigCache()`).
 *
 * See: design/analyze-context-builder.md "Configuration"
 *      docs/plans/analyze-context-builder.md Phase 3
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from '../shared/logger.js';
import { PATHS } from '../shared/paths.js';
import type { EffortLevel, FamilyId } from '../daemon/model-catalog.js';
import { getModelRegistry, type ModelRegistry, type TierResolution, type TierSetting } from '../daemon/model-registry.js';
import { SHIPPED_MODEL_DEFAULTS } from './model-defaults.js';

const log = getLogger('config:analyze');

export interface AnalyzeShaperConfig {
	readonly maxToolTurns:            number;
	readonly structuredOutputRetries: number;
	/**
	 * Max output tokens (num_predict) for the shaper's structured-output
	 * call. The Ollama provider's default is 8192, which the code +
	 * generic shapers routinely exceed -- they emit a multi-section
	 * markdown bundle (system / focus / summary / structure / surface /
	 * artefacts / upstream) that easily exceeds 8K tokens for non-trivial
	 * scopes. Truncation surfaces as
	 *   "Unterminated string in JSON at position N"
	 * with retries exhausted -> shaper-schema-unrecoverable.
	 *
	 * 20480 gives the model ~2.5x headroom over 8192 without eating into
	 * the prompt half of the model's context window (its token inputLimit in
	 * the model definitions).
	 * Bump higher via config.json `models.shaper.ollamaNumPredict`
	 * for XL-scope runs on large workspaces.
	 */
	readonly ollamaNumPredict:        number;
}

/**
 * Max Plan-tree depth keyed by the ROOT Run's measured scope.
 * Per design/analyze-plan-builder.md "XL -> planner-template tasks":
 * "The cap is the absolute ceiling across the whole tree; each Plan
 * Builder invocation knows its currentDepth and refuses to invoke
 * when currentDepth + 1 would exceed the root's ceiling."
 *
 * Defaults match the design: XS 2, S 3, M 4, L 5, XL 6.
 */
export interface MaxPlanDepthMap {
	readonly XS: number;
	readonly S:  number;
	readonly M:  number;
	readonly L:  number;
	readonly XL: number;
}

/**
 * Which LLM backend powers the shaper's structured-output calls
 * (decomposer + synthesizer + narrow-LLM explorations + classifier
 * + planner + summariser). Introduced for the MCP-integration
 * scenario: when the analyze framework is invoked from Claude Code
 * or Codex as an MCP tool, the outer LLM is the reasoning engine
 * so the daemon routes its own LLM calls to the same family via
 * `CliProvider`. Ollama remains the default for standalone (CLI +
 * IDE) usage.
 *
 * NOTE: the tool-loop path in `analyze/context/driver.ts`
 * (freeform.probe + classification + task modes) still requires an
 * Ollama-family provider because `CliProvider.supportsTools ===
 * false`. Those code paths continue to build their own Ollama
 * provider regardless of this setting.
 */
export type AnalyzeShaperProviderKind = FamilyId;

// ---------------------------------------------------------------------------
// Per-role model tiering (Epic per-role-per-step, Story S001 — sc1).
//
// The flat models.* surface: three capability tiers (`models.tiers`), a
// task→tier assignment map (`models.tasks`, internal field `roleTiers`), a
// coreFloor guarantee (enforced downstream by S002), and per-repo overrides
// (`models.byRepo`). `tiers` is the ONLY place a model is named — shaper +
// summariser derive from it. The RoleRouter (S003) consumes this schema + the
// ReasoningRoleTaxonomy (sc4).
// ---------------------------------------------------------------------------

/** The three capability tiers, ordered cheap < mid < core (see RoleTaxonomy.rankOf). */
export type TierName = 'core' | 'mid' | 'cheap';

/** The model backing one tier. `runner` is closed to the k1 CLI/Ollama set so no
 *  tier can reach a direct cloud REST path (reuses AnalyzeShaperProviderKind). */
export interface TierModel {
	readonly runner: AnalyzeShaperProviderKind;
	readonly model:  string;
	/** The reasoning effort the tier's CLI runs at; absent: the CLI's own default.
	 *  Set on the global tiers only (a per-repo tier never carries one). */
	readonly effort?: TierEffort | undefined;
}

/** An effort level name (the definitions file is the authority for level names). */
export type TierEffort = EffortLevel;

/** Sparse RoleId → tier map; a role absent here uses its RoleDescriptor.defaultTier. */
export type RoleTierAssignment = Readonly<Record<string, TierName>>;

/** What a repo may choose (models.byRepo[repo]): the tier for a role and the
 *  core floor — never the model behind a tier. */
export interface RepoTiering {
	readonly roleTiers?: RoleTierAssignment | undefined;
	readonly coreFloor?: TierName | undefined;
}

/** The global tiering knobs: the tiers (set globally only) plus what a repo may also choose. */
export interface TieringOverride extends RepoTiering {
	readonly tiers?:     Readonly<Partial<Record<TierName, TierModel>>> | undefined;
	/** Global scope only: each tier entry's valid effort, kept even when the tier
	 *  itself was dropped (an empty or invalid model), so the shipped-default fallback
	 *  still runs at the configured effort. */
	readonly efforts?:   Readonly<Partial<Record<TierName, TierEffort>>> | undefined;
}

/** The full parsed models.* tiering shape (sc1). Always present on
 *  AnalyzeConfig; empty (all fields absent) when no tiering config is set, in
 *  which case resolution is identical to the legacy single-provider path. */
export interface AnalyzeTiering extends TieringOverride {
	readonly byRepo?: Readonly<Record<string, RepoTiering>> | undefined;
}

export interface AnalyzeConfig {
	/** Interactive shaper backend. DERIVED from `models.tiers.core.runner`. */
	readonly shaperProvider: AnalyzeShaperProviderKind;
	/** True when `models.tiers.core` was set in config.json (vs. defaulted).
	 *  When false, the shaper factory may auto-pick a provider from the
	 *  invoking MCP client (claude → cli-claude, codex → cli-codex). */
	readonly shaperProviderExplicit: boolean;
	/** Interactive shaper model. DERIVED from `models.tiers.core.model`. */
	readonly shaperModel:    string;
	/** True when `models.tiers.core.model` was set to a non-empty value. An
	 *  Ollama id must NOT be forwarded to a CLI provider unless set explicitly;
	 *  an empty core model means "the CLI's own default". */
	readonly shaperModelExplicit: boolean;
	/** Provider for BACKGROUND doc-summarisation during indexing. DERIVED from
	 *  `models.tiers.cheap.runner`, so it follows the cheap tier: a CLI by
	 *  default (haiku), because not every machine can run a local model, and
	 *  one CLI call per doc is serial and uses quota. Set the cheap tier to
	 *  `ollama` to keep summarising local. See analyze/summariser/driver.ts. */
	readonly summariserProvider: AnalyzeShaperProviderKind;
	/** Summariser model. DERIVED from `models.tiers.cheap.model` (`haiku` by
	 *  default). */
	readonly summariserModel:    string;
	/** The core tier's reasoning effort (DERIVED from `models.tiers.core.effort`). */
	readonly shaperEffort?:      TierEffort | undefined;
	/** The cheap tier's reasoning effort (DERIVED from `models.tiers.cheap.effort`). */
	readonly summariserEffort?:  TierEffort | undefined;
	readonly shaper:         AnalyzeShaperConfig;
	readonly maxPlanDepth:   MaxPlanDepthMap;
	/** Per-role model tiering (sc1). `tiers` is always fully populated (parsed
	 *  override merged over the shipped defaults) so the RoleRouter resolves a concrete
	 *  tier for every role. */
	readonly tiering:        AnalyzeTiering;
	/** Each global tier's resolution through the model registry, including any
	 *  fallback (decision A) and dropped effort, for the router and
	 *  models.resolveRole to report. */
	readonly tierResolutions: Readonly<Record<TierName, TierResolution>>;
}

/**
 * Defaults sit at sane v1 starting points. `maxToolTurns: 40` matches
 * the design doc; `structuredOutputRetries: 3` matches the Ollama
 * provider's own default. An Ollama model's context window is its token
 * inputLimit in the model definitions.
 */
const DEFAULT_SHAPER: AnalyzeShaperConfig = {
	maxToolTurns:            40,
	structuredOutputRetries: 3,
	ollamaNumPredict:        20_480,
};

/**
 * Design defaults for max Plan-tree depth per root scope bucket.
 * XS: a single function rarely needs recursion (2 deep).
 * XL: org -> repo cluster -> repo -> family -> module -> central
 *     component (6 deep).
 */
const DEFAULT_MAX_PLAN_DEPTH: MaxPlanDepthMap = {
	XS: 2,
	S:  3,
	M:  4,
	L:  5,
	XL: 6,
};

let cached: AnalyzeConfig | undefined;

/** The setting the registry resolves for a tier: the configured runner and
 *  model, else (an unset tier, or one whose model is '') the default family's
 *  tier default with its effort. A configured effort wins over the default's;
 *  '' asks for the CLI's own default (no effort). */
function tierSetting(tiering: TieringOverride, tier: TierName, registry: ModelRegistry): TierSetting {
	const configured = tiering.tiers?.[tier];
	// The efforts entry ('' included) wins; else the tier's own effort.
	const effort = tiering.efforts?.[tier] ?? configured?.effort;
	if (configured !== undefined) {
		return { runner: configured.runner, model: configured.model, ...(effort ? { effort } : {}) };
	}
	const family = registry.defaultFamily();
	const def = registry.tierDefault(family, tier);
	const chosen = effort ?? def.effort;
	return { runner: family, model: def.model, ...(chosen ? { effort: chosen } : {}) };
}

/** Resolve one global tier through the registry, logging a dropped effort and a
 *  fallback (decision A). */
export function resolveTierWith(tiering: TieringOverride, tier: TierName, registry: ModelRegistry): TierResolution {
	const resolution = registry.resolveTier(tier, tierSetting(tiering, tier, registry));
	if (resolution.model === undefined) {
		log.warn({ tier, runner: resolution.family, requested: resolution.fallback?.requested, reason: resolution.fallback?.reason },
			`models.tiers.${tier}: model '${resolution.fallback?.requested}' is not supported by ${resolution.family} (model-not-supported); the tier will not run`);
		return resolution;
	}
	if (resolution.droppedEffort !== undefined) {
		log.warn({ tier, model: resolution.model.id, effort: resolution.droppedEffort },
			`models.tiers.${tier}: model ${resolution.model.id} does not accept effort '${resolution.droppedEffort}'; running at the CLI's default effort`);
	}
	if (resolution.fallback !== undefined) {
		log.warn({ tier, requested: resolution.fallback.requested, reason: resolution.fallback.reason, model: resolution.model.id },
			`models.tiers.${tier}: model '${resolution.fallback.requested}' is ${resolution.fallback.reason === 'rejected-model' ? 'rejected' : 'not listed'} (${resolution.fallback.reason}); using the tier default ${resolution.model.id}`);
	}
	return resolution;
}

function tierModelOf(r: TierResolution): TierModel {
	// A refused tier reports what was set; its fallback says why it is not used.
	return { runner: r.family, model: r.model?.id ?? r.fallback?.requested ?? '', ...(r.effort !== undefined ? { effort: r.effort } : {}) };
}

/** The tier as the registry resolves it (canonical model id, accepted effort).
 *  `registry` defaults to the daemon thread's registry; a client process passes
 *  its own (the TUI's shipped-only registry). */
export function resolveTier(tiering: TieringOverride, tier: TierName, registry: ModelRegistry = getModelRegistry()): TierModel {
	return tierModelOf(resolveTierWith(tiering, tier, registry));
}

/**
 * Assemble the AnalyzeConfig from a parsed tiering + runtime knobs. Models are
 * DERIVED from the tiers — the shaper (interactive reasoning) from `tiers.core`,
 * the summariser (background) from `tiers.cheap`. The shaper's `*Explicit` flags
 * reflect whether that tier was actually set in config (vs. a built-in default),
 * preserving the "don't forward an unset default to a CLI / auto-pick from the
 * MCP client" behaviour the downstream shaper factory relies on. The summariser
 * has no such flag: it always follows the cheap tier and pins its model.
 */
export function assembleConfig(
	tiering:      AnalyzeTiering,
	shaper:       AnalyzeShaperConfig,
	maxPlanDepth: MaxPlanDepthMap,
	registry:     ModelRegistry = getModelRegistry(),
): AnalyzeConfig {
	const tierResolutions: Record<TierName, TierResolution> = {
		core:  resolveTierWith(tiering, 'core', registry),
		mid:   resolveTierWith(tiering, 'mid', registry),
		cheap: resolveTierWith(tiering, 'cheap', registry),
	};
	const tiers: Record<TierName, TierModel> = {
		core:  tierModelOf(tierResolutions.core),
		mid:   tierModelOf(tierResolutions.mid),
		cheap: tierModelOf(tierResolutions.cheap),
	};
	return {
		shaperProvider:          tiers.core.runner,
		shaperProviderExplicit:  tiering.tiers?.core !== undefined,
		shaperModel:             tiers.core.model,
		shaperModelExplicit:     (tiering.tiers?.core?.model ?? '') !== '',
		summariserProvider:      tiers.cheap.runner,
		summariserModel:         tiers.cheap.model,
		...(tiers.core.effort  !== undefined ? { shaperEffort:     tiers.core.effort }  : {}),
		...(tiers.cheap.effort !== undefined ? { summariserEffort: tiers.cheap.effort } : {}),
		shaper,
		maxPlanDepth,
		tiering: { ...tiering, tiers },
		tierResolutions,
	};
}

/**
 * The analyze config, with every global tier resolved through `registry`
 * (default: this daemon thread's registry, cached; an explicit registry — the
 * TUI's shipped-only one — gets a fresh, uncached read).
 */
export function loadAnalyzeConfig(registry?: ModelRegistry): AnalyzeConfig {
	if (registry !== undefined) return readAnalyzeConfig(registry);
	cached ??= readAnalyzeConfig(getModelRegistry());
	return cached;
}

function readAnalyzeConfig(registry: ModelRegistry): AnalyzeConfig {
	if (!existsSync(PATHS.config)) {
		return assembleConfig({}, DEFAULT_SHAPER, DEFAULT_MAX_PLAN_DEPTH, registry);
	}

	try {
		const raw = JSON.parse(readFileSync(PATHS.config, 'utf8')) as Record<string, unknown>;
		const models = isObject(raw['models']) ? (raw['models'] as Record<string, unknown>) : {};
		const shaperObj = isObject(models['shaper'])
			? (models['shaper'] as Record<string, unknown>)
			: {};
		const depthObj = isObject(models['maxPlanDepth'])
			? (models['maxPlanDepth'] as Record<string, unknown>)
			: {};

		const shaper: AnalyzeShaperConfig = {
			maxToolTurns:
				typeof shaperObj['maxToolTurns'] === 'number'
					? (shaperObj['maxToolTurns'] as number)
					: DEFAULT_SHAPER.maxToolTurns,
			structuredOutputRetries:
				typeof shaperObj['structuredOutputRetries'] === 'number'
					? (shaperObj['structuredOutputRetries'] as number)
					: DEFAULT_SHAPER.structuredOutputRetries,
			ollamaNumPredict:
				typeof shaperObj['ollamaNumPredict'] === 'number'
					? (shaperObj['ollamaNumPredict'] as number)
					: DEFAULT_SHAPER.ollamaNumPredict,
		};
		const maxPlanDepth: MaxPlanDepthMap = {
			XS: typeof depthObj['XS'] === 'number' ? (depthObj['XS'] as number) : DEFAULT_MAX_PLAN_DEPTH.XS,
			S:  typeof depthObj['S']  === 'number' ? (depthObj['S']  as number) : DEFAULT_MAX_PLAN_DEPTH.S,
			M:  typeof depthObj['M']  === 'number' ? (depthObj['M']  as number) : DEFAULT_MAX_PLAN_DEPTH.M,
			L:  typeof depthObj['L']  === 'number' ? (depthObj['L']  as number) : DEFAULT_MAX_PLAN_DEPTH.L,
			XL: typeof depthObj['XL'] === 'number' ? (depthObj['XL'] as number) : DEFAULT_MAX_PLAN_DEPTH.XL,
		};

		return assembleConfig(parseTiering(models), shaper, maxPlanDepth, registry);
	} catch (err) {
		log.warn(
			{ err: (err as Error).message },
			'failed to parse config.json; using analyze defaults',
		);
		return assembleConfig({}, DEFAULT_SHAPER, DEFAULT_MAX_PLAN_DEPTH, registry);
	}
}

function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// ---------------------------------------------------------------------------
// Tiering parse (sc1). Lenient + validating: an invalid member (unknown tier,
// non-k1 runner, non-TierName coreFloor) is dropped with a warn rather than
// throwing, matching this loader's fail-soft contract — a partially-bad tiering
// block never breaks config load. (Strict rejection + byRepo-vs-registry
// cross-checks resolve at S003, where the repo registry is in scope.)
// ---------------------------------------------------------------------------

const TIER_NAMES: readonly TierName[] = ['core', 'mid', 'cheap'];
function isTierName(x: unknown): x is TierName {
	return typeof x === 'string' && (TIER_NAMES as readonly string[]).includes(x);
}
/** A model family id (the shipped definitions' families). */
function isRunner(x: unknown): x is AnalyzeShaperProviderKind {
	return typeof x === 'string' && SHIPPED_MODEL_DEFAULTS.familyIds.includes(x);
}

/** A global tier entry's effort: any level name ('' asks for the CLI's own
 *  default); absent is none. Whether the tier's model accepts it is decided at
 *  resolution by the registry. A non-string is dropped with a warning. */
function effortOf(raw: unknown, tier: TierName): TierEffort | undefined {
	if (raw === undefined || typeof raw === 'string') return raw;
	log.warn({ tier, effort: raw }, 'models.tiers[tier].effort: expected an effort level name; ignored');
	return undefined;
}

/** Parse one TieringOverride from a config object: tiers (global only — a
 *  repo picks a tier for a role but never sets the model behind it), tasks and
 *  coreFloor. Note: the on-disk key is `tasks`; the internal AnalyzeTiering
 *  field is `roleTiers` (the RoleRouter + core-floor guard consume `roleTiers`). */
function parseTieringOverride(src: Record<string, unknown>, where: string): TieringOverride {
	const out: { tiers?: Partial<Record<TierName, TierModel>>; roleTiers?: Record<string, TierName>; coreFloor?: TierName; efforts?: Partial<Record<TierName, TierEffort>> } = {};

	if (where === 'global' && isObject(src['tiers'])) {
		const tiers: Partial<Record<TierName, TierModel>> = {};
		const efforts: Partial<Record<TierName, TierEffort>> = {};
		for (const [tier, val] of Object.entries(src['tiers'])) {
			if (!isTierName(tier)) { log.warn({ where, tier }, 'models.tiers: unknown tier name; ignored'); continue; }
			const runner = isObject(val) ? val['runner'] : undefined;
			const model  = isObject(val) ? val['model']  : undefined;
			// Kept even when the tier itself is dropped, so the tier default runs at it.
			const effort = effortOf(isObject(val) ? val['effort'] : undefined, tier);
			if (effort !== undefined) efforts[tier] = effort;
			// A '' model leaves the tier unset: it resolves to the tier default.
			if (model === '') continue;
			if (!isRunner(runner) || typeof model !== 'string') {
				log.warn({ where, tier }, `models.tiers[tier]: expected { runner: ${SHIPPED_MODEL_DEFAULTS.familyIds.join('|')}, model: string }; ignored`);
				continue;
			}
			tiers[tier] = { runner, model, ...(effort ? { effort } : {}) };
		}
		if (Object.keys(tiers).length > 0) out.tiers = tiers;
		if (Object.keys(efforts).length > 0) out.efforts = efforts;
	}

	if (isObject(src['tasks'])) {
		const roleTiers: Record<string, TierName> = {};
		for (const [role, tier] of Object.entries(src['tasks'])) {
			if (!isTierName(tier)) { log.warn({ where, role, tier }, 'models.tasks[role]: not a tier name; ignored'); continue; }
			roleTiers[role] = tier;
		}
		if (Object.keys(roleTiers).length > 0) out.roleTiers = roleTiers;
	}

	const floor = src['coreFloor'];
	if (floor !== undefined) {
		if (isTierName(floor)) out.coreFloor = floor;
		else log.warn({ where, coreFloor: floor }, 'models.coreFloor: not a tier name; ignored');
	}

	return out;
}

/** Parse the full flat models.* tiering shape: the global override (tiers /
 *  tasks / coreFloor) plus per-repo `models.byRepo` overrides (tasks and
 *  coreFloor only). Returns {} when no tiering keys are set. */
export function parseTiering(models: Record<string, unknown>): AnalyzeTiering {
	const global = parseTieringOverride(models, 'global');
	let byRepo: Record<string, RepoTiering> | undefined;
	if (isObject(models['byRepo'])) {
		const acc: Record<string, RepoTiering> = {};
		for (const [repoPath, entry] of Object.entries(models['byRepo'])) {
			if (!isObject(entry)) continue;
			const ov = parseTieringOverride(entry, `byRepo[${repoPath}]`);
			if (ov.roleTiers !== undefined || ov.coreFloor !== undefined) {
				acc[repoPath] = { ...(ov.roleTiers !== undefined ? { roleTiers: ov.roleTiers } : {}), ...(ov.coreFloor !== undefined ? { coreFloor: ov.coreFloor } : {}) };
			}
		}
		if (Object.keys(acc).length > 0) byRepo = acc;
	}
	return { ...global, ...(byRepo !== undefined ? { byRepo } : {}) };
}

/** Drop the cached config so the next read sees config.json as it is now.
 *  main() calls it once, right after the boot reconcile. */
export function resetAnalyzeConfigCache(): void {
	cached = undefined;
}

export const _resetAnalyzeConfigCacheForTests = resetAnalyzeConfigCache;

/** The time one live data source is given to answer when a request is measured, when the setting gives none. */
export const DEFAULT_DATA_SOURCE_LISTING_TIMEOUT_MS = 120_000;

/**
 * Read `analyzer.dataSourceListingTimeoutMs` FRESH from disk: the time, in
 * milliseconds, one live data source is given to be reached and listed when a
 * request is measured. Fail-safe: the default when the file is absent or
 * unparseable, or the value is missing or is not a finite number greater than
 * 0. Never throws, and is not cached: it is read once per source measured.
 *
 * `configPath` is a test seam, as for the per-repo override above.
 */
export function dataSourceListingTimeoutMs(configPath: string = PATHS.config): number {
	try {
		if (!existsSync(configPath)) return DEFAULT_DATA_SOURCE_LISTING_TIMEOUT_MS;
		const raw = JSON.parse(readFileSync(configPath, 'utf8')) as { analyzer?: { dataSourceListingTimeoutMs?: unknown } } | null;
		const v = raw?.analyzer?.dataSourceListingTimeoutMs;
		return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEFAULT_DATA_SOURCE_LISTING_TIMEOUT_MS;
	} catch {
		return DEFAULT_DATA_SOURCE_LISTING_TIMEOUT_MS;
	}
}
