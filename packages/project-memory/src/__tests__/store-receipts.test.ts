import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireOwnership } from '../ownership.js';
import type { DirectoryOwnership } from '../ownership.js';
import { FileQueue } from '../queue/file-queue.js';
import { QueueAdmission } from '../queue/admission.js';
import { digest, snapshotCommand } from '../queue/codec.js';
import { retirementDigests } from '../queue/retirement.js';
import type { QueueFrame } from '../queue/types.js';
import type { Json, MemoryCommand } from '../types.js';
import { MemoryError } from '../errors.js';
import { OwnedLanceStore } from '../store/lance-store.js';
import { canonical } from '../store/plan.js';
import { encodeRow, makeRow } from '../store/codec.js';
import { nativeTest } from './fixtures/node22.js';
import { options } from './fixtures/options.js';
import { planFixture } from './fixtures/store-plans.js';
import { epoch, profile, scope } from './fixtures/store-rows.js';
import { decodedNative, openNative } from './fixtures/store-native.js';

const limits = { maxEventBytes: 32768, maxPendingBytes: 1024 * 1024, segmentBytes: 32768, modelTimeoutMs: 1000 };
const denied = (code: string) => (e: unknown) => e instanceof MemoryError && e.code === code;
const sameReceipt = (actual: unknown, expected: unknown) => assert.equal(canonical(actual), canonical(expected));
const policy = { async bind(projectId: string) { return { projectId, root: '/host/project', scopeEpoch: epoch }; }, async admit(_binding: unknown, event: Json) { return event; } };
async function firstFrame(queue: FileQueue): Promise<QueueFrame> { for await (const frame of queue.replay()) return frame; throw Error('Expected frame'); }
function queuePlan(frame: QueueFrame) {
  const f = planFixture();
  const rows = f.rows.map(row => row.rowKind === 'source' ? makeRow('source', scope, epoch, { ...row.payload, admittedAt: frame.admittedAtMs }, profile) : row);
  return { ...f.plan, frame, commandHash: frame.payloadHash, rows };
}
async function fixture(run: (f: { root: string; owner: DirectoryOwnership; store: OwnedLanceStore; queue: FileQueue; admission: QueueAdmission }) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-store-receipts-'))), owner = await acquireOwnership(options(root));
  const store = await OwnedLanceStore.open(owner, profile, { now: () => 100 }, limits);
  const queue = new FileQueue(owner, root, limits, {}, store.receiptVerifier()), admission = new QueueAdmission(queue, policy);
  try { await queue.start(); await run({ root, owner, store, queue, admission }); }
  finally { await queue.close(); await store.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
}
nativeTest(import.meta.url, 'store-proof-real-queue-retained-ack-recycle-and-cold-authority', async () => {
  await fixture(async f => {
    const command = planFixture().plan.frame.command, identity = snapshotCommand(command, limits.maxEventBytes).identity;
    const verifier = f.store.receiptVerifier();
    assert.deepEqual(await verifier.byIdentity(identity), { status: 'absent' });
    const accepted = await f.admission.append(command); const frame = await firstFrame(f.queue);
    const terminal = await f.store.commit(queuePlan(frame));
    assert.equal(terminal.state, 'committed'); assert.equal(f.queue.stats().pendingEvents, 1, 'store never implicitly ACKs');
    sameReceipt(await f.admission.append(command), terminal);
    sameReceipt(await f.admission.operation({ scope: command.scope, operationId: accepted.operationId }), terminal);
    const lookup = await verifier.byIdentity(identity); assert.equal(lookup.status, 'found');
    if (lookup.status !== 'found') throw Error('proof');
    assert.deepEqual(Object.keys(lookup.proof).sort(), ['generation', 'identityDigest', 'operationId', 'payloadHash', 'queueTerminal', 'receipt', 'scope', 'scopeEpoch']);
    assert.equal(JSON.stringify(lookup).includes('Test 😀 directive.'), false);
    const entry = f.queue.index.get(accepted.operationId)!;
    const reference = { ...retirementDigests(entry), operationId: accepted.operationId, generation: terminal.generation! };
    assert.equal(await verifier.confirmRetirement!(reference), true);
    for (const field of ['identityDigest', 'payloadHash', 'scopeDigest', 'scopeEpochDigest'] as const) assert.equal(await verifier.confirmRetirement!({ ...reference, [field]: digest('wrong') }), false);
    assert.equal(await verifier.confirmRetirement!({ ...reference, generation: '2' }), false);
    f.store.stopAdmission();
    assert.equal((await verifier.byIdentity(identity)).status, 'found', 'mutation stop preserves queue proof reads');
    await f.queue.markResolved(accepted.operationId, terminal.generation!); await f.queue.recycleResolvedSegments();
    assert.equal(f.queue.index.size, 0); assert.equal(f.queue.writer.current.lastSequence, '1');
    sameReceipt(await f.admission.append(command), terminal);
    assert.equal(await verifier.confirmRetirement!(reference), true);
    await f.queue.close(); await f.store.close();
    // The same guard remains owned by this test, allowing actual cold native and
    // real queue reconstruction without touching any backend store.
    const owner = await acquireOwnership(options(f.root)).catch(() => null);
    assert.equal(owner, null, 'store close does not release directory ownership');
    assert.deepEqual(await verifier.byIdentity(identity), { status: 'unavailable' });
    const reopened = await OwnedLanceStore.open(f.owner, profile, {}, limits);
    const queue = new FileQueue(f.owner, f.root, limits, {}, reopened.receiptVerifier()), admission = new QueueAdmission(queue, policy);
    try {
      await queue.start(); assert.equal(queue.index.size, 0);
      sameReceipt(await admission.append(command), terminal);
      sameReceipt(await admission.operation({ scope: command.scope, operationId: terminal.operationId }), terminal);
      assert.equal(queue.writer.current.lastSequence, '1');
      assert.equal(await reopened.receiptVerifier().confirmRetirement!(reference), true);
    } finally { await queue.close(); await reopened.close(); }
  });
});
nativeTest(import.meta.url, 'store-proof-real-queue-rejects-retained-pending-and-terminal-conflicts', async () => {
  for (const terminal of [false, true]) await fixture(async f => {
    const command = planFixture().plan.frame.command; const accepted = await f.admission.append(command);
    if (terminal) { const receipt = await f.store.commit(queuePlan(await firstFrame(f.queue))); await f.queue.markResolved(receipt.operationId, receipt.generation!); }
    const before = canonical(f.queue.writer.current);
    for (const changed of [{ ...command, payload: { changed: true } }, { ...command, scope: { ...command.scope, branch: 'other' } }] as MemoryCommand[]) {
      await assert.rejects(f.admission.append(changed), denied('REVISION_CONFLICT'));
      assert.equal(canonical(f.queue.writer.current), before); assert.equal(f.queue.isAvailable(), true);
    }
    assert.equal(f.queue.index.get(accepted.operationId)!.payloadHash, snapshotCommand(command, limits.maxEventBytes).payloadHash);
  });
});
nativeTest(import.meta.url, 'store-proof-scope-epoch-and-projection-do-not-leak-domain-content', async () => {
  await fixture(async f => {
    const command = planFixture().plan.frame.command; await f.admission.append(command); const receipt = await f.store.commit(queuePlan(await firstFrame(f.queue)));
    const verifier = f.store.receiptVerifier();
    assert.deepEqual(await verifier.byOperation(receipt.operationId, { projectId: 'other' }), { status: 'absent' });
    assert.deepEqual(await verifier.byOperation(receipt.operationId, { projectId: scope.projectId }), { status: 'absent' });
    assert.equal((await verifier.byOperation(receipt.operationId, { ...scope, sessionId: 'visible-reader' })).status, 'found');
    const otherEpoch = new QueueAdmission(f.queue, { ...policy, async bind(projectId) { return { projectId, root: '/host/project', scopeEpoch: 'new-epoch' }; } });
    await assert.rejects(otherEpoch.operation({ scope, operationId: receipt.operationId }), denied('INVALID_REQUEST'));
    await assert.rejects(otherEpoch.append(command), denied('REVISION_CONFLICT'));
    assert.equal(JSON.stringify(receipt).includes('sourceIds'), false);
  });
});
nativeTest(import.meta.url, 'store-proof-unavailable-duplicate-malformed-and-missing-authority-never-become-absent', async () => {
  for (const corruption of ['duplicate', 'malformed', 'missing-root', 'missing-proof'] as const) await fixture(async f => {
    const command = planFixture().plan.frame.command, identity = snapshotCommand(command, limits.maxEventBytes).identity;
    await f.admission.append(command); const frame = await firstFrame(f.queue), receipt = await f.store.commit(queuePlan(frame));
    const db = await openNative(f.root);
    try {
      const row = decodedNative((await db.table.query().where("rowKind = 'receipt'").toArray())[0]);
      if (corruption === 'duplicate') await db.table.add([{ ...encodeRow(row, profile) }]);
      if (corruption === 'malformed') await db.table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute([{ ...encodeRow(row, profile), payload: '{}' }]);
      if (corruption === 'missing-root') await db.table.delete("rowId = 'control:root'");
      if (corruption === 'missing-proof') await db.table.delete("rowKind = 'receipt'");
      assert.deepEqual(await f.store.receiptVerifier().byIdentity(identity), { status: 'unavailable' }, corruption);
      assert.deepEqual(await f.store.receiptVerifier().byOperation(receipt.operationId, scope), { status: 'unavailable' }, corruption);
      const version = await db.table.version();
      await assert.rejects(f.store.commit(queuePlan(frame)), denied('STORE_UNAVAILABLE'));
      await db.table.checkoutLatest(); assert.equal(await db.table.version(), version, 'corrupt authority cannot authorize replay mutation');
      const before = canonical(f.queue.writer.current);
      await assert.rejects(f.queue.markResolved(receipt.operationId, receipt.generation!), denied('STORE_UNAVAILABLE'));
      assert.equal(canonical(f.queue.writer.current), before); assert.equal(f.queue.isAvailable(), true);
    } finally { db.close(); }
  });
});
