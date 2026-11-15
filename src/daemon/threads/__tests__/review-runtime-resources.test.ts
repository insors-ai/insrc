import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink, access } from 'node:fs/promises';
import { fixture } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { reviewWorkerCheckpoint } from '../review-worker-contract.js';
import { ReviewRuntimeStore, reviewRuntimePath, loadReviewRuntime } from '../review-runtime-store.js';
import { inspectReviewResources, requireClosedReviewResources } from '../../../workflow/review/resource-recovery.js';
import { preparationDigest } from '../../../workflow/review/prepared-context.js';
import type { ReviewRuntime } from '../../../shared/review-preparation.js';

async function setup(t: { after(fn: () => void): void }) {
 const f = await fixture(), key = { project: f.repo, family: 'code' as const, reviewId: 'runtime-resources' }, store = new ReviewRuntimeStore();
 const state: ReviewRuntime = { schemaVersion: 1, key, attempt: 1, runtimeId: 'runtime-1', daemonEpoch: 'epoch', workerIncarnation: 'worker', sequence: 0,
  checkpointBinding: { inputDigest: preparationDigest(f.packet), semanticSequence: 0 }, state: 'initializing', resourceGuard: { daemonInstance: 'epoch', openLeases: [] },
  progress: { completedUnits: 0, totalUnits: null, observedAt: '2026-11-15T00:00:00.000Z', lastMeaningfulActivityAt: null } };
 const handle = await store.initialize(state), path = reviewWorkerCheckpoint(key);
 const cp = { ...f.checkpoint(key.reviewId), schemaVersion: 3, runtime: { runtimeId: state.runtimeId, inputDigest: state.checkpointBinding.inputDigest } };
 await writeFile(path, JSON.stringify(cp));
 t.after(() => { store.release(handle); f.cleanup(); });
 return { f, key, store, handle, path, cp };
}

test('production resource observer reads compact runtime leases without mutating full format-three history', async t => {
 const f = await setup(t); await f.store.activate(f.handle);
 const original = await readFile(f.path);
 t.mock.method(f.f.deps.sources, 'commit', async () => { throw Error('Observer cannot qualify sources'); });
 const reservation = { key: f.key, daemonInstance: 'epoch', workerIncarnation: 'worker', operationId: 'intent', kind: 'git', openedAt: '2026-11-15T00:00:00.000Z', commandDigest: 'a'.repeat(64) };
 await f.store.resource(f.handle, 'open', reservation);
 const observed = await inspectReviewResources(f.key);
 assert.equal(observed.remaining, 1); assert.equal(observed.guards[0]!.resourceGuard.openLeases[0]!.operationId, 'intent');
 await assert.rejects(requireClosedReviewResources(f.key), /review_resources_fenced/);
 assert.deepEqual(await readFile(f.path), original);
 await f.store.resource(f.handle, 'close', reservation, { reservation, disposal: { state: 'confirmed', reason: 'closed' } });
 assert.equal((await inspectReviewResources(f.key)).remaining, 0); await requireClosedReviewResources(f.key);
 assert.deepEqual(await readFile(f.path), original);
});

test('production resource observer refuses missing foreign and half-migrated runtime bindings', async t => {
 const f = await setup(t), runtime = await readFile(reviewRuntimePath(f.key));
 await unlink(reviewRuntimePath(f.key));
 await assert.rejects(inspectReviewResources(f.key), /review_resources_fenced/);
 await assert.rejects(access(reviewRuntimePath(f.key)), /ENOENT/);
 await writeFile(reviewRuntimePath(f.key), runtime);
 await writeFile(f.path, JSON.stringify({ ...f.cp, runtime: { ...f.cp.runtime, runtimeId: 'foreign' } }));
 await assert.rejects(inspectReviewResources(f.key), /review_resources_fenced/);
 await writeFile(f.path, JSON.stringify(f.f.checkpoint(f.key.reviewId)));
 await assert.rejects(inspectReviewResources(f.key), /review_resources_fenced/);
 await unlink(f.path);
 await assert.rejects(inspectReviewResources(f.key), /review_resources_fenced/);
 assert.equal((await loadReviewRuntime(f.key))!.state, 'initializing');
 await assert.rejects(access(f.path), /ENOENT/);
});

test('broker clearance updates only the inactive compact runtime and requires the exact guard digest',async t=>{
 const f=await setup(t);await f.store.activate(f.handle);const before=await readFile(f.path);
 const reservation={key:f.key,daemonInstance:'epoch',workerIncarnation:'worker',operationId:'uncertain-operation',kind:'git',openedAt:'2026-11-15T00:00:00.000Z',commandDigest:'a'.repeat(64)};
 await f.store.resource(f.handle,'open',reservation);const snapshot=await inspectReviewResources(f.key);
 const clearance={at:'2026-11-15T00:01:00.000Z',reason:'Operator verified process disposal',approvalReceipt:{requestId:'approved-clearance',decision:'approve' as const,reviewKey:f.key,guardDigest:snapshot.digest,leaseIds:[reservation.operationId]}};
 await assert.rejects(f.store.clearInactive(f.key,clearance,async()=>{throw Error('Worker still active');}),/still active/);
 await assert.rejects(f.store.clearInactive(f.key,{...clearance,approvalReceipt:{...clearance.approvalReceipt,guardDigest:'f'.repeat(64)}},async()=>{}),/Stale/);
 const {applyReviewResourceClearance}=await import('../../../workflow/review/resource-recovery.js');
 await assert.rejects(applyReviewResourceClearance(f.key,clearance),/main-owned/);
 await f.store.clearInactive(f.key,clearance,async()=>{});
 const after=await inspectReviewResources(f.key);assert.equal(after.remaining,0);assert.deepEqual(after.guards[0]!.resourceGuard.clearance,clearance);
 assert.equal((await loadReviewRuntime(f.key))!.state,'interrupted');assert.deepEqual(await readFile(f.path),before);
 await f.store.clearInactive(f.key,clearance,async()=>{});
});
