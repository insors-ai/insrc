/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc2 (E20260806914cbf5e:S002) — the Target-resolution engine.
 *
 *  - `resolveAgainst(map, protocol, rawExpression)` is the PURE core: it
 *    evaluates an outbound-target expression against a pre-built ConfigSourceMap
 *    and returns a `ResolvedTarget`. No graph / fs dependency — deterministic,
 *    unit-testable with in-memory maps.
 *  - `resolve(repo, protocol, rawExpression)` is the thin daemon-side adapter:
 *    it builds (and memoizes per repo) the repo's ConfigSourceMap from at-rest
 *    config sources, then delegates to the pure core. Consumers (s3/s4/s5)
 *    import only `resolve` + the shared `ResolvedTarget` type.
 *
 * NOTE: the sc2 interfaceSketch shows a synchronous `resolve`; because building
 * the map fetches config entities from the graph (async in this codebase) and
 * reads files at rest, the adapter is realized as `async` returning
 * `Promise<ResolvedTarget>`. The return CONTRACT (ResolvedTarget) is unchanged;
 * the pure core stays synchronous. This is an S002-internal realization.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import type { ExternalProtocol, ResolvedTarget } from '../../shared/types.js';
import type { DbClient } from '../../db/client.js';
import type { ConfigSourceMap } from './types.js';
import {
	buildConfigSourceMap,
	parserForFile,
	MAX_SOURCE_SIZE,
	type ConfigFileText,
} from './config-sources.js';

const log = getLogger('sc2-resolver');

/** Bounded interpolation depth — guards against non-terminating / cyclic chains. */
const MAX_INTERP_DEPTH = 16;

// ---------------------------------------------------------------------------
// Pure resolution core (t3)
// ---------------------------------------------------------------------------

/**
 * Expand `${KEY}` / `$KEY` references in `s` against `map`, recursively. Returns
 * the fully-expanded literal, or `null` when any referenced key is missing, the
 * chain is cyclic, or the depth bound is exceeded (a fresh regex per call keeps
 * the recursion state-safe). A string with no references expands to itself.
 */
function expand(s: string, map: ConfigSourceMap, depth: number, seen: ReadonlySet<string>): string | null {
	if (depth > MAX_INTERP_DEPTH) return null;
	const re = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
	let unresolved = false;
	const out = s.replace(re, (_m, k1: string | undefined, k2: string | undefined) => {
		const key = k1 ?? k2 ?? '';
		if (seen.has(key)) { unresolved = true; return ''; }        // cycle
		const entry = map.get(key);
		if (entry === undefined) { unresolved = true; return ''; }  // missing key
		const nested = expand(entry.value, map, depth + 1, new Set(seen).add(key));
		if (nested === null) { unresolved = true; return ''; }
		return nested;
	});
	return unresolved ? null : out;
}

/**
 * The PURE sc2 resolution core. A literal (no `${…}`) resolves directly; an
 * interpolation is expanded against `map`. Every referenced key pinning to a
 * concrete value yields `{resolved:true, protocol, identity}`; a missing key, a
 * partial pin, or a non-terminating chain yields `{resolved:false, rawExpression}`
 * (never dropped, k5). Deterministic over its arguments.
 */
export function resolveAgainst(map: ConfigSourceMap, protocol: ExternalProtocol, rawExpression: string): ResolvedTarget {
	const identity = expand(rawExpression, map, 0, new Set());
	if (identity === null) return { resolved: false, rawExpression };
	return { resolved: true, protocol, identity };
}

// ---------------------------------------------------------------------------
// Daemon-side adapter (t4)
// ---------------------------------------------------------------------------

/** Repo-root `.env*` basenames scanned at rest (these are NOT indexed — they are
 *  dropped by `.gitignore` + the indexer IGNORE_SET, so sc2 reads them directly). */
function isEnvFileName(name: string): boolean {
	return name === '.env' || name.startsWith('.env.');
}

/** Read a file's full text at rest, guarding size; returns null on any fs error
 *  or an oversized file. NEVER executes the file. */
function readAtRest(path: string): string | null {
	try {
		if (!existsSync(path)) return null;
		const st = statSync(path);
		if (!st.isFile() || st.size > MAX_SOURCE_SIZE) return null;
		return readFileSync(path, 'utf8');
	} catch (err) {
		log.debug({ path, err: err instanceof Error ? err.message : String(err) }, 'config source unreadable at rest, skipped');
		return null;
	}
}

/**
 * Discover a repo's at-rest config sources and read their full text by PATH:
 *  1. config entities (kind==='config') via listEntitiesForRepo — their `.file`
 *     paths (Dockerfile, compose, k8s manifests, in-repo config). Read by path
 *     (NOT `entity.body`, which is truncated to 8KB).
 *  2. repo-root `.env*` files scanned directly (they are never indexed).
 * Only files a parser recognizes are read. Deduped by path.
 */
async function readRepoConfigSources(repo: string): Promise<ConfigFileText[]> {
	const seen = new Set<string>();
	const files: ConfigFileText[] = [];

	const add = (path: string): void => {
		if (seen.has(path) || parserForFile(path) === null) return;
		const text = readAtRest(path);
		if (text === null) return;
		seen.add(path);
		files.push({ path, text });
	};

	// (1) indexed config entities → their file paths.
	try {
		const { listEntitiesForRepo } = await import('../../db/entities.js');
		// listEntitiesForRepo resolves the store internally; its `_db` param is unused.
		const entities = await listEntitiesForRepo(undefined as unknown as DbClient, repo);
		for (const e of entities) {
			if (e.kind === 'config' && e.file !== '') add(e.file);
		}
	} catch (err) {
		log.debug({ repo, err: err instanceof Error ? err.message : String(err) }, 'config-entity discovery failed; continuing with .env scan');
	}

	// (2) repo-root .env* files (not indexed).
	try {
		for (const name of readdirSync(repo)) {
			if (isEnvFileName(name)) add(join(repo, name));
		}
	} catch {
		// repo root unreadable — nothing to add.
	}

	return files;
}

/** Per-repo memoized ConfigSourceMap build (caches the promise so N call-sites
 *  share one build per repo/index pass). */
const repoMapCache = new Map<string, Promise<ConfigSourceMap>>();

async function repoConfigMap(repo: string): Promise<ConfigSourceMap> {
	let pending = repoMapCache.get(repo);
	if (pending === undefined) {
		pending = readRepoConfigSources(repo).then(buildConfigSourceMap);
		repoMapCache.set(repo, pending);
	}
	return pending;
}

/** Clear the memoized config map for a repo (call on re-index so a rebuilt
 *  config set is picked up). Clears all repos when `repo` is omitted. */
export function invalidateRepoConfig(repo?: string): void {
	if (repo === undefined) repoMapCache.clear();
	else repoMapCache.delete(repo);
}

/**
 * The sc2 adapter: resolve an outbound-target expression for `repo` against its
 * at-rest config sources. Builds (memoized) the repo's ConfigSourceMap, then
 * delegates to the pure {@link resolveAgainst}. Static + at-rest only — no
 * config source is executed and no runtime/live value participates (k6).
 */
export async function resolve(repo: string, protocol: ExternalProtocol, rawExpression: string): Promise<ResolvedTarget> {
	const map = await repoConfigMap(repo);
	return resolveAgainst(map, protocol, rawExpression);
}
