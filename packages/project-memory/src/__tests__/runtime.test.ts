import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setImmediate as tick } from 'node:timers/promises';
import { MemoryFactory } from '../index.js';
import { EmbeddedMemoryService } from '../runtime.js';
import { ModelDispatcher } from '../model-dispatcher.js';
import { acquireOwnership } from '../ownership.js';
import { MemoryError } from '../errors.js';
import { hostOptions as options, attestHostEvent } from './fixtures/host-options.js';
import { nativeTest } from './fixtures/node22.js';

test('idempotent-drain-close-and-provider-ownership', async () => {
  let resolve!: (value: null) => void; let closed = 0; let active = false;
  const opts = options('/unused');
  const models = new ModelDispatcher({ ...opts.models, async complete() { active = true; return new Promise<null>(done => { resolve = done; }); } }, 1000);
  const service = new EmbeddedMemoryService({ directory: '/unused', async assertOwned() {}, async close() { closed++; } }, models, { write() { throw new Error('logger failure'); } });
  const call = models.complete({ role: 'normalize', input: null, schema: {}, signal: new AbortController().signal });
  const result = call.catch(error => error);
  await tick(); assert.ok(active);
  assert.deepEqual(await service.drain(5), { completed: false, pending: 1 });
  const close = service.close(); assert.equal(service.close(), close);
  await result; await tick(); assert.equal(closed, 0, 'ignored abort must retain directory ownership');
  resolve(null); await close; assert.equal(closed, 1); await service.close(); assert.equal(closed, 1);
  await assert.rejects(service.ready(), MemoryError);

  let released = false;
  const failure = new EmbeddedMemoryService({ directory: '/unused', async assertOwned() {}, async close() { released = true; } }, new ModelDispatcher(opts.models, 1000), opts.logger, [{ stopAdmission() {}, pending() { return 1; }, async drain() { throw new Error('private work error'); }, async close() {} }]);
  await assert.rejects(failure.close(), MemoryError); assert.equal(released, false);
});

nativeTest(import.meta.url, 'public-service-accepted-status-and-unavailable-semantic-capabilities', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-runtime-'));
  try {
    let calls = 0; let disposed = false;
    const opts = options(join(dir, 'data'));
    const models = { ...opts.models, async complete() { calls++; return null; }, close() { disposed = true; } };
    const service = await MemoryFactory.open({ ...opts, models });
    await service.ready();
    assert.equal('owner' in service, false); assert.equal('models' in service, false);
    await assert.rejects(MemoryFactory.open(opts), (error: unknown) => error instanceof MemoryError && error.code === 'OWNERSHIP_CONFLICT');
    const scope = { projectId: 'p' };
    const command = { version: 1 as const, scope, source: { producerId: 'p', eventId: 'e', sessionId: 's', turnId: 't', sourceVersion: '1' }, kind: 'capture' as const, payload: { schemaVersion: 1, input: {}, source: { text: 'Host captured source', reference: null, occurredAt: null } } };
    const receipt = await service.submit(command); assert.equal(receipt.state, 'accepted');
    assert.deepEqual(await service.operation({ scope, operationId: receipt.operationId }), receipt);
    const requests = [service.context({ scope, budgetTokens: 100 }), service.search({ scope, budgetTokens: 100, query: 'x', limit: 1 }), service.inspect({ scope, memoryId: 'x' })];
    for (const request of requests) await assert.rejects(request, (error: unknown) => error instanceof MemoryError && error.code === 'NOT_READY');
    assert.equal(calls, 0); assert.deepEqual(await service.drain(100), { completed: true, pending: 0 });
    await service.close(); assert.equal(disposed, false);
    await models.complete(); assert.equal(calls, 1, 'host provider remains usable');
    const reopened = await MemoryFactory.open(opts);
    assert.deepEqual(await reopened.submit(command), receipt);
    assert.deepEqual(await reopened.operation({ scope, operationId: receipt.operationId }), receipt); await reopened.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// A failure in one quiescent participant must not strand later resources.
test('all-quiescent-participants-close-before-unverified-ownership-is-retained', async () => {
  const events: string[] = []; let released = false;
  const opts = options('/unused');
  const work = [0, 1, 2].map(id => ({
    stopAdmission() { events.push('stop' + id); }, pending() { return 0; },
    async drain() { events.push('drain' + id); },
    async close() { events.push('close' + id); if (id !== 1) throw Error('private cleanup error'); },
  }));
  const service = new EmbeddedMemoryService({ directory: '/unused', async assertOwned() {}, async close() { released = true; } }, new ModelDispatcher(opts.models, 1000), opts.logger, work);
  const closing = service.close();
  await assert.rejects(closing, (error: unknown) => error instanceof MemoryError && error.code === 'STORE_UNAVAILABLE' && !error.message.includes('private'));
  assert.deepEqual(events, ['stop0', 'stop1', 'stop2', 'drain0', 'drain1', 'drain2', 'close0', 'close1', 'close2']);
  assert.equal(released, false); assert.equal(service.close(), closing);
});

nativeTest(import.meta.url, 'drain-close-startup-failure-preserve-backlog-and-ownership', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-drain-'));
  let release!: () => void, entered!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const opts = options(join(dir, 'data'));
  const service = await MemoryFactory.open({ ...opts, policy: { ...opts.policy, async admit(_binding, value) { entered(); await paused; return attestHostEvent(value); } } });
  let closing: Promise<void> | undefined;
  try {
    const command = { version: 1 as const, scope: { projectId: 'p' }, source: { producerId: 'test', eventId: 'one', sessionId: 's', turnId: 't', sourceVersion: '1' }, kind: 'capture' as const, payload: { schemaVersion: 1, input: {}, source: { text: 'Host captured source', reference: null, occurredAt: null } } };
    const submitted = service.submit(command); await started;
    assert.deepEqual(await service.drain(5), { completed: false, pending: 1 });
    closing = service.close();
    await assert.rejects(acquireOwnership(opts), (e: unknown) => e instanceof MemoryError && e.code === 'OWNERSHIP_CONFLICT');
    await assert.rejects(service.submit(command), MemoryError);
    release(); const receipt = await submitted; await closing;
    const reopened = await MemoryFactory.open(opts);
    assert.deepEqual(await reopened.operation({ scope: command.scope, operationId: receipt.operationId }), receipt);
    assert.deepEqual(await reopened.drain(100), { completed: true, pending: 0 }, 'durable backlog is not active owned work'); await reopened.close();
    const segment = join(opts.dataDirectory, 'queue', 'segments', '00000000000000000001.jsonl');
    const valid = await readFile(segment); await writeFile(segment, valid.toString().replace('"capture"', '"invalid"'));
    await assert.rejects(MemoryFactory.open(opts), (e: unknown) => e instanceof MemoryError && e.code === 'STORE_UNAVAILABLE');
    const guard = await acquireOwnership(opts); await guard.assertOwned(); await guard.close();
    assert.notDeepEqual(await readFile(segment), valid, 'failed startup preserves corruption for inspection');
    // Test-only explicit repair, proving startup cleanup released every owned fd.
    await writeFile(segment, valid); await unlink(join(opts.dataDirectory, 'queue', 'fault.json'));
    const repaired = await MemoryFactory.open(opts); await repaired.close();
  } finally { release(); await closing; await service.close(); await rm(dir, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'queue-limit-validation-precedes-directory-ownership', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-limit-'));
  try {
    const path = join(dir, 'must-not-exist'), opts = options(path);
    await assert.rejects(MemoryFactory.open({ ...opts, limits: { ...opts.limits, maxEventBytes: 32 * 1024 * 1024, segmentBytes: 32 * 1024 * 1024, maxPendingBytes: 64 * 1024 * 1024 } }), (e: unknown) => e instanceof MemoryError && e.code === 'INVALID_REQUEST');
    await assert.rejects(access(path), (e: unknown) => !!e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
