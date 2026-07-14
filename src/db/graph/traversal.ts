/**
 * Graph traversal primitives over the LMDB edge tables.
 *
 * Phase 4.1 of plans/storage-migration-lmdb-lance.md. Pure-graph
 * layer: operates on `bigint` u64 entity IDs and `RelationKind` byte
 * values. Domain-typed wrappers (findCallers / findCallees /
 * resolveClosure / etc.) land in Phase 4.2 on top of these.
 *
 * Performance contract (per the Phase 0.4 substrate-validation spike):
 * BFS over 10M edges from 100 random roots completes in ~16 ms p99
 * (mmap'd cursor scans, no per-node allocation in the inner loop).
 *
 * API:
 *   bfs(roots, opts)               -> Iterable<bigint>  (BFS-ordered)
 *   dfs(roots, opts)               -> Iterable<bigint>  (DFS-ordered)
 *   transitiveClosure(roots, opts) -> Set<bigint>       (all reachable)
 *   scc(roots, opts)               -> bigint[][]        (Tarjan's algorithm)
 *   unreachable(roots, kinds, opts) -> Iterable<bigint> (dead-code precondition)
 *
 * All iterators yield the root ids first (depth 0), then expand. The
 * `visitor` opt lets callers prune subtrees: returning `false` prevents
 * descent below that node.
 */

import {
	type RelationKind,
	type EntityKind,
	ENTITY_KIND_BYTE,
} from './keys.js';
import { decodeEntityRow } from './codec.js';
import { getGraphStore } from './store.js';
import { compileKindFilter, neighborsSync } from './edges.js';

export interface TraversalOpts {
	/**
	 * Relation kinds to traverse. Default: all kinds. The filter applies
	 * to expansion edges, not to the roots (which are always visited
	 * even if disconnected by the filter).
	 */
	kindFilter?: ReadonlySet<RelationKind> | readonly RelationKind[];

	/** Default `'out'` (follow outgoing edges). `'in'` follows incoming. */
	direction?: 'out' | 'in';

	/** Maximum depth to expand (root depth = 0). Default: unbounded. */
	maxDepth?: number;

	/**
	 * Per-node hook. Returns `false` to skip expanding that node (its
	 * out-edges aren't followed). The node itself is still yielded.
	 */
	visitor?: (id: bigint, depth: number) => boolean;
}

// ---------------------------------------------------------------------------
// BFS / DFS
// ---------------------------------------------------------------------------

export async function* bfs(
	roots: readonly bigint[],
	opts: TraversalOpts = {},
): AsyncGenerator<bigint> {
	const store = await getGraphStore();
	const visited = new Set<bigint>();
	let frontier: Array<[bigint, number]> = [];
	for (const r of roots) {
		if (visited.has(r)) continue;
		visited.add(r);
		frontier.push([r, 0]);
	}

	const kindBytes = compileKindFilter(opts.kindFilter);
	const direction = opts.direction ?? 'out';
	const maxDepth = opts.maxDepth ?? Number.POSITIVE_INFINITY;
	const visitor = opts.visitor;

	while (frontier.length > 0) {
		const next: Array<[bigint, number]> = [];
		for (const [node, depth] of frontier) {
			yield node;
			if (depth >= maxDepth) continue;
			if (visitor !== undefined && visitor(node, depth) === false) continue;
			for (const neighbor of neighborsSync(store, node, direction, kindBytes)) {
				if (visited.has(neighbor)) continue;
				visited.add(neighbor);
				next.push([neighbor, depth + 1]);
			}
		}
		frontier = next;
	}
}

export async function* dfs(
	roots: readonly bigint[],
	opts: TraversalOpts = {},
): AsyncGenerator<bigint> {
	const store = await getGraphStore();
	const visited = new Set<bigint>();

	const kindBytes = compileKindFilter(opts.kindFilter);
	const direction = opts.direction ?? 'out';
	const maxDepth = opts.maxDepth ?? Number.POSITIVE_INFINITY;
	const visitor = opts.visitor;

	// Iterative DFS using an explicit stack of (id, depth) pairs.
	// Push roots in reverse so the first root is yielded first.
	const stack: Array<[bigint, number]> = [];
	for (let i = roots.length - 1; i >= 0; i--) {
		const r = roots[i]!;
		stack.push([r, 0]);
	}

	while (stack.length > 0) {
		const [node, depth] = stack.pop()!;
		if (visited.has(node)) continue;
		visited.add(node);
		yield node;
		if (depth >= maxDepth) continue;
		if (visitor !== undefined && visitor(node, depth) === false) continue;
		// Push neighbors (also in reverse so iteration order matches the
		// BFS sub-DB scan order)
		const ns = [...neighborsSync(store, node, direction, kindBytes)];
		for (let i = ns.length - 1; i >= 0; i--) {
			const n = ns[i]!;
			if (!visited.has(n)) stack.push([n, depth + 1]);
		}
	}
}

// ---------------------------------------------------------------------------
// Transitive closure
// ---------------------------------------------------------------------------

export async function transitiveClosure(
	roots: readonly bigint[],
	opts: TraversalOpts = {},
): Promise<Set<bigint>> {
	const out = new Set<bigint>();
	for await (const id of bfs(roots, opts)) {
		out.add(id);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Strongly Connected Components (Tarjan's algorithm)
// ---------------------------------------------------------------------------

/**
 * Compute strongly connected components reachable from the given
 * roots. Returns each component as an array of bigint IDs. Components
 * of size 1 with no self-edge are isolated nodes (no cycle); size > 1
 * components are cycles.
 *
 * Tarjan's algorithm runs in O(V + E) over the reachable subgraph.
 * Iterative implementation (no recursion) so deep graphs don't blow
 * the JS stack.
 *
 * Uses outgoing edges; pass direction='in' in opts to compute SCC on
 * the reverse graph.
 */
export async function scc(
	roots: readonly bigint[],
	opts: TraversalOpts = {},
): Promise<bigint[][]> {
	const store = await getGraphStore();
	const kindBytes = compileKindFilter(opts.kindFilter);
	const direction = opts.direction ?? 'out';

	const index = new Map<bigint, number>();
	const lowlink = new Map<bigint, number>();
	const onStack = new Set<bigint>();
	const sccStack: bigint[] = [];
	const components: bigint[][] = [];
	let counter = 0;

	type Frame = { v: bigint; iter: Iterator<bigint>; nextChildToProcess: bigint | null };
	const dfsStack: Frame[] = [];

	const startVisit = (v: bigint): void => {
		index.set(v, counter);
		lowlink.set(v, counter);
		counter++;
		sccStack.push(v);
		onStack.add(v);
		dfsStack.push({
			v,
			iter: neighborsSync(store, v, direction, kindBytes)[Symbol.iterator](),
			nextChildToProcess: null,
		});
	};

	for (const root of roots) {
		if (index.has(root)) continue;
		startVisit(root);

		while (dfsStack.length > 0) {
			const frame = dfsStack[dfsStack.length - 1]!;
			// Did we just return from a child? Update lowlink.
			if (frame.nextChildToProcess !== null) {
				const child = frame.nextChildToProcess;
				frame.nextChildToProcess = null;
				lowlink.set(frame.v, Math.min(lowlink.get(frame.v)!, lowlink.get(child)!));
			}
			// Iterate children
			let advanced = false;
			while (true) {
				const next = frame.iter.next();
				if (next.done) break;
				const w = next.value;
				if (!index.has(w)) {
					frame.nextChildToProcess = w;
					startVisit(w);
					advanced = true;
					break;
				} else if (onStack.has(w)) {
					lowlink.set(frame.v, Math.min(lowlink.get(frame.v)!, index.get(w)!));
				}
			}
			if (advanced) continue;

			// Frame's children are exhausted. Check if we're an SCC root.
			if (lowlink.get(frame.v) === index.get(frame.v)) {
				const component: bigint[] = [];
				while (true) {
					const w = sccStack.pop()!;
					onStack.delete(w);
					component.push(w);
					if (w === frame.v) break;
				}
				components.push(component);
			}
			dfsStack.pop();
		}
	}

	return components;
}

// ---------------------------------------------------------------------------
// Reachability inverse (dead-code precondition)
// ---------------------------------------------------------------------------

/**
 * Yield u64 entity IDs that match `candidateKinds` and are NOT in the
 * transitive closure of `roots`. This is the precondition for
 * dead-code analysis: callers seed `roots` with entry points (exported
 * symbols, test files, build targets) and ask "what entities of these
 * kinds is nothing reaching?".
 *
 * Pipeline:
 *   1. `transitiveClosure(roots, opts)` materialises the reachable set.
 *   2. Linear scan of the `entity` sub-DB; per row, check the kind
 *      byte against `candidateKinds` and skip if the u64 is in the
 *      reachable set.
 *
 * Repo scoping is intentionally NOT done here -- this is the
 * pure-graph layer (operates on bigint + EntityKind only). Domain
 * wrappers in `db/search.ts` scope by repo path / repoId.
 *
 * Empty `candidateKinds` is a no-op (yields nothing). Empty `roots`
 * with non-empty kinds yields every entity of those kinds.
 */
export async function* unreachable(
	roots: readonly bigint[],
	candidateKinds: readonly EntityKind[],
	opts: TraversalOpts = {},
): AsyncGenerator<bigint> {
	if (candidateKinds.length === 0) return;

	const candidateBytes = new Set<number>();
	for (const k of candidateKinds) {
		const b = ENTITY_KIND_BYTE[k as keyof typeof ENTITY_KIND_BYTE];
		if (b !== undefined) candidateBytes.add(b);
	}
	if (candidateBytes.size === 0) return;

	const reachable = await transitiveClosure(roots, opts);

	const store = await getGraphStore();
	for (const { key, value } of store.entity.getRange()) {
		const u64 = (key as Buffer).readBigUInt64BE(0);
		if (reachable.has(u64)) continue;
		const row = decodeEntityRow(value as Buffer);
		const kindByte = ENTITY_KIND_BYTE[row.kind as keyof typeof ENTITY_KIND_BYTE];
		if (kindByte === undefined || !candidateBytes.has(kindByte)) continue;
		yield u64;
	}
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------
// Neighbor scan + kind filter live in `./edges.ts` so 1-hop callers
// (search.ts domain wrappers) can reuse them without dragging in
// BFS / SCC machinery.
