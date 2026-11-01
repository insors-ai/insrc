import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setImmediate as tick } from 'node:timers/promises';
import { MemoryFactory } from '../index.js';
import { EmbeddedMemoryService } from '../runtime.js';
import { ModelDispatcher } from '../model-dispatcher.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';

test('idempotent-drain-close-and-provider-ownership', async () => {
  let resolve!: (value: null) => void; let closed = 0; let active = false;
  const opts = options('/unused');
  const models = new ModelDispatcher({ ...opts.models, async complete() { active = true; return new Promise<null>(done => { resolve = done; }); } }, 1000);
  const service = new EmbeddedMemoryService({ async assertOwned() {}, async close() { closed++; } }, models, { write() { throw new Error('logger failure'); } });
  const call = models.complete({ role: 'normalize', input: null, schema: {}, signal: new AbortController().signal });
  const result = call.catch(error => error);
  await tick(); assert.ok(active);
  assert.deepEqual(await service.drain(5), { completed: false, pending: 1 });
  const close = service.close(); assert.equal(service.close(), close);
  await result; await tick(); assert.equal(closed, 0, 'ignored abort must retain directory ownership');
  resolve(null); await close; assert.equal(closed, 1); await service.close(); assert.equal(closed, 1);
  await assert.rejects(service.ready(), MemoryError);

  let released = false;
  const failure = new EmbeddedMemoryService({ async assertOwned() {}, async close() { released = true; } }, new ModelDispatcher(opts.models, 1000), opts.logger, [{ stopAdmission() {}, pending() { return 1; }, async drain() { throw new Error('private work error'); }, async close() {} }]);
  await assert.rejects(failure.close(), MemoryError); assert.equal(released, false);
});

nativeTest(import.meta.url, 'foundation-data-methods-return-not-ready', async () => {
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
    const requests = [service.submit({ version: 1, scope, source: { producerId: 'p', eventId: 'e', sessionId: 's', turnId: 't', sourceVersion: '1' }, kind: 'capture', payload: null }), service.context({ scope, budgetTokens: 100 }), service.search({ scope, budgetTokens: 100, query: 'x', limit: 1 }), service.inspect({ scope, memoryId: 'x' }), service.operation({ scope, operationId: 'x' })];
    for (const request of requests) await assert.rejects(request, (error: unknown) => error instanceof MemoryError && error.code === 'NOT_READY');
    assert.equal(calls, 0); assert.deepEqual(await service.drain(100), { completed: true, pending: 0 });
    await service.close(); assert.equal(disposed, false);
    await models.complete(); assert.equal(calls, 1, 'host provider remains usable');
    const reopened = await MemoryFactory.open(opts); await reopened.close();
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
  const service = new EmbeddedMemoryService({ async assertOwned() {}, async close() { released = true; } }, new ModelDispatcher(opts.models, 1000), opts.logger, work);
  const closing = service.close();
  await assert.rejects(closing, (error: unknown) => error instanceof MemoryError && error.code === 'STORE_UNAVAILABLE' && !error.message.includes('private'));
  assert.deepEqual(events, ['stop0', 'stop1', 'stop2', 'drain0', 'drain1', 'drain2', 'close0', 'close1', 'close2']);
  assert.equal(released, false); assert.equal(service.close(), closing);
});
