import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { reviewPreparationLimits } from '../../../config/review.js';
import { PreparedViewWriter, PreparedViewReader } from '../prepared-views.js';
import type { PreparedValueReference } from '../prepared-views.js';
import { ReviewMemoryBudget } from '../preparation-memory.js';
import { ReviewPreparationCapacity } from '../source-session.js';
import { preparationDigest, contextRoot, PreparedContextWriteError } from '../prepared-context.js';
import type { PreparedSourceIdentity, ReadyContextReceipt } from '../prepared-context.js';

async function setup(t: { after: (f: () => Promise<void>) => void }, memoryBytes = 8 * 1024 * 1024, diskBytes = 32 * 1024 * 1024) {
 const project = await mkdtemp('/tmp/staged-views-'); t.after(() => rm(project, { recursive: true, force: true }));
 const limits = { ...reviewPreparationLimits(join(project, 'missing.json')), memoryMaxBytes: memoryBytes, cacheMaxBytes: diskBytes, batchMaxBytes: 65536 };
 const key = { project, family: 'design' as const, reviewId: 'staged-test' }, d = preparationDigest('fixture');
 const identity: PreparedSourceIdentity = { key, attempt: 1, inputDigest: d, validatorVersion: 1, routeDigest: d, sourceIdentity: d, scopeDigest: d, testDocumentDigest: d };
 const memory = new ReviewMemoryBudget(memoryBytes), capacity = new ReviewPreparationCapacity(diskBytes);
 const writer = await PreparedViewWriter.create(identity, limits, capacity, memory);
 const open = (receipt: ReadyContextReceipt, authorize = async () => {}, invalidate = async (_error: unknown) => {}) => PreparedViewReader.open(receipt, limits, memory, authorize, invalidate);
 return { project, limits, key, identity, memory, capacity, writer, open };
}
async function restore(reader: PreparedViewReader, ref: PreparedValueReference): Promise<unknown> {
 const description = await reader.describe(ref);
 if (description.type === 'array' || description.type === 'object') {
  const result: Record<string | number, unknown> | unknown[] = description.type === 'array' ? [] : {};
  for await (const child of reader.children(ref)) Object.defineProperty(result, child.key, { value: await restore(reader, child.reference), enumerable: true, configurable: true, writable: true });
  return result;
 }
 if (description.type === 'bytes' || description.type === 'text') {
  const parts: Buffer[] = [];
  for await (const chunk of reader.chunks(ref)) { parts.push(Buffer.from(chunk.value)); chunk.release(); }
  const bytes = Buffer.concat(parts); return description.type === 'text' ? bytes.toString('utf8') : new Uint8Array(bytes);
 }
 const w = await reader.scalar(ref); try { return w.value; } finally { w.release(); }
}

test('memory leases count shared backing buffers once and reserve before allocation', () => {
 const memory = new ReviewMemoryBudget(1024), bytes = new Uint8Array(768);
 const a = memory.buffer(bytes.subarray(0, 4), 'a'), b = memory.buffer(bytes.subarray(4), 'b');
 assert.equal(memory.snapshot().bytes, 768);
 assert.throws(() => memory.reserve(257, 'scratch'), /scratch.*charged=768.*limit=1024/);
 a.release(); a.release(); assert.equal(memory.snapshot().bytes, 768);
 b.release(); assert.equal(memory.snapshot().bytes, 0); assert.equal(memory.snapshot().highWaterBytes, 768);
});

test('cache eviction releases every shared slab reference before refusing a new reservation', () => {
 const memory = new ReviewMemoryBudget(1024), bytes = new Uint8Array(768);
 const cache = [memory.buffer(bytes.subarray(0, 4), 'cache-a'), memory.buffer(bytes.subarray(4), 'cache-b')];
 const remove = memory.onEvict(() => { const lease = cache.shift(); lease?.release(); return lease !== undefined; });
 const other = memory.reserve(900, 'new window'); assert.equal(cache.length, 0);
 assert.equal(memory.snapshot().bytes, 900); other.release(); remove();
 assert.equal(memory.snapshot().bytes, 0);
});

test('reserved source and reader allocations remain single-charged across codec borrows', () => {
 const memory = new ReviewMemoryBudget(2048), allocation = memory.allocate(1536, 'read');
 const codec = memory.buffer(allocation.bytes.subarray(0, 1024), 'codec');
 assert.equal(memory.snapshot().bytes, 1536);
 allocation.lease.release(); assert.equal(memory.snapshot().bytes, 1536);
 assert.throws(() => memory.allocate(1024, 'next read'), /capacity/);
 codec.release(); assert.equal(memory.snapshot().bytes, 0);
});

test('allocation happens only after its reservation and refusal performs no allocation', () => {
 const memory = new ReviewMemoryBudget(1024), Original = globalThis.Uint8Array; let allocations = 0;
 globalThis.Uint8Array = class extends Original {
  constructor(size: number) { assert.ok(memory.snapshot().bytes >= size, 'reservation precedes constructor'); super(size); allocations++; }
 } as typeof Uint8Array;
 try {
  const owned = memory.allocate(768, 'instrumented allocation'); assert.equal(allocations, 1);
  assert.throws(() => memory.allocate(512, 'must refuse before constructor'), /capacity/); assert.equal(allocations, 1);
  owned.lease.release();
 } finally { globalThis.Uint8Array = Original; }
 assert.equal(memory.snapshot().bytes, 0);
});

test('typed staged descriptors round trip bytes Unicode null undefined and ordered sharded containers', async t => {
 const f = await setup(t), data = new Uint8Array(Array.from({ length: 150000 }, (_, i) => i % 251));
 const value = { nul: null, missing: undefined, yes: true, number: 1.25, text: '🙂\u0000漢字'.repeat(2000), data, list: Array.from({ length: 300 }, (_, i) => ({ i, label: `item-${i}` })) };
 await f.writer.add('packet-1', 'packet', value); const receipt = await f.writer.seal();
 assert.equal(f.memory.snapshot().bytes, 0);
 const reader = await f.open(receipt), ref = await reader.descriptor('packet-1', 'packet');
 assert.deepEqual(await restore(reader, ref), value);
 reader.close(); assert.equal(f.memory.snapshot().bytes, 0);
 const manifest = JSON.parse(await readFile(join(contextRoot(f.key), receipt.generationId, 'manifest.json'), 'utf8'));
 assert.equal(manifest.schemaVersion, 2); assert.equal(manifest.encoding, 'staged-values-v2');
 assert.ok(manifest.objects.every((o: { bytes: number }) => o.bytes <= f.limits.batchMaxBytes));
 assert.ok(f.memory.snapshot().highWaterBytes <= f.limits.memoryMaxBytes);
});

test('incremental entries stage complete content above working memory without retaining payloads', async t => {
 const f = await setup(t, 4 * 1024 * 1024);
 const byte = (row: number, at: number) => (at * 31 + (at >>> 8) + (at >>> 16) * 17 + row * 43) % 251;
 async function* rows() { for (let i = 0; i < 8; i++) yield { key: i, value: Uint8Array.from({ length: 1024 * 1024 }, (_, at) => byte(i, at)) }; }
 await f.writer.addEntries('task-1', 'task', 'array', rows()); const receipt = await f.writer.seal();
 const reader = await f.open(receipt); let i = 0, total = 0;
 for await (const row of reader.children(await reader.descriptor('task-1'))) {
  assert.equal(row.key, i);
  let offset = 0;
  for await (const chunk of reader.chunks(row.reference)) { assert.ok(chunk.value.every((value, at) => value === byte(i, offset + at))); offset += chunk.value.length; total += chunk.value.length; chunk.release(); }
  i++;
 }
 assert.equal(i, 8); assert.equal(total, 8 * 1024 * 1024);
 assert.ok(receipt.storedBytes > f.limits.memoryMaxBytes);
 assert.ok(f.memory.snapshot().highWaterBytes <= f.limits.memoryMaxBytes);
 reader.close(); assert.equal(f.memory.snapshot().bytes, 0);
});

test('descriptor references are private to their reader and kind lookup is enforced', async t => {
 const f = await setup(t); await f.writer.add('file-1', 'file', { x: 1 }); const receipt = await f.writer.seal();
 const reader = await f.open(receipt), other = await f.open(receipt), ref = await reader.descriptor('file-1', 'file');
 await assert.rejects(other.describe(ref), /Unissued/); other.close();
 await assert.rejects(reader.descriptor('file-1', 'task'), /Unknown/); reader.close();
 assert.equal(f.memory.snapshot().bytes, 0);
});

test('old or unknown derived encodings are rejected without issuing a descriptor', async t => {
 const f = await setup(t); await f.writer.add('packet', 'packet', { a: 1 }); const receipt = await f.writer.seal();
 const path = join(contextRoot(f.key), receipt.generationId, 'manifest.json'), manifest = JSON.parse(await readFile(path, 'utf8'));
 for (const version of [1, 3]) {
  await writeFile(path, JSON.stringify({ ...manifest, schemaVersion: version }));
  await assert.rejects(f.open(receipt), /Invalid|oversized/);
  assert.equal(f.memory.snapshot().bytes, 0);
 }
});

test('tampered staged leaf fails digest verification and revokes its reader', async t => {
 const f = await setup(t), data = new Uint8Array(4096).fill(17);
 await f.writer.add('file', 'file', data); const receipt = await f.writer.seal(); let invalidations = 0;
 const reader = await f.open(receipt, async () => {}, async () => { invalidations++; }); const ref = await reader.descriptor('file');
 const d = createHash('sha256').update(data).digest('hex'); await writeFile(join(contextRoot(f.key), receipt.generationId, `${d}.data`), new Uint8Array(4096).fill(18));
 const iterator = reader.chunks(ref); await assert.rejects(iterator.next(), /digest/);
 assert.equal(invalidations, 1); await assert.rejects(reader.describe(ref), /fenced/);
 reader.close(); assert.equal(f.memory.snapshot().bytes, 0);
});

test('cancellation revokes window access but holds its charge until actual release', async t => {
 const f = await setup(t); await f.writer.add('file', 'file', new Uint8Array(40000)); const receipt = await f.writer.seal();
 const reader = await f.open(receipt), iterator = reader.chunks(await reader.descriptor('file'));
 const { value: window } = await iterator.next(); assert.ok(window);
 const held = f.memory.snapshot().bytes; assert.ok(held >= 40000);
 reader.cancel(); assert.throws(() => window.value, /fenced/); assert.throws(() => reader.close(), /borrowed/);
 assert.equal(f.memory.snapshot().bytes, held);
 window.release(); window.release(); await iterator.return(); reader.close();
 assert.equal(f.memory.snapshot().bytes, 0);
});

test('two staged writers cannot exceed aggregate project disk reservation', async t => {
 const f = await setup(t, 4 * 1024 * 1024, 256 * 1024);
 const data = new Uint8Array(128 * 1024); data.fill(1, 0, 65536); data.fill(2, 65536);
 await f.writer.add('file', 'file', data); const receipt = await f.writer.seal(), held = f.capacity.bytes;
 const second = await PreparedViewWriter.create({ ...f.identity, key: { ...f.key, reviewId: 'other-review' } }, f.limits, f.capacity, new ReviewMemoryBudget(f.limits.memoryMaxBytes));
 await assert.rejects(second.add('file', 'file', new Uint8Array(65536).fill(3)), /disk capacity/);
 await second.discard(); assert.equal(f.capacity.bytes, held);
 await rm(join(contextRoot(f.key), receipt.generationId), { recursive: true }); await f.capacity.release(receipt.capacityToken);
 assert.equal(f.capacity.bytes, 0);
});

test('partial seal retains bounded recovery evidence and never emits readiness', async t => {
 const f = await setup(t); await f.writer.add('file', 'file', { value: 123 });
 await mkdir(join(f.writer.directory, 'manifest.json'));
 let failure: PreparedContextWriteError | undefined;
 try { await f.writer.seal(); } catch (error) { assert.ok(error instanceof PreparedContextWriteError); failure = error; }
 assert.ok(failure); assert.ok(f.capacity.bytes > 0);
 await assert.rejects(lstat(failure.readyDirectory), /ENOENT/);
 assert.ok((await lstat(failure.retainedDirectory)).isDirectory());
 await f.writer.discard(); assert.equal(f.capacity.bytes, 0); assert.equal(f.memory.snapshot().bytes, 0);
});

test('invalid streamed entry order and canceled construction preserve evidence for explicit disposal', async t => {
 const f = await setup(t);
 async function* wrong() { yield { key: 1, value: 1 }; }
 await assert.rejects(f.writer.addEntries('packet', 'packet', 'array', wrong()), /unordered/);
 await f.writer.discard(); assert.equal(f.memory.snapshot().bytes, 0);
 const controller = new AbortController(), writer = await PreparedViewWriter.create(f.identity, f.limits, f.capacity, f.memory, undefined, controller.signal);
 await writer.add('file', 'file', 12); controller.abort();
 await assert.rejects(writer.seal(), /abort/i); assert.ok(f.capacity.bytes > 0);
 await writer.discard(); assert.equal(f.capacity.bytes, 0); assert.equal(f.memory.snapshot().bytes, 0);
});

test('tampered index shards cannot return unverified child references', async t => {
 const f = await setup(t); await f.writer.add('task', 'task', { a: 1, b: 2 }); const receipt = await f.writer.seal();
 const reader = await f.open(receipt), ref = await reader.descriptor('task'), root = join(contextRoot(f.key), receipt.generationId);
 const node = JSON.parse(await readFile(join(root, `${ref.digest}.data`), 'utf8'));
 await writeFile(join(root, `${node[2]}.data`), '["items",[]]');
 await assert.rejects(reader.children(ref).next(), /size|digest/);
 reader.close(); assert.equal(f.memory.snapshot().bytes, 0);
});

test('pending reader authorization keeps metadata owned until the operation ends', async t => {
 const f = await setup(t); await f.writer.add('file', 'file', 42); const receipt = await f.writer.seal();
 let block = false, release!: () => void, entered!: () => void;
 const waiting = new Promise<void>(r => { entered = r; }), barrier = new Promise<void>(r => { release = r; });
 const reader = await f.open(receipt, async () => { if (block) { entered(); await barrier; } });
 const ref = await reader.descriptor('file'); block = true;
 const pending = reader.describe(ref); await waiting;
 assert.throws(() => reader.close(), /borrowed/); assert.ok(f.memory.snapshot().bytes > 0);
 release(); assert.deepEqual(await pending, { type: 'scalar', size: 1 }); reader.close();
 assert.equal(f.memory.snapshot().bytes, 0);
});

test('explicit writer disposal fences an in-flight entry producer before removing files', async t => {
 const f = await setup(t); let release!: () => void, entered!: () => void;
 const waiting = new Promise<void>(r => { entered = r; }), barrier = new Promise<void>(r => { release = r; });
 async function* rows() { yield { key: 0, value: 42 }; entered(); await barrier; yield { key: 1, value: 43 }; }
 const pending = assert.rejects(f.writer.addEntries('task', 'task', 'array', rows()), /unavailable/);
 await waiting; const disposal = f.writer.discard(); release(); await pending; await disposal;
 assert.equal(f.capacity.bytes, 0); assert.equal(f.memory.snapshot().bytes, 0);
 await assert.rejects(f.writer.add('late', 'file', 12), /unavailable/);
});
