/**
 * Unit tests for `buildShaperProvider` -- the single dispatch point
 * that swaps the analyze framework's LLM backend from Ollama to
 * `CliProvider('claude' | 'codex')` in the MCP-integration path.
 *
 * The factory is called from ~11 sites (decomposer, synthesizer,
 * doc-decision-trace, doc-constraint-enumerate, capability-reuse-
 * check, classifier, planner, summariser, adherence,
 * aggregator). Changing its dispatch quietly ripples everywhere, so
 * this test pins the exact provider class returned per config kind.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { OllamaProvider } from '../../../agent/providers/ollama.js';
import type { AnalyzeConfig } from '../../../config/analyze.js';
import { buildShaperProvider, isOllamaModelId, resolveShaperKind, runWithClientProviderContext } from '../shaper-provider.js';

function makeCfg(overrides: Partial<AnalyzeConfig>): AnalyzeConfig {
	return {
		shaperProvider: 'ollama',
		shaperProviderExplicit: true,
		shaperModel:    'qwen3.6:35b-a3b',
		shaperModelExplicit: true,
		shaper: {
			maxToolTurns:            40,
			structuredOutputRetries: 3,
			ollamaNumCtx:            32_768,
			ollamaNumPredict:        20_480,
		},
		maxPlanDepth: { XS: 2, S: 3, M: 4, L: 5, XL: 6 },
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

test('shaperProvider=ollama returns an OllamaProvider', () => {
	const p = buildShaperProvider(makeCfg({ shaperProvider: 'ollama' }));
	assert.ok(p instanceof OllamaProvider);
});

test('shaperProvider=cli-claude returns a CliProvider (claude kind)', () => {
	const p = buildShaperProvider(makeCfg({ shaperProvider: 'cli-claude' }));
	assert.ok(p instanceof CliProvider);
	// CliProvider's kind is private; assert via the public capability
	// surface. `supportsTools === false` is the CLI-wrapper signature.
	assert.equal(p.supportsTools, false);
});

test('shaperProvider=cli-codex returns a CliProvider', () => {
	const p = buildShaperProvider(makeCfg({ shaperProvider: 'cli-codex' }));
	assert.ok(p instanceof CliProvider);
	assert.equal(p.supportsTools, false);
});

// ---------------------------------------------------------------------------
// Guard: never forward an Ollama-shaped model id to a CLI (the haiku/api_error
// class of bug — a mis-set `shaperProvider: cli-claude` + Ollama `shaperModel`).
// ---------------------------------------------------------------------------

test('isOllamaModelId is true for `:`-tagged ids, false for CLI model ids', () => {
	for (const id of ['qwen3.6:35b-a3b', 'qwen3-embedding:0.6b', 'llama3:8b']) assert.equal(isOllamaModelId(id), true, id);
	for (const id of ['opus', 'sonnet', 'claude-haiku-4-5', 'claude-opus-4-8', '']) assert.equal(isOllamaModelId(id), false, id);
});

test('cli-claude + explicit Ollama shaperModel → CliProvider with NO model (CLI default)', () => {
	// makeCfg's default shaperModel is the Ollama id `qwen3.6:35b-a3b`.
	const p = buildShaperProvider(makeCfg({ shaperProvider: 'cli-claude' }));
	assert.ok(p instanceof CliProvider);
	assert.equal(p.defaultModel, undefined);   // dropped, not forwarded to the CLI
});

test('cli-claude + a real claude shaperModel → forwarded verbatim', () => {
	const p = buildShaperProvider(makeCfg({ shaperProvider: 'cli-claude', shaperModel: 'claude-haiku-4-5', shaperModelExplicit: true }));
	assert.ok(p instanceof CliProvider);
	assert.equal(p.defaultModel, 'claude-haiku-4-5');
});

test('cli-claude + a role-tier claude model → forwarded (role model wins)', () => {
	const p = buildShaperProvider(makeCfg({ shaperProvider: 'cli-claude' }), { roleModel: 'opus' });
	assert.ok(p instanceof CliProvider);
	assert.equal(p.defaultModel, 'opus');
});

test('cli-claude + a role-tier model that is Ollama-shaped → also dropped', () => {
	const p = buildShaperProvider(makeCfg({ shaperProvider: 'cli-claude' }), { roleModel: 'qwen3.6:35b-a3b' });
	assert.ok(p instanceof CliProvider);
	assert.equal(p.defaultModel, undefined);
});

test('ollama path is unchanged: the Ollama model id is still used', () => {
	const p = buildShaperProvider(makeCfg({ shaperProvider: 'ollama', shaperModel: 'qwen3.6:35b-a3b' }));
	assert.ok(p instanceof OllamaProvider);   // no guard on the local path
});

// ---------------------------------------------------------------------------
// Model plumbing
// ---------------------------------------------------------------------------

test('shaperProvider=ollama honours cfg.shaperModel + cfg.shaper.ollamaNumCtx', () => {
	// The Ollama constructor keeps these on the instance, but they're
	// private. We can at least confirm construction did not throw for
	// a non-default combination.
	const p = buildShaperProvider(makeCfg({
		shaperProvider: 'ollama',
		shaperModel:    'llama3:70b',
		shaper: {
			maxToolTurns:            40,
			structuredOutputRetries: 3,
			ollamaNumCtx:            8_000,
			ollamaNumPredict:        4_096,
		},
	}));
	assert.ok(p instanceof OllamaProvider);
});

test('shaperProvider=cli-* is idempotent -- repeated calls return distinct instances', () => {
	// Not strictly a factory contract (fresh instance is fine), but
	// pins that the factory never leaks a shared singleton by accident.
	const a = buildShaperProvider(makeCfg({ shaperProvider: 'cli-claude' }));
	const b = buildShaperProvider(makeCfg({ shaperProvider: 'cli-claude' }));
	assert.notStrictEqual(a, b);
});

// ---------------------------------------------------------------------------
// Client-inferred default (Claude Code / Codex invoking the MCP server)
// ---------------------------------------------------------------------------

test('clientDefault picks the matching CLI when config does NOT pin a provider', () => {
	const cfg = makeCfg({ shaperProvider: 'ollama', shaperProviderExplicit: false });
	assert.ok(buildShaperProvider(cfg, { clientDefault: 'cli-claude' }) instanceof CliProvider);
	assert.ok(buildShaperProvider(cfg, { clientDefault: 'cli-codex' }) instanceof CliProvider);
});

test('explicit config shaperProvider overrides the clientDefault', () => {
	// User pinned ollama; a Claude Code invocation must still get Ollama.
	const cfg = makeCfg({ shaperProvider: 'ollama', shaperProviderExplicit: true });
	assert.ok(buildShaperProvider(cfg, { clientDefault: 'cli-claude' }) instanceof OllamaProvider);
});

test('ambient runWithClientProviderContext supplies the default', async () => {
	const cfg = makeCfg({ shaperProvider: 'ollama', shaperProviderExplicit: false });
	const p = await runWithClientProviderContext('cli-codex', async () => buildShaperProvider(cfg));
	assert.ok(p instanceof CliProvider);
	// outside the context, the config default (ollama) applies again
	assert.ok(buildShaperProvider(cfg) instanceof OllamaProvider);
});

// ---------------------------------------------------------------------------
// Resolution chain: global config > per-run caller > ollama
// ---------------------------------------------------------------------------

test('resolveShaperKind: explicit global wins over the per-run caller', () => {
	assert.equal(
		resolveShaperKind({ globalExplicit: 'ollama', clientDefault: 'cli-claude' }),
		'ollama',
	);
});

test('resolveShaperKind: per-run caller used when the global is unset', () => {
	assert.equal(
		resolveShaperKind({ globalExplicit: undefined, clientDefault: 'cli-codex' }),
		'cli-codex',
	);
});

test('resolveShaperKind: ollama when all signals are unset', () => {
	assert.equal(
		resolveShaperKind({ globalExplicit: undefined, clientDefault: undefined }),
		'ollama',
	);
});

