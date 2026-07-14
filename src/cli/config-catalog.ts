/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Catalog of recognized `~/.insrc/config.json` options, so the command
 * bar's `config list` can show what's configurable (not just what's set).
 *
 * The config has grown a few overlapping subtrees; this catalog is the
 * UNION of them. SOURCE OF TRUTH — keep in sync with:
 *   - the first-boot default written in src/daemon/index.ts (~L178) and
 *     the `Config` type in src/shared/types.ts   → the "main" keys
 *   - src/config/local.ts   → models.providers.local.*  (embedder / local provider)
 *   - src/config/analyze.ts → models.analyze.*          (analyze shaper)
 *
 * NOTE: `models.embedding` / `models.embeddingDim` (main) and
 * `models.providers.local.embeddingModel` / `embeddingDim` (embedder
 * loader) are different keys read by different code — see the daemon
 * config-schema note. Both are listed so neither is hidden.
 */

export interface ConfigOption {
	readonly path:    string;        // dot-path into config.json
	readonly type:    'string' | 'number' | 'boolean' | 'enum';
	readonly default: unknown;
	readonly desc:    string;
}

export const CONFIG_CATALOG: readonly ConfigOption[] = [
	// ── main config (src/daemon/index.ts first-boot default + Config type) ──
	{ path: 'logLevel',              type: 'enum',   default: 'info',                    desc: "daemon log level: 'error' | 'warn' | 'info' | 'debug'" },
	{ path: 'ollama.host',           type: 'string', default: 'http://localhost:11434',  desc: 'Ollama server URL (daemon-wide)' },
	{ path: 'models.local',          type: 'string', default: 'qwen3-coder:latest',      desc: 'local core model id' },
	{ path: 'models.embedding',      type: 'string', default: 'qwen3-embedding:0.6b',    desc: 'embedding model id (main config)' },
	{ path: 'models.embeddingDim',   type: 'number', default: 1024,                       desc: 'embedding dimensions (main config)' },
	{ path: 'models.tiers.fast',     type: 'string', default: 'claude-haiku-4-5',         desc: 'cloud tier — fast' },
	{ path: 'models.tiers.standard', type: 'string', default: 'claude-sonnet-4-6',        desc: 'cloud tier — standard' },
	{ path: 'models.tiers.powerful', type: 'string', default: 'claude-opus-4-6',          desc: 'cloud tier — powerful' },
	{ path: 'models.context.local',           type: 'number', default: 16384,  desc: 'local model context window (tokens)' },
	{ path: 'models.context.localMaxOutput',  type: 'number', default: 8192,   desc: 'local model max output (tokens)' },
	{ path: 'models.context.claude',          type: 'number', default: 200000, desc: 'cloud context window (tokens)' },
	{ path: 'models.context.claudeMaxOutput', type: 'number', default: 8192,   desc: 'cloud max output (tokens)' },
	{ path: 'models.context.charsPerToken',   type: 'number', default: 3,      desc: 'chars→tokens heuristic ratio' },
	{ path: 'permissions.mode',      type: 'enum',    default: 'validate',      desc: "tool permission mode: 'validate' | 'auto-accept'" },
	{ path: 'routing.mode',          type: 'string',  default: 'static',        desc: 'agent routing mode' },
	{ path: 'analyzer.useLocal',     type: 'boolean', default: false,           desc: 'force code/data analyzers to local Ollama instead of cloud' },
	{ path: 'classifier.confirmIntent', type: 'boolean', default: false,        desc: 'prompt to confirm the classified intent each turn' },
	{ path: 'memory.implicitCapture.enabled', type: 'boolean', default: false,  desc: 'implicit memory capture during retrieval (backstop)' },

	// ── analyze shaper (src/config/analyze.ts → models.analyze.*) ──
	{ path: 'models.analyze.shaperProvider',                 type: 'enum',   default: 'ollama',          desc: "analyze shaper backend: 'ollama' | 'cli-claude' | 'cli-codex'" },
	{ path: 'models.analyze.shaperModel',                    type: 'string', default: 'qwen3.6:35b-a3b', desc: 'shaper model id (Ollama path)' },
	{ path: 'models.analyze.shaper.maxToolTurns',            type: 'number', default: 40,    desc: 'max tool-loop turns for the shaper' },
	{ path: 'models.analyze.shaper.structuredOutputRetries', type: 'number', default: 3,     desc: 'structured-output retry count' },
	{ path: 'models.analyze.shaper.ollamaNumCtx',           type: 'number', default: 32768,  desc: 'shaper Ollama context window' },
	{ path: 'models.analyze.shaper.ollamaNumPredict',       type: 'number', default: 20480,  desc: 'shaper Ollama max output tokens' },
	{ path: 'models.analyze.maxPlanDepth.XS', type: 'number', default: 2, desc: 'max plan-tree depth — XS-scope roots' },
	{ path: 'models.analyze.maxPlanDepth.S',  type: 'number', default: 3, desc: 'max plan-tree depth — S-scope roots' },
	{ path: 'models.analyze.maxPlanDepth.M',  type: 'number', default: 4, desc: 'max plan-tree depth — M-scope roots' },
	{ path: 'models.analyze.maxPlanDepth.L',  type: 'number', default: 5, desc: 'max plan-tree depth — L-scope roots' },
	{ path: 'models.analyze.maxPlanDepth.XL', type: 'number', default: 6, desc: 'max plan-tree depth — XL-scope roots' },

	// ── local provider / embedder (src/config/local.ts → models.providers.local.*) ──
	{ path: 'models.providers.local.host',           type: 'string', default: 'http://localhost:11434', desc: 'Ollama host for the embedder/local provider' },
	{ path: 'models.providers.local.embeddingModel', type: 'string', default: 'qwen3-embedding:0.6b',    desc: "embedder model id ('nomic-ai/nomic-embed-text-v1.5' for ONNX) — read by the embedder" },
	{ path: 'models.providers.local.embeddingDim',   type: 'number', default: 1024,                       desc: 'embedder dimensions (768 for ONNX) — read by the embedder' },
	{ path: 'models.providers.local.coreModel',      type: 'string', default: 'qwen3-coder:latest',       desc: 'local core / summariser model id' },
	{ path: 'models.providers.local.charsPerToken',  type: 'number', default: 3,                          desc: 'chars→tokens heuristic (local provider)' },
];
