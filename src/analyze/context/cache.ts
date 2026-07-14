/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Run-level + task-level bundle cache.
 *
 * Two tiers (per design/analyze-context-builder.md "Caching"):
 *
 *   ~/.insrc/analyze/<runId>/context/classification.json
 *   ~/.insrc/analyze/<runId>/context/run-bundle.json
 *   ~/.insrc/analyze/<runId>/context/<taskId>.bundle.json
 *
 * The per-layer cross-run content cache from earlier drafts is dropped
 * along with the summarize-down LLM step; without LLM-driven layer
 * compression there is no expensive per-layer compute to amortise.
 *
 * Cache key = sha256(promptContentHash + schemaVersion + invocationInputsHash)
 *   computed by the driver and passed in. The key is persisted alongside
 *   the bundle so a stale file with mismatched key is detectable on read.
 *
 * Invalidation (per the design doc):
 *   - Prompt content edit                            -> key delta
 *   - Bundle schema version bump                     -> key delta
 *   - Invocation inputs change                       -> key delta
 *   - Indexer's lastIndexedAt > cached bundle.meta.repoLastIndexedAt
 *                                                    -> stale, discard
 *
 * There is no `--no-cache` flag; `ShapeOpts.bypassCache` exists for
 * tests only. To force a clean rebuild in production, the operator
 * nukes ~/.insrc/analyze/<runId>/context/ or the entire <runId> root.
 *
 * See: design/analyze-context-builder.md "Caching"
 *      plans/analyze-context-builder.md Phase 4
 */

import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';

import type {
	AnalyzeContextBundle,
	ShaperMode,
	ShapeOpts,
} from './types.js';

const log = getLogger('analyze:context:cache');

/** Identifies a cached bundle slot inside a run-id's context dir. */
export interface CacheKey {
	readonly mode:    ShaperMode;
	/** Required for `mode='task'`; ignored otherwise. */
	readonly taskId?: string;
	/** sha256 hex of (promptContentHash + schemaVersion + inputsHash). */
	readonly hash:    string;
}

interface CacheFileBody {
	readonly key:    string;
	readonly bundle: AnalyzeContextBundle;
}

/**
 * Returns the on-disk path for a given runId + cache key. Pure function;
 * does not create directories or read the file. Exported so the driver
 * + invalidator can compute the path without touching disk.
 */
export function cacheFilePathFor(runId: string, key: CacheKey): string {
	const dir = PATHS.analyzeContext(runId);
	switch (key.mode) {
		case 'classification': return join(dir, 'classification.json');
		case 'run':            return join(dir, 'run-bundle.json');
		case 'task': {
			if (key.taskId === undefined || key.taskId.length === 0) {
				throw new TypeError("cacheFilePathFor: taskId is required when mode='task'");
			}
			return join(dir, `${key.taskId}.bundle.json`);
		}
	}
}

/**
 * Read the cached bundle for a (runId, key) slot, or null if there's
 * no hit. Cache hit is conditional on:
 *
 *   1. File exists at the computed path.
 *   2. File is valid JSON with `{ key, bundle }` shape.
 *   3. Stored `key` exactly equals the supplied `key.hash` (defends
 *      against partial writes / shape changes / hand-edited files).
 *   4. (When `currentLastIndexedAt` is provided) the cached bundle's
 *      `meta.repoLastIndexedAt` is >= the registry's current value.
 *      The driver looks up the registry value before calling read;
 *      the cache layer treats it as opaque "freshness watermark."
 *
 * `ShapeOpts.bypassCache: true` short-circuits the read (returns null
 * without touching disk). Used by tests to force a rebuild.
 *
 * Any of the invalidation paths (key mismatch / shape mismatch /
 * stale-by-indexer) discard the slot from disk so the next miss-write
 * lands cleanly. This is intentional: a stale slot is worse than no
 * slot -- it costs a read every time + a cache miss.
 */
export function readBundle(
	runId: string,
	key:   CacheKey,
	opts:  ShapeOpts,
	currentLastIndexedAt?: number,
): AnalyzeContextBundle | null {
	if (opts.bypassCache === true) {
		return null;
	}

	const path = cacheFilePathFor(runId, key);

	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return null;
		}
		log.warn({ path, err: (err as Error).message }, 'cache read failed; treating as miss');
		return null;
	}

	let parsed: CacheFileBody;
	try {
		parsed = JSON.parse(raw) as CacheFileBody;
	} catch (err) {
		log.warn({ path, err: (err as Error).message }, 'cache file is not valid JSON; discarding');
		safeUnlink(path);
		return null;
	}

	if (typeof parsed?.key !== 'string' || parsed.bundle === undefined) {
		log.warn({ path }, 'cache file has unexpected shape; discarding');
		safeUnlink(path);
		return null;
	}

	if (parsed.key !== key.hash) {
		// Mismatched key -- the slot belongs to a stale invocation. Discard
		// so the next miss-write can land cleanly.
		log.debug({ path, expected: key.hash, found: parsed.key }, 'cache key mismatch; discarding');
		safeUnlink(path);
		return null;
	}

	// Indexer-timestamp freshness check. If the registry reports a
	// newer lastIndexedAt than the bundle's recorded value, the bundle
	// reflects an older view of the indexed graph and must be rebuilt.
	if (currentLastIndexedAt !== undefined && isStaleByIndexer(parsed.bundle, currentLastIndexedAt)) {
		log.debug(
			{
				path,
				cached:   parsed.bundle.meta?.repoLastIndexedAt,
				registry: currentLastIndexedAt,
			},
			'cached bundle stale (registry lastIndexedAt advanced); discarding',
		);
		safeUnlink(path);
		return null;
	}

	return parsed.bundle;
}

/**
 * Pure function: is `bundle` stale relative to a registry-reported
 * lastIndexedAt timestamp? A bundle is stale when the registry's
 * lastIndexedAt strictly exceeds the bundle's recorded value. Equal
 * timestamps are NOT stale (rebuilds during the same indexing cycle
 * remain valid).
 *
 * A bundle without `meta.repoLastIndexedAt` is treated as stale -- it
 * was written by an older code path that didn't stamp the watermark,
 * so we cannot prove it is current. This is the conservative choice;
 * the live tests in the framework's outer loop will rebuild instead
 * of trusting an unstamped bundle.
 *
 * Exposed so the driver + tests can pin the invariant without
 * touching disk.
 */
export function isStaleByIndexer(
	bundle: AnalyzeContextBundle,
	currentLastIndexedAt: number,
): boolean {
	const cached = bundle.meta?.repoLastIndexedAt;
	if (cached === undefined) {
		return true;
	}
	return currentLastIndexedAt > cached;
}

/**
 * Atomically write `bundle` to the cache slot for (runId, key). Creates
 * the per-run context directory if missing. The write is atomic-via-
 * tempfile-rename so a concurrent reader never sees a half-written
 * file.
 */
export function writeBundle(
	runId:  string,
	key:    CacheKey,
	bundle: AnalyzeContextBundle,
): void {
	const path = cacheFilePathFor(runId, key);
	mkdirSync(dirname(path), { recursive: true });

	const body: CacheFileBody = { key: key.hash, bundle };
	const json = JSON.stringify(body, null, '\t');

	const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
	writeFileSync(tmpPath, json, 'utf8');
	// fs.renameSync is atomic across same-filesystem paths on POSIX; we
	// rely on the cache dir + tmp file living in the same FS (both under
	// ~/.insrc/analyze/<runId>/context).
	renameSync(tmpPath, path);
}

/**
 * Invalidate (delete) a specific cache slot. Used by the driver's
 * indexer-timestamp check when a cached bundle's `meta.repoLastIndexedAt`
 * is stale. Silent no-op when the slot doesn't exist.
 */
export function invalidateBundle(runId: string, key: CacheKey): void {
	safeUnlink(cacheFilePathFor(runId, key));
}

function safeUnlink(path: string): void {
	try {
		unlinkSync(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			log.debug({ path, err: (err as Error).message }, 'safeUnlink: non-ENOENT error');
		}
	}
}
