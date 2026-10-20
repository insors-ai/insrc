/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Prepare's chunk planning (Epic 8315a11f s1, sc3): coherent chunks of whole
 * atoms, each within the limit. Atoms joined by a stronger relation stay
 * together longer: a group too large for one chunk is split along the
 * next-weaker relation kind (calls, then same-file, same-module, references)
 * before single atoms are placed. Each chunk carries a summary of every related
 * atom held in another chunk. Pure: no model call, no I/O.
 */

import { getLogger } from '../../shared/logger.js';
import { AtomTooLargeError } from './pack-into-batches.js';
import { RELATION_PRECEDENCE, type NeighbourSummary, type ReviewAtom, type ReviewChunk, type ReviewMaterial, type ReviewRelation } from './types.js';

const log = getLogger('review-pipeline:prepare');

/** Relation kinds whose cut always keeps a summary on both sides; the others are context. */
export const USAGE_KINDS: ReadonlySet<ReviewRelation['kind']> = new Set(['calls', 'references']);

/** The rendered size of a chunk's call(s) holding `atomIds` with `neighbours`. */
export type ChunkMeasure = (atomIds: readonly string[], neighbours: readonly NeighbourSummary[]) => number;

export interface PlanChunksArgs {
	readonly material:   ReviewMaterial;
	/** The atoms to plan, in any order (default: all); a re-division plans the refused call's. */
	readonly atomIds?:   readonly string[] | undefined;
	readonly measure:    ChunkMeasure;
	/** Pack within `soft`; a unit that cannot be split further may use `hard`. */
	readonly soft:       number;
	readonly hard:       number;
	readonly summaryOf:  (atom: ReviewAtom) => string;
	/** Chunk ids for the planned chunks, in order. */
	readonly nextChunkId: () => string;
	/** Where atoms outside `atomIds` are held (a re-division's sibling chunks). */
	readonly heldElsewhere?: ReadonlyMap<string, string> | undefined;
}

export interface PlannedChunks {
	readonly chunks:         readonly ReviewChunk[];
	/** Relations whose ends landed in different chunks. */
	readonly crossRelations: readonly ReviewRelation[];
}

export function planChunks(args: PlanChunksArgs): PlannedChunks {
	const { material, measure, soft, hard } = args;
	const order = new Map(material.atoms.map((a, i) => [a.id, i] as const));
	const byId = new Map(material.atoms.map(a => [a.id, a] as const));
	const ids = sortByMaterial(args.atomIds ?? material.atoms.map(a => a.id), order);
	if (ids.length === 0) return { chunks: [], crossRelations: [] };
	const inPlan = new Set(ids);
	const related = relatedMap(material.relations);
	// A cut usage relation (a call between symbols, a reference between sections) always
	// keeps its summary on both sides; the summaries of atoms that only share a file or a
	// directory are context, added while they fit.
	const usageRelated = relatedMap(material.relations.filter(r => USAGE_KINDS.has(r.kind)));

	// While sizing, every usage-related atom outside the candidate is a required neighbour.
	const required = (group: readonly string[]): NeighbourSummary[] => neighboursOf(group, usageRelated, byId, args.summaryOf, () => '?');
	const size = (group: readonly string[]): number => measure(group, required(group));

	const units = split(ids, RELATION_PRECEDENCE.length);
	function split(group: readonly string[], level: number): string[][] {
		if (group.length === 1 || size(group) <= soft) return [[...group]];
		if (level === 0) return group.map(id => [id]);
		const kinds = new Set(RELATION_PRECEDENCE.slice(0, level));
		const out: string[][] = [];
		for (const comp of components(group, material.relations.filter(r => kinds.has(r.kind) && inPlan.has(r.from) && inPlan.has(r.to)), order)) {
			out.push(...split(comp, level - 1));
		}
		return out;
	}
	units.sort((a, b) => order.get(a[0]!)! - order.get(b[0]!)!);

	// Whole units, greedily, in material order.
	const packed: string[][] = [];
	let current: string[] = [];
	for (const unit of units) {
		const joined = sortByMaterial([...current, ...unit], order);
		if (current.length > 0 && size(joined) <= soft) { current = joined; continue; }
		if (current.length > 0) packed.push(current);
		if (unit.length === 1 && size(unit) > soft) {
			// One atom: the lower bound is the atom alone, without neighbour lines.
			const alone = measure(unit, []);
			const atom = byId.get(unit[0]!)!;
			if (alone > hard) throw new AtomTooLargeError(atom.label, alone, hard);
		}
		current = [...unit];
	}
	if (current.length > 0) packed.push(current);

	const chunkIds = packed.map(() => args.nextChunkId());
	const holder = new Map<string, string>(args.heldElsewhere ?? []);
	packed.forEach((group, i) => { for (const id of group) holder.set(id, chunkIds[i]!); });
	const chunks: ReviewChunk[] = packed.map((group, i) => {
		const heldIn = (id: string): string => holder.get(id) ?? '';
		let neighbours = neighboursOf(group, usageRelated, byId, args.summaryOf, heldIn);
		const requiredIds = new Set(neighbours.map(n => n.atomId));
		// Context summaries (same file, same directory) while they fit the packing budget.
		for (const extra of neighboursOf(group, related, byId, args.summaryOf, heldIn)) {
			if (requiredIds.has(extra.atomId)) continue;
			if (measure(group, [...neighbours, extra]) <= soft) neighbours = [...neighbours, extra];
		}
		let chars = measure(group, neighbours);
		// Last resort: one atom so large that even its usage summaries do not fit beside it.
		// The atom is never cut; the summaries that do not fit are left out, and logged.
		if (chars > hard) {
			log.warn({ chunk: chunkIds[i], atoms: group, summaries: neighbours.length }, 'review pipeline: a chunk cannot hold all its usage summaries beside its atom; leaving out the ones that do not fit');
			while (chars > hard && neighbours.length > 0) {
				neighbours = neighbours.slice(0, -1);
				chars = measure(group, neighbours);
			}
		}
		return { id: chunkIds[i]!, atomIds: group, neighbours, chars };
	});
	const crossRelations = material.relations.filter(r => inPlan.has(r.from) && inPlan.has(r.to) && holder.get(r.from) !== holder.get(r.to));
	return { chunks, crossRelations };
}

function sortByMaterial(ids: readonly string[], order: ReadonlyMap<string, number>): string[] {
	return [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** Related atom ids per atom, either direction. */
function relatedMap(relations: readonly ReviewRelation[]): Map<string, Set<string>> {
	const m = new Map<string, Set<string>>();
	const add = (a: string, b: string): void => { if (a === b) return; let s = m.get(a); if (s === undefined) m.set(a, s = new Set()); s.add(b); };
	for (const r of relations) { add(r.from, r.to); add(r.to, r.from); }
	return m;
}

/** One summary per related atom outside `group`, in material order of first mention. */
function neighboursOf(
	group: readonly string[], related: ReadonlyMap<string, ReadonlySet<string>>, byId: ReadonlyMap<string, ReviewAtom>,
	summaryOf: (atom: ReviewAtom) => string, heldIn: (id: string) => string,
): NeighbourSummary[] {
	const inGroup = new Set(group);
	const seen = new Set<string>();
	const out: NeighbourSummary[] = [];
	for (const id of group) {
		for (const other of related.get(id) ?? []) {
			if (inGroup.has(other) || seen.has(other)) continue;
			const atom = byId.get(other);
			if (atom === undefined) continue;
			seen.add(other);
			out.push({ atomId: other, label: atom.label, summary: summaryOf(atom), heldInChunk: heldIn(other) });
		}
	}
	return out;
}

/** Connected components of `ids` under `relations` (direction ignored), each in material order. */
function components(ids: readonly string[], relations: readonly ReviewRelation[], order: ReadonlyMap<string, number>): string[][] {
	const parent = new Map(ids.map(id => [id, id] as const));
	const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
	for (const r of relations) {
		if (!parent.has(r.from) || !parent.has(r.to)) continue;
		const a = find(r.from), b = find(r.to);
		if (a !== b) parent.set(b, a);
	}
	const groups = new Map<string, string[]>();
	for (const id of ids) { const root = find(id); const g = groups.get(root); if (g === undefined) groups.set(root, [id]); else g.push(id); }
	return [...groups.values()].map(g => sortByMaterial(g, order)).sort((a, b) => order.get(a[0]!)! - order.get(b[0]!)!);
}
