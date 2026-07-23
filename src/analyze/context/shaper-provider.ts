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
 * A future revision may route those through MCP sampling instead;
 * for now they remain Ollama-only regardless of this factory's
 * output.
 *
 * The factory reads config on every call rather than caching so a
 * mid-process config change (via _resetAnalyzeConfigCacheForTests
 * + reload) is picked up without a daemon restart. The underlying
 * provider constructors are cheap.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import type { AnalyzeConfig, AnalyzeShaperProviderKind } from '../../config/analyze.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import { CliProvider } from '../../agent/providers/cli-provider.js';
import {
	McpSamplingProvider,
	type SamplingCallback,
} from '../../agent/providers/mcp-sampling-provider.js';
import { OllamaProvider } from '../../agent/providers/ollama.js';
import { getLogger } from '../../shared/logger.js';
import type { LLMProvider } from '../../shared/types.js';

const log = getLogger('analyze:context:shaper-provider');

/**
 * Optional per-request overrides. The MCP server layer sets
 * `sampler` when it wants the daemon's inner LLM calls to route back
 * to the calling client via `sampling/createMessage`. When present,
 * the sampler always wins over `cfg.shaperProvider` -- MCP-integrated
 * requests should never subprocess-spawn a CLI or hit local Ollama.
 * Callers who want the config default explicitly can pass `undefined`.
 */
export interface ShaperProviderOverrides {
	readonly sampler?: SamplingCallback | undefined;
	/** Optional model-preference hints forwarded on every sampling
	 *  request. Ignored when `sampler` is undefined. */
	readonly modelHints?: readonly string[] | undefined;
	/** Highest-priority NON-sampler signal: a repo-scoped provider pinned via
	 *  `models.analyze.byRepo[repoPath].shaperProvider` (resolved by the caller
	 *  through `resolveRepoShaperProvider`). Wins over the global config default
	 *  and the per-run `clientDefault`. Only the active sampler beats it. */
	readonly repoOverride?: AnalyzeShaperProviderKind | undefined;
	/** Provider to use when NEITHER a per-repo override NOR an explicit global
	 *  `cfg.shaperProvider` is set — the per-run caller, set by the MCP server
	 *  from the invoking client (Claude Code → 'cli-claude', Codex →
	 *  'cli-codex'). Falls back to the ambient client-provider context (below).
	 *  A per-repo override or an explicit `cfg.shaperProvider` always wins. */
	readonly clientDefault?: AnalyzeShaperProviderKind | undefined;
	/** Override the CLI subprocess timeout (ms) when the resolved provider is
	 *  `cli-claude`/`cli-codex`. The default (120 s) is fine for analyze's
	 *  narrow calls but too short for a workflow's full-artifact synthesize;
	 *  the daemon workflow runner passes a generous value. Ignored for Ollama. */
	readonly cliTimeoutMs?: number | undefined;
}

/**
 * Request-scoped storage for the sampler. The MCP server wraps each
 * incoming tool call in `runWithSamplerContext(...)` so every LLM
 * call site downstream automatically picks up the sampler without
 * every runner having to accept + thread an `overrides` argument.
 *
 * This is the SAME mechanism the factory uses when an explicit
 * `overrides` arg is passed -- `buildShaperProvider` prefers the
 * explicit arg but falls back to the ALS-stored context so the
 * common case (MCP handler enters `runWithSamplerContext`, downstream
 * code just calls `buildShaperProvider(cfg)`) works without further
 * plumbing.
 */
interface SamplerContext {
	readonly sampler:    SamplingCallback;
	readonly modelHints: readonly string[];
}

const samplerContextStorage = new AsyncLocalStorage<SamplerContext>();

/**
 * Run `fn` with a sampler installed on the ambient async context.
 * Any `buildShaperProvider(cfg)` call inside the callback (or in any
 * async task spawned from it) picks up the sampler automatically.
 * The context is torn down when `fn` returns / throws.
 */
export function runWithSamplerContext<T>(
	sampler:    SamplingCallback,
	modelHints: readonly string[],
	fn:         () => Promise<T>,
): Promise<T> {
	return samplerContextStorage.run({ sampler, modelHints }, fn);
}

/**
 * Peek at the current sampler context (undefined when we're outside
 * a `runWithSamplerContext` scope). Exported for tests + the MCP
 * server's logging.
 */
export function currentSamplerContext(): SamplerContext | undefined {
	return samplerContextStorage.getStore();
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

/**
 * Pure resolution of the effective shaper KIND across the non-sampler signals,
 * in strict priority order:
 *
 *   per-repo override > explicit global config > per-run caller > 'ollama'
 *
 * The sampler (when active) sits ABOVE all of these and is handled in
 * `buildShaperProvider` before this function is consulted — it routes to
 * `McpSamplingProvider` rather than a KIND, so it is not represented here.
 *
 * `globalExplicit` is `cfg.shaperProvider` ONLY when the operator explicitly
 * set `models.analyze.shaperProvider` (i.e. `cfg.shaperProviderExplicit`);
 * otherwise pass `undefined` so a defaulted-'ollama' global does not pre-empt
 * the per-run caller. Extracted + exported so the precedence is unit-testable
 * in isolation from provider construction.
 */
export function resolveShaperKind(inputs: {
	readonly repoOverride:   AnalyzeShaperProviderKind | undefined;
	readonly globalExplicit: AnalyzeShaperProviderKind | undefined;
	readonly clientDefault:  AnalyzeShaperProviderKind | undefined;
}): AnalyzeShaperProviderKind {
	return inputs.repoOverride ?? inputs.globalExplicit ?? inputs.clientDefault ?? 'ollama';
}

/**
 * Return the `LLMProvider` implementation the analyze framework
 * should use for its structured-output calls.
 *
 * Priority order:
 *   1. `overrides.sampler` -> `McpSamplingProvider` (explicit MCP override)
 *   2. ambient `runWithSamplerContext` sampler -> `McpSamplingProvider`
 *      (implicit MCP override; how the server threads the sampler
 *      through the analyze pipeline without touching every runner)
 *   3. effective KIND via `resolveShaperKind`:
 *        per-repo override > explicit global config > per-run caller > 'ollama'
 *      cli-claude / cli-codex -> `CliProvider`; 'ollama' -> `OllamaProvider`.
 *
 * Cheap; call per invocation rather than caching because config
 * edits + per-request overrides are the common shape.
 */
export function buildShaperProvider(
	cfg:       AnalyzeConfig,
	overrides?: ShaperProviderOverrides,
): LLMProvider {
	if (overrides?.sampler !== undefined) {
		log.info(
			{ modelHints: overrides.modelHints ?? [] },
			'shaper provider: routing through McpSamplingProvider (explicit override)',
		);
		return new McpSamplingProvider({
			sampler: overrides.sampler,
			...(overrides.modelHints !== undefined ? { modelHints: overrides.modelHints } : {}),
		});
	}
	const ambient = samplerContextStorage.getStore();
	if (ambient !== undefined) {
		log.info(
			{ modelHints: ambient.modelHints },
			'shaper provider: routing through McpSamplingProvider (ambient context)',
		);
		return new McpSamplingProvider({
			sampler:    ambient.sampler,
			modelHints: ambient.modelHints,
		});
	}
	// Effective provider (non-sampler): per-repo override > explicit global
	// config > per-run caller (arg or ambient client-provider context) >
	// 'ollama'. See resolveShaperKind.
	const clientDefault = overrides?.clientDefault ?? clientProviderContextStorage.getStore()?.kind;
	const repoOverride  = overrides?.repoOverride;
	const globalExplicit = cfg.shaperProviderExplicit ? cfg.shaperProvider : undefined;
	const effective = resolveShaperKind({ repoOverride, globalExplicit, clientDefault });

	if (effective === 'cli-claude' || effective === 'cli-codex') {
		const kind = effective === 'cli-claude' ? 'claude' : 'codex';
		// The default `shaperModel` (`qwen3.6:35b-a3b`) is an Ollama id —
		// never forward it to a CLI. Only pin a CLI model when the operator
		// set `shaperModel` explicitly (e.g. `claude-haiku-4-5` for
		// cost-sensitive inner calls); otherwise use the CLI's own default.
		const model = cfg.shaperModelExplicit && cfg.shaperModel !== '' ? cfg.shaperModel : undefined;
		const source = repoOverride !== undefined ? 'repo' : globalExplicit !== undefined ? 'config' : 'client';
		log.info(
			{ kind, model: model ?? '(cli default)', source, timeoutMs: overrides?.cliTimeoutMs },
			'shaper provider: routing through CliProvider',
		);
		return new CliProvider({
			kind,
			...(model !== undefined ? { model } : {}),
			...(overrides?.cliTimeoutMs !== undefined ? { timeoutMs: overrides.cliTimeoutMs } : {}),
		});
	}
	// Default + explicit 'ollama'.
	log.info(
		{ model: cfg.shaperModel, numCtx: cfg.shaper.ollamaNumCtx },
		'shaper provider: routing through OllamaProvider',
	);
	const local = loadLocalProviderConfig();
	return new OllamaProvider(cfg.shaperModel, local.host, cfg.shaper.ollamaNumCtx);
}

/**
 * Provider for BACKGROUND doc-summarisation (analyze/summariser/driver.ts).
 *
 * Deliberately SEPARATE from `buildShaperProvider`: summarisation runs during
 * indexing over many docs, so it must NOT inherit the interactive
 * `shaperProvider` (which the operator may have pinned to a cloud CLI, or which
 * the per-run MCP client sets) — that would spawn a `claude`/`codex` subprocess
 * per doc, serial + quota-burning. This ignores the sampler + client-provider
 * ambient contexts entirely and builds strictly from `cfg.summariser*`,
 * defaulting to LOCAL `ollama` (`qwen3.6:35b-a3b`, a MoE). Only if the operator
 * explicitly sets `models.analyze.summariserProvider` to a `cli-*` does it use
 * a CLI.
 */
export function buildSummariserProvider(cfg: AnalyzeConfig): LLMProvider {
	const kind = cfg.summariserProvider;
	if (kind === 'cli-claude' || kind === 'cli-codex') {
		const cliKind = kind === 'cli-claude' ? 'claude' : 'codex';
		// The default summariserModel (`qwen3.6:35b-a3b`) is an Ollama id — never
		// forward it to a CLI; only pin a CLI model when set explicitly.
		const model = cfg.summariserModelExplicit && cfg.summariserModel !== '' ? cfg.summariserModel : undefined;
		log.info({ kind: cliKind, model: model ?? '(cli default)' }, 'summariser provider: routing through CliProvider');
		return new CliProvider({ kind: cliKind, ...(model !== undefined ? { model } : {}) });
	}
	log.info({ model: cfg.summariserModel, numCtx: cfg.shaper.ollamaNumCtx }, 'summariser provider: routing through OllamaProvider (local)');
	const local = loadLocalProviderConfig();
	return new OllamaProvider(cfg.summariserModel, local.host, cfg.shaper.ollamaNumCtx);
}
