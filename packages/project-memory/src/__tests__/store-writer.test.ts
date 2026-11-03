import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { acquireOwnership } from '../ownership.js';
import type { DirectoryOwnership } from '../ownership.js';
import { MemoryError } from '../errors.js';
import { OwnedLanceStore } from '../store/lance-store.js';
import type { StoreOpenHooks } from '../store/lance-store.js';
import { canonical } from '../store/plan.js';
import { logicalId, makeRow } from '../store/codec.js';
import { nativeTest } from './fixtures/node22.js';
import { options } from './fixtures/options.js';
import { planFixture, reframe } from './fixtures/store-plans.js';
import { epoch, profile } from './fixtures/store-rows.js';
import { decodedNative, openNative } from './fixtures/store-native.js';

const denied = (code: string) => (e: unknown) => e instanceof MemoryError && e.code === code;
const limits = { maxEventBytes: 32768, segmentBytes: 65536, maxPendingBytes: 4 * 1024 * 1024, modelTimeoutMs: 1000 };
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }
async function fixture(run: (root: string, owner: DirectoryOwnership) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-writer-'))), owner = await acquireOwnership(options(root));
  try { await run(root, owner); } finally { await owner.close(); await rm(root, { recursive: true, force: true }); }
}
async function inspect(root: string) {
  const db = await openNative(root);
  try { return { version: await db.table.version(), rows: (await db.table.query().toArray()).map(row => decodedNative(row)).sort((a, b) => a.rowId.localeCompare(b.rowId)) }; }
  finally { db.close(); }
}
nativeTest(import.meta.url, 'store-writer-one-version-complete-effects-receipt-root-and-cold-replay', async () => {
  await fixture(async (root, owner) => {
    const f = planFixture(); let writes = 0;
    const store = await OwnedLanceStore.open(owner, profile, { now: () => f.now, point(p) { if (p === 'before-write') writes++; } }, limits);
    try {
      await assert.rejects(OwnedLanceStore.open(owner, profile), denied('OWNERSHIP_CONFLICT'));
      const before = await inspect(root), receipt = await store.commit(f.plan), after = await inspect(root);
      assert.equal(writes, 1); assert.equal(after.version, before.version + 1); assert.equal(after.rows.length, f.rows.length + 3);
      assert.equal(receipt.state, 'committed'); assert.equal(receipt.generation, '1');
      assert.deepEqual(Object.keys(receipt).sort(), ['eventId', 'generation', 'operationId', 'state']);
      for (const row of f.rows) assert.equal(canonical(after.rows.find(actual => actual.rowId === row.rowId)), canonical(row));
      const proof = after.rows.find(row => row.rowKind === 'receipt')!;
      assert.equal(proof.rowKind, 'receipt'); if (proof.rowKind !== 'receipt') throw Error('fixture');
      assert.equal(proof.payload.affectedRevisions[0]!.revisionId, f.current.revisionId); assert.equal(proof.payload.queueTerminal, true);
      assert.equal((await store.readRoot()).queueId, f.plan.frame.queueId);
      // The original expectedGeneration=0 is stale; exact proof wins first.
      assert.deepEqual(await store.commit(f.plan), receipt); assert.deepEqual(await inspect(root), after); assert.equal(writes, 1);
      await store.close();
      const reopened = await OwnedLanceStore.open(owner, profile, { now: () => 999 }, limits);
      try { assert.deepEqual(await reopened.commit(f.plan), receipt); assert.deepEqual(await inspect(root), after); }
      finally { await reopened.close(); }
    } finally { await store.close(); }
  });
});
nativeTest(import.meta.url, 'store-writer-serial-generation-revisions-conflicts-and-retained-identity', async () => {
  await fixture(async (root, owner) => {
    let now = 100; const store = await OwnedLanceStore.open(owner, profile, { now: () => now }, limits);
    const first = planFixture(), competitor = planFixture({ eventId: 'event-other', memoryKey: 'other' });
    try {
      const a = store.commit(first.plan), b = store.commit(competitor.plan);
      const firstReceipt = await a; await assert.rejects(b, denied('REVISION_CONFLICT'));
      const before = await inspect(root);
      const frame = reframe(first.plan.frame, { ...first.plan.frame.command, payload: { changed: true } });
      const conflicting = { ...first.plan, frame, commandHash: frame.payloadHash, rows: [], expectedRevisions: {}, disposition: { state: 'failed', errorCode: 'INVALID_REQUEST', rejectedByTombstoneIds: [] } };
      await assert.rejects(store.commit(conflicting), denied('REVISION_CONFLICT')); assert.deepEqual(await inspect(root), before);
      now = 200; const correction = planFixture({ previous: first.current, reason: 'correct', kind: 'correct' });
      const stale = { ...correction.plan, expectedRevisions: { [first.current.memoryId]: null } };
      await assert.rejects(store.commit(stale), denied('REVISION_CONFLICT')); assert.deepEqual(await inspect(root), before);
      assert.equal((await store.commit(correction.plan)).generation, '2');
      const second = await inspect(root); assert.equal(second.version, before.version + 1);
      assert.deepEqual(await store.commit(first.plan), firstReceipt); assert.deepEqual(await inspect(root), second);
    } finally { await store.close(); }
  });
});
nativeTest(import.meta.url, 'store-writer-no-effect-failure-and-quarantine-are-atomic-and-immutable', async () => {
  await fixture(async (root, owner) => {
    const store = await OwnedLanceStore.open(owner, profile, { now: () => 100 }, limits);
    try {
      for (const [index, state] of ['failed', 'quarantined'].entries()) {
        const f = planFixture({ eventId: 'failure-' + index, generation: String(index) });
        const plan = { ...f.plan, rows: [], expectedRevisions: {}, disposition: { state, errorCode: 'POLICY_DENIED', rejectedByTombstoneIds: [] } };
        const before = await inspect(root); const receipt = await store.commit(plan), after = await inspect(root);
        assert.equal(receipt.state, state); assert.equal(receipt.errorCode, 'POLICY_DENIED'); assert.equal(after.version, before.version + 1);
        assert.equal(after.rows.filter(row => ['current', 'source', 'evidence', 'revision', 'tombstone'].includes(row.rowKind)).length, 0);
        assert.deepEqual(await store.commit(plan), receipt); assert.deepEqual(await inspect(root), after);
        await assert.rejects(store.commit({ ...plan, rows: f.rows }), denied('INVALID_REQUEST')); assert.deepEqual(await inspect(root), after);
      }
    } finally { await store.close(); }
  });
});
nativeTest(import.meta.url, 'store-writer-cleanup-pending-is-logical-protection-with-one-atomic-proof', async () => {
  await fixture(async (root, owner) => {
    const target = { kind: 'project' as const }, f = planFixture({ scope: { projectId: 'project' }, kind: 'forget', input: { target } });
    const store = await OwnedLanceStore.open(owner, profile, { now: () => 100 }, limits);
    try {
      const marker = makeRow('tombstone', f.plan.scope, epoch, { schemaVersion: 1, tombstoneId: logicalId('tombstone', f.namespace, 'project-close'), selector: target, namespaceKey: f.namespace, scopeEpoch: epoch, invalidFromGeneration: '1', queueId: f.plan.frame.queueId, cutoffSequence: f.plan.frame.sequence, mode: 'closed-lifecycle', createdByOperationId: f.plan.operationId, createdAt: 100 }, profile);
      const plan = { ...f.plan, rows: [marker], expectedRevisions: {}, disposition: { state: 'cleanup-pending', errorCode: null, rejectedByTombstoneIds: [] } };
      const before = await inspect(root), receipt = await store.commit(plan), after = await inspect(root);
      assert.equal(after.version, before.version + 1); assert.equal(receipt.state, 'cleanup-pending'); assert.equal(receipt.errorCode, undefined);
      assert.equal(after.rows.filter(row => row.rowKind === 'tombstone').length, 1);
      assert.equal(after.rows.filter(row => ['current', 'source', 'evidence', 'revision'].includes(row.rowKind)).length, 0);
      assert.deepEqual(await store.commit(plan), receipt); assert.deepEqual(await inspect(root), after);
    } finally { await store.close(); }
    const reopened = await OwnedLanceStore.open(owner, profile, {}, limits); await reopened.close();
  });
});
nativeTest(import.meta.url, 'store-writer-native-rejection-fences-until-verified-close-and-reopen', async () => {
  for (const boundary of ['before-write', 'after-write'] as const) await fixture(async (root, owner) => {
    const f = planFixture();
    const store = await OwnedLanceStore.open(owner, profile, { now: () => 100, point(p) { if (p === boundary) throw Error('private native error'); } }, limits);
    const before = await inspect(root);
    const error = await store.commit(f.plan).catch(e => e);
    assert.ok(denied('STORE_UNAVAILABLE')(error)); assert.doesNotMatch(error.message, /private native error/);
    await store.drainWrites(); assert.equal(store.pendingWrites(), 0);
    await assert.rejects(store.commit(f.plan), denied('STORE_UNAVAILABLE'));
    const after = await inspect(root); assert.equal(after.version, before.version + (boundary === 'after-write' ? 1 : 0));
    await store.close(); await owner.assertOwned();
    const reopened = await OwnedLanceStore.open(owner, profile, { now: () => 100 }, limits);
    try { assert.equal((await reopened.commit(f.plan)).generation, '1'); assert.equal((await inspect(root)).version, before.version + 1); }
    finally { await reopened.close(); }
  });
});
nativeTest(import.meta.url, 'store-writer-timeout-retains-lane-native-work-and-owner-through-close', async () => {
  for (const boundary of ['before-write', 'after-write'] as const) await fixture(async (root, owner) => {
    const reached = deferred(), release = deferred(), f = planFixture(); let closed = false;
    const hooks: StoreOpenHooks = { now: () => 100, timeoutMs: 20, async point(point) { if (point === boundary) { reached.resolve(); await release.promise; } } };
    const store = await OwnedLanceStore.open(owner, profile, hooks, limits);
    const committed = store.commit(f.plan); const rejected = assert.rejects(committed, denied('STORE_UNAVAILABLE'));
    await reached.promise; await rejected; assert.ok(store.pendingWrites() > 0);
    await assert.rejects(store.commit(f.plan), denied('STORE_UNAVAILABLE'));
    const closing = store.close().then(() => { closed = true; });
    await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(closed, false);
    await assert.rejects(acquireOwnership(options(root)), denied('OWNERSHIP_CONFLICT'));
    release.resolve(); await closing; assert.equal(store.pendingWrites(), 0); await owner.assertOwned();
    const reopened = await OwnedLanceStore.open(owner, profile, { now: () => 999 }, limits);
    try { assert.equal((await reopened.commit(f.plan)).generation, '1'); }
    finally { await reopened.close(); }
  });
});
nativeTest(import.meta.url, 'store-writer-bounds-admission-before-copy-and-drains-admitted-retries', async () => {
  await fixture(async (_root, owner) => {
    const reached = deferred(), release = deferred(), f = planFixture();
    const store = await OwnedLanceStore.open(owner, profile, { now: () => 100, async point(p) { if (p === 'before-write') { reached.resolve(); await release.promise; } } }, limits);
    const calls = Array.from({ length: 64 }, () => store.commit(f.plan));
    await reached.promise; assert.equal(store.pendingWrites(), 64);
    let invoked = false; const hostile = Object.defineProperty({}, 'rows', { get() { invoked = true; throw Error('private'); } });
    await assert.rejects(store.commit(hostile), denied('BACKPRESSURE')); assert.equal(invoked, false);
    store.stopAdmission(); await assert.rejects(store.commit(f.plan), denied('STORE_UNAVAILABLE'));
    release.resolve();
    for (const call of calls) assert.equal((await call).generation, '1');
    await store.drainWrites(); assert.equal(store.pendingWrites(), 0); await store.close();
  });
});
nativeTest(import.meta.url, 'store-writer-unverifiable-outcome-retains-process-owner-and-refuses-cold-corruption', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-writer-peer-')));
  const env = { ...process.env }; delete env['NODE_TEST_CONTEXT'];
  const peer = fork(fileURLToPath(new URL('./fixtures/store-writer-peer.ts', import.meta.url)), [root], { execPath: process.execPath, execArgv: ['--import', 'tsx'], env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const exited = once(peer, 'exit'); let stderr = '';
  peer.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4096); });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Writer peer timed out: ' + stderr)), 20_000);
      peer.once('message', value => { clearTimeout(timer); if ((value as { type?: string }).type === 'owner-held') resolve(); else reject(Error('Unexpected peer message.')); });
      peer.once('exit', () => { clearTimeout(timer); reject(Error('Writer peer exited early: ' + stderr)); });
      peer.once('error', error => { clearTimeout(timer); reject(error); });
    });
    await assert.rejects(acquireOwnership(options(root)), denied('OWNERSHIP_CONFLICT'));
  } finally { peer.kill('SIGKILL'); assert.equal((await exited)[1], 'SIGKILL'); }
  try {
    const owner = await acquireOwnership(options(root));
    try { await assert.rejects(OwnedLanceStore.open(owner, profile), denied('STORE_UNAVAILABLE')); }
    finally { await owner.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
