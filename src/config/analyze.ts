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
	readonly shaper:         AnalyzeShaperConfig;
	readonly maxPlanDepth:   MaxPlanDepthMap;
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
			shaper:         DEFAULT_SHAPER,
			maxPlanDepth:   DEFAULT_MAX_PLAN_DEPTH,
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
			shaper:         DEFAULT_SHAPER,
			maxPlanDepth:   DEFAULT_MAX_PLAN_DEPTH,
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

export function _resetAnalyzeConfigCacheForTests(): void {
	cached = undefined;
}
