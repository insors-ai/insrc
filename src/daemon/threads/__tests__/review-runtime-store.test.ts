import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { ReviewRuntimeStore, reviewRuntimePath } from '../review-runtime-store.js';
import { ReviewNativeHost } from '../review-native-host.js';
import { ReviewWorkerNativeTransport } from '../review-worker-native.js';
import { ReviewProcessLeases } from '../review-processes.js';
import { reviewWorkerCheckpoint } from '../review-worker-contract.js';
import { withReviewNativeTransport } from '../../../shared/review-process-bridge.js';
import { decodeReviewRuntime } from '../../../shared/review-preparation.js';
import type { ReviewRuntime } from '../../../shared/review-preparation.js';
import { fixture } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { writeCheckpoint, CheckpointSaveError } from '../../../workflow/code-review/task-review/checkpoint.js';

async function setup(t: { after: (fn: () => void | Promise<void>) => void }, failOpen = false) {
 const f = await fixture(); t.after(() => f.cleanup());
 const key = { project: f.repo, family: 'code' as const, reviewId: 'compact-runtime' };
 const runtime: ReviewRuntime = { schemaVersion: 1, key, attempt: 1, runtimeId: 'runtime-1', daemonEpoch: 'epoch-1', workerIncarnation: 'worker-1', sequence: 0,
  checkpointBinding: { inputDigest: 'a'.repeat(64), semanticSequence: 0 }, state: 'initializing', resourceGuard: { daemonInstance: 'epoch-1', openLeases: [] },
  progress: { completedUnits: 0, totalUnits: null, observedAt: '2026-11-14T00:00:00.000Z', lastMeaningfulActivityAt: null } };
 const writes: number[] = [];
 const store = new ReviewRuntimeStore(async (path, bytes) => {
  writes.push(Buffer.byteLength(bytes)); await writeCheckpoint(path, bytes);
  if (failOpen && JSON.parse(bytes).resourceGuard.openLeases.length) throw new CheckpointSaveError('uncertain', new Error('injected acknowledgment loss'));
 });
 const handle = await store.initialize(runtime); t.after(() => store.release(handle));
 const cp = { ...f.checkpoint(key.reviewId), schemaVersion: 3, runtime: { runtimeId: runtime.runtimeId, inputDigest: runtime.checkpointBinding.inputDigest } };
 const path = reviewWorkerCheckpoint(key); await writeFile(path, JSON.stringify(cp));
 const read = async () => decodeReviewRuntime(JSON.parse(await readFile(reviewRuntimePath(key), 'utf8')), key);
 return { f, key, runtime, handle, store, writes, path, read };
}

test('compact runtime native host persists intents before spawn and leaves history untouched', async t => {
 const f = await setup(t); await f.store.activate(f.handle);
 const history = await readFile(f.path), { port1, port2 } = new MessageChannel();
 let host!: ReviewNativeHost, spawns = 0;
 const leases = new ReviewProcessLeases({ daemonInstance: f.runtime.daemonEpoch,
  authorize: (r, command) => { assert.equal(command.cwd, f.key.project); assert.equal(r.workerIncarnation, f.runtime.workerIncarnation); spawns++; },
  verifyIntent: async (r, receipt) => { host.verifyIntent(r, receipt); assert.ok((await f.read()).resourceGuard.openLeases.some(l => l.operationId === r.operationId)); },
 });
 const owner = leases.register(f.key, f.runtime.workerIncarnation);
 host = new ReviewNativeHost({ leases, owner, port: port1, persist: (op, r, closure) => f.store.resource(f.handle, op, r, closure), resolveBinary: async c => c, assertActive: () => {}, onLost: () => {} });
 t.after(async () => { await host.flushClosures(); host.dispose(); port2.close(); });
 const native = new ReviewWorkerNativeTransport(port2, { key: f.key, incarnation: f.runtime.workerIncarnation });
 await withReviewNativeTransport(native, async () => { await f.f.deps.sources.commit(f.f.packet.reviewRevision!); await f.f.deps.sources.commit(f.f.packet.reviewRevision!); });
 assert.equal(spawns, 2); assert.equal((await f.read()).resourceGuard.openLeases.length, 0);
 assert.deepEqual(await readFile(f.path), history, 'zero full-history mutations for native operations');
 const beforeProgress = f.writes.length;
 for (let i = 0; i < 100; i++) f.store.publishProgress(f.handle, { progress: { ...f.runtime.progress, observedAt: '2026-11-14T00:01:00.000Z' } });
 await f.store.flushProgress(f.handle);
 assert.equal(f.writes.length, beforeProgress + 1, 'coalesced progress writes once');
 assert.ok(f.writes.every(bytes => bytes <= 256 * 1024));
 assert.deepEqual(await readFile(f.path), history);
});

test('uncertain compact open save prevents spawn and retains the exact fence', async t => {
 const f = await setup(t, true); await f.store.activate(f.handle);
 const { port1, port2 } = new MessageChannel(); let spawns = 0;
 const leases = new ReviewProcessLeases({ daemonInstance: f.runtime.daemonEpoch, authorize: () => { spawns++; }, verifyIntent: () => {} });
 const owner = leases.register(f.key, f.runtime.workerIncarnation);
 const host = new ReviewNativeHost({ leases, owner, port: port1, persist: (op, r, closure) => f.store.resource(f.handle, op, r, closure), resolveBinary: async c => c, assertActive: () => {}, onLost: () => {} });
 t.after(async () => { await host.close(); port1.close(); port2.close(); });
 const native = new ReviewWorkerNativeTransport(port2, { key: f.key, incarnation: f.runtime.workerIncarnation });
 await assert.rejects(withReviewNativeTransport(native, () => f.f.deps.sources.commit(f.f.packet.reviewRevision!)));
 assert.equal(spawns, 0); assert.equal((await f.read()).resourceGuard.openLeases.length, 1);
 assert.equal(host.reclaimable, false);
 assert.throws(() => f.store.publishProgress(f.handle, { progress: f.runtime.progress }), /fenced/);
});

test('runtime initialization and missing or replaced proof never recreate an empty guard', async t => {
 const f = await setup(t);
 await assert.rejects(f.store.initialize(f.runtime), /already exists/);
 await unlink(f.path);
 await assert.rejects(f.store.activate(f.handle), /ENOENT/);
 assert.equal((await f.read()).state, 'initializing');
 assert.throws(() => f.store.publishProgress(f.handle, { progress: f.runtime.progress }), /fenced/);
 const g = await setup(t); await g.store.activate(g.handle);
 await unlink(reviewRuntimePath(g.key));
 g.store.publishProgress(g.handle, { progress: g.runtime.progress });
 await assert.rejects(g.store.flushProgress(g.handle), /ENOENT/);
 await assert.rejects(readFile(reviewRuntimePath(g.key)), /ENOENT/);
});

test('runtime closure requires exact host disposal and cannot be supplied by a progress update', async t => {
 const f = await setup(t); await f.store.activate(f.handle);
 const reservation = { key: f.key, daemonInstance: f.runtime.daemonEpoch, operationId: 'op-1', workerIncarnation: f.runtime.workerIncarnation, kind: 'git', openedAt: '2026-11-14T00:00:00.000Z', commandDigest: 'b'.repeat(64) };
 await f.store.resource(f.handle, 'open', reservation);
 await assert.rejects(f.store.resource(f.handle, 'close', reservation), /disposal/);
 assert.equal((await f.read()).resourceGuard.openLeases.length, 1);
 await f.store.resource(f.handle, 'close', reservation, { reservation, disposal: { state: 'confirmed', reason: 'closed' } });
 assert.equal((await f.read()).resourceGuard.openLeases.length, 0);
 f.store.publishProgress(f.handle, { progress: { ...f.runtime.progress, completedUnits: 1 } });
 await assert.rejects(f.store.flushProgress(f.handle), /cannot authorize/);
});

test('phase progress flush waits for an already running durable update', async t => {
 const f = await setup(t);
 // A distinct review owns its own write lane; this fixture controls only the
 // progress save after init/activation, not the shared history writer.
 const key = { ...f.key, reviewId: 'progress-flush' };
 let entered!: () => void, release!: () => void;
 const saving = new Promise<void>(r => { entered = r; });
 const hold = new Promise<void>(r => { release = r; });
 let count = 0;
 const store = new ReviewRuntimeStore(async (path, bytes) => {
  if (++count === 3) { entered(); await hold; }
  await writeCheckpoint(path, bytes);
 });
 const handle = await store.initialize({ ...f.runtime, key });
 t.after(() => { release(); store.release(handle); });
 const cp = JSON.parse(await readFile(f.path, 'utf8')); cp.reviewId = key.reviewId;
 await writeFile(reviewWorkerCheckpoint(key), JSON.stringify(cp)); await store.activate(handle);
 store.publishProgress(handle, { progress: f.runtime.progress });
 const first = store.flushProgress(handle); await saving;
 let completed = false;
 const second = store.flushProgress(handle).then(() => { completed = true; });
 await new Promise(resolve => setImmediate(resolve)); assert.equal(completed, false);
 release(); await first; await second; assert.equal(completed, true);
});
