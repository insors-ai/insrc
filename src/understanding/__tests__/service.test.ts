import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { enforcePrivatePaths } from '../privacy.js';
import { Type } from '@sinclair/typebox';
import { getGraphStore, closeGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { AttemptSchema, AssessmentError } from '../../shared/understanding.js';
import type { AnswerAttempt, AssessmentScope, CommandEnvelope } from '../../shared/understanding.js';
import { initializeAssessmentStorage, tupleKey, listAssessments } from '../storage.js';
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


test('Recovery interrupts jobs and rejects late completion without losing answers', async () => {
  let s = service();
  const id = randomUUID();
  await s.prepare(owner, scope, id);
  const first = answer(id);
  await s.mutate(owner, command(id, 1), 'answer', first);
  const job = { id: randomUUID(), kind: 'grade', inputRevision: 2, generation: 1, status: 'running' as const };
  s.register('start-job', Type.Null(), () => ({ job, state: 'evaluating' }));
  await s.mutate(owner, command(id, 2), 'start-job', null);
  await withWriteTxn(store => { store.understandingReceipt.putSync(tupleKey(id, 'receipt'), { pending: true }); });
  await closeGraphStore();
  s = service();
  await initializeAssessmentStorage();
  await s.recover();
  const view = await s.resume(owner, id);
  assert.equal(view.state, 'error');
  assert.equal(view.eligibility, 'unavailable');
  assert.deepEqual(await s.history(owner, id), [first]);
  await assert.rejects(s.mutate(owner, command(id, view.revision), 'answer', answer(id, 2), job), /unavailable/);
  const store = await getGraphStore();
  assert.equal(store.understandingCurrent.get(tupleKey(id)).job.status, 'interrupted');
  assert.equal([...store.understandingReceipt.getRange()].length, 0);
});

test('Deletion isolates owners, rejects retries and late writes, and enforces private paths', async () => {
  const s = service();
  const id = randomUUID();
  await s.prepare(owner, scope, id);
  await s.mutate(owner, command(id, 1), 'answer', answer(id));
  const removal = { ...command(id, 2), confirmed: true as const };
  await assert.rejects(s.delete({ ...owner, ownerPrincipal: 'other' }, removal), /not-found/);
  const race = await Promise.allSettled([s.delete(owner, removal), s.mutate(owner, command(id, 2), 'answer', answer(id, 2))]);
  assert.equal(race[0]?.status, 'fulfilled');
  assert.equal(race[1]?.status, 'rejected');
  await assert.rejects(s.delete(owner, removal), /not-found/);
  await assert.rejects(s.resume(owner, id), /not-found/);
  await assert.rejects(s.prepare(owner, scope, id), /not-found/);
  assert.deepEqual(await listAssessments(owner.ownerPrincipal), []);
  const store = await getGraphStore();
  for (const name of ['understandingCurrent', 'understandingAttempt', 'understandingAudit', 'understandingRequest', 'understandingOwnerIndex', 'understandingScopeIndex', 'understandingReceipt'] as const) {
    assert.equal([...store[name].getRange()].length, 0);
  }
  const path = join(dir, 'test.sock');
  const server = createServer();
  server.listen(path);
  await once(server, 'listening');
  try {
    enforcePrivatePaths(join(dir, 'graph'), path);
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    assert.equal(statSync(join(dir, 'graph')).mode & 0o777, 0o700);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.throws(() => enforcePrivatePaths(join(dir, 'graph'), path, process.getuid!() + 1), /^Error: unavailable$/);
    mkdirSync(join(dir, 'target'));
    symlinkSync(join(dir, 'target'), join(dir, 'link'));
    assert.throws(() => enforcePrivatePaths(join(dir, 'link'), path), /^Error: unavailable$/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  await closeGraphStore();
  const restarted = service();
  await initializeAssessmentStorage();
  await assert.rejects(restarted.mutate(owner, command(id, 2), 'answer', answer(id, 2)), /^Error: not-found$/);
});
