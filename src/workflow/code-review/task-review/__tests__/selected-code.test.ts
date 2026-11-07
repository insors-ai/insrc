/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './publication-fixture.js';
import { prepareReviewPacket, selectedCode, deriveTaskAssignments } from '../packet.js';
import { attributionPrompt } from '../assessment.js';
import { assignmentPrompt } from '../policy.js';
import { parsePacket, decodeReview, PacketSchema } from '../contracts.js';
import { prepareReviewAdmission } from '../admission.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';

test('selected code: exact pinned after blocks reach attribution and assessment without prior or surrounding source', async () => {
 const f = await fixture(true, 3);
 try {
  const parent = f.packet.reviewSet[0]!.commit;
  f.put('source.js', 'export const total = 3;\nUNCHOSEN_NEW_CODE\n');
  f.git('add', 'source.js'); f.git('commit', '-qm', 'two changed lines');
  const commit = f.git('rev-parse', 'HEAD');
  f.packet.reviewSet = [{ commit, parent, files: [{ path: 'source.js', segments: [{ after: [1, 1] }] }] }];
  f.packet.reviewRevision = f.packet.reviewSet[0]!.commit;
  const reads: string[] = [];
  const sources = { isAncestor: f.deps.sources.isAncestor.bind(f.deps.sources), commit: f.deps.sources.commit.bind(f.deps.sources), changedRanges: f.deps.sources.changedRanges.bind(f.deps.sources), file: async (oid: string, path: string) => { reads.push(`${oid}:${path}`); return f.deps.sources.file(oid, path); } };
  f.put('source.js', 'WORKTREE_ONLY_SECRET\n');
  const prepared = await prepareReviewPacket(f.packet, sources);
  assert.ok(!reads.includes(`${parent}:source.js`), 'old implementation is fetched only if needed');
  assert.deepEqual(selectedCode(prepared.changes[0]!).blocks, [{ lines: [1, 1], code: 'export const total = 3;\n' }]);
  const task = deriveTaskAssignments(prepared, ['t1','t2','t3'].map(taskId => ({ taskId, changeIndexes: [0], testIndexes: [0] })))[0]!;
  for (const prompt of [attributionPrompt(prepared), assignmentPrompt(prepared, task, [])]) {
   assert.ok(prompt.includes('export const total = 3;\\n'));
   for (const forbidden of ['UNCHOSEN_NEW_CODE', 'WORKTREE_ONLY_SECRET', 'export const total = 2;', '"before":', '"bytes":']) assert.ok(!prompt.includes(forbidden), forbidden);
  }
  assert.match(attributionPrompt(prepared), /"index":0/);
  const old = structuredClone(f.packet); old.reviewSet[0]!.files[0]!.segments[0]!.before = [1, 1];
  assert.throws(() => parsePacket(old), /Unexpected property|Before-version/);
  assert.throws(() => decodeReview(PacketSchema, old));
  const forged = structuredClone(f.packet); Object.assign(forged.reviewSet[0]!.files[0]!.segments[0]!, { code: 'forged content' });
  assert.throws(() => parsePacket(forged), /Unexpected property/);
 } finally { f.cleanup(); }
});

test('deletion markers select exact reviewed-version boundaries without removed text', async () => {
 const f = await fixture();
 try {
  f.put('source.js', 'keep first\nREMOVE_ME\nkeep last\n'); f.git('add', 'source.js'); f.git('commit', '-qm', 'base for deletion');
  const parent = f.git('rev-parse', 'HEAD');
  f.put('source.js', 'keep first\nkeep last\n'); f.git('add', 'source.js'); f.git('commit', '-qm', 'delete middle');
  const commit = f.git('rev-parse', 'HEAD');
  f.packet.reviewSet = [{ commit, parent, files: [{ path: 'source.js', segments: [{ deletionAt: 1 }] }] }];
  f.packet.reviewRevision = f.packet.reviewSet[0]!.commit;
  const prepared = await prepareReviewPacket(f.packet, f.deps.sources);
  assert.deepEqual(selectedCode(prepared.changes[0]!).blocks, [{ deletionAt: 1, deleted: true }]);
  assert.ok(!attributionPrompt(prepared).includes('REMOVE_ME'));
  f.packet.reviewSet[0]!.files[0]!.segments = [{ deletionAt: 0 }];
  await assert.rejects(prepareReviewPacket(f.packet, f.deps.sources), /changed hunk/);
  f.packet.reviewSet[0]!.files[0]!.segments = [{ deletionAt: 1, after: [1, 1] }];
  assert.throws(() => parsePacket(f.packet), /cannot carry code ranges/);
  unlinkSync(join(f.repo, 'source.js')); f.git('add', 'source.js'); f.git('commit', '-qm', 'delete file');
  f.packet.reviewSet = [{ commit: f.git('rev-parse', 'HEAD'), parent: commit, files: [{ path: 'source.js', segments: [{ deletionAt: 0 }] }] }];
  f.packet.reviewRevision = f.packet.reviewSet[0]!.commit;
  assert.equal(selectedCode((await prepareReviewPacket(f.packet, f.deps.sources)).changes[0]!).deletedFile, true);
 } finally { f.cleanup(); }
});

test('immutable historical before/after packets remain resumable but cannot be submitted as new attempts', async () => {
 const f = await fixture();
 try {
  const checkpoint = f.checkpoint('old-packet');
  checkpoint.attempts[0]!.submitted.reviewSet[0]!.files[0]!.segments[0]!.before = [1, 1];
  const path = checkpointPath(f.repo, 'old-packet');
  await saveCheckpoint(path, checkpoint);
  const before = readFileSync(path, 'utf8');
  const resumed = await prepareReviewAdmission(f.repo, 'old-packet', 1, undefined, 'daemon', f.deps.sources, { operation: 'resume' });
  assert.deepEqual(resumed.attempt.submitted, checkpoint.attempts[0]!.submitted);
  assert.equal(readFileSync(path, 'utf8'), before);
  await assert.rejects(prepareReviewAdmission(f.repo, 'new-packet', 1, checkpoint.attempts[0]!.submitted, 'daemon', f.deps.sources), /Unexpected property|Before-version/);
 } finally { f.cleanup(); }
});

test('selected code preserves Unicode and missing final newline for an added file', async () => {
 const f = await fixture();
 try {
  const parent = f.packet.reviewSet[0]!.commit;
  f.put('added.js', 'const café = "你好";\r\nexport { café };');
  f.git('add', 'added.js'); f.git('commit', '-qm', 'add unicode source');
  f.packet.reviewSet = [{ commit: f.git('rev-parse', 'HEAD'), parent, files: [{ path: 'added.js', segments: [{ after: [1, 2] }] }] }];
  f.packet.reviewRevision = f.packet.reviewSet[0]!.commit;
  const prepared = await prepareReviewPacket(f.packet, f.deps.sources);
  assert.deepEqual(selectedCode(prepared.changes[0]!).blocks, [{ lines: [1, 2], code: 'const café = "你好";\r\nexport { café };' }]);
  f.packet.reviewSet[0]!.files[0]!.segments = [{ after: [1, 3] }];
  await assert.rejects(prepareReviewPacket(f.packet, f.deps.sources), /changed hunk|exceeds committed source/);
 } finally { f.cleanup(); }
});
