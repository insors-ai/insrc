/** Read-only historical review compatibility. No live review execution. */
import { requireReview } from "./contracts.js";
import type { ReviewedSegment } from "./final-scope-contracts.js";
function span(start: number, end: number): ReviewedSegment { return { after: [start, end] }; }
function anchor(line: number): ReviewedSegment { return { deletionAt: line }; }
/** Merge overlapping ranges only; adjacency alone never grants a missing line. */
export function normalizeProjectedSegments(input: readonly ReviewedSegment[]): readonly ReviewedSegment[] {
    const ranges = input.flatMap(s => 'after' in s ? [[...s.after] as [
            number,
            number
        ]] : []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged: [
        number,
        number
    ][] = [];
    for (const range of ranges) {
        requireReview(range.every(Number.isSafeInteger) && range[0] >= 1 && range[1] >= range[0], 'scope_conflict', 'Invalid final interval');
        const prior = merged.at(-1);
        if (prior && range[0] <= prior[1])
            prior[1] = Math.max(prior[1], range[1]);
        else
            merged.push(range);
    }
    const boundaries = [...new Set(input.flatMap(s => 'deletionAt' in s ? [s.deletionAt] : []))].sort((a, b) => a - b);
    requireReview(boundaries.every(n => Number.isSafeInteger(n) && n >= 0), 'scope_conflict', 'Invalid deletion boundary');
    return [...merged.map(([a, b]) => span(a, b)), ...boundaries.map(anchor)];
}
