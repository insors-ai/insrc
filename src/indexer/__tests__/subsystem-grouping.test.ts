/**
 * Epic c2ba6fa6, Story s8, t2 -- subsystem grouping. groupSubsystems over
 * hand-built file graphs: every file is in exactly one group; the same graph
 * gives the same groups, also with its edges shuffled; two dense clusters
 * joined by one weak edge are two groups, and a file with no relationships
 * joins its directory's group through the same-directory edge; ids are the
 * hash of the sorted members and names the longest common directory;
 * connections sum the edges between groups, without the directory edges.
 *
 * Run: npx tsx --test src/indexer/__tests__/subsystem-grouping.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { directoryEdges, groupSubsystems, type FileEdge, type FileGraph } from '../subsystems.js';

const call = (a: string, b: string, weight = 1): FileEdge => ({ a, b, weight, kinds: { CALLS: 1 } });

/** Every pair of `files` joined by a call: a dense cluster. */
const clique = (files: string[]): FileEdge[] => files.flatMap((a, i) => files.slice(i + 1).map(b => call(a, b)));

const PARSE = ['src/parse/lexer.ts', 'src/parse/parser.ts', 'src/parse/ast.ts', 'src/parse/tokens.ts'];
const STORE = ['src/store/db.ts', 'src/store/rows.ts', 'src/store/codec.ts', 'src/store/keys.ts'];
const LONELY = 'src/parse/constants.ts';

const graph = (): FileGraph => {
	const files = [...PARSE, ...STORE, LONELY];
	return { files, edges: [...clique(PARSE), ...clique(STORE), call('src/parse/parser.ts', 'src/store/db.ts', 0.6), ...directoryEdges(files)] };
};
const membersOf = (g: FileGraph) => groupSubsystems(g).map(s => [...s.files]).sort((a, b) => a[0]!.localeCompare(b[0]!));

/** A fixed shuffle (no randomness in the test either). */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
	const out = [...xs];
	let s = seed;
	for (let i = out.length - 1; i > 0; i--) {
		s = (s * 1103515245 + 12345) % 2147483648;
		const j = s % (i + 1);
		[out[i], out[j]] = [out[j]!, out[i]!];
	}
	return out;
}

test('s8 t2: every file is in exactly one group', () => {
	const g = graph();
	const seen = groupSubsystems(g).flatMap(s => s.files);
	assert.deepEqual([...seen].sort(), [...g.files].sort());
	assert.equal(new Set(seen).size, seen.length, 'no file in two groups');

	assert.deepEqual(membersOf({ files: ['a.ts', 'b/c.ts'], edges: [] }), [['a.ts'], ['b/c.ts']], 'a graph without edges: one file per group');
});

test('s8 t2: the same graph gives the same groups, also with its edges and files shuffled', () => {
	const g = graph();
	const first = groupSubsystems(g);
	assert.deepEqual(groupSubsystems(g), first, 'run twice');
	for (const seed of [1, 7, 42, 2026]) {
		assert.deepEqual(groupSubsystems({ files: shuffled(g.files, seed), edges: shuffled(g.edges, seed + 1) }), first, `shuffle ${seed}`);
	}
});

test('s8 t2: two dense clusters joined by one weak edge are two groups; a file with no relationships joins its directory through the same-directory edge', () => {
	assert.deepEqual(membersOf(graph()), [[...PARSE, LONELY].sort(), [...STORE].sort()]);

	// Without the directory edges the lonely file stands alone.
	const g = graph();
	const bare = { files: g.files, edges: g.edges.filter(e => Object.keys(e.kinds).length > 0) };
	assert.ok(membersOf(bare).some(m => m.length === 1 && m[0] === LONELY));
});

test('s8 t2: ids are the hash of the sorted members, names the longest common directory, and connections sum the edges between groups', () => {
	const groups = groupSubsystems(graph());
	for (const s of groups) {
		assert.equal(s.id, createHash('sha256').update([...s.files].sort().join('\n')).digest('hex').slice(0, 32));
		assert.deepEqual(s.files, [...s.files].sort());
	}
	const parse = groups.find(s => s.files.includes('src/parse/lexer.ts'))!;
	const store = groups.find(s => s.files.includes('src/store/db.ts'))!;
	assert.equal(parse.name, 'src/parse');
	assert.equal(store.name, 'src/store');
	assert.deepEqual(parse.connections, [{ to: store.id, weight: 0.6, kinds: { CALLS: 1 } }], 'the one call across, not the directory edges');
	assert.deepEqual(store.connections, [], 'connections follow the edge direction');

	assert.equal(groupSubsystems({ files: ['src/a.ts', 'lib/b.ts'], edges: [call('src/a.ts', 'lib/b.ts')] })[0]!.name, '.', 'no common directory');
	assert.equal(groupSubsystems({ files: ['src/only.ts'], edges: [] })[0]!.name, 'src/only.ts', 'a single file is named by its path');
});

test('s8 t2: a file tied between two groups joins the smaller one, whatever the edge order', () => {
	const e = (a: string, b: string) => call(a, b);
	const tri = (p: string) => [e(`${p}1.ts`, `${p}2.ts`), e(`${p}2.ts`, `${p}3.ts`), e(`${p}1.ts`, `${p}3.ts`)];
	const files = ['a1.ts', 'a2.ts', 'a3.ts', 'm.ts', 'b1.ts', 'b2.ts', 'b3.ts'];
	const edges = [...tri('a'), ...tri('b'), e('m.ts', 'a1.ts'), e('m.ts', 'b1.ts')];   // m links each triangle once: a tie
	const expected = [['a1.ts', 'a2.ts', 'a3.ts', 'm.ts'], ['b1.ts', 'b2.ts', 'b3.ts']];
	assert.deepEqual(membersOf({ files, edges }), expected);
	for (const seed of [3, 9, 27]) assert.deepEqual(membersOf({ files, edges: shuffled(edges, seed) }), expected, `shuffle ${seed}`);
});

test('s8 t2: groups aggregate: modules strongly linked in pairs end as one group per pair', () => {
	const mod = (k: number) => [0, 1, 2, 3].map(i => `m${k}/f${i}.ts`);
	const mods = Array.from({ length: 8 }, (_v, k) => mod(k));
	const edges = mods.flatMap(m => clique(m));
	for (let k = 0; k < 8; k += 2) for (const a of mods[k]!) for (const b of mods[k + 1]!) edges.push(call(a, b, 0.25));
	for (let k = 1; k < 8; k += 2) edges.push(call(mods[k]![0]!, mods[(k + 1) % 8]![0]!, 0.05));
	assert.deepEqual(membersOf({ files: mods.flat(), edges }), [0, 2, 4, 6].map(k => [...mods[k]!, ...mods[k + 1]!].sort()), 'one level of moves leaves the eight modules apart; aggregation joins each pair');
});

test('s8 t2: connections count only relationships, never the same-directory edges, even between groups of one directory', () => {
	const A = ['lib/a1.ts', 'lib/a2.ts', 'lib/a3.ts', 'lib/a4.ts'];
	const B = ['lib/b1.ts', 'lib/b2.ts', 'lib/b3.ts', 'lib/b4.ts'];
	const heavy = (fs: string[]) => clique(fs).map(e => ({ ...e, weight: 3 }));
	const groups = groupSubsystems({ files: [...A, ...B], edges: [...heavy(A), ...heavy(B), call('lib/a1.ts', 'lib/b1.ts'), ...directoryEdges([...A, ...B])] });
	const a = groups.find(s => s.files.includes('lib/a1.ts'))!, b = groups.find(s => s.files.includes('lib/b1.ts'))!;
	assert.notEqual(a.id, b.id);
	assert.deepEqual(a.connections, [{ to: b.id, weight: 1, kinds: { CALLS: 1 } }]);
});
