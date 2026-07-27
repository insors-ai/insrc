/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Catalog of recognized `~/.insrc/config.json` options.
 *
 * SINGLE DEFINITION SITE. This lives in src/config (not src/cli) so the
 * daemon-boot reconcile (src/daemon/index.ts step 2b) can reach it
 * without creating a daemon→cli import edge — src/config must import
 * nothing from src/cli. The CLI command bar's `config list` re-exports
 * it from src/cli/config-catalog.ts (a pure re-export shim).
 *
 * There are exactly TWO canonical model-config surfaces (the legacy
 * top-level model block was retired — see RETIRED_PATHS). SOURCE OF TRUTH
 * — keep in sync with:
 *   - src/config/local.ts   → models.providers.local.*  (the LIVE local surface:
 *     host / coreModel / embeddingModel / embeddingDim / charsPerToken)
 *   - src/config/analyze.ts → models.analyze.*          (the LIVE cloud/tiering
 *     surface: shaperProvider / shaperModel / tiers / roleTiers / coreFloor / byRepo)
 * plus the daemon-wide non-model keys (logLevel, ollama.host, permissions,
 * routing, analyzer, classifier, memory). The boot reconcile
 * (src/daemon/index.ts step 2b) fills every catalog default.
 */

export interface ConfigOption {
	readonly path:    string;        // dot-path into config.json
	readonly type:    'string' | 'number' | 'boolean' | 'enum';
	readonly default: unknown;
	readonly desc:    string;
}

/**
 * A declared-RETIRED config path — a key the daemon once wrote/recognized
 * but no longer reads. The reconcile strips it from existing configs on
 * boot/update (see reconcileConfig). `prefix: true` strips the path AND its
 * whole subtree (for dynamic namespaces like models.agents whose sub-keys
 * are not enumerable); the default (exact) strips a single scalar leaf.
 *
 * INVARIANT: every RetiredPath.path MUST be disjoint from every live
 * CONFIG_CATALOG path — a path cannot be both filled and stripped.
 */
export interface RetiredPath {
	readonly path:    string;
	readonly prefix?: boolean;
}

export const CONFIG_CATALOG: readonly ConfigOption[] = [
	// ── main config (src/daemon/index.ts first-boot default + Config type) ──
	{ path: 'logLevel',              type: 'enum',   default: 'info',                    desc: "daemon log level: 'error' | 'warn' | 'info' | 'debug'" },
	{ path: 'ollama.host',           type: 'string', default: 'http://localhost:11434',  desc: 'Ollama server URL (daemon-wide)' },
	// NOTE: the legacy top-level model block (models.local / models.embedding /
	// models.embeddingDim / models.tiers.* / models.context.*) was RETIRED — it
	// was write-only (no runtime reader). The two canonical model surfaces are
	// models.providers.local.* (local) and models.analyze.* (cloud/tiering). The
	// retired paths are declared in RETIRED_PATHS below and stripped by the
	// reconcile on boot/update.
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
	// ── per-role model tiering (S001 — models.analyze.tiers/roleTiers/coreFloor/byRepo) ──
	{ path: 'models.analyze.coreFloor',          type: 'enum',   default: 'mid',            desc: "min tier for critical roles: 'core' | 'mid' | 'cheap' (unset ⇒ built-in default)" },
	{ path: 'models.analyze.tiers.core.runner',  type: 'enum',   default: 'cli-claude',     desc: "core-tier backend: 'ollama' | 'cli-claude' | 'cli-codex'" },
	{ path: 'models.analyze.tiers.core.model',   type: 'string', default: '',               desc: 'core-tier model id (empty ⇒ CLI default, e.g. opus)' },
	{ path: 'models.analyze.tiers.mid.runner',   type: 'enum',   default: 'cli-claude',     desc: 'mid-tier backend' },
	{ path: 'models.analyze.tiers.mid.model',    type: 'string', default: 'sonnet',         desc: 'mid-tier model id (e.g. sonnet)' },
	{ path: 'models.analyze.tiers.cheap.runner', type: 'enum',   default: 'ollama',         desc: 'cheap-tier backend (local by default)' },
	{ path: 'models.analyze.tiers.cheap.model',  type: 'string', default: 'qwen3.6:35b-a3b', desc: 'cheap-tier model id (Ollama local by default)' },
	// models.analyze.roleTiers.<roleId> and models.analyze.byRepo.<repoPath>.* are dynamic-key
	// overrides — set them directly in ~/.insrc/config.json (see docs/daemon.md).

	// ── local provider / embedder (src/config/local.ts → models.providers.local.*) ──
	{ path: 'models.providers.local.host',           type: 'string', default: 'http://localhost:11434', desc: 'Ollama host for the embedder/local provider' },
	{ path: 'models.providers.local.embeddingModel', type: 'string', default: 'qwen3-embedding:0.6b',    desc: "embedder model id ('nomic-ai/nomic-embed-text-v1.5' for ONNX) — read by the embedder" },
	{ path: 'models.providers.local.embeddingDim',   type: 'number', default: 1024,                       desc: 'embedder dimensions (768 for ONNX) — read by the embedder' },
	{ path: 'models.providers.local.coreModel',      type: 'string', default: 'qwen3-coder:latest',       desc: 'local core / summariser model id' },
	{ path: 'models.providers.local.charsPerToken',  type: 'number', default: 3,                          desc: 'chars→tokens heuristic (local provider)' },
];

/**
 * Declared-RETIRED model config paths — the legacy top-level model block that
 * was write-only (no runtime reader), superseded by the two canonical surfaces
 * (models.providers.local.* and models.analyze.*). The reconcile strips these
 * from existing configs on boot/update. Exact-path entries remove a scalar
 * leaf; prefix entries remove a whole subtree (models.tiers / models.context
 * held scalar leaves but are declared prefix so a partially-populated block is
 * removed wholesale; models.agents is a dynamic namespace).
 *
 * INVARIANT (enforced by reconcileConfig): disjoint from every CONFIG_CATALOG path.
 */
export const RETIRED_PATHS: readonly RetiredPath[] = [
	{ path: 'models.local' },
	{ path: 'models.embedding' },
	{ path: 'models.embeddingDim' },
	{ path: 'models.tiers',   prefix: true },
	{ path: 'models.context', prefix: true },
	{ path: 'models.agents',  prefix: true },
];
