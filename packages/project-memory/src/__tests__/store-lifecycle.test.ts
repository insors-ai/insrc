import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setImmediate as tick } from 'node:timers/promises';
import { MemoryError } from '../errors.js';
import { acquireOwnership } from '../ownership.js';
import { EmbeddedMemoryService } from '../runtime.js';
import { ModelDispatcher } from '../model-dispatcher.js';
import { snapshotCommand } from '../queue/codec.js';
import { FileQueue } from '../queue/file-queue.js';
import { OwnedLanceStore } from '../store/lance-store.js';
import { StoreOwnedWork, rollbackStartup } from '../store/lifecycle.js';
import type { StoreOpenPoint } from '../store/lance-store.js';
import { nativeTest } from './fixtures/node22.js';
import { finalCommand, framePlan, integrationFixture, integrationLimits } from './fixtures/store-integration.js';
import { options } from './fixtures/options.js';
import { profile, scope } from './fixtures/store-rows.js';

const code = (value: string) => (error: unknown) => error instanceof MemoryError && error.code === value;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }

nativeTest(import.meta.url, 'store-lifecycle-two-participant-drain-keeps-proofs-live-without-lane-inversion', async () => {
  const reached = deferred(), release = deferred(), events: string[] = [];
  const f = await integrationFixture({ async point(p) { if (p === 'before-write') { reached.resolve(); await release.promise; } if (p === 'close-table') events.push('store-close'); } });
  const owned = new StoreOwnedWork(f.store), config = options(f.root);
  const service = new EmbeddedMemoryService(f.owner, new ModelDispatcher(config.models, 1000), config.logger, [{
    stopAdmission() { f.queue.stopAdmission(); }, pending() { return f.queue.pending(); }, drain() { return f.queue.drain(); },
    async close() {
      // Queue shutdown is allowed to consult authority after both participants stop.
      assert.equal((await f.store.receiptVerifier().byOperation(frame.operationId, scope)).status, 'found');
      await f.queue.close(); events.push('queue-close');
    },
  }, owned]);
  const frame = await f.append(finalCommand('shutdown'));
  try {
    const write = f.store.commit(framePlan(frame, '0', 100)); await reached.promise;
    const proof = f.queue.enqueue(() => f.store.receiptVerifier().byIdentity(snapshotCommand(frame.command, integrationLimits.maxEventBytes).identity));
    await tick(); assert.equal(owned.pending(), 2, 'write and independent proof count once each');
    const drained = await service.drain(5); assert.equal(drained.completed, false); assert.ok(drained.pending >= 2);
    await assert.rejects(f.store.snapshot(scope), code('NOT_READY'));
    const closing = service.close(); assert.equal(service.close(), closing); await tick(); assert.deepEqual(events, []);
    await assert.rejects(acquireOwnership(options(f.root)), code('OWNERSHIP_CONFLICT'));
    release.resolve(); await write; assert.equal((await proof).status, 'found'); await closing;
    assert.deepEqual(events, ['queue-close', 'store-close']); assert.equal(owned.pending(), 0);
    assert.equal((await f.store.receiptVerifier().byOperation(frame.operationId, scope)).status, 'unavailable');
    const next = await acquireOwnership(options(f.root)); await next.close();
  } finally { release.resolve(); await f.close(); }
});

nativeTest(import.meta.url, 'store-lifecycle-read-capture-and-active-projection-count-once-and-cancel-before-return', async () => {
  for (const boundary of ['read-open', 'read-before-final'] as const) {
    const reached = deferred(), release = deferred(); let held = false;
    const f = await integrationFixture({ async point(p) { if (held && p === boundary) { reached.resolve(); await release.promise; } } });
    const owned = new StoreOwnedWork(f.store);
    try {
      const frame = await f.append(finalCommand(boundary)); await f.store.commit(framePlan(frame, '0', 100));
      let read: Promise<unknown>;
      if (boundary === 'read-open') { held = true; read = f.store.snapshot(scope); }
      else { const snapshot = await f.store.snapshot(scope); held = true; read = f.store.current(scope, snapshot); }
      const cancelled = assert.rejects(read, code('NOT_READY'));
      await reached.promise; assert.equal(owned.pending(), 1, 'nested head/capture is already owned by one lease');
      owned.stopAdmission(); let settled = false; const draining = owned.drain().then(() => { settled = true; });
      await tick(); assert.equal(settled, false); assert.equal(owned.pending(), 1);
      release.resolve(); await cancelled; await draining; assert.equal(owned.pending(), 0);
    } finally { release.resolve(); await f.close(); }
  }
});

nativeTest(import.meta.url, 'store-lifecycle-close-wait-stays-pending-and-retains-owner-until-native-handles-close', async () => {
  const reached = deferred(), release = deferred(); let closeCalls = 0;
  const f = await integrationFixture({ async point(p) { if (p === 'close-table') { closeCalls++; reached.resolve(); await release.promise; } } });
  const owned = new StoreOwnedWork(f.store);
  try {
    await f.store.snapshot(scope); assert.equal(owned.pending(), 1, 'idle lease is owned until drain closes it');
    const closing = owned.close(); assert.equal(owned.close(), closing); await reached.promise;
    assert.equal(owned.pending(), 1); await assert.rejects(acquireOwnership(options(f.root)), code('OWNERSHIP_CONFLICT'));
    release.resolve(); await closing; assert.equal(owned.pending(), 0); assert.equal(closeCalls, 1); await f.owner.assertOwned();
  } finally { release.resolve(); await f.close(); }
});

nativeTest(import.meta.url, 'store-lifecycle-startup-rollback-attempts-queue-before-store-and-preserves-original-error', async () => {
  for (const boundary of ['queue-start', 'handoff']) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-rollback-'))), config = options(root), owner = await acquireOwnership(config);
    const events: string[] = [], store = await OwnedLanceStore.open(owner, profile, { point(p) { if (p === 'close-table') events.push('store'); } });
    let injected = false;
    const queue = new FileQueue(owner, root, config.limits, { async after(operation, path) { if (!injected && boundary === 'queue-start' && operation === 'file-sync' && path.startsWith('segments/')) { injected = true; throw Error('injected queue startup'); } } }, store.receiptVerifier());
    try {
      let original: unknown = new MemoryError('POLICY_DENIED', 'original typed failure');
      try { await queue.start(); } catch (error) { original = error; }
      assert.equal(injected, boundary === 'queue-start');
      const queueWork = { stopAdmission() { queue.stopAdmission(); }, pending() { return queue.pending(); }, drain() { return queue.drain(); }, async close() { await queue.close(); events.push('queue'); } };
      await assert.rejects(rollbackStartup(owner, [queueWork, new StoreOwnedWork(store)], original), error => error === original);
      assert.deepEqual(events, ['queue', 'store']);
      const reacquired = await acquireOwnership(config); await reacquired.close();
    } finally { await queue.close(); await store.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
  }
});

nativeTest(import.meta.url, 'store-lifecycle-failed-reader-and-participant-cleanup-attempts-all-handles-and-retains-owner', async () => {
  for (const mode of ['lifecycle-reader', 'lifecycle-orphan', 'lifecycle-rollback']) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-lifecycle-peer-'))), env = { ...process.env }; delete env['NODE_TEST_CONTEXT'];
    const peer = fork(fileURLToPath(new URL('./fixtures/store-cleanup-peer.ts', import.meta.url)), [root, mode], { execPath: process.execPath, execArgv: ['--import', 'tsx'], env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const exited = once(peer, 'exit'); let stderr = '';
    peer.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4096); });
    try {
      const result = await new Promise<{ type: string; calls: StoreOpenPoint[]; pending: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Lifecycle peer timed out: ' + stderr)), 20_000);
        peer.once('message', value => { clearTimeout(timer); resolve(value as { type: string; calls: StoreOpenPoint[]; pending: number }); });
        peer.once('exit', () => { clearTimeout(timer); reject(Error('Lifecycle peer exited early: ' + stderr)); });
        peer.once('error', error => { clearTimeout(timer); reject(error); });
      });
      assert.equal(result.type, 'owner-held'); assert.ok(result.calls.includes('close-table')); assert.ok(result.calls.includes('close-connection'));
      if (mode === 'lifecycle-rollback') assert.equal(result.pending, 0, 'store is closed but failed queue participant prevents owner release');
      else assert.ok(result.pending > 0);
      await assert.rejects(acquireOwnership(options(root)), code('OWNERSHIP_CONFLICT'));
    } finally { peer.kill('SIGKILL'); const [_code, signal] = await exited; assert.equal(signal, 'SIGKILL'); }
    const owner = await acquireOwnership(options(root)); await owner.close(); await rm(root, { recursive: true, force: true });
  }
}, 90_000);
