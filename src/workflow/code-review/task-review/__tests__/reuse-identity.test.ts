/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fixture, hash } from './publication-fixture.js';
import { historyFixture } from './history-fixture.js';
import { provider } from './controller-fixture.js';
import { assignmentsToRows, attributionIdentity, bindTaskFinalIdentities, restoreAcceptedAssignments, reuseMismatch, taskFinalIdentity, taskInputFingerprint, validateSavedAttribution } from '../attribution-binding.js';
import { prepareReviewAdmission } from '../admission.js';
import { reviewAssignments } from '../assessment.js';
import { recordAttributionRejection } from '../attribution-repair.js';
import { checkpointPath } from '../checkpoint.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { deriveTaskAssignments, prepareReviewPacket } from '../packet.js';
import { publishTaskCheckpoint } from '../publication.js';
import { validateTaskBody } from '../record.js';
import { CheckpointSchema, decodeReview } from '../contracts.js';
import type { ReviewAttempt, ReviewCheckpoint, ReviewPacket } from '../contracts.js';
import type { AdmittedReview } from '../execution.js';
import type { PreparedReviewPacket, TaskAssignment } from '../packet.js';

test('the attempt header schema accepts only the v2 identity format', async () => {
 const f = await fixture(); try {
  const withFormat = (value: unknown) => { const state = f.checkpoint(); (state.attempts[0]!.header as Record<string, unknown>).taskIdentityFormat = value; return state; };
  assert.equal(decodeReview(CheckpointSchema, withFormat('final-task-v2')).attempts[0]!.header.taskIdentityFormat, 'final-task-v2');
  const absent = f.checkpoint(); delete absent.attempts[0]!.header.taskIdentityFormat;
  assert.equal(decodeReview(CheckpointSchema, absent).attempts[0]!.header.taskIdentityFormat, undefined);
  for (const value of ['final-task-v1', 'final-task-v3', '', 2]) assert.throws(() => decodeReview(CheckpointSchema, withFormat(value)), /taskIdentityFormat/);
 } finally { f.cleanup(); }
});

test('an identity format on an unaccepted attempt is refused', async () => {
 const f = await fixture(); try {
  const accepted = f.checkpoint().attempts[0]!;
  assert.equal(accepted.header.attributionState, 'accepted');
  validateSavedAttribution(accepted);
  assert.equal(accepted.header.taskIdentityFormat, 'final-task-v2');
  const { taskIdentityFormat: _format, ...v1Header } = accepted.header; validateSavedAttribution({ ...accepted, header: v1Header });
  const unaccepted = (state: 'pending' | 'failed'): ReviewAttempt => {
   const a = structuredClone(accepted), h = a.header;
   delete h.acceptedAttribution; delete h.taskScopeIdentities; delete h.attributionIdentity; delete h.taskIdentityFormat; h.attributionState = state;
   return a;
  };
  const pending = unaccepted('pending'); validateSavedAttribution(pending);
  pending.header.taskIdentityFormat = 'final-task-v2';
  assert.throws(() => validateSavedAttribution(pending), /Unmapped phase cannot carry accepted task bindings/);
  const failed = unaccepted('failed'); failed.header.taskIdentityFormat = 'final-task-v2';
  assert.throws(() => validateSavedAttribution(failed), /Unmapped phase cannot carry accepted task bindings/);
  const unpinned = structuredClone(accepted), h = unpinned.header;
  delete (unpinned.submitted as { reviewRevision?: string }).reviewRevision;
  delete h.finalScopeIdentity; delete h.attributionState; delete h.acceptedAttribution; delete h.taskScopeIdentities; delete h.attributionIdentity; delete h.taskIdentityFormat;
  validateSavedAttribution(unpinned);
  h.taskIdentityFormat = 'final-task-v2';
  assert.throws(() => validateSavedAttribution(unpinned), /Unpinned history cannot carry final-scope authority/);
 } finally { f.cleanup(); }
});

/** Hand-built packet; the v1 identities below were computed with the code before ISSUE-7d2422c8 (taskFinalIdentity unchanged). */
const V1_WITH_TEST = '7b854ad9e2e64cb264d9d32e5f9680c201e002faec9a15f59a7c58a0f141ab95';
const V1_NO_TESTS = '93a44cddf3b97cb48249894b044e9bd0672bc7d12787ab0472f94ea974c7a489';
const row = () => ({ file: 'src/a.test.ts', cases: ['a works', 'b works'], result: 'pass' as const, command: 'npx tsx --test src/a.test.ts', executionDetails: 'exit 0', evidenceReferences: ['0000000000000000000000000000000000000000:src/a.test.ts'] });
function handBuilt(test = row(), blob = '1111111111111111111111111111111111111111') {
 const prepared = { projection: { identity: 'p' }, finalTestBlobs: [blob], packet: { tests: [test], documents: { lld: { path: 'docs/LLD.md', commit: '2222222222222222222222222222222222222222' } } },
  documents: { lld: '# LLD\n' }, tasks: [{ id: 't1', title: 'Task one', summary: 'Does one thing' }] } as unknown as PreparedReviewPacket;
 const assignment = { taskId: 't1', acceptanceChecks: ['ac1'], changes: [{ origin: {}, path: 'src/a.ts', after: { oid: '3333333333333333333333333333333333333333' }, findingScope: 'selected', segments: [{ after: [1, 2] }] }], tests: [test] } as unknown as TaskAssignment;
 return { prepared, assignment };
}

test('the v1 task identity equals the identity pinned from the pre-change code', () => {
 const { prepared, assignment } = handBuilt();
 assert.equal(taskFinalIdentity(prepared, assignment), V1_WITH_TEST);
 assert.equal(taskFinalIdentity(prepared, assignment, 'final-task-v1'), V1_WITH_TEST);
 assert.equal(taskFinalIdentity(prepared, { ...assignment, tests: [] }), V1_NO_TESTS);
 assert.notEqual(taskFinalIdentity(prepared, assignment, 'final-task-v2'), V1_WITH_TEST);
});

test('the v2 task identity ignores command, execution details and evidence references', () => {
 const base = handBuilt(), v2 = taskFinalIdentity(base.prepared, base.assignment, 'final-task-v2');
 for (const edit of [{ command: 'node --test src/a.test.ts' }, { executionDetails: 'rerun on 2026-11-11, exit 0' }, { evidenceReferences: [] }, { command: 'x', executionDetails: 'y', evidenceReferences: ['z:src/a.test.ts'] }]) {
  const changed = handBuilt({ ...row(), ...edit });
  assert.equal(taskFinalIdentity(changed.prepared, changed.assignment, 'final-task-v2'), v2, JSON.stringify(edit));
  assert.notEqual(taskFinalIdentity(changed.prepared, changed.assignment), V1_WITH_TEST, `v1 still covers ${JSON.stringify(edit)}`);
 }
});

test('the v2 task identity changes with the test file, cases or result', () => {
 const base = handBuilt(), v2 = taskFinalIdentity(base.prepared, base.assignment, 'final-task-v2');
 const variants = [handBuilt(row(), '4444444444444444444444444444444444444444'), handBuilt({ ...row(), file: 'src/b.test.ts' }), handBuilt({ ...row(), cases: ['a works'] }),
  handBuilt({ ...row(), cases: ['b works', 'a works'] }), handBuilt({ ...row(), result: 'fail' })];
 const identities = variants.map(v => taskFinalIdentity(v.prepared, v.assignment, 'final-task-v2'));
 for (const identity of identities) assert.notEqual(identity, v2);
 assert.equal(new Set(identities).size, identities.length);
});

test('a task with no assigned tests keeps a v2 identity over requirements, changes and documents', () => {
 const { prepared, assignment } = handBuilt(), none = { ...assignment, tests: [] }, v2 = taskFinalIdentity(prepared, none, 'final-task-v2');
 assert.notEqual(v2, V1_NO_TESTS);
 assert.equal(taskFinalIdentity(prepared, none, 'final-task-v2'), v2);
 const task = (prepared.tasks as { summary: string }[])[0]!;
 const changedPrepared = { ...prepared, tasks: [{ ...task, summary: 'Does another thing' }] } as unknown as PreparedReviewPacket;
 const changedDocs = { ...prepared, documents: { lld: '# LLD v2\n' } } as unknown as PreparedReviewPacket;
 const changedSource = { ...none, changes: [{ ...(none.changes[0] as object), after: { oid: '5555555555555555555555555555555555555555' } }] } as unknown as TaskAssignment;
 for (const identity of [taskFinalIdentity(changedPrepared, none, 'final-task-v2'), taskFinalIdentity(changedDocs, none, 'final-task-v2'), taskFinalIdentity(prepared, { ...none, acceptanceChecks: ['ac2'] }, 'final-task-v2'), taskFinalIdentity(prepared, changedSource, 'final-task-v2')]) assert.notEqual(identity, v2);
});

test('the rejection names a provenance-only change between two v1 attempts', () => {
 const source = handBuilt(), current = handBuilt({ ...row(), evidenceReferences: [] });
 const before = taskInputFingerprint(source.prepared, source.assignment), after = taskInputFingerprint(current.prepared, current.assignment);
 assert.equal(before.tests[0]!.identity, after.tests[0]!.identity);
 assert.notEqual(before.tests[0]!.provenance, after.tests[0]!.provenance);
 const review = { prepared: current.prepared, priorTaskInputs: new Map([[1, new Map([['t1', before]])]]) } as unknown as AdmittedReview;
 const v1 = reuseMismatch(review, current.assignment, 1, 'final-task-v1');
 assert.match(v1, /Task "t1" cannot reuse attempt 1: relevant task inputs changed \(tests "src\/a\.test\.ts"\)/);
 assert.match(v1, /reassess/);
 const v2 = reuseMismatch(review, current.assignment, 1, 'final-task-v2');
 assert.doesNotMatch(v2, /tests "src\/a\.test\.ts"/);
 const realChange = handBuilt({ ...row(), result: 'fail' });
 const changedReview = { prepared: realChange.prepared, priorTaskInputs: review.priorTaskInputs } as unknown as AdmittedReview;
 assert.match(reuseMismatch(changedReview, realChange.assignment, 1, 'final-task-v2'), /tests "src\/a\.test\.ts"/);
});

type Fixture = Awaited<ReturnType<typeof fixture>>;
const readState = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as ReviewCheckpoint;
/** Rewrite an accepted attempt as the pre-change code saved it: v1 identities and no identity format. */
async function asV1(f: Fixture, state: ReviewCheckpoint, index: number): Promise<void> {
 const entry = state.attempts[index]!, h = entry.header;
 const prepared = await prepareReviewPacket(entry.submitted, f.deps.sources, true, undefined, h.derived);
 const rows = h.acceptedAttribution!, assignments = deriveTaskAssignments(prepared, rows);
 const identities = assignments.map(a => ({ taskId: a.taskId, identity: taskFinalIdentity(prepared, a, 'final-task-v1') }));
 h.taskScopeIdentities = identities; delete h.taskIdentityFormat;
 h.attributionIdentity = attributionIdentity('accepted', h.finalScopeIdentity!, h.selectedTaskIds, prepared.packet.tests.length, rows.map(r => ({ ...r, identity: identities.find(i => i.taskId === r.taskId)!.identity })));
}
async function savedV1(f: Fixture, reviewId = 'publication'): Promise<ReviewCheckpoint> {
 const path = checkpointPath(f.repo, reviewId), state = readState(path);
 await asV1(f, state, 0); writeFileSync(path, JSON.stringify(state));
 await publishTaskCheckpoint(f.repo, hash, reviewId, f.deps);
 return state;
}
const reusePlan = (taskIds: readonly string[], reuse: readonly string[] = taskIds) => ({ summary: 'Retain unchanged task results',
 tasks: taskIds.map(taskId => reuse.includes(taskId) ? { taskId, changeIndexes: [0], testIndexes: [0], action: 'reuse' as const, reason: 'Inputs unchanged', sourceAttempt: 1 } : { taskId, changeIndexes: [0], testIndexes: [0], action: 'reassess' as const, reason: 'Inspect again' }) });
const withTest = (packet: ReviewPacket, edit: Partial<ReviewPacket['tests'][number]>): ReviewPacket => { const next = structuredClone(packet); next.tests[0] = { ...next.tests[0]!, ...edit }; return next; };
const byMessage = (pattern: RegExp) => (error: unknown) => error instanceof Error && pattern.test(error.message);
const admit = (f: Fixture, packet: ReviewPacket, reviewId = 'publication') => prepareReviewAdmission(f.repo, reviewId, 2, packet, 'daemon', f.deps.sources);

test('a correction attempt reuses a task when only provenance text in its test rows changed', async () => {
 const f = await fixture(); try {
  await publishTaskCheckpoint(f.repo, hash, 'publication', f.deps);
  const source = readState(checkpointPath(f.repo, 'publication')).attempts[0]!.header;
  assert.equal(source.taskIdentityFormat, 'final-task-v2');
  const packet = withTest(f.packet, { command: 'node --test --test-reporter=spec test.js', executionDetails: 'Re-run after review feedback', evidenceReferences: [`${f.packet.reviewRevision}:test.js`] });
  const review = await admit(f, packet);
  const assignments = reviewAssignments(review, reusePlan(['t1']));
  await bindTaskFinalIdentities(review, assignmentsToRows(review, assignments));
  assert.equal(review.attempt.header.taskIdentityFormat, 'final-task-v2');
  assert.deepEqual(review.attempt.header.taskScopeIdentities, source.taskScopeIdentities);
 } finally { f.cleanup(); }
});

test('three tasks reused after their evidence references are removed are accepted in one submission', async () => {
 const f = await historyFixture(); try {
  const path = checkpointPath(f.repo, 'history'), stable = f.unchangedPacket.reviewRevision!, state = readState(path);
  assert.equal(state.attempts[0]!.header.taskIdentityFormat, 'final-task-v2');
  state.attempts[0]!.submitted.tests[0]!.evidenceReferences = [`${stable}:test.js`]; writeFileSync(path, JSON.stringify(state));
  const packet = withTest(f.unchangedPacket, { evidenceReferences: [], executionDetails: 'Re-run without the evidence reference' });
  const plan = f.scope(); for (const task of plan.tasks) { task.action = 'reuse'; task.sourceAttempt = 1; task.changeIndexes = task.changeIndexes.filter(index => index !== 3); }
  let calls = 0;
  const coordinator = new TaskReviewCoordinator({ sources: f.deps.sources, provider: () => provider(async () => { calls++; return plan; }), publish: (repo, id) => publishTaskCheckpoint(repo, hash, id, f.deps) });
  await coordinator.start(f.repo, 'history', 2, packet); await coordinator.settled(f.repo, 'history');
  const saved = readState(path).attempts[1]!;
  assert.equal(calls, 1); assert.equal(saved.header.attributionRepair, undefined);
  assert.equal(saved.header.attributionState, 'accepted'); assert.equal(saved.header.taskIdentityFormat, 'final-task-v2');
  assert.deepEqual(saved['review-response'].origins!.map(o => o.taskId), ['t1', 't2', 't3']);
  assert.deepEqual(saved['review-response'].tasks, f.original['review-response'].tasks);
 } finally { f.cleanup(); }
});

test('reuse is still refused with reassess feedback when a test\'s cases changed', async () => {
 const f = await fixture(); try {
  await publishTaskCheckpoint(f.repo, hash, 'publication', f.deps);
  const review = await admit(f, withTest(f.packet, { cases: ['Behavior', 'Different assertion'] }));
  assert.throws(() => reviewAssignments(review, reusePlan(['t1'])), (error: Error) => {
   assert.match(error.message, /^origins\/tasks\/0\/sourceAttempt\/1: Task "t1" cannot reuse attempt 1: relevant task inputs changed \(tests "test\.js"\)\. Set action to "reassess"/);
   assert.doesNotMatch(error.message, /tasks cannot reuse their source attempt/); return true;
  });
 } finally { f.cleanup(); }
});

test('reordered test cases refuse reuse', async () => {
 const f = await fixture(); try {
  f.packet.tests[0]!.cases = ['Behavior', 'Second behavior']; await f.refreshBinding();
  const { saveCheckpoint } = await import('../checkpoint.js');
  await saveCheckpoint(checkpointPath(f.repo, 'reorder'), f.checkpoint('reorder')); await publishTaskCheckpoint(f.repo, hash, 'reorder', f.deps);
  const same = await admit(f, structuredClone(f.packet), 'reorder');
  reviewAssignments(same, reusePlan(['t1']));
  const reordered = await admit(f, withTest(f.packet, { cases: ['Second behavior', 'Behavior'] }), 'reorder');
  assert.throws(() => reviewAssignments(reordered, reusePlan(['t1'])), /relevant task inputs changed \(tests "test\.js"\)/);
 } finally { f.cleanup(); }
});

test('reuse from an attempt recorded under the earlier identity format is refused with reassess feedback', async () => {
 const f = await fixture(); try {
  await savedV1(f);
  const review = await admit(f, f.packet);
  const expected = /^origins\/tasks\/0\/sourceAttempt\/1: Task "t1" cannot reuse attempt 1: its result was recorded under an earlier task identity format\. Set action to "reassess" and omit sourceAttempt for this task/;
  assert.throws(() => reviewAssignments(review, reusePlan(['t1'])), byMessage(expected));
  const rows = assignmentsToRows(review, deriveTaskAssignments(review.prepared, reusePlan(['t1']).tasks).map(a => ({ ...a, reassessment: { action: 'reuse' as const, reason: 'Inputs unchanged', sourceAttempt: 1 } })));
  await assert.rejects(bindTaskFinalIdentities(review, rows), byMessage(expected));
  assert.equal(review.attempt.header.attributionState, 'pending');
  const fresh = reviewAssignments(await admit(f, f.packet), reusePlan(['t1'], []));
  assert.equal(fresh[0]!.reassessment!.action, 'reassess');
 } finally { f.cleanup(); }
});

test('three tasks whose source used the earlier identity format are refused in one rejection naming all three', async () => {
 const f = await fixture(true, 3); try {
  await savedV1(f);
  const review = await admit(f, f.packet);
  let rejection: unknown;
  try { reviewAssignments(review, reusePlan(['t1', 't2', 't3'])); } catch (error) { rejection = error; }
  assert.ok(rejection instanceof Error);
  assert.match(rejection.message, /^origins\/tasks\/0\/sourceAttempt\/1: 3 tasks cannot reuse their source attempt: "t1", "t2", "t3"\. /);
  for (const id of ['t1', 't2', 't3']) assert.match(rejection.message, new RegExp(`Task "${id}" cannot reuse attempt 1: its result was recorded under an earlier task identity format`));
  assert.equal(await recordAttributionRejection(review, rejection, async () => {}), true);
  assert.equal(review.attempt.header.attributionRepair!.rejections, 1);
  const malformed = reusePlan(['t1', 't2', 't3']); malformed.tasks[2] = { ...malformed.tasks[2]!, sourceAttempt: 2 };
  assert.throws(() => reviewAssignments(review, malformed), byMessage(/^origins: Reuse requires an earlier accepted source$/));
 } finally { f.cleanup(); }
});

test('a saved attempt without an identity format re-binds with its stored v1 identities', async () => {
 const f = await fixture(true, 3); try {
  const state = await savedV1(f), stored = state.attempts[0]!.header.taskScopeIdentities!;
  const review = await admit(f, f.packet), restored = review.checkpoint.attempts[0]!.header;
  assert.equal(restored.taskIdentityFormat, undefined);
  assert.deepEqual(restored.taskScopeIdentities, stored);
  const prepared = await prepareReviewPacket(review.checkpoint.attempts[0]!.submitted, f.deps.sources, true);
  for (const a of deriveTaskAssignments(prepared, restored.acceptedAttribution!)) {
   assert.equal(stored.find(i => i.taskId === a.taskId)!.identity, taskFinalIdentity(prepared, a, 'final-task-v1'));
   assert.notEqual(stored.find(i => i.taskId === a.taskId)!.identity, taskFinalIdentity(prepared, a, 'final-task-v2'));
  }
 } finally { f.cleanup(); }
});

test('a saved v1 attempt that reused a v1 attempt still re-binds', async () => {
 const f = await fixture(); try {
  const state = await savedV1(f), first = state.attempts[0]!;
  const second = structuredClone(first), h = second.header;
  h.attempt = 2; h.acceptedAttribution = h.acceptedAttribution!.map(r => ({ ...r, decision: { action: 'reuse' as const, reason: 'Inputs unchanged', sourceAttempt: 1 } }));
  const prepared = await prepareReviewPacket(second.submitted, f.deps.sources, true, undefined, h.derived);
  h.attributionIdentity = attributionIdentity('accepted', h.finalScopeIdentity!, h.selectedTaskIds, prepared.packet.tests.length, h.acceptedAttribution.map(r => ({ ...r, identity: h.taskScopeIdentities!.find(i => i.taskId === r.taskId)!.identity })));
  const checkpoint = { ...state, attempts: [first, second] };
  const assignments = await restoreAcceptedAssignments({ path: checkpointPath(f.repo, 'publication'), checkpoint, attempt: second, prepared });
  assert.equal(assignments![0]!.reassessment!.action, 'reuse');
  assert.equal(second.header.taskIdentityFormat, undefined);
  const mixed = structuredClone(checkpoint); mixed.attempts[0]!.header.taskIdentityFormat = 'final-task-v2';
  await assert.rejects(restoreAcceptedAssignments({ path: checkpointPath(f.repo, 'publication'), checkpoint: mixed, attempt: mixed.attempts[1]!, prepared }), /earlier task identity format/);
 } finally { f.cleanup(); }
});

test('a published v2 reuse row passes the record reuse-identity check', async () => {
 const f = await historyFixture(); try {
  const plan = f.scope(); for (const task of plan.tasks) { task.action = 'reuse'; task.sourceAttempt = 1; task.changeIndexes = task.changeIndexes.filter(index => index !== 3); }
  const packet = withTest(f.unchangedPacket, { executionDetails: 'Re-run for the record check' });
  const coordinator = new TaskReviewCoordinator({ sources: f.deps.sources, provider: () => provider(async () => plan), publish: (repo, id) => publishTaskCheckpoint(repo, hash, id, f.deps) });
  await coordinator.start(f.repo, 'history', 2, packet); await coordinator.settled(f.repo, 'history');
  const saved = readState(checkpointPath(f.repo, 'history')).attempts[1]!;
  assert.equal(saved['review-response'].crPublication, 'complete');
  const record = f.readRecord(`${f.repo}/.insrc/artifacts/CR-${hash}-s1.json`), reused = record.body.reviews.find(r => r.attempt === 2)!;
  const rows = reused.scope.finalScope!.tasks.filter(row => row.decision.action === 'reuse');
  assert.equal(rows.length, 3);
  validateTaskBody(record.body);
  const tampered = structuredClone(record.body), row = tampered.reviews.find(r => r.attempt === 2)!.scope.finalScope!.tasks[0]!;
  (row as { identity: string }).identity = 'f'.repeat(64);
  assert.throws(() => validateTaskBody(tampered), /Reuse source lacks matching accepted final task identity|identity/);
 } finally { f.cleanup(); }
});
