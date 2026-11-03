import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireOwnership } from '../ownership.js';
import { FileQueue } from '../queue/file-queue.js';
import { snapshotCommand } from '../queue/codec.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';
const make = (eventId: string, text = 'remember') => snapshotCommand({ version: 1, scope: { projectId: 'project' }, source: { producerId: 'test', eventId, sessionId: 'session', turnId: 'turn', sourceVersion: 'v1' }, kind: 'capture', payload: { text } }, 1024);
const limits = { maxEventBytes: 1024, maxPendingBytes: 1024, segmentBytes: 1024, modelTimeoutMs: 1 };

nativeTest(import.meta.url, 'durable-append-frontier-and-full-queue-refusal', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-append-'))), owner = await acquireOwnership(options(root));
  let hold = false, reached!: () => void, release!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { reached = resolve; });
  const queue = new FileQueue(owner, root, limits, { async after(op, name) { if (hold && op === 'rename' && name === 'checkpoint.next->checkpoint.json') { reached(); await paused; } } });
  try {
    await queue.start(); const first = make('first'); hold = true; let accepted = false;
    const result = queue.enqueue(() => queue.persist(first, 'epoch')).then(receipt => { accepted = true; return receipt; });
    await entered; assert.equal(accepted, false); assert.equal(queue.pending(), 1);
    release(); const receipt = await result; assert.equal(receipt.state, 'accepted');
    const data = await readFile(join(root, 'queue', 'segments/00000000000000000001.jsonl'));
    assert.equal(queue.stats().pendingEvents, 1); assert.equal(queue.stats().pendingBytes, data.length);
    await assert.rejects(queue.enqueue(() => queue.persist(make('second'), 'epoch')), (error: unknown) => error instanceof MemoryError && error.code === 'BACKPRESSURE');
    assert.deepEqual(await queue.enqueue(() => queue.persist(first, 'epoch')), receipt);
    await assert.rejects(queue.enqueue(() => queue.persist(make('first', 'changed'), 'epoch')), (error: unknown) => error instanceof MemoryError && error.code === 'REVISION_CONFLICT');
    await assert.rejects(queue.enqueue(() => queue.persist(first, 'changed-epoch')), (error: unknown) => error instanceof MemoryError && error.code === 'REVISION_CONFLICT');
    assert.deepEqual(await readFile(join(root, 'queue', 'segments/00000000000000000001.jsonl')), data);
    await queue.close(); await owner.assertOwned();
  } finally { release(); await queue.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'oversized-single-frame-rotates-without-exceeding-retained-budget', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-rotate-'))), owner = await acquireOwnership(options(root));
  const queue = new FileQueue(owner, root, { ...limits, maxEventBytes: 512, segmentBytes: 512, maxPendingBytes: 8192 });
  try {
    await queue.start();
    for (const name of ['one', 'two']) await queue.enqueue(() => queue.persist(make(name, 'x'.repeat(150)), 'epoch'));
    assert.equal(queue.writer.current.segments.length, 2);
    assert.equal(queue.writer.current.segments[0]?.frames.length, 1);
    assert.equal(queue.writer.current.segments[0]?.sealed, true);
    assert.equal(queue.writer.current.segments[1]?.frames.length, 1);
    assert.ok(queue.writer.current.segments.every(s => s.acceptedOffset > 512));
    assert.equal(queue.stats().pendingEvents, 2); assert.ok(queue.stats().pendingBytes <= 8192);
  } finally { await queue.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'ambiguous-append-fences-and-reopen-deduplicates', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-fence-'))), owner = await acquireOwnership(options(root));
  let fail = false;
  const queue = new FileQueue(owner, root, { ...limits, maxPendingBytes: 8192 }, { async after(op, name) { if (fail && op === 'file-sync' && name.startsWith('segments/')) throw Error('private path'); } });
  let reopened: FileQueue | undefined;
  try {
    await queue.start(); fail = true; const first = make('first');
    await assert.rejects(queue.enqueue(() => queue.persist(first, 'epoch')), (error: unknown) => error instanceof MemoryError && error.code === 'STORE_UNAVAILABLE' && 'operationId' in error && error.operationId === first.operationId && !error.message.includes('private path'));
    await assert.rejects(queue.enqueue(() => queue.persist(make('second'), 'epoch')), MemoryError);
    await queue.close();
    reopened = new FileQueue(owner, root, { ...limits, maxPendingBytes: 8192 }); await reopened.start();
    const next = reopened; assert.equal(next.stats().pendingEvents, 1);
    const before = next.stats().pendingBytes;
    assert.equal((await next.enqueue(() => next.persist(first, 'epoch'))).operationId, first.operationId);
    assert.equal(next.stats().pendingBytes, before); assert.equal(next.writer.current.lastSequence, '1');
  } finally { await queue.close(); await reopened?.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});
