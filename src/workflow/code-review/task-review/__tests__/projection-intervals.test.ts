/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFileIntervals, projectIntervals, normalizeProjectedSegments } from '../projection-intervals.js';
import { prepareReviewPacket } from '../packet.js';
import type { ReviewSources } from '../sources.js';
import { fixture } from './publication-fixture.js';

const lines = (...s: string[]) => s.map(v => `${v}\n`);
test('all small single-edit intervals preserve exactly the selected surviving line identities', () => {
 const before = lines('original-a', 'original-b', 'original-c', 'original-d');
 for (let editStart = 1; editStart <= 5; editStart++) for (let removed = 0; removed <= 5 - editStart; removed++) for (let added = 0; added <= 2; added++) {
  if (!removed && !added) continue;
  const after = [...before.slice(0, editStart - 1), ...lines(...Array.from({ length: added }, (_, i) => `new-${i}`)), ...before.slice(editStart - 1 + removed)];
  const change = { ...(removed ? { before: [editStart, editStart + removed - 1] as [number, number] } : {}), ...(added ? { after: [editStart, editStart + added - 1] as [number, number] } : { deletionAt: editStart - 1 }) };
  for (let start = 1; start <= 4; start++) for (let end = start; end <= 4; end++) {
   const result = projectIntervals([{ after: [start, end] }], 0, before, after, [change]);
   const partition = result.flatMap(d => 'after' in d.sourcePart ? Array.from({ length: d.sourcePart.after[1] - d.sourcePart.after[0] + 1 }, (_, i) => d.sourcePart.after[0] + i) : []);
   assert.deepEqual(partition, Array.from({ length: end - start + 1 }, (_, i) => start + i));
   const actual = result.flatMap(d => d.finalSegments.flatMap(s => 'after' in s ? after.slice(s.after[0] - 1, s.after[1]) : []));
   const expected = before.slice(start - 1, end).filter(line => after.includes(line));
   assert.deepEqual(actual, expected, JSON.stringify({ editStart, removed, added, start, end }));
  }
 }
});
test('interval projection partitions changed overlaps without granting replacement text', () => {
 const before = lines('a', 'b', 'c', 'd', 'e'), after = lines('a', 'B', 'C', 'd', 'e');
 const selections = [{ after: [1, 4] as [number, number] }], saved = JSON.stringify(selections);
 const result = projectIntervals(selections, 7, before, after, [{ before: [2, 3], after: [2, 3] }]);
 assert.deepEqual(result.map(d => [d.sourcePart, d.kind, d.finalSegments, d.replacementSegments]), [
  [{ after: [1, 1] }, 'surviving', [{ after: [1, 1] }], []],
  [{ after: [2, 3] }, 'superseded', [], [{ after: [2, 3] }]],
  [{ after: [4, 4] }, 'surviving', [{ after: [4, 4] }], []],
 ]);
 assert.ok(result.every(d => d.source.changeIndex === 7 && d.source.segmentIndex === 0));
 assert.equal(JSON.stringify(selections), saved);
 // Whole supersession retains the source partition, but has no active findings.
 const whole = projectIntervals([{ after: [2, 3] }], 0, before, after, [{ before: [2, 3], after: [2, 3] }]);
 assert.equal(whole.length, 1); assert.equal(whole[0]!.kind, 'superseded'); assert.deepEqual(whole[0]!.finalSegments, []);
});

test('interval offsets exclude insertions inside selected spans and support negative shifts', () => {
 const before = lines('a', 'b', 'c'), after = lines('prefix', 'a', 'extra', 'b', 'c');
 const result = projectIntervals([{ after: [1, 3] }], 0, before, after, [{ after: [1, 1] }, { after: [3, 3] }]);
 assert.deepEqual(result.map(d => d.finalSegments), [[{ after: [2, 2] }], [{ after: [4, 5] }]]);
 assert.deepEqual(result.map(d => d.sourcePart), [{ after: [1, 1] }, { after: [2, 3] }]);
 const removed = projectIntervals([{ after: [3, 3] }], 0, before, lines('a', 'c'), [{ before: [2, 2], deletionAt: 1 }]);
 assert.deepEqual(removed[0]!.finalSegments, [{ after: [2, 2] }]);
 const deleted = projectIntervals([{ after: [2, 2] }], 0, before, lines('a', 'c'), [{ before: [2, 2], deletionAt: 1 }]);
 assert.equal(deleted[0]!.kind, 'superseded'); assert.deepEqual(deleted[0]!.replacementSegments, [{ deletionAt: 1 }]);
});

test('normalization retains every origin and never coalesces unselected gaps', () => {
 assert.deepEqual(normalizeProjectedSegments([{ after: [2, 4] }, { after: [3, 5] }, { after: [7, 7] }, { deletionAt: 0 }, { deletionAt: 0 }]), [{ after: [2, 5] }, { after: [7, 7] }, { deletionAt: 0 }]);
 const dispositions = projectIntervals([{ after: [1, 2] }, { after: [2, 3] }], 4, lines('a', 'b', 'c'), lines('a', 'b', 'c'), []);
 assert.deepEqual(dispositions.map(d => d.source), [{ changeIndex: 4, segmentIndex: 0 }, { changeIndex: 4, segmentIndex: 1 }]);
 assert.deepEqual(normalizeProjectedSegments(dispositions.flatMap(d => d.finalSegments)), [{ after: [1, 3] }]);
});

test('deletion anchors preserve empty-file zero and mark touched boundaries for witness verification', () => {
 assert.deepEqual(projectIntervals([{ deletionAt: 0 }], 0, [], [], [])[0]!.finalSegments, [{ deletionAt: 0 }]);
 const shifted = projectIntervals([{ deletionAt: 3 }], 0, lines('a', 'b', 'c', 'd'), lines('prefix', 'a', 'b', 'c', 'd'), [{ after: [1, 1] }]);
 assert.deepEqual(shifted[0]!.finalSegments, [{ deletionAt: 4 }]);
 const touched = projectIntervals([{ deletionAt: 1 }], 0, lines('a', 'b'), lines('a', 'insert', 'b'), [{ after: [2, 2] }]);
 assert.equal(touched[0]!.kind, 'superseded'); assert.deepEqual(touched[0]!.finalSegments, []);
 assert.deepEqual(touched[0]!.replacementSegments, [{ after: [2, 2] }]);
 assert.throws(() => projectIntervals([{ deletionAt: 3 }], 0, lines('a'), lines('a'), []), /scope_conflict/);
});

test('committed projection uses identical-blob fast path and ignores HEAD/worktree changes', async () => {
 const f = await fixture();
 try {
  const prepared = await prepareReviewPacket(f.packet, f.deps.sources), origin = prepared.changes[0]!;
  let diffs = 0;
  const sources: ReviewSources = { commit: f.deps.sources.commit.bind(f.deps.sources), isAncestor: f.deps.sources.isAncestor.bind(f.deps.sources), file: f.deps.sources.file.bind(f.deps.sources), changedRanges: async (...args) => { diffs++; return f.deps.sources.changedRanges(...args); } };
  const identity = await projectFileIntervals(origin, 0, origin.commit, origin.path, sources);
  assert.equal(diffs, 0); assert.deepEqual(identity.entry.segments, [{ after: [1, 1] }]);
  f.put('source.js', 'UNSELECTED_PREFIX\nexport const total = 2;\n'); f.git('add', 'source.js'); f.git('commit', '-qm', 'shift selected line');
  const revision = f.git('rev-parse', 'HEAD');
  f.git('checkout', '--detach', '-q', origin.commit); f.put('source.js', 'WORKTREE_CANARY\n');
  const shifted = await projectFileIntervals(origin, 0, revision, origin.path, sources);
  assert.equal(diffs, 1); assert.equal(shifted.entry.commit, revision); assert.equal(shifted.entry.originChangeIndex, 0);
  assert.deepEqual(shifted.entry.segments, [{ after: [2, 2] }]);
  assert.equal(Buffer.from(shifted.entry.after!.bytes).toString(), 'UNSELECTED_PREFIX\nexport const total = 2;\n');
  assert.equal(Buffer.from(origin.after!.bytes).toString(), 'export const total = 2;\n');
 } finally { f.cleanup(); }
});

test('projection refuses malformed or omitted changes, invalid UTF-8 and binary sources without invented partitions', async () => {
 assert.throws(() => projectIntervals([{ after: [1, 1] }], 0, lines('a'), lines('changed'), []), /scope_conflict/);
 assert.throws(() => projectIntervals([{ after: [1, 1] }], 0, lines('a'), lines('a'), [{ before: [2, 2], deletionAt: 0 }]), /scope_conflict/);
 assert.throws(() => projectIntervals([], 0, lines('a'), lines('a'), []), /scope_conflict/);
 assert.throws(() => normalizeProjectedSegments([{ after: [2, 1] }]), /scope_conflict/);
 const f = await fixture();
 try {
  const origin = (await prepareReviewPacket(f.packet, f.deps.sources)).changes[0]!;
  for (const bytes of [new Uint8Array([255]), new Uint8Array([0])]) {
   let diffs = 0;
   const sources: ReviewSources = { commit: f.deps.sources.commit.bind(f.deps.sources), isAncestor: f.deps.sources.isAncestor.bind(f.deps.sources), file: async () => ({ bytes, oid: 'f'.repeat(40) }), changedRanges: async () => { diffs++; return []; } };
   await assert.rejects(projectFileIntervals(origin, 0, origin.commit, origin.path, sources), /scope_conflict/);
   assert.equal(diffs, 0);
  }
 } finally { f.cleanup(); }
});
