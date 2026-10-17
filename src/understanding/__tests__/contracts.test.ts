import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { AttemptSchema, PrepareSchema, CommandSchema, ViewSchema, ReceiptSchema, AuditSchema, EventSchema, resultSchema, parseEvent, DomainSchemas, parse, parseScope, parseRecord, publicView, scopeFingerprint } from '../../shared/understanding.js';
import type { AssessmentScope, AssessmentRecord } from '../../shared/understanding.js';
export const scope: AssessmentScope = { repoId: 'repo', worktreeId: 'worktree', baseOid: 'a'.repeat(40), stagedTreeOid: 'b'.repeat(40), commitMode: 'normal', parentOids: ['a'.repeat(40)], learnerKey: 'learner', policyRevision: 'policy', evidenceRevision: 'evidence' };
export function record(): AssessmentRecord { return { assessmentSchemaVersion: 1, ownerPrincipal: 'owner', scopeFingerprint: scopeFingerprint(scope), lifecycleGeneration: 1, createdAt: 'now', updatedAt: 'now', view: { id: randomUUID(), revision: 1, scope, state: 'preparing', associations: [], completion: 'incomplete', outcome: 'unassessed', eligibility: 'unavailable' } }; }
test('Scope fingerprint covers every exact field and strict validation rejects forged input', () => {
  const changes = { repoId: 'other', worktreeId: 'other', baseOid: 'c'.repeat(40), stagedTreeOid: 'c'.repeat(40), commitMode: 'amend', parentOids: ['c'.repeat(40)], learnerKey: 'other', policyRevision: 'other', evidenceRevision: 'other' };
  for (const [key, value] of Object.entries(changes)) assert.notEqual(scopeFingerprint(scope), scopeFingerprint({ ...scope, [key]: value }));
  assert.notEqual(scopeFingerprint({ ...scope, parentOids: ['a'.repeat(40), 'c'.repeat(40)] }), scopeFingerprint({ ...scope, parentOids: ['c'.repeat(40), 'a'.repeat(40)] }));
  assert.equal(scopeFingerprint(scope), createHash('sha256').update(JSON.stringify(['assessment-scope-v1', 'repo', 'worktree', scope.baseOid, scope.stagedTreeOid, 'normal', scope.parentOids, 'learner', 'policy', 'evidence'])).digest('hex'));
  assert.throws(() => parseScope({ ...scope, treeOid: scope.stagedTreeOid }));
  assert.throws(() => parseScope({ ...scope, parentOids: ['a'.repeat(64)] }));
  assert.throws(() => parseScope({ ...scope, baseOid: null }));
  assert.doesNotThrow(() => parseScope({ ...scope, baseOid: null, parentOids: [] }));
  assert.throws(() => parse(PrepareSchema, { requestId: randomUUID(), repoPath: '/r', worktreePath: '/r', learnerKey: 'forged' }));
  assert.throws(() => parseRecord({ ...record(), assessmentSchemaVersion: 2 }));
  assert.throws(() => new DomainSchemas().validate('unregistered', {}), /unavailable/);
});
test('Submitted confidence is preserved and public projections exclude private fields', () => {
  const attempt = { id: randomUUID(), assessmentId: randomUUID(), sequence: 1, questionId: 'q', conceptId: 'c', answer: 'why', assisted: false, guidanceRefs: [], submittedAt: 'now' };
  for (const confidence of ['unsure', 'low', 'medium', 'high']) assert.equal(parse(AttemptSchema, { ...attempt, confidence }).confidence, confidence);
  for (const confidence of [undefined, 'sure', 'unset']) assert.throws(() => parse(AttemptSchema, { ...attempt, confidence }));
  const r = record();
  const view = publicView({ ...r, answerKey: 'secret', rubric: 'secret' } as AssessmentRecord);
  assert.deepEqual(Object.keys(view).sort(), ['id', 'revision', 'scope', 'state', 'associations', 'completion', 'outcome', 'eligibility'].sort());
  view.scope.repoId = 'changed';
  assert.equal(r.view.scope.repoId, 'repo');
  assert.throws(() => parseRecord({ ...r, scopeFingerprint: 'forged' }));
});

test('Nested scopes and transport versions fail closed on every envelope', () => {
  const r = record();
  for (const bad of [{ ...scope, baseOid: null, commitMode: 'amend' }, { ...scope, parentOids: ['c'.repeat(64)] }]) {
    const view = { ...r.view, scope: bad };
    assert.throws(() => parse(ViewSchema, view));
    assert.throws(() => publicView({ ...r, view } as AssessmentRecord));
    assert.throws(() => parse(CommandSchema, { requestId: randomUUID(), assessmentId: r.view.id, expectedRevision: 1, scope: bad }));
    assert.throws(() => parse(ReceiptSchema, { id: randomUUID(), assessmentId: r.view.id, attemptId: randomUUID(), revision: 1, basis: 'pass', expiresAt: 'later', scope: bad }));
    assert.throws(() => parse(AuditSchema, { id: randomUUID(), assessmentId: r.view.id, revision: 1, kind: 'created', occurredAt: 'now', scope: bad }));
    assert.throws(() => parse(resultSchema(ViewSchema), { protocolVersion: 1, ok: true, value: view }));
  }
  const event = { protocolVersion: 1, type: 'snapshot', assessmentId: r.view.id, revision: 1, view: r.view };
  assert.deepEqual(parseEvent(event), event);
  assert.throws(() => parseEvent({ ...event, revision: 2 }));
  for (const protocolVersion of [undefined, 0, 2, '1']) {
    assert.throws(() => parse(EventSchema, { ...event, protocolVersion }));
    assert.throws(() => parse(resultSchema(ViewSchema), { protocolVersion, ok: true, value: r.view }));
  }
});
