/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, hash } from './publication-fixture.js';
import { historyFixture } from './history-fixture.js';
import { provider } from './controller-fixture.js';
import { prepareReviewAdmission } from '../admission.js';
import { reviewAssignments, directAssignments } from '../assessment.js';
import { prepareReviewPacket } from '../packet.js';
import { assignmentsToRows, bindTaskFinalIdentities, taskFinalIdentity, validateSavedAttribution, restoreAcceptedAssignments } from '../attribution-binding.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { publishTaskCheckpoint } from '../publication.js';

test('both routes durably accept direct/model mapping before acknowledgement or assessment without diagnostics', async () => {
 for (const party of ['daemon', 'controller'] as const) for (const full of [false, true]) {
  const f = await fixture(full, full ? 3 : 1); let release!: () => void, entered!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; }), reached = new Promise<void>(resolve => { entered = resolve; });
  let persisted = false, assessments = 0, transition = 0;
  const scope = { tasks: (full ? ['t1', 't2', 't3'] : ['t1']).map(taskId => ({ taskId, changeIndexes: [0], testIndexes: [0] })) };
  const coordinator = new TaskReviewCoordinator({ sources: f.deps.sources,
   save: async (path, state) => { const h = state.attempts.at(-1)!.header;
    if (state.reviewId === 'accept' && h.attributionState === 'accepted' && !persisted) { transition++; entered(); await blocked; await saveCheckpoint(path, state); persisted = true; }
    else await saveCheckpoint(path, state);
   }, provider: () => provider(async prompt => {
    if (prompt.startsWith('Derive task attribution')) return scope;
    assert.equal(persisted, true, 'assessment must follow positive acceptance save'); assessments++;
    return { ...f.result, taskId: /"taskId":"(t\d+)"/.exec(prompt)![1]! };
   }) });
  try {
   if (party === 'daemon') {
    await coordinator.start(f.repo, 'accept', 1, f.packet); await reached; assert.equal(assessments, 0);
    release(); await coordinator.settled(f.repo, 'accept'); assert.equal(assessments, full ? 3 : 1);
   } else {
    const owner = { id: 'controller', signal: new AbortController().signal };
    const first = coordinator.startController(f.repo, 'accept', 1, f.packet, owner);
    if (full) {
     const frame = await first; assert.equal(frame.kind, 'scope');
     let acknowledged = false; const accepting = coordinator.controllerScope(f.repo, 'accept', 1, scope, owner, { taskId: frame.taskId, executionId: frame.executionId, sequence: frame.nextSequence }).then(r => { acknowledged = true; return r; });
     await reached; assert.equal(acknowledged, false); release();
     let task = await accepting;
     while (task.kind === 'task') task = await coordinator.controllerResult(f.repo, 'accept', 1, { ...f.result, taskId: task.taskId! }, owner, { taskId: task.taskId, executionId: task.executionId, sequence: task.nextSequence });
    } else {
     let acknowledged = false; void first.then(() => { acknowledged = true; });
     await reached; assert.equal(acknowledged, false); release(); const task = await first;
     await coordinator.controllerResult(f.repo, 'accept', 1, f.result, owner, { taskId: task.taskId, executionId: task.executionId, sequence: task.nextSequence });
    }
   }
   const saved = f.read(checkpointPath(f.repo, 'accept')).attempts[0]!;
   assert.equal(transition, 1); assert.equal(saved.header.attributionState, 'accepted'); assert.equal(saved.header.acceptedAttribution!.length, full ? 3 : 1);
   assert.ok(saved.header.acceptedAttribution!.every(r => r.decision.action === 'initial')); assert.equal(saved['review-response'].failureDiagnostics, undefined);
  } finally { release(); f.cleanup(); }
 }
});

test('offline binding rejects index-only, decision-only, selected task, state and test count tampering', async () => {
 const f = await historyFixture(); try {
  const review = await prepareReviewAdmission(f.repo, 'history', 2, f.packet, 'daemon', f.deps.sources);
  await bindTaskFinalIdentities(review, assignmentsToRows(review, reviewAssignments(review, f.scope())));
  validateSavedAttribution(review.attempt);
  for (const mutate of [
   (a: typeof review.attempt) => { a.header.acceptedAttribution![0]!.changeIndexes.push(0); },
   (a: typeof review.attempt) => { a.header.acceptedAttribution![0]!.testIndexes = []; },
   (a: typeof review.attempt) => { const d = a.header.acceptedAttribution![0]!.decision; if (d.action !== 'initial') d.reason += ' changed'; },
   (a: typeof review.attempt) => { a.header.selectedTaskIds = [...a.header.selectedTaskIds].reverse(); },
   (a: typeof review.attempt) => { a.submitted.tests.push(structuredClone(a.submitted.tests[0]!)); },
   (a: typeof review.attempt) => { a.header.attributionState = 'pending'; },
  ]) { const changed = structuredClone(review.attempt); mutate(changed); assert.throws(() => validateSavedAttribution(changed), /attribution/); }
  const rows = structuredClone(review.attempt.header.acceptedAttribution!); rows[0]!.testIndexes = [];
  const before = structuredClone(review.attempt.header);
  await assert.rejects(bindTaskFinalIdentities(review, rows), /cannot change/); assert.deepEqual(review.attempt.header, before);
  assert.throws(() => reviewAssignments(review, { ...f.scope(), summary: 'Different accepted summary' }), /summary cannot change/);
  const empty = await prepareReviewAdmission(f.repo, 'empty-map', 1, f.packet, 'daemon', f.deps.sources);
  const shared = { tasks: ['t1', 't2', 't3'].map(taskId => ({ taskId, changeIndexes: taskId === 't1' ? [] : [0, 1, 2, 3], testIndexes: taskId === 't1' ? [] : [0] })) };
  await bindTaskFinalIdentities(empty, assignmentsToRows(empty, reviewAssignments(empty, shared)));
  validateSavedAttribution(empty.attempt); assert.deepEqual(empty.attempt.header.acceptedAttribution![0]!.changeIndexes, []);
 } finally { f.cleanup(); }
});

test('task identity binds relevant code requirements documents and full tests but excludes unrelated revision movement', async () => {
 const f = await fixture(); try {
  const prepared = await prepareReviewPacket(f.packet, f.deps.sources), assignment = directAssignments(prepared)![0]!, identity = taskFinalIdentity(prepared, assignment);
  f.put('unrelated.js', 'unrelated\n'); f.git('add', 'unrelated.js'); f.git('commit', '-qm', 'unrelated pin movement'); const moved = f.git('rev-parse', 'HEAD');
  const movedPacket = { ...f.packet, reviewRevision: moved }, p2 = await prepareReviewPacket(movedPacket, f.deps.sources);
  assert.equal(taskFinalIdentity(p2, directAssignments(p2)![0]!), identity);
  assert.notEqual(p2.projection!.identity, prepared.projection!.identity);
  assert.notEqual(taskFinalIdentity(prepared, { ...assignment, acceptanceChecks: ['Changed requirement'] }), identity);
  const docs = structuredClone(prepared); docs.packet.documents.lld!.commit = moved;
  assert.notEqual(taskFinalIdentity(docs, directAssignments(docs)![0]!), identity);
  const tests = structuredClone(prepared); tests.packet.tests[0]!.cases.push('Different assertion');
  assert.notEqual(taskFinalIdentity(tests, { ...assignment, tests: tests.packet.tests }), identity);
  const evidence = structuredClone(prepared); evidence.packet.tests[0]!.executionDetails = 'Different execution';
  assert.notEqual(taskFinalIdentity(evidence, { ...assignment, tests: evidence.packet.tests }), identity);
  const body = structuredClone(prepared); body.finalTestBlobs = ['f'.repeat(40)];
  assert.notEqual(taskFinalIdentity(body, directAssignments(body)![0]!), identity);
  await publishTaskCheckpoint(f.repo, hash, 'publication', f.deps);
  f.put('source.js', 'export const total = 3;\n'); f.git('add', 'source.js'); f.git('commit', '-qm', 'relevant selected fix'); const changed = f.git('rev-parse', 'HEAD');
  const packet = { ...f.packet, reviewRevision: changed, reviewSet: [...f.packet.reviewSet, { commit: changed, parent: moved, files: [{ path: 'source.js', segments: [{ after: [1, 1] as [number, number] }] }] }] };
  const review = await prepareReviewAdmission(f.repo, 'publication', 2, packet, 'daemon', f.deps.sources);
  const reuse = { summary: 'Attempt reuse', tasks: [{ taskId: 't1', changeIndexes: [0, 1], testIndexes: [0], action: 'reuse', reason: 'Unchanged', sourceAttempt: 1 }] };
  assert.throws(() => reviewAssignments(review, reuse), /inputs changed/);
  assert.throws(() => reviewAssignments(review, { ...reuse, tasks: [{ ...reuse.tasks[0]!, sourceAttempt: 2 }] }), /earlier/);
  review.checkpoint.attempts[0]!.header.reviewer = 'controller'; assert.throws(() => reviewAssignments(review, reuse), /foreign-party/);
 } finally { f.cleanup(); }
});

test('fresh native/controller resume restores exact mixed decisions and summary before a planned reuse completes', async () => {
 for (const party of ['daemon', 'controller'] as const) {
  const f = await historyFixture(party); try {
   const review = await prepareReviewAdmission(f.repo, 'history', 2, f.unchangedPacket, party, f.deps.sources), scope = f.scope(1, 't1');
   for (const row of scope.tasks) row.changeIndexes = row.changeIndexes.filter(i => i !== 3);
   scope.summary = 'EXACT saved mixed decision summary';
   await bindTaskFinalIdentities(review, assignmentsToRows(review, reviewAssignments(review, scope)));
   review.attempt.header.interrupted = true; await saveCheckpoint(review.path, review.checkpoint);
   assert.equal(review.attempt['review-response'].origins, undefined, 'a planned reuse has no completed origin');
   const header = structuredClone(review.attempt.header), restored = await restoreAcceptedAssignments(review);
   assert.equal(restored![1]!.reassessment!.sourceAttempt, 1); assert.deepEqual(review.attempt.header, header);
   const result = { ...f.result, inspectedReferences: [`${f.unchangedPacket.reviewRevision}:stable-t1.js`], testCoverage: { ...f.result.testCoverage, evidenceReferences: [`${f.unchangedPacket.reviewRevision}:test.js`] } };
   let calls = 0;
   const restarted = new TaskReviewCoordinator({ sources: f.deps.sources, provider: () => provider(async prompt => { calls++; assert.ok(!prompt.startsWith('Derive task attribution')); return result; }) });
   if (party === 'daemon') { await restarted.start(f.repo, 'history', 2, undefined, { operation: 'resume' }); await restarted.settled(f.repo, 'history'); assert.equal(calls, 1); }
   else {
    const owner = { id: 'new-controller', signal: new AbortController().signal }, frame = await restarted.startController(f.repo, 'history', 2, undefined, owner, hash, 'resume');
    assert.equal(frame.kind, 'task'); assert.equal(frame.taskId, 't1');
    assert.equal(f.read(review.path).attempts[1]!['review-response'].origins, undefined);
    await restarted.controllerResult(f.repo, 'history', 2, result, owner, { taskId: frame.taskId, executionId: frame.executionId, sequence: frame.nextSequence }); assert.equal(calls, 0);
   }
   const saved = f.read(review.path).attempts[1]!;
   assert.deepEqual(saved.header.acceptedAttribution, header.acceptedAttribution); assert.deepEqual(saved.header.taskScopeIdentities, header.taskScopeIdentities);
   assert.equal(saved.header.attributionIdentity, header.attributionIdentity); assert.equal(saved.header.reassessmentSummary, 'EXACT saved mixed decision summary');
   assert.deepEqual(saved['review-response'].origins!.map(o => o.taskId), ['t2', 't3']);
   assert.deepEqual(saved['review-response'].tasks.find(t => t.taskId === 't2'), f.original['review-response'].tasks[1]);
  } finally { f.cleanup(); }
 }
});
