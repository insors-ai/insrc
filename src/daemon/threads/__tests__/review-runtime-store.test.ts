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
import { fixture, hash } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { persistReviewRuntimeAudit, reviewRuntimeAudits } from '../../../workflow/review/runtime-audit.js';
import { writeCheckpoint, CheckpointSaveError } from '../../../workflow/code-review/task-review/checkpoint.js';

test('cold qualification acknowledges an accepted result prefix at sequence zero without replaying work', async t => {
 const f = await setup(t); await f.store.activate(f.handle);
 const history = await readFile(f.path);
 let verified = 0;
 const receipt = {
  key: f.key, attempt: 1, runtimeId: f.runtime.runtimeId, inputDigest: f.runtime.checkpointBinding.inputDigest,
  checkpointDigest: 'd'.repeat(64), completedUnits: 3,
  binding: { schemaVersion: 1 as const, key: f.key, attempt: 1, generationId: 'a'.repeat(64),
   priorBindingDigest: null, semanticSequence: 0, historyPrefixDigest: 'b'.repeat(64),
   evidenceManifestDigest: 'c'.repeat(64), bindingDigest: 'e'.repeat(64) },
 };
 await f.store.acceptHistory(f.handle, receipt, async () => { verified++; });
 const retained = await f.read();
 assert.equal(verified, 1);
 assert.equal(retained.progress.completedUnits, 3);
 assert.deepEqual(retained.committedResultBoundary, { semanticSequence: 0, historyBindingDigest: receipt.binding.bindingDigest });
 await f.store.acceptHistory(f.handle, receipt, async () => { verified++; });
 assert.equal(verified, 2, 'even a replay is checked against current durable history');
 assert.equal((await f.read()).progress.completedUnits, 3);
 assert.deepEqual(await readFile(f.path), history, 'acknowledgment leaves accepted family history untouched');
});

test('explicit initialization recovery adopts only the exact inactive crash window and never a live owner', async t => {
 const f = await setup(t), second = new ReviewRuntimeStore();
 const replacement = { ...f.runtime, daemonEpoch: 'epoch-restarted', workerIncarnation: 'worker-restarted', resourceGuard: { daemonInstance: 'epoch-restarted', openLeases: [] } };
 let fences = 0;
 await assert.rejects(second.recoverInitialization(replacement, async () => { fences++; }), /live owner/);
 assert.equal(fences, 0);
 f.store.release(f.handle);
 await assert.rejects(second.recoverInitialization({ ...replacement, runtimeId: 'foreign' }, async () => { fences++; }), /outside/);
 const recovered = await second.recoverInitialization(replacement, async () => { fences++; });
 t.after(() => second.release(recovered));
 assert.equal(second.snapshot(recovered).state, 'initializing');
 assert.equal(second.snapshot(recovered).daemonEpoch, 'epoch-restarted');
 await second.activate(recovered);
 assert.equal(second.snapshot(recovered).state, 'active');
 second.release(recovered);
 await assert.rejects(new ReviewRuntimeStore().recoverInitialization(replacement, async () => {}), /outside/);
 assert.equal((await f.read()).state, 'active', 'a refusal never recreates empty initialization');
});

test('initialization recovery retains missing changed and uncertain proof instead of guessing ownership', async t => {
 const f = await setup(t); f.store.release(f.handle);
 const old = await readFile(reviewRuntimePath(f.key), 'utf8');
 let calls = 0;
 await assert.rejects(new ReviewRuntimeStore().recoverInitialization(f.runtime, async () => {
  if (++calls === 2) await writeFile(reviewRuntimePath(f.key), old + ' ');
 }), /proof changed/);
 assert.equal(await readFile(reviewRuntimePath(f.key), 'utf8'), old + ' ');
 await unlink(reviewRuntimePath(f.key));
 await assert.rejects(new ReviewRuntimeStore().recoverInitialization(f.runtime, async () => {}), /ENOENT/);
 await assert.rejects(readFile(reviewRuntimePath(f.key)), /ENOENT/);
});

test('inactive runtime handoff preserves exact old audit before replacement and waits for actual checkpoint rebind', async t => {
 const f = await setup(t); await f.store.activate(f.handle);
 const previous = await f.read(), history = await readFile(f.path); f.store.release(f.handle);
 const store = new ReviewRuntimeStore(), next = { ...f.runtime, runtimeId: 'successor-runtime', workerIncarnation: 'successor-worker' };
 let archived = 0;
 const transferred = await store.replaceInactive(next, async proof => {
  archived++; assert.deepEqual(proof.runtime, previous); assert.equal(proof.checkpointDigest.length, 64);
  assert.equal(JSON.parse(await readFile(reviewRuntimePath(f.key), 'utf8')).runtimeId, previous.runtimeId);
  assert.deepEqual(await readFile(f.path), history);
  await persistReviewRuntimeAudit(f.f.deps.through.store!, `CR-${hash}-s1`, f.key, proof);
  await persistReviewRuntimeAudit(f.f.deps.through.store!, `CR-${hash}-s1`, f.key, proof);
 }, async () => {});
 t.after(() => store.release(transferred.handle));
 assert.equal(archived, 1); assert.equal(store.snapshot(transferred.handle).state, 'initializing');
 const log = await f.f.deps.through.store!.history.log(`CR-${hash}-s1`), audits = reviewRuntimeAudits(log, `CR-${hash}-s1`, f.key);
 assert.equal(audits.length, 1, 'lost-ack archive retry is idempotent'); assert.deepEqual(audits[0]!.runtime, previous);
 const changed = structuredClone(log), auditEntry = changed.find(e => e.id === log[0]!.id)!;
 (auditEntry.outcome!.data as { checkpointDigest: string }).checkpointDigest = 'f'.repeat(64);
 assert.throws(() => reviewRuntimeAudits(changed, `CR-${hash}-s1`, f.key), /identity changed/);
 assert.deepEqual(await readFile(f.path), history, 'main does not become a full-history writer');
 const cp = JSON.parse(history.toString()); cp.runtime.runtimeId = next.runtimeId; await writeFile(f.path, JSON.stringify(cp));
 await store.activate(transferred.handle); assert.equal(store.snapshot(transferred.handle).state, 'active');
});

test('inactive runtime handoff refuses unresolved leases and preserves evidence on failed or stale archive', async t => {
 const f = await setup(t); await f.store.activate(f.handle);
 const reservation = { key: f.key, daemonInstance: f.runtime.daemonEpoch, workerIncarnation: f.runtime.workerIncarnation, operationId: 'open', kind: 'git', openedAt: '2026-11-15T00:00:00.000Z', commandDigest: 'a'.repeat(64) };
 await f.store.resource(f.handle, 'open', reservation); f.store.release(f.handle);
 const store = new ReviewRuntimeStore(), next = { ...f.runtime, runtimeId: 'next-runtime', workerIncarnation: 'next-worker' };
 let archived = 0;
 await assert.rejects(store.replaceInactive(next, async () => { archived++; }, async () => {}), /unresolved/);
 assert.equal(archived, 0); assert.equal((await f.read()).resourceGuard.openLeases.length, 1);
 const g = await setup(t); await g.store.activate(g.handle); const old = await g.read(); g.store.release(g.handle);
 const successor = { ...g.runtime, runtimeId: 'next-runtime', workerIncarnation: 'next-worker' };
 await assert.rejects(store.replaceInactive(successor, async () => { throw Error('Archive durability failed'); }, async () => {}), /Archive durability failed/);
 assert.deepEqual(await g.read(), old);
 await assert.rejects(store.replaceInactive(successor, async () => { await writeFile(g.path, (await readFile(g.path, 'utf8')) + ' '); }, async () => {}), /proof changed/);
 assert.deepEqual(await g.read(), old);
});

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

test('runtime initialization and missing proof never recreate an empty guard', async t => {
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

test('interrupted initialization retains inactive proof and external replacement fences the writer', async t => {
 const f = await setup(t);
 const key = { ...f.key, reviewId: 'interrupted-init' };
 const store = new ReviewRuntimeStore(async (path, bytes) => {
  await writeCheckpoint(path, bytes);
  throw new CheckpointSaveError('uncertain', new Error('lost initialization acknowledgment'));
 });
 await assert.rejects(store.initialize({ ...f.runtime, key }), /uncertain/);
 const retained = JSON.parse(await readFile(reviewRuntimePath(key), 'utf8'));
 assert.equal(retained.state, 'initializing'); assert.deepEqual(retained.resourceGuard.openLeases, []);
 await assert.rejects(new ReviewRuntimeStore().initialize({ ...f.runtime, key }), /already exists/);
 await f.store.activate(f.handle);
 const replaced = await f.read(); replaced.sequence++;
 await writeFile(reviewRuntimePath(f.key), JSON.stringify(replaced));
 f.store.publishProgress(f.handle, { progress: f.runtime.progress });
 await assert.rejects(f.store.flushProgress(f.handle), /replaced outside owner/);
 assert.throws(() => f.store.publishProgress(f.handle, { progress: f.runtime.progress }), /fenced/);
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

test('cancellation preserves accepted history and permits confirmed native closure after stopping admission', async t => {
 const f=await setup(t);await f.store.activate(f.handle);const history=await readFile(f.path),before=f.writes.length;
 const leases=new ReviewProcessLeases({daemonInstance:f.runtime.daemonEpoch,authorize:()=>{},verifyIntent:()=>{}}),owner=leases.register(f.key,f.runtime.workerIncarnation);
 t.after(async()=>{await leases.close(owner);if(leases.recheck(owner))leases.release(owner);});
 const reservation=leases.reserve(owner,1,{kind:'cancellation-fixture',command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:f.f.repo});
 const receipt=await f.store.resource(f.handle,'open',reservation),run=leases.start(owner,1,receipt,async()=>{});
 assert.equal((await run.started).spawned,true);
 const cancelling=await f.store.beginCancellation(f.handle,'cancel-1','Fixture user cancellation');
 assert.equal(cancelling.cancellation!.operationState,'cancelling');
 assert.deepEqual(await readFile(f.path),history);
 await assert.rejects(f.store.finishCancellation(f.handle,false,false),/not reclaimed/);
 assert.equal(f.store.snapshot(f.handle).cancellation!.operationState,'cancelling');
 await leases.close(owner);await run.result;
 assert.ok(f.writes.length>before);
});

test('durable cancellation allows exact closure and reports a resource fence until disposal is confirmed',async t=>{
 const f=await setup(t);await f.store.activate(f.handle);const history=await readFile(f.path);
 const leases=new ReviewProcessLeases({daemonInstance:f.runtime.daemonEpoch,authorize:()=>{},verifyIntent:()=>{}}),owner=leases.register(f.key,f.runtime.workerIncarnation);
 t.after(async()=>{await leases.close(owner);if(leases.recheck(owner))leases.release(owner);});
 const reservation=leases.reserve(owner,1,{kind:'cancel-tool',command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:f.f.repo});
 const receipt=await f.store.resource(f.handle,'open',reservation),run=leases.start(owner,1,receipt,async()=>{});await run.started;
 const initial=await f.store.beginCancellation(f.handle,'cancel-1','Stop only this review');
 assert.equal((await f.store.beginCancellation(f.handle,'cancel-1','Stop only this review')).cancellation!.requestedAt,initial.cancellation!.requestedAt);
 const late=leases.reserve(owner,2,{kind:'late-spawn',command:process.execPath,args:['-e','process.exit(0)'],cwd:f.f.repo});
 await assert.rejects(f.store.resource(f.handle,'open',late),/admission closed/);
 f.store.publishProgress(f.handle,{progress:{...f.runtime.progress,observedAt:'2026-11-14T01:00:00.000Z'}});
 const fenced=await f.store.finishCancellation(f.handle,true,false);assert.equal(fenced.cancellation!.operationState,'resource_fenced');
 await leases.close(owner);const outcome=await run.result;assert.equal(outcome.disposal.state,'confirmed');assert.ok(outcome.disposal.state==='confirmed');
 await f.store.resource(f.handle,'close',reservation,{reservation,disposal:outcome.disposal});
 const stopped=await f.store.finishCancellation(f.handle,true,true);assert.equal(stopped.cancellation!.operationState,'stopped');assert.equal(stopped.resourceGuard.openLeases.length,0);
 assert.deepEqual(await readFile(f.path),history);assert.equal(stopped.progress.completedUnits,0);
 const writes=f.writes.length;f.store.snapshot(f.handle);f.store.snapshot(f.handle);assert.equal(f.writes.length,writes,'observation does not write or create activity');
});

test('cancellation while spawn authorization is pending prevents the model CLI from launching',async t=>{
 const f=await setup(t);await f.store.activate(f.handle);let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),waiting=new Promise<void>(resolve=>{entered=resolve;});
 const leases=new ReviewProcessLeases({daemonInstance:f.runtime.daemonEpoch,authorize:async()=>{entered();await gate;},verifyIntent:()=>{}}),owner=leases.register(f.key,f.runtime.workerIncarnation);
 t.after(async()=>{release();await leases.close(owner);if(leases.recheck(owner))leases.release(owner);});
 const reservation=leases.reserve(owner,1,{kind:'cli',command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:f.f.repo});
 const receipt=await f.store.resource(f.handle,'open',reservation),run=leases.start(owner,1,receipt,async()=>{});await waiting;
 await f.store.beginCancellation(f.handle,'cancel-spawn','Cancel while authorization is in flight');
 const closing=leases.close(owner);release();await closing;
 assert.equal((await run.started).spawned,false);const outcome=await run.result;assert.equal(outcome.disposal.state,'confirmed');assert.ok(outcome.disposal.state==='confirmed');
 await f.store.resource(f.handle,'close',reservation,{reservation,disposal:outcome.disposal});
 assert.equal((await f.store.finishCancellation(f.handle,true,true)).cancellation!.operationState,'stopped');
 assert.equal(f.store.snapshot(f.handle).progress.completedUnits,0);
});

test('cancellation aborts an in-flight model CLI without replaying it or changing accepted history',async t=>{
 const f=await setup(t);await f.store.activate(f.handle);const history=await readFile(f.path);let entered!:()=>void,spawns=0;
 const waiting=new Promise<void>(resolve=>{entered=resolve;});
 const leases=new ReviewProcessLeases({daemonInstance:f.runtime.daemonEpoch,authorize:()=>{spawns++;},verifyIntent:()=>{}}),owner=leases.register(f.key,f.runtime.workerIncarnation);
 t.after(async()=>{await leases.close(owner);if(leases.recheck(owner))leases.release(owner);});
 const reservation=leases.reserve(owner,1,{kind:'cli',command:process.execPath,args:['-e',"process.stdout.write('model request in flight');setInterval(()=>{},1000)"],cwd:f.f.repo});
 const receipt=await f.store.resource(f.handle,'open',reservation),run=leases.start(owner,1,receipt,async output=>{if(Buffer.from(output.bytes).toString().includes('model request'))entered();});
 assert.equal((await run.started).spawned,true);await waiting;
 await f.store.beginCancellation(f.handle,'cancel-model','Cancel an in-flight model request');await leases.close(owner);
 const outcome=await run.result;assert.equal(outcome.aborted,true);assert.equal(outcome.disposal.state,'confirmed');assert.ok(outcome.disposal.state==='confirmed');
 await f.store.resource(f.handle,'close',reservation,{reservation,disposal:outcome.disposal});
 assert.equal((await f.store.finishCancellation(f.handle,true,true)).cancellation!.operationState,'stopped');assert.equal(spawns,1);
 assert.deepEqual(await readFile(f.path),history);
});
