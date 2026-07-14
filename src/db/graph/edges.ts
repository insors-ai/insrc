/**
 * 1-hop edge primitives over the LMDB out_edge / in_edge sub-DBs.
 *
 * Phase 4.2 of plans/storage-migration-lmdb-lance.md. Splits the
 * neighbor-scan iterator out of `traversal.ts` so 1-hop callers
 * (findCallers / findCallees / findDefinedIn / findImports / domain
 * search wrappers) can use it without dragging in BFS / SCC machinery.
 *
 * All functions operate on `bigint` u64 entity IDs and `RelationKind`
 * byte values. Domain (`Entity.id` string ↔ u64) translation happens
 * in `db/entities.ts`.
 */

import {
	encodeOutEdgePrefix,
	encodeInEdgePrefix,
	prefixSuccessor,
	RELATION_KIND_BYTE,
	type RelationKind,
} from './keys.js';
import { getGraphStore, type GraphStore } from './store.js';

export type EdgeDirection = 'out' | 'in';

export interface NeighborOpts {
	/**
	 * Restrict to one or more relation kinds. Default: all kinds.
	 * Compiled to a `Set<number>` of u8 bytes once per call.
	 */
	kindFilter?: ReadonlySet<RelationKind> | readonly RelationKind[];
}

/**
 * Synchronous neighbor iterator. Reads the lmdb-js cursor inside the
 * current read snapshot (each `getRange` call is auto-snapshotted).
 *
 * Returns an iterable of u64 neighbors filtered by `kindBytes` if
 * non-null; if null, all kinds are included. Caller is responsible for
 * deduping if the same neighbor can appear under multiple kinds.
 */
export function* neighborsSync(
	store: GraphStore,
	from: bigint,
	direction: EdgeDirection,
	kindBytes: Set<number> | null,
): Generator<bigint> {
	const prefix = direction === 'out'
		? encodeOutEdgePrefix(from)
		: encodeInEdgePrefix(from);
	const succ = prefixSuccessor(prefix);
	const db = direction === 'out' ? store.outEdge : store.inEdge;
	for (const { key } of db.getRange({ start: prefix, end: succ })) {
		const k = key as Buffer;
		const kind = k.readUInt8(8);
		if (kindBytes !== null && !kindBytes.has(kind)) continue;
		// out_edge: from at offset 0, to at offset 9
		// in_edge:  to   at offset 0, from at offset 9
		// In both cases, the "neighbor" is at offset 9.
		yield k.readBigUInt64BE(9);
	}
}

/**
 * Compile a kindFilter spec to a `Set<number>` of u8 bytes, or `null`
 * if no filter (all kinds match).
 */
export function compileKindFilter(
	filter: NeighborOpts['kindFilter'],
): Set<number> | null {
	if (filter === undefined) return null;
	const set = new Set<number>();
	const kinds = filter instanceof Set ? filter : new Set(filter);
	for (const k of kinds) {
		const byte = RELATION_KIND_BYTE[k as keyof typeof RELATION_KIND_BYTE];
		if (byte !== undefined) set.add(byte);
	}
	return set;
}

/**
 * Materialise the 1-hop outgoing neighbours of `from` as a deduped
 * array of u64 IDs, optionally filtered by relation kind.
 *
 * For traversals (BFS / DFS / closure / SCC) prefer the iterator from
 * `neighborsSync` so per-step memory stays bounded.
 */
export async function outNeighbors(
	from: bigint,
	opts: NeighborOpts = {},
): Promise<bigint[]> {
	const store = await getGraphStore();
	const kinds = compileKindFilter(opts.kindFilter);
	const seen = new Set<bigint>();
	const out: bigint[] = [];
	for (const n of neighborsSync(store, from, 'out', kinds)) {
		if (seen.has(n)) continue;
		seen.add(n);
		out.push(n);
	}
	return out;
}

/** Mirror of `outNeighbors` for incoming edges. */
export async function inNeighbors(
	to: bigint,
	opts: NeighborOpts = {},
): Promise<bigint[]> {
	const store = await getGraphStore();
	const kinds = compileKindFilter(opts.kindFilter);
	const seen = new Set<bigint>();
	const out: bigint[] = [];
	for (const n of neighborsSync(store, to, 'in', kinds)) {
		if (seen.has(n)) continue;
		seen.add(n);
		out.push(n);
	}
	return out;
}
