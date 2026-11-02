import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { MemoryCommand } from '../types.js';
import type { ReceiptLookup, ReceiptVerifier, TerminalProof } from '../queue/types.js';
import { acquireOwnership } from '../ownership.js';
import { FileQueue } from '../queue/file-queue.js';
import { QueueAdmission } from '../queue/admission.js';
import { digest, snapshotCommand, snapshotJson } from '../queue/codec.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';
const limits = { maxEventBytes: 4096, maxPendingBytes: 65536, segmentBytes: 4096, modelTimeoutMs: 1 };
const command: MemoryCommand = { version: 1, scope: { projectId: 'p', sessionId: 's' }, source: { producerId: 'test', eventId: 'event', sessionId: 'source', turnId: 't', sourceVersion: 'v1' }, kind: 'capture', payload: { text: 'memory' } };
const snap = snapshotCommand(command, 4096);
function proof(): TerminalProof { return { operationId: snap.operationId, identityDigest: snap.identityDigest, payloadHash: snap.payloadHash, scope: command.scope, scopeEpoch: 'epoch', generation: 'g1', receipt: { operationId: snap.operationId, eventId: 'event', state: 'committed', generation: 'g1' }, queueTerminal: true }; }
const policy = { async bind(projectId: string) { return { projectId, root: '/project', scopeEpoch: 'epoch' }; }, async admit(_binding: unknown, value: unknown) { return value as MemoryCommand as never; } };

nativeTest(import.meta.url, 'sc3-receipt-verifier-proof-and-causal-order-contract', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-receipts-'))), owner = await acquireOwnership(options(root));
  const durable = join(root, 'fake-authoritative-receipts.json');
  await writeFile(durable, '[]', { mode: 0o600 });
  let lookups = 0, transient = false;
  const verifier: ReceiptVerifier = {
    async byIdentity(identity) { lookups++; if (transient) return { status: 'unavailable' }; const rows = JSON.parse(await readFile(durable, 'utf8')) as TerminalProof[]; const hit = rows.find(row => row.identityDigest === digest(snapshotJson(identity, 4096).text)); return hit ? { status: 'found', proof: hit } : { status: 'absent' }; },
    async byOperation(operationId, requestedScope) { assert.equal(requestedScope.projectId, 'p'); const rows = JSON.parse(await readFile(durable, 'utf8')) as TerminalProof[]; const hit = rows.find(row => row.operationId === operationId); return hit ? { status: 'found', proof: hit } : { status: 'absent' }; },
  };
  const queue = new FileQueue(owner, root, limits, {}, verifier), admission = new QueueAdmission(queue, policy);
  let reopened: FileQueue | undefined;
  try {
    await queue.start(); const receipt = await admission.append(command); assert.equal(receipt.state, 'accepted'); assert.equal(lookups, 1);
    await queue.recordRetry(receipt.operationId, { attempts: 1, nextEligibleAt: 100, errorCode: 'TEMPORARY' });
    assert.equal(queue.stats().pendingEvents, 1);
    await assert.rejects(queue.markResolved(receipt.operationId, 'g1'), (e: unknown) => e instanceof MemoryError && e.code === 'NOT_READY');
    await writeFile(durable, JSON.stringify([proof()]), { mode: 0o600 });
    assert.equal((await admission.append(command)).state, 'committed'); assert.equal(lookups, 2, 'authoritative lookup precedes retained retry handling');
    assert.equal((await admission.operation({ operationId: receipt.operationId, scope: command.scope })).state, 'committed');
    assert.equal(queue.stats().pendingEvents, 1, 'store receipt does not silently ACK queue bookkeeping');
    await assert.rejects(queue.markResolved(receipt.operationId, 'wrong'), (e: unknown) => e instanceof MemoryError && e.code === 'REVISION_CONFLICT');
    await queue.markResolved(receipt.operationId, 'g1'); assert.equal(queue.stats().pendingEvents, 0);
    await queue.close();
    reopened = new FileQueue(owner, root, limits, {}, verifier); await reopened.start();
    assert.equal(reopened.index.get(receipt.operationId)?.record.retry?.attempts, 1);
    assert.equal(reopened.index.get(receipt.operationId)?.record.terminal, true);
    const again = new QueueAdmission(reopened, policy);
    transient = true; await assert.rejects(again.append(command), (e: unknown) => e instanceof MemoryError && e.code === 'STORE_UNAVAILABLE');
    transient = false; assert.equal((await again.append(command)).state, 'committed', 'clean verifier outage does not fence queue I/O');
  } finally { await queue.close(); await reopened?.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'invalid-and-nonterminal-proofs-never-resolve-or-delete', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-proof-check-'))), owner = await acquireOwnership(options(root));
  let result: ReceiptLookup = { status: 'absent' };
  const verifier: ReceiptVerifier = { async byIdentity() { return result; }, async byOperation() { return result; } };
  const queue = new FileQueue(owner, root, limits, {}, verifier), admission = new QueueAdmission(queue, policy);
  try {
    await queue.start(); await admission.append(command);
    for (const mutation of [
      { ...proof(), payloadHash: '0'.repeat(64) }, { ...proof(), identityDigest: '0'.repeat(64) }, { ...proof(), scopeEpoch: 'other' },
      { ...proof(), scope: { projectId: 'p' } }, { ...proof(), queueTerminal: false },
      { ...proof(), receipt: { ...proof().receipt, state: 'processing' } }, { ...proof(), scope: undefined },
    ]) {
      // Deliberately malformed external boundary value; production types remain exact.
      result = { status: 'found', proof: mutation } as unknown as ReceiptLookup;
      await assert.rejects(queue.markResolved(snap.operationId, 'g1'), MemoryError);
      assert.equal(queue.index.get(snap.operationId)?.record.terminal, false);
      assert.equal(queue.writer.current.segments.length, 1);
    }
    result = { status: 'found', proof: { ...proof(), receipt: { ...proof().receipt, state: 'cleanup-pending' } } };
    await queue.markResolved(snap.operationId, 'g1');
    assert.equal((await admission.operation({ scope: command.scope, operationId: snap.operationId })).state, 'cleanup-pending');
    assert.equal(queue.stats().pendingEvents, 0, 'logical terminal proof does not claim physical cleanup complete');
  } finally { await queue.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'queue-only-mode-cannot-ack-terminal-state', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-no-proof-'))), owner = await acquireOwnership(options(root));
  const queue = new FileQueue(owner, root, limits), admission = new QueueAdmission(queue, policy);
  try {
    await queue.start(); await admission.append(command);
    await assert.rejects(queue.markResolved(snap.operationId, 'g1'), (e: unknown) => e instanceof MemoryError && e.code === 'NOT_READY');
    assert.equal(queue.stats().pendingEvents, 1);
  } finally { await queue.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});
