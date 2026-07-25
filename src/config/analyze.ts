/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Analyze-framework config loader.
 *
 * The Context Builder's LLM-driven shaper consumes:
 *   - models.analyze.shaperModel               -- Ollama model id; falls
 *     back to loadLocalProviderConfig().coreModel when unset
 *   - models.analyze.shaper.maxToolTurns       -- tool-loop turn cap
 *   - models.analyze.shaper.structuredOutputRetries -- final-emit retry
 *     budget
 *   - models.analyze.shaper.ollamaNumCtx       -- context window override
 *     for the shaper invocation
 *
 * Read from `~/.insrc/config.json` if present, else fall back to defaults
 * declared below. Cached in-process for the daemon's lifetime; the cache
 * is reset only via `_resetAnalyzeConfigCacheForTests()`.
 *
 * See: design/analyze-context-builder.md "Configuration"
 *      plans/analyze-context-builder.md Phase 3
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from '../shared/logger.js';
import { PATHS } from '../shared/paths.js';

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
	 * Bump higher via config.json `models.analyze.shaper.ollamaNumPredict`
	 * for XL-scope runs on large workspaces.
	 */
	readonly ollamaNumPredict:        number;
}

/**
 * Max Plan-tree depth keyed by the ROOT Run's classified scope.
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
// Additive to the models.analyze.* surface: three capability tiers, a role→tier
// assignment map, a coreFloor guarantee (enforced downstream by S002), and
// per-repo overrides. The legacy shaperProvider/shaperModel keys stay untouched
// as the lowest-precedence fallback (S001 does not resolve — the RoleRouter
// (S003) consumes this schema + the ReasoningRoleTaxonomy (sc4)).
// ---------------------------------------------------------------------------

/** The three capability tiers, ordered cheap < mid < core (see RoleTaxonomy.rankOf). */
export type TierName = 'core' | 'mid' | 'cheap';

/** The model backing one tier. `runner` is closed to the k1 CLI/Ollama set so no
 *  tier can reach a direct cloud REST path (reuses AnalyzeShaperProviderKind). */
export interface TierModel {
	readonly runner: AnalyzeShaperProviderKind;
	readonly model:  string;
}

/** Sparse RoleId → tier map; a role absent here uses its RoleDescriptor.defaultTier. */
export type RoleTierAssignment = Readonly<Record<string, TierName>>;

/** The tiering knobs that may appear globally or under a byRepo entry. */
export interface TieringOverride {
	readonly tiers?:     Readonly<Partial<Record<TierName, TierModel>>> | undefined;
	readonly roleTiers?: RoleTierAssignment | undefined;
	readonly coreFloor?: TierName | undefined;
}

/** The full parsed models.analyze tiering shape (sc1). Always present on
 *  AnalyzeConfig; empty (all fields absent) when no tiering config is set, in
 *  which case resolution is identical to the legacy single-provider path. */
export interface AnalyzeTiering extends TieringOverride {
	readonly byRepo?: Readonly<Record<string, TieringOverride>> | undefined;
}

/**
 * Per-repo shaper override, keyed by absolute repo path under
 * `models.analyze.byRepo` in `~/.insrc/config.json`. A repo may pin its own
 * `shaperProvider` (and optionally `shaperModel`); this is the HIGHEST-priority
 * signal in the resolution chain (per-repo > global config > per-run caller >
 * ollama). Read FRESH per lookup (see `resolveRepoShaperProvider`) rather than
 * folded into the cached `AnalyzeConfig`, so a per-repo edit is picked up
 * without poisoning — or being poisoned by — the global cache.
 */
export interface RepoShaperOverride {
	readonly shaperProvider?: AnalyzeShaperProviderKind | undefined;
	readonly shaperModel?:    string | undefined;
}

export interface AnalyzeConfig {
	readonly shaperProvider: AnalyzeShaperProviderKind;
	/** True when `models.analyze.shaperProvider` was set to a recognized
	 *  value in config.json (vs. defaulted). When false, the shaper
	 *  factory may auto-pick a provider from the invoking MCP client
	 *  (claude → cli-claude, codex → cli-codex). See shaper-provider.ts. */
	readonly shaperProviderExplicit: boolean;
	readonly shaperModel:    string;
	/** True when `models.analyze.shaperModel` was set in config.json.
	 *  The default (`qwen3.6:35b-a3b`) is an Ollama id, so it must NOT be
	 *  forwarded to a CLI provider unless the operator explicitly set it. */
	readonly shaperModelExplicit: boolean;
	/** Provider for BACKGROUND doc-summarisation during indexing. Independent
	 *  of `shaperProvider` (which is for interactive analyze/workflow reasoning)
	 *  and defaults to LOCAL `ollama` regardless — summarising every doc through
	 *  a cloud CLI per doc is slow, serial, and quota-burning. Override via
	 *  `models.analyze.summariserProvider`. See analyze/summariser/driver.ts. */
	readonly summariserProvider: AnalyzeShaperProviderKind;
	/** Model for the summariser; defaults to the local MoE `qwen3.6:35b-a3b`
	 *  (fast despite size). Override via `models.analyze.summariserModel`. */
	readonly summariserModel:    string;
	/** True when `models.analyze.summariserModel` was set explicitly (guards
	 *  forwarding an Ollama id to a CLI summariser provider). */
	readonly summariserModelExplicit: boolean;
	readonly shaper:         AnalyzeShaperConfig;
	readonly maxPlanDepth:   MaxPlanDepthMap;
	/** Per-role model tiering (sc1). Empty ({}) when no tiering config is set —
	 *  in which case resolution stays on the legacy shaperProvider path. */
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

/**
 * Default shaper model. `qwen3.6:35b-a3b` is preferred over
 * qwen3-coder for shaper work -- the shaper's job is structural
 * comprehension + tool-loop orchestration rather than code
 * generation, and qwen3.6 is a stronger generalist for that surface.
 *
 * The model is in the qwen3.6 family, which emits empty bodies
 * unless `think: false` is sent in the Ollama request body (memory:
 * qwen3_6_needs_think_false). The driver sets `disableThinking: true`
 * on completeStructured for this reason; tool-loop calls get the
 * quirk treatment via the provider's family check on `hasTools`.
 *
 * Override via config.json `models.analyze.shaperModel`.
 */
const DEFAULT_SHAPER_MODEL = 'qwen3.6:35b-a3b';

let cached: AnalyzeConfig | undefined;

export function loadAnalyzeConfig(): AnalyzeConfig {
	if (cached !== undefined) {
		return cached;
	}

	// Default to the analyze-specific shaper model rather than the
	// generic coreModel: the shaper benefits from a stronger generalist
	// even if the local coreModel is set for code generation.
	const fallbackModel = DEFAULT_SHAPER_MODEL;

	if (!existsSync(PATHS.config)) {
		cached = {
			shaperProvider: 'ollama',
			shaperProviderExplicit: false,
			shaperModel:    fallbackModel,
			shaperModelExplicit: false,
			summariserProvider: 'ollama',
			summariserModel:    fallbackModel,
			summariserModelExplicit: false,
			shaper:         DEFAULT_SHAPER,
			maxPlanDepth:   DEFAULT_MAX_PLAN_DEPTH,
			tiering:        {},
		};
		return cached;
	}

	try {
		const raw = JSON.parse(readFileSync(PATHS.config, 'utf8')) as Record<string, unknown>;
		const models = isObject(raw['models']) ? (raw['models'] as Record<string, unknown>) : {};
		const analyze = isObject(models['analyze'])
			? (models['analyze'] as Record<string, unknown>)
			: {};
		const shaperObj = isObject(analyze['shaper'])
			? (analyze['shaper'] as Record<string, unknown>)
			: {};
		const depthObj = isObject(analyze['maxPlanDepth'])
			? (analyze['maxPlanDepth'] as Record<string, unknown>)
			: {};

		const rawShaper = analyze['shaperProvider'];
		cached = {
			shaperProvider: parseShaperProvider(rawShaper),
			shaperProviderExplicit: rawShaper === 'ollama' || rawShaper === 'cli-claude' || rawShaper === 'cli-codex',
			shaperModel:
				typeof analyze['shaperModel'] === 'string'
					? (analyze['shaperModel'] as string)
					: fallbackModel,
			shaperModelExplicit: typeof analyze['shaperModel'] === 'string',
			summariserProvider: parseShaperProvider(analyze['summariserProvider']),
			summariserModel:
				typeof analyze['summariserModel'] === 'string'
					? (analyze['summariserModel'] as string)
					: fallbackModel,
			summariserModelExplicit: typeof analyze['summariserModel'] === 'string',
			shaper: {
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
			},
			maxPlanDepth: {
				XS: typeof depthObj['XS'] === 'number' ? (depthObj['XS'] as number) : DEFAULT_MAX_PLAN_DEPTH.XS,
				S:  typeof depthObj['S']  === 'number' ? (depthObj['S']  as number) : DEFAULT_MAX_PLAN_DEPTH.S,
				M:  typeof depthObj['M']  === 'number' ? (depthObj['M']  as number) : DEFAULT_MAX_PLAN_DEPTH.M,
				L:  typeof depthObj['L']  === 'number' ? (depthObj['L']  as number) : DEFAULT_MAX_PLAN_DEPTH.L,
				XL: typeof depthObj['XL'] === 'number' ? (depthObj['XL'] as number) : DEFAULT_MAX_PLAN_DEPTH.XL,
			},
			tiering: parseTiering(analyze),
		};
		return cached;
	} catch (err) {
		log.warn(
			{ err: (err as Error).message },
			'failed to parse config.json; using analyze defaults',
		);
		cached = {
			shaperProvider: 'ollama',
			shaperProviderExplicit: false,
			shaperModel:    fallbackModel,
			shaperModelExplicit: false,
			summariserProvider: 'ollama',
			summariserModel:    fallbackModel,
			summariserModelExplicit: false,
			shaper:         DEFAULT_SHAPER,
			maxPlanDepth:   DEFAULT_MAX_PLAN_DEPTH,
			tiering:        {},
		};
		return cached;
	}
}

function parseShaperProvider(raw: unknown): AnalyzeShaperProviderKind {
	if (raw === 'ollama' || raw === 'cli-claude' || raw === 'cli-codex') return raw;
	if (raw !== undefined) {
		log.warn(
			{ raw },
			`unknown models.analyze.shaperProvider; falling back to 'ollama'`,
		);
	}
	return 'ollama';
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

/** Parse one TieringOverride (tiers/roleTiers/coreFloor) from a config object. */
function parseTieringOverride(src: Record<string, unknown>, where: string): TieringOverride {
	const out: { tiers?: Partial<Record<TierName, TierModel>>; roleTiers?: Record<string, TierName>; coreFloor?: TierName } = {};

	if (isObject(src['tiers'])) {
		const tiers: Partial<Record<TierName, TierModel>> = {};
		for (const [tier, val] of Object.entries(src['tiers'])) {
			if (!isTierName(tier)) { log.warn({ where, tier }, 'models.analyze.tiers: unknown tier name; ignored'); continue; }
			const runner = isObject(val) ? val['runner'] : undefined;
			const model  = isObject(val) ? val['model']  : undefined;
			if (!isRunner(runner) || typeof model !== 'string' || model.length === 0) {
				log.warn({ where, tier }, 'models.analyze.tiers[tier]: expected { runner: ollama|cli-claude|cli-codex, model: string }; ignored');
				continue;
			}
			tiers[tier] = { runner, model };
		}
		if (Object.keys(tiers).length > 0) out.tiers = tiers;
	}

	if (isObject(src['roleTiers'])) {
		const roleTiers: Record<string, TierName> = {};
		for (const [role, tier] of Object.entries(src['roleTiers'])) {
			if (!isTierName(tier)) { log.warn({ where, role, tier }, 'models.analyze.roleTiers[role]: not a tier name; ignored'); continue; }
			roleTiers[role] = tier;
		}
		if (Object.keys(roleTiers).length > 0) out.roleTiers = roleTiers;
	}

	const floor = src['coreFloor'];
	if (floor !== undefined) {
		if (isTierName(floor)) out.coreFloor = floor;
		else log.warn({ where, coreFloor: floor }, 'models.analyze.coreFloor: not a tier name; ignored');
	}

	return out;
}

/** Parse the full models.analyze tiering shape (sc1): the global override plus
 *  per-repo byRepo tiering overrides. Returns {} when no tiering keys are set,
 *  in which case resolution stays on the legacy shaperProvider path. The legacy
 *  byRepo[repo].shaperProvider override is parsed separately by readRepoOverride
 *  and is unaffected. */
export function parseTiering(analyze: Record<string, unknown>): AnalyzeTiering {
	const global = parseTieringOverride(analyze, 'global');
	let byRepo: Record<string, TieringOverride> | undefined;
	if (isObject(analyze['byRepo'])) {
		const acc: Record<string, TieringOverride> = {};
		for (const [repoPath, entry] of Object.entries(analyze['byRepo'])) {
			if (!isObject(entry)) continue;
			const ov = parseTieringOverride(entry, `byRepo[${repoPath}]`);
			if (ov.tiers !== undefined || ov.roleTiers !== undefined || ov.coreFloor !== undefined) acc[repoPath] = ov;
		}
		if (Object.keys(acc).length > 0) byRepo = acc;
	}
	return { ...global, ...(byRepo !== undefined ? { byRepo } : {}) };
}

/**
 * Read the `models.analyze.byRepo[repoPath]` override entry FRESH from disk.
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
		const raw     = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
		const models  = isObject(raw['models'])       ? (raw['models'] as Record<string, unknown>)      : {};
		const analyze = isObject(models['analyze'])   ? (models['analyze'] as Record<string, unknown>)  : {};
		const byRepo  = isObject(analyze['byRepo'])   ? (analyze['byRepo'] as Record<string, unknown>)  : {};
		const entry   = byRepo[repoPath];
		if (!isObject(entry)) return undefined;
		const provider = entry['shaperProvider'];
		const model    = entry['shaperModel'];
		return {
			...(provider === 'ollama' || provider === 'cli-claude' || provider === 'cli-codex'
				? { shaperProvider: provider }
				: {}),
			...(typeof model === 'string' && model.length > 0 ? { shaperModel: model } : {}),
		};
	} catch (err) {
		log.warn(
			{ err: (err as Error).message, repoPath },
			'failed to read models.analyze.byRepo; ignoring per-repo override',
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
 * (`models.analyze.byRepo[repoPath].shaperModel`). Returns it fresh from disk,
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
