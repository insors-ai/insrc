import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import { getGraphStore, closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { AttemptSchema, AssessmentError } from '../../shared/understanding.js';
import type { AnswerAttempt, AssessmentScope, CommandEnvelope } from '../../shared/understanding.js';
import { initializeAssessmentStorage, tupleKey } from '../storage.js';
import { UnderstandingService } from '../service.js';
import type { Owner } from '../service.js';

let dir: string;
const owner: Owner = { ownerPrincipal: 'local-owner', learner: { key: 'learner', source: 'git', authority: 'git-email', subject: 'person', assurance: 'local-config', aliases: [] } };
const scope: AssessmentScope = { repoId: 'repo', worktreeId: 'worktree', baseOid: null, stagedTreeOid: 'a'.repeat(40), commitMode: 'normal', parentOids: [], learnerKey: 'learner', policyRevision: 'p', evidenceRevision: 'e' };
function service(): UnderstandingService {
  const result = new UnderstandingService();
  result.register('answer', AttemptSchema, (_r, payload) => ({ state: 'answering', attempt: payload as AnswerAttempt }));
  return result;
}
function command(id: string, expectedRevision: number): CommandEnvelope { return { assessmentId: id, requestId: randomUUID(), expectedRevision, scope }; }
function answer(id: string, sequence = 1, assisted = false): AnswerAttempt { return { id: randomUUID(), assessmentId: id, sequence, questionId: 'q', conceptId: 'c', answer: 'because', confidence: assisted ? 'high' : 'unsure', assisted, guidanceRefs: assisted ? ['guide'] : [], submittedAt: new Date().toISOString() }; }
beforeEach(async () => { await closeGraphStore(); dir = mkdtempSync(join(tmpdir(), 'understanding-service-')); setGraphStorePath(join(dir, 'graph')); await initializeAssessmentStorage(); });
afterEach(async () => { await closeGraphStore(); rmSync(dir, { recursive: true, force: true }); });

test('Concurrent updates, exact replay and request conflicts preserve atomic history', async () => {
  const s = service();
  const id = randomUUID();
  await s.prepare(owner, scope, id);
  const envelope = command(id, 1);
  const attempt = answer(id);
  const outcomes = await Promise.allSettled([s.mutate(owner, envelope, 'answer', attempt), s.cancel(owner, command(id, 1))]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  const failed = outcomes.find(r => r.status === 'rejected');
  assert.ok(failed?.status === 'rejected' && failed.reason instanceof AssessmentError);
  assert.equal(failed.reason.code, 'revision-conflict');
  assert.equal(failed.reason.current.revision, 2);
  // The answer was submitted first to the serialized LMDB writer.
  assert.equal(outcomes[0]?.status, 'fulfilled');
  assert.equal((await s.mutate(owner, envelope, 'answer', attempt)).appliedRevision, 2);
  assert.equal((await s.history(owner, id)).length, 1);
  await assert.rejects(s.mutate(owner, envelope, 'answer', { ...attempt, answer: 'changed' }), /request-conflict/);
  await assert.rejects(s.mutate({ ...owner, ownerPrincipal: 'other' }, envelope, 'answer', attempt), /not-found/);
  await assert.rejects(s.mutate({ ...owner, learner: { ...owner.learner, key: 'other' } }, envelope, 'answer', attempt), /not-found/);
  const store = await getGraphStore();
  const before = [...store.understandingRequest.getRange()];
  s.register('invalid-result', Type.Null(), () => ({ state: 'invalid' as 'ready', attempt: answer(id, 2) }));
  await assert.rejects(s.mutate(owner, command(id, 2), 'invalid-result', null), /schema-unsupported/);
  assert.equal((await s.resume(owner, id)).revision, 2);
  assert.equal((await s.history(owner, id)).length, 1);
  assert.deepEqual([...store.understandingRequest.getRange()], before);
  assert.equal([...store.understandingAudit.getRange()].length, 2);
  assert.equal([...store.understandingReceipt.getRange()].length, 0);
});

test('Original and assisted answers survive reopen and resume without granting authorization', async () => {
  let s = service();
  const id = randomUUID();
  await s.prepare(owner, scope, id);
  const first = answer(id);
  const assisted = answer(id, 2, true);
  await s.mutate(owner, command(id, 1), 'answer', first);
  await s.mutate(owner, command(id, 2), 'answer', assisted);
  await assert.rejects(s.mutate(owner, command(id, 3), 'answer', { ...first, answer: 'overwrite' }), /request-conflict/);
  await closeGraphStore();
  await initializeAssessmentStorage();
  s = service();
  assert.deepEqual(await s.history(owner, id), [first, assisted]);
  assert.deepEqual(await s.history(owner, id, 1, 1), [assisted]);
  assert.equal((await s.resume(owner, id)).eligibility, 'unavailable');
  assert.equal((await s.resume(owner, id)).outcome, 'unassessed');
  const canceled = await s.cancel(owner, command(id, 3));
  assert.equal(canceled.view.state, 'canceled');
  assert.deepEqual(await s.history(owner, id), [first, assisted]);
  await assert.rejects(s.requestOverride(owner, command(id, 4)), /unavailable/);
  const store = await getGraphStore();
  assert.equal(store.understandingCurrent.get(tupleKey(id)).learner.subject, 'person');
  assert.equal([...store.understandingReceipt.getRange()].length, 0);
});
