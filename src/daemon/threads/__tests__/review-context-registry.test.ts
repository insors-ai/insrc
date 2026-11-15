import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { prepareReviewPacket } from '../../../workflow/code-review/task-review/packet.js';
import { designFixture } from '../../../workflow/review/design-review/__tests__/fixtures.js';
import { prepareDesignSubject, assertDesignSubjectUnchanged } from '../../../workflow/review/design-review/subject.js';
import { ReviewSourceSession, ReviewPreparationCapacity } from '../../../workflow/review/source-session.js';
import { writePreparedContext, PreparedContextReader, preparationDigest, sourceGeneration, contextRoot, PreparedContextWriteError } from '../../../workflow/review/prepared-context.js';
import type { PreparedSourceIdentity } from '../../../workflow/review/prepared-context.js';
import { ReviewContextRegistry } from '../review-context-registry.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import { writeReviewBytes } from '../../../workflow/code-review/task-review/checkpoint.js';
import { MessageChannel } from 'node:worker_threads';
import { ThreadServices } from '../main-services.js';
import { startWorker } from '../workers.js';
import type { StartedWorker } from '../workers.js';
import { serveHub } from '../channel.js';

async function code(t: { after: (fn: () => void | Promise<void>) => void }) {
 const f = await fixture(), limits = reviewPreparationLimits(join(f.repo, 'missing-config.json')), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const key = { project: f.repo, family: 'code' as const, reviewId: 'prepared-code' }, session = await ReviewSourceSession.create(key, f.deps.sources, limits, capacity);
 t.after(async () => { try { await session.close(); } finally { f.cleanup(); } });
 const prepared = await prepareReviewPacket(f.packet, session, true);
 const identity: PreparedSourceIdentity = { key, attempt: 1, inputDigest: preparationDigest(f.packet), validatorVersion: 1, routeDigest: preparationDigest(f.packet.documents), sourceIdentity: preparationDigest(f.packet.reviewRevision), scopeDigest: prepared.projection!.identity, testDocumentDigest: preparationDigest([f.packet.tests, f.packet.documents]) };
 return { f, limits, capacity, key, session, prepared, identity };
}

test('qualified context becomes ready atomically and survives warm phase handoff without source reconstruction', async t => {
 const f = await code(t); let release!: () => void, entered!: () => void;
 const barrier = new Promise<void>(r => { release = r; }), writing = new Promise<void>(r => { entered = r; });
 const pending = writePreparedContext(f.identity, { current: f.prepared }, f.session, f.limits, f.capacity, {
  write: writeReviewBytes, rename: async (stage, ready) => {
   const manifest = JSON.parse(await readFile(join(String(stage), 'manifest.json'), 'utf8'));
   assert.equal(manifest.identityDigest, sourceGeneration(f.identity));
   for (const object of manifest.objects) assert.ok((await lstat(join(String(stage), `${object.contentDigest}.data`))).isFile());
   await assert.rejects(lstat(ready), /ENOENT/); entered(); await barrier;
   const { rename } = await import('node:fs/promises'); await rename(stage, ready);
  },
 });
 await writing; release(); const receipt = await pending;
 let freshness = 0; const disposed = new Set<string>();
 const registry = new ReviewContextRegistry('epoch-1', async identity => { freshness++; assert.deepEqual(identity.key, f.key); }, async identity => { if (!disposed.has(identity.incarnation)) throw new Error('Native borrower still active'); }, async r => f.capacity.assertReserved(r.capacityToken, r.storedBytes));
 const execution = await registry.attach({ key: f.key, incarnation: 'execution', attempt: 1, phase: 'execution' });
 await assert.rejects(registry.borrow(execution, f.identity), /Cold qualification/);
 await registry.qualify(execution, f.identity, receipt);
 const borrowed = await registry.borrow(execution, f.identity);
 await assert.rejects(registry.resolve({ identity: execution.identity }, borrowed.access), /private context owner/);
 await assert.rejects(registry.release(execution, borrowed.access), /still active/);
 assert.throws(() => registry.evict(receipt.generationId), /borrowed/);
 const physical = f.session.snapshot().physicalQueries;
 await f.session.close(); disposed.add('execution'); await registry.detach(execution);
 const publication = await registry.attach({ key: f.key, incarnation: 'publication', attempt: 1, phase: 'publication' });
 const warm = await registry.borrow(publication, f.identity);
 const reader = await PreparedContextReader.open(warm.receipt, f.limits, async () => { await registry.resolve(publication, warm.access); }, async () => registry.invalidate(publication, warm.access));
 const restored = await reader.view('current') as typeof f.prepared;
 assert.equal(restored.projection!.identity, f.prepared.projection!.identity);
 assert.deepEqual(restored.packet, f.prepared.packet);
 assert.deepEqual([...restored.originChanges[0]!.after!.bytes], [...f.prepared.originChanges[0]!.after!.bytes]);
 const source = await reader.query('file', [f.f.packet.reviewSet[0]!.commit, 'source.js']) as { bytes: Uint8Array };
 assert.equal(Buffer.from(source.bytes).toString(), 'export const total = 2;\n');
 assert.equal(f.session.snapshot().physicalQueries, physical); assert.ok(freshness >= 5);
 disposed.add('publication'); await registry.detach(publication);
 const evicted = registry.evict(receipt.generationId); await rm(join(contextRoot(f.key), evicted.generationId), { recursive: true }); await f.capacity.release(evicted.capacityToken);
 assert.equal(f.capacity.bytes, 0);
});

test('cold daemon receipts and tampered prepared objects cannot authorize reuse', async t => {
 const f = await code(t), receipt = await writePreparedContext(f.identity, { current: f.prepared }, f.session, f.limits, f.capacity);
 const registry = new ReviewContextRegistry('epoch-1', async () => {}, async () => {}, async r => f.capacity.assertReserved(r.capacityToken, r.storedBytes));
 const owner = await registry.attach({ key: f.key, incarnation: 'owner', attempt: 1, phase: 'execution' });
 await assert.rejects(registry.qualify(owner, f.identity, { ...receipt, capacityToken: '00000000-0000-0000-0000-000000000000' }), /capacity receipt/);
 await registry.qualify(owner, f.identity, receipt); const borrow = await registry.borrow(owner, f.identity);
 await assert.rejects(registry.resolve(owner, { ...borrow.access, daemonEpoch: 'old' }), /Unissued/);
 const cold = new ReviewContextRegistry('epoch-2', async () => {}, async () => {}, async r => f.capacity.assertReserved(r.capacityToken, r.storedBytes)), next = await cold.attach({ ...owner.identity, incarnation: 'new-worker' });
 await assert.rejects(cold.borrow(next, f.identity), /Cold qualification/);
 await assert.rejects(cold.resolve(next, borrow.access), /Unissued/);
 const reader = await PreparedContextReader.open(receipt, f.limits, async () => { await registry.resolve(owner, borrow.access); }, async () => registry.invalidate(owner, borrow.access));
 const manifest = JSON.parse(await readFile(join(contextRoot(f.key), receipt.generationId, 'manifest.json'), 'utf8'));
 const root = manifest.views.find((v: { id: string }) => v.id === 'current').objectDigests[0];
 await writeFile(join(contextRoot(f.key), receipt.generationId, `${root}.data`), 'tampered');
 await assert.rejects(reader.view('current'), /size|digest/);
 await assert.rejects(registry.resolve(owner, borrow.access), /revoked/);
 assert.throws(() => registry.evict(receipt.generationId), /borrowed/);
 await registry.detach(owner); const old = registry.evict(receipt.generationId); await rm(join(contextRoot(f.key), old.generationId), { recursive: true }); await f.capacity.release(old.capacityToken);
});

test('design context uses complete validator output and refreshes latest target authority', async t => {
 const f = designFixture(t), prepared = prepareDesignSubject(f.repo, f.json), limits = reviewPreparationLimits(join(f.repo, 'missing-config.json'));
 const capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes), key = { project: f.repo, family: 'design' as const, reviewId: 'prepared-design' };
 const identity: PreparedSourceIdentity = { key, attempt: 1, inputDigest: preparationDigest(f.json), validatorVersion: 1, routeDigest: preparationDigest(prepared.subject.workflow), sourceIdentity: preparationDigest(prepared.baseline), scopeDigest: preparationDigest(prepared.inventory), testDocumentDigest: preparationDigest(prepared.baseline) };
 const receipt = await writePreparedContext(identity, { design: prepared }, undefined, limits, capacity);
 const registry = new ReviewContextRegistry('design-epoch', async () => { assertDesignSubjectUnchanged(prepared.subject, prepared.baseline); }, async () => {}, async r => capacity.assertReserved(r.capacityToken, r.storedBytes));
 const owner = await registry.attach({ key, incarnation: 'design-worker', attempt: 1, phase: 'execution' });
 await registry.qualify(owner, identity, receipt); const borrow = await registry.borrow(owner, identity);
 const reader = await PreparedContextReader.open(receipt, limits, async () => { await registry.resolve(owner, borrow.access); }, async () => registry.invalidate(owner, borrow.access));
 assert.deepEqual(await reader.view('design'), prepared);
 await writeFile(f.md, (await readFile(f.md, 'utf8')) + '\nChanged requirement\n');
 await assert.rejects(reader.view('design'), /changed|invalidat/i);
 await registry.detach(owner); registry.evict(receipt.generationId); await rm(join(contextRoot(key), receipt.generationId), { recursive: true }); await capacity.release(receipt.capacityToken);
});

test('partial context writes never emit a ready receipt and retain bounded recovery evidence', async t => {
 const f = await code(t); let failure: PreparedContextWriteError | undefined;
 try { await writePreparedContext(f.identity, { current: f.prepared }, f.session, f.limits, f.capacity, { write: async () => { throw new Error('injected context disk failure'); }, rename: async () => { throw new Error('must not publish ready'); } }); }
 catch (error) { assert.ok(error instanceof PreparedContextWriteError); failure = error; }
 assert.ok(failure); await assert.rejects(lstat(failure.readyDirectory), /ENOENT/);
 assert.ok((await lstat(failure.retainedDirectory)).isDirectory()); assert.ok(failure.capacityTokens.length > 0);
 await rm(failure.retainedDirectory, { recursive: true }); for (const token of failure.capacityTokens) await f.capacity.release(token);
});

test('real reclaimed execution worker hands complete context to a distinct publication worker', async t => {
 const f = await code(t), receipt = await writePreparedContext(f.identity, { current: f.prepared }, f.session, f.limits, f.capacity);
 const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: 'context-fixture' }));
 const workers = new Map<string, StartedWorker>(), stops: (() => void)[] = [];
 const registry = new ReviewContextRegistry('worker-epoch', async identity => {
  assert.deepEqual(identity.key, f.key); assert.ok((workers.get(identity.incarnation)?.worker.threadId ?? -1) > 0);
 }, async identity => { assert.equal(workers.get(identity.incarnation)!.worker.threadId, -1, 'actual worker exit required'); }, async r => f.capacity.assertReserved(r.capacityToken, r.storedBytes));
 const launch = async (phase: 'execution' | 'publication') => {
  const { port1, port2 } = new MessageChannel();
  const started = await startWorker(services, `context-${phase}`, '__tests__/helpers/prepared-context-reader', { workerData: { contextPort: port2 }, transferList: [port2] });
  const incarnation = `thread-${started.threadId}`; workers.set(incarnation, started);
  const owner = await registry.attach({ key: f.key, incarnation, attempt: 1, phase });
  const stop = serveHub(port1, { 'context.resolve': input => registry.resolve(owner, input), 'context.invalidate': input => registry.invalidate(owner, input as typeof access) });
  stops.push(() => { stop(); port1.close(); });
  const access = phase === 'execution' ? (await registry.acquire(owner, f.identity, async () => receipt)).access : (await registry.borrow(owner, f.identity)).access;
  const read = () => new Promise<{ threadId: number; scopeIdentity: string; source: string }>((resolve, reject) => {
   const requestId = `read-${phase}`, timer = setTimeout(() => finish(new Error('Context fixture RPC timed out')), 10000);
   const exit = () => finish(new Error('Context fixture exited'));
   const finish = (error?: Error, value?: { threadId: number; scopeIdentity: string; source: string }) => { clearTimeout(timer); started.worker.off('message', message); started.worker.off('exit', exit); if (error) reject(error); else resolve(value!); };
   const message = (raw: { requestId?: string; error?: string; result?: { threadId: number; scopeIdentity: string; source: string } }) => { if (raw.requestId === requestId) finish(raw.error ? new Error(raw.error) : undefined, raw.result); };
   started.worker.on('message', message); started.worker.once('exit', exit);
   started.worker.postMessage({ method: 'context.read', requestId, params: { receipt, access, limits: f.limits, query: [f.f.packet.reviewSet[0]!.commit, 'source.js'] } });
  });
  return { started, owner, read };
 };
 try {
  const first = await launch('execution'), firstRead = await first.read();
  assert.equal(firstRead.scopeIdentity, f.prepared.projection!.identity);
  await assert.rejects(registry.detach(first.owner), /actual worker exit/);
  await first.started.worker.terminate(); await first.started.reclaimed; first.started.disconnect(); await registry.detach(first.owner);
  const physical = f.session.snapshot().physicalQueries; await f.session.close();
  const second = await launch('publication'), secondRead = await second.read();
  assert.notEqual(secondRead.threadId, firstRead.threadId); assert.equal(secondRead.scopeIdentity, firstRead.scopeIdentity); assert.equal(secondRead.source, 'export const total = 2;\n');
  assert.equal(f.session.snapshot().physicalQueries, physical);
  await second.started.worker.terminate(); await second.started.reclaimed; second.started.disconnect(); await registry.detach(second.owner);
  const old = registry.evict(receipt.generationId); await rm(join(contextRoot(f.key), old.generationId), { recursive: true }); await f.capacity.release(old.capacityToken);
 } finally {
  for (const started of workers.values()) { if (started.worker.threadId > 0) await started.worker.terminate(); await started.reclaimed; started.disconnect(); }
  for (const stop of stops) stop();
 }
});

test('matching context acquisitions coalesce qualification and refresh authority before every borrow', async t => {
 const f = await code(t), receipt = await writePreparedContext(f.identity, { current: f.prepared }, f.session, f.limits, f.capacity);
 let calls = 0, current = true, release!: () => void, entered!: () => void;
 const gate = new Promise<void>(r => { release = r; }), started = new Promise<void>(r => { entered = r; });
 const registry = new ReviewContextRegistry('coalesced-epoch', async () => {
  if (!current) throw new Error('Current author/route changed');
  assert.throws(() => registry.evict(receipt.generationId), /absent|borrowed|acquisition/);
 }, async () => {}, async r => f.capacity.assertReserved(r.capacityToken, r.storedBytes));
 const owner = await registry.attach({ key: f.key, incarnation: 'owner', attempt: 1, phase: 'execution' });
 const dispatch = async () => { calls++; entered(); await gate; return receipt; };
 const a = registry.acquire(owner, f.identity, dispatch), b = registry.acquire(owner, f.identity, dispatch);
 await started; release(); const acquired = await Promise.all([a, b]); // metadata only; no provider
 assert.equal(calls, 1); assert.equal(acquired[0].receipt.generationId, acquired[1].receipt.generationId);
 current = false; await assert.rejects(registry.resolve(owner, acquired[0].access), /author\/route/);
 current = true; await registry.detach(owner); registry.evict(receipt.generationId); await rm(join(contextRoot(f.key), receipt.generationId), { recursive: true }); await f.capacity.release(receipt.capacityToken);
});

test('an immutable manifest replacement revokes an active borrow and fresh generations preserve source identity', async t => {
 const f = await code(t);
 const first = await writePreparedContext(f.identity, { current: f.prepared }, f.session, f.limits, f.capacity);
 const next = await writePreparedContext(f.identity, { current: f.prepared }, f.session, f.limits, f.capacity);
 assert.equal(first.identityDigest, next.identityDigest); assert.notEqual(first.generationId, next.generationId);
 const registry = new ReviewContextRegistry('manifest-epoch', async () => {}, async () => {}, async r => f.capacity.assertReserved(r.capacityToken, r.storedBytes));
 const owner = await registry.attach({ key: f.key, incarnation: 'manifest-worker', attempt: 1, phase: 'execution' });
 await registry.qualify(owner, f.identity, next); const borrow = await registry.borrow(owner, f.identity);
 const reader = await PreparedContextReader.open(next, f.limits, async () => { await registry.resolve(owner, borrow.access); }, async () => registry.invalidate(owner, borrow.access));
 const path = join(contextRoot(f.key), next.generationId, 'manifest.json');
 await writeFile(path, (await readFile(path, 'utf8')) + '\n');
 await assert.rejects(reader.view('current'), /manifest replaced/); await assert.rejects(registry.resolve(owner, borrow.access), /revoked/);
 await registry.detach(owner); registry.evict(next.generationId);
 for (const receipt of [first, next]) { await rm(join(contextRoot(f.key), receipt.generationId), { recursive: true }); await f.capacity.release(receipt.capacityToken); }
});

test('central context serialization preserves binary text undefined and tag-shaped artifact data', async t => {
 const f = await code(t), text = 'z'.repeat(8192);
 const value = { text, bytes: new Uint8Array(Buffer.from(text)), optional: undefined, tagShaped: ['bytes', 'a'.repeat(64)], literal: JSON.parse('{"__proto__":{"polluted":true}}') };
 const receipt = await writePreparedContext(f.identity, { current: f.prepared, codec: value }, f.session, f.limits, f.capacity);
 const registry = new ReviewContextRegistry('codec-epoch', async () => {}, async () => {}, async r => f.capacity.assertReserved(r.capacityToken, r.storedBytes));
 const owner = await registry.attach({ key: f.key, incarnation: 'codec-worker', attempt: 1, phase: 'execution' });
 await registry.qualify(owner, f.identity, receipt); const borrow = await registry.borrow(owner, f.identity);
 const reader = await PreparedContextReader.open(receipt, f.limits, async () => { await registry.resolve(owner, borrow.access); }, async () => registry.invalidate(owner, borrow.access));
 assert.deepEqual(await reader.view('codec'), value); assert.equal(Reflect.get({}, 'polluted'), undefined);
 const manifest = JSON.parse(await readFile(join(contextRoot(f.key), receipt.generationId, 'manifest.json'), 'utf8'));
 const view = manifest.views.find((v: { id: string }) => v.id === 'codec');
 assert.equal(view.objectDigests.length, 2, 'one root plus one shared raw object for text and binary');
 await registry.detach(owner); registry.evict(receipt.generationId);
 await rm(join(contextRoot(f.key), receipt.generationId), { recursive: true }); await f.capacity.release(receipt.capacityToken);
});
