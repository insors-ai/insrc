import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireOwnership } from '../ownership.js';
import { MemoryError } from '../errors.js';
import { QueueIo, segmentName } from '../queue/io.js';
import type { IoHooks } from '../queue/io.js';
import { CheckpointWriter, initialCheckpoint } from '../queue/checkpoint.js';
import { encodeFrame, snapshotCommand } from '../queue/codec.js';
import { recoverQueue } from '../queue/recovery.js';
import type { EventBody } from '../queue/types.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';
const limits = { maxEventBytes: 4096, maxPendingBytes: 65536, segmentBytes: 4096, modelTimeoutMs: 1 };
async function fixture(hooks: IoHooks = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-recover-')));
  const owner = await acquireOwnership(options(root));
  const io = new QueueIo(owner, root, hooks); await io.start(); const boot = await io.bootstrap();
  const writer = new CheckpointWriter(io); await writer.publish(initialCheckpoint(boot.queueId, boot.header));
  const name = 'segments/' + segmentName(boot.header.segmentId);
  async function reopen() { const next = new QueueIo(owner, root); await next.start(); return next; }
  async function close() { await io.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
  function event(sequence = '1', eventId = 'event') {
    const c = snapshotCommand({ version: 1, scope: { projectId: 'project' }, source: { producerId: 'test', eventId, sessionId: 's', turnId: 't', sourceVersion: 'v1' }, kind: 'capture', payload: { text: 'private memory' } }, limits.maxEventBytes);
    const body: EventBody = { formatVersion: 1, recordType: 'event', queueId: boot.queueId, sequence, operationId: c.operationId, command: c.command, payloadHash: c.payloadHash, admittedAtMs: 1, scopeEpoch: 'epoch' };
    return { body, bytes: encodeFrame(body, limits.maxEventBytes) };
  }
  async function accepted() {
    const e = event(), current = writer.current, segment = current.segments[0]!;
    await io.write(name, e.bytes, 'append', segment.acceptedOffset);
    await writer.publish({ ...current, generation: '1', lastSequence: '1', segments: [{ ...segment, acceptedOffset: segment.acceptedOffset + e.bytes.length, frames: [{ operationId: e.body.operationId, sequence: '1', offset: segment.acceptedOffset, length: e.bytes.length, terminal: false }] }] });
    return e;
  }
  return { root, owner, io, boot, writer, name, reopen, close, event, accepted };
}

nativeTest(import.meta.url, 'recovery-frontier-complete-suffix-and-unaccepted-partial-tail', async () => {
  const f = await fixture();
  try {
    const accepted = await f.accepted(), next = f.event('2', 'second');
    const offset = f.writer.current.segments[0]!.acceptedOffset;
    await f.io.write(f.name, Buffer.concat([next.bytes, Buffer.from('{"secret":"incomplete')]), 'append', offset);
    const recovered = await recoverQueue(f.io, f.writer, f.boot, limits);
    assert.equal(recovered.index.size, 2); assert.equal(recovered.checkpoint.lastSequence, '2');
    assert.ok(recovered.index.has(accepted.body.operationId));
    assert.ok(recovered.index.has(next.body.operationId));
    assert.equal((await readFile(join(f.root, 'queue', f.name))).length, offset + next.bytes.length);
    const report = await readFile(join(f.root, 'queue', 'recovery.json'), 'utf8');
    assert.match(report, /"state":"complete"/); assert.doesNotMatch(report, /secret|incomplete|private memory/);
    await f.io.close(); const io = await f.reopen();
    try { const again = await recoverQueue(io, new CheckpointWriter(io), f.boot, limits); assert.equal(again.index.size, 2); assert.equal(again.checkpoint.lastSequence, '2'); }
    finally { await io.close(); }
  } finally { await f.close(); }
});

nativeTest(import.meta.url, 'published-checkpoint-and-sealed-corruption-fail-closed', async () => {
  for (const mode of ['accepted-truncate', 'accepted-checksum', 'sealed-tail', 'missing-accepted', 'bad-checkpoint', 'complete-invalid-suffix', 'duplicate-event', 'sequence-gap', 'unknown-version']) {
    const f = await fixture();
    try {
      const e = await f.accepted();
      if (mode === 'sealed-tail') await f.writer.rotate(limits.maxEventBytes, limits.maxPendingBytes);
      const path = join(f.root, 'queue', f.name);
      const bytes = await readFile(path);
      if (mode === 'accepted-truncate') await writeFile(path, bytes.subarray(0, -2));
      else if (mode === 'accepted-checksum') await writeFile(path, bytes.toString().replace('private memory', 'altered memory'));
      else if (mode === 'sealed-tail' || mode === 'complete-invalid-suffix') await writeFile(path, Buffer.concat([bytes, Buffer.from('corrupt\n')]));
      else if (mode === 'missing-accepted') await unlink(path);
      else if (mode === 'bad-checkpoint') await writeFile(join(f.root, 'queue', 'checkpoint.json'), 'broken');
      else if (mode === 'duplicate-event') await writeFile(path, Buffer.concat([bytes, encodeFrame({ ...e.body, sequence: '2' }, limits.maxEventBytes)]));
      else if (mode === 'sequence-gap') await writeFile(path, Buffer.concat([bytes, f.event('3', 'gap').bytes]));
      else if (mode === 'unknown-version') {
        const unknown = { ...f.event('2', 'future').body, formatVersion: 2 };
        await writeFile(path, Buffer.concat([bytes, encodeFrame(unknown as unknown as EventBody, limits.maxEventBytes)]));
      }
      const before = mode === 'missing-accepted' ? undefined : await readFile(path);
      await assert.rejects(recoverQueue(f.io, f.writer, f.boot, limits), (error: unknown) => error instanceof MemoryError && error.code === 'STORE_UNAVAILABLE', mode);
      if (before) assert.deepEqual(await readFile(path), before, mode + ' must preserve segment bytes');
      assert.doesNotMatch(await readFile(join(f.root, 'queue', 'fault.json'), 'utf8'), /private memory|altered memory/);
    } finally { await f.close(); }
  }
});

nativeTest(import.meta.url, 'exact-header-only-orphan-recovers-event-bearing-orphan-does-not', async () => {
  for (const eventBearing of [false, true]) {
    const f = await fixture();
    try {
      const name = 'segments/00000000000000000002.jsonl';
      const header = encodeFrame({ ...f.boot.header, segmentId: '00000000000000000002' }, limits.maxEventBytes);
      await f.io.write(name, eventBearing ? Buffer.concat([header, f.event().bytes]) : header, 'create');
      await f.io.syncDirectory('segments');
      if (eventBearing) {
        await assert.rejects(recoverQueue(f.io, f.writer, f.boot, limits), MemoryError);
        assert.equal(await f.io.exists(name), true);
      } else {
        assert.equal((await recoverQueue(f.io, f.writer, f.boot, limits)).index.size, 0);
        assert.equal(await f.io.exists(name), false);
      }
    } finally { await f.close(); }
  }
});

nativeTest(import.meta.url, 'partial-tail-intent-resumes-before-and-after-truncate', async () => {
  for (const phase of ['before', 'after']) {
    let inject = false;
    const hooks = { [phase]: async (op: string) => { if (inject && op === 'truncate') throw Error('injected'); } };
    const f = await fixture(hooks);
    try {
      await f.accepted(); const frontier = f.writer.current.segments[0]!.acceptedOffset;
      await f.io.write(f.name, Buffer.from('{"private":"unfinished'), 'append', frontier); inject = true;
      await assert.rejects(recoverQueue(f.io, f.writer, f.boot, limits), MemoryError);
      assert.match(await readFile(join(f.root, 'queue', 'recovery.json'), 'utf8'), /"state":"intent"/);
      await f.io.close(); const io = await f.reopen();
      try {
        const recovered = await recoverQueue(io, new CheckpointWriter(io), f.boot, limits);
        assert.equal(recovered.index.size, 1); assert.equal((await readFile(join(f.root, 'queue', f.name))).length, frontier);
        assert.match(await readFile(join(f.root, 'queue', 'recovery.json'), 'utf8'), /"state":"complete"/);
      } finally { await io.close(); }
    } finally { await f.close(); }
  }
});
