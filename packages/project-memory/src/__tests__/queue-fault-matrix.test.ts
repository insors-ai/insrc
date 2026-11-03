import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { MemoryCommand } from '../types.js';
import { MemoryFactory } from '../index.js';
import { acquireOwnership } from '../ownership.js';
import { FileQueue } from '../queue/file-queue.js';
import { QueueAdmission } from '../queue/admission.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import { attestHostEvent } from './fixtures/host-options.js';
import { nativeTest } from './fixtures/node22.js';
const limits = { maxEventBytes: 512, maxPendingBytes: 65536, segmentBytes: 512, modelTimeoutMs: 1 };
const command = (id: string): MemoryCommand => ({ version: 1, scope: { projectId: 'p' }, source: { producerId: 'test', eventId: id, sessionId: 's', turnId: 't', sourceVersion: 'v1' }, kind: 'capture', payload: { text: 'private event' } });
const policy = { async bind(projectId: string) { return { projectId, root: '/project', scopeEpoch: 'epoch' }; }, async admit(_binding: unknown, value: unknown) { return value as never; } };

nativeTest(import.meta.url, 'write-sync-rename-unlink-failure-fences-the-lane', async () => {
  const successor = 'segments/00000000000000000002.jsonl';
  const points: [string, string, number][] = [
    ['write-chunk', successor, 1], ['file-sync', successor, 1], ['directory-sync', 'segments', 1],
    ['write', 'checkpoint.prev.next', 1], ['file-sync', 'checkpoint.prev.next', 1], ['rename', 'checkpoint.prev.next->checkpoint.prev', 1],
    ['directory-sync', 'queue', 1], ['write', 'checkpoint.next', 1], ['rename', 'checkpoint.next->checkpoint.json', 1],
    ['write-chunk', successor, 2], ['file-sync', successor, 2], ['rename', 'checkpoint.next->checkpoint.json', 2], ['directory-sync', 'queue', 4],
  ];
  for (const phase of ['before', 'after'] as const) for (const [operation, name, occurrence] of points) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-fault-matrix-'))), owner = await acquireOwnership(options(root));
    let enabled = false, count = 0, fired = false;
    const queue = new FileQueue(owner, root, limits, { [phase]: async (op: string, path: string) => {
      if (enabled && op === operation && path === name && ++count === occurrence) { fired = true; throw Object.assign(Error('private disk path'), { code: 'ENOSPC' }); }
    } });
    let reopened: FileQueue | undefined;
    try {
      await queue.start(); const admission = new QueueAdmission(queue, policy);
      const baseline = await admission.append(command('baseline')); enabled = true;
      await assert.rejects(admission.append(command('attempt')), (e: unknown) => e instanceof MemoryError && e.code === 'STORE_UNAVAILABLE' && !e.message.includes('private disk path'));
      assert.equal(fired, true, phase + ':' + operation + ':' + name + ':' + occurrence);
      const directory = join(root, 'queue', 'segments'), names = await readdir(directory);
      const before = await Promise.all(names.map(n => readFile(join(directory, n))));
      await assert.rejects(admission.append(command('must-not-write')), MemoryError);
      assert.deepEqual(await Promise.all(names.map(n => readFile(join(directory, n)))), before);
      await queue.close(); reopened = new FileQueue(owner, root, limits); await reopened.start();
      const again = new QueueAdmission(reopened, policy);
      assert.equal((await again.operation({ operationId: baseline.operationId, scope: { projectId: 'p' } })).state, 'accepted');
      const replayed: string[] = []; for await (const frame of again.replay()) replayed.push(frame.command.source.eventId);
      assert.equal(replayed[0], 'baseline'); assert.equal(new Set(replayed).size, replayed.length);
      assert.ok(replayed.length === 1 || (replayed.length === 2 && replayed[1] === 'attempt'));
    } finally { await reopened?.close(); await queue.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
  }
});

nativeTest(import.meta.url, 'partial-bootstrap-header-and-event-writes-recover-explicitly', async () => {
  for (const target of ['format', 'initial-header', 'successor-header', 'event']) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-partial-write-'))), owner = await acquireOwnership(options(root));
    let enabled = target === 'format' || target === 'initial-header', active = '', successorWrites = 0;
    const queue = new FileQueue(owner, root, limits, {
      async before(op, name) { if (op === 'write') { active = name; if (enabled && name.endsWith('00000000000000000002.jsonl')) successorWrites++; } },
      async write(file, bytes, offset, length, position) {
        const match = enabled && (target === 'format' ? active === 'format.json' : target === 'initial-header' ? active.endsWith('00000000000000000001.jsonl') : active.endsWith('00000000000000000002.jsonl') && successorWrites === (target === 'event' ? 2 : 1));
        if (match && offset >= 7) throw Object.assign(Error('disk full'), { code: 'ENOSPC' });
        return (await file.write(bytes, offset, match ? Math.min(length, 7) : length, position)).bytesWritten;
      },
    });
    let reopened: FileQueue | undefined;
    try {
      if (enabled) await assert.rejects(queue.start(), MemoryError);
      else { await queue.start(); const admission = new QueueAdmission(queue, policy); await admission.append(command('baseline')); enabled = true; await assert.rejects(admission.append(command('attempt')), MemoryError); }
      await queue.close(); reopened = new FileQueue(owner, root, limits); await reopened.start();
      assert.equal(reopened.stats().pendingEvents, target === 'format' || target === 'initial-header' ? 0 : 1);
      if (target === 'event') assert.match(await readFile(join(root, 'queue', 'recovery.json'), 'utf8'), /"state":"complete"/);
    } finally { await reopened?.close(); await queue.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
  }
});

nativeTest(import.meta.url, 'maximum-qualified-identities-preserve-scope-and-epoch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'memory-qualified-'));
  const id = '\u0001'.repeat(512); let epoch = '\u0002'.repeat(256), modelCalls = 0;
  const opts = options(root);
  const logs: unknown[] = [];
  const service = await MemoryFactory.open({ ...opts, limits: { ...limits, maxEventBytes: 65536, segmentBytes: 65536, maxPendingBytes: 1024 * 1024 }, policy: { async bind(projectId) { return { projectId, root: '/project', scopeEpoch: epoch }; }, async admit(_binding, value) { return attestHostEvent(value); } }, models: { ...opts.models, async complete() { modelCalls++; return null; }, async embed() { modelCalls++; return [0, 1]; } }, logger: { write(level, event, fields) { logs.push({ level, event, fields }); } } });
  try {
    const c: MemoryCommand = { version: 1, scope: { projectId: id, sessionId: id, branch: id, environment: id }, source: { producerId: id, eventId: id, sessionId: 'different provenance', turnId: id, sourceVersion: '\u0003'.repeat(256) }, kind: 'capture', expectedRevision: id, payload: { schemaVersion: 1, input: {}, source: { text: 'secret payload', reference: null, occurredAt: null } } };
    const receipt = await service.submit(c); assert.equal(receipt.state, 'accepted');
    assert.deepEqual(await service.submit(c), receipt);
    assert.deepEqual(await service.operation({ scope: c.scope, operationId: receipt.operationId }), receipt);
    await assert.rejects(service.operation({ scope: { projectId: id }, operationId: receipt.operationId }), MemoryError);
    epoch = 'new'; await assert.rejects(service.submit(c), (e: unknown) => e instanceof MemoryError && e.code === 'REVISION_CONFLICT');
    assert.equal(modelCalls, 0); assert.doesNotMatch(JSON.stringify(logs), /secret payload|producerId|eventId/);
  } finally { await service.close(); await rm(root, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'wall-clock-changes-preserve-sequence-and-clamp-age', async context => {
  let wall = 10_000;
  context.mock.method(Date, 'now', () => wall);
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-clock-'))), owner = await acquireOwnership(options(root));
  const queue = new FileQueue(owner, root, limits);
  try {
    await queue.start(); const admission = new QueueAdmission(queue, policy);
    await admission.append(command('first')); assert.equal(queue.stats().oldestPendingMs, 0);
    wall = 2000; assert.equal(queue.stats().oldestPendingMs, 0, 'backward clock cannot yield negative age');
    await admission.append(command('second'));
    const observed: { sequence: string; time: number }[] = [];
    for await (const frame of admission.replay()) observed.push({ sequence: frame.sequence, time: frame.admittedAtMs });
    assert.deepEqual(observed, [{ sequence: '1', time: 10_000 }, { sequence: '2', time: 2000 }]);
    wall = 25_000; assert.equal(queue.stats().oldestPendingMs, 23_000);
    assert.equal(queue.writer.current.lastSequence, '2');
  } finally { await queue.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});
