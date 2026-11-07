/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { TextDecoder } from 'node:util';
import { requireReview } from './contracts.js';
import type { SelectedChange } from './packet.js';
import type { ChangedRange, PinnedBlob, ReviewSources } from './sources.js';
import type { OriginRef, ProjectedEntry, ReviewedSegment } from './final-scope-contracts.js';

/** Not an admitted projection. T3 must verify every replacement against selected
 * later origins and supply witnesses before constructing ReviewProjection. */
export interface IntervalDisposition {
 readonly source: OriginRef;
 readonly sourcePart: ReviewedSegment;
 readonly kind: 'surviving' | 'superseded' | 'deleted';
 readonly finalSegments: readonly ReviewedSegment[];
 readonly replacementSegments: readonly ReviewedSegment[];
}
export interface FileIntervalProjection {
 readonly entry: ProjectedEntry;
 readonly dispositions: readonly IntervalDisposition[];
}
interface Run { oldStart: number; oldEnd: number; newStart: number; newEnd: number; }
const count = (start: number, end: number) => end - start + 1;
function lines(blob: PinnedBlob | null, charge?: (bytes: number) => void): readonly string[] {
 if (blob === null) return [];
 charge?.(blob.bytes.byteLength);
 let text: string;
 try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(blob.bytes); }
 catch { requireReview(false, 'scope_conflict', 'Committed projection source is not UTF-8'); }
 requireReview(!text.includes('\0'), 'scope_conflict', 'Binary source has no textual projection');
 return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}
function span(start: number, end: number): ReviewedSegment { return { after: [start, end] }; }
function anchor(line: number): ReviewedSegment { return { deletionAt: line }; }
function replacement(run: Run): ReviewedSegment {
 return run.newEnd >= run.newStart ? span(run.newStart, run.newEnd) : anchor(run.newStart - 1);
}
/** Merge overlapping ranges only; adjacency alone never grants a missing line. */
export function normalizeProjectedSegments(input: readonly ReviewedSegment[]): readonly ReviewedSegment[] {
 const ranges = input.flatMap(s => 'after' in s ? [[...s.after] as [number, number]] : []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
 const merged: [number, number][] = [];
 for (const range of ranges) {
  requireReview(range.every(Number.isSafeInteger) && range[0] >= 1 && range[1] >= range[0], 'scope_conflict', 'Invalid final interval');
  const prior = merged.at(-1);
  if (prior && range[0] <= prior[1]) prior[1] = Math.max(prior[1], range[1]);
  else merged.push(range);
 }
 const boundaries = [...new Set(input.flatMap(s => 'deletionAt' in s ? [s.deletionAt] : []))].sort((a, b) => a - b);
 requireReview(boundaries.every(n => Number.isSafeInteger(n) && n >= 0), 'scope_conflict', 'Invalid deletion boundary');
 return [...merged.map(([a, b]) => span(a, b)), ...boundaries.map(anchor)];
}
/** Verify the adapter's zero-context runs against BOTH full committed blobs.
 * No matching/fuzzy relocation is attempted when unchanged gaps disagree. */
function verifiedRuns(changes: readonly ChangedRange[], before: readonly string[], after: readonly string[]): readonly Run[] {
 const runs: Run[] = [];
 let oldCursor = 1, newCursor = 1;
 const unchanged = (oldEnd: number, newEnd: number) => {
  requireReview(oldEnd - oldCursor === newEnd - newCursor && oldEnd >= oldCursor && newEnd >= newCursor, 'scope_conflict', 'Unprovable diff offsets');
  for (let i = 0; i < oldEnd - oldCursor; i++) requireReview(before[oldCursor - 1 + i] === after[newCursor - 1 + i], 'scope_conflict', 'Diff omitted changed source');
 };
 for (const change of changes) {
  requireReview(change.before || change.after, 'scope_conflict', 'Diff run has no changed interval');
  for (const side of [change.before, change.after]) if (side) requireReview(side.every(Number.isSafeInteger) && side[0] >= 1 && side[1] >= side[0], 'scope_conflict', 'Malformed diff interval');
  const newStart = change.after?.[0] ?? ((change.deletionAt ?? -2) + 1);
  const oldStart = change.before?.[0] ?? oldCursor + newStart - newCursor;
  const oldEnd = change.before?.[1] ?? oldStart - 1, newEnd = change.after?.[1] ?? newStart - 1;
  requireReview(oldEnd <= before.length && newEnd <= after.length && newStart >= 1, 'scope_conflict', 'Diff exceeds committed source');
  if (change.deletionAt !== undefined) requireReview(!change.after && change.deletionAt === newStart - 1, 'scope_conflict', 'Inconsistent deletion boundary');
  unchanged(oldStart, newStart);
  runs.push({ oldStart, oldEnd, newStart, newEnd });
  oldCursor = oldEnd + 1; newCursor = newEnd + 1;
 }
 unchanged(before.length + 1, after.length + 1);
 return runs;
}

/** Pure partition, exposed within this private subsystem for deterministic tests. */
export function projectIntervals(segments: SelectedChange['segments'], originChangeIndex: number,
 before: readonly string[], after: readonly string[], changes: readonly ChangedRange[], fragment?: () => void): readonly IntervalDisposition[] {
 requireReview(segments.length > 0, 'scope_conflict', `Origin change ${originChangeIndex} has no selected segments`);
 const runs = verifiedRuns(changes, before, after), output: IntervalDisposition[] = [];
 for (const [segmentIndex, segment] of segments.entries()) {
  const source = { changeIndex: originChangeIndex, segmentIndex };
  const add = (sourcePart: ReviewedSegment, kind: IntervalDisposition['kind'], final: ReviewedSegment[], replacements: ReviewedSegment[] = []) => { fragment?.(); output.push({ source, sourcePart, kind, finalSegments: final, replacementSegments: replacements }); };
  requireReview(segment.before === undefined, 'scope_conflict', 'Projection requires reviewed-version selections');
  if (segment.after) {
   const [start, end] = segment.after;
   requireReview(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 1 && end >= start && end <= before.length && segment.deletionAt === undefined, 'scope_conflict', 'Original interval exceeds committed source');
   let cursor = start, delta = 0;
   for (const run of runs) {
    const gapEnd = Math.min(end, run.oldStart - 1);
    if (cursor <= gapEnd) { add(span(cursor, gapEnd), 'surviving', [span(cursor + delta, gapEnd + delta)]); cursor = gapEnd + 1; }
    const overlapStart = Math.max(cursor, run.oldStart), overlapEnd = Math.min(end, run.oldEnd);
    if (overlapStart <= overlapEnd) { add(span(overlapStart, overlapEnd), 'superseded', [], [replacement(run)]); cursor = overlapEnd + 1; }
    delta += count(run.newStart, run.newEnd) - count(run.oldStart, run.oldEnd);
   }
   if (cursor <= end) add(span(cursor, end), 'surviving', [span(cursor + delta, end + delta)]);
  } else {
   const boundary = segment.deletionAt;
   requireReview(boundary !== undefined && Number.isSafeInteger(boundary) && boundary >= 0 && boundary <= before.length, 'scope_conflict', 'Invalid original deletion boundary');
   let delta = 0, replaced: Run | undefined;
   for (const run of runs) {
    // A changed run touching the open boundary has no unique relocation.
    if ((run.oldEnd < run.oldStart && boundary === run.oldStart - 1) || (boundary >= run.oldStart - 1 && boundary <= run.oldEnd)) { replaced = run; break; }
    if (run.oldEnd < boundary) delta += count(run.newStart, run.newEnd) - count(run.oldStart, run.oldEnd);
   }
   if (replaced) add(anchor(boundary), 'superseded', [], [replacement(replaced)]);
   else add(anchor(boundary), 'deleted', [anchor(boundary + delta)]);
  }
 }
 return output;
}

/** T2's committed-blob stage. finalPath must be verified by the T3 lineage
 * caller; this candidate is intentionally not wired into admission on its own. */
export async function projectFileIntervals(origin: SelectedChange, originChangeIndex: number, revision: string,
 finalPath: string, sources: ReviewSources, budget?: { decode(bytes: number): void; fragment(): void }): Promise<FileIntervalProjection> {
 requireReview(origin.segments.length > 0, 'scope_conflict', `Origin change ${originChangeIndex} (${origin.path}) has no selected segments`);
 const final = await sources.file(revision, finalPath);
 const before = lines(origin.after, budget?.decode.bind(budget)), after = lines(final, budget?.decode.bind(budget));
 let changes: readonly ChangedRange[];
 if (origin.after?.oid === final?.oid || (origin.after === null && final === null)) changes = [];
 else {
  changes = await sources.changedRanges(revision, origin.commit, [...new Set([finalPath, origin.path])]);
  requireReview(changes.length > 0, 'scope_conflict', 'Different committed blobs have no verifiable diff');
 }
 const dispositions = projectIntervals(origin.segments, originChangeIndex, before, after, changes, budget?.fragment.bind(budget));
 const active = normalizeProjectedSegments(dispositions.flatMap(d => d.finalSegments));
 return { entry: { originChangeIndex, commit: revision, path: finalPath, after: final, findingScope: active.length ? 'selected' : 'none', segments: active }, dispositions };
}
