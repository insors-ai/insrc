import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryError } from '../errors.js';
import { acquireOwnership } from '../ownership.js';
import { advance, CheckpointWriter, checkpointBytes, initialCheckpoint, parseCheckpoint, reserveMetadata } from '../queue/checkpoint.js';
import type { Checkpoint, FrameRecord } from '../queue/checkpoint.js';
import { QueueIo } from '../queue/io.js';
import { QUEUE_LIMITS } from '../queue/types.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';
const queueId = '12345678-1234-1234-1234-123456789abc';
const initial = () => initialCheckpoint(queueId, { formatVersion: 1, recordType: 'segment', queueId, segmentId: '00000000000000000001', firstSequence: '1' });
const entry = (n: number): FrameRecord => ({ operationId: n.toString(16).padStart(64, '0'), sequence: String(n), offset: 300 + (n - 1) * 100, length: 100, terminal: true, generation: '\u0001'.repeat(128), retry: { attempts: Number.MAX_SAFE_INTEGER, nextEligibleAt: Number.MAX_SAFE_INTEGER, errorCode: '\u0001'.repeat(128) } });

test('retained-byte-and-worst-case-metadata-reservations', () => {
  let previous = checkpointBytes(initial()).length;
  for (let n = 1; n <= 100; n++) {
    const first = initial();
    const value: Checkpoint = { ...first, lastSequence: String(n), segments: [{ ...first.segments[0]!, acceptedOffset: 300 + n * 100, frames: Array.from({ length: n }, (_, i) => entry(i + 1)) }] };
    const size = checkpointBytes(value).length;
    assert.ok(size <= QUEUE_LIMITS.checkpointFixed + n * QUEUE_LIMITS.checkpointPerFrame + QUEUE_LIMITS.checkpointPerSegment);
    assert.ok(size - previous < QUEUE_LIMITS.checkpointPerFrame); previous = size;
  }
  assert.throws(() => reserveMetadata(65_536, 1), (e: unknown) => e instanceof MemoryError && e.code === 'BACKPRESSURE');
  // Retirement references stay within the same allowance; terminal retry
  // scheduling metadata is deliberately absent from the retiring representation.
  const { retry: _retry, ...terminal } = entry(1);
  const retiring = { ...terminal, retirement: { identityDigest: 'a'.repeat(64), payloadHash: 'b'.repeat(64), scopeDigest: 'c'.repeat(64), scopeEpochDigest: 'd'.repeat(64) } };
  assert.ok(Buffer.byteLength(JSON.stringify(retiring)) < QUEUE_LIMITS.checkpointPerFrame);
  const first = initial();
  checkpointBytes({ ...first, receiptBarrier: true, lastSequence: '1', segments: [{ ...first.segments[0]!, sealed: true, retiring: true, acceptedOffset: 400, frames: [retiring] }] });
  reserveMetadata(0, 1);
  assert.throws(() => advance('18446744073709551615'), MemoryError);
});

test('checkpoint-schema-generation-and-retry-state-validation', () => {
  const first = initial(); assert.equal(parseCheckpoint(checkpointBytes(first)).generation, '0');
  assert.ok(Object.isFrozen(parseCheckpoint(checkpointBytes(first)).segments));
  const bad = [
    { ...first, extra: 1 }, { ...first, activeSegment: '2' }, { ...first, lastSequence: '1' },
    { ...first, segments: [] }, { ...first, generation: '00' },
    { ...first, segments: [{ ...first.segments[0], sealed: true }] },
    { ...first, lastSequence: '1', segments: [{ ...first.segments[0], frames: [{ ...entry(1), terminal: false }], acceptedOffset: 400 }] },
    { ...first, lastSequence: '1', segments: [{ ...first.segments[0], frames: [{ ...entry(1), retry: { attempts: -1, nextEligibleAt: 0, errorCode: 'retry' } }], acceptedOffset: 400 }] },
  ];
  for (const value of bad) assert.throws(() => checkpointBytes(value as Checkpoint), MemoryError);
  assert.throws(() => parseCheckpoint(Buffer.from(' ' + checkpointBytes(first))), MemoryError);
  assert.throws(() => parseCheckpoint(Buffer.alloc(QUEUELIMIT() + 1)), MemoryError);
});
function QUEUELIMIT(): number { return QUEUE_LIMITS.checkpointBytes; }

nativeTest(import.meta.url, 'rotation-orphan-successor-and-checkpoint-replacement-matrix', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-checkpoint-')));
  const owner = await acquireOwnership(options(root));
  const events: string[] = [];
  const io = new QueueIo(owner, root, { async before(op, name) { events.push(op + ':' + name); } });
  try {
    await io.start(); const boot = await io.bootstrap();
    const writer = new CheckpointWriter(io); assert.equal(await writer.load(), undefined);
    await writer.publish(initialCheckpoint(boot.queueId, boot.header));
    const firstBytes = await readFile(join(root, 'queue', 'checkpoint.json'));
    events.length = 0;
    await writer.rotate(4096, 8192);
    assert.equal(writer.current.generation, '1');
    assert.equal(writer.current.segments.length, 2);
    assert.equal(writer.current.segments[0]?.sealed, true);
    assert.equal(writer.current.activeSegment, '00000000000000000002');
    assert.deepEqual(await readFile(join(root, 'queue', 'checkpoint.prev')), firstBytes);
    const backup = events.indexOf('rename:checkpoint.prev.next->checkpoint.prev');
    const publish = events.indexOf('rename:checkpoint.next->checkpoint.json');
    assert.ok(backup >= 0 && publish > backup);
    assert.ok(events.slice(backup + 1, publish).includes('directory-sync:queue'));
    assert.equal(events.at(-1), 'directory-sync:queue');
    const reopened = new CheckpointWriter(io); assert.equal((await reopened.load())?.generation, '1');
    // An interrupted next backup can leave equal prior/current; this is valid.
    const currentBytes = await readFile(join(root, 'queue', 'checkpoint.json'));
    await writeFile(join(root, 'queue', 'checkpoint.prev'), currentBytes, { mode: 0o600 });
    assert.equal((await new CheckpointWriter(io).load())?.generation, '1');
    await assert.rejects(writer.rotate(4096, 1), (e: unknown) => e instanceof MemoryError && e.code === 'BACKPRESSURE');
    assert.equal(io.fenced, false, 'capacity refusal precedes disk mutation');
    await writeFile(join(root, 'queue', 'checkpoint.json'), 'corrupt', { mode: 0o600 });
    await assert.rejects(new CheckpointWriter(io).load(), MemoryError);
    assert.equal(await readFile(join(root, 'queue', 'checkpoint.json'), 'utf8'), 'corrupt');
  } finally { await io.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'checkpoint-publication-faults-preserve-current-or-complete-next', async () => {
  for (const point of ['write:checkpoint.prev.next', 'rename:checkpoint.prev.next->checkpoint.prev', 'write:checkpoint.next', 'rename:checkpoint.next->checkpoint.json', 'directory-sync:queue']) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-publish-fault-')));
    const owner = await acquireOwnership(options(root));
    let enabled = false;
    const io = new QueueIo(owner, root, { async after(op, name) { if (enabled && op + ':' + name === point) throw Error('injected'); } });
    let replacement: QueueIo | undefined;
    try {
      await io.start(); const boot = await io.bootstrap(); const writer = new CheckpointWriter(io);
      const first = initialCheckpoint(boot.queueId, boot.header); await writer.publish(first);
      enabled = true;
      await assert.rejects(writer.publish({ ...first, generation: '1' }), MemoryError);
      assert.equal(io.fenced, true); await io.close();
      replacement = new QueueIo(owner, root); await replacement.start();
      const recovered = await new CheckpointWriter(replacement).load();
      assert.ok(recovered?.generation === '0' || recovered?.generation === '1');
      assert.equal(recovered?.queueId, boot.queueId);
    } finally { await io.close(); await replacement?.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
  }
});
