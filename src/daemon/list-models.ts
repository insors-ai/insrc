/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The sc2 ModelList capability — the read-only daemon list-models dispatch
 * (Epic ba132c185fe45860, S002), drawn since Epic ce99b72065d03b1b s2 from the
 * same models.definitions projection (src/daemon/model-definitions.ts), so the
 * two answers always agree.
 *
 * Given a provider, return its models plus an explicit availability signal: for
 * a CLI family (cli-claude / cli-codex) the models the definitions serve
 * (shipped, then user-approved), available:true, with no Ollama call; for
 * ollama the listed models that are installed, from the existing bounded
 * listing (any failure/timeout/malformed -> available:false + []). An installed
 * model the definitions do not list is not returned. NO direct cloud REST (k1);
 * strictly read-only (ac3).
 *
 * listModels takes injected deps (default: the real bounded ollama lister, the
 * per-thread registry and the definitions file version) so every branch is
 * unit-testable off a live daemon/ollama.
 */

import {
  DEFAULT_MODEL_DEFINITIONS_DEPS,
  projectDefinitions,
  type ModelDefinitionsDeps,
} from './model-definitions.js';

/** The three providers the list capability serves — exactly the reused runner
 *  enum values (k3): the three model families. */
export type ModelProvider = 'ollama' | 'cli-claude' | 'cli-codex';

/** The sc2 request. */
export interface ListModelsParams {
  readonly provider: ModelProvider;
}

/** One returned model (structurally compatible with the ollama LocalModelInfo). */
export interface ModelInfo {
  readonly id:           string;
  readonly displayName?: string;
}

/** The sc2 result: the provider's models + an explicit availability signal.
 *  available:false + models:[] means the source could not be listed right now
 *  (e.g. ollama unreachable) — never a fabricated/cached-as-fresh list. */
export interface ModelListResult {
  readonly provider:  ModelProvider;
  readonly available: boolean;
  readonly models:    readonly ModelInfo[];
}

/** The invalid-params error result (the daemon's standard error envelope, the
 *  same shape the offlineRpc stubs return) — returned for an unknown/missing
 *  provider; mutates nothing. */
export interface ListModelsError {
  readonly error:       string;
  readonly recoverable: boolean;
}

/** Injected dependencies — the models.definitions seams (default: the real
 *  bounded ollama lister, getModelRegistry and the definitions file version). */
export type ListModelsDeps = ModelDefinitionsDeps;

const ALL_PROVIDERS = new Set<ModelProvider>(['ollama', 'cli-claude', 'cli-codex']);

/** Narrow a definitions model entry into a ModelInfo
 *  (exactOptionalPropertyTypes-correct: never set displayName:undefined). */
function toModelInfo(m: { readonly id: string; readonly displayName?: string | undefined }): ModelInfo {
  return typeof m.displayName === 'string' ? { id: m.id, displayName: m.displayName } : { id: m.id };
}

/**
 * Dispatch a list-models request. Validates params.provider; CLI families are
 * served from the definitions projection (available:true), ollama as the listed
 * models the bounded live lister reports installed (available:false + [] on any
 * failure/timeout/malformed). Pure read;
 * never throws for a valid provider. An unknown/missing provider returns the
 * invalid-params error result, mutating nothing.
 */
export async function listModels(
  params: unknown,
  deps: ListModelsDeps = DEFAULT_MODEL_DEFINITIONS_DEPS,
): Promise<ModelListResult | ListModelsError> {
  const provider = extractProvider(params);
  if (provider === undefined) {
    return {
      error: `invalid-params: provider must be one of 'ollama' | 'cli-claude' | 'cli-codex'`,
      recoverable: false,
    };
  }

  // ollama: one bounded live listing. Any failure/timeout/malformed -> available:false
  // + [] (ac2/k7), never a fabricated or cached-as-fresh list. A reachable server
  // with none of the listed models installed returns available:true + [].
  let installed: readonly string[] | undefined;
  if (provider === 'ollama') {
    try {
      installed = (await deps.ollamaList()).map(m => m.id);
    } catch {
      return { provider, available: false, models: [] };
    }
  }

  // Every family is answered from the same projection models.definitions returns
  // (s2/ac2); a CLI family never calls the ollama lister. No cloud REST (ac4).
  const family = projectDefinitions(deps.registry(), deps.catalogVersion(), installed)
    .families.find(f => f.id === provider);
  const served = (family?.models ?? []).filter(m => provider !== 'ollama' || m.installed === true);
  return { provider, available: true, models: served.map(toModelInfo) };
}

/** Extract a valid ModelProvider from raw params, or undefined. */
function extractProvider(params: unknown): ModelProvider | undefined {
  if (typeof params !== 'object' || params === null) return undefined;
  const p = (params as Record<string, unknown>)['provider'];
  return typeof p === 'string' && ALL_PROVIDERS.has(p as ModelProvider) ? (p as ModelProvider) : undefined;
}
