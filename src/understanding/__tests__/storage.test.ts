import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { open } from 'lmdb';
import { getGraphStore, closeGraphStore, setGraphStorePath, withWriteTxn, MAX_DBS } from '../../db/graph/store.js';
import { scopeFingerprint } from '../../shared/understanding.js';
import type { AssessmentRecord, AssessmentScope } from '../../shared/understanding.js';
import { assessmentNamespaces, initializeAssessmentStorage, listAssessments, readAssessment, tupleKey, writeAssessment } from '../storage.js';

let dir: string;
beforeEach(async () => { await closeGraphStore(); dir = mkdtempSync(join(tmpdir(), 'understanding-storage-')); setGraphStorePath(join(dir, 'graph')); });
afterEach(async () => { await closeGraphStore(); rmSync(dir, { recursive: true, force: true }); });
function record(owner = 'owner'): AssessmentRecord {
  const scope: AssessmentScope = { repoId: 'repo', worktreeId: 'worktree', baseOid: null, stagedTreeOid: 'a'.repeat(40),
    commitMode: 'normal', parentOids: [], learnerKey: 'learner', policyRevision: 'p', evidenceRevision: 'e' };
  return { assessmentSchemaVersion: 1, learner: { key: 'learner', source: 'git', authority: 'git-email', subject: 'person', assurance: 'local-config', aliases: [] }, ownerPrincipal: owner, scopeFingerprint: scopeFingerprint(scope), lifecycleGeneration: 1,
    createdAt: 'now', updatedAt: 'now', view: { id: randomUUID(), revision: 1, scope, state: 'preparing', associations: [],
      completion: 'incomplete', outcome: 'unassessed', eligibility: 'unavailable' } };
}

test('Complete namespace inventory opens fresh and existing stores without data loss', async () => {
  // Create a pre-feature environment without any assessment namespaces.
  const old = open({ path: join(dir, 'graph'), maxDbs: 32 });
  const oldPlan = old.openDB({ name: 'plan', keyEncoding: 'ordered-binary' });
  await oldPlan.put('existing-plan', { title: 'retained' });
  await old.close();
  for (const fresh of [false, true]) {
    if (fresh) { await closeGraphStore(); setGraphStorePath(join(dir, 'fresh')); }
    const store = await getGraphStore();
    assert.equal(MAX_DBS, 64);
    assert.equal(Object.keys(store).filter(key => key !== 'root').length, 35);
    for (const name of assessmentNamespaces) assert.ok(store[name]);
    if (!fresh) assert.deepEqual(store.plan.get('existing-plan'), { title: 'retained' });
    await initializeAssessmentStorage();
    const r = record();
    await withWriteTxn(s => writeAssessment(s, r));
    await closeGraphStore();
    const reopened = await getGraphStore();
    await initializeAssessmentStorage();
    assert.deepEqual(readAssessment(reopened, r.view.id), r);
    assert.equal(reopened.understandingScopeIndex.get(tupleKey(r.scopeFingerprint, r.view.id)), r.view.id);
    if (!fresh) assert.deepEqual(reopened.plan.get('existing-plan'), { title: 'retained' });
  }
});

test('Schema corruption fails closed and owner pagination is isolated and bounded', async () => {
  await initializeAssessmentStorage();
  const store = await getGraphStore();
  const rows = Array.from({ length: 5 }, () => record());
  const other = record('other');
  await withWriteTxn(s => { for (const r of [...rows, other]) writeAssessment(s, r); });
  const first = await listAssessments('owner', 2);
  const second = await listAssessments('owner', 2, first.at(-1)!.view.id);
  const third = await listAssessments('owner', 2, second.at(-1)!.view.id);
  assert.deepEqual([...first, ...second, ...third].map(r => r.view.id), rows.map(r => r.view.id).sort());
  assert.deepEqual((await listAssessments('other')).map(r => r.view.id), [other.view.id]);
  await assert.rejects(listAssessments('owner', 101), /invalid-input/);
  assert.notDeepEqual(tupleKey('a', 'bc'), tupleKey('ab', 'c'));
  assert.notDeepEqual(tupleKey('a\0b', 'c'), tupleKey('a', 'b\0c'));
  const key = tupleKey('schemaVersion');
  for (const version of [undefined, null, '1', 2, {}]) {
    await withWriteTxn(s => { if (version === undefined) s.understandingMeta.removeSync(key); else s.understandingMeta.putSync(key, version); });
    await assert.rejects(initializeAssessmentStorage(), /schema-unsupported/);
    await assert.rejects(listAssessments('owner'), /schema-unsupported/);
    assert.equal(store.understandingCurrent.get(tupleKey(other.view.id)).view.id, other.view.id);
  }
  await withWriteTxn(s => { s.understandingMeta.putSync(key, 1); s.understandingCurrent.putSync(tupleKey(other.view.id), { corrupt: true }); });
  assert.throws(() => readAssessment(store, other.view.id), /schema-unsupported/);
});
