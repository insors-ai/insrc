import { createHash } from 'node:crypto';
import type { MemoryLimits } from '../types.js';
import { MemoryError } from '../errors.js';
import { decodeFrame, encodeFrame, snapshotJson } from './codec.js';
import { advance, CheckpointWriter, initialCheckpoint, reserveMetadata } from './checkpoint.js';
import type { Checkpoint, FrameRecord, SegmentRecord } from './checkpoint.js';
import { QueueIo, segmentName } from './io.js';
import { QUEUE_LIMITS } from './types.js';
import type { SegmentHeader, ReceiptVerifier } from './types.js';

export interface RecoveredQueue { readonly checkpoint: Checkpoint; readonly index: ReadonlyMap<string, IndexedFrame>; }
interface TailReport {
  readonly formatVersion: 1;
  readonly queueId: string;
  readonly segmentId: string;
  readonly originalSize: number;
  readonly truncateOffset: number;
  readonly suffixHash: string;
  readonly state: 'intent' | 'complete';
}
import { indexFrame } from './index-record.js';
import type { IndexedFrame } from './index-record.js';
import { finishRetirement, verifyBarrier } from './retirement.js';
import { ReceiptUnavailableError } from './receipts.js';

function corrupt(): never { throw new MemoryError('STORE_UNAVAILABLE', 'Queue recovery found inconsistent durable data.'); }
function hash(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
async function marker(io: QueueIo, name: 'recovery.json' | 'fault.json', value: unknown): Promise<void> {
  // Reuse the unaccepted checkpoint candidate for atomic small-report publication.
  await io.write('checkpoint.next', Buffer.from(snapshotJson(value, 2047).text + '\n'), await io.exists('checkpoint.next') ? 'replace' : 'create');
  await io.rename('checkpoint.next', name); await io.syncDirectory('queue');
}
async function tailReport(io: QueueIo): Promise<TailReport | undefined> {
  if (!await io.exists('recovery.json')) return undefined;
  try {
    const bytes = await io.read('recovery.json', 2048);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const value = JSON.parse(text) as TailReport;
    if (snapshotJson(value, 2047).text + '\n' !== text || Object.keys(value).sort().join(',') !== 'formatVersion,originalSize,queueId,segmentId,state,suffixHash,truncateOffset' || value.formatVersion !== 1 || !Number.isSafeInteger(value.originalSize) || !Number.isSafeInteger(value.truncateOffset) || value.truncateOffset < 1 || value.originalSize <= value.truncateOffset || !/^[a-f0-9]{64}$/.test(value.suffixHash) || !['intent', 'complete'].includes(value.state)) corrupt();
    segmentName(value.segmentId); return value;
  } catch { corrupt(); }
}

/** Validate all accepted bytes before readiness. No prior-frontier fallback. */
export async function recoverQueue(io: QueueIo, writer: CheckpointWriter, boot: { queueId: string; header: SegmentHeader }, limits: MemoryLimits, verifier?: ReceiptVerifier): Promise<RecoveredQueue> {
  try {
    if (await io.exists('fault.json')) corrupt();
    let checkpoint = await writer.load();
    if (!checkpoint) checkpoint = await writer.publish(initialCheckpoint(boot.queueId, boot.header));
    if (checkpoint.queueId !== boot.queueId) corrupt();
    const barrier = await verifyBarrier(io, checkpoint, verifier);
    if (checkpoint.segments.some(s => s.retiring)) {
      if (!verifier) throw new MemoryError('NOT_READY', 'Queue retirement requires authoritative receipt verification.');
      checkpoint = await finishRetirement(io, writer, limits, verifier);
    }
    const total = checkpoint.segments.reduce((sum, s) => sum + s.acceptedOffset, 0);
    if (total > limits.maxPendingBytes) throw new MemoryError('BACKPRESSURE', 'Configured queue capacity is below retained data.', true);
    const report = await tailReport(io);
    if (report && report.queueId !== checkpoint.queueId) corrupt();
    if (report?.state === 'intent' && report.segmentId !== checkpoint.activeSegment) corrupt();
    const referenced = new Set(checkpoint.segments.map(s => segmentName(s.id)));
    const files = await io.list('segments');
    if ([...referenced].some(name => !files.includes(name))) corrupt();
    const orphans = files.filter(name => !referenced.has(name));
    let orphan: string | undefined;
    if (orphans.length) {
      if (orphans.length !== 1) corrupt();
      const id = advance(BigInt(checkpoint.activeSegment).toString()).padStart(20, '0');
      if (orphans[0] !== segmentName(id)) corrupt();
      const expected: SegmentHeader = { formatVersion: 1, recordType: 'segment', queueId: checkpoint.queueId, segmentId: id, firstSequence: advance(checkpoint.lastSequence) };
      const candidate = await io.read('segments/' + orphans[0], QUEUE_LIMITS.headerBytes);
      const expectedBytes = encodeFrame(expected, limits.maxEventBytes);
      // Rotation can die during header creation, before any event is possible.
      if (candidate.length > expectedBytes.length || !candidate.equals(expectedBytes.subarray(0, candidate.length))) corrupt();
      orphan = orphans[0];
    }
    const index = new Map<string, IndexedFrame>();
    const segments: SegmentRecord[] = [];
    let expectedSequence = BigInt(checkpoint.segments[0]!.firstSequence);
    let changed = false, completedIntent = false;
    let partial: { segment: SegmentRecord; offset: number; end: number; bytes: Buffer } | undefined;
    for (const segment of checkpoint.segments) {
      let headerSeen = false, frontierSeen = false, frameIndex = 0, end = 0;
      const frames = [...segment.frames];
      for await (const line of io.scan('segments/' + segmentName(segment.id), limits.maxEventBytes + QUEUE_LIMITS.frameOverhead, limits.maxPendingBytes)) {
        end = line.end;
        if (!headerSeen) {
          if (!line.terminated || line.offset !== 0 || line.bytes.length > QUEUE_LIMITS.headerBytes) corrupt();
          const header = decodeFrame(line.bytes, limits.maxEventBytes).body;
          const expected: SegmentHeader = { formatVersion: 1, recordType: 'segment', queueId: checkpoint.queueId, segmentId: segment.id, firstSequence: segment.firstSequence };
          if (snapshotJson(header, 512).text !== snapshotJson(expected, 512).text) corrupt();
          if (segment.frames.length ? segment.frames[0]!.offset !== line.end : segment.acceptedOffset !== line.end) corrupt();
          headerSeen = true; frontierSeen = line.end === segment.acceptedOffset; continue;
        }
        if (!line.terminated) {
          if (segment.sealed || line.offset < segment.acceptedOffset || !frontierSeen) corrupt();
          partial = { segment, offset: line.offset, end: line.end, bytes: line.bytes }; continue;
        }
        if (segment.sealed && line.end > segment.acceptedOffset) corrupt();
        const body = decodeFrame(line.bytes, limits.maxEventBytes).body;
        if (body.recordType !== 'event' || body.queueId !== checkpoint.queueId || BigInt(body.sequence) !== expectedSequence || index.has(body.operationId)) corrupt();
        const record: FrameRecord = { operationId: body.operationId, sequence: body.sequence, offset: line.offset, length: line.bytes.length, terminal: false };
        let stored: FrameRecord;
        if (line.offset < segment.acceptedOffset) {
          const accepted = segment.frames[frameIndex];
          if (!accepted || accepted.operationId !== record.operationId || accepted.sequence !== record.sequence || accepted.offset !== record.offset || accepted.length !== record.length || line.end > segment.acceptedOffset) corrupt();
          stored = accepted; frameIndex++; frontierSeen = line.end === segment.acceptedOffset;
        } else {
          if (!frontierSeen || segment.sealed || orphan) corrupt();
          stored = record; frames.push(record); changed = true;
        }
        index.set(body.operationId, indexFrame(body, segment.id, stored)); expectedSequence++;
      }
      if (!headerSeen || !frontierSeen || frameIndex !== segment.frames.length || (segment.sealed && end !== segment.acceptedOffset)) corrupt();
      if (report?.state === 'intent' && report.segmentId === segment.id && !partial) {
        if (end !== report.truncateOffset || report.truncateOffset < segment.acceptedOffset) corrupt();
        completedIntent = true;
      }
      segments.push({ ...segment, frames, acceptedOffset: partial?.segment.id === segment.id ? partial.offset : end });
    }
    reserveMetadata(index.size, segments.length);
    if (segments.reduce((sum, s) => sum + s.acceptedOffset, 0) > limits.maxPendingBytes) corrupt();
    if (partial) {
      const next: TailReport = { formatVersion: 1, queueId: checkpoint.queueId, segmentId: partial.segment.id, originalSize: partial.end, truncateOffset: partial.offset, suffixHash: hash(partial.bytes), state: 'intent' };
      if (report?.state === 'intent' && snapshotJson(report, 2048).text !== snapshotJson(next, 2048).text) corrupt();
      await marker(io, 'recovery.json', next);
      await io.truncate('segments/' + segmentName(next.segmentId), next.truncateOffset);
      await marker(io, 'recovery.json', { ...next, state: 'complete' });
    } else if (completedIntent && report) await marker(io, 'recovery.json', { ...report, state: 'complete' });
    if (orphan) { await io.unlink('segments/' + orphan); await io.syncDirectory('segments'); }
    if (changed || (barrier && !checkpoint.receiptBarrier)) {
      const active = segments.at(-1)!;
      // Sync possibly unacknowledged complete data before promoting its frontier.
      await io.write('segments/' + segmentName(active.id), Buffer.alloc(0), 'append', active.acceptedOffset);
      checkpoint = await writer.publish({ ...checkpoint, generation: advance(checkpoint.generation), lastSequence: (expectedSequence - 1n).toString(), receiptBarrier: barrier, segments });
    }
    return { checkpoint, index };
  } catch (error) {
    if (error instanceof ReceiptUnavailableError) throw error;
    if (error instanceof MemoryError && (error.code === 'NOT_READY' || error.code === 'BACKPRESSURE')) throw error;
    if (!io.fenced) { try { await marker(io, 'fault.json', { formatVersion: 1, queueId: boot.queueId, code: 'QUEUE_CORRUPTION' }); } catch { /* Preserve original bytes even if diagnostics cannot be persisted. */ } }
    throw new MemoryError('STORE_UNAVAILABLE', 'Queue recovery failed; durable bytes were preserved.');
  }
}
