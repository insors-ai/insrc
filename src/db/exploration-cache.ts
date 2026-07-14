/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `explorationCache` LMDB sub-DB CRUD.
 *
 * plans/exploration-based-context-build.md Section 7 (Storage +
 * caching). One row per successful exploration invocation.
 * Deterministic explorations gain a lot from this cache; repeated
 * shaper runs with tiny prompt variation reuse cached results.
 *
 * Key: `<repoId u32 BE>|<repoLastIndexedAt ms u64 BE>|<paramHash>`
 *   -- includes the repo's lastIndexedAt so a re-index invalidates
 *      every cached exploration for that repo automatically
 *   -- includes the paramHash (SHA-256 of exploration.type +
 *      canonicalised params) so different params get distinct rows
 *
 * Value: msgpack-encoded `{ exploration, output, cachedAt }`. The
 * exploration is stamped alongside the output so a debug tool can
 * dump the whole cache without a separate lookup.
 *
 * The cache is repo-scoped. Cross-repo cache hits are impossible
 * (different repoId) which matches the V1 repo-scoped policy.
 */

import { createHash } from 'node:crypto';
import { Packr, Unpackr } from 'msgpackr';

import { getGraphStore, withWriteTxn } from './graph/store.js';
import { lookupRepoIdInTxn } from './repos.js';
import type {
	Exploration,
	ExplorationOutput,
} from '../analyze/explore/types.js';

// ---------------------------------------------------------------------------
// msgpack codec (local -- keeps codec.ts graph-shape only)
// ---------------------------------------------------------------------------

const packr   = new Packr({ useRecords: false });
const unpackr = new Unpackr({ useRecords: false });

interface CacheRow {
	readonly exploration: Exploration;
	readonly output:      ExplorationOutput;
	readonly cachedAt:    number;
}

// ---------------------------------------------------------------------------
// Key encoding
// ---------------------------------------------------------------------------

/**
 * Canonicalise + hash exploration params so semantically-equivalent
 * calls hit the same cache row. `type` is folded into the hash so
 * (type='concept.resolve', query='foo') and (type='symbol.locate',
 * names=['foo']) don't collide.
 */
export function hashExplorationParams(exp: Exploration): string {
	const canonical = {
		type:   exp.type,
		params: canonicalise(exp.params),
	};
	const h = createHash('sha256');
	h.update(JSON.stringify(canonical), 'utf8');
	return h.digest('hex').slice(0, 16);  // 128-bit prefix is plenty
}

function canonicalise(v: unknown): unknown {
	if (v === null || v === undefined) return v;
	if (typeof v !== 'object') return v;
	if (Array.isArray(v)) return v.map(canonicalise);
	const obj = v as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	const out: Record<string, unknown> = {};
	for (const k of keys) out[k] = canonicalise(obj[k]);
	return out;
}

/**
 * Cache key = repoId (u32 BE) || lastIndexedAt (u64 BE) || paramHash (bytes).
 * Total = 4 + 8 + 8 = 20 bytes.
 */
function encodeCacheKey(
	repoId:          number,
	lastIndexedAtMs: bigint,
	paramHashHex:    string,
): Buffer {
	const key = Buffer.alloc(20);
	key.writeUInt32BE(repoId, 0);
	key.writeBigUInt64BE(lastIndexedAtMs, 4);
	const hashBytes = Buffer.from(paramHashHex, 'hex');
	hashBytes.copy(key, 12, 0, 8);
	return key;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Read a cached exploration output. Returns null on cache miss or
 * when the repo isn't registered.
 */
export async function getCachedExploration(
	repo:            string,
	lastIndexedAtMs: bigint,
	exp:             Exploration,
): Promise<ExplorationOutput | null> {
	const store = await getGraphStore();
	const repoId = lookupRepoIdInTxn(store, repo);
	if (repoId === undefined) return null;
	const key = encodeCacheKey(repoId, lastIndexedAtMs, hashExplorationParams(exp));
	const buf = store.explorationCache.get(key) as Buffer | undefined;
	if (buf === undefined) return null;
	const row = unpackr.unpack(buf) as CacheRow;
	return row.output;
}

/**
 * Write an exploration output to the cache. Idempotent: overwrites
 * any existing row with the same key. Only successful outputs are
 * cached; the executor handles the caller-side decision.
 */
export async function putCachedExploration(
	repo:            string,
	lastIndexedAtMs: bigint,
	exp:             Exploration,
	output:          ExplorationOutput,
): Promise<void> {
	await withWriteTxn(s => {
		const repoId = lookupRepoIdInTxn(s, repo);
		if (repoId === undefined) return;
		const key = encodeCacheKey(repoId, lastIndexedAtMs, hashExplorationParams(exp));
		const row: CacheRow = { exploration: exp, output, cachedAt: Date.now() };
		s.explorationCache.put(key, packr.pack(row));
	});
}

/**
 * Wipe every cached exploration for a repo. Called by the repo
 * cascade delete path -- see db/entities.ts::deleteEntitiesForRepo.
 * Fine to over-delete: cache misses cost only a re-run.
 */
export async function deleteCachedExplorationsForRepo(repo: string): Promise<void> {
	await withWriteTxn(s => {
		const repoId = lookupRepoIdInTxn(s, repo);
		if (repoId === undefined) return;
		const prefix = Buffer.alloc(4);
		prefix.writeUInt32BE(repoId, 0);
		const succ = Buffer.alloc(4);
		succ.writeUInt32BE(repoId + 1, 0);
		const keysToRemove: Buffer[] = [];
		for (const { key } of s.explorationCache.getRange({ start: prefix, end: succ })) {
			keysToRemove.push(key as Buffer);
		}
		for (const k of keysToRemove) s.explorationCache.remove(k);
	});
}
