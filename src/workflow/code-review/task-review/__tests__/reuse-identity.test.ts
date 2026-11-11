/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './publication-fixture.js';
import { reuseMismatch, taskFinalIdentity, taskInputFingerprint, validateSavedAttribution } from '../attribution-binding.js';
import { CheckpointSchema, decodeReview } from '../contracts.js';
import type { ReviewAttempt } from '../contracts.js';
import type { AdmittedReview } from '../execution.js';
import type { PreparedReviewPacket, TaskAssignment } from '../packet.js';

test('the attempt header schema accepts only the v2 identity format', async () => {
 const f = await fixture(); try {
  const withFormat = (value: unknown) => { const state = f.checkpoint(); (state.attempts[0]!.header as Record<string, unknown>).taskIdentityFormat = value; return state; };
  assert.equal(decodeReview(CheckpointSchema, withFormat('final-task-v2')).attempts[0]!.header.taskIdentityFormat, 'final-task-v2');
  assert.equal(decodeReview(CheckpointSchema, f.checkpoint()).attempts[0]!.header.taskIdentityFormat, undefined);
  for (const value of ['final-task-v1', 'final-task-v3', '', 2]) assert.throws(() => decodeReview(CheckpointSchema, withFormat(value)), /taskIdentityFormat/);
 } finally { f.cleanup(); }
});

test('an identity format on an unaccepted attempt is refused', async () => {
 const f = await fixture(); try {
  const accepted = f.checkpoint().attempts[0]!;
  assert.equal(accepted.header.attributionState, 'accepted');
  validateSavedAttribution(accepted);
  validateSavedAttribution({ ...accepted, header: { ...accepted.header, taskIdentityFormat: 'final-task-v2' } });
  const unaccepted = (state: 'pending' | 'failed'): ReviewAttempt => {
   const a = structuredClone(accepted), h = a.header;
   delete h.acceptedAttribution; delete h.taskScopeIdentities; delete h.attributionIdentity; h.attributionState = state;
   return a;
  };
  const pending = unaccepted('pending'); validateSavedAttribution(pending);
  pending.header.taskIdentityFormat = 'final-task-v2';
  assert.throws(() => validateSavedAttribution(pending), /Unmapped phase cannot carry accepted task bindings/);
  const failed = unaccepted('failed'); failed.header.taskIdentityFormat = 'final-task-v2';
  assert.throws(() => validateSavedAttribution(failed), /Unmapped phase cannot carry accepted task bindings/);
  const unpinned = structuredClone(accepted), h = unpinned.header;
  delete (unpinned.submitted as { reviewRevision?: string }).reviewRevision;
  delete h.finalScopeIdentity; delete h.attributionState; delete h.acceptedAttribution; delete h.taskScopeIdentities; delete h.attributionIdentity;
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
