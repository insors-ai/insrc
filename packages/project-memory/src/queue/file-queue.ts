import type { MemoryLimits, OperationReceipt, Scope } from '../types.js';
import type { DirectoryOwnership } from '../ownership.js';
import { MemoryError } from '../errors.js';
import { boundedString, decodeFrame, encodeFrame, validateQueueLimits, visibleScope, snapshotJson } from './codec.js';
import type { CommandSnapshot } from './codec.js';
import { advance, CheckpointWriter, reserveMetadata } from './checkpoint.js';
import type { FrameRecord, RetryRecord } from './checkpoint.js';
import { QueueIo, segmentName } from './io.js';
import type { IoHooks } from './io.js';
import { recoverQueue } from './recovery.js';
import { indexFrame } from './index-record.js';
import type { IndexedFrame } from './index-record.js';
import { QUEUE_LIMITS } from './types.js';
import type { EventBody, QueueFrame, QueueStats, SegmentHeader, ReceiptVerifier } from './types.js';

import { retireFirst } from './retirement.js';
import { matchProof, readReceipt, ReceiptUnavailableError } from './receipts.js';

class QueueWriteError extends MemoryError {
  constructor(readonly operationId: string) { super('STORE_UNAVAILABLE', 'Queue durability could not be verified; reopen before retrying.', true); }
}
/** Private persistence owner; policy/service composition is added by admission. */
export class FileQueue {
  readonly io: QueueIo;
  readonly writer: CheckpointWriter;
  readonly limits: MemoryLimits;
  readonly verifier: ReceiptVerifier | undefined;
  readonly index = new Map<string, IndexedFrame>();
  #tail: Promise<void> = Promise.resolve();
  #calls = 0;
  #readerActive = false;
  #readersIdle: Promise<void> = Promise.resolve();
  #readersDone: (() => void) | undefined;
  readonly #pins = new Set<string>();
  #reserved = 0;
  #ready = false;
  #stopped = false;
  #fenced = false;
  #closing: Promise<void> | undefined;
  constructor(owner: DirectoryOwnership, root: string, limits: MemoryLimits, hooks: IoHooks = {}, verifier?: ReceiptVerifier) {
    validateQueueLimits(limits); this.verifier = verifier;
    this.limits = Object.freeze({ ...limits });
    this.io = new QueueIo(owner, root, hooks); this.writer = new CheckpointWriter(this.io);
  }
  async start(): Promise<void> {
    if (this.#ready || this.#closing) throw new MemoryError('NOT_READY', 'Queue startup is not available.');
    try {
      await this.io.start(); const boot = await this.io.bootstrap();
      const recovered = await recoverQueue(this.io, this.writer, boot, this.limits, this.verifier);
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
        if (this.io.fenced || !(error instanceof MemoryError) || (error.code === 'STORE_UNAVAILABLE' && !(error instanceof ReceiptUnavailableError))) this.#fenced = true;
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
    if (this.verifier) {
      const lookup = await readReceipt(() => this.verifier!.byIdentity(snapshot.identity));
      if (lookup.status === 'found') {
        matchProof(lookup.proof, { operationId: snapshot.operationId, identityDigest: snapshot.identityDigest, payloadHash: snapshot.payloadHash, scope: snapshot.command.scope, scopeEpoch, eventId: snapshot.command.source.eventId });
        return lookup.proof.receipt;
      }
    }
    const existing = this.index.get(snapshot.operationId);
    if (existing) {
      if (existing.record.terminal) throw new ReceiptUnavailableError();
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
  async operationWithinLane(scope: Scope, operationId: string, scopeEpoch: string): Promise<OperationReceipt> {
    const entry = this.index.get(operationId);
    if (this.verifier) {
      const lookup = await readReceipt(() => this.verifier!.byOperation(operationId, scope));
      if (lookup.status === 'found') {
        const proof = lookup.proof;
        if (proof.operationId !== operationId || proof.scopeEpoch !== scopeEpoch || !visibleScope(proof.scope, scope)) throw new MemoryError('INVALID_REQUEST', 'Memory operation is unavailable in this scope.');
        if (entry) matchProof(proof, { ...entry, operationId });
        return proof.receipt;
      }
    }
    if (!entry || entry.scopeEpoch !== scopeEpoch || !visibleScope(entry.scope, scope)) throw new MemoryError('INVALID_REQUEST', 'Memory operation is unavailable in this scope.');
    if (entry.record.terminal) throw new ReceiptUnavailableError();
    return { operationId, eventId: entry.eventId, state: 'accepted' };
  }
  async #updateRecord(entry: IndexedFrame, record: FrameRecord): Promise<void> {
    const current = this.writer.current;
    await this.writer.publish({ ...current, generation: advance(current.generation), segments: current.segments.map(segment => segment.id !== entry.segmentId ? segment : { ...segment, frames: segment.frames.map(old => old.operationId === record.operationId ? record : old) }) });
    this.index.set(record.operationId, { ...entry, record });
  }
  markResolved(operationId: string, generation: string): Promise<void> {
    return this.enqueue(async () => {
      if (!this.verifier) throw new MemoryError('NOT_READY', 'Terminal acknowledgement requires authoritative receipts.');
      const entry = this.index.get(operationId);
      if (!entry) throw new MemoryError('INVALID_REQUEST', 'Memory operation is unavailable in this scope.');
      const lookup = await readReceipt(() => this.verifier!.byOperation(operationId, entry.scope));
      if (lookup.status !== 'found') throw new MemoryError('NOT_READY', 'A durable terminal receipt is required.');
      matchProof(lookup.proof, { ...entry, operationId }, generation);
      if (!entry.record.terminal || entry.record.generation !== generation) await this.#updateRecord(entry, { ...entry.record, terminal: true, generation });
    }, true);
  }
  recordRetry(operationId: string, retry: RetryRecord): Promise<void> {
    let snapshot: RetryRecord;
    try {
      snapshot = snapshotJson(retry, 2048).value as unknown as RetryRecord;
      if (Object.keys(snapshot).sort().join(',') !== 'attempts,errorCode,nextEligibleAt' || !Number.isSafeInteger(snapshot.attempts) || snapshot.attempts < 0 || !Number.isSafeInteger(snapshot.nextEligibleAt) || snapshot.nextEligibleAt < 0 || !boundedString(snapshot.errorCode, 128)) throw new MemoryError('INVALID_REQUEST', 'Invalid retry metadata.');
    } catch { return Promise.reject(new MemoryError('INVALID_REQUEST', 'Invalid retry metadata.')); }
    return this.enqueue(async () => {
      const entry = this.index.get(operationId);
      if (!entry || entry.record.terminal) throw new MemoryError('NOT_READY', 'Retry bookkeeping requires a retained pending operation.');
      await this.#updateRecord(entry, { ...entry.record, retry: snapshot });
    }, true);
  }
  recycleResolvedSegments(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.verifier?.confirmRetirement) throw new MemoryError('NOT_READY', 'Recycling requires authoritative receipt retirement support.');
      // Retire only a resolved prefix, preserving contiguous retained sequence.
      for (;;) {
        const first = this.writer.current.segments[0]!;
        if (this.isPinned(first.id) || !first.frames.length || first.frames.some(frame => !frame.terminal)) return;
        const removed = await retireFirst(this.io, this.writer, this.limits, this.index, this.verifier);
        if (!removed.length) return;
        for (const id of removed) this.index.delete(id);
      }
    }, true);
  }
  isPinned(segmentId: string): boolean { return this.#pins.has(segmentId); }
  replay(): AsyncIterable<QueueFrame> {
    const acquired = this.enqueue(async () => {
      if (this.#readerActive) throw new MemoryError('NOT_READY', 'A queue replay reader is already active.');
      const entries = [...this.index.values()].filter(entry => !entry.record.terminal).sort((a, b) => BigInt(a.record.sequence) < BigInt(b.record.sequence) ? -1 : 1);
      this.#readerActive = true;
      this.#readersIdle = new Promise<void>(resolve => { this.#readersDone = resolve; });
      for (const entry of entries) this.#pins.add(entry.segmentId);
      return entries;
    });
    // An unused iterable must not produce an unhandled rejection.
    void acquired.catch(() => undefined);
    let released = false;
    const release = async () => {
      const entries = await acquired.catch(() => undefined);
      if (released || !entries) return;
      released = true; this.#pins.clear(); this.#readerActive = false; this.#readersDone?.(); this.#readersDone = undefined;
    };
    const queue = this;
    const generator = (async function* () {
      try {
        for (const entry of await acquired) {
          let frame: QueueFrame;
          try {
            const decoded = decodeFrame(await queue.io.readRange('segments/' + segmentName(entry.segmentId), entry.record.offset, entry.record.length), queue.limits.maxEventBytes);
            const body = decoded.body;
            if (body.recordType !== 'event' || body.operationId !== entry.record.operationId || body.sequence !== entry.record.sequence || body.payloadHash !== entry.payloadHash || body.scopeEpoch !== entry.scopeEpoch || body.queueId !== queue.writer.current.queueId) throw new MemoryError('STORE_UNAVAILABLE', 'Replay frame integrity failed.');
            frame = Object.freeze({ ...body, checksum: decoded.checksum });
          } catch { queue.#fenced = true; throw new MemoryError('STORE_UNAVAILABLE', 'Replay frame integrity failed.'); }
          yield frame;
        }
      } finally { await release(); }
    })();
    const iterator: AsyncIterableIterator<QueueFrame> = {
      next: () => generator.next(),
      async return() { try { return await generator.return(undefined); } finally { await release(); } },
      async throw(error: unknown) { try { return await generator.throw(error); } finally { await release(); } },
      [Symbol.asyncIterator]() { return this; },
    };
    return iterator;
  }
  stats(): QueueStats {
    const retained = this.#ready ? this.writer.current.segments.reduce((sum, s) => sum + s.acceptedOffset, 0) : 0;
    const pending = [...this.index.values()].filter(entry => !entry.record.terminal);
    return { pendingBytes: retained + this.#reserved, pendingEvents: pending.length, oldestPendingMs: pending.length ? Math.max(0, Date.now() - Math.min(...pending.map(entry => entry.admittedAtMs))) : 0 };
  }
  stopAdmission(): void { this.#stopped = true; }
  pending(): number { return this.#calls + (this.#readerActive ? 1 : 0); }
  async drain(): Promise<void> { await this.#tail; if (this.#readerActive) await this.#readersIdle; }
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
