import { captureAnalysisDiagnostics } from '../connection-access.js';
import { assertConnectionProviderAdmission } from '../../shared/connection-provider.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shaper-provider factory for the analyze framework.
 *
 * Every LLM call site under `src/insrc/analyze/` used to build its
 * own `new OllamaProvider(modelId, host, numCtx)`. Introduced for
 * the MCP-integration scenario (see plans/exploration-based-context-
 * build.md tail discussion), this single factory now honours the
 * new `AnalyzeConfig.shaperProvider` setting so a single config
 * flip routes decomposer + synthesizer + narrow-LLM explorations
 * (doc.decision.trace, doc.constraint.enumerate, capability.reuse-
 * check) + classifier + planner + summariser + adherence-aggregator
 * calls through either:
 *   - `OllamaProvider` (default; standalone CLI / IDE usage)
 *   - `CliProvider('claude')` (Claude Code / Codex MCP path)
 *   - `CliProvider('codex')` (same, but codex CLI)
 *
 * The tool-loop path in `analyze/context/driver.ts` is DELIBERATELY
 * unaffected: freeform.probe + classification + task modes still
 * spin their own OllamaProvider because `CliProvider.supportsTools
 * === false` -- the CLI wrappers can't drive a multi-turn tool loop.
 * They remain Ollama-only regardless of this factory's output.
 *
 * The factory reads config on every call rather than caching so a
 * mid-process config change (via _resetAnalyzeConfigCacheForTests
 * + reload) is picked up without a daemon restart. The underlying
 * provider constructors are cheap.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import type { AnalyzeConfig, AnalyzeShaperProviderKind, TierEffort } from '../../config/analyze.js';
import { getModelRegistry, ModelNotSupportedError, type ModelRegistry, type ResolvedModel } from '../../daemon/model-registry.js';
import type { CliFamilyId, EffortLevel, FamilyId } from '../../daemon/model-catalog.js';
import type { RoleId } from '../../config/role-taxonomy.js';
import type { RoleRouter } from './role-router.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import { CliProvider, type OllamaTarget } from '../../agent/providers/cli-provider.js';
import { OllamaProvider } from '../../agent/providers/ollama.js';
import { getLogger } from '../../shared/logger.js';
import type { LLMProvider } from '../../shared/types.js';

const log = getLogger('analyze:context:shaper-provider');

/**
 * Optional per-request overrides of the configured provider.
 */
export interface ShaperProviderOverrides {
	/** Provider to use when no explicit global `cfg.shaperProvider` is set —
	 *  the per-run caller, set by the MCP server from the invoking client
	 *  (Claude Code → 'cli-claude', Codex → 'cli-codex'). Falls back to the
	 *  ambient client-provider context (below). An explicit
	 *  `cfg.shaperProvider` always wins. */
	readonly clientDefault?: AnalyzeShaperProviderKind | undefined;
	/** Override the CLI subprocess timeout (ms) when the resolved provider is
	 *  `cli-claude`/`cli-codex`. The default (120 s) is fine for analyze's
	 *  narrow calls but too short for a workflow's full-artifact synthesize;
	 *  the daemon workflow runner passes a generous value. Ignored for Ollama. */
	readonly cliTimeoutMs?: number | undefined;
	/** HIGHEST-priority runner, set by the S003 RoleRouter from a
	 *  resolved capability tier. Fed into `resolveShaperKind` as its top-priority
	 *  `roleResolved` input so the tier's runner wins over repo/global/client
	 *  signals while the k1 CLI/Ollama admission stays in one place. Absent for
	 *  every legacy caller (behaviour unchanged). */
	readonly roleRunner?: AnalyzeShaperProviderKind | undefined;
	/** The resolved tier's concrete model id (e.g. `sonnet` for `mid`, a haiku id
	 *  for `cheap`). When set it is preferred over `cfg.shaperModel`, letting a
	 *  non-core tier pin a CLI/Ollama model the single `shaperModel` cannot
	 *  express. Absent for every legacy caller. */
	readonly roleModel?: string | undefined;
	/** The routed role's reasoning effort, set by the RoleRouter on every routed
	 *  call: a value, or null when the role's tier has none. Absent for callers
	 *  outside the router, which run at the core tier's effort (cfg.shaperEffort). */
	readonly roleEffort?: TierEffort | null | undefined;
	/** The registry provider settings come from (default: the daemon thread's
	 *  getModelRegistry()); the TUI passes its shipped-only registry. */
	readonly registry?: ModelRegistry | undefined;
}

/**
 * Ambient "which CLI invoked us" context. The MCP server wraps each
 * tool call in `runWithClientProviderContext('cli-claude' | 'cli-codex',
 * …)` based on the client's initialize `clientInfo.name`, so that when
 * config does NOT pin a shaperProvider the analyze pipeline defaults to
 * the matching CLI (Claude Code → claude CLI, Codex → codex CLI) instead
 * of local Ollama. Only meaningful for cli-* kinds; an explicit
 * `cfg.shaperProvider` still overrides it.
 */
const clientProviderContextStorage = new AsyncLocalStorage<{ kind: AnalyzeShaperProviderKind }>();

export function runWithClientProviderContext<T>(
	kind: AnalyzeShaperProviderKind,
	fn:   () => Promise<T>,
): Promise<T> {
	return clientProviderContextStorage.run({ kind }, fn);
}

/** The kind set by runWithClientProviderContext around the current call, if any. */
export function currentClientProviderKind(): AnalyzeShaperProviderKind | undefined {
	return clientProviderContextStorage.getStore()?.kind;
}

// ---------------------------------------------------------------------------
// RoutingSeamContext (Epic per-role-per-step, Story S005 — sc6).
//
// The ambient seam by which deep reasoning sites reach the per-run RoleRouter
// (sc3) WITHOUT threading a router argument through ~11 signatures. Established
// ONCE around a workflow-runner drive (mirroring runWithClientProviderContext)
// and read at each converted site via `resolveRoleProvider`. When unestablished,
// every site falls through to `buildShaperProvider(cfg)` byte-for-byte (k3), so
// analyze driven outside a workflow run behaves exactly as before.
// ---------------------------------------------------------------------------

/** sc6: the per-run routing handle — the sc3 RoleRouter + the active repo path
 *  (for the router's byRepo precedence layer). */
export interface RoutingSeamContext {
	readonly router:    RoleRouter;
	readonly repoPath?: string | undefined;
}

const routingContextStorage = new AsyncLocalStorage<RoutingSeamContext>();

/** Establish the routing seam for the duration of `fn` (the workflow-runner
 *  drive). Any `resolveRoleProvider` call inside `fn` — or any async task it
 *  spawns — resolves per-role via the ambient router. */
export function runWithRoutingContext<T>(ctx: RoutingSeamContext, fn: () => Promise<T>): Promise<T> {
	return routingContextStorage.run(ctx, fn);
}

/** Read the ambient routing seam, or undefined outside an established run.
 *  Exported for tests + observability. */
export function currentRoutingContext(): RoutingSeamContext | undefined {
	return routingContextStorage.getStore();
}

/**
 * Resolve the provider for a reasoning ROLE (S005/sc6). When a RoutingSeamContext
 * is established, dispatch through the sc3 RoleRouter (per-role tier + coreFloor
 * clamp + attribution) and return its provider. Otherwise invoke `legacyFallback`
 * (default: `buildShaperProvider(cfg)`) so behaviour off a run is byte-for-byte
 * unchanged (k3). The two formerly-hardcoded CLI sites pass a claude-preserving
 * fallback so their standalone default is not silently dropped to Ollama.
 *
 * Fails LOUD if a context is established but its `router` is nullish (a broken
 * establishment) rather than silently reverting the run to the legacy provider.
 */
export function resolveRoleProvider(
	role:            RoleId,
	cfg:             AnalyzeConfig,
	legacyFallback?: () => LLMProvider,
	execution?: ConnectionExecutionContext,
): LLMProvider {
	assertConnectionProviderAdmission(execution);
	const ctx = routingContextStorage.getStore();
	if (ctx !== undefined) {
		if (ctx.router === undefined || ctx.router === null) {
			throw new Error('resolveRoleProvider: RoutingSeamContext established but its router is nullish (broken establishment)');
		}
		return ctx.router.resolveProviderForRole(role, cfg, ctx.repoPath).provider;
	}
	return (legacyFallback ?? ((): LLMProvider => buildShaperProvider(cfg)))();
}

/**
 * Pure resolution of the effective shaper KIND, in strict priority order:
 *
 *   tier runner (router) > explicit global config > per-run caller > 'ollama'
 *
 * `globalExplicit` is `cfg.shaperProvider` ONLY when the operator explicitly
 * set `models.tiers.core.runner` (i.e. `cfg.shaperProviderExplicit`);
 * otherwise pass `undefined` so a defaulted-'ollama' global does not pre-empt
 * the per-run caller. Extracted + exported so the precedence is unit-testable
 * in isolation from provider construction.
 */
export function resolveShaperKind(inputs: {
	readonly globalExplicit: AnalyzeShaperProviderKind | undefined;
	readonly clientDefault:  AnalyzeShaperProviderKind | undefined;
	/** Optional HIGHEST-priority signal (S003 RoleRouter): the tier-resolved
	 *  runner. When present and a valid union member it wins over every other
	 *  signal; a non-union value is coerced to `undefined` so it falls through
	 *  the chain to the `?? 'ollama'` floor (no direct-REST path can slip in). */
	readonly roleResolved?:  AnalyzeShaperProviderKind | undefined;
	/** The model families (default: the daemon thread's registry). */
	readonly registry?:      ModelRegistry | undefined;
}): AnalyzeShaperProviderKind {
	const registry = inputs.registry ?? getModelRegistry();
	const roleResolved = isFamily(registry, inputs.roleResolved) ? inputs.roleResolved : undefined;
	return roleResolved ?? inputs.globalExplicit ?? inputs.clientDefault ?? registry.defaultFamily();
}

/** Type-guard a model family id — the structural gate that keeps a hand-edited
 *  or stale runner string (e.g. `'openai'`, a typo'd family) from reaching
 *  provider construction. */
function isFamily(registry: ModelRegistry, v: unknown): v is AnalyzeShaperProviderKind {
	return registry.families().some(f => f.id === v);
}

/** An Ollama model's context window: its token inputLimit, else the tool-loop
 *  model's (a model the definitions do not list). */
export function ollamaContextWindow(registry: ModelRegistry, model: ResolvedModel | undefined): number {
	const limit = model?.inputLimit ?? registry.toolLoopModel().inputLimit;
	return limit?.max ?? 0;
}

/**
 * The provider for one model of a family, built from the registry. A CLI family
 * gets a CliProvider with the family's CLI kind, the model's canonical id, the
 * effort only when the model accepts it, and the model's `chars` input budget;
 * `model` undefined lets the CLI run its own default model (no effort, no
 * budget). The ollama family gets an OllamaProvider for the model, or the
 * definitions' tool-loop model when none is given; num_ctx is its token limit.
 */
export function familyProvider(
	registry: ModelRegistry,
	family:   FamilyId,
	model:    ResolvedModel | undefined,
	opts:     { readonly effort?: EffortLevel | undefined; readonly cliTimeoutMs?: number | undefined } = {},
	execution?: ConnectionExecutionContext,
): LLMProvider {
	assertConnectionProviderAdmission(execution);
	const kind = registry.cliKind(family);
	if (kind !== undefined) {
		const effort = opts.effort !== undefined && model?.efforts.includes(opts.effort) === true ? opts.effort : undefined;
		if (opts.effort !== undefined && effort === undefined) {
			captureAnalysisDiagnostics(log).emit('warn', () => [{ family, model: model?.id ?? '(cli default)', effort: opts.effort }, 'provider: the model does not accept this effort; running at the CLI default effort']);
		}
		const inputBudgetChars = model?.inputLimit?.unit === 'chars' ? model.inputLimit.max : undefined;
		// An Ollama-hosted family runs its CLI against Ollama, only on a declared model.
		let ollama: OllamaTarget | undefined;
		if (registry.host(family) !== undefined) {
			if (model === undefined) throw new ModelNotSupportedError(family, '(none)', 'provider');
			ollama = { host: loadLocalProviderConfig().host, hosting: model.hosting ?? 'cloud' };
			captureAnalysisDiagnostics(log).emit('info', () => [{ family, model: model.id, hosting: ollama!.hosting, host: ollama!.host }, 'provider: the CLI runs against Ollama']);
		}
		return new CliProvider({
			kind,
			...(model !== undefined ? { model: model.id } : {}),
			...(ollama !== undefined ? { ollama } : {}),
			...(effort !== undefined ? { effort } : {}),
			...(inputBudgetChars !== undefined ? { inputBudgetChars } : {}),
			...(opts.cliTimeoutMs !== undefined ? { timeoutMs: opts.cliTimeoutMs } : {}),
		});
	}
	const local = loadLocalProviderConfig();
	const chosen = model ?? registry.toolLoopModel();
	return new OllamaProvider(chosen.id, local.host, ollamaContextWindow(registry, chosen));
}

/** What buildShaperProvider builds: the effective family, the model of that
 *  family it runs (undefined: a CLI's own default), and the effort asked for. */
export interface ShaperSelection {
	readonly registry: ModelRegistry;
	readonly family:   FamilyId;
	readonly model:    ResolvedModel | undefined;
	readonly effort:   EffortLevel | undefined;
	readonly source:   'role' | 'config' | 'client';
}

/**
 * The shaper's family and model. Only a model of the effective family is used:
 * a model of another family (e.g. an Ollama core model when the invoking CLI
 * decides the runner, or a CLI model when Ollama does) is not forwarded — a CLI
 * runs its own default model, Ollama the definitions' tool-loop model.
 */
export function shaperSelection(cfg: AnalyzeConfig, overrides?: ShaperProviderOverrides): ShaperSelection {
	const registry      = overrides?.registry ?? getModelRegistry();
	const clientDefault = overrides?.clientDefault ?? clientProviderContextStorage.getStore()?.kind;
	const roleRunner    = overrides?.roleRunner;
	const globalExplicit = cfg.shaperProviderExplicit ? cfg.shaperProvider : undefined;
	const family = resolveShaperKind({ globalExplicit, clientDefault, roleResolved: roleRunner, registry });
	// A RoleRouter-resolved tier model (S003) is preferred over cfg.shaperModel.
	const roleModel = overrides?.roleModel !== undefined && overrides.roleModel !== '' ? overrides.roleModel : undefined;
	const requested = roleModel ?? cfg.shaperModel;
	let model = registry.find(family, requested);
	if (model === undefined && registry.cliKind(family) === undefined) {
		model = registry.toolLoopModel();
		if (requested !== '') captureAnalysisDiagnostics(log).emit('warn', () => [{ family, requested, model: model!.id }, 'shaper provider: the model is not a listed local model; running the tool-loop model']);
	}
	const effort = overrides?.roleEffort === undefined ? cfg.shaperEffort : overrides.roleEffort ?? undefined;
	const source = roleRunner !== undefined ? 'role' : globalExplicit !== undefined ? 'config' : 'client';
	return { registry, family, model, effort, source };
}

/** The `meta.model` label for what buildShaperProvider builds with the same
 *  inputs: `<cli kind>[:<model>]` for a CLI family, `<family>:<model>` otherwise. */
export function shaperModelLabel(cfg: AnalyzeConfig, overrides?: ShaperProviderOverrides): string {
	const s = shaperSelection(cfg, overrides);
	const cli = s.registry.cliKind(s.family);
	if (cli === undefined) return `${s.family}:${s.model!.id}`;
	// An Ollama-hosted family is named by its own id, so attribution keeps it apart from the vendor family.
	if (s.registry.host(s.family) !== undefined) return s.model !== undefined ? `${s.family}:${s.model.id}` : s.family;
	return s.model !== undefined ? `${cli}:${s.model.id}` : cli;
}

/**
 * Return the `LLMProvider` implementation the analyze framework
 * should use for its structured-output calls.
 *
 * The effective KIND via `resolveShaperKind`:
 *        tier runner (router) > explicit global config > per-run caller > 'ollama'
 *      cli-claude / cli-codex -> `CliProvider`; 'ollama' -> `OllamaProvider`.
 *
 * Cheap; call per invocation rather than caching because config
 * edits + per-request overrides are the common shape.
 */
export function buildShaperProvider(
	cfg:       AnalyzeConfig,
	overrides?: ShaperProviderOverrides,
	execution?: ConnectionExecutionContext,
): LLMProvider {
	assertConnectionProviderAdmission(execution);
	// Effective provider: tier runner (router) > explicit global config >
	// per-run caller (arg or ambient client-provider context) > the default family.
	// See resolveShaperKind and shaperSelection.
	const { registry, family, model, effort, source } = shaperSelection(cfg, overrides);
	// A refused tier on an Ollama-hosted family names the model it asked for.
	if (model === undefined && registry.host(family) !== undefined) {
		const requested = overrides?.roleModel !== undefined && overrides.roleModel !== '' ? overrides.roleModel : cfg.shaperModel;
		throw new ModelNotSupportedError(family, requested, 'shaper provider');
	}
	captureAnalysisDiagnostics(log).emit('info', () => [{ family, model: model?.id ?? '(cli default)', effort: effort ?? '(cli default)', source, timeoutMs: overrides?.cliTimeoutMs }, 'shaper provider: built from the model definitions']);
	return familyProvider(registry, family, model, { effort, cliTimeoutMs: overrides?.cliTimeoutMs });
}

/**
 * Provider for BACKGROUND doc-summarisation (analyze/summariser/driver.ts).
 *
 * Deliberately SEPARATE from `buildShaperProvider`: summarisation runs during
 * indexing over many docs, so it must NOT inherit the interactive
 * `shaperProvider` (which the operator may have pinned to a cloud CLI, or which
 * the per-run MCP client sets). This ignores the client-provider ambient
 * context entirely and builds strictly from `cfg.summariser*`, which follow the
 * CHEAP tier: a CLI by default (haiku), because not every machine can run even a
 * small local model, and an `ollama` cheap tier keeps summarising local. A CLI
 * summariser costs one serial subprocess per doc, so it always pins the cheap
 * tier's model and never runs on the CLI's own default model.
 */
/** The summariser's family, model and effort: the cheap tier's model when it
 *  is a model of its family, else the family's summariser model (a CLI) or the
 *  tool-loop model (Ollama) — never a CLI's own default; the cheap tier's
 *  effort only when that model accepts it. */
export function summariserSelection(cfg: AnalyzeConfig, overrides?: Pick<ShaperProviderOverrides, 'registry'>): { registry: ModelRegistry; family: FamilyId; model: ResolvedModel; effort: EffortLevel | undefined } {
	const registry = overrides?.registry ?? getModelRegistry();
	const family = cfg.summariserProvider;
	let model = registry.find(family, cfg.summariserModel);
	if (model === undefined) {
		// An Ollama-hosted family runs only what it declares: refuse, substitute nothing.
		if (registry.host(family) !== undefined) throw new ModelNotSupportedError(family, cfg.summariserModel, 'summariser provider');
		const cli = registry.cliKind(family) !== undefined;
		model = cli ? registry.summariserModel(family as CliFamilyId) : registry.toolLoopModel();
		captureAnalysisDiagnostics(log).emit('warn', () => [{ family, configured: cfg.summariserModel, model: model!.id }, cli
			? "summariser provider: the cheap tier model is not a model of its family; using the family's summariser model"
			: 'summariser provider: the cheap tier model is not a listed local model; running the tool-loop model']);
	}
	const effort = cfg.summariserEffort !== undefined && model.efforts.includes(cfg.summariserEffort) ? cfg.summariserEffort : undefined;
	return { registry, family, model, effort };
}

export function buildSummariserProvider(cfg: AnalyzeConfig, overrides?: Pick<ShaperProviderOverrides, 'registry'>, execution?: ConnectionExecutionContext): LLMProvider {
	assertConnectionProviderAdmission(execution);
	const { registry, family, model, effort } = summariserSelection(cfg, overrides);
	captureAnalysisDiagnostics(log).emit('info', () => [{ family, model: model.id, effort: effort ?? '(cli default)' }, 'summariser provider: built from the model definitions']);
	return familyProvider(registry, family, model, { effort });
}
