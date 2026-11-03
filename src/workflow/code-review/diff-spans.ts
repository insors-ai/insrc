import { createHash } from 'node:crypto';
import type { ChangedSymbolSummary, DiffFragment, DiffPosition } from './types.js';

export const MAX_DIFF_SPAN_CHARS = 16 * 1024;
export const diffDigest = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Positions use one-based UTF16 columns; offsets are zero-based and half-open. */
function positions(text: string): (offset: number) => DiffPosition {
	const starts: number[] = [];
	const sides: { old?: number; next?: number }[] = [];
	let offset = 0, old: number | undefined, next: number | undefined;
	while (offset <= text.length) {
		starts.push(offset);
		const newline = text.indexOf('\n', offset);
		const line = text.slice(offset, newline < 0 ? text.length : newline);
		const hunk = /^@@ -([0-9]+)(?:,[0-9]+)? \+([0-9]+)(?:,[0-9]+)? @@/.exec(line);
		if (line.startsWith('diff --git ')) { old = undefined; next = undefined; }
		if (hunk !== null) {
			old = Number(hunk[1]); next = Number(hunk[2]); sides.push({});
		} else if (old !== undefined && next !== undefined && /^[ +\-]/.test(line)) {
			const entry = { ...(line[0] !== '+' ? { old } : {}), ...(line[0] !== '-' ? { next } : {}) };
			sides.push(entry);
			if (line[0] !== '+') old++;
			if (line[0] !== '-') next++;
		} else sides.push({});
		if (newline < 0) break;
		offset = newline + 1;
	}
	return value => {
		let lo = 0, hi = starts.length - 1;
		while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (starts[mid]! <= value) lo = mid; else hi = mid - 1; }
		const column = value - starts[lo]! + 1;
		const side = sides[lo]!;
		return { line: lo + 1, column,
			...(side.old !== undefined ? { oldLine: side.old, oldColumn: Math.max(1, column - 1) } : {}),
			...(side.next !== undefined ? { newLine: side.next, newColumn: Math.max(1, column - 1) } : {}) };
	};
}

/** Split only at Unicode boundaries, preferring complete diff lines. Never trim. */
export function splitDiffRow(row: ChangedSymbolSummary, oldFile = row.file, maxChars = MAX_DIFF_SPAN_CHARS): ChangedSymbolSummary[] {
	if (!Number.isSafeInteger(maxChars) || maxChars < 2) throw new Error('Diff span limit must be an integer of at least two UTF16 units');
	if (row.diffFragment !== undefined) throw new Error('Repartition from the original parent evidence, not a fragment');
	const text = row.signature;
	if (text.length <= maxChars && row.diffFragment === undefined) return [row];
	const ranges: [number, number][] = [];
	for (let start = 0; start < text.length;) {
		let end = Math.min(text.length, start + maxChars);
		if (end < text.length) {
			const newline = text.lastIndexOf('\n', end - 1);
			if (newline >= start) end = newline + 1;
			if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]!) && /[\uDC00-\uDFFF]/.test(text[end]!)) end--;
		}
		ranges.push([start, end]); start = end;
	}
	const at = positions(text), parentDigest = diffDigest(text);
	return ranges.map(([startOffset, endOffset], index) => {
		const signature = text.slice(startOffset, endOffset);
		const diffFragment: DiffFragment = { parentId: row.entityId, oldFile, newFile: row.file,
			index, count: ranges.length, startOffset, endOffset, parentLength: text.length,
			parentDigest, contentDigest: diffDigest(signature), start: at(startOffset), end: at(endOffset) };
		return { ...row, entityId: `${row.entityId}:span:${startOffset}-${endOffset}:${parentDigest}`, signature, diffFragment };
	});
}

const positionKeys = ['line', 'column', 'oldLine', 'oldColumn', 'newLine', 'newColumn'] as const;
const samePosition = (a: DiffPosition, b: DiffPosition): boolean => positionKeys.every(key => a[key] === b[key]);

/** Every parent must be a complete, ordered, attributable partition of the captured text. */
export function validateDiffFragments(rows: readonly ChangedSymbolSummary[]): void {
	const parents = new Map<string, ChangedSymbolSummary[]>();
	for (const row of rows) {
		const meta = row.diffFragment;
		if (meta === undefined) continue;
		const group = parents.get(meta.parentId); if (group === undefined) parents.set(meta.parentId, [row]); else group.push(row);
	}
	for (const [parentId, group] of parents) {
		const first = group[0]!.diffFragment!, text = group.map(row => row.signature).join(''), at = positions(text);
		let cursor = 0;
		const ids = new Set<string>();
		for (const [index, row] of group.entries()) {
			const m = row.diffFragment!;
			const cutsSurrogate = m.startOffset > 0 && /[\uD800-\uDBFF]/.test(text[m.startOffset - 1] ?? '') && /[\uDC00-\uDFFF]/.test(text[m.startOffset] ?? '');
			if (cutsSurrogate || ids.has(row.entityId) || m.parentId !== parentId || m.index !== index || m.count !== group.length
				|| !Number.isSafeInteger(m.startOffset) || !Number.isSafeInteger(m.endOffset) || m.startOffset !== cursor || m.endOffset <= m.startOffset
				|| m.endOffset - m.startOffset !== row.signature.length || m.newFile !== row.file || m.oldFile !== first.oldFile
				|| m.parentDigest !== first.parentDigest || m.parentLength !== text.length || m.contentDigest !== diffDigest(row.signature)
				|| !samePosition(m.start, at(m.startOffset)) || !samePosition(m.end, at(m.endOffset))) {
				throw new Error(`Invalid diff fragment provenance for ${parentId}`);
			}
			ids.add(row.entityId); cursor = m.endOffset;
		}
		if (cursor !== text.length || diffDigest(text) !== first.parentDigest) throw new Error(`Incomplete diff fragment evidence for ${parentId}`);
	}
}
