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
 * The model config is a single flat `models.*` surface (the older
 * `models.analyze.*` / `models.providers.local` nesting + the even-older
 * top-level model block were retired — see RETIRED_PATHS + CONFIG_MIGRATIONS).
 * SOURCE OF TRUTH — keep in sync with:
 *   - src/config/analyze.ts → models.tiers / models.tasks / models.coreFloor /
 *     models.byRepo / models.shaper / models.maxPlanDepth  (the reasoning surface;
 *     `tiers` is the ONLY place a model is named — shaper/summariser derive from it)
 *   - src/config/local.ts   → models.local.*  (the LIVE local/embedder surface:
 *     host / coreModel / embeddingModel / embeddingDim / charsPerToken)
 * plus the daemon-wide non-model keys (logLevel, ollama.host, permissions,
 * routing, analyzer, classifier, memory). The boot reconcile
 * (src/daemon/index.ts step 2b) migrates legacy nesting, fills every catalog
 * default, then prunes retired paths.
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

/**
 * A one-time config RELOCATION — a value that lived under an old dot-path and
 * now lives under a new one. The reconcile MOVES `from` → `to` (before fill +
 * prune) iff `from` is present AND `to` is absent, applying `transform` to the
 * moved value if given. After the move the old parent is swept by a retired
 * prefix (e.g. `models.analyze`). Idempotent: once moved, `from` is gone so the
 * migration is a no-op on every subsequent boot.
 *
 * INVARIANT: every `to` MUST be a live CONFIG_CATALOG path (or under a live
 * dynamic namespace); every `from` MUST be swept by a RetiredPath so no residue
 * lingers. Migrations run before prune, so a `from` under a retired prefix is
 * relocated first, then its emptied parent stripped.
 */
export interface ConfigMigration {
	readonly from:       string;
	readonly to:         string;
	readonly transform?: (value: unknown) => unknown;
}

export const CONFIG_CATALOG: readonly ConfigOption[] = [
	// ── main config (src/daemon/index.ts first-boot default + Config type) ──
	{ path: 'logLevel',              type: 'enum',   default: 'info',                    desc: "daemon log level: 'error' | 'warn' | 'info' | 'debug'" },
	{ path: 'ollama.host',           type: 'string', default: 'http://localhost:11434',  desc: 'Ollama server URL (daemon-wide)' },
	// NOTE: the model config is a single flat models.* surface. The former
	// models.analyze.* / models.providers.local nesting is MIGRATED to models.*
	// (see CONFIG_MIGRATIONS) and its residue (incl. the derived shaperProvider/
	// shaperModel/summariser* keys) is stripped via RETIRED_PATHS on boot/update.
	{ path: 'permissions.mode',      type: 'enum',    default: 'validate',      desc: "tool permission mode: 'validate' | 'auto-accept'" },
	{ path: 'routing.mode',          type: 'string',  default: 'static',        desc: 'agent routing mode' },
	{ path: 'analyzer.useLocal',     type: 'boolean', default: false,           desc: 'force code/data analyzers to local Ollama instead of cloud' },
	{ path: 'classifier.confirmIntent', type: 'boolean', default: false,        desc: 'prompt to confirm the classified intent each turn' },
	{ path: 'memory.implicitCapture.enabled', type: 'boolean', default: false,  desc: 'implicit memory capture during retrieval (backstop)' },
	{ path: 'codeReview.enforce',    type: 'boolean', default: false,           desc: 'enforce a blocking code-review verdict at Story completion (off ⇒ advisory)' },
	{ path: 'codeReview.freshnessTimeoutMs', type: 'number', default: 120000,   desc: 'max ms the code-review freshness gate block-and-polls for a fresh index before re-prompting' },

	// ── model tiers — THE single model-spec surface (src/config/analyze.ts → models.tiers) ──
	// A (runner, model) pair is named ONLY here. The shaper + summariser providers
	// are DERIVED, never stored: shaper ⟸ tiers.core, summariser ⟸ tiers.cheap.
	{ path: 'models.tiers.core.runner',  type: 'enum',   default: 'cli-claude',     desc: "core-tier backend: 'ollama' | 'cli-claude' | 'cli-codex'" },
	{ path: 'models.tiers.core.model',   type: 'string', default: '',               desc: 'core-tier model id (empty ⇒ CLI default, e.g. opus)' },
	{ path: 'models.tiers.mid.runner',   type: 'enum',   default: 'cli-claude',     desc: 'mid-tier backend' },
	{ path: 'models.tiers.mid.model',    type: 'string', default: 'sonnet',         desc: 'mid-tier model id (e.g. sonnet)' },
	{ path: 'models.tiers.cheap.runner', type: 'enum',   default: 'ollama',         desc: 'cheap-tier backend (local by default)' },
	{ path: 'models.tiers.cheap.model',  type: 'string', default: 'qwen3.6:27b', desc: 'cheap-tier model id (Ollama local by default)' },
	{ path: 'models.coreFloor',          type: 'enum',   default: 'mid',            desc: "min tier for critical tasks: 'core' | 'mid' | 'cheap'" },
	// models.tasks.<roleId> and models.byRepo.<repoPath>.{tiers,tasks,coreFloor} are dynamic-key
	// overrides — set them directly in ~/.insrc/config.json (see docs/daemon.md).

	// ── shaper runtime knobs (NOT model specs) — models.shaper.* ──
	{ path: 'models.shaper.maxToolTurns',            type: 'number', default: 40,    desc: 'max tool-loop turns for the shaper' },
	{ path: 'models.shaper.structuredOutputRetries', type: 'number', default: 3,     desc: 'structured-output retry count' },
	{ path: 'models.shaper.ollamaNumCtx',            type: 'number', default: 32768,  desc: 'shaper Ollama context window' },
	{ path: 'models.shaper.ollamaNumPredict',        type: 'number', default: 20480,  desc: 'shaper Ollama max output tokens' },
	{ path: 'models.maxPlanDepth.XS', type: 'number', default: 2, desc: 'max plan-tree depth — XS-scope roots' },
	{ path: 'models.maxPlanDepth.S',  type: 'number', default: 3, desc: 'max plan-tree depth — S-scope roots' },
	{ path: 'models.maxPlanDepth.M',  type: 'number', default: 4, desc: 'max plan-tree depth — M-scope roots' },
	{ path: 'models.maxPlanDepth.L',  type: 'number', default: 5, desc: 'max plan-tree depth — L-scope roots' },
	{ path: 'models.maxPlanDepth.XL', type: 'number', default: 6, desc: 'max plan-tree depth — XL-scope roots' },

	// ── local provider / embedder (src/config/local.ts → models.local.*) ──
	{ path: 'models.local.host',           type: 'string', default: 'http://localhost:11434', desc: 'Ollama host for the embedder/local provider' },
	{ path: 'models.local.embeddingModel', type: 'string', default: 'qwen3-embedding:0.6b',    desc: "embedder model id ('nomic-ai/nomic-embed-text-v1.5' for ONNX) — read by the embedder" },
	{ path: 'models.local.embeddingDim',   type: 'number', default: 1024,                       desc: 'embedder dimensions (768 for ONNX) — read by the embedder' },
	{ path: 'models.local.coreModel',      type: 'string', default: 'qwen3.6:27b',              desc: 'local core / summariser model id used by the indexer embedder' },
	{ path: 'models.local.charsPerToken',  type: 'number', default: 3,                          desc: 'chars→tokens heuristic (local provider)' },
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
	// Oldest legacy top-level block (write-only, no runtime reader). `models.local`
	// and `models.tiers` are NO LONGER retired — they are the flattened LIVE
	// surface now (models.local.* embedder, models.tiers.* reasoning tiers).
	{ path: 'models.embedding' },
	{ path: 'models.embeddingDim' },
	{ path: 'models.context', prefix: true },
	{ path: 'models.agents',  prefix: true },
	// The intermediate nesting (models.analyze.* / models.providers.*) is MIGRATED
	// to the flat models.* surface (see CONFIG_MIGRATIONS); these prefixes sweep
	// whatever residue is left — including the now-DERIVED shaperProvider /
	// shaperModel / summariserProvider / summariserModel keys, which are never
	// migrated (they resolve from the tiers) and so are stripped here.
	{ path: 'models.analyze',   prefix: true },
	{ path: 'models.providers', prefix: true },
];

/**
 * One-time relocations from the old nested model config to the flat models.*
 * surface. Run by the reconcile before fill + prune (see reconcile.ts). The
 * derived surfaces (shaperProvider/shaperModel ⟸ tiers.core, summariser* ⟸
 * tiers.cheap) are deliberately NOT migrated — they are swept by the
 * `models.analyze` retired prefix. `models.analyze.byRepo` carries a per-entry
 * transform (roleTiers → tasks, legacy shaperProvider/shaperModel → tiers.core).
 */
export const CONFIG_MIGRATIONS: readonly ConfigMigration[] = [
	{ from: 'models.analyze.tiers',        to: 'models.tiers' },
	{ from: 'models.analyze.roleTiers',    to: 'models.tasks' },
	{ from: 'models.analyze.coreFloor',    to: 'models.coreFloor' },
	{ from: 'models.analyze.byRepo',       to: 'models.byRepo', transform: migrateByRepo },
	{ from: 'models.analyze.shaper',       to: 'models.shaper' },
	{ from: 'models.analyze.maxPlanDepth', to: 'models.maxPlanDepth' },
	{ from: 'models.providers.local',      to: 'models.local' },
];

/** Migrate each per-repo byRepo entry to the flat shape: rename `roleTiers` →
 *  `tasks`, and fold a legacy per-repo `shaperProvider`/`shaperModel` pin into
 *  `tiers.core.{runner,model}` (the flattened equivalent). Pure: rebuilds the
 *  object, never mutates the input. A non-object value (or entry) passes
 *  through unchanged. An explicit `tiers.core` already present is not
 *  overwritten. */
function migrateByRepo(value: unknown): unknown {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
	const out: Record<string, unknown> = {};
	for (const [repo, entry] of Object.entries(value as Record<string, unknown>)) {
		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			out[repo] = entry;
			continue;
		}
		const { roleTiers, shaperProvider, shaperModel, tiers, ...rest } =
			entry as Record<string, unknown>;
		const next: Record<string, unknown> = { ...rest };
		if (roleTiers !== undefined) next['tasks'] = roleTiers;

		// Fold a legacy per-repo shaper pin into tiers.core (unless one is set).
		const tierObj = (typeof tiers === 'object' && tiers !== null && !Array.isArray(tiers))
			? { ...(tiers as Record<string, unknown>) } : undefined;
		const hasCore = tierObj !== undefined && typeof tierObj['core'] === 'object' && tierObj['core'] !== null;
		if (!hasCore && (typeof shaperProvider === 'string' || typeof shaperModel === 'string')) {
			const core: Record<string, unknown> = {};
			if (typeof shaperProvider === 'string') core['runner'] = shaperProvider;
			if (typeof shaperModel === 'string')    core['model']  = shaperModel;
			next['tiers'] = { ...(tierObj ?? {}), core };
		} else if (tierObj !== undefined) {
			next['tiers'] = tierObj;
		}
		out[repo] = next;
	}
	return out;
}
