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

import { posix } from 'node:path';

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
export function codeReviewMaterial(grounding: CodeReviewGrounding): ReviewMaterial {
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
		const [a, b] = from < to ? [from, to] : [to, from];
		const key = `${kind}:${a}:${b}`;
		if (seenPair.has(key)) return;
		seenPair.add(key);
		relations.push({ from, to, kind });
	};

	// Calls: B is among A's callees, or A among B's callers. A name matching several rows relates to each.
	const idsByName = new Map<string, string[]>();
	for (const row of grounding.symbols) idsByName.set(row.name, [...(idsByName.get(row.name) ?? []), row.entityId]);
	for (const row of grounding.symbols) {
		for (const callee of row.callees) for (const id of idsByName.get(callee) ?? []) relate(row.entityId, id, 'calls');
		for (const caller of row.callers) for (const id of idsByName.get(caller) ?? []) relate(id, row.entityId, 'calls');
	}
	// Same file, then same directory.
	for (let i = 0; i < atoms.length; i++) {
		for (let j = i + 1; j < atoms.length; j++) {
			const a = atoms[i]!, b = atoms[j]!;
			if (a.file === b.file) relate(a.id, b.id, 'same-file');
			if (a.module === b.module) relate(a.id, b.id, 'same-module');
		}
	}
	return { atoms, relations, obligations: [] };
}
