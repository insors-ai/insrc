/**
 * Phase 4.1 + 4.3 tests for the LMDB graph traversal primitives.
 *   bfs / dfs / transitiveClosure / scc      — Phase 4.1
 *   unreachable                              — Phase 4.3 (dead-code precondition)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../store.js';
import {
	encodeEntityKey,
	encodeOutEdgeKey,
	encodeInEdgeKey,
	RELATION_KIND_BYTE,
	type EntityKind,
	type RelationKind,
} from '../keys.js';
import { encodeEntityRow, type EntityRow } from '../codec.js';
import { bfs, dfs, transitiveClosure, scc, unreachable } from '../traversal.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-traversal-4.1-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

/**
 * Wire a directed edge into both out_edge and in_edge mirror tables.
 * Direct LMDB writes (Phase 2.3 edge API isn't separate; relations.ts
 * is the public surface but it requires an entity_id_by_string lookup
 * which complicates fixture setup -- direct writes keep these tests
 * focused on traversal correctness).
 */
async function wireEdge(from: bigint, kind: RelationKind, to: bigint): Promise<void> {
	const kindByte = RELATION_KIND_BYTE[kind];
	await withWriteTxn(s => {
		s.outEdge.put(encodeOutEdgeKey(from, kindByte, to), Buffer.alloc(0));
		s.inEdge.put(encodeInEdgeKey(to, kindByte, from), Buffer.alloc(0));
	});
}

async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
	const out: T[] = [];
	for await (const v of gen) out.push(v);
	return out;
}

/**
 * Write a minimal entity row keyed by `u64`. Only `kind` matters for
 * the unreachable() tests -- everything else is sentinel.
 */
async function wireEntity(u64: bigint, kind: EntityKind): Promise<void> {
	const row: EntityRow = {
		repoId:          1,
		kind,
		name:            `e${u64}`,
		filePath:        '',
		startLine:       0,
		endLine:         0,
		language:        'typescript',
		rootPath:        '',
		body:            '',
		signature:       '',
		summary:         '',
		isExported:      false,
		isAsync:         false,
		isAbstract:      false,
		artifact:        false,
		contentHash:     '',
		embeddingModel:  '',
		indexedAt:       0,
	};
	await withWriteTxn(s => {
		s.entity.put(encodeEntityKey(u64), encodeEntityRow(row));
	});
}

// ---------------------------------------------------------------------------
// BFS
// ---------------------------------------------------------------------------

test('bfs from a single root yields the root + transitive descendants', async () => {
	await getGraphStore();
	// Graph:  1 --CALLS--> 2 --CALLS--> 3
	//                       \-CALLS--> 4
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	await wireEdge(2n, 'CALLS', 4n);

	const got = await collect(bfs([1n]));
	assert.deepEqual(got.sort(), [1n, 2n, 3n, 4n]);
});

test('bfs visits each node exactly once even with cycles', async () => {
	await getGraphStore();
	// Cycle: 1 -> 2 -> 3 -> 1
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	await wireEdge(3n, 'CALLS', 1n);
	const got = await collect(bfs([1n]));
	assert.equal(got.length, 3);
});

test('bfs respects maxDepth', async () => {
	await getGraphStore();
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	await wireEdge(3n, 'CALLS', 4n);

	const d0 = await collect(bfs([1n], { maxDepth: 0 }));
	assert.deepEqual(d0.sort(), [1n]);
	const d1 = await collect(bfs([1n], { maxDepth: 1 }));
	assert.deepEqual(d1.sort(), [1n, 2n]);
	const d2 = await collect(bfs([1n], { maxDepth: 2 }));
	assert.deepEqual(d2.sort(), [1n, 2n, 3n]);
});

test('bfs respects kindFilter', async () => {
	await getGraphStore();
	await wireEdge(1n, 'CALLS',   2n);
	await wireEdge(1n, 'IMPORTS', 3n);
	await wireEdge(2n, 'CALLS',   4n);

	const callsOnly = await collect(bfs([1n], { kindFilter: ['CALLS'] }));
	assert.deepEqual(callsOnly.sort(), [1n, 2n, 4n]);

	const importsOnly = await collect(bfs([1n], { kindFilter: ['IMPORTS'] }));
	assert.deepEqual(importsOnly.sort(), [1n, 3n]);
});

test('bfs with direction=in walks reverse edges', async () => {
	await getGraphStore();
	// 1 -> 2 -> 3
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);

	const fromTip = await collect(bfs([3n], { direction: 'in' }));
	assert.deepEqual(fromTip.sort(), [1n, 2n, 3n]);
});

test('bfs visitor pruning skips subtree expansion', async () => {
	await getGraphStore();
	// 1 -> 2 -> 3, 1 -> 4
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	await wireEdge(1n, 'CALLS', 4n);

	const got = await collect(bfs([1n], {
		visitor: (id) => id !== 2n, // prune at 2 -- don't expand its children
	}));
	assert.deepEqual(got.sort(), [1n, 2n, 4n]);
});

test('bfs from multiple roots merges the closures', async () => {
	await getGraphStore();
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(3n, 'CALLS', 4n);
	const got = await collect(bfs([1n, 3n]));
	assert.deepEqual(got.sort(), [1n, 2n, 3n, 4n]);
});

test('bfs deduplicates roots', async () => {
	await getGraphStore();
	await wireEdge(1n, 'CALLS', 2n);
	const got = await collect(bfs([1n, 1n, 1n]));
	assert.deepEqual(got.sort(), [1n, 2n]);
});

// ---------------------------------------------------------------------------
// DFS
// ---------------------------------------------------------------------------

test('dfs visits the same nodes as bfs (different order)', async () => {
	await getGraphStore();
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	await wireEdge(2n, 'CALLS', 4n);
	const dfsResult = await collect(dfs([1n]));
	const bfsResult = await collect(bfs([1n]));
	assert.deepEqual(dfsResult.sort(), bfsResult.sort());
});

test('dfs handles cycles without infinite loop', async () => {
	await getGraphStore();
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 1n);
	const got = await collect(dfs([1n]));
	assert.deepEqual(got.sort(), [1n, 2n]);
});

test('dfs respects maxDepth', async () => {
	await getGraphStore();
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	const d1 = await collect(dfs([1n], { maxDepth: 1 }));
	assert.deepEqual(d1.sort(), [1n, 2n]);
});

// ---------------------------------------------------------------------------
// transitiveClosure
// ---------------------------------------------------------------------------

test('transitiveClosure returns the BFS-reachable set', async () => {
	await getGraphStore();
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	await wireEdge(5n, 'CALLS', 6n);

	const c = await transitiveClosure([1n]);
	assert.equal(c.size, 3);
	assert.ok(c.has(1n));
	assert.ok(c.has(2n));
	assert.ok(c.has(3n));
	assert.ok(!c.has(5n));
	assert.ok(!c.has(6n));
});

test('transitiveClosure on empty roots returns empty set', async () => {
	await getGraphStore();
	const c = await transitiveClosure([]);
	assert.equal(c.size, 0);
});

// ---------------------------------------------------------------------------
// SCC (Tarjan's algorithm)
// ---------------------------------------------------------------------------

test('scc: isolated nodes are singletons', async () => {
	await getGraphStore();
	// 1 -> 2 -> 3 (no cycle)
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	const components = await scc([1n]);
	assert.equal(components.length, 3);
	for (const c of components) {
		assert.equal(c.length, 1);
	}
});

test('scc: a 3-node cycle is one component of size 3', async () => {
	await getGraphStore();
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	await wireEdge(3n, 'CALLS', 1n);
	const components = await scc([1n]);
	assert.equal(components.length, 1);
	assert.equal(components[0]!.length, 3);
});

test('scc: cycle + tail reports two components', async () => {
	await getGraphStore();
	// 1 -> 2 -> 3 -> 1, and 3 -> 4 (tail)
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	await wireEdge(3n, 'CALLS', 1n);
	await wireEdge(3n, 'CALLS', 4n);
	const components = await scc([1n]);
	const sizes = components.map(c => c.length).sort((a, b) => a - b);
	assert.deepEqual(sizes, [1, 3]);
});

test('scc: two disjoint cycles + reachable from a single root via separate edge', async () => {
	await getGraphStore();
	// 1 -> 2 -> 1 (cycle A), 1 -> 3 -> 4 -> 3 (cycle B reached through 3)
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 1n);
	await wireEdge(1n, 'CALLS', 3n);
	await wireEdge(3n, 'CALLS', 4n);
	await wireEdge(4n, 'CALLS', 3n);
	const components = await scc([1n]);
	const sizes = components.map(c => c.length).sort((a, b) => a - b);
	assert.deepEqual(sizes, [2, 2]);
});

test('scc respects kindFilter', async () => {
	await getGraphStore();
	// 1 -CALLS-> 2 -CALLS-> 1 forms a cycle on CALLS only
	await wireEdge(1n, 'CALLS',   2n);
	await wireEdge(2n, 'CALLS',   1n);
	// 3 -IMPORTS-> 1 doesn't pull 3 in via CALLS
	await wireEdge(3n, 'IMPORTS', 1n);

	const callsOnly = await scc([1n], { kindFilter: ['CALLS'] });
	const sizes = callsOnly.map(c => c.length).sort((a, b) => a - b);
	assert.deepEqual(sizes, [2]);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('traversal results survive close + reopen', async () => {
	await getGraphStore();
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	await closeGraphStore();
	const c = await transitiveClosure([1n]);
	assert.equal(c.size, 3);
});

// ---------------------------------------------------------------------------
// unreachable (Phase 4.3)
// ---------------------------------------------------------------------------

test('unreachable: every entity outside the closure is yielded', async () => {
	await getGraphStore();
	// 1 (entry) -> 2 -> 3,  4 isolated, 5 isolated
	await wireEntity(1n, 'function');
	await wireEntity(2n, 'function');
	await wireEntity(3n, 'function');
	await wireEntity(4n, 'function');
	await wireEntity(5n, 'function');
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);

	const got = await collect(unreachable([1n], ['function']));
	assert.deepEqual(got.sort(), [4n, 5n]);
});

test('unreachable respects candidateKinds (only those kinds yielded)', async () => {
	await getGraphStore();
	await wireEntity(1n, 'function'); // root, reachable
	await wireEntity(2n, 'function'); // unreachable function
	await wireEntity(3n, 'class');    // unreachable class
	await wireEntity(4n, 'variable'); // unreachable variable

	const fns  = await collect(unreachable([1n], ['function']));
	assert.deepEqual(fns, [2n]);
	const cls  = await collect(unreachable([1n], ['class']));
	assert.deepEqual(cls, [3n]);
	const both = await collect(unreachable([1n], ['function', 'class']));
	assert.deepEqual(both.sort(), [2n, 3n]);
});

test('unreachable: empty roots yields every entity of the candidate kinds', async () => {
	await getGraphStore();
	await wireEntity(1n, 'function');
	await wireEntity(2n, 'function');
	await wireEntity(3n, 'class');

	const fns = await collect(unreachable([], ['function']));
	assert.deepEqual(fns.sort(), [1n, 2n]);
});

test('unreachable: all roots, all reachable -> empty', async () => {
	await getGraphStore();
	await wireEntity(1n, 'function');
	await wireEntity(2n, 'function');
	await wireEdge(1n, 'CALLS', 2n);

	const got = await collect(unreachable([1n], ['function']));
	assert.deepEqual(got, []);
});

test('unreachable: empty candidateKinds is a no-op', async () => {
	await getGraphStore();
	await wireEntity(1n, 'function');
	await wireEntity(2n, 'function');

	const got = await collect(unreachable([], []));
	assert.deepEqual(got, []);
});

test('unreachable handles cycles in the reachable subgraph', async () => {
	await getGraphStore();
	// 1 <-> 2 cycle, 3 isolated
	await wireEntity(1n, 'function');
	await wireEntity(2n, 'function');
	await wireEntity(3n, 'function');
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 1n);

	const got = await collect(unreachable([1n], ['function']));
	assert.deepEqual(got, [3n]);
});

test('unreachable respects kindFilter on the closure traversal', async () => {
	await getGraphStore();
	// 1 -CALLS-> 2,  1 -IMPORTS-> 3
	await wireEntity(1n, 'function');
	await wireEntity(2n, 'function');
	await wireEntity(3n, 'function');
	await wireEdge(1n, 'CALLS',   2n);
	await wireEdge(1n, 'IMPORTS', 3n);

	// Only CALLS expansion -> 3 stays unreachable
	const callsOnly = await collect(unreachable(
		[1n],
		['function'],
		{ kindFilter: ['CALLS'] },
	));
	assert.deepEqual(callsOnly, [3n]);

	// Both kinds -> nothing unreachable
	const bothKinds = await collect(unreachable(
		[1n],
		['function'],
		{ kindFilter: ['CALLS', 'IMPORTS'] },
	));
	assert.deepEqual(bothKinds, []);
});

test('unreachable respects direction=in (reverse reachability)', async () => {
	await getGraphStore();
	// 1 -CALLS-> 2 -CALLS-> 3.  Forward from 1 covers all; reverse from
	// 1 only covers 1 itself, so 2 and 3 should be unreachable.
	await wireEntity(1n, 'function');
	await wireEntity(2n, 'function');
	await wireEntity(3n, 'function');
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);

	const reverse = await collect(unreachable(
		[1n],
		['function'],
		{ direction: 'in' },
	));
	assert.deepEqual(reverse.sort(), [2n, 3n]);
});

test('unreachable respects maxDepth', async () => {
	await getGraphStore();
	// 1 -> 2 -> 3 -> 4
	await wireEntity(1n, 'function');
	await wireEntity(2n, 'function');
	await wireEntity(3n, 'function');
	await wireEntity(4n, 'function');
	await wireEdge(1n, 'CALLS', 2n);
	await wireEdge(2n, 'CALLS', 3n);
	await wireEdge(3n, 'CALLS', 4n);

	const d1 = await collect(unreachable([1n], ['function'], { maxDepth: 1 }));
	assert.deepEqual(d1.sort(), [3n, 4n]);
});
