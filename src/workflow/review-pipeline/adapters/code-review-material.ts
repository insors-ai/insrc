/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The code review's material (Epic 8315a11f s2): a dimension's grounding as
 * whole atoms and the relations s1's prepare groups them by. Each changed
 * symbol is one atom; symbols are related when one calls the other (matched by
 * name, the grounding holds names only), when they share a file and when they
 * share a directory. Pure: built from the job's snapshot, never re-queried.
 */

import { parentQualityObligations } from './diff-parent-evidence.js';
import { posix } from 'node:path';

import { validateDiffFragments } from '../../code-review/diff-spans.js';
import type { CodeReviewGrounding } from '../../code-review/types.js';
import type { ReviewAtom, ReviewMaterial, ReviewRelation } from '../types.js';

/** A changed symbol's directory; a file at the repository root is in module '.'. */
export function moduleOf(file: string): string {
	return posix.dirname(file);
}

/**
 * The material for one dimension's prepared grounding (for coverage, the output
 * of prepareCoverageGrounding). Atoms keep the grounding's order; obligations and
 * context are the dimension's own (Story s3). Throws when two rows share an
 * entityId: carries and provenance would be ambiguous.
 */
export function codeReviewMaterial(grounding: CodeReviewGrounding, opts?: { readonly parentQuality?: boolean }): ReviewMaterial {
	validateDiffFragments(grounding.symbols);
	const atoms: ReviewAtom[] = [];
	const labelById = new Map<string, string>();
	for (const row of grounding.symbols) {
		const label = `${row.file}#${row.name}`;
		const seen = labelById.get(row.entityId);
		if (seen !== undefined) {
			throw new Error(`code review material: entityId ${row.entityId} appears twice in the grounding (${seen} and ${label})`);
		}
		labelById.set(row.entityId, label);
		atoms.push({ id: row.entityId, label, text: JSON.stringify(row), file: row.file, module: moduleOf(row.file) });
	}

	const relations: ReviewRelation[] = [];
	const seenPair = new Set<string>();
	const relate = (from: string, to: string, kind: ReviewRelation['kind']): void => {
		if (from === to) return;
		// A call has a direction: A calling B and B calling A are two relations, each checked on its
		// own caller's side when cut (s3). Same file and same module are symmetric: one relation per pair.
		const [a, b] = kind === 'calls' || from < to ? [from, to] : [to, from];
		// Ids can hold any character (a diff row's id is its path): an unambiguous key, never a joined string.
		const key = JSON.stringify([kind, a, b]);
		if (seenPair.has(key)) return;
		seenPair.add(key);
		relations.push({ from, to, kind });
	};

	// Calls: B is among A's callees, or A among B's callers. A name matching several rows relates to each.
	const idsByName = new Map<string, string[]>();
	// Appended in place: copying the bucket per row was quadratic in a repeated name.
	for (const row of grounding.symbols) { if (row.diffFragment !== undefined) continue; const ids = idsByName.get(row.name); if (ids === undefined) idsByName.set(row.name, [row.entityId]); else ids.push(row.entityId); }
	for (const row of grounding.symbols) {
		if (row.diffFragment !== undefined) continue;
		for (const callee of row.callees) for (const id of idsByName.get(callee) ?? []) relate(row.entityId, id, 'calls');
		for (const caller of row.callers) for (const id of idsByName.get(caller) ?? []) relate(id, row.entityId, 'calls');
	}
	// Same file, then same directory. Only atoms of one directory can relate, so
	// each atom is paired with the later atoms of its own directory, in index order:
	// the same relations, in the same order, as pairing every atom with every later
	// one (ISSUE-e940023a: that was quadratic in the whole material).
	// Every atom built above carries its module; the key only satisfies the type.
	const moduleKey = (a: ReviewAtom): string => a.module ?? '';
	const byModule = new Map<string, number[]>();
	const siblings = new Map<string, ReviewAtom[]>();
	const representatives: number[] = [];
	grounding.symbols.forEach((row, i) => {
		const parent = row.diffFragment?.parentId;
		if (parent === undefined) { representatives.push(i); return; }
		const group = siblings.get(parent);
		if (group === undefined) { siblings.set(parent, [atoms[i]!]); representatives.push(i); }
		else group.push(atoms[i]!);
	});
	for (const group of siblings.values()) for (let i = 1; i < group.length; i++) {
		relate(group[i - 1]!.id, group[i]!.id, 'same-file');
		relate(group[i - 1]!.id, group[i]!.id, 'same-module');
	}
	representatives.forEach(i => { const a = atoms[i]!; const g = byModule.get(moduleKey(a)); if (g === undefined) byModule.set(moduleKey(a), [i]); else g.push(i); });
	const place = new Map<number, number>();
	for (const g of byModule.values()) g.forEach((i, k) => place.set(i, k));
	for (const i of representatives) {
		const a = atoms[i]!;
		const group = byModule.get(moduleKey(a))!;
		for (let k = place.get(i)! + 1; k < group.length; k++) {
			const b = atoms[group[k]!]!;
			if (a.file === b.file) relate(a.id, b.id, 'same-file');
			relate(a.id, b.id, 'same-module');
		}
	}
	return { atoms, relations, obligations: opts?.parentQuality === true ? parentQualityObligations(grounding.symbols) : [] };
}

/** The longest first signature line a neighbour summary carries. */
export const NEIGHBOUR_SIGNATURE_CHARS = 200;

/**
 * One deterministic line, with no model call, describing a changed symbol held
 * in another chunk: `<kind> <name> in <file>: <first signature line, at most 200
 * characters>; calls: <related changed callees>; called by: <related changed
 * callers>`. Only this line is shortened: the symbol itself is reviewed whole in
 * the chunk that holds it. The related names are those of the material's 'calls'
 * relations, so only changed symbols are named; 'none' when there are none.
 */
export function neighbourSummary(atom: ReviewAtom, material: ReviewMaterial): string {
	const row = JSON.parse(atom.text) as { kind: string; name: string; file: string; signature: string };
	const { nameOf, callees, callers } = indexOf(material);
	const names = (ids: readonly string[]): string => {
		const unique = [...new Set(ids.map(id => nameOf.get(id)).filter((n): n is string => n !== undefined))];
		return unique.length === 0 ? 'none' : unique.join(', ');
	};
	const firstLine = (row.signature.split('\n')[0] ?? '').slice(0, NEIGHBOUR_SIGNATURE_CHARS);
	return `${row.kind} ${row.name} in ${row.file}: ${firstLine}; calls: ${names(callees.get(atom.id) ?? [])}; called by: ${names(callers.get(atom.id) ?? [])}`;
}

/** What neighbourSummary reads from a material, built once per material: the
 *  pipeline summarises one neighbour at a time, and rebuilding this on every call
 *  made summarising a material quadratic in its size (ISSUE-e940023a). Keyed on
 *  the atoms and relations arrays, which a material never changes after it is
 *  built, so a copy of a material with other obligations shares the index. */
interface MaterialIndex {
	readonly nameOf:  ReadonlyMap<string, string>;
	/** Per atom, the ids its 'calls' relations reach, in relation order. */
	readonly callees: ReadonlyMap<string, readonly string[]>;
	/** Per atom, the ids whose 'calls' relations reach it, in relation order. */
	readonly callers: ReadonlyMap<string, readonly string[]>;
}

const nameIndex = new WeakMap<readonly ReviewAtom[], ReadonlyMap<string, string>>();
const callIndex = new WeakMap<readonly ReviewRelation[], Pick<MaterialIndex, 'callees' | 'callers'>>();

function indexOf(material: ReviewMaterial): MaterialIndex {
	let nameOf = nameIndex.get(material.atoms);
	if (nameOf === undefined) {
		nameOf = new Map(material.atoms.map(a => [a.id, (JSON.parse(a.text) as { name: string }).name] as const));
		nameIndex.set(material.atoms, nameOf);
	}
	let calls = callIndex.get(material.relations);
	if (calls === undefined) {
		const callees = new Map<string, string[]>();
		const callers = new Map<string, string[]>();
		const add = (m: Map<string, string[]>, k: string, v: string): void => { const l = m.get(k); if (l === undefined) m.set(k, [v]); else l.push(v); };
		for (const r of material.relations) {
			if (r.kind !== 'calls') continue;
			add(callees, r.from, r.to);
			add(callers, r.to, r.from);
		}
		calls = { callees, callers };
		callIndex.set(material.relations, calls);
	}
	return { nameOf, ...calls };
}
