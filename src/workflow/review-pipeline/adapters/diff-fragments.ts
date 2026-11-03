import type { ChangedSymbolSummary, CodeReviewGrounding } from '../../code-review/types.js';
import { diffDigest, MAX_DIFF_SPAN_CHARS, splitDiffRow, validateDiffFragments } from '../../code-review/diff-spans.js';
import { AtomTooLargeError } from '../pack-into-batches.js';
import type { ReviewAtom, ReviewMaterial } from '../types.js';

export const isTextDiffRow = (row: ChangedSymbolSummary): boolean => row.diffFragment !== undefined || (row.kind === 'file' && /(^|\n)diff --git /.test(row.signature));

/** Fitting changes only a derived view; the captured parent evidence is immutable. */
export function fitDiffMaterial(
	grounding: CodeReviewGrounding, limitChars: number,
	build: (view: CodeReviewGrounding) => ReviewMaterial,
	measure: (atom: ReviewAtom, material: ReviewMaterial) => number,
): ReviewMaterial {
	if (!Number.isSafeInteger(limitChars) || limitChars <= 0) throw new Error('Invalid complete review input limit');
	validateDiffFragments(grounding.symbols);
	const textParents = new Set(grounding.symbols.filter(isTextDiffRow).map(row => row.diffFragment?.parentId ?? row.entityId));
	const grouped = new Map<string, ChangedSymbolSummary[]>();
	for (const row of grounding.symbols) {
		const key = row.diffFragment?.parentId ?? row.entityId;
		const group = grouped.get(key); if (group === undefined) grouped.set(key, [row]); else group.push(row);
	}
	const originals = [...grouped].map(([id, parts]) => {
		const first = parts[0]!;
		if (first.diffFragment === undefined) return { row: first, oldFile: first.diffOriginalPath ?? first.file };
		const { diffFragment, ...rest } = first;
		return { row: { ...rest, entityId: id, signature: parts.map(p => p.signature).join('') }, oldFile: diffFragment.oldFile };
	});
	const revisionDigest = diffDigest(JSON.stringify({ limitChars, parents: originals.map(({ row }) => [row.entityId, diffDigest(row.signature)]) }));
	const limits = new Map(originals.map(({ row }) => [row.entityId, MAX_DIFF_SPAN_CHARS]));
	for (;;) {
		const symbols = originals.flatMap(({ row, oldFile }) => textParents.has(row.entityId)
			? splitDiffRow(row, oldFile, limits.get(row.entityId)!).map(part => part.diffFragment === undefined ? part : { ...part, entityId: `${part.entityId}:revision:${revisionDigest}` }) : [row]);
		const material = build({ ...grounding, symbols });
		const changed = new Set<string>();
		for (const atom of material.atoms) {
			const chars = measure(atom, material);
			if (chars <= limitChars) continue;
			const row = JSON.parse(atom.text) as ChangedSymbolSummary;
			if (!textParents.has(row.diffFragment?.parentId ?? row.entityId)) throw new AtomTooLargeError(atom.label, chars, limitChars);
			// Sizing-only probe. Never returned, admitted as evidence, or dispatched.
			// Keep the same metadata/context/schema while measuring one complete codepoint.
			const signature = row.signature.length === 0 ? '' : String.fromCodePoint(row.signature.codePointAt(0)!);
			const probe = { ...atom, text: JSON.stringify({ ...row, signature }) };
			const minimum = measure(probe, material);
			const parent = row.diffFragment?.parentId ?? row.entityId;
			const prior = limits.get(parent)!;
			if (minimum > limitChars || prior <= 2) throw new AtomTooLargeError(`${atom.label} (minimum fragment framing)`, minimum > limitChars ? minimum : chars, limitChars);
			changed.add(parent);
		}
		if (changed.size === 0) return material;
		// All offending parents shrink together; no per-fragment rebuild loop.
		for (const parent of changed) limits.set(parent, Math.max(2, Math.floor(limits.get(parent)! / 2)));
	}
}
