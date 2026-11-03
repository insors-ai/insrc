import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { MemoryCommand, Scope } from '../types.js';
import { acquireOwnership } from '../ownership.js';
import { FileQueue } from '../queue/file-queue.js';
import { QueueAdmission } from '../queue/admission.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';
const limits = { maxEventBytes: 4096, maxPendingBytes: 65536, segmentBytes: 4096, modelTimeoutMs: 1 };
const command = (id: string, scope: Scope = { projectId: 'p' }): MemoryCommand => ({ version: 1, scope, source: { producerId: 'test', eventId: id, sessionId: 'provenance', turnId: 't', sourceVersion: 'v1' }, kind: 'capture', payload: { text: 'memory' } });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-replay-'))), owner = await acquireOwnership(options(root));
  const queue = new FileQueue(owner, root, limits); await queue.start();
  let epoch = 'epoch';
  const admission = new QueueAdmission(queue, { async bind(projectId) { return { projectId, root: '/project', scopeEpoch: epoch }; }, async admit(_binding, value) { return value; } });
  return { queue, admission, changeEpoch() { epoch = 'changed'; }, async close() { await queue.close(); await owner.close(); await rm(root, { recursive: true, force: true }); } };
}

nativeTest(import.meta.url, 'pinned-replay-and-qualified-operation-status', async () => {
  const f = await fixture();
  try {
    const global = await f.admission.append(command('global'));
    const scoped = await f.admission.append(command('scoped', { projectId: 'p', sessionId: 's', branch: 'main', environment: 'prod' }));
    assert.equal((await f.admission.operation({ operationId: global.operationId, scope: { projectId: 'p', sessionId: 'narrow' } })).state, 'accepted');
    const allowed = { projectId: 'p', sessionId: 's', branch: 'main', environment: 'prod' };
    assert.equal((await f.admission.operation({ operationId: scoped.operationId, scope: allowed })).eventId, 'scoped');
    const errors: string[] = [];
    for (const scope of [{ projectId: 'p' }, { ...allowed, projectId: 'other' }, { ...allowed, sessionId: 'provenance' }, { ...allowed, branch: 'other' }, { ...allowed, environment: 'dev' }]) {
      await assert.rejects(f.admission.operation({ operationId: scoped.operationId, scope }), (error: unknown) => { assert.ok(error instanceof MemoryError); errors.push(error.code + ':' + error.message); return true; });
    }
    await assert.rejects(f.admission.operation({ operationId: '0'.repeat(64), scope: allowed }), (error: unknown) => { assert.ok(error instanceof MemoryError); errors.push(error.code + ':' + error.message); return true; });
    assert.equal(new Set(errors).size, 1, 'unknown and hidden are indistinguishable');
    const reader = f.admission.replay()[Symbol.asyncIterator]();
    assert.equal((await reader.next()).value?.operationId, global.operationId);
    assert.equal(f.queue.isPinned(f.queue.writer.current.activeSegment), true);
    const other = f.admission.replay()[Symbol.asyncIterator](); await assert.rejects(other.next(), MemoryError); await other.return?.();
    let drained = false; const draining = f.queue.drain().then(() => { drained = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(drained, false);
    await reader.return?.(); await draining;
    assert.equal(f.queue.isPinned(f.queue.writer.current.activeSegment), false);
    f.changeEpoch(); await assert.rejects(f.admission.operation({ operationId: global.operationId, scope: { projectId: 'p' } }), MemoryError);
  } finally { await f.close(); }
});

nativeTest(import.meta.url, 'retry-holes-do-not-authorize-mixed-segment-deletion', async () => {
  const f = await fixture();
  try {
    for (const id of ['one', 'two', 'three']) await f.admission.append(command(id));
    const first = f.queue.writer.current.segments[0]!;
    const changed = first.frames.map((entry, index) => index === 1 ? { ...entry, terminal: true, generation: 'verified-test-generation' } : entry);
    // Private fixture seeds future verified-terminal state; this does not exercise S3.
    for (const entry of changed) { const old = f.queue.index.get(entry.operationId)!; f.queue.index.set(entry.operationId, { ...old, record: entry }); }
    const seen: string[] = [];
    for await (const frame of f.admission.replay()) seen.push(frame.sequence);
    assert.deepEqual(seen, ['1', '3']);
    assert.equal(f.queue.stats().pendingEvents, 2);
    assert.equal(f.queue.writer.current.segments.length, 1);
    const unused = f.admission.replay()[Symbol.asyncIterator](); await unused.return?.();
    assert.equal(f.queue.pending(), 0, 'return before next must release the acquired lease');
    const aborted = f.admission.replay()[Symbol.asyncIterator](); await aborted.next();
    await assert.rejects(aborted.throw?.(Error('consumer abort'))!);
    assert.equal(f.queue.pending(), 0);
    await f.admission.append(command('after-abort'));
    f.queue.stopAdmission();
    await assert.rejects(f.admission.operation({ operationId: changed[0]!.operationId, scope: { projectId: 'p' } }), MemoryError);
    const stopped = f.admission.replay()[Symbol.asyncIterator](); await assert.rejects(stopped.next(), MemoryError); await stopped.return?.();
  } finally { await f.close(); }
});
