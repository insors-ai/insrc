/**
 * Sequential ID allocators for the LMDB graph store.
 *
 * Phase 1.2 of plans/storage-migration-lmdb-lance.md. Per the design
 * doc:
 *
 *   - Entity ID: u64 sequential, allocated by an atomic counter in the
 *     `meta` sub-DB. Edge keys multiply by 10x edge:entity ratio so
 *     8-byte IDs (vs 32-byte SHA hex) is the dominant storage win.
 *
 *   - Repo ID: u32 sequential, also from an atomic counter. We expect
 *     ≤ a few hundred repos in any realistic deployment.
 *
 * Both counters live under fixed `meta` keys and are read-modify-write
 * inside an LMDB write transaction. Callers should batch allocations
 * inside a re-index transaction to amortise txn overhead, but
 * `allocateEntityId()` / `allocateRepoId()` are also safe to call
 * outside an outer txn -- they open their own internal one.
 *
 * IDs are monotonically increasing and never reused, even after the
 * entity is deleted. This avoids dangling-edge confusion: if an entity
 * with id=42 is deleted and a new one is created later, it gets id=43,
 * not id=42.
 */

import { WORKSPACE_REPO_ID_MAX } from '../../shared/repo-namespaces.js';
import { getGraphStore, withWriteTxn, type GraphStore } from './store.js';

/**
 * Hard cap on the workspace repoId allocator. The Phase 5.x strict
 * contract reserves the top of u32 space for shared-modules
 * registry rows; the workspace allocator must never reach those.
 * 4 billion is a structurally-impossible workspace count, so this
 * is a safety bound, not a real limit.
 */
class RepoIdSpaceExhausted extends Error {
	constructor(next: number) {
		super(
			`Workspace repoId allocator reached ${next}, beyond the cap ` +
			`${WORKSPACE_REPO_ID_MAX}. The reserved top-of-u32 range is for ` +
			`shared-modules namespace rows. This is structurally impossible ` +
			`under any realistic workload -- check for a counter-corruption bug.`,
		);
		this.name = 'RepoIdSpaceExhausted';
	}
}

// ---------------------------------------------------------------------------
// Meta keys (utf8 strings; meta sub-DB uses ordered-binary key encoding)
// ---------------------------------------------------------------------------

const META_NEXT_ENTITY_ID = 'next_entity_id';
const META_NEXT_REPO_ID   = 'next_repo_id';

// Initial values: 1 (we reserve 0 as a sentinel for "no ID assigned")
const INITIAL_ENTITY_ID = 1n;
const INITIAL_REPO_ID   = 1;

// ---------------------------------------------------------------------------
// Entity ID allocator
// ---------------------------------------------------------------------------

/**
 * Allocate the next u64 entity ID. Atomic: read-modify-write inside a
 * write txn; concurrent callers serialize at the LMDB level.
 *
 * Returns a bigint to preserve full u64 range. Note that JavaScript
 * Numbers can safely represent integers up to 2^53 - 1 -- our entity
 * IDs are u64 so callers must keep them as bigint.
 */
export async function allocateEntityId(): Promise<bigint> {
	return withWriteTxn(s => allocateEntityIdInTxn(s));
}

/**
 * Synchronous in-txn allocator -- use this when you're already inside
 * a `withWriteTxnSync` call and want to allocate IDs alongside other
 * writes. Reads `next_entity_id`, increments, writes it back, returns
 * the previous value.
 */
export function allocateEntityIdInTxn(store: GraphStore): bigint {
	const cur = readU64(store, META_NEXT_ENTITY_ID, INITIAL_ENTITY_ID);
	const next = cur + 1n;
	writeU64(store, META_NEXT_ENTITY_ID, next);
	return cur;
}

/**
 * Allocate a contiguous block of `count` entity IDs. Returns the first
 * ID; the block is `[first, first + count)`. Bulk-write callers
 * (re-index loop) use this to allocate all needed IDs in one
 * meta-counter update.
 */
export async function allocateEntityIdBlock(count: number): Promise<bigint> {
	if (count < 1) throw new Error(`allocateEntityIdBlock: count must be >= 1, got ${count}`);
	return withWriteTxn(s => {
		const cur = readU64(s, META_NEXT_ENTITY_ID, INITIAL_ENTITY_ID);
		const next = cur + BigInt(count);
		writeU64(s, META_NEXT_ENTITY_ID, next);
		return cur;
	});
}

// ---------------------------------------------------------------------------
// Repo ID allocator
// ---------------------------------------------------------------------------

export async function allocateRepoId(): Promise<number> {
	return withWriteTxn(s => allocateRepoIdInTxn(s));
}

export function allocateRepoIdInTxn(store: GraphStore): number {
	const cur = readU32(store, META_NEXT_REPO_ID, INITIAL_REPO_ID);
	if (cur > WORKSPACE_REPO_ID_MAX) {
		throw new RepoIdSpaceExhausted(cur);
	}
	const next = cur + 1;
	writeU32(store, META_NEXT_REPO_ID, next);
	return cur;
}

// ---------------------------------------------------------------------------
// Read / write helpers
// ---------------------------------------------------------------------------

function readU64(store: GraphStore, key: string, fallback: bigint): bigint {
	const v = store.meta.get(key);
	if (v === undefined) return fallback;
	if (Buffer.isBuffer(v)) {
		if (v.length !== 8) {
			throw new Error(`meta key '${key}': expected 8-byte u64, got ${v.length}`);
		}
		return v.readBigUInt64BE(0);
	}
	if (typeof v === 'bigint') return v;
	if (typeof v === 'number') return BigInt(v);
	throw new Error(`meta key '${key}': unexpected value type ${typeof v}`);
}

function writeU64(store: GraphStore, key: string, value: bigint): void {
	const buf = Buffer.alloc(8);
	buf.writeBigUInt64BE(value, 0);
	store.meta.put(key, buf);
}

function readU32(store: GraphStore, key: string, fallback: number): number {
	const v = store.meta.get(key);
	if (v === undefined) return fallback;
	if (Buffer.isBuffer(v)) {
		if (v.length !== 4) {
			throw new Error(`meta key '${key}': expected 4-byte u32, got ${v.length}`);
		}
		return v.readUInt32BE(0);
	}
	if (typeof v === 'number') return v;
	if (typeof v === 'bigint') return Number(v);
	throw new Error(`meta key '${key}': unexpected value type ${typeof v}`);
}

function writeU32(store: GraphStore, key: string, value: number): void {
	const buf = Buffer.alloc(4);
	buf.writeUInt32BE(value >>> 0, 0);
	store.meta.put(key, buf);
}

// ---------------------------------------------------------------------------
// Inspection (for debug / tooling)
// ---------------------------------------------------------------------------

/**
 * Peek at the next-to-be-allocated IDs without consuming any. Useful
 * for debug pages, telemetry, daemon `status` command.
 */
export async function peekIdCounters(): Promise<{ nextEntityId: bigint; nextRepoId: number }> {
	const store = await getGraphStore();
	return {
		nextEntityId: readU64(store, META_NEXT_ENTITY_ID, INITIAL_ENTITY_ID),
		nextRepoId:   readU32(store, META_NEXT_REPO_ID, INITIAL_REPO_ID),
	};
}
