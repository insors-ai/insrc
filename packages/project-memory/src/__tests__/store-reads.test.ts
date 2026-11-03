import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryError } from '../errors.js';
import { canonical } from '../store/plan.js';
import { embeddingProfile } from '../store/embedding-profile.js';
import { makeRow, rootRow, STORE_LIMITS } from '../store/codec.js';
import { encodeRow } from '../store/codec.js';
import { digest } from '../queue/codec.js';
import { OwnedLanceStore } from '../store/lance-store.js';
import { ReadLeases } from '../store/reads.js';
import type { PinnedReader } from '../store/reads.js';
import { nativeTest } from './fixtures/node22.js';
import { finalCommand, forgetPlan, framePlan, integrationFixture, integrationLimits } from './fixtures/store-integration.js';
import { profile, scope, storeId } from './fixtures/store-rows.js';
import { planFixture } from './fixtures/store-plans.js';
import { decodedNative, openNative } from './fixtures/store-native.js';

const denied = (code: string) => (e: unknown) => e instanceof MemoryError && e.code === code;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }
nativeTest(import.meta.url, 'store-reads-scalar-snapshot-is-bound-pinned-and-consumed-without-native-handle', async () => {
  const f = await integrationFixture();
  try {
    const frame = await f.append(finalCommand('one')); const plan = framePlan(frame, '0', 100);
    await f.store.commit(plan);
    const snapshot = await f.store.snapshot(scope); assert.equal(snapshot.generation, '1'); assert.equal(snapshot.version, 3);
    assert.deepEqual(Object.keys(snapshot).sort(), ['eligibleAt', 'generation', 'scopeDigest', 'scopeEpoch', 'version']);
    assert.equal(Object.isFrozen(snapshot), true);
    await assert.rejects(f.store.current(scope, { ...snapshot }), denied('INVALID_REQUEST'));
    await assert.rejects(f.store.current({ ...scope, branch: 'other' }, snapshot), denied('INVALID_REQUEST'));
    const current = await f.store.currentProjection(scope, snapshot);
    assert.equal(current.items.length, 1); assert.equal(current.items[0]!.text, 'Keep tests deterministic.');
    assert.deepEqual(current.eligibleRowIds, plan.rows.filter(row => row.rowKind === 'current').map(row => row.rowId));
    assert.equal(current.generation, '1'); assert.equal(current.nextValidityBoundary, null); assert.equal(f.store.pendingReadLeases(), 0);
    assert.deepEqual(Object.keys(current.items[0]!).sort(), ['id', 'kind', 'revision', 'sourceIds', 'status', 'text']);
    await assert.rejects(f.store.current(scope, snapshot), denied('NOT_READY'));
    await f.reopen(); const reopened = await f.store.snapshot(scope); assert.equal(canonical(await f.store.current(scope, reopened)), canonical(current.items));
  } finally { await f.close(); }
});
nativeTest(import.meta.url, 'store-reads-scope-subsets-epoch-and-sql-like-qualifiers-stay-isolated', async () => {
  const f = await integrationFixture();
  try {
    const scopes = [{ projectId: scope.projectId }, scope, { ...scope, branch: 'other' }, { ...scope, sessionId: 'private-session', environment: 'prod' }];
    for (let i = 0; i < scopes.length; i++) { const frame = await f.append(finalCommand('scoped-' + i, { scope: scopes[i]! })); await f.store.commit(framePlan(frame, String(i), 100, 'scoped-' + i)); }
    const requested = { ...scope, sessionId: 'private-session', environment: 'prod' };
    assert.equal((await f.store.current(requested, await f.store.snapshot(requested))).length, 3);
    assert.equal((await f.store.current({ projectId: scope.projectId }, await f.store.snapshot({ projectId: scope.projectId }))).length, 1);
    const malicious = { projectId: "p' OR true --", branch: "branch'); DROP TABLE records;--", sessionId: '😀 session', environment: 'prod\nquoted' };
    f.epoch(malicious.projectId, "epoch' OR true --");
    const frame = await f.append(finalCommand('sql-like', { scope: malicious })); await f.store.commit(framePlan(frame, '4', 100, 'sql'));
    assert.equal((await f.store.current(malicious, await f.store.snapshot(malicious))).length, 1);
    const old = await f.store.snapshot(scope); f.epoch(scope.projectId, 'new-binding-epoch');
    await assert.rejects(f.store.current(scope, old), denied('REVISION_CONFLICT'));
    assert.equal((await f.store.current(scope, await f.store.snapshot(scope))).length, 0);
  } finally { await f.close(); }
});
nativeTest(import.meta.url, 'store-reads-concurrent-forget-and-generation-change-discard-pinned-old-content', async () => {
  for (const change of ['forget', 'unrelated-generation'] as const) {
    const reached = deferred(), release = deferred(); let hold = true;
    const f = await integrationFixture({ async point(point) { if (point === 'read-before-final' && hold) { reached.resolve(); await release.promise; } } });
    try {
      const a = await f.append(finalCommand('original')); await f.store.commit(framePlan(a, '0', 100));
      const snapshot = await f.store.snapshot(scope), reading = f.store.current(scope, snapshot), rejected = assert.rejects(reading, denied('REVISION_CONFLICT'));
      await reached.promise;
      if (change === 'forget') {
        const selector = { kind: 'session' as const, sessionId: a.command.source.sessionId };
        const b = await f.append(finalCommand('forget', { kind: 'forget', scope: { projectId: scope.projectId }, input: { target: selector } }));
        f.clock(200); await f.store.commit(forgetPlan(b, '1', 200, selector));
      } else {
        const b = await f.append(finalCommand('other-project', { scope: { projectId: 'other-project' } }));
        f.clock(200); await f.store.commit(framePlan(b, '1', 200, 'other'));
      }
      hold = false; release.resolve(); await rejected; assert.equal(f.store.pendingReadLeases(), 0);
      assert.equal((await f.store.current(scope, await f.store.snapshot(scope))).length, change === 'forget' ? 0 : 1);
      assert.equal((await f.store.readRoot()).generation, '2', 'reader checkout never rewinds the writer');
    } finally { release.resolve(); await f.close(); }
  }
});
nativeTest(import.meta.url, 'store-reads-binding-change-during-projection-is-rechecked-before-return', async () => {
  const reached = deferred(), release = deferred(); let hold = true;
  const f = await integrationFixture({ async point(point) { if (point === 'read-before-final' && hold) { reached.resolve(); await release.promise; } } });
  try {
    const frame = await f.append(finalCommand('binding-race')); await f.store.commit(framePlan(frame, '0', 100));
    const reading = f.store.current(scope, await f.store.snapshot(scope)), rejected = assert.rejects(reading, denied('REVISION_CONFLICT'));
    await reached.promise; f.epoch(scope.projectId, 'changed-during-read'); hold = false; release.resolve(); await rejected;
    assert.equal((await f.store.readRoot()).generation, '1');
    assert.equal((await f.store.current(scope, await f.store.snapshot(scope))).length, 0);
  } finally { release.resolve(); await f.close(); }
});
nativeTest(import.meta.url, 'store-reads-cleanup-wait-cannot-return-forgotten-rebound-expired-or-overdue-content', async () => {
  for (const change of ['forget', 'binding', 'validity', 'lease-deadline'] as const) {
    const reached = deferred(), release = deferred(); let hold = true, elapsed = 0;
    const f = await integrationFixture({ monotonic: () => elapsed, async point(point) { if (point === 'read-close' && hold) { reached.resolve(); await release.promise; } } });
    try {
      const frame = await f.append(finalCommand('cleanup-race')), plan = framePlan(frame, '0', 100);
      const rows = change === 'validity' ? plan.rows.map(row => row.rowKind === 'source' ? makeRow('source', scope, frame.scopeEpoch, { ...row.payload, validUntil: 200 }, profile) : row) : plan.rows;
      await f.store.commit({ ...plan, rows });
      const reading = f.store.current(scope, await f.store.snapshot(scope));
      const rejected = assert.rejects(reading, denied(change === 'lease-deadline' ? 'DEADLINE_EXCEEDED' : 'REVISION_CONFLICT'));
      await reached.promise; assert.ok(f.store.pendingReadLeases() > 0, 'cleanup remains owned work');
      if (change === 'forget') {
        const selector = { kind: 'session' as const, sessionId: frame.command.source.sessionId };
        const b = await f.append(finalCommand('forget-during-cleanup', { kind: 'forget', scope: { projectId: scope.projectId }, input: { target: selector } }));
        f.clock(200); await f.store.commit(forgetPlan(b, '1', 200, selector));
      } else if (change === 'binding') f.epoch(scope.projectId, 'rebound-during-cleanup');
      else if (change === 'validity') f.clock(200);
      else elapsed = 30_001;
      hold = false; release.resolve(); await rejected; assert.equal(f.store.pendingReadLeases(), 0);
    } finally { hold = false; release.resolve(); await f.close(); }
  }
});
nativeTest(import.meta.url, 'store-reads-time-boundaries-expire-sources-without-a-generation-change', async () => {
  let advance = false;
  const f = await integrationFixture({ point(point) { if (point === 'read-before-final' && advance) { advance = false; f.clock(200); } } });
  try {
    const frame = await f.append(finalCommand('timed')), plan = framePlan(frame, '0', 100);
    const rows = plan.rows.map(row => {
      if (row.rowKind === 'current') return makeRow('current', frame.command.scope, frame.scopeEpoch, { ...row.payload, validFrom: 100, validUntil: 300 }, profile, [1, 0], '1');
      if (row.rowKind === 'revision') return makeRow('revision', frame.command.scope, frame.scopeEpoch, { ...row.payload, snapshot: { ...row.payload.snapshot, validFrom: 100, validUntil: 300 } }, profile);
      if (row.rowKind === 'source') return makeRow('source', frame.command.scope, frame.scopeEpoch, { ...row.payload, validUntil: 200 }, profile);
      return row;
    });
    await f.store.commit({ ...plan, rows });
    const projected = await f.store.currentProjection(scope, await f.store.snapshot(scope));
    assert.equal(projected.items.length, 1); assert.equal(projected.nextValidityBoundary, 200);
    advance = true; await assert.rejects(f.store.current(scope, await f.store.snapshot(scope)), denied('REVISION_CONFLICT'));
    assert.equal((await f.store.readRoot()).generation, '1');
    assert.equal((await f.store.current(scope, await f.store.snapshot(scope))).length, 0);
  } finally { await f.close(); }
});
nativeTest(import.meta.url, 'store-reads-future-validity-is-published-as-a-cache-boundary', async () => {
  const f = await integrationFixture();
  try {
    const frame = await f.append(finalCommand('future')), plan = framePlan(frame, '0', 100);
    const rows = plan.rows.map(row => row.rowKind === 'current' ? makeRow('current', scope, frame.scopeEpoch, { ...row.payload, validFrom: 150 }, profile, [1, 0], '1') : row.rowKind === 'revision' ? makeRow('revision', scope, frame.scopeEpoch, { ...row.payload, snapshot: { ...row.payload.snapshot, validFrom: 150 } }, profile) : row);
    await f.store.commit({ ...plan, rows });
    const before = await f.store.currentProjection(scope, await f.store.snapshot(scope)); assert.equal(before.items.length, 0); assert.equal(before.nextValidityBoundary, 150);
    f.clock(150); assert.equal((await f.store.current(scope, await f.store.snapshot(scope))).length, 1);
    assert.equal((await f.store.readRoot()).generation, '1');
  } finally { await f.close(); }
});
nativeTest(import.meta.url, 'store-reads-lease-cap-idempotent-release-idle-expiry-and-active-deadline', async () => {
  let closes = 0;
  const f = await integrationFixture({ point(point) { if (point === 'read-close') closes++; } });
  try {
    const snapshots = [];
    for (let i = 0; i < STORE_LIMITS.maxLeases; i++) snapshots.push(await f.store.snapshot(scope));
    assert.equal(f.store.pendingReadLeases(), 16); await assert.rejects(f.store.snapshot(scope), denied('BACKPRESSURE'));
    await f.store.releaseSnapshot(snapshots[0]!); await f.store.releaseSnapshot(snapshots[0]!); assert.equal(closes, 1);
    const replacement = await f.store.snapshot(scope); assert.equal(f.store.pendingReadLeases(), 16);
    for (const snapshot of snapshots.slice(1)) await f.store.releaseSnapshot(snapshot);
    await f.store.releaseSnapshot(replacement); assert.equal(f.store.pendingReadLeases(), 0); assert.equal(closes, 17);
  } finally { await f.close(); }
  const idle = await integrationFixture({ leaseMs: 10 });
  try {
    const snapshot = await idle.store.snapshot(scope); await new Promise(resolve => setTimeout(resolve, 25));
    await assert.rejects(idle.store.current(scope, snapshot), denied('DEADLINE_EXCEEDED')); assert.equal(idle.store.pendingReadLeases(), 0);
  } finally { await idle.close(); }
  let elapsed = 0;
  const active = await integrationFixture({ monotonic: () => elapsed, point(point) { if (point === 'read-before-final') elapsed = 30_001; } });
  try {
    const frame = await active.append(finalCommand('active-expiry')); await active.store.commit(framePlan(frame, '0', 100));
    await assert.rejects(active.store.current(scope, await active.store.snapshot(scope)), denied('DEADLINE_EXCEEDED')); assert.equal(active.store.pendingReadLeases(), 0);
  } finally { await active.close(); }
});
nativeTest(import.meta.url, 'store-reads-profile-query-text-float32-and-cold-current-projection-agree', async () => {
  const f = await integrationFixture();
  try {
    const text = '\ufeffe\u0301\r\n😀 trailing ', frame = await f.append(finalCommand('profile', { text })); await f.store.commit(framePlan(frame, '0', 100));
    await f.reopen(); const snapshot = await f.store.snapshot(scope);
    const query = f.store.prepareEmbeddingQuery({ text, vector: [1 + 1e-9, 0], profile }, snapshot);
    assert.equal(query.text, text); assert.deepEqual(query.vector, [1, 0]);
    for (const incompatible of [embeddingProfile('wrong', 2), embeddingProfile(profile.model, 3), { ...profile, normalizationVersion: 'semantic-normalizer-v1' }]) assert.throws(() => f.store.prepareEmbeddingQuery({ text, vector: [1, 0], profile: incompatible }, snapshot), denied('UNSUPPORTED_VERSION'));
    assert.equal((await f.store.current(scope, snapshot))[0]!.text, text);
  } finally { await f.close(); }
});
nativeTest(import.meta.url, 'store-reads-mixed-null-vectors-use-distinct-pinned-handles-and-reject-cross-instance-leases', async () => {
  const f = await integrationFixture(), other = await integrationFixture();
  try {
    const a = await f.append(finalCommand('null-vector')), first = framePlan(a, '0', 100, 'null-vector');
    await f.store.commit({ ...first, rows: first.rows.map(row => row.rowKind === 'current' ? { ...row, embedding: null } : row) });
    const old = await f.store.snapshot(scope);
    await assert.rejects(other.store.current(scope, old), denied('INVALID_REQUEST'));
    const b = await f.append(finalCommand('vector')), second = framePlan(b, '1', 100, 'vector'); await f.store.commit(second);
    // A shared/automatically refreshed handle would see generation 2 while
    // decoding the old root and fail authority, rather than reach the final
    // deliberate stale-generation check against a genuinely pinned generation 1.
    await assert.rejects(f.store.current(scope, old), denied('REVISION_CONFLICT'));
    const latest = await f.store.current(scope, await f.store.snapshot(scope)); assert.equal(latest.length, 2);
    const rows = (await f.rows()).filter(row => row.rowKind === 'current');
    assert.equal(rows.filter(row => row.embedding === null).length, 1); assert.equal(rows.filter(row => row.embedding !== null).length, 1);
  } finally { await other.close(); await f.close(); }
});
nativeTest(import.meta.url, 'store-reads-cold-filter-column-corruption-cannot-hide-content-or-protection', async () => {
  for (const corruption of ['current-status', 'tombstone-namespace'] as const) {
    const f = await integrationFixture();
    try {
      const a = await f.append(finalCommand('original')); await f.store.commit(framePlan(a, '0', 100));
      if (corruption === 'tombstone-namespace') {
        const selector = { kind: 'session' as const, sessionId: a.command.source.sessionId };
        const b = await f.append(finalCommand('forget', { kind: 'forget', scope: { projectId: scope.projectId }, input: { target: selector } }));
        await f.store.commit(forgetPlan(b, '1', 100, selector));
      }
      await f.queue.close(); await f.store.close();
      const db = await openNative(f.root);
      try {
        const kind = corruption === 'current-status' ? 'current' : 'tombstone';
        const row = decodedNative((await db.table.query().where("rowKind = '" + kind + "'").toArray())[0]);
        const changed = { ...encodeRow(row, profile), ...(corruption === 'current-status' ? { status: 'deleted' } : { namespaceKey: digest('hidden protection') }) };
        await db.table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute([changed]);
      } finally { db.close(); }
      await assert.rejects(OwnedLanceStore.open(f.owner, profile, {}, integrationLimits), denied('STORE_UNAVAILABLE'));
    } finally { await f.close(); }
  }
});
test('store-reads-result-reference-and-byte-overflow-return-no-truncated-projection', async () => {
  const f = planFixture(), root = f.root;
  for (const mode of ['results', 'protections', 'bytes'] as const) {
    let gets = 0, closed = 0;
    const reader: PinnedReader = {
      async get(_id, reservation) { gets++; if (mode === 'bytes') reservation.charge(STORE_LIMITS.maxBytes + 1); return rootRow(storeId, profile, 50); },
      async currentKeys() { return mode === 'results' ? Array.from({ length: STORE_LIMITS.maxRows + 1 }, (_, i) => 'current:' + i.toString(16).padStart(64, '0')) : []; },
      async protectionKeys() { return mode === 'protections' ? Array(STORE_LIMITS.maxReferences + 1).fill('tombstone:' + '0'.repeat(64)) : []; },
      async evidenceKeys() { return []; }, async receiptKey() { return null; }, async nextStart() { return null; }, async close() { closed++; },
    };
    const reads = new ReadLeases({ accepting: () => true, async binding() { return { projectId: scope.projectId, root: '/host', scopeEpoch: f.plan.scopeEpoch }; }, async capture() { return { version: 2, root, reader }; }, async head() { return { version: 2, root }; } }, profile, integrationLimits, { now: () => 100 });
    const snapshot = await reads.snapshot(scope); await assert.rejects(reads.current(scope, snapshot), denied('CONTEXT_OVERFLOW'));
    assert.equal(gets, 1, 'overflow is detected before loading candidate payloads'); assert.equal(reads.pending(), 0); assert.equal(closed, 1);
  }
});
