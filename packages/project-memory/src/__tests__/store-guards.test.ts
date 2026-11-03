import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryError } from '../errors.js';
import { digest } from '../queue/codec.js';
import { logicalId, makeRow, rootRow, STORE_LIMITS } from '../store/codec.js';
import { embeddingProfile } from '../store/embedding-profile.js';
import { guardEffects, lifecycleAllowed, validateTransition } from '../store/guards.js';
import type { GuardLookup } from '../store/guards.js';
import { admittedPayload, canonical, evidenceId, exactScopePredicate, rowIdPredicate, snapshotPlan, sourceOccurrenceId, subjectKeyHash, validateSource } from '../store/plan.js';
import type { CommitPlan, CurrentPayload, Lifecycle, RevisionPayload, StoreRow } from '../store/types.js';
import { planFixture, reframe } from './fixtures/store-plans.js';
import { epoch, profile, queueId, scope, storeId } from './fixtures/store-rows.js';

const denied = (code?: string) => (e: unknown) => e instanceof MemoryError && (code === undefined || e.code === code);
function lookup(rows: readonly StoreRow[] = [], markers: readonly StoreRow[] = []): GuardLookup {
  const state = new Map(rows.map(row => [row.rowId, row]));
  return { async get(id) { return state.get(id) ?? null; }, async tombstones() { return markers; } };
}
const clone = <T>(value: T): T => JSON.parse(canonical(value)) as T;
const run = async (f: ReturnType<typeof planFixture>, plan: unknown = f.plan, state = lookup()) => guardEffects(snapshotPlan(plan, profile, 32768), f.root, profile, state, f.now);
function replace(plan: CommitPlan, kind: StoreRow['rowKind'], change: (row: StoreRow) => StoreRow): CommitPlan { return { ...plan, rows: plan.rows.map(row => row.rowKind === kind ? change(row) : row) }; }

test('store-plan-snapshots-bounds-protected-kinds-frame-and-profile', async () => {
  const f = planFixture(); const before = canonical(f.plan);
  const immutable = snapshotPlan(f.plan, profile, 32768);
  assert.equal(Object.isFrozen(immutable.plan.rows), true); assert.equal(Object.isFrozen(immutable.plan.frame.command.payload), true);
  assert.equal((await guardEffects(immutable, f.root, profile, lookup(), f.now)).generation, '1');
  assert.equal(canonical(f.plan), before);
  const mutable = clone(f.plan), snapshot = snapshotPlan(mutable, profile, 32768);
  (mutable as any).expectedGeneration = '99'; (mutable.rows as any).length = 0;
  await guardEffects(snapshot, f.root, profile, lookup(), f.now);
  for (const change of [
    (p: any) => { p.extra = 1; },
    (p: any) => { p.rows.push(p.rows[0]); },
    (p: any) => { p.rows.push(rootRow(storeId, profile, 0)); },
    (p: any) => { p.rows[0].payload.extra = 1; },
    (p: any) => { delete p.rows[0].payload.admittedAt; },
    (p: any) => { p.frame.checksum = digest('wrong'); },
    (p: any) => { p.commandHash = digest('wrong'); },
    (p: any) => { p.frame.command.payload.input = 'changed'; },
    (p: any) => { p.expectedGeneration = '01'; },
    (p: any) => { p.rows = Array(STORE_LIMITS.maxRows + 1).fill(p.rows[0]); },
    (p: any) => { p.rows[1].payload.text = 'x'.repeat(32768 * 8); },
    (p: any) => { delete p.embeddingProfile; },
  ]) { const plan = clone(f.plan); change(plan); assert.throws(() => snapshotPlan(plan, profile, 32768), denied()); }
  let invoked = false;
  const hostile = { ...f.plan }; Object.defineProperty(hostile, 'rows', { enumerable: true, get() { invoked = true; throw Error('secret'); } });
  assert.throws(() => snapshotPlan(hostile, profile, 32768), denied('INVALID_REQUEST')); assert.equal(invoked, false);
  for (const incompatible of [embeddingProfile('wrong', 2), embeddingProfile(profile.model, 3), { ...profile, normalizationVersion: 'semantic-v1' }]) assert.throws(() => snapshotPlan({ ...f.plan, embeddingProfile: incompatible }, profile, 32768), denied('UNSUPPORTED_VERSION'));
  await assert.rejects(guardEffects({ ...immutable }, f.root, profile, lookup(), f.now), denied('INVALID_REQUEST'));
});
test('store-plan-scope-epoch-predicates-never-interpolate-untrusted-text', async () => {
  const malicious = { projectId: "p' OR true --", branch: "b'; DROP TABLE records", sessionId: '😀', environment: 'prod' };
  const f = planFixture({ scope: malicious }); await run(f);
  assert.match(exactScopePredicate(malicious, "e' OR true"), /^namespaceKey = '[a-f0-9]{64}'$/);
  assert.equal(rowIdPredicate(f.rows[0]!.rowId), "rowId = '" + f.rows[0]!.rowId + "'");
  assert.throws(() => rowIdPredicate("source:' OR true"), denied('INVALID_REQUEST'));
  const broader = planFixture({ scope: { projectId: scope.projectId } });
  await assert.rejects(run(f, { ...f.plan, rows: broader.rows }), denied('POLICY_DENIED'));
  await assert.rejects(run(f, { ...f.plan, scopeEpoch: 'different' }), denied());
  const other = planFixture({ scope: { ...malicious, branch: 'other' } });
  await assert.rejects(run(f, { ...f.plan, rows: [f.rows[1]!, f.rows[2]!, f.rows[3]!, other.rows[0]!] }), denied());
});
test('store-plan-exact-generation-predecessor-reference-and-history-guards', async () => {
  const first = planFixture(), second = planFixture({ previous: first.current, reason: 'correct', kind: 'correct' });
  await run(second, second.plan, lookup(first.rows));
  await assert.rejects(run(second, second.plan, lookup()), denied('REVISION_CONFLICT'));
  await assert.rejects(run(second, { ...second.plan, expectedGeneration: '0' }, lookup(first.rows)), denied('REVISION_CONFLICT'));
  await assert.rejects(run(second, { ...second.plan, expectedRevisions: {} }, lookup(first.rows)), denied('INVALID_REQUEST'));
  await assert.rejects(run(second, { ...second.plan, expectedRevisions: { [first.current.memoryId]: null } }, lookup(first.rows)), denied('REVISION_CONFLICT'));
  await assert.rejects(run(second, second.plan, lookup(first.rows.filter(row => row.rowKind !== 'revision'))), denied());
  const predecessor = replace(second.plan, 'revision', row => row.rowKind === 'revision' ? makeRow('revision', scope, epoch, { ...row.payload, predecessorRevisionId: null }, profile) : row);
  await assert.rejects(run(second, predecessor, lookup(first.rows)), denied('REVISION_CONFLICT'));
  const frame = reframe(second.plan.frame, { ...second.plan.frame.command, expectedRevision: logicalId('revision', second.namespace, 'stale') });
  // The altered command is a valid checksummed admitted frame, not a checksum-failure test.
  const expected = clone(second.plan);
  (expected as any).frame = frame; (expected as any).commandHash = frame.payloadHash;
  for (const row of expected.rows) if (row.rowKind === 'revision') { (row.payload.sourceEvent as any).payloadHash = frame.payloadHash; (row as any).payloadHash = frame.payloadHash; }
  await assert.rejects(run(second, expected, lookup(first.rows)), denied('REVISION_CONFLICT'));
  await assert.rejects(guardEffects(snapshotPlan(first.plan, profile, 32768), { ...first.root, queueId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, profile, lookup(), first.now), denied('STORE_UNAVAILABLE'));
  for (const kind of ['source', 'revision', 'evidence'] as const) await assert.rejects(run(first, { ...first.plan, rows: first.rows.filter(row => row.rowKind !== kind) }), denied());
  const wrong = replace(first.plan, 'revision', row => row.rowKind === 'revision' ? makeRow('revision', scope, epoch, { ...row.payload, sourceEvent: { ...row.payload.sourceEvent, identityDigest: digest('wrong') } }, profile) : row);
  await assert.rejects(run(first, wrong), denied());
  const oldSource = first.rows.find(row => row.rowKind === 'source')!;
  const altered = clone(oldSource); (altered.payload as any).occurredAt = 79;
  await assert.rejects(run(first, first.plan, lookup([altered])), denied('REVISION_CONFLICT'));
  const duplicatePort: GuardLookup = { async get() { return first.rows[0]!; }, async tombstones() { return []; } };
  await assert.rejects(run(first, first.plan, duplicatePort), denied('STORE_UNAVAILABLE'));
});
test('store-plan-source-provenance-span-authority-and-evidence-sets', async () => {
  const f = planFixture(); const frame = f.plan.frame, source = f.rows[0]!;
  assert.equal(source.rowKind, 'source'); if (source.rowKind !== 'source') throw Error('fixture');
  const admitted = admittedPayload(frame); validateSource(source.payload, f.namespace, frame, admitted);
  const text = admitted.source!.text, start = Buffer.byteLength('Test '), end = start + Buffer.byteLength('😀');
  validateSource({ ...source.payload, sourceId: sourceOccurrenceId(f.namespace, frame, digest(text), start, end), span: { unit: 'utf8-byte', start, end }, location: { kind: 'admitted-excerpt', text: '😀' } }, f.namespace, frame, admitted);
  for (const changed of [
    { ...source.payload, contentHash: digest('wrong') },
    { ...source.payload, identity: { ...source.payload.identity, producerId: 'claude' } },
    { ...source.payload, attribution: { ...source.payload.attribution, origin: 'host-policy' as const } },
    { ...source.payload, admittedAt: 91 }, { ...source.payload, occurredAt: null },
    { ...source.payload, location: { kind: 'durable-reference' as const, reference: 'forged://path' } },
    { ...source.payload, sourceId: sourceOccurrenceId(f.namespace, frame, digest(text), start + 1, end), span: { unit: 'utf8-byte' as const, start: start + 1, end }, location: { kind: 'admitted-excerpt' as const, text: 'bad' } },
  ]) assert.throws(() => validateSource(changed, f.namespace, frame, admitted), denied());
  const badHash = replace(f.plan, 'evidence', row => row.rowKind === 'evidence' ? makeRow('evidence', scope, epoch, { ...row.payload, sourceContentHash: digest('other') }, profile) : row);
  await assert.rejects(run(f, badHash), denied());
  const mismatched = clone(f.plan);
  for (const row of mismatched.rows) {
    if (row.rowKind === 'current') (row.payload.authority as any).origin = 'host-policy';
    if (row.rowKind === 'revision') (row.payload.snapshot.authority as any).origin = 'host-policy';
  }
  await assert.rejects(run(f, mismatched), denied('POLICY_DENIED'));
  const noAuthority = clone(f.plan);
  for (const row of noAuthority.rows) {
    if (row.rowKind === 'current') (row.payload.authority as any).sourceIds = [];
    if (row.rowKind === 'revision') (row.payload.snapshot.authority as any).sourceIds = [];
  }
  await assert.rejects(run(f, noAuthority), denied());
});
test('store-plan-lifecycle-complete-matrix-and-reason-constraints', () => {
  const statuses: Lifecycle[] = ['candidate', 'active', 'conflicted', 'superseded', 'expired', 'deleted'];
  const expected: Record<string, Lifecycle[]> = { absent: ['candidate', 'active'], candidate: statuses, active: ['active', 'conflicted', 'superseded', 'expired', 'deleted'], conflicted: ['active', 'conflicted', 'superseded', 'expired', 'deleted'], superseded: [], expired: [], deleted: [] };
  // Active->candidate is not in the normative matrix.
  for (const previous of [null, ...statuses]) for (const next of statuses) assert.equal(lifecycleAllowed(previous, next), expected[previous ?? 'absent']!.includes(next), String(previous) + ' -> ' + next);
  const f = planFixture(), base = f.rows.find(row => row.rowKind === 'revision')!.payload as RevisionPayload;
  const previous = f.current;
  const next = { ...previous, updatedAt: 200, revisionId: logicalId('revision', f.namespace, 'next') };
  const revision = (code: RevisionPayload['mutationReason']['code']): RevisionPayload => ({ ...base, predecessorRevisionId: previous.revisionId, snapshot: next, mutationReason: { code, explanation: 'test' } });
  validateTransition(previous, next, revision('correct'), 'correct', 200);
  assert.throws(() => validateTransition(previous, next, revision('correct'), 'capture', 200), denied());
  assert.throws(() => validateTransition(previous, { ...next, text: 'rewritten' }, revision('evidence-added'), 'capture', 200), denied());
  validateTransition(previous, next, revision('evidence-added'), 'capture', 200);
  assert.throws(() => validateTransition(previous, next, revision('create'), 'capture', 200), denied());
  validateTransition({ ...previous, status: 'conflicted' }, next, revision('resolve'), 'resolve', 200);
  assert.throws(() => validateTransition(previous, next, revision('resolve'), 'resolve', 200), denied());
  validateTransition(previous, { ...next, status: 'conflicted' }, revision('conflict'), 'capture', 200);
  validateTransition(previous, { ...next, status: 'deleted' }, revision('forget'), 'forget', 200);
  validateTransition(previous, { ...next, status: 'superseded' }, revision('supersede'), 'correct', 200);
  validateTransition({ ...previous, validUntil: 200 }, { ...next, status: 'expired', validUntil: 200 }, revision('expire'), 'maintenance', 200);
  assert.throws(() => validateTransition({ ...previous, validUntil: 201 }, { ...next, status: 'expired', validUntil: 201 }, revision('expire'), 'maintenance', 200), denied());
  for (const status of ['deleted', 'expired', 'superseded'] as const) assert.throws(() => validateTransition({ ...previous, status }, next, revision('correct'), 'correct', 200), denied('REVISION_CONFLICT'));
});
test('store-plan-carried-evidence-preserves-vectors-and-complete-lineage', async () => {
  const first = planFixture(), second = planFixture({ previous: first.current, reason: 'evidence-added' });
  const source = first.rows.find(row => row.rowKind === 'source')!;
  if (source.rowKind !== 'source') throw Error('fixture');
  const p: CurrentPayload = { ...second.current, sourceIds: [...first.current.sourceIds, ...second.current.sourceIds], authority: { ...second.current.authority, sourceIds: [...first.current.authority.sourceIds, ...second.current.authority.sourceIds] } };
  const rows = second.rows.map(row => row.rowKind === 'current' ? makeRow('current', scope, epoch, p, profile, [1, 0], '2') : row.rowKind === 'revision' ? makeRow('revision', scope, epoch, { ...row.payload, snapshot: p }, profile) : row);
  rows.push(makeRow('evidence', scope, epoch, { schemaVersion: 1, evidenceId: evidenceId(second.namespace, p.revisionId, source.payload.sourceId, 'supports'), memoryId: p.memoryId, revisionId: p.revisionId, sourceId: source.payload.sourceId, sourceContentHash: source.payload.contentHash, relation: 'supports', createdByOperationId: second.plan.operationId }, profile));
  const plan = { ...second.plan, rows };
  assert.equal((await run(second, plan, lookup(first.rows))).affectedRevisions.length, 1);
  const reembedded = replace(plan, 'current', row => ({ ...row, embedding: [0, 1] }));
  await assert.rejects(run(second, reembedded, lookup(first.rows)), denied('INVALID_REQUEST'));
  const omitted = { ...plan, rows: rows.filter(row => row.rowKind !== 'evidence' || row.payload.sourceId !== source.payload.sourceId) };
  await assert.rejects(run(second, omitted, lookup(first.rows)), denied('INVALID_REQUEST'));
});
test('store-plan-paired-supersession-is-atomic-and-acyclic', async () => {
  const first = planFixture(), next = planFixture({ generation: '1', memoryKey: 'replacement', now: 200, eventId: 'event-2' });
  const replacement = { ...next.current, supersedesMemoryId: first.current.memoryId };
  const oldRevision = first.rows.find(row => row.rowKind === 'revision')!;
  if (oldRevision.rowKind !== 'revision') throw Error('fixture');
  const oldRevisionId = logicalId('revision', first.namespace, 'superseded-2');
  const old = { ...first.current, status: 'superseded' as const, revisionId: oldRevisionId, updatedAt: 200 };
  const rows = next.rows.map(row => row.rowKind === 'current' ? makeRow('current', scope, epoch, replacement, profile, [1, 0], '2') : row.rowKind === 'revision' ? makeRow('revision', scope, epoch, { ...row.payload, snapshot: replacement }, profile) : row);
  const template = next.rows.find(row => row.rowKind === 'revision')!;
  if (template.rowKind !== 'revision') throw Error('fixture');
  rows.push(makeRow('current', scope, epoch, old, profile, [1, 0], '2'));
  rows.push(makeRow('revision', scope, epoch, { ...template.payload, memoryId: old.memoryId, revisionId: oldRevisionId, predecessorRevisionId: first.current.revisionId, mutationReason: { code: 'supersede', explanation: 'Replaced explicitly.' }, snapshot: old }, profile));
  for (const row of first.rows) if (row.rowKind === 'evidence') rows.push(makeRow('evidence', scope, epoch, { ...row.payload, revisionId: oldRevisionId, evidenceId: evidenceId(first.namespace, oldRevisionId, row.payload.sourceId, row.payload.relation), createdByOperationId: next.plan.operationId }, profile));
  const plan = { ...next.plan, rows, expectedRevisions: { [old.memoryId]: first.current.revisionId, [replacement.memoryId]: null } };
  assert.equal((await run(next, plan, lookup(first.rows))).affectedRevisions.length, 2);
  const noReplacement = { ...plan, rows: rows.filter(row => row.entityId !== replacement.memoryId), expectedRevisions: { [old.memoryId]: first.current.revisionId } };
  await assert.rejects(run(next, noReplacement, lookup(first.rows)), denied('INVALID_REQUEST'));
});
test('store-plan-exact-tombstones-supersession-and-no-effect-dispositions', async () => {
  const f = planFixture({ generation: '1' });
  const marker = makeRow('tombstone', scope, epoch, { schemaVersion: 1, tombstoneId: logicalId('tombstone', f.namespace, 'forgotten'), selector: { kind: 'memory', memoryId: f.current.memoryId }, namespaceKey: f.namespace, scopeEpoch: epoch, invalidFromGeneration: '1', queueId, cutoffSequence: '1', mode: 'closed-lifecycle', createdByOperationId: f.plan.operationId, createdAt: 100 }, profile);
  const currentRoot = { ...f.root, generation: '1', queueId };
  for (const selector of [marker.payload.selector, { kind: 'source' as const, sourceId: f.current.sourceIds[0]! }, { kind: 'subject' as const, subjectKeyHash: subjectKeyHash(f.current.assertion.subject, f.current.assertion.category) }]) {
    const protection = makeRow('tombstone', scope, epoch, { ...marker.payload, selector }, profile);
    await assert.rejects(guardEffects(snapshotPlan({ ...f.plan, expectedGeneration: '1' }, profile, 32768), currentRoot, profile, lookup([], [protection]), 100), denied('REVISION_CONFLICT'));
  }
  const dangling = clone(f.plan);
  for (const row of dangling.rows) {
    if (row.rowKind === 'current') (row.payload as any).supersedesMemoryId = logicalId('memory', f.namespace, 'absent');
    if (row.rowKind === 'revision') (row.payload.snapshot as any).supersedesMemoryId = logicalId('memory', f.namespace, 'absent');
  }
  await assert.rejects(run(f, dangling), denied());
  const cycle = clone(dangling);
  for (const row of cycle.rows) {
    if (row.rowKind === 'current') (row.payload as any).supersedesMemoryId = f.current.memoryId;
    if (row.rowKind === 'revision') (row.payload.snapshot as any).supersedesMemoryId = f.current.memoryId;
  }
  await assert.rejects(run(f, cycle), denied());
  const noEffect = { ...f.plan, rows: [], expectedRevisions: {}, disposition: { state: 'failed', errorCode: 'INVALID_REQUEST', rejectedByTombstoneIds: [] } };
  assert.deepEqual((await run(f, noEffect)).affectedRevisions, []);
  assert.throws(() => snapshotPlan({ ...noEffect, rows: f.rows }, profile, 32768), denied());
  assert.throws(() => snapshotPlan({ ...noEffect, disposition: { state: 'cleanup-pending', errorCode: null, rejectedByTombstoneIds: [] } }, profile, 32768), denied());
});
test('store-plan-logical-forget-requires-exact-monotone-marker', async () => {
  const first = planFixture(), selector = { kind: 'memory' as const, memoryId: first.current.memoryId };
  const next = planFixture({ previous: first.current, reason: 'forget', status: 'deleted', kind: 'forget', input: { target: selector } });
  const deleted = { ...first.current, status: 'deleted' as const, updatedAt: next.now, revisionId: next.current.revisionId };
  const revision = next.rows.find(row => row.rowKind === 'revision')!;
  if (revision.rowKind !== 'revision') throw Error('fixture');
  const rows: StoreRow[] = [makeRow('current', scope, epoch, deleted, profile, [1, 0], '2'), makeRow('revision', scope, epoch, { ...revision.payload, snapshot: deleted }, profile)];
  for (const row of first.rows) if (row.rowKind === 'evidence') rows.push(makeRow('evidence', scope, epoch, { ...row.payload, revisionId: deleted.revisionId, evidenceId: evidenceId(first.namespace, deleted.revisionId, row.payload.sourceId, row.payload.relation), createdByOperationId: next.plan.operationId }, profile));
  const tombstone = makeRow('tombstone', scope, epoch, { schemaVersion: 1, tombstoneId: logicalId('tombstone', first.namespace, 'forget'), selector, namespaceKey: first.namespace, scopeEpoch: epoch, invalidFromGeneration: '2', queueId, cutoffSequence: next.plan.frame.sequence, mode: 'closed-lifecycle', createdByOperationId: next.plan.operationId, createdAt: next.now }, profile);
  const plan = { ...next.plan, rows: [...rows, tombstone], disposition: { state: 'cleanup-pending', errorCode: null, rejectedByTombstoneIds: [] } };
  assert.equal((await run(next, plan, lookup(first.rows))).tombstoneIds.length, 1);
  await assert.rejects(run(next, { ...plan, rows, disposition: next.plan.disposition }, lookup(first.rows)), denied('INVALID_REQUEST'));
  const mismatched = makeRow('tombstone', scope, epoch, { ...tombstone.payload, selector: { kind: 'memory', memoryId: logicalId('memory', first.namespace, 'other') } }, profile);
  await assert.rejects(run(next, { ...plan, rows: [...rows, mismatched] }, lookup(first.rows)), denied('INVALID_REQUEST'));
});
