import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, hash } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { prepareReviewPacket } from '../../code-review/task-review/packet.js';
import { validateResultOrigins } from '../../code-review/task-review/results.js';
import { completedSummary } from '../../code-review/task-review/summary.js';
import { validateTaskBody, codeReviewPreservationDigest } from '../../code-review/task-review/record.js';
import { writeReviewBytes, CheckpointSaveError } from '../../code-review/task-review/checkpoint.js';
import { ReviewRuntimeStore, reviewRuntimePath } from '../../../daemon/threads/review-runtime-store.js';
import { reviewWorkerCheckpoint } from '../../../daemon/threads/review-worker-contract.js';
import { ReviewContextRegistry } from '../../../daemon/threads/review-context-registry.js';
import { ReviewSourceSession, ReviewPreparationCapacity } from '../source-session.js';
import { writePreparedContext, preparationDigest, contextRoot } from '../prepared-context.js';
import { HistoryEvidenceStore } from '../history-evidence.js';
import { HistoryBindingSession, verifyHistoryBoundaryReceipt } from '../history-binding.js';
import type { HistoryBoundaryReceipt } from '../history-binding.js';
import { codeHistoryFeedback, designHistoryFeedback } from '../history-feedback.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import type { ReviewRuntime } from '../../../shared/review-preparation.js';
import { designFixture } from '../design-review/__tests__/fixtures.js';
import { consolidateDesignReview } from '../design-review/results.js';

const time = '2026-11-14T00:00:00.000Z';
function runtime(key: ReviewRuntime['key'], inputDigest: string, total: number): ReviewRuntime {
 return { schemaVersion: 1, key, attempt: 1, runtimeId: 'runtime-1', daemonEpoch: 'epoch', workerIncarnation: 'worker', sequence: 0,
  checkpointBinding: { inputDigest, semanticSequence: 0 }, state: 'initializing', resourceGuard: { daemonInstance: 'epoch', openLeases: [] },
  progress: { completedUnits: 0, totalUnits: total, observedAt: time, lastMeaningfulActivityAt: null } };
}
async function code(t: { after: (fn: () => void | Promise<void>) => void }) {
 const f = await fixture(true, 2), cleanups: (() => void | Promise<void>)[] = [];
 t.after(async () => { try { for (const close of cleanups.reverse()) await close(); } finally { f.cleanup(); } });
 f.put('extra.js', 'export const context = true;\n'); f.git('add', '.'); f.git('commit', '-qm', 'extra context');
 f.packet.reviewRevision = f.git('rev-parse', 'HEAD'); await f.refreshBinding();
 const key = { project: f.repo, family: 'code' as const, reviewId: 'bound-history' }, limits = reviewPreparationLimits(join(f.repo, 'missing-config.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const source = await ReviewSourceSession.create(key, f.deps.sources, limits, capacity); cleanups.push(() => source.close());
 const prepared = await prepareReviewPacket(f.packet, source, true), inputDigest = preparationDigest(f.packet);
 const receipt = await writePreparedContext({ key, attempt: 1, inputDigest, validatorVersion: 1, routeDigest: preparationDigest(f.packet.documents), sourceIdentity: preparationDigest(f.packet.reviewRevision), scopeDigest: prepared.projection!.identity, testDocumentDigest: preparationDigest([f.packet.tests, f.packet.documents]) }, { current: prepared }, source, limits, capacity);
 const registry = new ReviewContextRegistry('epoch', async () => {}, async () => {}, async r => capacity.assertReserved(r.capacityToken, r.storedBytes));
 const owner = await registry.attach({ key, incarnation: 'worker', attempt: 1, phase: 'execution' });
 const identity = { key, attempt: 1, inputDigest, validatorVersion: 1, routeDigest: preparationDigest(f.packet.documents), sourceIdentity: preparationDigest(f.packet.reviewRevision), scopeDigest: prepared.projection!.identity, testDocumentDigest: preparationDigest([f.packet.tests, f.packet.documents]) };
 await registry.qualify(owner, identity, receipt); const access = (await registry.borrow(owner, identity)).access;
 cleanups.push(() => registry.detach(owner));
 const store = new ReviewRuntimeStore(), state = runtime(key, inputDigest, 2), handle = await store.initialize(state); cleanups.push(() => store.release(handle));
 const cp = { ...f.checkpoint(key.reviewId), schemaVersion: 3, runtime: { runtimeId: state.runtimeId, inputDigest } };
 cp.attempts[0]!['review-response'].tasks = []; delete cp.attempts[0]!.header.completedAt;
 const path = reviewWorkerCheckpoint(key); await writeReviewBytes(path, JSON.stringify(cp), 8 * 1024 * 1024); await store.activate(handle);
 const read = async () => JSON.parse(await readFile(path, 'utf8'));
 const result = (taskId: string) => ({ ...structuredClone(f.result), taskId, inspectedReferences: [`${f.packet.reviewRevision}:source.js`], testCoverage: { ...f.result.testCoverage, evidenceReferences: [`${f.packet.reviewRevision}:test.js`] } });
 const publication = async (next: Parameters<ReturnType<typeof codeHistoryFeedback>>[0]) => {
  const body = validateTaskBody(JSON.parse(await readFile(join(f.repo, `.insrc/artifacts/CR-${hash}-s1.json`), 'utf8')).body);
  assert.deepEqual(body.reviews[0]!.tasks, (next.attempts.at(-1) as any)['review-response'].tasks);
  assert.deepEqual(body.reviews[0]!.scope.reviewSet, f.packet.reviewSet);
  return { publication: { artifactId: `CR-${hash}-s1`, preservationDigest: codeReviewPreservationDigest(body) } };
 };
 const validate = codeHistoryFeedback(new Map([[1, prepared]]), source, publication);
 const authorize = () => registry.resolve(owner, access);
 const acceptRuntime = (proof: HistoryBoundaryReceipt) => store.acceptHistory(handle, proof, async () => verifyHistoryBoundaryReceipt(proof, await authorize()));
 return { f, source, capacity, receipt, prepared, store, handle, key, path, cp, read, result, validate, authorize, acceptRuntime, limits, publication, invalidateSource: async (error: unknown) => { await registry.invalidate(owner, access); throw error; } };
}

test('successive code feedback resolves only new evidence and publication advances history without rebuilding source', async t => {
 const f = await code(t), history = await HistoryBindingSession.open(f.receipt, f.cp, { authorize: f.authorize, validate: f.validate, capacity: f.capacity, limits: f.limits, invalidateSource: f.invalidateSource });
 await f.acceptRuntime(history.latest()); const physical = f.source.snapshot().physicalQueries;
 let cp = await f.read(); cp.attempts[0]['review-response'].tasks.push(f.result('t1'));
 const first = await history.accept(cp); await f.acceptRuntime(first); assert.equal(f.source.snapshot().physicalQueries, physical);
 cp = await f.read(); const second = f.result('t2'); second.inspectedReferences.push(`${f.f.packet.reviewRevision}:extra.js`);
 cp.attempts[0]['review-response'].tasks.push(second); cp.attempts[0].header.status = 'passed'; cp.attempts[0].header.completedAt = time;
 const complete = await history.accept(cp); await f.acceptRuntime(complete);
 assert.equal(f.source.snapshot().physicalQueries, physical + 1, 'only the new context file is fetched');
 cp = await f.read();
 f.f.put(`.insrc/artifacts/CR-${hash}-s1.json`, { meta: { workflow: 'code-review', schemaVersion: 3 }, body: { kind: 'code-review', format: 'task-based', storyId: 's1', status: 'passed', reviews: [completedSummary(f.prepared, cp.attempts[0], f.key.reviewId)] } });
 cp.attempts[0]['review-response'].crPublication = 'complete';
 const published = await history.accept(cp); await f.acceptRuntime(published);
 assert.equal(f.source.snapshot().physicalQueries, physical + 1);
 assert.equal(published.binding.generationId, first.binding.generationId);
 assert.equal(published.binding.priorBindingDigest, complete.binding.bindingDigest);
 const state = JSON.parse(await readFile(reviewRuntimePath(f.key), 'utf8'));
 assert.equal(state.progress.completedUnits, 2); assert.equal(state.publicationBoundary.semanticSequence, published.binding.semanticSequence);
 assert.equal(state.committedResultBoundary.semanticSequence, complete.binding.semanticSequence);
 const evidence = await HistoryEvidenceStore.open(f.receipt, f.capacity, f.limits, f.authorize, f.invalidateSource, published.binding.evidenceManifestDigest);
 await f.source.close();
 const reopened = await HistoryBindingSession.open(f.receipt, await f.read(), {
  authorize: f.authorize, capacity: f.capacity, limits: f.limits, invalidateSource: f.invalidateSource,
  validate: codeHistoryFeedback(new Map([[1, f.prepared]]), evidence.sources(), f.publication),
 });
 assert.equal(reopened.latest().binding.bindingDigest, published.binding.bindingDigest);
 assert.equal(f.source.snapshot().physicalQueries, physical + 1, 'fresh history validator reuses durable evidence after source worker reclamation');
 const root = join(contextRoot(f.key), 'history-evidence');
 const manifest = JSON.parse(await readFile(join(root, complete.binding.evidenceManifestDigest + '.json'), 'utf8'));
 const payload = manifest.objects[0].contentDigest;
 await writeFile(join(root, payload + '.data'), 'corrupt');
 await assert.rejects(evidence.sources().file(f.f.packet.reviewRevision!, 'extra.js'), /digest mismatch/);
 assert.equal(f.source.snapshot().physicalQueries, physical + 1, 'corruption cannot silently refetch source');


});

test('accepted feedback or pinned attribution edits fence descendants without another source call', async t => {
 const f = await code(t), history = await HistoryBindingSession.open(f.receipt, f.cp, { authorize: f.authorize, validate: f.validate, capacity: f.capacity, limits: f.limits, invalidateSource: f.invalidateSource });
 const cp = await f.read(); cp.attempts[0]['review-response'].tasks.push(f.result('t1')); await history.accept(cp);
 const before = f.source.snapshot().physicalQueries, bad = await f.read(); bad.attempts[0]['review-response'].tasks[0].summary = 'rewritten';
 await assert.rejects(history.accept(bad), /Accepted task feedback changed/);
 assert.throws(() => history.latest(), /fenced/); await assert.rejects(history.accept(await f.read()), /fenced/);
 assert.equal(f.source.snapshot().physicalQueries, before);
 const attributed = await code(t), bound = await HistoryBindingSession.open(attributed.receipt, attributed.cp, { authorize: attributed.authorize, validate: attributed.validate, capacity: attributed.capacity, limits: attributed.limits, invalidateSource: attributed.invalidateSource });
 const changed = await attributed.read(), queries = attributed.source.snapshot().physicalQueries;
 changed.attempts[0].header.attributionIdentity = '0'.repeat(64);
 await assert.rejects(bound.accept(changed), /Accepted mapping\/decision binding mismatch|Accepted attribution changed/);
 assert.throws(() => bound.latest(), /fenced/);
 assert.equal(attributed.source.snapshot().physicalQueries, queries);
});

test('lost checkpoint acknowledgment reconciles a durable result and lagging runtime without repeating model or source work', async t => {
 const f = await code(t); let lose = false, modelCalls = 0;
 const provider = { runReviewSession: async () => { modelCalls++; return f.result('t1'); } };
 const history = await HistoryBindingSession.open(f.receipt, f.cp, { authorize: f.authorize, validate: f.validate, capacity: f.capacity, limits: f.limits, invalidateSource: f.invalidateSource,
  write: async (path, bytes, limit, io) => { await writeReviewBytes(path, bytes, limit, io); if (lose && path === f.path) { lose = false; throw new CheckpointSaveError('replaced', new Error('lost ack')); } } });
 await f.acceptRuntime(history.latest()); const physical = f.source.snapshot().physicalQueries;
 const cp = await f.read(); cp.attempts[0]['review-response'].tasks.push(await provider.runReviewSession()); lose = true;
 await assert.rejects(history.accept(cp), /reconciliation/);
 assert.equal(JSON.parse(await readFile(reviewRuntimePath(f.key), 'utf8')).progress.completedUnits, 0);
 const reconciled = await history.reconcile(); await f.acceptRuntime(reconciled); await f.acceptRuntime(reconciled);
 assert.equal(modelCalls, 1); assert.equal(f.source.snapshot().physicalQueries, physical);
 assert.equal(JSON.parse(await readFile(reviewRuntimePath(f.key), 'utf8')).progress.completedUnits, 1);
});

test('accepted task origins cannot be removed or rewritten by a successor', async t => {
 for (const change of ['remove', 'rewrite']) await t.test(change, async t => {
 const f = await code(t);
 // Isolate prefix immutability: origin validity is independently exercised by
 // the concrete family validator below; this fixture models its accepted output.
 const cp = await f.read(); cp.attempts[0]['review-response'].tasks.push(f.result('t1'));
 cp.attempts[0]['review-response'].origins = [{ taskId: 't1', sourceAttempt: 1, reason: 'accepted provenance fixture' }];
 await writeReviewBytes(f.path, JSON.stringify(cp), 8 * 1024 * 1024);
 const history = await HistoryBindingSession.open(f.receipt, cp, { authorize: f.authorize, validate: async () => ({}), capacity: f.capacity, limits: f.limits, invalidateSource: f.invalidateSource });
 const next = await f.read();
 if (change === 'remove') delete next.attempts[0]['review-response'].origins;
 else next.attempts[0]['review-response'].origins[0].reason = 'rewritten provenance';
 await assert.rejects(history.accept(next), /Accepted task origins changed/);
 assert.throws(() => history.latest(), /fenced/);
 });
});

test('new feedback cannot reuse an absent or current-attempt origin', async t => {
 const f = await code(t), history = await HistoryBindingSession.open(f.receipt, f.cp, { authorize: f.authorize, validate: f.validate, capacity: f.capacity, limits: f.limits, invalidateSource: f.invalidateSource });
 const cp = await f.read(); cp.attempts[0]['review-response'].tasks.push(f.result('t1')); cp.attempts[0]['review-response'].origins = [{ taskId: 't1', sourceAttempt: 1, reason: 'invalid reuse fixture' }];
 await assert.rejects(history.accept(cp), /Origin/);
 assert.equal((await f.read()).attempts[0]['review-response'].tasks.length, 0);
 assert.throws(() => validateResultOrigins([
  { attempt: 1, reviewer: 'daemon', tasks: [], origins: [] },
  { attempt: 2, reviewer: 'daemon', tasks: [f.result('t1')], origins: [{ taskId: 't1', sourceAttempt: 1, reason: 'absent prior result' }] },
 ]), /Origin/);

});

test('design plan and dependency-ordered chunk results get successor bindings without changing source generation', async t => {
 const f = designFixture(t), limits = reviewPreparationLimits(join(f.repo, 'missing-config.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const key = { project: f.repo, family: 'design' as const, reviewId: f.checkpoint.reviewId }, inputDigest = preparationDigest(f.checkpoint.submitted);
 const receipt = await writePreparedContext({ key, attempt: 1, inputDigest, validatorVersion: 1, routeDigest: preparationDigest(f.prepared.subject.workflow), sourceIdentity: preparationDigest(f.prepared.baseline), scopeDigest: preparationDigest(f.prepared.inventory), testDocumentDigest: preparationDigest(f.prepared.baseline) }, { design: f.prepared }, undefined, limits, capacity);
 const state = runtime(key, inputDigest, 2), store = new ReviewRuntimeStore(), handle = await store.initialize(state); t.after(() => store.release(handle));
 const initial = { ...f.checkpoint, schemaVersion: 3, runtime: { runtimeId: state.runtimeId, inputDigest } }, path = reviewWorkerCheckpoint(key);
 await writeReviewBytes(path, JSON.stringify(initial), 8 * 1024 * 1024); await store.activate(handle);
 const history = await HistoryBindingSession.open(receipt, initial, { authorize: async () => receipt, validate: designHistoryFeedback(), capacity, limits, invalidateSource: async error => { throw error; } });
 const accept = (proof: HistoryBoundaryReceipt) => store.acceptHistory(handle, proof, () => verifyHistoryBoundaryReceipt(proof, receipt));
 await accept(history.latest());
 const selectors = f.prepared.inventory.units.map(u => u.id), cp = JSON.parse(await readFile(path, 'utf8'));
 cp.attempts[0].plan = { chunks: [{ id: 'content', title: 'Content', selectors, concerns: ['Requirements'], dependsOn: [], purpose: 'substantive' }, { id: 'final', title: 'Consistency', selectors: [], concerns: ['Consistency'], dependsOn: ['content'], purpose: 'consistency' }], coverageExplanation: 'Complete scope and final consistency', finalConsistencyChunkId: 'final', coverage: selectors.map(unitId => ({ unitId, chunkIds: ['content'] })) };
 await accept(await history.accept(cp));
 cp.attempts[0].completedChunks.push({ chunkId: 'content', status: 'passed', summary: 'Checked content', findings: [], inspectedReferences: [...selectors, f.md], limitations: [], advice: [] });
 await accept(await history.accept(cp));
 cp.attempts[0].completedChunks.push({ chunkId: 'final', status: 'passed', summary: 'Checked consistency', findings: [], inspectedReferences: [f.md, path], limitations: [], advice: [] });
 cp.attempts[0].report = consolidateDesignReview(key.reviewId, 1, f.prepared.subject, f.prepared.baseline.contentIdentity, cp.attempts[0].plan, cp.attempts[0].completedChunks);
 cp.attempts[0].status = 'passed'; cp.attempts[0].finishedAt = time;
 const proof = await history.accept(cp); await accept(proof);
 assert.equal(proof.binding.generationId, receipt.generationId); assert.equal(proof.completedUnits, 2);
 assert.equal(JSON.parse(await readFile(reviewRuntimePath(key), 'utf8')).progress.completedUnits, 2);
});

test('cancellation during publication bookkeeping preserves committed feedback and publication proof without accepting a late runtime boundary',async t=>{
 const f=await code(t);let hold=false,entered!:()=>void,release!:()=>void;
 const waiting=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});t.after(()=>release());
 const history=await HistoryBindingSession.open(f.receipt,f.cp,{authorize:f.authorize,validate:f.validate,capacity:f.capacity,limits:f.limits,invalidateSource:f.invalidateSource,
  write:async(path,bytes,limit,io)=>{if(hold&&path===f.path){entered();await gate;}await writeReviewBytes(path,bytes,limit,io);}});
 await f.acceptRuntime(history.latest());let cp=await f.read();cp.attempts[0]['review-response'].tasks.push(f.result('t1'),f.result('t2'));cp.attempts[0].header.status='passed';cp.attempts[0].header.completedAt=time;
 await f.acceptRuntime(await history.accept(cp));cp=await f.read();
 const permanentPath=join(f.f.repo,`.insrc/artifacts/CR-${hash}-s1.json`);
 f.f.put(`.insrc/artifacts/CR-${hash}-s1.json`,{meta:{workflow:'code-review',schemaVersion:3},body:{kind:'code-review',format:'task-based',storyId:'s1',status:'passed',reviews:[completedSummary(f.prepared,cp.attempts[0],f.key.reviewId)]}});
 const permanent=await readFile(permanentPath,'utf8'),before=await f.read(),physical=f.source.snapshot().physicalQueries;
 cp.attempts[0]['review-response'].crPublication='complete';hold=true;const publishing=history.accept(cp);await waiting;
 assert.equal((await f.read()).attempts[0]['review-response'].crPublication,'pending','publication bookkeeping is in flight');
 await f.store.beginCancellation(f.handle,'cancel-publication','Stop this review during publication bookkeeping');
 release();const publication=await publishing;
 await assert.rejects(f.acceptRuntime(publication),/history admission closed/);
 assert.equal(f.store.snapshot(f.handle).progress.completedUnits,2);assert.equal(f.store.snapshot(f.handle).publicationBoundary,undefined);
 const after=await f.read();assert.deepEqual(after.attempts[0].submitted,before.attempts[0].submitted);assert.deepEqual(after.attempts[0]['review-response'].tasks,before.attempts[0]['review-response'].tasks);
 assert.equal(after.attempts[0]['review-response'].crPublication,'complete');assert.equal(await readFile(permanentPath,'utf8'),permanent);
 assert.equal(f.source.snapshot().physicalQueries,physical);
 assert.equal((await f.store.finishCancellation(f.handle,true,true)).cancellation!.operationState,'stopped');
});
