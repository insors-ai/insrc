/**
 * Subsystem grouping (Epic c2ba6fa6, Story s8): a repository's code files
 * grouped by the stored relationships between them.
 *
 * groupSubsystems is a deterministic Louvain-style modularity grouping over an
 * undirected, weighted file graph:
 *   1. local moves -- each file, visited in path order, moves to the
 *      neighbouring group with the largest modularity gain (a tie, within
 *      1e-12, goes to the smaller group), until a full round moves nothing;
 *   2. aggregation -- each group becomes one node (numbered by its first
 *      member in path order), its inner weight a self-loop;
 * repeated until a round of local moves changes nothing. No randomness and a
 * fixed visiting order: one graph gives one partition, whatever the order of
 * its edges.
 *
 * A subsystem's id is the sha256 of its sorted member paths (hex-32), so a
 * changed membership is a new id; its name is the members' longest common
 * directory (the file's own path for a single file). Its connections are the
 * summed weights and kind counts of the edges from its files to another
 * subsystem's; an edge without kinds (a same-directory edge) adds weight to
 * the grouping only.
 */

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

import type { RelationKind } from '../shared/types.js';

/** A relationship between two code files: `a` holds it, `b` is reached. */
export interface FileEdge {
	readonly a:      string;
	readonly b:      string;
	readonly weight: number;
	readonly kinds:  Readonly<Partial<Record<RelationKind, number>>>;
}

export interface FileGraph {
	readonly files: readonly string[];          // repo-relative code files
	readonly edges: readonly FileEdge[];
}

export interface SubsystemConnectionOut {
	readonly to:     string;
	readonly weight: number;
	readonly kinds:  Readonly<Partial<Record<RelationKind, number>>>;
}

export interface SubsystemGroup {
	readonly id:          string;
	readonly name:        string;
	readonly files:       readonly string[];    // sorted
	readonly connections: readonly SubsystemConnectionOut[];   // sorted by `to`
}

/** The weight of the edge joining two files of one directory: it places a file with no relationships beside its neighbours. */
export const DIRECTORY_EDGE_WEIGHT = 0.1;

/** An edge, without kinds, between every two files of one directory. */
export function directoryEdges(files: readonly string[]): FileEdge[] {
	const byDir = new Map<string, string[]>();
	for (const f of [...files].sort()) {
		const d = dirname(f);
		const list = byDir.get(d);
		if (list === undefined) byDir.set(d, [f]); else list.push(f);
	}
	const out: FileEdge[] = [];
	for (const list of byDir.values()) {
		for (let i = 0; i < list.length; i++) {
			for (let j = i + 1; j < list.length; j++) out.push({ a: list[i]!, b: list[j]!, weight: DIRECTORY_EDGE_WEIGHT, kinds: {} });
		}
	}
	return out;
}

const EPS = 1e-12;

/** Add weight `w` between nodes i and j of a symmetric adjacency (once for a self-loop). */
function addLink(adj: Map<number, number>[], i: number, j: number, w: number): void {
	adj[i]!.set(j, (adj[i]!.get(j) ?? 0) + w);
	if (i !== j) adj[j]!.set(i, (adj[j]!.get(i) ?? 0) + w);
}

/** One level of the graph: nodes 0..n-1, symmetric weights, self-loops allowed. */
interface Level {
	readonly n:   number;
	readonly adj: Map<number, number>[];         // adj[i].get(j): weight between i and j (j === i: self-loop)
}

/** Local moves over one level: the group of each node (renumbered 0.. by first node), and whether any node moved. */
function localMoves(level: Level): { group: number[]; moved: boolean } {
	const { n, adj } = level;
	const degree = adj.map((row, i) => { let k = 0; for (const [j, w] of row) k += j === i ? 2 * w : w; return k; });
	const m2 = degree.reduce((a, b) => a + b, 0);              // twice the total weight
	const group = Array.from({ length: n }, (_v, i) => i);
	if (m2 <= 0) return { group, moved: false };
	const tot = [...degree];
	let moved = false;
	for (let changed = true; changed;) {
		changed = false;
		for (let i = 0; i < n; i++) {
			const own = group[i]!;
			const links = new Map<number, number>();               // group -> weight from i into it (self-loop excluded)
			for (const [j, w] of adj[i]!) if (j !== i) links.set(group[j]!, (links.get(group[j]!) ?? 0) + w);
			tot[own]! -= degree[i]!;
			const gain = (g: number) => (links.get(g) ?? 0) - tot[g]! * degree[i]! / m2;
			let best = own;
			let bestGain = gain(own);
			for (const g of links.keys()) {   // any order: a tie goes to the smaller group
				const v = gain(g);
				if (v > bestGain + EPS || (Math.abs(v - bestGain) <= EPS && g < best)) { best = g; bestGain = v; }
			}
			tot[best]! += degree[i]!;
			if (best !== own) { group[i] = best; changed = true; moved = true; }
		}
	}
	// Renumber groups by their first node, so the next level's order is the files' order.
	const renumber = new Map<number, number>();
	for (const g of group) if (!renumber.has(g)) renumber.set(g, renumber.size);
	return { group: group.map(g => renumber.get(g)!), moved };
}

function aggregate(level: Level, group: readonly number[]): Level {
	const n = Math.max(-1, ...group) + 1;
	const adj = Array.from({ length: n }, () => new Map<number, number>());
	for (let i = 0; i < level.n; i++) {
		for (const [j, w] of level.adj[i]!) {
			if (j < i) continue;                                     // each undirected pair once (self-loops included)
			addLink(adj, group[i]!, group[j]!, w);
		}
	}
	return { n, adj };
}

/** The longest common directory of sorted repo-relative paths; a single file's own path. */
function commonDirectory(files: readonly string[]): string {
	if (files.length === 1) return files[0]!;
	const parts = files.map(f => dirname(f).split('/'));
	const out: string[] = [];
	for (let i = 0; ; i++) {
		const seg = parts[0]![i];
		if (seg === undefined || parts.some(p => p[i] !== seg)) break;
		out.push(seg);
	}
	return out.length === 0 || (out.length === 1 && out[0] === '.') ? '.' : out.join('/');
}

const subsystemId = (files: readonly string[]): string =>
	createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 32);

/** Group the graph's files into subsystems: a partition, the same for the same graph. */
export function groupSubsystems(graph: FileGraph): SubsystemGroup[] {
	const files = [...new Set(graph.files)].sort();
	const index = new Map(files.map((f, i) => [f, i]));
	const adj = files.map(() => new Map<number, number>());
	for (const e of graph.edges) {
		const a = index.get(e.a), b = index.get(e.b);
		if (a === undefined || b === undefined || a === b || !(e.weight > 0)) continue;
		addLink(adj, a, b, e.weight);
	}

	// membership[f]: the current node of file f at the current level.
	let membership = files.map((_f, i) => i);
	let level: Level = { n: files.length, adj };
	for (;;) {
		const { group, moved } = localMoves(level);
		if (!moved) break;
		membership = membership.map(node => group[node]!);
		level = aggregate(level, group);
	}

	const members = new Map<number, string[]>();
	files.forEach((f, i) => {
		const g = membership[i]!;
		const list = members.get(g);
		if (list === undefined) members.set(g, [f]); else list.push(f);
	});
	const idOfFile = new Map<string, string>();
	const groups = [...members.values()].map(list => {
		const id = subsystemId(list);
		for (const f of list) idOfFile.set(f, id);
		return { id, name: commonDirectory(list), files: list };
	});

	const conn = new Map<string, Map<string, { weight: number; kinds: Partial<Record<RelationKind, number>> }>>();
	for (const e of graph.edges) {
		const from = idOfFile.get(e.a), to = idOfFile.get(e.b);
		const kinds = Object.entries(e.kinds) as [RelationKind, number][];
		if (from === undefined || to === undefined || from === to || kinds.length === 0) continue;
		let row = conn.get(from);
		if (row === undefined) { row = new Map(); conn.set(from, row); }
		const c = row.get(to) ?? { weight: 0, kinds: {} };
		c.weight += e.weight;
		for (const [k, v] of kinds) c.kinds[k] = (c.kinds[k] ?? 0) + v;
		row.set(to, c);
	}

	return groups
		.map(g => ({
			...g,
			connections: [...(conn.get(g.id) ?? new Map()).entries()]
				.map(([to, c]) => ({ to, weight: Math.round(c.weight * 1e6) / 1e6, kinds: c.kinds }))
				.sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : 0)),
		}))
		.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
