import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, readdir, rename, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from '../../code-review/task-review/__tests__/publication-fixture.js';
import { RegistryReviewSources } from '../../code-review/task-review/sources.js';
import type { BatchReviewSources } from '../../code-review/task-review/sources.js';
import { ProjectionBudget, boundedProjectionSources } from '../../code-review/task-review/projection.js';
import { ReviewSourceSession, ReviewPreparationCapacity } from '../source-session.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import { prepareReviewPacket } from '../../code-review/task-review/packet.js';
import { PreparedViewWriter, PreparedViewReader } from '../prepared-views.js';
import { preparationDigest, contextRoot } from '../prepared-context.js';
import { reviewSourceQueryDigest } from '../source-session.js';

const defaults = () => reviewPreparationLimits('/tmp/insrc-nonexistent-test-preparation-config');
async function setup(t: { after: (fn: () => void | Promise<void>) => void }) {
 const f = await fixture(), sessions: ReviewSourceSession[] = [];
 t.after(async () => { try { for (const session of sessions) await session.close(); } finally { f.cleanup(); } });
 const calls = { direct: 0, batches: 0, inventories: 0 };
 const actual = new RegistryReviewSources({ repoPath: f.repo, sessionId: 'source-session-test', requestId: 0, send: () => {} });
 const source: BatchReviewSources = {
  commit: (...args) => { calls.direct++; return actual.commit(...args); }, file: (...args) => { calls.direct++; return actual.file(...args); },
  isAncestor: (...args) => { calls.direct++; return actual.isAncestor(...args); }, changedRanges: (...args) => { calls.direct++; return actual.changedRanges(...args); }, pathChanges: (...args) => { calls.direct++; return actual.pathChanges(...args); },
  objects: r => { calls.batches++; return actual.objects(r); }, objectInventory: r => { calls.inventories++; return actual.objectInventory(r); },
 };
 return { f, source, calls, create: async (limits: ReturnType<typeof defaults>, capacity: ReviewPreparationCapacity) => { const session = await ReviewSourceSession.create({ project: f.repo, family: 'code', reviewId: 'session-test' }, source, limits, capacity); sessions.push(session); return session; } };
}

test('staged views share source cache memory and retain exact source queries without refetch', async t => {
 const f = await setup(t), limits = defaults(), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const session = await f.create(limits, capacity), commit = f.f.packet.reviewRevision!;
 const expected = await session.file(commit, 'source.js'), physical = session.snapshot().physicalQueries;
 assert.ok(session.snapshot().memoryBytes > 0);
 const held = session.workingMemory.reserve(limits.memoryMaxBytes - 4000, 'consumer window');
 assert.ok(session.snapshot().memoryBytes < 4000, 'consumer pressure evicts only the unborrowed source wire cache');
 held.release();
 const d = preparationDigest('source-binding');
 const writer = await PreparedViewWriter.create({ key: session.key, attempt: 1, inputDigest: d, validatorVersion: 1, routeDigest: d, sourceIdentity: d, scopeDigest: d, testDocumentDigest: d }, limits, capacity, session.workingMemory, session);
 await writer.add('packet', 'packet', { commit, path: 'source.js' }); const receipt = await writer.seal();
 const reader = await PreparedViewReader.open(receipt, limits, session.workingMemory, async () => {}, async error => { throw error; });
 const ref = await reader.source(reviewSourceQueryDigest('file', [commit, 'source.js'])), parts: Buffer[] = [];
 for await (const window of reader.chunks(ref)) { parts.push(Buffer.from(window.value)); window.release(); }
 const restored = JSON.parse(Buffer.concat(parts).toString('utf8'));
 assert.equal(restored.oid, expected!.oid); assert.deepEqual(Buffer.from(restored.base64, 'base64'), Buffer.from(expected!.bytes));
 assert.equal(session.snapshot().physicalQueries, physical);
 reader.close(); session.releaseResult(expected); await session.close();
 assert.equal(session.workingMemory.snapshot().bytes, 0);
 await rm(join(contextRoot(session.key), receipt.generationId), { recursive: true }); await capacity.release(receipt.capacityToken);
 assert.equal(capacity.bytes, 0);
});

test('source evidence windows prevent disposal until the exact consumer releases ownership', async t => {
 const f = await setup(t), limits = defaults(), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const session = await f.create(limits, capacity), commit = f.f.packet.reviewRevision!;
 const result = await session.file(commit, 'source.js');
 const window = await session.borrowEvidence(reviewSourceQueryDigest('file', [commit, 'source.js']));
 await assert.rejects(session.close(), /windows remain borrowed/);
 assert.ok(capacity.bytes > 0); assert.ok(window.bytes.length > 0);
 window.release(); window.release(); assert.throws(() => window.bytes, /released/);
 session.releaseResult(result); await session.close(); assert.equal(capacity.bytes, 0); assert.equal(session.workingMemory.snapshot().bytes, 0);
});

test('decoded source results retain their charge until explicit consumer release', async t => {
 const f = await setup(t), limits = defaults(), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes), session = await f.create(limits, capacity);
 const result = await session.file(f.f.packet.reviewRevision!, 'source.js'); assert.ok(result);
 const before = session.workingMemory.snapshot().bytes, codec = session.workingMemory.buffer(result.bytes, 'following codec consumer');
 assert.equal(session.workingMemory.snapshot().bytes, before);
 session.releaseResult(result); const shared = session.workingMemory.snapshot().bytes;
 assert.ok(shared < before); codec.release();
 assert.equal(session.workingMemory.snapshot().bytes, shared - result.bytes.buffer.byteLength);
 session.releaseResult(result); await session.close(); assert.equal(session.workingMemory.snapshot().bytes, 0);
});

test('session close retains decoded result charges while a caller can still use them', async t => {
 const f = await setup(t), limits = defaults(), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes), session = await f.create(limits, capacity);
 const result = await session.file(f.f.packet.reviewRevision!, 'source.js'); assert.ok(result);
 const text = Buffer.from(result.bytes).toString();
 await session.close(); assert.equal(capacity.bytes, 0);
 assert.ok(session.workingMemory.snapshot().bytes > 0);
 assert.equal(Buffer.from(result.bytes).toString(), text, 'result remains usable and charged after session close');
 session.releaseResult(result); assert.equal(session.workingMemory.snapshot().bytes, 0);
});

test('source body memory exhaustion refuses before invoking the body provider', async t => {
 const f = await setup(t), limits = { ...defaults(), memoryMaxBytes: 8192 }, capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 let bodies = 0;
 const session = await ReviewSourceSession.create({ project: f.f.repo, family: 'code', reviewId: 'before-body' }, { ...f.source, file: async (...args) => { bodies++; return f.source.file(...args); } }, limits, capacity);
 await assert.rejects(session.file(f.f.packet.reviewRevision!, 'source.js'), /source body acquisition/);
 assert.equal(bodies, 0); await session.close(); assert.equal(session.workingMemory.snapshot().bytes, 0); assert.equal(capacity.bytes, 0);
});

test('source session batches verified Git objects and shares immutable queries without bypassing logical budgets', async t => {
 const f = await setup(t), limits = defaults(), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const session = await f.create(limits, capacity);
 const commit = f.f.packet.reviewRevision!;
 await session.prefetchObjects([{ commit, path: 'source.js' }, { commit, path: 'test.js' }, { commit, path: 'source.js' }, { commit }, { commit, path: 'absent.txt' }]);
 assert.equal(f.calls.batches, 1); assert.equal(f.calls.inventories, 1);
 assert.deepEqual(await session.commit(commit), await f.f.deps.sources.commit(commit));
 assert.deepEqual(await session.file(commit, 'source.js'), await f.f.deps.sources.file(commit, 'source.js'));
 await Promise.all([session.file(commit, 'test.js'), session.file(commit, 'test.js')]); // no providers
 assert.equal(await session.file(commit, 'absent.txt'), null);
 assert.equal(f.calls.direct, 0); assert.equal(session.snapshot().physicalQueries, 4);
 const first = boundedProjectionSources(session, new ProjectionBudget({ reads: 1 }));
 await first.file(commit, 'source.js');
 await assert.rejects(first.file(commit, 'test.js'), /budget|limit/i);
 const second = boundedProjectionSources(session, new ProjectionBudget({ reads: 1 }));
 await second.file(commit, 'test.js'); assert.equal(f.calls.direct, 0);
});

test('source session retains evidence above memory capacity and never refetches evicted data', async t => {
 const f = await setup(t);
 for (let i = 0; i < 48; i++) f.f.put(`large-${i}.txt`, String(i % 10).repeat(8192));
 f.f.git('add', '.'); f.f.git('commit', '-qm', 'large fixture'); const commit = f.f.git('rev-parse', 'HEAD');
 const limits = { ...defaults(), memoryMaxBytes: 256 * 1024, batchMaxBytes: 1024, cacheMaxBytes: 2 * 1024 * 1024 };
 const capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes), session = await f.create(limits, capacity);

 // Single objects may exceed a configured batch target and run alone.
 // Account real encoder/decoder and inventory scratch, not just wire bytes.
 // The expanded48-file fixture still exceeds this complete working-set bound.
 for (let offset = 0; offset < 48; offset += 8) await session.prefetchObjects(Array.from({ length: 8 }, (_, i) => ({ commit, path: `large-${offset + i}.txt` })));
 assert.ok(session.snapshot().storedBytes > limits.memoryMaxBytes);
 assert.equal(f.calls.batches, 48, 'valid objects above batch target run alone');
 const before = { ...f.calls }, first = await session.file(commit, 'large-0.txt');
 assert.equal(Buffer.from(first!.bytes).toString(), '0'.repeat(8192));
 assert.deepEqual(f.calls, before); assert.ok(session.snapshot().diskHits > 0);
 assert.ok(session.snapshot().memoryBytes <= limits.memoryMaxBytes);
 // Mutation of returned bytes cannot corrupt private retained evidence.
 first!.bytes.fill(0); assert.equal((await session.file(commit, 'large-0.txt'))!.bytes[0], 48);
});

test('shared project reservations refuse body fetch before capacity exhaustion and transfer batches atomically', async t => {
 const f = await setup(t), limits = { ...defaults(), memoryMaxBytes: 65536, cacheMaxBytes: 100000 };
 const capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const held = await capacity.reserve(80000);
 const session = await f.create(limits, capacity);
 await assert.rejects(session.prefetchObjects([{ commit: f.f.packet.reviewRevision!, path: 'source.js' }]), /capacity/);
 assert.equal(f.calls.batches, 0, 'metadata may be inventoried; no unreserved body batch runs');
 await capacity.release(held);
 const parent = await capacity.reserve(90000), children = await capacity.split(parent, [40000, 40000]);
 assert.equal(capacity.bytes, 80000); await assert.rejects(capacity.reserve(20001), /capacity/);
 for (const token of children) await capacity.release(token);
});

test('staged corruption and source errors fence the session instead of implicitly retrying Git', async t => {
 const f = await setup(t), limits = { ...defaults(), memoryMaxBytes: 256 * 1024, batchMaxBytes: 1024, cacheMaxBytes: 2 * 1024 * 1024 };
 const capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 for (let i = 0; i < 4; i++) f.f.put(`evict-${i}.txt`, String(i % 10).repeat(8192));
 f.f.git('add', '.'); f.f.git('commit', '-qm', 'eviction fixture'); const commit = f.f.git('rev-parse', 'HEAD');
 const session = await f.create(limits, capacity);
 await session.prefetchObjects(Array.from({ length: 4 }, (_, i) => ({ commit, path: `evict-${i}.txt` })));
 const pressure = session.workingMemory.reserve(limits.memoryMaxBytes - 8192, 'force verified-wire eviction'); pressure.release();
 const line = (await readFile(join(session.directory, 'queries.jsonl'), 'utf8')).split('\n')[0]!;
 const entry = JSON.parse(line); await writeFile(join(session.directory, entry.name), 'corrupt');
 const before = { ...f.calls };
 await assert.rejects(session.file(commit, 'evict-0.txt'), /staged source|Staged source/);
 await assert.rejects(session.file(commit, 'evict-1.txt'), /fenced/); assert.deepEqual(f.calls, before);
 assert.ok((await readdir(session.directory)).includes('queries.jsonl'));
});

test('a source failure is recorded once and requires a fresh preparation session', async t => {
 const f = await setup(t), limits = defaults(), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 let calls = 0;
 const source = { ...f.source, file: async () => { calls++; throw new Error('injected source failure'); } };
 const session = await ReviewSourceSession.create({ project: f.f.repo, family: 'code', reviewId: 'failure-test' }, source, limits, capacity);
 try {
  await assert.rejects(session.file(f.f.packet.reviewRevision!, 'source.js'), /injected source/);
  await assert.rejects(session.file(f.f.packet.reviewRevision!, 'source.js'), /fenced/);
  assert.equal(calls, 1);
 } finally { await session.close(); }
 assert.equal(capacity.bytes, 0);
});

test('preparation configuration is discoverable bounded and rejects malformed values', async t => {
 const f = await setup(t), path = join(f.f.repo, 'preparation-config.json');
 assert.deepEqual(reviewPreparationLimits(path), defaults());
 await writeFile(path, JSON.stringify({ review: { preparation: { batchMaxObjects: 1000, batchMaxBytes: 8 * 1024 * 1024, memoryMaxBytes: 123456, cacheMaxBytes: 999999 } } }));
 assert.deepEqual(reviewPreparationLimits(path), { batchMaxObjects: 256, batchMaxBytes: 4 * 1024 * 1024, memoryMaxBytes: 123456, cacheMaxBytes: 999999 });
 for (const value of [0, -1, 1.5, '8', null]) {
  await writeFile(path, JSON.stringify({ review: { preparation: { memoryMaxBytes: value } } }));
  assert.throws(() => reviewPreparationLimits(path), /positive safe/);
 }
 await writeFile(path, '{"review":{"preparation":{"toString":1}}}');
 assert.throws(() => reviewPreparationLimits(path), /positive safe/);
 const { CONFIG_CATALOG } = await import('../../../config/config-catalog.js');
 for (const name of Object.keys(defaults())) assert.ok(CONFIG_CATALOG.some(c => c.path === `review.preparation.${name}`));
});

test('replaced staging directory is retained with its capacity until exact ownership is restored', async t => {
 const f = await setup(t), limits = defaults(), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const session = await f.create(limits, capacity);
 await session.file(f.f.packet.reviewRevision!, 'source.js');
 const original = `${session.directory}-original`;
 await rename(session.directory, original); await mkdir(session.directory);
 await writeFile(join(session.directory, 'foreign.txt'), 'retain');
 try {
  await assert.rejects(session.close(), /directory replaced/);
  assert.equal(await readFile(join(session.directory, 'foreign.txt'), 'utf8'), 'retain');
  assert.ok(capacity.bytes > 0);
 } finally {
  await rm(session.directory, { recursive: true }); await rename(original, session.directory);
 }
 await session.close(); assert.equal(capacity.bytes, 0);
});

test('two source sessions share project capacity without overlapping identities or duplicate fetches', async t => {
 const f = await setup(t), limits = defaults(), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes);
 const a = await f.create(limits, capacity), b = await f.create(limits, capacity), commit = f.f.packet.reviewRevision!;
 assert.notEqual(a.directory, b.directory);
 const values = await Promise.all([a.file(commit, 'source.js'), b.file(commit, 'test.js')]); // native reads only
 assert.ok(values.every(v => v !== null)); assert.equal(f.calls.direct, 2);
 await Promise.all([a.file(commit, 'source.js'), b.file(commit, 'test.js')]);
 assert.equal(f.calls.direct, 2); assert.ok(capacity.bytes > 0 && capacity.bytes <= limits.cacheMaxBytes);
 await a.close(); assert.ok(capacity.bytes > 0, 'other session retains its reservation/evidence');
 assert.ok(await b.file(commit, 'test.js')); await b.close(); assert.equal(capacity.bytes, 0);
});

test('historical and current packet qualification share sources while preserving exact projection', async t => {
 const f = await setup(t), limits = defaults(), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes), session = await f.create(limits, capacity);
 const historical = await prepareReviewPacket(f.f.packet, session, true);
 const before = { ...f.calls }, physical = session.snapshot().physicalQueries;
 const current = await prepareReviewPacket(f.f.packet, session, false);
 // Historical packets retain their old before-block interpretation; current
 // packets intentionally expose after blocks only. Preserve each oracle.
 const historicalOracle = await prepareReviewPacket(f.f.packet, f.f.deps.sources, true);
 const currentOracle = await prepareReviewPacket(f.f.packet, f.f.deps.sources, false);
 assert.deepEqual(historical.changes, historicalOracle.changes);
 assert.deepEqual(current.changes, currentOracle.changes); assert.deepEqual(current.tasks, historical.tasks);
 assert.equal(current.projection!.identity, currentOracle.projection!.identity);
 assert.equal(historical.projection!.identity, historicalOracle.projection!.identity);
 assert.deepEqual(f.calls, before); assert.equal(session.snapshot().physicalQueries, physical);
 assert.ok(session.snapshot().cacheHits > 0);
});
