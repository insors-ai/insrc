/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { reviewJsonLimit, requireReview } from './contracts.js';
import type { SelectedChange } from './packet.js';
import type { ChangedRange, PinnedBlob, ReviewSources } from './sources.js';
import type { OriginDisposition, OriginRef, ReviewProjection, ReviewedSegment } from './final-scope-contracts.js';
import { projectFileIntervals } from './projection-intervals.js';

const LIMITS = { reads: 10000, fragments: 100000, bytes: 64 * 1024 * 1024, snapshot: 0 };
/** Reduction-only limits support exact boundary qualification, never wider admission. */
export class ProjectionBudget {
 private readonly limits: typeof LIMITS;
 private reads = 0; private fragments = 0; private bytes = 0; private metadataBytes = 0;
 constructor(limits: Partial<typeof LIMITS> = {}) {
  const configured = { ...LIMITS, snapshot: reviewJsonLimit() };
  this.limits = { ...configured, ...limits };
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) requireReview(Number.isSafeInteger(this.limits[key]) && this.limits[key] >= 0 && this.limits[key] <= configured[key], 'projection_limit', 'Invalid projection budget');
 }
 read(): void { requireReview(++this.reads <= this.limits.reads, 'projection_limit', 'Projection object/diff read limit'); }
 fragment(): void { requireReview(++this.fragments <= this.limits.fragments, 'projection_limit', 'Projection fragment limit'); }
 decode(bytes: number): void { this.bytes += bytes; requireReview(this.bytes <= this.limits.bytes, 'projection_limit', 'Projection decoded byte limit'); }
 snapshot(value: unknown): void { requireReview(Buffer.byteLength(JSON.stringify(value)) <= this.limits.snapshot, 'projection_limit', 'Projection snapshot limit'); }
 metadata(value: unknown): void { this.metadataBytes += Buffer.byteLength(JSON.stringify(value)); requireReview(this.metadataBytes <= this.limits.snapshot, 'projection_limit', 'Projection metadata limit'); }
}
/** All callers await these reads serially; cache only successfully verified reads. */
const sourceBudgets = new WeakMap<ReviewSources, ProjectionBudget>();
export function boundedProjectionSources(source: ReviewSources, budget: ProjectionBudget): ReviewSources {
 if (sourceBudgets.get(source) === budget) return source;
 const commits = new Map<string, readonly string[]>(), files = new Map<string, PinnedBlob | null>(), diffs = new Map<string, readonly ChangedRange[]>(), ancestors = new Map<string, boolean>(), histories = new Map<string, readonly string[]>();
 const wrapped: ReviewSources = {
  async commit(oid, field) { if (commits.has(oid)) return commits.get(oid)!; budget.read(); const value = await source.commit(oid, field); commits.set(oid, value); return value; },
  async file(commit, path) { const key = JSON.stringify([commit, path]); if (files.has(key)) return files.get(key)!; budget.read(); const value = await source.file(commit, path); if (value) budget.decode(value.bytes.byteLength); files.set(key, value); return value; },
  async changedRanges(commit, parent, paths) { const key = JSON.stringify([commit, parent, paths]); if (diffs.has(key)) return diffs.get(key)!; budget.read(); const value = await source.changedRanges(commit, parent, paths); diffs.set(key, value); return value; },
  async isAncestor(a, b) { const key = JSON.stringify([a, b]); if (ancestors.has(key)) return ancestors.get(key)!; budget.read(); const value = await source.isAncestor(a, b); ancestors.set(key, value); return value; },
  async pathChanges(from, to, path) { const key = JSON.stringify([from, to, path]); if (histories.has(key)) return histories.get(key)!; budget.read(); const value = await source.pathChanges(from, to, path); histories.set(key, value); return value; },
 };
 sourceBudgets.set(wrapped, budget); return wrapped;
}
function covers(target: ReviewedSegment, scopes: readonly ReviewedSegment[]): boolean {
 if ('deletionAt' in target) return scopes.some(s => 'deletionAt' in s && s.deletionAt === target.deletionAt);
 let cursor = target.after[0];
 const ranges = scopes.flatMap(s => 'after' in s ? [s.after] : []).sort((a, b) => a[0] - b[0]);
 for (const [start, end] of ranges) { if (start > cursor) break; if (end >= cursor) cursor = end + 1; if (cursor > target.after[1]) return true; }
 return false;
}
function intersects(a: ReviewedSegment, b: ReviewedSegment): boolean {
 return 'after' in a && 'after' in b ? a.after[0] <= b.after[1] && b.after[0] <= a.after[1] : 'deletionAt' in a && 'deletionAt' in b && a.deletionAt === b.deletionAt;
}
/** A final blob match cannot hide an unselected delete/move and recreation.
 * Inspect every descendant edge of this path leg, not log's simplified or
 * first-parent-only history. Selected move boundaries start a new leg. */
async function pathContinuity(path: string, from: string, to: string, origins: readonly SelectedChange[], sources: ReviewSources): Promise<void> {
 const pending = [to], seen = new Set<string>();
 while (pending.length) {
  const commit = pending.pop()!;
  if (commit === from || seen.has(commit)) continue;
  seen.add(commit);
  for (const parent of await sources.commit(commit)) {
   if (parent !== from && !await sources.isAncestor(from, parent)) continue;
   const before = await sources.file(parent, path), after = await sources.file(commit, path);
   requireReview(Boolean(before) === Boolean(after) || origins.some(o => o.commit === commit && (o.path === path || o.previousPath === path)), 'scope_conflict', 'Unselected path disappearance or recreation interrupts lineage');
   pending.push(parent);
  }
 }
}
async function finalPath(origin: SelectedChange, origins: readonly SelectedChange[], revision: string, sources: ReviewSources): Promise<string> {
 let path = origin.path, commit = origin.commit;
 const visited = new Set<string>();
 while (true) {
  const moves: SelectedChange[] = [], keys = new Set<string>();
  for (const candidate of origins) {
   const key = JSON.stringify([candidate.commit, candidate.previousPath, candidate.path]);
   if (candidate.previousPath === candidate.path || candidate.previousPath !== path || candidate.commit === commit || keys.has(key) || visited.has(key)) continue;
   if (await sources.isAncestor(commit, candidate.commit) && await sources.isAncestor(candidate.commit, revision)) { moves.push(candidate); keys.add(key); }
  }
  if (!moves.length) { await pathContinuity(path, commit, revision, origins, sources); return path; }
  const first: SelectedChange[] = [];
  for (const move of moves) {
   let preceded = false;
   for (const other of moves) if (other !== move && other.commit !== move.commit && await sources.isAncestor(other.commit, move.commit)) { preceded = true; break; }
   if (!preceded) first.push(move);
  }
  requireReview(first.length === 1, 'scope_conflict', 'Ambiguous selected rename lineage');
  const move = first[0]!;
  requireReview(move.parent !== null && await sources.isAncestor(commit, move.parent), 'scope_conflict', 'Selected move parent does not continue the original lineage');
  if (move.parent !== null) await pathContinuity(path, commit, move.parent, origins, sources);
  requireReview(move.parent !== null && await sources.file(move.parent, path) && await sources.file(move.commit, move.path)
   && !await sources.file(move.commit, path) && !await sources.file(move.parent, move.path), 'scope_conflict', 'Unverified selected path move');
  visited.add(JSON.stringify([move.commit, move.previousPath, move.path])); path = move.path; commit = move.commit;
 }
}
/** Hash excludes blob bodies and redundant identity; shared by offline readers. */
export function projectionIdentity(revision: string, reviewSet: unknown, entries: readonly { originChangeIndex: number; path: string; blobOid: string | null; findingScope: 'selected' | 'none'; segments: readonly ReviewedSegment[] }[], dispositions: readonly OriginDisposition[]): string {
 return createHash('sha256').update(JSON.stringify({ revision, reviewSet, entries, dispositions })).digest('hex');
}
export async function validateProjectionWitnesses(origins: readonly SelectedChange[], dispositions: readonly OriginDisposition[], sources: ReviewSources): Promise<void> {
 for (const d of dispositions) {
  const origin = origins[d.source.changeIndex];
  requireReview(origin && origin.segments[d.source.segmentIndex], 'scope_conflict', 'Unknown source origin');
  requireReview(d.kind !== 'superseded' || d.replacementWitnesses.length > 0, 'scope_conflict', 'Superseded origin has no witness');
  for (const witness of d.replacementWitnesses) {
   const next = origins[witness.changeIndex];
   requireReview(next && next.segments[witness.segmentIndex] && next.commit !== origin.commit && await sources.isAncestor(origin.commit, next.commit), 'scope_conflict', 'Unknown, cyclic or backward replacement witness');
  }
 }
}
export async function projectReviewScope(origins: readonly SelectedChange[], revision: string, source: ReviewSources, budget = new ProjectionBudget()): Promise<ReviewProjection> {
 requireReview(origins.length > 0 && origins.length <= 10000, 'scope_conflict', 'Invalid origin count');
 const sources = boundedProjectionSources(source, budget);
 await sources.commit(revision, 'reviewRevision');
 for (const origin of origins) { await sources.commit(origin.commit); requireReview(await sources.isAncestor(origin.commit, revision), 'reviewRevision.ancestry', 'Origin is not an ancestor of final revision'); }
 const files = [];
 for (const [index, origin] of origins.entries()) {
  const file = await projectFileIntervals(origin, index, revision, await finalPath(origin, origins, revision, sources), sources, budget);
  const e = file.entry;
  budget.metadata({ originChangeIndex: e.originChangeIndex, path: e.path, blobOid: e.after?.oid ?? null, findingScope: e.findingScope, segments: e.segments });
  files.push(file);
 }
 const dispositions: OriginDisposition[] = [];
 for (const file of files) for (const candidate of file.dispositions) {
  const witnesses: OriginRef[] = [], scope: ReviewedSegment[] = [];
  if (candidate.kind === 'superseded') {
   const original = origins[candidate.source.changeIndex]!;
   for (const other of files) {
    const later = origins[other.entry.originChangeIndex]!;
    if (file.entry.path !== other.entry.path || original.commit === later.commit || !await sources.isAncestor(original.commit, later.commit)) continue;
    for (const d of other.dispositions) if (d.kind !== 'superseded' && d.finalSegments.some(s => candidate.replacementSegments.some(r => intersects(r, s)))) {
     if (!witnesses.some(w => w.changeIndex === d.source.changeIndex && w.segmentIndex === d.source.segmentIndex)) { budget.fragment(); witnesses.push(d.source); }
     budget.fragment();
     scope.push(...d.finalSegments);
    }
   }
   requireReview(candidate.replacementSegments.length > 0 && candidate.replacementSegments.every(s => covers(s, scope)), 'scope_conflict', 'Replacement is not completely covered by later submitted origins');
  }
  const disposition = { source: candidate.source, sourcePart: candidate.sourcePart, kind: candidate.kind, finalSegments: [...candidate.finalSegments], replacementWitnesses: witnesses };
  budget.metadata(disposition); dispositions.push(disposition);
 }
 await validateProjectionWitnesses(origins, dispositions, sources);
 const entries = files.map(f => f.entry), metadata = entries.map(e => ({ originChangeIndex: e.originChangeIndex, path: e.path, blobOid: e.after?.oid ?? null, findingScope: e.findingScope, segments: e.segments }));
 // Recreate immutable original review-set identities in stable file-selection order.
 const identities = origins.map(o => ({ commit: o.commit, parent: o.parent, path: o.path, previousPath: o.previousPath, segments: o.segments }));
 const identity = projectionIdentity(revision, identities, metadata, dispositions);
 budget.snapshot({ revision, identities, entries: metadata, dispositions, identity });
 return { revision, entries, dispositions, identity };
}
