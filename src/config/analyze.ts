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
import type { CliKind } from '../agent/providers/cli-provider.js';
import { getModelRegistry, type ModelRegistry, type TierResolution, type TierSetting } from '../daemon/model-registry.js';
import { SHIPPED_MODEL_DEFAULTS } from './model-defaults.js';
import { reasoningRoleTaxonomy, roleDescriptor } from './role-taxonomy.js';

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

/** An independently-selectable security-reviewer model pin (models.security.*,
 *  global-only -- a repo picks a tier for a role, never the model behind it,
 *  and this pin follows that identical rule). */
export interface SecurityModelPin {
	readonly runner: AnalyzeShaperProviderKind;
	readonly model:  string;
	readonly effort?: TierEffort | undefined;
}

/** parseSecurityModelPin's tri-state result (Epic add-dedicated-security-reviews,
 *  s1): 'absent' (no models.security key, or one with neither runner nor model
 *  set) is the ordinary, expected case and falls through to the 'security.review'
 *  role's own tier-default model; 'malformed' (present but incomplete or
 *  mistyped) must NOT be treated as absent, since this Story's fail-closed
 *  requirement depends on telling the two apart -- unlike parseTieringOverride's
 *  existing convention of silently dropping a malformed tier entry. */
export type SecurityModelPinResult =
	| { readonly kind: 'absent' }
	| ({ readonly kind: 'valid' } & SecurityModelPin)
	| { readonly kind: 'malformed'; readonly detail: string };

/** Parse models.security.* as a tri-state result, distinct from
 *  parseTieringOverride's tiers parsing: a malformed pin is never conflated
 *  with an absent one. */
export function parseSecurityModelPin(models: Record<string, unknown>): SecurityModelPinResult {
	const sec = models['security'];
	if (sec === undefined) return { kind: 'absent' };
	if (!isObject(sec)) {
		return { kind: 'malformed', detail: `models.security: expected an object, got ${JSON.stringify(sec)}` };
	}
	const runner = sec['runner'];
	const model  = sec['model'];
	// The catalog's own persisted "unset" default is runner:'' + model:'' (config-catalog.ts),
	// written by reconcileConfig on every ordinary install -- '' is equivalent to absent, not malformed.
	const runnerAbsent = runner === undefined || runner === '';
	const modelAbsent  = model === undefined || model === '';
	if (runnerAbsent && modelAbsent) return { kind: 'absent' };
	if (!isRunner(runner)) {
		return { kind: 'malformed', detail: `models.security.runner: expected one of ${SHIPPED_MODEL_DEFAULTS.familyIds.join('|')}, got ${JSON.stringify(runner)}` };
	}
	if (typeof model !== 'string' || model === '') {
		return { kind: 'malformed', detail: 'models.security.model: expected a non-empty string' };
	}
	const effort = sec['effort'];
	if (effort !== undefined && typeof effort !== 'string') {
		return { kind: 'malformed', detail: 'models.security.effort: expected a string' };
	}
	// '' means "the CLI's own default" (config-catalog.ts's own documented convention for this
	// row) -- strip it so a valid pin never forwards a literal --effort '' to the CLI.
	const cleanEffort = effort === '' ? undefined : effort;
	return { kind: 'valid', runner, model, ...(cleanEffort !== undefined ? { effort: cleanEffort } : {}) };
}

/** Whether a pinned (familyId, modelId) pair meets a coreFloor-style capability
 *  floor: holds iff SOME family's own tierDefaults names a model (by id or
 *  alias, resolved within that family) equal to the pinned model, at a tier
 *  whose rank is >= `floorTier`'s rank -- the search spans every family's
 *  tierDefaults, not only `familyId`'s own, so a pin is still floor-eligible
 *  when a DIFFERENT family's tier default happens to name the same model. A
 *  pin matching no family's tierDefaults at any tier is unclassifiable and
 *  treated as below-floor (false) -- never substituted. This is the ONLY link
 *  between an arbitrary pinned pair and coreFloor's TierName ranking, since
 *  CoreFloorGuard.applyCoreFloor compares only TierName values and has no
 *  notion of an individual model's capability. */
export function securityPinMeetsFloor(registry: ModelRegistry, familyId: FamilyId, modelId: string, floorTier: TierName): boolean {
	const pinned = registry.find(familyId, modelId);
	if (pinned === undefined) return false;
	const { rankOf } = reasoningRoleTaxonomy();
	for (const family of registry.families()) {
		if (family.tierDefaults === undefined) continue;
		for (const tier of TIER_NAMES) {
			const def = family.tierDefaults[tier];
			if (def === undefined) continue;
			const resolved = registry.find(family.id, def.model);
			if (resolved !== undefined && resolved.id === pinned.id && rankOf[tier] >= rankOf[floorTier]) return true;
		}
	}
	return false;
}

/** The full parsed models.* tiering shape (sc1). Always present on
 *  AnalyzeConfig; empty (all fields absent) when no tiering config is set, in
 *  which case resolution is identical to the legacy single-provider path. */
export interface AnalyzeTiering extends TieringOverride {
	readonly byRepo?: Readonly<Record<string, RepoTiering>> | undefined;
	/** parseSecurityModelPin's own tri-state result, always present (never
	 *  collapsed to undefined): resolveSecurityModelCandidate (s1 t5) takes only
	 *  AnalyzeConfig, with no access to the raw models.* object, so it reads this
	 *  field to tell 'absent' apart from 'malformed' -- a single optional field
	 *  holding just the valid case could not. */
	readonly security: SecurityModelPinResult;
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

/** status:'candidate' with {runner, model, effort?} when a listed, floor-eligible
 *  model was selected (an explicit models.security pin, or the 'security.review'
 *  role's own tier-default model when no pin is configured); status:'unavailable'
 *  with blockerReason when the configured pin is malformed, unlisted, or below
 *  the role's required capability floor -- decided purely from cfg + registry
 *  data, with no I/O and no substitution. */
export type SecurityModelCandidate =
	| ({ readonly status: 'candidate' } & SecurityModelPin)
	| { readonly status: 'unavailable'; readonly blockerReason: string };

/** The 'security.review' role's effective tier: the SAME byRepo→global→role-default
 *  precedence and coreFloor clamp role-router.ts's resolveRole applies to every other
 *  role -- never the role's bare defaultTier alone (that skipped any models.tasks
 *  override and any coreFloor clamp). Inlines the rank comparison directly (rather
 *  than calling core-floor-guard.ts's applyCoreFloor) so this stays zero-I/O, per
 *  resolveSecurityModelCandidate's own contract -- applyCoreFloor logs on a clamp,
 *  which that contract forbids here. 'security.review' is always registered
 *  criticality:'critical' (role-taxonomy.ts), so the clamp always applies; there is
 *  no peripheral/fail-safe branch to replicate. */
function effectiveSecurityReviewTier(cfg: AnalyzeConfig, repoPath: string | undefined): TierName {
	const descriptor = roleDescriptor('security.review');
	const byRepo = repoPath !== undefined ? cfg.tiering.byRepo?.[repoPath] : undefined;
	const assignedTier: TierName = byRepo?.roleTiers?.['security.review'] ?? cfg.tiering.roleTiers?.['security.review'] ?? descriptor?.defaultTier ?? 'mid';
	const floorTier: TierName = byRepo?.coreFloor ?? cfg.tiering.coreFloor ?? 'mid';
	const { rankOf } = reasoningRoleTaxonomy();
	return rankOf[assignedTier] < rankOf[floorTier] ? floorTier : assignedTier;
}

/**
 * Resolve sc1's security-reviewer candidate (pure, synchronous; zero I/O).
 * A malformed or below-floor/unlisted pin resolves to 'unavailable' immediately
 * and NEVER falls through to the 'security.review' role's tier-default model --
 * only a genuinely absent pin falls through to it, which is itself checked
 * against the floor the same way an explicit pin would be. `repoPath` (optional)
 * threads the role's byRepo override into the precedence, matching every other
 * role's resolution.
 */
export function resolveSecurityModelCandidate(cfg: AnalyzeConfig, registry: ModelRegistry, repoPath?: string): SecurityModelCandidate {
	const floorTier: TierName = effectiveSecurityReviewTier(cfg, repoPath);
	const pin = cfg.tiering.security;

	if (pin.kind === 'malformed') return { status: 'unavailable', blockerReason: pin.detail };

	if (pin.kind === 'valid') {
		if (registry.find(pin.runner, pin.model) === undefined) {
			return { status: 'unavailable', blockerReason: `models.security: '${pin.model}' is not a listed model of ${pin.runner}` };
		}
		if (!securityPinMeetsFloor(registry, pin.runner, pin.model, floorTier)) {
			return { status: 'unavailable', blockerReason: `models.security: '${pin.model}' does not meet the 'security.review' role's capability floor (${floorTier})` };
		}
		return { status: 'candidate', runner: pin.runner, model: pin.model, ...(pin.effort !== undefined ? { effort: pin.effort } : {}) };
	}

	// Absent: fall through to the role's own tier-default model -- the SAME
	// listed + floor-eligibility checks a pin would get, never a further
	// fallback to a different role, tier, or UNKNOWN_ROLE_TIER-style default.
	// A tier whose configured model was itself silently substituted is refused,
	// not quietly accepted, mirroring this Epic's own "never silently substitute"
	// principle for the security-review backend specifically.
	const fallback = cfg.tierResolutions[floorTier]?.fallback;
	if (fallback !== undefined) {
		return { status: 'unavailable', blockerReason: `'security.review' role's ${floorTier}-tier configured model was rejected (${fallback.reason}: '${fallback.requested}') -- refusing rather than silently using the registry's own substitute` };
	}
	const def = cfg.tiering.tiers?.[floorTier];
	if (def === undefined || def.model === '' || registry.find(def.runner, def.model) === undefined) {
		return { status: 'unavailable', blockerReason: `'security.review' role's ${floorTier}-tier default model is unavailable` };
	}
	if (!securityPinMeetsFloor(registry, def.runner, def.model, floorTier)) {
		return { status: 'unavailable', blockerReason: `'security.review' role's ${floorTier}-tier default model does not meet its own capability floor (${floorTier})` };
	}
	return { status: 'candidate', runner: def.runner, model: def.model, ...(def.effort !== undefined ? { effort: def.effort } : {}) };
}

/** sc1's HLD-defined boundary record: either a configured, PROBED-available
 *  model (status:'configured') or the specific blocker (status:'unavailable') --
 *  never a silent substitution. `provider` is always one of the three CLI-backed
 *  families at runtime (never an Ollama-hosted one: k1 routes cloud inference
 *  through the installed CLI provider only, checked via registry.cliKind, never
 *  a hand-written family-id literal here); typed as the broader FamilyId
 *  (imported, not re-declared) since model-literal-scan.test.ts restricts
 *  writing a CLI family-id literal to the definitions' own owner files. */
export type SecurityModelSelection =
	| { readonly status: 'configured'; readonly modelId: string; readonly provider: FamilyId; readonly effort?: EffortLevel | undefined }
	| { readonly status: 'unavailable'; readonly blockerReason: string };

/** The bounded availability probe's own test seam -- a fake/controllable probe
 *  (resolves, rejects, or never settles on command) injected in place of the
 *  real CliProvider call, matching this codebase's own _set*DepsForTests
 *  convention (e.g. review-round/checkpoint.ts). No argument resets to the
 *  real probe. */
export interface SecurityProbeDeps {
	readonly probe?: ((kind: CliKind, model: string, effort: EffortLevel | undefined, signal?: AbortSignal | undefined) => Promise<void>) | undefined;
}
let securityProbeDeps: SecurityProbeDeps = {};
export function _setSecurityProbeDepsForTests(deps: SecurityProbeDeps = {}): void { securityProbeDeps = deps; }

async function defaultSecurityProbe(kind: CliKind, model: string, effort: EffortLevel | undefined, deadlineMs: number, signal: AbortSignal | undefined): Promise<void> {
	const { CliProvider } = await import('../agent/providers/cli-provider.js');
	const provider = new CliProvider({ kind, model, effort, timeoutMs: deadlineMs });
	await provider.complete([{ role: 'user', content: 'ping' }], { signal });
}

/**
 * Resolve sc1's SecurityModelSelection: calls resolveSecurityModelCandidate
 * first (pure, sync); a candidate already 'unavailable' resolves immediately
 * with no probe attempted. Otherwise awaits exactly ONE bounded probe against
 * the candidate, racing it against opts.deadlineMs and opts.signal -- never
 * rejects; always settles within opts.deadlineMs of starting the probe. An
 * already-aborted opts.signal is checked BEFORE any dispatch (an 'abort' event
 * that already fired is never seen by a listener attached after the fact). A
 * timeout or the caller's own cancellation aborts an internal AbortController
 * threaded into the probe itself, so the underlying CLI subprocess is actually
 * killed and withTransientRetry's own isAbortError exemption stops it from
 * retrying -- cancellation genuinely stops the call, not just this function's
 * returned promise. `opts.repoPath`, when given, is forwarded to
 * resolveSecurityModelCandidate so a repo's own models.byRepo[repoPath]
 * roleTiers/coreFloor override is honored here too, not only by a caller that
 * calls resolveSecurityModelCandidate directly.
 */
export async function resolveSecurityModel(
	cfg: AnalyzeConfig, registry: ModelRegistry,
	opts: { readonly deadlineMs: number; readonly signal?: AbortSignal | undefined; readonly repoPath?: string | undefined },
): Promise<SecurityModelSelection> {
	if (opts.signal?.aborted === true) {
		return { status: 'unavailable', blockerReason: 'security model probe cancelled' };
	}

	const candidate = resolveSecurityModelCandidate(cfg, registry, opts.repoPath);
	if (candidate.status === 'unavailable') return candidate;

	const kind = registry.cliKind(candidate.runner);
	if (kind === undefined) {
		return { status: 'unavailable', blockerReason: `${candidate.runner} is not a CLI-backed family; a security review requires a CLI provider (k1)` };
	}

	const probe = securityProbeDeps.probe ?? ((k, model, effort, signal) => defaultSecurityProbe(k, model, effort, opts.deadlineMs, signal));
	const internalController = new AbortController();
	let settled = false;
	const outcome = await new Promise<'ok' | { blockerReason: string }>(resolve => {
		const finish = (result: 'ok' | { blockerReason: string }): void => {
			if (settled) return;
			settled = true;
			resolve(result);
		};
		const timer = setTimeout(() => {
			internalController.abort();
			finish({ blockerReason: `security model probe timed out after ${opts.deadlineMs}ms` });
		}, opts.deadlineMs);
		const onAbort = (): void => {
			internalController.abort();
			finish({ blockerReason: 'security model probe cancelled' });
		};
		opts.signal?.addEventListener('abort', onAbort, { once: true });
		probe(kind, candidate.model, candidate.effort, internalController.signal).then(
			() => { clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort); finish('ok'); },
			(err: unknown) => { clearTimeout(timer); opts.signal?.removeEventListener('abort', onAbort); finish({ blockerReason: `security model backend unreachable: ${err instanceof Error ? err.message : String(err)}` }); },
		);
	});

	if (outcome !== 'ok') return { status: 'unavailable', blockerReason: outcome.blockerReason };
	return { status: 'configured', modelId: candidate.model, provider: candidate.runner, ...(candidate.effort !== undefined ? { effort: candidate.effort } : {}) };
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
		return assembleConfig({ security: { kind: 'absent' } }, DEFAULT_SHAPER, DEFAULT_MAX_PLAN_DEPTH, registry);
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
		return assembleConfig({ security: { kind: 'absent' } }, DEFAULT_SHAPER, DEFAULT_MAX_PLAN_DEPTH, registry);
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
	const security = parseSecurityModelPin(models);
	return { ...global, ...(byRepo !== undefined ? { byRepo } : {}), security };
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
