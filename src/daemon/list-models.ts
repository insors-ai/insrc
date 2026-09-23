/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The sc2 ModelList capability — the read-only daemon list-models dispatch
 * (Epic ba132c185fe45860, S002).
 *
 * Given a provider, return its available models plus an explicit availability
 * signal: for ollama a live local /api/tags query through the existing
 * OllamaProvider (bounded; any failure/timeout/malformed -> available:false +
 * []), for cli-claude/cli-codex the curated in-repo catalog (S001's sc1
 * getCuratedCatalog, available:true). NO direct cloud REST (k1) — the cloud
 * branch constructs no HTTP/provider client and does NOT reuse the daemon's
 * Anthropic-SDK claude.models path. Strictly read-only: validating a provider,
 * listing ollama, and reading the catalog mutate nothing (ac3).
 *
 * The daemon handler map revives 'providers.listModels' (previously offline-
 * stubbed) by delegating to listModels(params). listModels takes injected deps
 * (default: the real bounded ollama lister + getCuratedCatalog) so every branch
 * is unit-testable with a fake lister + stub catalog, no live daemon/ollama.
 */

import { getCuratedCatalog, type CuratedCatalog } from './model-catalog.js';
import { OllamaProvider } from '../agent/providers/ollama.js';

/** The three providers the list capability serves — exactly the reused runner
 *  enum values (k3; the superset of S001's cloud-only CloudProvider + ollama). */
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

/** Injected dependencies (default to the real bounded ollama lister +
 *  getCuratedCatalog) so listModels is unit-testable off a live daemon/ollama. */
export interface ListModelsDeps {
  /** List ollama's installed models; rejects on unreachable/timeout/malformed. */
  ollamaList(): Promise<readonly ModelInfo[]>;
  /** The sc1 curated-catalog accessor (S001). */
  catalog(): CuratedCatalog;
}

const ALL_PROVIDERS = new Set<ModelProvider>(['ollama', 'cli-claude', 'cli-codex']);

/** Lazily-constructed real ollama provider for the default lister (one vetted
 *  ollama-talking path; the provider resolves the ollama.host config itself).
 *  Constructed on first use (not at module load); the resolved host is cached for
 *  the process lifetime, so an ollama.host config change is picked up on the next
 *  daemon restart — acceptable for a read-only on-demand picker query. */
let _ollamaProvider: OllamaProvider | undefined;
function defaultOllamaList(): Promise<readonly ModelInfo[]> {
  if (_ollamaProvider === undefined) _ollamaProvider = new OllamaProvider();
  return _ollamaProvider.listLocalModels();
}

const DEFAULT_DEPS: ListModelsDeps = {
  ollamaList: defaultOllamaList,
  catalog:    getCuratedCatalog,
};

/** Narrow a CatalogModel/LocalModelInfo-shaped value into a frozen ModelInfo
 *  (exactOptionalPropertyTypes-correct: never set displayName:undefined). */
function toModelInfo(m: { readonly id: string; readonly displayName?: string }): ModelInfo {
  return typeof m.displayName === 'string' ? { id: m.id, displayName: m.displayName } : { id: m.id };
}

/**
 * Dispatch a list-models request. Validates params.provider; cloud providers are
 * served from the curated catalog (available:true), ollama from the bounded live
 * lister (available:false + [] on any failure/timeout/malformed). Pure read;
 * never throws for a valid provider. An unknown/missing provider returns the
 * invalid-params error result, mutating nothing.
 */
export async function listModels(
  params: unknown,
  deps: ListModelsDeps = DEFAULT_DEPS,
): Promise<ModelListResult | ListModelsError> {
  const provider = extractProvider(params);
  if (provider === undefined) {
    return {
      error: `invalid-params: provider must be one of 'ollama' | 'cli-claude' | 'cli-codex'`,
      recoverable: false,
    };
  }

  if (provider === 'ollama') {
    // ollama: a live local query. Any failure/timeout/malformed -> available:false
    // + [] (ac2/k7), never a fabricated or cached-as-fresh list. A reachable server
    // with zero installed models returns available:true + [].
    try {
      const models = (await deps.ollamaList()).map(toModelInfo);
      return { provider, available: true, models };
    } catch {
      return { provider, available: false, models: [] };
    }
  }

  // Cloud (cli-claude | cli-codex): curated catalog only — `provider` is narrowed
  // to CloudProvider here, so no cast is needed. The catalog is boot-validated, so
  // the source is always available; models may be an empty array. No cloud REST (ac4).
  const models = deps.catalog().modelsFor(provider).map(toModelInfo);
  return { provider, available: true, models };
}

/** Extract a valid ModelProvider from raw params, or undefined. */
function extractProvider(params: unknown): ModelProvider | undefined {
  if (typeof params !== 'object' || params === null) return undefined;
  const p = (params as Record<string, unknown>)['provider'];
  return typeof p === 'string' && ALL_PROVIDERS.has(p as ModelProvider) ? (p as ModelProvider) : undefined;
}
