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
 *   - models.shaper.maxToolTurns / .structuredOutputRetries / .ollamaNumCtx /
 *     .ollamaNumPredict  -- shaper runtime knobs (NOT model specs)
 *   - models.maxPlanDepth.{XS,S,M,L,XL}
 *
 * Read from `~/.insrc/config.json` if present, else fall back to defaults
 * declared below. Cached in-process for the daemon's lifetime; the cache
 * is reset only via `_resetAnalyzeConfigCacheForTests()`.
 *
 * See: design/analyze-context-builder.md "Configuration"
 *      docs/plans/analyze-context-builder.md Phase 3
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from '../shared/logger.js';
import { PATHS } from '../shared/paths.js';
import type { EffortLevel } from '../daemon/model-catalog.js';
import { SHIPPED_MODEL_DEFAULTS } from './model-defaults.js';

const log = getLogger('config:analyze');

export interface AnalyzeShaperConfig {
	readonly maxToolTurns:            number;
	readonly structuredOutputRetries: number;
	readonly ollamaNumCtx:            number;
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
	 * the prompt half of ollamaNumCtx (32768 total - prompt budget).
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
export type AnalyzeShaperProviderKind = 'ollama' | 'cli-claude' | 'cli-codex';

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

/** The efforts of the shipped model definitions (de-duplicated); whether a model
 *  accepts one is decided per model by the registry. Temporary export: only
 *  src/cli may import it (s5 removes it). */
export const TIER_EFFORTS: readonly string[] = SHIPPED_MODEL_DEFAULTS.efforts;
/** An effort level name (the definitions file is the authority for level names). */
export type TierEffort = EffortLevel;
export function isTierEffort(x: unknown): x is TierEffort {
	return typeof x === 'string' && TIER_EFFORTS.includes(x);
}

/** Sparse RoleId → tier map; a role absent here uses its RoleDescriptor.defaultTier. */
export type RoleTierAssignment = Readonly<Record<string, TierName>>;

/**
 * Built-in tier → model defaults: the shipped definitions' default family and
 * its tier defaults (Epic ce99b72065d03b1b, s3). Temporary export: only src/cli
 * may import it (s5 removes it); the daemon resolves tiers through the registry.
 */
export const DEFAULT_TIERS: Readonly<Record<TierName, TierModel>> = {
	core:  shippedTier('core'),
	mid:   shippedTier('mid'),
	cheap: shippedTier('cheap'),
};

function shippedTier(tier: TierName): TierModel {
	const d = SHIPPED_MODEL_DEFAULTS.tiers[tier];
	return { runner: d.runner as AnalyzeShaperProviderKind, model: d.model, ...(d.effort !== '' ? { effort: d.effort } : {}) };
}

/** The tiering knobs that may appear globally or under a byRepo entry. */
export interface TieringOverride {
	readonly tiers?:     Readonly<Partial<Record<TierName, TierModel>>> | undefined;
	readonly roleTiers?: RoleTierAssignment | undefined;
	readonly coreFloor?: TierName | undefined;
	/** Global scope only: each tier entry's valid effort, kept even when the tier
	 *  itself was dropped (an empty or invalid model), so a DEFAULT_TIERS fallback
	 *  still runs at the configured effort. */
	readonly efforts?:   Readonly<Partial<Record<TierName, TierEffort>>> | undefined;
}

/** The full parsed models.* tiering shape (sc1). Always present on
 *  AnalyzeConfig; empty (all fields absent) when no tiering config is set, in
 *  which case resolution is identical to the legacy single-provider path. */
export interface AnalyzeTiering extends TieringOverride {
	readonly byRepo?: Readonly<Record<string, TieringOverride>> | undefined;
}

/**
 * Per-repo shaper override, DERIVED from `models.byRepo[repoPath].tiers.core`
 * in `~/.insrc/config.json` — a repo pins its own core-tier runner (and
 * optionally model) and this is the HIGHEST-priority signal in the resolution
 * chain (per-repo > global config > per-run caller > ollama). Read FRESH per
 * lookup (see `resolveRepoShaperProvider`) rather than folded into the cached
 * `AnalyzeConfig`, so a per-repo edit is picked up without poisoning — or being
 * poisoned by — the global cache.
 */
export interface RepoShaperOverride {
	readonly shaperProvider?: AnalyzeShaperProviderKind | undefined;
	readonly shaperModel?:    string | undefined;
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
	 *  override merged over DEFAULT_TIERS) so the RoleRouter resolves a concrete
	 *  tier for every role. */
	readonly tiering:        AnalyzeTiering;
}

/**
 * Defaults sit at sane v1 starting points. `maxToolTurns: 40` matches
 * the design doc; `structuredOutputRetries: 3` matches the Ollama
 * provider's own default; `ollamaNumCtx: 32768` is the standard
 * shaper-context size (large enough to fit an XL-scope bundle without
 * truncation, but not so large the model OOMs).
 */
const DEFAULT_SHAPER: AnalyzeShaperConfig = {
	maxToolTurns:            40,
	structuredOutputRetries: 3,
	ollamaNumCtx:            32_768,
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

/**
 * Fully-resolved tiers = the parsed override merged over DEFAULT_TIERS. The
 * `tiers` block is the SINGLE place a model is named; every derived field below
 * reads from it. Always returns all three tiers populated, so the RoleRouter
 * resolves a concrete tier for every role (no legacy cross-tier fallback).
 */
function resolveTiers(tiering: AnalyzeTiering): Record<TierName, TierModel> {
	return {
		core:  resolveTier(tiering, 'core'),
		mid:   resolveTier(tiering, 'mid'),
		cheap: resolveTier(tiering, 'cheap'),
	};
}

/** The configured tier, else DEFAULT_TIERS[tier] at the tier's configured effort
 *  (so an effort set beside an empty or invalid model still applies). */
export function resolveTier(tiering: TieringOverride, tier: TierName): TierModel {
	const effort = tiering.efforts?.[tier];
	return tiering.tiers?.[tier] ?? { ...DEFAULT_TIERS[tier], ...(effort !== undefined ? { effort } : {}) };
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
): AnalyzeConfig {
	const tiers = resolveTiers(tiering);
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
	};
}

export function loadAnalyzeConfig(): AnalyzeConfig {
	if (cached !== undefined) {
		return cached;
	}

	if (!existsSync(PATHS.config)) {
		cached = assembleConfig({}, DEFAULT_SHAPER, DEFAULT_MAX_PLAN_DEPTH);
		return cached;
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
			ollamaNumCtx:
				typeof shaperObj['ollamaNumCtx'] === 'number'
					? (shaperObj['ollamaNumCtx'] as number)
					: DEFAULT_SHAPER.ollamaNumCtx,
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

		cached = assembleConfig(parseTiering(models), shaper, maxPlanDepth);
		return cached;
	} catch (err) {
		log.warn(
			{ err: (err as Error).message },
			'failed to parse config.json; using analyze defaults',
		);
		cached = assembleConfig({}, DEFAULT_SHAPER, DEFAULT_MAX_PLAN_DEPTH);
		return cached;
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
function isRunner(x: unknown): x is AnalyzeShaperProviderKind {
	return x === 'ollama' || x === 'cli-claude' || x === 'cli-codex';
}

/** A tier entry's effort: a valid one on the global tiers; '' or absent is none. An
 *  invalid value, or any effort on a per-repo tier, is dropped with a warning. */
function effortOf(raw: unknown, where: string, tier: TierName): TierEffort | undefined {
	if (raw === undefined || raw === '') return undefined;
	if (where !== 'global') {
		log.warn({ where, tier, effort: raw }, 'models.byRepo[repo].tiers[tier].effort: effort is set on the global model tiers only; ignored');
		return undefined;
	}
	if (isTierEffort(raw)) return raw;
	log.warn({ where, tier, effort: raw }, `models.tiers[tier].effort: expected one of ${TIER_EFFORTS.join('|')}; ignored`);
	return undefined;
}

/** Parse one TieringOverride (tiers / tasks / coreFloor) from a config object.
 *  Note: the on-disk key is `tasks`; the internal AnalyzeTiering field is
 *  `roleTiers` (the RoleRouter + core-floor guard consume `roleTiers`). */
function parseTieringOverride(src: Record<string, unknown>, where: string): TieringOverride {
	const out: { tiers?: Partial<Record<TierName, TierModel>>; roleTiers?: Record<string, TierName>; coreFloor?: TierName; efforts?: Partial<Record<TierName, TierEffort>> } = {};

	if (isObject(src['tiers'])) {
		const tiers: Partial<Record<TierName, TierModel>> = {};
		const efforts: Partial<Record<TierName, TierEffort>> = {};
		for (const [tier, val] of Object.entries(src['tiers'])) {
			if (!isTierName(tier)) { log.warn({ where, tier }, 'models.tiers: unknown tier name; ignored'); continue; }
			const runner = isObject(val) ? val['runner'] : undefined;
			const model  = isObject(val) ? val['model']  : undefined;
			// The effort belongs to the global tiers only; a per-repo tier chooses runner and model.
			const effort = effortOf(isObject(val) ? val['effort'] : undefined, where, tier);
			if (effort !== undefined) efforts[tier] = effort;
			if (!isRunner(runner) || typeof model !== 'string' || model.length === 0) {
				log.warn({ where, tier }, 'models.tiers[tier]: expected { runner: ollama|cli-claude|cli-codex, model: string }; ignored');
				continue;
			}
			tiers[tier] = { runner, model, ...(effort !== undefined ? { effort } : {}) };
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
 *  tasks / coreFloor) plus per-repo `models.byRepo` overrides. Returns {} when
 *  no tiering keys are set. The per-repo shaper-backend override is derived
 *  separately from `byRepo[repo].tiers.core` by readRepoOverride. */
export function parseTiering(models: Record<string, unknown>): AnalyzeTiering {
	const global = parseTieringOverride(models, 'global');
	let byRepo: Record<string, TieringOverride> | undefined;
	if (isObject(models['byRepo'])) {
		const acc: Record<string, TieringOverride> = {};
		for (const [repoPath, entry] of Object.entries(models['byRepo'])) {
			if (!isObject(entry)) continue;
			const ov = parseTieringOverride(entry, `byRepo[${repoPath}]`);
			if (ov.tiers !== undefined || ov.roleTiers !== undefined || ov.coreFloor !== undefined) acc[repoPath] = ov;
		}
		if (Object.keys(acc).length > 0) byRepo = acc;
	}
	return { ...global, ...(byRepo !== undefined ? { byRepo } : {}) };
}

/**
 * Read the `models.byRepo[repoPath]` override entry FRESH from disk and derive
 * the per-repo shaper backend from its `tiers.core` (the flattened surface's
 * equivalent of the old byRepo shaperProvider/shaperModel pins).
 *
 * Deliberately NOT cached (and NOT routed through `loadAnalyzeConfig`'s cache):
 * per-repo overrides are consulted at run-resolve time and must reflect the
 * current on-disk config, and reading them must not populate / read the global
 * cache. Tolerates a missing file / missing section (returns `undefined`).
 *
 * `configPath` defaults to the global `~/.insrc/config.json`; it exists as a
 * test seam so a case can point at a temp config without touching the real
 * user config.
 */
function readRepoOverride(repoPath: string, configPath: string): RepoShaperOverride | undefined {
	if (!existsSync(configPath)) return undefined;
	try {
		const raw    = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
		const models = isObject(raw['models'])    ? (raw['models'] as Record<string, unknown>)    : {};
		const byRepo = isObject(models['byRepo']) ? (models['byRepo'] as Record<string, unknown>) : {};
		const entry  = byRepo[repoPath];
		if (!isObject(entry)) return undefined;
		const tiers = isObject(entry['tiers']) ? (entry['tiers'] as Record<string, unknown>) : {};
		const core  = isObject(tiers['core'])  ? (tiers['core'] as Record<string, unknown>)  : undefined;
		const provider = core?.['runner'];
		const model    = core?.['model'];
		return {
			...(provider === 'ollama' || provider === 'cli-claude' || provider === 'cli-codex'
				? { shaperProvider: provider }
				: {}),
			...(typeof model === 'string' && model.length > 0 ? { shaperModel: model } : {}),
		};
	} catch (err) {
		log.warn(
			{ err: (err as Error).message, repoPath },
			'failed to read models.byRepo; ignoring per-repo override',
		);
		return undefined;
	}
}

/**
 * Resolve a repo-scoped `shaperProvider` override (highest priority in the
 * client/shaper resolution chain). Returns the pinned kind for `repoPath`, or
 * `undefined` when the repo has no override / the config / section is absent.
 * Reads the config file FRESH (never the cached global).
 */
export function resolveRepoShaperProvider(
	repoPath:   string,
	configPath: string = PATHS.config,
): AnalyzeShaperProviderKind | undefined {
	return readRepoOverride(repoPath, configPath)?.shaperProvider;
}

/**
 * Symmetric to `resolveRepoShaperProvider`: a repo may also pin a model
 * (`models.byRepo[repoPath].tiers.core.model`). Returns it fresh from disk,
 * or `undefined` when unset. Read FRESH (never the cached global).
 */
export function resolveRepoShaperModel(
	repoPath:   string,
	configPath: string = PATHS.config,
): string | undefined {
	return readRepoOverride(repoPath, configPath)?.shaperModel;
}

export function _resetAnalyzeConfigCacheForTests(): void {
	cached = undefined;
}

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
