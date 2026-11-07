/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { renameSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './publication-fixture.js';
import { prepareReviewPacket } from '../packet.js';
import { projectReviewScope, ProjectionBudget, validateProjectionWitnesses } from '../projection.js';
import { normalizeProjectedSegments } from '../projection-intervals.js';
import { TaskReviewInputError, MAX_REVIEW_JSON_BYTES } from '../contracts.js';
import type { ReviewPacket } from '../contracts.js';
import type { ReviewSources } from '../sources.js';
import { buildDiffArgv, buildStatArgv, gitDiffTool } from '../../../../daemon/tools/builtins/git/diff.js';
import { checkpointPath } from '../checkpoint.js';
import { TaskReviewCoordinator } from '../coordinator.js';

async function fixedFixture() {
 const f = await fixture(); const parent = f.packet.reviewSet[0]!.commit;
 f.put('source.js', 'export const total = 3;\n'); f.git('add', 'source.js'); f.git('commit', '-qm', 'selected later fix');
 const revision = f.git('rev-parse', 'HEAD');
 const packet: ReviewPacket = { ...f.packet, reviewRevision: revision, reviewSet: [...f.packet.reviewSet, { commit: revision, parent, files: [{ path: 'source.js', segments: [{ after: [1, 1] }] }] }] };
 return { ...f, revision, packet };
}
test('selected later witnesses justify complete supersession and immutable origin accounting', async () => {
 const f = await fixedFixture(); try {
  const origins = (await prepareReviewPacket(f.packet, f.deps.sources)).changes, bytes = JSON.stringify(origins);
  const result = await projectReviewScope(origins, f.revision, f.deps.sources);
  assert.equal(result.entries.length, 2); assert.equal(result.entries[0]!.findingScope, 'none'); assert.deepEqual(result.entries[0]!.segments, []);
  assert.deepEqual(result.dispositions[0]!.replacementWitnesses, [{ changeIndex: 1, segmentIndex: 0 }]);
  assert.deepEqual(result.entries[1]!.segments, [{ after: [1, 1] }]);
  for (const entry of result.entries) assert.deepEqual(entry.segments, normalizeProjectedSegments(result.dispositions.filter(d => d.source.changeIndex === entry.originChangeIndex && d.kind !== 'superseded').flatMap(d => d.finalSegments)));
  assert.equal(JSON.stringify(origins), bytes);
  await assert.rejects(projectReviewScope(origins.slice(0, 1), f.revision, f.deps.sources), /scope_conflict/);
  for (const replacementWitnesses of [[{ changeIndex: 99, segmentIndex: 0 }], [{ changeIndex: 0, segmentIndex: 0 }]]) {
   await assert.rejects(validateProjectionWitnesses(origins, [{ ...result.dispositions[0]!, replacementWitnesses }], f.deps.sources), /scope_conflict/);
  }
  await assert.rejects(validateProjectionWitnesses(origins, [{ ...result.dispositions[0]!, source: { changeIndex: 1, segmentIndex: 0 }, replacementWitnesses: [{ changeIndex: 0, segmentIndex: 0 }] }], f.deps.sources), /scope_conflict/);
 } finally { f.cleanup(); }
});

test('partial replacement witnesses must cover the entire changed target and deletions retain explicit witnesses', async () => {
 const f = await fixture(); try {
  const base = f.packet.reviewSet[0]!.commit;
  f.put('source.js', 'a\nb\nc\nd\n'); f.git('add', '.'); f.git('commit', '-qm', 'selected original interval'); const origin = f.git('rev-parse', 'HEAD');
  f.put('source.js', 'a\nB\nC\nd\n'); f.git('add', '.'); f.git('commit', '-qm', 'partial replacement'); const revision = f.git('rev-parse', 'HEAD');
  const packet: ReviewPacket = { ...f.packet, reviewRevision: revision, reviewSet: [
   { commit: origin, parent: base, files: [{ path: 'source.js', segments: [{ after: [1, 4] }] }] },
   { commit: revision, parent: origin, files: [{ path: 'source.js', segments: [{ after: [2, 3] }] }] }] };
  const result = await projectReviewScope((await prepareReviewPacket(packet, f.deps.sources)).changes, revision, f.deps.sources);
  assert.deepEqual(result.entries[0]!.segments, [{ after: [1, 1] }, { after: [4, 4] }]);
  assert.deepEqual(result.dispositions.find(d => d.kind === 'superseded')!.replacementWitnesses, [{ changeIndex: 1, segmentIndex: 0 }]);
  packet.reviewSet[1]!.files[0]!.segments = [{ after: [2, 2] }];
  await assert.rejects(projectReviewScope((await prepareReviewPacket(packet, f.deps.sources)).changes, revision, f.deps.sources), /scope_conflict/);
  f.git('rm', 'source.js'); f.git('commit', '-qm', 'selected whole deletion'); const deleted = f.git('rev-parse', 'HEAD');
  packet.reviewRevision = deleted; packet.reviewSet[1] = { commit: deleted, parent: revision, files: [{ path: 'source.js', segments: [{ deletionAt: 0 }] }] };
  const deletion = await projectReviewScope((await prepareReviewPacket(packet, f.deps.sources)).changes, deleted, f.deps.sources);
  assert.equal(deletion.entries[0]!.findingScope, 'none'); assert.equal(deletion.entries[1]!.after, null);
  assert.deepEqual(deletion.entries[1]!.segments, [{ deletionAt: 0 }]);
 } finally { f.cleanup(); }
});

test('selected rename chains compare exact blobs independently of rename similarity and reject unselected moves', async () => {
 const f = await fixture(); try {
  const first = f.packet.reviewSet[0]!.commit;
  renameSync(join(f.repo, 'source.js'), join(f.repo, 'moved.js')); f.put('moved.js', 'completely different selected replacement\n');
  f.git('add', '.'); f.git('commit', '-qm', 'selected rename with zero similarity'); const move = f.git('rev-parse', 'HEAD');
  renameSync(join(f.repo, 'moved.js'), join(f.repo, 'final.js')); f.put('final.js', 'final selected replacement\n');
  f.git('add', '.'); f.git('commit', '-qm', 'second selected rename'); const revision = f.git('rev-parse', 'HEAD');
  const packet: ReviewPacket = { ...f.packet, reviewRevision: revision, reviewSet: [...f.packet.reviewSet,
   { commit: move, parent: first, files: [{ path: 'moved.js', previousPath: 'source.js', segments: [{ after: [1, 1] }] }] },
   { commit: revision, parent: move, files: [{ path: 'final.js', previousPath: 'moved.js', segments: [{ after: [1, 1] }] }] }] };
  const origins = (await prepareReviewPacket(packet, f.deps.sources)).changes;
  await assert.rejects(projectReviewScope(origins, revision, f.deps.sources, new ProjectionBudget({ bytes: 0 })), error => error instanceof TaskReviewInputError && error.field === 'projection_limit', 'rename verification blobs consume the cumulative budget');
  const result = await projectReviewScope(origins, revision, f.deps.sources);
  assert.deepEqual(result.entries.map(e => e.path), ['final.js', 'final.js', 'final.js']);
  assert.deepEqual(result.entries.map(e => e.findingScope), ['none', 'none', 'selected']);
  await assert.rejects(projectReviewScope(origins.slice(0, 1), revision, f.deps.sources), /scope_conflict/);
  const fake = [...origins]; fake[1] = { ...fake[1]!, previousPath: 'source.js', path: 'not-a-move.js' };
  await assert.rejects(projectReviewScope(fake, revision, f.deps.sources), /scope_conflict/);
 } finally { f.cleanup(); }
});

test('unselected merge resolution rejects and explicit selected merge replacement supplies the witness', async () => {
 const f = await fixture(); try {
  const base = f.packet.reviewSet[0]!.commit;
  f.git('checkout', '-qb', 'side'); f.put('source.js', 'side\n'); f.git('add', '.'); f.git('commit', '-qm', 'side change');
  f.git('checkout', '--detach', '-q', base); f.put('source.js', 'main\n'); f.git('add', '.'); f.git('commit', '-qm', 'main change'); const main = f.git('rev-parse', 'HEAD');
  try { f.git('merge', '--no-ff', '--no-commit', 'side'); } catch { /* expected content conflict */ }
  f.put('source.js', 'resolved final\n'); f.git('add', '.'); f.git('commit', '-qm', 'explicit resolution'); const revision = f.git('rev-parse', 'HEAD');
  const packet: ReviewPacket = { ...f.packet, reviewRevision: revision, reviewSet: [...f.packet.reviewSet, { commit: main, parent: base, files: [{ path: 'source.js', segments: [{ after: [1, 1] }] }] }] };
  const originals = (await prepareReviewPacket(packet, f.deps.sources)).changes;
  await assert.rejects(projectReviewScope(originals, revision, f.deps.sources), /scope_conflict/);
  packet.reviewSet.push({ commit: revision, parent: main, files: [{ path: 'source.js', segments: [{ after: [1, 1] }] }] });
  const result = await projectReviewScope((await prepareReviewPacket(packet, f.deps.sources)).changes, revision, f.deps.sources);
  assert.equal(result.entries[2]!.findingScope, 'selected'); assert.equal(result.entries[0]!.findingScope, 'none');
 } finally { f.cleanup(); }
});

test('competing selected path moves fail instead of choosing a rename by array order', async () => {
 const f = await fixture(); try {
  const base = f.packet.reviewSet[0]!.commit;
  f.git('rm', 'source.js'); f.put('a.js', 'selected a\n'); f.put('b.js', 'selected b\n'); f.git('add', '.'); f.git('commit', '-qm', 'ambiguous move destinations'); const revision = f.git('rev-parse', 'HEAD');
  const packet: ReviewPacket = { ...f.packet, reviewRevision: revision, reviewSet: [...f.packet.reviewSet, { commit: revision, parent: base, files: ['a.js', 'b.js'].map(path => ({ path, previousPath: 'source.js', segments: [{ after: [1, 1] }] })) }] };
  const origins = (await prepareReviewPacket(packet, f.deps.sources)).changes;
  await assert.rejects(projectReviewScope(origins, revision, f.deps.sources), /Ambiguous selected rename/);
  await assert.rejects(projectReviewScope([origins[0]!, origins[2]!, origins[1]!], revision, f.deps.sources), /Ambiguous selected rename/);
 } finally { f.cleanup(); }
});

test('identical final blobs cannot hide an unselected rename-away and recreation', async () => {
 const f = await fixture(); try {
  const initial = f.packet.reviewSet[0]!.commit;
  renameSync(join(f.repo, 'source.js'), join(f.repo, 'other.js')); f.git('add', '.'); f.git('commit', '-qm', 'unselected rename away');
  f.put('source.js', 'export const total = 2;\n'); f.git('add', '.'); f.git('commit', '-qm', 'unselected recreation'); const revision = f.git('rev-parse', 'HEAD');
  assert.equal(f.git('rev-parse', `${initial}:source.js`), f.git('rev-parse', `${revision}:source.js`));
  const packet = { ...f.packet, reviewRevision: revision };
  await assert.rejects(projectReviewScope((await prepareReviewPacket(packet, f.deps.sources)).changes, revision, f.deps.sources), /Unselected path disappearance or recreation/);
 } finally { f.cleanup(); }
});

test('typed blob diff mode requires both objects and cannot fall back to HEAD or the working tree', async () => {
 assert.deepEqual(buildDiffArgv({ objectPair: true, from: 'a:file', to: 'b:moved', context: 0 }).argv, ['git', 'diff', '--no-color', '-U0', 'a:file', 'b:moved']);
 assert.deepEqual(buildStatArgv({ objectPair: true, from: 'a:file', to: 'b:moved' }), ['git', 'diff', '--no-color', '--numstat', '-z', 'a:file', 'b:moved']);
 for (const extra of [{ from: 'a' }, { from: 'a', to: 'b', paths: ['file'] }, { from: 'a', to: 'b', staged: true }, { from: 'a', to: 'b', againstWorktree: true }]) assert.equal((await gitDiffTool.execute({ objectPair: true, ...extra })).success, false);
});

test('projection budgets refuse before exceeding limits, preserve source fields and use serial reads', async () => {
 const f = await fixedFixture(); try {
  const origins = (await prepareReviewPacket(f.packet, f.deps.sources)).changes;
  const checkpoint = checkpointPath(f.repo, 'publication'), saved = readFileSync(checkpoint, 'utf8');
  for (const limits of [{ reads: 0 }, { bytes: 1 }, { fragments: 0 }, { snapshot: 1 }]) {
   await assert.rejects(projectReviewScope(origins, f.revision, f.deps.sources, new ProjectionBudget(limits)), error => error instanceof TaskReviewInputError && error.field === 'projection_limit');
   assert.equal(readFileSync(checkpoint, 'utf8'), saved, 'projection refusal cannot mutate admitted checkpoints');
  }
  let active = 0, calls = 0;
  const serial = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A) => { assert.equal(active++, 0); calls++; try { await Promise.resolve(); return await fn(...args); } finally { active--; } };
  const sources: ReviewSources = { commit: serial(f.deps.sources.commit.bind(f.deps.sources)), file: serial(f.deps.sources.file.bind(f.deps.sources)), changedRanges: serial(f.deps.sources.changedRanges.bind(f.deps.sources)), isAncestor: serial(f.deps.sources.isAncestor.bind(f.deps.sources)) };
  await projectReviewScope(origins, f.revision, sources); assert.ok(calls > 0); assert.equal(active, 0);
  for (const field of ['changes', 'source']) {
   const failure = new TaskReviewInputError(field, 'Existing transport or truncated diff failure');
   await assert.rejects(projectReviewScope(origins, f.revision, { ...sources, changedRanges: async () => { throw failure; } }), error => error === failure);
  }
 } finally { f.cleanup(); }
});

test('actual diff truncation stays changes while oversized JSON refuses input before source/provider work', async () => {
 const f = await fixture(); try {
  const path = checkpointPath(f.repo, 'publication'), bytes = readFileSync(path, 'utf8');
  let calls = 0;
  const unexpected = async (): Promise<never> => { calls++; throw new Error('Unexpected source read'); };
  const coordinator = new TaskReviewCoordinator({ sources: { commit: unexpected, file: unexpected, changedRanges: unexpected, isAncestor: unexpected }, provider: () => { calls++; throw new Error('Unexpected provider'); } });
  await assert.rejects(coordinator.start(f.repo, 'oversized', 1, { ...f.packet, functionalSummary: 'x'.repeat(MAX_REVIEW_JSON_BYTES) }), error => error instanceof TaskReviewInputError && error.field === 'input');
  assert.equal(calls, 0); assert.equal(existsSync(checkpointPath(f.repo, 'oversized')), false); assert.equal(readFileSync(path, 'utf8'), bytes);
  f.put('large.txt', `${'old content\n'.repeat(250000)}`); f.git('add', 'large.txt'); f.git('commit', '-qm', 'large old blob'); const parent = f.git('rev-parse', 'HEAD');
  f.put('large.txt', `${'new content\n'.repeat(250000)}`); f.git('add', 'large.txt'); f.git('commit', '-qm', 'large new blob'); const commit = f.git('rev-parse', 'HEAD');
  await assert.rejects(f.deps.sources.changedRanges(commit, parent, ['large.txt']), error => error instanceof TaskReviewInputError && error.field === 'changes');
  assert.equal(readFileSync(path, 'utf8'), bytes);
 } finally { f.cleanup(); }
});

test('production projection budgets accept their exact ceilings and refuse the next unit', () => {
 const field = (error: unknown) => error instanceof TaskReviewInputError && error.field === 'projection_limit';
 const reads = new ProjectionBudget(); for (let i = 0; i < 10000; i++) reads.read(); assert.throws(() => reads.read(), field);
 const fragments = new ProjectionBudget(); for (let i = 0; i < 100000; i++) fragments.fragment(); assert.throws(() => fragments.fragment(), field);
 const bytes = new ProjectionBudget(); bytes.decode(64 * 1024 * 1024); assert.throws(() => bytes.decode(1), field);
 assert.throws(() => new ProjectionBudget({ reads: 10001 }), field, 'test seams cannot widen production limits');
});
