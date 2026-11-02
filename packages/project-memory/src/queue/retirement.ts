import { MemoryError } from '../errors.js';
import type { MemoryLimits } from '../types.js';
import { decodeFrame, digest, encodeFrame, snapshotJson } from './codec.js';
import { advance } from './checkpoint.js';
import type { Checkpoint, CheckpointWriter, FrameRecord } from './checkpoint.js';
import { QueueIo, segmentName } from './io.js';
import { matchProof, readReceipt, ReceiptUnavailableError } from './receipts.js';
import { indexFrame } from './index-record.js';
import type { IndexedFrame } from './index-record.js';
import { QUEUE_LIMITS } from './types.js';
import type { ReceiptVerifier, RetirementDigests, RetirementReference, SegmentHeader } from './types.js';

export function retirementDigests(entry: IndexedFrame): RetirementDigests {
  return { identityDigest: entry.identityDigest, payloadHash: entry.payloadHash, scopeDigest: digest(snapshotJson(entry.scope, 16_384).text), scopeEpochDigest: digest(entry.scopeEpoch) };
}
function corrupt(): never { throw new MemoryError('STORE_UNAVAILABLE', 'Queue retirement data is inconsistent.'); }
function reference(frame: FrameRecord): RetirementReference {
  if (!frame.retirement || !frame.generation) corrupt();
  return { ...frame.retirement, operationId: frame.operationId, generation: frame.generation };
}
async function confirm(verifier: ReceiptVerifier, refs: readonly RetirementReference[]): Promise<void> {
  if (!verifier.confirmRetirement) throw new MemoryError('NOT_READY', 'Receipt retirement confirmation is required.');
  for (const ref of refs) {
    let result: boolean;
    try { result = await verifier.confirmRetirement(ref); } catch { throw new ReceiptUnavailableError(); }
    if (result === false) throw new MemoryError('NOT_READY', 'Authoritative retirement proof is not available.');
    if (result !== true) throw new ReceiptUnavailableError();
  }
}
/** Validates a surviving retiring file before deleting it; missing is legal only under durable intent. */
async function verifyRetiringFile(io: QueueIo, checkpoint: Checkpoint, limits: MemoryLimits): Promise<boolean> {
  const segment = checkpoint.segments[0]!;
  const name = 'segments/' + segmentName(segment.id);
  if (!await io.exists(name)) return false;
  let header = false, index = 0, end = 0;
  for await (const line of io.scan(name, limits.maxEventBytes + QUEUE_LIMITS.frameOverhead, limits.maxPendingBytes)) {
    if (!line.terminated) corrupt();
    const decoded = decodeFrame(line.bytes, limits.maxEventBytes).body;
    end = line.end;
    if (!header) {
      const expected: SegmentHeader = { formatVersion: 1, recordType: 'segment', queueId: checkpoint.queueId, segmentId: segment.id, firstSequence: segment.firstSequence };
      if (line.offset !== 0 || line.bytes.length > 512 || snapshotJson(decoded, 512).text !== snapshotJson(expected, 512).text) corrupt();
      header = true; continue;
    }
    const stored = segment.frames[index++];
    if (!stored || decoded.recordType !== 'event' || decoded.queueId !== checkpoint.queueId || stored.operationId !== decoded.operationId || stored.sequence !== decoded.sequence || stored.offset !== line.offset || stored.length !== line.bytes.length) corrupt();
    const entry = indexFrame(decoded, segment.id, stored);
    if (snapshotJson(retirementDigests(entry), 1024).text !== snapshotJson(stored.retirement, 1024).text) corrupt();
  }
  if (!header || index !== segment.frames.length || end !== segment.acceptedOffset) corrupt();
  return true;
}
function barrierBytes(queueId: string): Buffer { return Buffer.from(snapshotJson({ formatVersion: 1, queueId, requires: 'authoritative-receipts-v1' }, 512).text + '\n'); }
export async function verifyBarrier(io: QueueIo, checkpoint: Checkpoint, verifier?: ReceiptVerifier): Promise<boolean> {
  const exists = await io.exists('receipt-barrier.json');
  if (checkpoint.receiptBarrier && !exists) corrupt();
  if (!exists) return false;
  if (!(await io.read('receipt-barrier.json', 512)).equals(barrierBytes(checkpoint.queueId))) corrupt();
  if (!verifier?.confirmRetirement) throw new MemoryError('NOT_READY', 'Queue requires authoritative receipt retirement support.');
  return true;
}
/** Resume only an already-published intent, then discard its queue references. */
export async function finishRetirement(io: QueueIo, writer: CheckpointWriter, limits: MemoryLimits, verifier: ReceiptVerifier): Promise<Checkpoint> {
  const current = writer.current, segment = current.segments[0]!;
  if (!segment.retiring || !await verifyBarrier(io, current, verifier)) corrupt();
  await confirm(verifier, segment.frames.map(reference));
  if (await verifyRetiringFile(io, current, limits)) await io.unlink('segments/' + segmentName(segment.id));
  await io.syncDirectory('segments');
  const rest = current.segments.slice(1);
  if (rest.length) return writer.publish({ ...current, generation: advance(current.generation), segments: rest });
  // Retiring a full, terminal active segment must not require extra data quota.
  // Its durable intent temporarily has no writable active segment; create the
  // successor after unlink frees space, before returning to ready state.
  const id = advance(BigInt(segment.id).toString()).padStart(20, '0');
  const header: SegmentHeader = { formatVersion: 1, recordType: 'segment', queueId: current.queueId, segmentId: id, firstSequence: advance(current.lastSequence) };
  const bytes = encodeFrame(header, limits.maxEventBytes), name = 'segments/' + segmentName(id);
  if (await io.exists(name)) { if (!(await io.read(name, 512)).equals(bytes)) corrupt(); }
  else await io.write(name, bytes, 'create');
  await io.syncDirectory('segments');
  return writer.publish({ ...current, generation: advance(current.generation), activeSegment: id, segments: [{ id, firstSequence: header.firstSequence, acceptedOffset: bytes.length, sealed: false, retiring: false, frames: [] }] });
}
export async function retireFirst(io: QueueIo, writer: CheckpointWriter, limits: MemoryLimits, index: ReadonlyMap<string, IndexedFrame>, verifier: ReceiptVerifier): Promise<readonly string[]> {
  const current = writer.current, first = current.segments[0]!;
  if (!first.frames.length || first.frames.some(frame => !frame.terminal)) return [];
  if (!first.sealed && current.segments.length !== 1) corrupt();
  // Prove the final state can be published before making any destructive change.
  advance(advance(current.generation));
  if (current.segments.length === 1) { advance(current.lastSequence); advance(BigInt(first.id).toString()); }
  if (!verifier.confirmRetirement) throw new MemoryError('NOT_READY', 'Receipt retirement confirmation is required.');
  const frames: FrameRecord[] = [];
  for (const frame of first.frames) {
    const entry = index.get(frame.operationId); if (!entry || !frame.generation) corrupt();
    const lookup = await readReceipt(() => verifier.byOperation(frame.operationId, entry.scope));
    if (lookup.status !== 'found') throw new MemoryError('NOT_READY', 'A durable terminal receipt is required.');
    matchProof(lookup.proof, { ...entry, operationId: frame.operationId }, frame.generation);
    // Retry scheduling is no longer needed for a verified terminal retirement.
    const { retry: _retry, ...record } = frame;
    frames.push({ ...record, retirement: retirementDigests(entry) });
  }
  await confirm(verifier, frames.map(reference));
  if (!await io.exists('receipt-barrier.json')) {
    await io.write('checkpoint.next', barrierBytes(current.queueId), await io.exists('checkpoint.next') ? 'replace' : 'create');
    await io.rename('checkpoint.next', 'receipt-barrier.json'); await io.syncDirectory('queue');
  } else await verifyBarrier(io, current, verifier);
  const retiring = { ...first, sealed: true, retiring: true, frames };
  await writer.publish({ ...current, generation: advance(current.generation), receiptBarrier: true, segments: [retiring, ...current.segments.slice(1)] });
  await finishRetirement(io, writer, limits, verifier);
  return frames.map(frame => frame.operationId);
}
