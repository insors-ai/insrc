import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { HostPolicy, Json, MemoryCommand } from '../types.js';
import { acquireOwnership } from '../ownership.js';
import { FileQueue } from '../queue/file-queue.js';
import { QueueAdmission } from '../queue/admission.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';
const make = (eventId: string): MemoryCommand => ({ version: 1, scope: { projectId: 'project' }, source: { producerId: 'test', eventId, sessionId: 's', turnId: 'turn', sourceVersion: 'v1' }, kind: 'capture', payload: { text: 'private' } });
const limits = { maxEventBytes: 4096, maxPendingBytes: 65536, segmentBytes: 4096, modelTimeoutMs: 1 };
async function fixture(policy: HostPolicy) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-admit-'))), owner = await acquireOwnership(options(root));
  const queue = new FileQueue(owner, root, limits); await queue.start();
  const admission = new QueueAdmission(queue, policy);
  return { root, queue, admission, async close() { await queue.close(); await owner.close(); await rm(root, { recursive: true, force: true }); } };
}
const bind = async (projectId: string) => ({ projectId, root: '/project', scopeEpoch: 'epoch' });

nativeTest(import.meta.url, 'concurrent-admission-fifo-and-idempotent-retry', async () => {
  const order: string[] = []; let unblock!: () => void, entered!: () => void;
  const paused = new Promise<void>(resolve => { unblock = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const f = await fixture({ bind, async admit(_binding, value) {
    const command = value as unknown as MemoryCommand;
    order.push(command.source.eventId);
    if (command.source.eventId === 'first' && order.length === 1) { entered(); await paused; }
    if (command.source.eventId === 'denied') throw new MemoryError('POLICY_DENIED', 'private error');
    return value;
  } });
  try {
    const mutable = make('first'); const first = f.admission.append(mutable); await started;
    (mutable.payload as { text: string }).text = 'mutated';
    const denied = assert.rejects(f.admission.append(make('denied')), (error: unknown) => error instanceof MemoryError && error.code === 'POLICY_DENIED' && !error.message.includes('private error'));
    const second = f.admission.append(make('second'));
    assert.deepEqual(order, ['first']); assert.equal(f.queue.stats().pendingEvents, 0);
    unblock(); const [a, b] = await Promise.all([first, second]); await denied;
    assert.deepEqual(order, ['first', 'denied', 'second']);
    assert.notEqual(a.operationId, b.operationId); assert.equal(f.queue.writer.current.lastSequence, '2');
    const stored = await readFile(join(f.root, 'queue', 'segments/00000000000000000001.jsonl'), 'utf8');
    assert.match(stored, /private/); assert.doesNotMatch(stored, /mutated|denied/);
    const bytes = f.queue.stats().pendingBytes;
    assert.equal((await f.admission.append(make('first'))).operationId, a.operationId);
    assert.equal(f.queue.stats().pendingBytes, bytes); assert.equal(order.at(-1), 'first', 'retries are re-admitted');
  } finally { unblock(); await f.close(); }
});

nativeTest(import.meta.url, 'privacy-binding-and-scope-status-isolation-before-enqueue', async () => {
  for (const mode of ['unbound', 'wrong-binding', 'accessor-binding', 'throw', 'scope-change', 'source-change', 'redact', 'invalid-output']) {
    let getterCalled = false;
    const f = await fixture({
      async bind(projectId) {
        if (mode === 'unbound') throw new MemoryError('UNBOUND_PROJECT', 'sensitive');
        if (mode === 'wrong-binding') return { projectId: 'other', root: '/project', scopeEpoch: 'epoch' };
        if (mode === 'accessor-binding') return Object.defineProperty({ projectId, root: '/project' }, 'scopeEpoch', { enumerable: true, get() { getterCalled = true; return 'epoch'; } }) as Awaited<ReturnType<HostPolicy['bind']>>;
        return bind(projectId);
      },
      async admit(_binding, value) {
        const c = value as unknown as MemoryCommand;
        if (mode === 'throw') throw Error('sensitive');
        if (mode === 'scope-change') return { ...c, scope: { projectId: 'other' } } as unknown as Json;
        if (mode === 'source-change') return { ...c, source: { ...c.source, producerId: 'other' } } as unknown as Json;
        if (mode === 'invalid-output') return null;
        return { ...c, payload: { text: 'redacted' } } as unknown as Json;
      },
    });
    try {
      const before = f.queue.stats().pendingBytes;
      if (mode === 'redact') {
        await f.admission.append(make('one'));
        const bytes = await readFile(join(f.root, 'queue', 'segments/00000000000000000001.jsonl'), 'utf8');
        assert.match(bytes, /redacted/); assert.doesNotMatch(bytes, /private/);
      } else {
        await assert.rejects(f.admission.append(make('one')), (error: unknown) => error instanceof MemoryError && !error.message.includes('sensitive'), mode);
        assert.equal(f.queue.stats().pendingBytes, before); assert.equal(f.queue.stats().pendingEvents, 0);
      }
      assert.equal(getterCalled, false);
    } finally { await f.close(); }
  }
});

nativeTest(import.meta.url, 'admission-quota-refunds-and-hanging-policy-drains-safely', async () => {
  let release!: () => void, entered!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  let seen = 0;
  const f = await fixture({ bind, async admit(_binding, value) { if (++seen === 1) { entered(); await paused; } return value; } });
  try {
    const first = f.admission.append(make('0')); await started;
    const remaining = Array.from({ length: 63 }, (_, i) => f.admission.append(make(String(i + 1))));
    const outcomes = Promise.allSettled([first, ...remaining]);
    await assert.rejects(f.admission.append(make('overflow')), (error: unknown) => error instanceof MemoryError && error.code === 'BACKPRESSURE');
    let drained = false; const drain = f.queue.drain().then(() => { drained = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(drained, false);
    f.queue.stopAdmission();
    await assert.rejects(f.admission.append(make('late')), MemoryError);
    release(); await outcomes; await drain;
    assert.equal(f.queue.pending(), 0); assert.equal(f.queue.stats().pendingEvents > 0, true);
    // Rejection after stop also releases the snapshot reservation; it cannot hang close.
  } finally { release(); await f.close(); }
});
