/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The models.definitions request — the sc3 contract (Epic ce99b72065d03b1b,
 * Story s2).
 *
 * One read-only answer clients use to learn the model definitions: every family
 * with its models (shipped, then user-approved), aliases, efforts, limits, tier
 * defaults, summariser, tool-loop model and rejected ids, plus each listed Ollama
 * model's installed state. It is a projection of this thread's ModelRegistry
 * (sc2) and the validated file's version (sc1); providers.listModels is drawn
 * from the same projection so the two always agree (s2/ac2).
 *
 * Installed state comes from one call to the existing bounded Ollama listing.
 * When Ollama does not answer, installed is omitted and the request still
 * succeeds. No cloud call; mutates nothing.
 */

import { loadAnalyzeConfig, type AnalyzeConfig, type TierName } from '../config/analyze.js';
import { loadLocalProviderConfig } from '../config/local.js';
import { OllamaProvider } from '../agent/providers/ollama.js';
import { resolveRole } from '../analyze/context/role-router.js';
import { ollamaContextWindow } from '../analyze/context/shaper-provider.js';
import {
	validateModelCatalog,
	type CliFamilyId,
	type EffortLevel,
	type FamilyHost,
	type FamilyId,
	type InputLimit,
	type ModelHosting,
	type TierDefault,
} from './model-catalog.js';
import { familyForClient, getModelRegistry, type FallbackReason, type ModelRegistry } from './model-registry.js';

/** One model in the answer. */
export interface ModelDefinitionEntry {
	readonly id:           string;
	readonly aliases:      readonly string[];
	readonly displayName?: string | undefined;
	readonly efforts:      readonly EffortLevel[];
	readonly inputLimit?:  InputLimit | undefined;
	/** Ollama models only, when the definitions give it: approximate memory (MB) at base context. */
	readonly memoryMb?:    number | undefined;
	readonly source:       'shipped' | 'user-approved';
	/** Models of an Ollama-hosted family only: where the model runs. */
	readonly hosting?:     ModelHosting | undefined;
	/** Ollama models only; absent when Ollama did not answer. */
	readonly installed?:   boolean | undefined;
}

/** One family in the answer. */
export interface FamilyDefinitionEntry {
	readonly id:               FamilyId;
	readonly cliKind?:         'claude' | 'codex' | 'vibe' | undefined;
	/** Ollama-hosted families only: the CLI runs against Ollama. */
	readonly host?:            FamilyHost | undefined;
	readonly displayName:      string;
	readonly tierDefaults?:    Readonly<Record<TierName, TierDefault>> | undefined;
	readonly summariserModel?: string | undefined;
	readonly toolLoopModel?:   string | undefined;
	readonly rejectedModels?:  readonly string[] | undefined;
	readonly models:           readonly ModelDefinitionEntry[];
}

/** The sc3 answer. */
export interface ModelDefinitionsResult {
	readonly version:       number;
	readonly defaultFamily: CliFamilyId;
	readonly families:      readonly FamilyDefinitionEntry[];
}

/** Injected seams (default: the real bounded Ollama listing, registry and file version). */
export interface ModelDefinitionsDeps {
	/** Ollama's installed models; rejects on unreachable / timeout / malformed. */
	ollamaList(): Promise<readonly { readonly id: string }[]>;
	registry(): ModelRegistry;
	catalogVersion(): number;
}

/** Lazily-constructed real Ollama provider for the default lister; it resolves
 *  the ollama.host config itself and caches it for the process lifetime. */
let _ollamaProvider: OllamaProvider | undefined;
export function defaultOllamaList(): Promise<readonly { readonly id: string }[]> {
	if (_ollamaProvider === undefined) _ollamaProvider = new OllamaProvider();
	return _ollamaProvider.listLocalModels();
}

export const DEFAULT_MODEL_DEFINITIONS_DEPS: ModelDefinitionsDeps = {
	ollamaList:     defaultOllamaList,
	registry:       getModelRegistry,
	catalogVersion: () => validateModelCatalog().version,
};

/**
 * Project the registry into the sc3 answer. `installed` is the list of installed
 * Ollama model names, or undefined when Ollama did not answer (or was not asked):
 * then no Ollama model carries `installed`. Optional fields are omitted rather
 * than set to undefined.
 */
export function projectDefinitions(
	registry:  ModelRegistry,
	version:   number,
	installed: readonly string[] | undefined,
): ModelDefinitionsResult {
	const families = registry.families().map((f): FamilyDefinitionEntry => {
		const cli = f.cliKind !== undefined;
		const models = registry.models(f.id).map((m): ModelDefinitionEntry => ({
			id:      m.id,
			aliases: m.aliases ?? [],
			...(m.displayName !== undefined ? { displayName: m.displayName } : {}),
			efforts: m.efforts,
			...(m.inputLimit !== undefined ? { inputLimit: m.inputLimit } : {}),
			...(m.memoryMb !== undefined ? { memoryMb: m.memoryMb } : {}),
			source:  m.source,
			...(m.hosting !== undefined ? { hosting: m.hosting } : {}),
			...(!cli && installed !== undefined ? { installed: installed.includes(m.id) } : {}),
		}));
		// Only a vendor CLI family (a CLI kind and no host) carries rejected ids.
		// A rejected id the family also serves (a later shipped file lists it) is
		// served as shipped, as the registry resolves it, so it is not "rejected".
		const rejected = cli && f.host === undefined
			? registry.rejected(f.id as CliFamilyId).filter(id => registry.find(f.id, id) === undefined)
			: undefined;
		return {
			id:          f.id,
			...(f.cliKind !== undefined ? { cliKind: f.cliKind } : {}),
			...(f.host !== undefined ? { host: f.host } : {}),
			displayName: f.displayName,
			...(f.tierDefaults !== undefined ? { tierDefaults: f.tierDefaults } : {}),
			...(f.summariserModel !== undefined ? { summariserModel: f.summariserModel } : {}),
			...(f.toolLoopModel !== undefined ? { toolLoopModel: f.toolLoopModel } : {}),
			...(rejected !== undefined ? { rejectedModels: rejected } : {}),
			models,
		};
	});
	return { version, defaultFamily: registry.defaultFamily(), families };
}

/**
 * The models.definitions handler: one bounded Ollama listing, then the
 * projection. A rejecting listing leaves installed off every Ollama model.
 */
export async function modelDefinitions(deps: ModelDefinitionsDeps = DEFAULT_MODEL_DEFINITIONS_DEPS): Promise<ModelDefinitionsResult> {
	let installed: readonly string[] | undefined;
	try {
		installed = (await deps.ollamaList()).map(m => m.id);
	} catch {
		installed = undefined;
	}
	return projectDefinitions(deps.registry(), deps.catalogVersion(), installed);
}

/** One `claude.models` row (the RPC's existing shape). */
export interface ClaudeModelEntry {
	readonly id:          string;
	readonly displayName: string;
	readonly createdAt:   string;
}

/**
 * The `claude.models` answer: the served models of the family the claude CLI
 * runs (listed, then user-approved), from the model definitions — no cloud REST
 * call (DEF k1). Empty when no family runs the claude CLI.
 */
export function claudeModels(registry: ModelRegistry = getModelRegistry()): ClaudeModelEntry[] {
	// The same family a claude client is mapped to.
	const family = familyForClient('claude', registry);
	if (family === undefined) return [];
	return registry.models(family).map(m => ({ id: m.id, displayName: m.displayName ?? m.id, createdAt: '' }));
}

/** The `models.resolveRole` answer (HLD sc5): the tier, model, effort and
 *  provider settings the daemon uses for a role in a repo. */
export interface ResolvedRole {
	readonly tier:        TierName;
	readonly family:      FamilyId;
	readonly model:       string;
	readonly effort?:     EffortLevel | undefined;
	readonly inputLimit?: InputLimit | undefined;
	readonly fallback?:   { readonly reason: FallbackReason; readonly requested: string } | undefined;
	readonly cli?:        { readonly kind: 'claude' | 'codex' | 'vibe' } | undefined;
	readonly ollama?:     { readonly host: string; readonly numCtx: number; readonly numPredict: number } | undefined;
}

export interface ResolveRoleDeps {
	readonly config:   () => AnalyzeConfig;
	readonly registry: () => ModelRegistry;
}

const DEFAULT_RESOLVE_ROLE_DEPS: ResolveRoleDeps = { config: () => loadAnalyzeConfig(), registry: getModelRegistry };

/**
 * Resolve a role for a repo as the daemon's router does and project it to the
 * sc5 wire shape, with the provider settings the provider factory would use.
 * Read-only: builds no provider and runs no model.
 */
export function resolveRoleWire(params: unknown, deps: ResolveRoleDeps = DEFAULT_RESOLVE_ROLE_DEPS): ResolvedRole | { error: string; recoverable: false } {
	const p = (typeof params === 'object' && params !== null ? params : {}) as Record<string, unknown>;
	const role = p['role'];
	const repoPath = p['repoPath'];
	if (typeof role !== 'string' || role === '' || typeof repoPath !== 'string' || repoPath === '') {
		return { error: 'invalid-params: role and repoPath (non-empty strings) are required', recoverable: false };
	}
	const cfg = deps.config();
	const registry = deps.registry();
	const r = resolveRole(role, cfg, repoPath, { registry });
	const model = registry.find(r.runner, r.model);
	const kind = registry.cliKind(r.runner);
	return {
		tier:   r.tier,
		family: r.runner,
		model:  r.model,
		...(r.effort !== undefined ? { effort: r.effort } : {}),
		...(model?.inputLimit !== undefined ? { inputLimit: model.inputLimit } : {}),
		...(r.fallback !== undefined ? { fallback: r.fallback } : {}),
		...(kind !== undefined
			? { cli: { kind } }
			: { ollama: { host: loadLocalProviderConfig().host, numCtx: ollamaContextWindow(registry, model), numPredict: cfg.shaper.ollamaNumPredict } }),
	};
}
