/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Value } from '@sinclair/typebox/value';
import { fixture } from './publication-fixture.js';
import { provider } from './controller-fixture.js';
import { prepareReviewPacket, deriveTaskAssignments, selectedCode } from '../packet.js';
import { attributionPrompt, directAssignments, taskReferences, assessTaskResult } from '../assessment.js';
import { assignmentPrompt, codeTaskCommands } from '../policy.js';
import { assignmentResultSchema } from '../result-schema.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import type { ReviewPacket } from '../contracts.js';

async function shiftedFixture(full = false) {
 const f = await fixture(full, full ? 3 : 1), base = f.packet.reviewSet[0]!.commit;
 f.put('source.js', 'stable-a\nstable-b\nbroken-original\n'); f.git('add', '.'); f.git('commit', '-qm', 'selected original block'); const origin = f.git('rev-parse', 'HEAD');
 f.put('source.js', 'UNSELECTED_CONTEXT\nstable-a\nstable-b\nbroken-original\n'); f.git('add', '.'); f.git('commit', '-qm', 'unselected line shift'); const shifted = f.git('rev-parse', 'HEAD');
 f.put('source.js', 'UNSELECTED_CONTEXT\nstable-a\nstable-b\ncurrent-final-defect\n'); f.git('add', '.'); f.git('commit', '-qm', 'selected replacement'); const revision = f.git('rev-parse', 'HEAD');
 const packet: ReviewPacket = { ...f.packet, reviewRevision: revision, reviewSet: [
  { commit: origin, parent: base, files: [{ path: 'source.js', segments: [{ after: [3, 3] }] }] },
  { commit: revision, parent: shifted, files: [{ path: 'source.js', segments: [{ after: [4, 4] }] }] }] };
 const finding = { severity: 'MED' as const, location: 'source.js:4', message: 'Current defect', rationale: 'The current selected branch violates its requirement', evidenceReferences: [`${revision}:source.js`] };
 const result = { ...f.result, status: 'changes_requested' as const, findings: [finding], inspectedReferences: [`${revision}:source.js`], testCoverage: { ...f.result.testCoverage, evidenceReferences: [`${revision}:test.js`] } };
 return { ...f, packet, origin, revision, result };
}
test('effective attribution preserves all entries/tests and requires replacement witness closure', async () => {
 const f = await shiftedFixture(true); try {
  const p = await prepareReviewPacket(f.packet, f.deps.sources);
  const rows = ['t1', 't2', 't3'].map(taskId => ({ taskId, changeIndexes: [0, 1], testIndexes: [0] }));
  const assignments = deriveTaskAssignments(p, rows);
  assert.equal(assignments[0]!.changes[0], p.changes[0]); assert.equal(assignments[0]!.changes[1], p.changes[1]);
  assert.equal(p.projection!.entries[0]!.findingScope, 'none');
  assert.throws(() => deriveTaskAssignments(p, rows.map((r, i) => i ? r : { ...r, changeIndexes: [0] })), /replacement witness/);
  assert.throws(() => deriveTaskAssignments(p, rows.map(r => ({ ...r, changeIndexes: [] }))), /omit submitted/);
  assert.throws(() => deriveTaskAssignments(p, rows.map(r => ({ ...r, testIndexes: [] }))), /omit submitted/);
  assert.match(attributionPrompt(p), /requiredWitnessChangeIndexes/);
 } finally { f.cleanup(); }
});
test('final blobs, paths and spans reach prompts, native grants and strict result validation', async () => {
 const f = await shiftedFixture(); try {
  const p = await prepareReviewPacket(f.packet, f.deps.sources), assignment = directAssignments(p)![0]!;
  assert.deepEqual(selectedCode(p.changes[0]!).blocks, []);
  assert.deepEqual(selectedCode(p.changes[1]!).blocks, [{ lines: [4, 4], code: 'current-final-defect\n' }]);
  for (const prompt of [attributionPrompt(p), assignmentPrompt(p, assignment, [])]) {
   assert.ok(prompt.includes('current-final-defect')); assert.ok(!prompt.includes('broken-original')); assert.ok(!prompt.includes('UNSELECTED_CONTEXT'));
  }
  assert.ok(codeTaskCommands(p).includes(`git show ${f.revision}:source.js`));
  const schema = assignmentResultSchema(assignment); assert.ok(Value.Check(schema, f.result));
  for (const location of ['source.js:3', 'source.js', 'source.js:4-5']) assert.equal(Value.Check(schema, { ...f.result, findings: [{ ...f.result.findings[0]!, location }] }), false);
  const refs = await taskReferences(f.deps.sources, p, assignment);
  assert.equal((await assessTaskResult(f.deps.sources, assignment, f.result, refs)).status, 'changes_requested');
  await assert.rejects(assessTaskResult(f.deps.sources, assignment, { ...f.result, findings: [{ ...f.result.findings[0]!, location: 'source.js:3' }] }, refs), /outside the submitted/);
  const none = { ...assignment, changes: [p.changes[0]!] };
  assert.equal(Value.Check(assignmentResultSchema(none), f.result), false);
  await assert.rejects(assessTaskResult(f.deps.sources, none, f.result, refs), /outside the submitted/);
  assert.equal((await assessTaskResult(f.deps.sources, assignment, { ...f.result, status: 'passed', findings: [], testCoverage: { ...f.result.testCoverage, assessment: 'unverified' } }, refs)).status, 'incomplete');
 } finally { f.cleanup(); }
});

test('native response schema bounds decimal intervals, gaps and deletion anchors', async () => {
 const f = await shiftedFixture(); try {
  const p = await prepareReviewPacket(f.packet, f.deps.sources), assignment = directAssignments(p)![0]!;
  const current = p.changes[1]!; assert.ok('origin' in current);
  const schema = assignmentResultSchema({ ...assignment, changes: [{ ...current, segments: [{ after: [12, 123] }, { after: [130, 132] }, { deletionAt: 0 }] }] });
  const check = (location: string) => Value.Check(schema, { ...f.result, findings: [{ ...f.result.findings[0]!, location }] });
  for (const line of [1, 12, 19, 20, 99, 100, 123, 130, 132]) assert.equal(check(`source.js:${line}`), true);
  for (const location of ['source.js:0', 'source.js:01', 'source.js:11', 'source.js:124', 'source.js:129', 'source.js:133', 'source.js:12-130', 'source.js']) assert.equal(check(location), false, location);
  assert.equal(check('source.js:12-123'), true); assert.equal(check('source.js:1-1'), true);
 } finally { f.cleanup(); }
});

test('both reviewer routes reject invalid locations and preserve mandatory coverage omissions', async () => {
 for (const party of ['daemon', 'controller'] as const) for (const variant of ['historical', 'unassigned', 'none', 'coverage'] as const) {
  const f = await shiftedFixture();
  try {
   let result = f.result;
   if (variant === 'none') {
    f.git('mv', 'source.js', 'renamed.js'); f.put('renamed.js', 'UNSELECTED_CONTEXT\nstable-a\nstable-b\nrenamed-final-defect\n'); f.git('add', '.'); f.git('commit', '-qm', 'selected rename for none-scope finding'); const revision = f.git('rev-parse', 'HEAD');
    f.packet.reviewRevision = revision; f.packet.reviewSet.push({ commit: revision, parent: f.revision, files: [{ path: 'renamed.js', previousPath: 'source.js', segments: [{ after: [4, 4] }] }] });
    result = { ...result, findings: [{ ...result.findings[0]!, location: 'renamed.js:4', evidenceReferences: [`${revision}:renamed.js`] }], inspectedReferences: [`${revision}:renamed.js`] };
   }
   const bad = variant === 'coverage' ? { ...result, status: 'passed', findings: [], testCoverage: { ...result.testCoverage, assessment: 'unverified' } }
    : { ...result, findings: [{ ...result.findings[0]!, location: variant === 'historical' ? 'source.js:3' : variant === 'unassigned' ? 'unassigned.js:4' : 'source.js:4' }] };
   const coordinator = new TaskReviewCoordinator({ sources: f.deps.sources, provider: () => provider(async () => bad) });
   if (party === 'daemon') {
    const ack = await coordinator.start(f.repo, 'route-negative', 1, f.packet); await coordinator.settled(f.repo, 'route-negative');
    const task = f.read(ack.path).attempts[0]!['review-response'].tasks[0]!;
    assert.equal(task.status, variant === 'coverage' ? 'incomplete' : 'failed'); assert.deepEqual(task.findings, []);
    if (variant === 'coverage') assert.ok(task.limitations.length > 0);
   } else {
    const owner = { id: 'controller', signal: new AbortController().signal }, frame = await coordinator.startController(f.repo, 'route-negative', 1, f.packet, owner);
    const envelope = { taskId: frame.taskId, executionId: frame.executionId, sequence: frame.nextSequence };
    if (variant === 'coverage') assert.equal((await coordinator.controllerResult(f.repo, 'route-negative', 1, bad, owner, envelope)).status, 'incomplete');
    else {
     await assert.rejects(coordinator.controllerResult(f.repo, 'route-negative', 1, bad, owner, envelope), /outside the submitted/);
     assert.equal(f.read(frame.path).attempts[0]!['review-response'].tasks.length, 0);
     assert.equal((await coordinator.controllerResult(f.repo, 'route-negative', 1, result, owner, envelope)).status, 'changes_requested');
    }
   }
  } finally { f.cleanup(); }
 }
});
test('native and controller routes share final scope and reject historical findings without suppressing final defects', async () => {
 for (const party of ['daemon', 'controller'] as const) {
  const f = await shiftedFixture(); let calls = 0;
  const coordinator = new TaskReviewCoordinator({ sources: f.deps.sources, provider: () => provider(async prompt => {
   calls++; assert.ok(prompt.includes('current-final-defect')); assert.ok(!prompt.includes('broken-original')); return f.result;
  }) });
  try {
   if (party === 'daemon') { const ack = await coordinator.start(f.repo, 'final-scope', 1, f.packet); await coordinator.settled(f.repo, 'final-scope'); assert.equal(f.read(ack.path).attempts[0]!['review-response'].tasks[0]!.findings[0]!.location, 'source.js:4'); assert.equal(calls, 1); }
   else {
    const owner = { id: 'controller', signal: new AbortController().signal };
    const frame = await coordinator.startController(f.repo, 'final-scope', 1, f.packet, owner);
    assert.ok(frame.prompt!.includes('current-final-defect')); assert.ok(!frame.prompt!.includes('broken-original'));
    const envelope = { taskId: frame.taskId, executionId: frame.executionId, sequence: frame.nextSequence };
    await assert.rejects(coordinator.controllerResult(f.repo, 'final-scope', 1, { ...f.result, findings: [{ ...f.result.findings[0]!, location: 'source.js:3' }] }, owner, envelope), /outside the submitted/);
    const done = await coordinator.controllerResult(f.repo, 'final-scope', 1, f.result, owner, envelope);
    assert.equal(done.status, 'changes_requested'); assert.equal(calls, 0);
   }
  } finally { f.cleanup(); }
 }
});

test('renamed final paths alone authorize findings; previousPath remains provenance context', async () => {
 const f = await shiftedFixture(); try {
  f.git('mv', 'source.js', 'renamed.js'); f.put('renamed.js', 'UNSELECTED_CONTEXT\nstable-a\nstable-b\nrenamed-final-defect\n'); f.git('add', '.'); f.git('commit', '-qm', 'selected final rename'); const revision = f.git('rev-parse', 'HEAD');
  f.packet.reviewRevision = revision; f.packet.reviewSet.push({ commit: revision, parent: f.revision, files: [{ path: 'renamed.js', previousPath: 'source.js', segments: [{ after: [4, 4] }] }] });
  const p = await prepareReviewPacket(f.packet, f.deps.sources), assignment = directAssignments(p)![0]!, refs = await taskReferences(f.deps.sources, p, assignment);
  const result = { ...f.result, findings: [{ ...f.result.findings[0]!, location: 'renamed.js:4', evidenceReferences: [`${revision}:renamed.js`] }], inspectedReferences: [`${revision}:renamed.js`] };
  assert.ok(Value.Check(assignmentResultSchema(assignment), result));
  assert.equal((await assessTaskResult(f.deps.sources, assignment, result, refs)).status, 'changes_requested');
  const old = { ...result, findings: [{ ...result.findings[0]!, location: 'source.js:4' }] };
  assert.equal(Value.Check(assignmentResultSchema(assignment), old), false);
  await assert.rejects(assessTaskResult(f.deps.sources, assignment, old, refs), /outside the submitted/);
  assert.ok(codeTaskCommands(p).includes(`git show ${revision}:renamed.js`));
  const none = { ...assignment, changes: [p.changes[0]!] };
  await assert.rejects(assessTaskResult(f.deps.sources, none, { ...old, findings: [{ ...old.findings[0]!, location: 'source.js' }] }, refs), /outside the submitted/);
 } finally { f.cleanup(); }
});
