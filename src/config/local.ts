/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Infra-only local-provider config loader.
 *
 * This is the foothold the indexer + db/lance layers depend on. The full
 * AgentConfig schema (agent step bindings, classifier config, multi-cloud
 * provider records, vision defaults) lives in `agent/config.ts` and is
 * scheduled for deletion. The fields exposed here are the load-bearing
 * subset every infra subsystem needs at boot:
 *
 *   - Ollama host (for query + document embeddings)
 *   - Local embedding model id
 *   - Embedding vector dimensionality (pins the Lance table schema)
 *   - Local core model id (only the indexer.embedder uses it)
 *   - Chars-per-token approximation (chunkers + budget calcs)
 *
 * Read from `~/.insrc/config.json` if present, else fall back to defaults.
 * Cached in-process for the daemon's lifetime; the cache is reset only
 * via `_resetLocalProviderConfigCacheForTests()`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('config:local');


export interface LocalProviderInfraConfig {
	readonly host:           string;
	readonly embeddingModel: string;
	readonly embeddingDim:   number;
	readonly coreModel:      string;
	readonly charsPerToken:  number;
}


// Defaults mirror what the old `agent/config.ts` ships as DEFAULT_LOCAL_*.
// qwen3-embedding:0.6b is the v1 default for the LMDB+Lance substrate;
// users can override via the Model Providers pane (Local tab).
const DEFAULTS: LocalProviderInfraConfig = {
	host:           'http://localhost:11434',
	embeddingModel: 'qwen3-embedding:0.6b',
	embeddingDim:   1024,
	coreModel:      'qwen3-coder:latest',
	charsPerToken:  3,
};


let cached: LocalProviderInfraConfig | undefined;


export function loadLocalProviderConfig(): LocalProviderInfraConfig {
	if (cached !== undefined) {
		return cached;
	}
	if (!existsSync(PATHS.config)) {
		cached = DEFAULTS;
		return cached;
	}
	try {
		const raw = JSON.parse(readFileSync(PATHS.config, 'utf8')) as Record<string, unknown>;
		const models = isObject(raw['models']) ? raw['models'] as Record<string, unknown> : {};
		const providers = isObject(models['providers']) ? models['providers'] as Record<string, unknown> : {};
		const local = isObject(providers['local']) ? providers['local'] as Record<string, unknown> : {};
		cached = {
			host:           typeof local['host']           === 'string' ? local['host']           as string : DEFAULTS.host,
			embeddingModel: typeof local['embeddingModel'] === 'string' ? local['embeddingModel'] as string : DEFAULTS.embeddingModel,
			embeddingDim:   typeof local['embeddingDim']   === 'number' ? local['embeddingDim']   as number : DEFAULTS.embeddingDim,
			coreModel:      typeof local['coreModel']      === 'string' ? local['coreModel']      as string : DEFAULTS.coreModel,
			charsPerToken:  typeof local['charsPerToken']  === 'number' ? local['charsPerToken']  as number : DEFAULTS.charsPerToken,
		};
		return cached;
	} catch (err) {
		log.warn({ err: (err as Error).message }, 'failed to parse config.json; using defaults');
		cached = DEFAULTS;
		return cached;
	}
}


function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === 'object' && x !== null && !Array.isArray(x);
}


export function _resetLocalProviderConfigCacheForTests(): void {
	cached = undefined;
}
