/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Catalog of recognized `~/.insrc/config.json` options — the keys the
 * daemon's config loaders actually read, with their defaults. Used by
 * the command bar's `config list` so users can discover what's
 * configurable (not just what happens to be set).
 *
 * SOURCE OF TRUTH — keep in sync with:
 *   - src/config/local.ts   (models.providers.local.*)
 *   - src/config/analyze.ts (models.analyze.*)
 * If those loaders gain/rename a key, update this list.
 */

export interface ConfigOption {
	readonly path:    string;        // dot-path into config.json
	readonly type:    'string' | 'number' | 'enum';
	readonly default: unknown;
	readonly desc:    string;
}

export const CONFIG_CATALOG: readonly ConfigOption[] = [
	// Local provider (src/config/local.ts)
	{ path: 'models.providers.local.host',           type: 'string', default: 'http://localhost:11434', desc: 'Ollama host URL' },
	{ path: 'models.providers.local.embeddingModel', type: 'string', default: 'qwen3-embedding:0.6b',    desc: "embedding model id ('nomic-ai/nomic-embed-text-v1.5' for ONNX)" },
	{ path: 'models.providers.local.embeddingDim',   type: 'number', default: 1024,                       desc: 'embedding dimensions (768 for the ONNX embedder)' },
	{ path: 'models.providers.local.coreModel',      type: 'string', default: 'qwen3-coder:latest',       desc: 'local core / summariser model id' },
	{ path: 'models.providers.local.charsPerToken',  type: 'number', default: 3,                          desc: 'chars→tokens heuristic ratio' },

	// Analyze shaper (src/config/analyze.ts)
	{ path: 'models.analyze.shaperProvider',                  type: 'enum',   default: 'ollama',            desc: "analyze shaper backend: 'ollama' | 'cli-claude' | 'cli-codex'" },
	{ path: 'models.analyze.shaperModel',                     type: 'string', default: 'qwen3.6:35b-a3b',   desc: 'shaper model id (Ollama path)' },
	{ path: 'models.analyze.shaper.maxToolTurns',            type: 'number', default: 40,                   desc: 'max tool-loop turns for the shaper' },
	{ path: 'models.analyze.shaper.structuredOutputRetries', type: 'number', default: 3,                    desc: 'structured-output retry count' },
	{ path: 'models.analyze.shaper.ollamaNumCtx',           type: 'number', default: 32768,                desc: 'shaper Ollama context window' },
	{ path: 'models.analyze.shaper.ollamaNumPredict',       type: 'number', default: 20480,                desc: 'shaper Ollama max output tokens' },
	{ path: 'models.analyze.maxPlanDepth.XS', type: 'number', default: 2, desc: 'max plan-tree depth for XS-scope roots' },
	{ path: 'models.analyze.maxPlanDepth.S',  type: 'number', default: 3, desc: 'max plan-tree depth for S-scope roots' },
	{ path: 'models.analyze.maxPlanDepth.M',  type: 'number', default: 4, desc: 'max plan-tree depth for M-scope roots' },
	{ path: 'models.analyze.maxPlanDepth.L',  type: 'number', default: 5, desc: 'max plan-tree depth for L-scope roots' },
	{ path: 'models.analyze.maxPlanDepth.XL', type: 'number', default: 6, desc: 'max plan-tree depth for XL-scope roots' },
];
