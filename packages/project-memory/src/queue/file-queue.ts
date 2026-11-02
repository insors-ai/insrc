import type { MemoryLimits, OperationReceipt } from '../types.js';
import type { DirectoryOwnership } from '../ownership.js';
import { MemoryError } from '../errors.js';
import { boundedString, encodeFrame, validateQueueLimits } from './codec.js';
import type { CommandSnapshot } from './codec.js';
import { advance, CheckpointWriter, reserveMetadata } from './checkpoint.js';
import type { FrameRecord } from './checkpoint.js';
import { QueueIo, segmentName } from './io.js';
import type { IoHooks } from './io.js';
import { indexFrame, recoverQueue } from './recovery.js';
import type { IndexedFrame } from './recovery.js';
import { QUEUE_LIMITS } from './types.js';
import type { EventBody, QueueStats, SegmentHeader } from './types.js';

class QueueWriteError extends MemoryError {
  constructor(readonly operationId: string) { super('STORE_UNAVAILABLE', 'Queue durability could not be verified; reopen before retrying.', true); }
}
/** Private persistence owner; policy/service composition is added by admission. */
export class FileQueue {
  readonly io: QueueIo;
  readonly writer: CheckpointWriter;
  readonly limits: MemoryLimits;
  readonly index = new Map<string, IndexedFrame>();
  #tail: Promise<void> = Promise.resolve();
  #calls = 0;
  #reserved = 0;
  #ready = false;
  #stopped = false;
  #fenced = false;
  #closing: Promise<void> | undefined;
  constructor(owner: DirectoryOwnership, root: string, limits: MemoryLimits, hooks: IoHooks = {}) {
    validateQueueLimits(limits);
    this.limits = Object.freeze({ ...limits });
    this.io = new QueueIo(owner, root, hooks); this.writer = new CheckpointWriter(this.io);
  }
  async start(): Promise<void> {
    if (this.#ready || this.#closing) throw new MemoryError('NOT_READY', 'Queue startup is not available.');
    try {
      await this.io.start(); const boot = await this.io.bootstrap();
      const recovered = await recoverQueue(this.io, this.writer, boot, this.limits);
      for (const [id, entry] of recovered.index) this.index.set(id, entry);
      this.#ready = true;
    } catch (error) { this.#fenced = true; throw error; }
  }
  /** Invoke synchronously to establish FIFO before any policy/I/O await. */
  enqueue<T>(work: () => Promise<T>, internal = false): Promise<T> {
    if (!this.#ready || this.#closing || this.#fenced || this.io.fenced) return Promise.reject(new MemoryError('NOT_READY', 'Queue is not accepting work.'));
    if (this.#stopped && !internal) return Promise.reject(new MemoryError('NOT_READY', 'Queue admission has stopped.'));
    if (this.#calls >= QUEUE_LIMITS.maxCalls) return Promise.reject(new MemoryError('BACKPRESSURE', 'Queue call capacity is exhausted.', true));
    this.#calls++;
    const result = this.#tail.then(async () => {
      if (this.#fenced || this.io.fenced) throw new MemoryError('STORE_UNAVAILABLE', 'Queue requires recovery.', true);
      try { return await work(); }
      catch (error) {
        if (this.io.fenced || !(error instanceof MemoryError) || error.code === 'STORE_UNAVAILABLE') this.#fenced = true;
        if (error instanceof MemoryError) throw error;
        throw new MemoryError('STORE_UNAVAILABLE', 'Queue work failed safely.', true);
      }
    }).finally(() => { this.#calls--; });
    this.#tail = result.then(() => undefined, () => undefined); return result;
  }
  /** Must execute inside enqueue. Caller has already bound/admitted this snapshot. */
  async persist(snapshot: CommandSnapshot, scopeEpoch: string): Promise<OperationReceipt> {
    if (snapshot.bytes > this.limits.maxEventBytes) throw new MemoryError('INVALID_REQUEST', 'Command exceeds the configured event limit.');
    if (!boundedString(scopeEpoch, 256)) throw new MemoryError('INVALID_REQUEST', 'Invalid project scope epoch.');
    const existing = this.index.get(snapshot.operationId);
    if (existing) {
      if (existing.payloadHash !== snapshot.payloadHash || existing.scopeEpoch !== scopeEpoch) throw new MemoryError('REVISION_CONFLICT', 'Event identity was already used with different content or scope.');
      return { operationId: snapshot.operationId, eventId: snapshot.command.source.eventId, state: 'accepted' };
    }
    const current = this.writer.current, active = current.segments.at(-1)!;
    const sequence = advance(current.lastSequence);
    const body: EventBody = { formatVersion: 1, recordType: 'event', queueId: current.queueId, sequence, operationId: snapshot.operationId, command: snapshot.command, payloadHash: snapshot.payloadHash, admittedAtMs: Date.now(), scopeEpoch };
    const bytes = encodeFrame(body, this.limits.maxEventBytes);
    const rotate = active.frames.length > 0 && active.acceptedOffset + bytes.length > this.limits.segmentBytes;
    const header: SegmentHeader = { formatVersion: 1, recordType: 'segment', queueId: current.queueId, segmentId: rotate ? advance(BigInt(active.id).toString()).padStart(20, '0') : active.id, firstSequence: sequence };
    const headerBytes = rotate ? encodeFrame(header, this.limits.maxEventBytes).length : 0;
    reserveMetadata(this.index.size + 1, current.segments.length + (rotate ? 1 : 0));
    if (rotate) advance(advance(current.generation)); else advance(current.generation);
    const retained = current.segments.reduce((sum, s) => sum + s.acceptedOffset, 0);
    if (retained + this.#reserved + headerBytes + bytes.length > this.limits.maxPendingBytes) throw new MemoryError('BACKPRESSURE', 'Queue retained-byte capacity is exhausted.', true);
    this.#reserved += headerBytes + bytes.length;
    let outstanding = headerBytes + bytes.length;
    try {
      if (rotate) { await this.writer.rotate(this.limits.maxEventBytes, this.limits.maxPendingBytes); this.#reserved -= headerBytes; outstanding -= headerBytes; }
      const before = this.writer.current, segment = before.segments.at(-1)!;
      const record: FrameRecord = { operationId: snapshot.operationId, sequence, offset: segment.acceptedOffset, length: bytes.length, terminal: false };
      await this.io.write('segments/' + segmentName(segment.id), bytes, 'append', segment.acceptedOffset);
      const nextSegment = { ...segment, acceptedOffset: segment.acceptedOffset + bytes.length, frames: [...segment.frames, record] };
      await this.writer.publish({ ...before, generation: advance(before.generation), lastSequence: sequence, segments: [...before.segments.slice(0, -1), nextSegment] });
      this.index.set(snapshot.operationId, indexFrame(body, segment.id, record));
      return { operationId: snapshot.operationId, eventId: snapshot.command.source.eventId, state: 'accepted' };
    } catch { this.#fenced = true; throw new QueueWriteError(snapshot.operationId); }
    finally { this.#reserved -= outstanding; }
  }
  stats(): QueueStats {
    const retained = this.#ready ? this.writer.current.segments.reduce((sum, s) => sum + s.acceptedOffset, 0) : 0;
    const pending = [...this.index.values()].filter(entry => !entry.record.terminal);
    return { pendingBytes: retained + this.#reserved, pendingEvents: pending.length, oldestPendingMs: pending.length ? Math.max(0, Date.now() - Math.min(...pending.map(entry => entry.admittedAtMs))) : 0 };
  }
  stopAdmission(): void { this.#stopped = true; }
  pending(): number { return this.#calls; }
  async drain(): Promise<void> { await this.#tail; }
  /** Seal this writer's admission, retaining the active recovery segment identity. */
  async seal(): Promise<void> {
    this.stopAdmission(); await this.drain();
    if (!this.#ready || this.#fenced || this.io.fenced) return;
    const active = this.writer.current.segments.at(-1)!;
    await this.io.write('segments/' + segmentName(active.id), Buffer.alloc(0), 'append', active.acceptedOffset);
  }
  close(): Promise<void> {
    if (!this.#closing) {
      this.stopAdmission();
      // Store the close promise immediately; no internal call may enter afterward.
      this.#closing = (async () => { await this.drain(); try { await this.seal(); } finally { await this.io.close(); } })();
    }
    return this.#closing;
  }
}
