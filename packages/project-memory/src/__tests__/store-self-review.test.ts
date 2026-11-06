import assert from 'node:assert/strict';
import { MemoryError } from '../errors.js';
import { encodeRow, logicalId, makeRow } from '../store/codec.js';
import { OwnedLanceStore } from '../store/lance-store.js';
import type { ForgetSelector } from '../store/types.js';
import { nativeTest } from './fixtures/node22.js';
import { finalCommand, forgetPlan, framePlan, integrationFixture } from './fixtures/store-integration.js';
import { decodedNative, openNative } from './fixtures/store-native.js';
import { ns, profile, scope } from './fixtures/store-rows.js';

const denied = (code: string) => (error: unknown) => error instanceof MemoryError && error.code === code;

nativeTest(import.meta.url, 'store-successful-forget-requires-matching-protection-for-every-selector', async () => {
  const selectors: ForgetSelector[] = [
    { kind: 'project' }, { kind: 'session', sessionId: 'source-session' },
    { kind: 'conversation', producerId: 'codex', sessionId: 'source-session' },
    { kind: 'memory', memoryId: logicalId('memory', ns, 'target') },
    { kind: 'source', sourceId: logicalId('source', ns, 'target') },
    { kind: 'subject', subjectKeyHash: 'a'.repeat(64) },
  ];
  for (const selector of selectors) {
    const f = await integrationFixture();
    try {
      const frame = await f.append(finalCommand('forget-' + selector.kind, { kind: 'forget', scope: { projectId: scope.projectId }, input: { target: selector } }));
      const plan = forgetPlan(frame, '0', 100, selector);
      for (const state of ['committed', 'cleanup-pending'] as const) {
        await assert.rejects(f.store.commit({ ...plan, rows: [], disposition: { state, errorCode: null, rejectedByTombstoneIds: [] } }), denied('INVALID_REQUEST'));
        assert.equal((await f.store.readRoot()).generation, '0');
        assert.equal((await f.store.receiptVerifier().byOperation(frame.operationId, frame.command.scope)).status, 'absent');
      }
      const marker = plan.rows[0]!; if (marker.rowKind !== 'tombstone') throw Error('fixture');
      const wrongSelector: ForgetSelector = selector.kind === 'project' ? { kind: 'session', sessionId: 'other' } : { kind: 'project' };
      const wrong = makeRow('tombstone', frame.command.scope, frame.scopeEpoch, { ...marker.payload, selector: wrongSelector }, profile);
      await assert.rejects(f.store.commit({ ...plan, rows: [wrong] }), denied('INVALID_REQUEST'));
      await f.store.commit({ ...plan, disposition: { state: 'committed', errorCode: null, rejectedByTombstoneIds: [] } });
      await f.reopen();
      assert.equal((await f.store.receiptVerifier().byOperation(frame.operationId, frame.command.scope)).status, 'found');
    } finally { await f.close(); }
  }
});

nativeTest(import.meta.url, 'store-cold-recovery-rejects-missing-or-inconsistent-protection-before-queue-recovery', async () => {
  for (const fault of ['missing-owned', 'missing-rejected', 'wrong-queue', 'wrong-generation', 'wrong-creator', 'wrong-time'] as const) {
    const f = await integrationFixture();
    try {
      const a = await f.append(finalCommand('old-capture'));
      const b = await f.append(finalCommand('forget', { kind: 'forget', scope: { projectId: scope.projectId }, input: { target: { kind: 'project' } } }));
      const plan = forgetPlan(b, '0', 100, { kind: 'project' });
      await f.store.commit({ ...plan, disposition: { state: 'committed', errorCode: null, rejectedByTombstoneIds: [] } });
      assert.equal((await f.store.commit(framePlan(a, '1', 100))).state, 'failed');
      await f.reopen();
      assert.equal((await f.store.validateFrameEligibility(a)).eligible, false);
      assert.equal((await f.store.receiptVerifier().byOperation(a.operationId, scope)).status, 'found');
      await f.queue.close(); await f.store.close();
      const db = await openNative(f.root);
      try {
        if (fault.startsWith('missing-')) {
          await db.table.delete("rowKind = 'tombstone'");
          if (fault === 'missing-rejected') {
            // Remove the creator's dependency to isolate the rejecting receipt's
            // independent requirement to retain the marker it cites.
            const receipt = decodedNative((await db.table.query().where("rowKind = 'receipt' AND operationId = '" + b.operationId + "'").toArray())[0]!);
            if (receipt.rowKind !== 'receipt') throw Error('fixture');
            const changed = makeRow('receipt', receipt.payload.scope, receipt.scopeEpoch, { ...receipt.payload, tombstoneIds: [] }, profile);
            await db.table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute([{ ...encodeRow(changed, profile) }]);
          }
        } else {
          const marker = decodedNative((await db.table.query().where("rowKind = 'tombstone'").toArray())[0]!);
          if (marker.rowKind !== 'tombstone') throw Error('fixture');
          const payload = { ...marker.payload,
            ...(fault === 'wrong-queue' ? { queueId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' } : {}),
            ...(fault === 'wrong-generation' ? { invalidFromGeneration: '2' } : {}),
            ...(fault === 'wrong-creator' ? { createdByOperationId: a.operationId } : {}),
            ...(fault === 'wrong-time' ? { createdAt: 99 } : {}),
          };
          const changed = makeRow('tombstone', { projectId: scope.projectId }, marker.scopeEpoch, payload, profile);
          await db.table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute([{ ...encodeRow(changed, profile) }]);
        }
      } finally { db.close(); }
      let recoveries = 0;
      await assert.rejects(OwnedLanceStore.beforeRecovery(f.owner, profile, async () => { recoveries++; }), denied('STORE_UNAVAILABLE'));
      assert.equal(recoveries, 0);
    } finally { await f.close(); }
  }
});

nativeTest(import.meta.url, 'store-final-validity-rejects-clock-rollback-even-without-future-boundary', async () => {
  for (const boundary of ['none', 'future'] as const) {
    let rewind = false;
    const f = await integrationFixture({ point(point) { if (rewind && point === 'read-before-final') f.clock(99); } });
    try {
      const frame = await f.append(finalCommand('clock-rollback')), plan = framePlan(frame, '0', 100);
      const rows = plan.rows.map(row => {
        const validity = { validFrom: 100, validUntil: boundary === 'none' ? null : 200 };
        if (row.rowKind === 'current') return makeRow('current', scope, frame.scopeEpoch, { ...row.payload, ...validity }, profile, [1, 0], '1');
        if (row.rowKind === 'revision') return makeRow('revision', scope, frame.scopeEpoch, { ...row.payload, snapshot: { ...row.payload.snapshot, ...validity } }, profile);
        return row;
      });
      await f.store.commit({ ...plan, rows });
      const before = await f.store.currentProjection(scope, await f.store.snapshot(scope));
      assert.equal(before.items.length, 1); assert.equal(before.nextValidityBoundary, boundary === 'none' ? null : 200);
      rewind = true;
      await assert.rejects(f.store.currentProjection(scope, await f.store.snapshot(scope)), denied('REVISION_CONFLICT'));
      assert.equal(f.store.pendingReadLeases(), 0);
      rewind = false;
      assert.equal((await f.store.current(scope, await f.store.snapshot(scope))).length, 0);
      f.clock(100);
      assert.equal((await f.store.current(scope, await f.store.snapshot(scope))).length, 1);
    } finally { await f.close(); }
  }
});
