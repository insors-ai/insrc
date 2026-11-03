import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { MemoryCommand } from '../types.js';
import type { ReceiptVerifier, TerminalProof, RetirementReference, DurableQueue } from '../queue/types.js';
import type { IoHooks } from '../queue/io.js';
import { acquireOwnership } from '../ownership.js';
import { FileQueue } from '../queue/file-queue.js';
import { QueueAdmission } from '../queue/admission.js';
import { digest, encodeFrame, snapshotCommand, snapshotJson } from '../queue/codec.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';
const limits = { maxEventBytes: 512, maxPendingBytes: 65536, segmentBytes: 512, modelTimeoutMs: 1 };
const command = (id: string): MemoryCommand => ({ version: 1, scope: { projectId: 'p', sessionId: 's', branch: 'main' }, source: { producerId: 'test', eventId: id, sessionId: 'source', turnId: 't', sourceVersion: 'v1' }, kind: 'capture', payload: { text: 'memory' } });
const policy = { async bind(projectId: string) { return { projectId, root: '/project', scopeEpoch: 'epoch' }; }, async admit(_binding: unknown, value: unknown) { return value as never; } };
async function fixture(hooks: IoHooks = {}, maxPendingBytes = limits.maxPendingBytes) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-retire-'))), owner = await acquireOwnership(options(root));
  const file = join(root, 'test-authoritative-receipts.json'); await writeFile(file, '[]', { mode: 0o600 });
  const rows = async () => JSON.parse(await readFile(file, 'utf8')) as TerminalProof[];
  const verifier: ReceiptVerifier = {
    async byIdentity(identity) { const proof = (await rows()).find(r => r.identityDigest === digest(snapshotJson(identity, 4096).text)); return proof ? { status: 'found', proof } : { status: 'absent' }; },
    async byOperation(id) { const proof = (await rows()).find(r => r.operationId === id); return proof ? { status: 'found', proof } : { status: 'absent' }; },
    async confirmRetirement(ref: RetirementReference) {
      const proof = (await rows()).find(r => r.operationId === ref.operationId);
      return !!proof && proof.queueTerminal && proof.generation === ref.generation && proof.identityDigest === ref.identityDigest && proof.payloadHash === ref.payloadHash && digest(snapshotJson(proof.scope, 16384).text) === ref.scopeDigest && digest(proof.scopeEpoch) === ref.scopeEpochDigest;
    },
  };
  const queue = new FileQueue(owner, root, { ...limits, maxPendingBytes }, hooks, verifier); await queue.start();
  const admission: QueueAdmission & DurableQueue = new QueueAdmission(queue, policy);
  async function terminal(id: string) {
    const c = command(id), s = snapshotCommand(c, 512), generation = 'g-' + id;
    const proof: TerminalProof = { operationId: s.operationId, identityDigest: s.identityDigest, payloadHash: s.payloadHash, scope: c.scope, scopeEpoch: 'epoch', generation, receipt: { operationId: s.operationId, eventId: id, generation, state: 'committed' }, queueTerminal: true };
    await writeFile(file, JSON.stringify([...(await rows()), proof]), { mode: 0o600 });
    await queue.markResolved(s.operationId, generation); return proof;
  }
  return { root, owner, queue, admission, verifier, terminal, async close() { await queue.close(); await owner.close(); await rm(root, { recursive: true, force: true }); } };
}

nativeTest(import.meta.url, 'verified-terminal-ack-retirement-and-reader-pins', async () => {
  const f = await fixture(); let reopened: FileQueue | undefined;
  try {
    const a = await f.admission.append(command('one')); await f.admission.append(command('two'));
    const reader = f.admission.replay()[Symbol.asyncIterator](); await reader.next();
    await f.terminal('one'); await f.terminal('two');
    await f.admission.recycleResolvedSegments(); assert.equal(f.queue.writer.current.segments.length, 2, 'pinned segments remain');
    await reader.return?.(); await f.admission.recycleResolvedSegments();
    assert.equal(f.queue.index.size, 0); assert.equal(f.queue.writer.current.segments.length, 1);
    assert.equal(f.queue.writer.current.segments[0]?.frames.length, 0);
    assert.equal(f.queue.writer.current.lastSequence, '2');
    assert.equal((await f.admission.append(command('one'))).state, 'committed');
    assert.equal((await f.admission.operation({ operationId: a.operationId, scope: command('one').scope })).state, 'committed');
    await assert.rejects(f.admission.operation({ operationId: a.operationId, scope: { projectId: 'p' } }), (e: unknown) => e instanceof MemoryError && e.code === 'INVALID_REQUEST');
    await f.queue.close(); reopened = new FileQueue(f.owner, f.root, limits, {}, f.verifier); await reopened.start();
    assert.equal(reopened.index.size, 0); assert.equal(reopened.writer.current.lastSequence, '2');
  } finally { await reopened?.close(); await f.close(); }
});

nativeTest(import.meta.url, 'retained-identity-rejects-conflicting-authoritative-receipt', async () => {
  for (const terminal of [false, true]) {
    for (const change of ['payload', 'scope'] as const) {
      const f = await fixture();
      try {
        const original = command('one'), accepted = await f.admission.append(original);
        if (terminal) await f.terminal('one');
        const changed: MemoryCommand = change === 'payload'
          ? { ...original, payload: { text: 'different memory' } }
          : { ...original, scope: { ...original.scope, branch: 'other' } };
        const snapshot = snapshotCommand(changed, limits.maxEventBytes), generation = 'conflicting';
        const proof: TerminalProof = {
          operationId: snapshot.operationId, identityDigest: snapshot.identityDigest,
          payloadHash: snapshot.payloadHash, scope: changed.scope, scopeEpoch: 'epoch', generation,
          receipt: { operationId: snapshot.operationId, eventId: 'one', state: 'committed', generation }, queueTerminal: true,
        };
        await writeFile(join(f.root, 'test-authoritative-receipts.json'), JSON.stringify([proof]), { mode: 0o600 });
        const before = f.queue.writer.current;
        await assert.rejects(f.admission.append(changed), (e: unknown) => e instanceof MemoryError && e.code === 'REVISION_CONFLICT', `${change}, terminal=${terminal}`);
        assert.equal(f.queue.writer.current, before, 'a conflicting receipt must not publish a checkpoint');
        assert.equal(f.queue.index.get(accepted.operationId)?.payloadHash, snapshotCommand(original, limits.maxEventBytes).payloadHash);
        assert.equal(f.queue.isAvailable(), true, 'a receipt conflict must not fence valid pending work');
      } finally { await f.close(); }
    }
  }
});

nativeTest(import.meta.url, 'recycled-identity-requires-authoritative-receipt-capability', async () => {
  const f = await fixture(); let downgrade: FileQueue | undefined;
  try {
    await f.admission.append(command('one')); await f.terminal('one'); await f.admission.recycleResolvedSegments(); await f.queue.close();
    downgrade = new FileQueue(f.owner, f.root, limits);
    await assert.rejects(downgrade.start(), (e: unknown) => e instanceof MemoryError && e.code === 'NOT_READY');
    await downgrade.close(); await f.owner.assertOwned();
    const marker = await readFile(join(f.root, 'queue', 'receipt-barrier.json'), 'utf8'); assert.match(marker, /authoritative-receipts-v1/);
  } finally { await downgrade?.close(); await f.close(); }
});

nativeTest(import.meta.url, 'mixed-pending-prefix-keeps-later-terminal-segments', async () => {
  const f = await fixture();
  try {
    for (const id of ['one', 'two', 'three']) await f.admission.append(command(id));
    await f.terminal('two'); await f.admission.recycleResolvedSegments(); assert.equal(f.queue.writer.current.segments.length, 3);
    await f.terminal('one'); await f.admission.recycleResolvedSegments(); assert.equal(f.queue.writer.current.segments.length, 1);
    const sequences: string[] = []; for await (const frame of f.admission.replay()) sequences.push(frame.sequence);
    assert.deepEqual(sequences, ['3']);
  } finally { await f.close(); }
});

nativeTest(import.meta.url, 'retirement-resumes-after-intent-unlink-and-successor-creation', async () => {
  for (const point of ['barrier', 'intent', 'before-unlink', 'after-unlink', 'deletion-sync', 'successor', 'final']) {
    let enabled = false, publications = 0, fired = false;
    const hooks: IoHooks = {
      async before(op) { if (enabled && point === 'before-unlink' && op === 'unlink') { fired = true; throw Error('injected'); } },
      async after(op, name) {
        if (!enabled) return;
        if (op === 'rename' && name === 'checkpoint.next->checkpoint.json') publications++;
        if ((point === 'barrier' && op === 'rename' && name === 'checkpoint.next->receipt-barrier.json')
          || (point === 'intent' && publications === 1 && op === 'rename')
          || (point === 'after-unlink' && op === 'unlink')
          || (point === 'deletion-sync' && op === 'directory-sync' && name === 'segments')
          || (point === 'successor' && op === 'write' && name === 'segments/00000000000000000002.jsonl')
          || (point === 'final' && publications === 2 && op === 'rename')) { fired = true; throw Error('injected'); }
      },
    };
    const f = await fixture(hooks); let reopened: FileQueue | undefined;
    try {
      const receipt = await f.admission.append(command('one')); await f.terminal('one'); enabled = true;
      await assert.rejects(f.admission.recycleResolvedSegments(), MemoryError, point); assert.equal(fired, true, point);
      await f.queue.close();
      reopened = new FileQueue(f.owner, f.root, limits, {}, f.verifier); await reopened.start();
      const admission = new QueueAdmission(reopened, policy); await admission.recycleResolvedSegments();
      assert.equal(reopened.index.size, 0, point);
      assert.equal((await admission.operation({ operationId: receipt.operationId, scope: command('one').scope })).state, 'committed', point);
    } finally { await reopened?.close(); await f.close(); }
  }
});

nativeTest(import.meta.url, 'full-terminal-active-segment-recycles-without-extra-headroom', async () => {
  const c = command('one'), snapshot = snapshotCommand(c, 512), queueId = '12345678-1234-1234-1234-123456789abc';
  const header = encodeFrame({ formatVersion: 1, recordType: 'segment', queueId, segmentId: '00000000000000000001', firstSequence: '1' }, 512);
  const body = encodeFrame({ formatVersion: 1, recordType: 'event', queueId, sequence: '1', operationId: snapshot.operationId, command: snapshot.command, payloadHash: snapshot.payloadHash, admittedAtMs: Date.now(), scopeEpoch: 'epoch' }, 512);
  const capacity = header.length + body.length;
  const f = await fixture({}, capacity);
  try {
    await f.admission.append(c);
    assert.equal(f.queue.stats().pendingBytes, capacity);
    await f.terminal('one'); await f.admission.recycleResolvedSegments();
    assert.equal(f.queue.index.size, 0);
    assert.ok(f.queue.stats().pendingBytes < capacity);
    assert.equal(f.queue.writer.current.segments[0]?.sealed, false);
  } finally { await f.close(); }
});
