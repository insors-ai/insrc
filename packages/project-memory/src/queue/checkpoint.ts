import { MemoryError } from '../errors.js';
import { boundedString, decimal, encodeFrame, snapshotJson } from './codec.js';
import { INITIAL_SEGMENT, QueueIo, segmentName } from './io.js';
import { QUEUE_LIMITS } from './types.js';
import type { RetirementDigests, SegmentHeader } from './types.js';

export interface RetryRecord { readonly attempts: number; readonly nextEligibleAt: number; readonly errorCode: string; }
export interface FrameRecord {
  readonly operationId: string;
  readonly sequence: string;
  readonly offset: number;
  readonly length: number;
  readonly terminal: boolean;
  readonly generation?: string | undefined;
  readonly retry?: RetryRecord | undefined;
  readonly retirement?: RetirementDigests | undefined;
}
export interface SegmentRecord {
  readonly id: string;
  readonly firstSequence: string;
  readonly acceptedOffset: number;
  readonly sealed: boolean;
  readonly retiring: boolean;
  readonly frames: readonly FrameRecord[];
}
export interface Checkpoint {
  readonly formatVersion: 1;
  readonly queueId: string;
  readonly generation: string;
  readonly activeSegment: string;
  readonly lastSequence: string;
  readonly receiptBarrier: boolean;
  readonly segments: readonly SegmentRecord[];
}
function corrupt(): never { throw new MemoryError('STORE_UNAVAILABLE', 'Queue checkpoint is invalid or inconsistent.'); }
export function advance(value: string): string {
  if (!decimal(value) || value === '18446744073709551615') throw new MemoryError('STORE_UNAVAILABLE', 'Queue identifier range is exhausted.');
  return (BigInt(value) + 1n).toString();
}
export function reserveMetadata(frames: number, segments: number): void {
  if (!Number.isSafeInteger(frames) || !Number.isSafeInteger(segments) || frames < 0 || segments < 1 || frames > QUEUE_LIMITS.maxFrames || segments > QUEUE_LIMITS.maxSegments || QUEUE_LIMITS.checkpointFixed + frames * QUEUE_LIMITS.checkpointPerFrame + segments * QUEUE_LIMITS.checkpointPerSegment > QUEUE_LIMITS.checkpointBytes) {
    throw new MemoryError('BACKPRESSURE', 'Queue checkpoint capacity is exhausted.', true);
  }
}
function object(value: unknown): asserts value is Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) corrupt(); }
function fields(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) corrupt();
}
function integer(value: unknown, min = 0): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min; }
/** Structural validation only; recovery separately proves referenced on-disk bytes. */
export function validateCheckpoint(value: unknown): asserts value is Checkpoint {
  object(value); fields(value, ['formatVersion', 'queueId', 'generation', 'activeSegment', 'lastSequence', 'receiptBarrier', 'segments']);
  if (value.formatVersion !== 1 || typeof value.queueId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.queueId) || !decimal(value.generation) || !decimal(value.lastSequence) || typeof value.receiptBarrier !== 'boolean' || !Array.isArray(value.segments) || !value.segments.length || value.segments.length > QUEUE_LIMITS.maxSegments) corrupt();
  const ids = new Set<string>(), operations = new Set<string>();
  let frames = 0, previousId = '', previousSequence: bigint | undefined, active = 0, retiring = 0;
  for (let i = 0; i < value.segments.length; i++) {
    const segment: unknown = value.segments[i]; object(segment);
    fields(segment, ['id', 'firstSequence', 'acceptedOffset', 'sealed', 'retiring', 'frames']);
    if (typeof segment.id !== 'string') corrupt(); segmentName(segment.id);
    if (ids.has(segment.id) || (previousId && segment.id <= previousId) || !decimal(segment.firstSequence) || BigInt(segment.firstSequence) < 1n || !integer(segment.acceptedOffset, 1) || typeof segment.sealed !== 'boolean' || typeof segment.retiring !== 'boolean' || !Array.isArray(segment.frames)) corrupt();
    ids.add(segment.id); previousId = segment.id;
    if (previousSequence !== undefined && BigInt(segment.firstSequence) !== previousSequence + 1n) corrupt();
    if (!segment.sealed) { active++; if (i !== value.segments.length - 1 || segment.id !== value.activeSegment || segment.retiring) corrupt(); }
    if (segment.retiring) { retiring++; if (!segment.sealed || !value.receiptBarrier || i !== 0) corrupt(); }
    let sequence = BigInt(segment.firstSequence), offset: number | undefined;
    for (const entry of segment.frames) {
      object(entry); fields(entry, ['operationId', 'sequence', 'offset', 'length', 'terminal'], ['generation', 'retry', 'retirement']);
      if (typeof entry.operationId !== 'string' || !/^[a-f0-9]{64}$/.test(entry.operationId) || operations.has(entry.operationId) || !decimal(entry.sequence) || BigInt(entry.sequence) !== sequence || !integer(entry.offset, 1) || !integer(entry.length, 1) || entry.length > QUEUE_LIMITS.maxEventBytes + QUEUE_LIMITS.frameOverhead || typeof entry.terminal !== 'boolean' || (offset !== undefined && entry.offset !== offset)) corrupt();
      if (entry.terminal ? !boundedString(entry.generation, 128) : Object.hasOwn(entry, 'generation')) corrupt();
      if (segment.retiring) {
        if (!entry.terminal || Object.hasOwn(entry, 'retry')) corrupt();
        object(entry.retirement); fields(entry.retirement, ['identityDigest', 'payloadHash', 'scopeDigest', 'scopeEpochDigest']);
        if (!Object.values(entry.retirement).every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))) corrupt();
      } else if (Object.hasOwn(entry, 'retirement')) corrupt();
      if (Object.hasOwn(entry, 'retry')) {
        object(entry.retry); fields(entry.retry, ['attempts', 'nextEligibleAt', 'errorCode']);
        if (!integer(entry.retry.attempts) || !integer(entry.retry.nextEligibleAt) || !boundedString(entry.retry.errorCode, 128)) corrupt();
      }
      operations.add(entry.operationId); sequence++; offset = entry.offset + entry.length;
      if (!Number.isSafeInteger(offset)) corrupt();
      frames++;
    }
    if (offset !== undefined && offset !== segment.acceptedOffset) corrupt();
    previousSequence = sequence - 1n;
  }
  const retiringOnlyActive = active === 0 && retiring === 1 && value.segments.length === 1 && (value.segments[0] as SegmentRecord).id === value.activeSegment;
  if ((active !== 1 && !retiringOnlyActive) || retiring > 1 || previousSequence !== BigInt(value.lastSequence)) corrupt();
  try { reserveMetadata(frames, value.segments.length); } catch { corrupt(); }
}
export function checkpointBytes(value: Checkpoint): Buffer {
  validateCheckpoint(value);
  // Total bytes are capped independently of the schema's per-entry reservations.
  const text = snapshotJson(value, QUEUE_LIMITS.checkpointBytes - 1, undefined, 0, QUEUE_LIMITS.maxFrames * 16).text + '\n';
  return Buffer.from(text);
}
export function parseCheckpoint(bytes: Uint8Array): Checkpoint {
  if (bytes.byteLength > QUEUE_LIMITS.checkpointBytes) corrupt();
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const value: unknown = JSON.parse(text); validateCheckpoint(value);
    if (checkpointBytes(value).toString() !== text) corrupt();
    return snapshotJson(value, QUEUE_LIMITS.checkpointBytes, undefined, 0, QUEUE_LIMITS.maxFrames * 16).value as unknown as Checkpoint;
  } catch { corrupt(); }
}
export function initialCheckpoint(queueId: string, header: SegmentHeader): Checkpoint {
  return { formatVersion: 1, queueId, generation: '0', activeSegment: INITIAL_SEGMENT, lastSequence: '0', receiptBarrier: false, segments: [{ id: INITIAL_SEGMENT, firstSequence: '1', acceptedOffset: encodeFrame(header, 512).length, sealed: false, retiring: false, frames: [] }] };
}

/** Publishes only after callers have synced all referenced segment bytes. */
export class CheckpointWriter {
  readonly #io: QueueIo;
  #current: Checkpoint | undefined;
  #bytes: Buffer | undefined;
  constructor(io: QueueIo) { this.#io = io; }
  get current(): Checkpoint { if (!this.#current) corrupt(); return this.#current; }
  async load(): Promise<Checkpoint | undefined> {
    if (!await this.#io.exists('checkpoint.json')) return undefined;
    const bytes = await this.#io.read('checkpoint.json', QUEUE_LIMITS.checkpointBytes);
    const current = parseCheckpoint(bytes); // Never fall back to prev on corruption.
    if (await this.#io.exists('checkpoint.prev')) {
      const priorBytes = await this.#io.read('checkpoint.prev', QUEUE_LIMITS.checkpointBytes);
      const prior = parseCheckpoint(priorBytes);
      // A crash during backup publication can leave prior identical to current.
      if (prior.queueId !== current.queueId || BigInt(prior.generation) > BigInt(current.generation) || (prior.generation === current.generation && !priorBytes.equals(bytes))) corrupt();
    }
    this.#bytes = bytes; this.#current = current; return current;
  }
  async #write(name: string, bytes: Buffer): Promise<void> { await this.#io.write(name, bytes, await this.#io.exists(name) ? 'replace' : 'create'); }
  async publish(proposed: Checkpoint): Promise<Checkpoint> {
    if (!this.#current && proposed.generation !== '0') corrupt();
    if (this.#current && (proposed.queueId !== this.#current.queueId || proposed.generation !== advance(this.#current.generation))) corrupt();
    const bytes = checkpointBytes(proposed);
    // Freeze/validate before I/O, never retain the caller's mutable proposal.
    const snapshot = parseCheckpoint(bytes);
    if (this.#bytes) {
      await this.#write('checkpoint.prev.next', this.#bytes);
      await this.#io.rename('checkpoint.prev.next', 'checkpoint.prev');
      await this.#io.syncDirectory('queue');
    }
    await this.#write('checkpoint.next', bytes);
    await this.#io.rename('checkpoint.next', 'checkpoint.json');
    await this.#io.syncDirectory('queue');
    this.#current = snapshot; this.#bytes = bytes; return snapshot;
  }
  async rotate(maxEventBytes: number, maxPendingBytes: number): Promise<Checkpoint> {
    const current = this.current;
    const id = advance(BigInt(current.activeSegment).toString()).padStart(20, '0');
    const header: SegmentHeader = { formatVersion: 1, recordType: 'segment', queueId: current.queueId, segmentId: id, firstSequence: advance(current.lastSequence) };
    const bytes = encodeFrame(header, maxEventBytes);
    const frames = current.segments.reduce((sum, segment) => sum + segment.frames.length, 0);
    reserveMetadata(frames, current.segments.length + 1);
    if (current.segments.reduce((sum, segment) => sum + segment.acceptedOffset, 0) + bytes.length > maxPendingBytes) throw new MemoryError('BACKPRESSURE', 'Queue segment capacity is exhausted.', true);
    await this.#io.write('segments/' + segmentName(id), bytes, 'create');
    await this.#io.syncDirectory('segments');
    return this.publish({ ...current, generation: advance(current.generation), activeSegment: id, segments: [...current.segments.map(s => ({ ...s, sealed: true })), { id, firstSequence: header.firstSequence, acceptedOffset: bytes.length, sealed: false, retiring: false, frames: [] }] });
  }
}
