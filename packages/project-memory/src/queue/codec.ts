import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { MemoryError } from '../errors.js';
import type { Json, MemoryCommand, MemoryLimits, Scope } from '../types.js';
import { QUEUE_LIMITS } from './types.js';
import type { EventBody, SegmentHeader, StableIdentity } from './types.js';

function invalid(): never { throw new MemoryError('INVALID_REQUEST', 'Invalid or oversized memory data.'); }
const pressure = (): never => { throw new MemoryError('BACKPRESSURE', 'Memory admission capacity is exhausted.', true); };
export const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
const DIGEST = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const UINT64 = /^(0|[1-9][0-9]{0,19})$/;
export function decimal(value: unknown): value is string {
  return typeof value === 'string' && UINT64.test(value) && BigInt(value) <= 18_446_744_073_709_551_615n;
}
export function validateQueueLimits(limits: MemoryLimits): void {
  if (!Number.isSafeInteger(limits.maxEventBytes) || limits.maxEventBytes < 1 || limits.maxEventBytes > QUEUE_LIMITS.maxEventBytes || !Number.isSafeInteger(limits.maxPendingBytes) || limits.maxPendingBytes < QUEUE_LIMITS.headerBytes) invalid();
}
export interface Reservation { charge(bytes: number): void; release(): void; }
/** Logical copy quota, not an RSS bound. Reserve before copying any node/key. */
export class IngressBudget {
  #bytes = 0;
  #calls = 0;
  readonly capacity: number;
  constructor(limits: MemoryLimits) {
    validateQueueLimits(limits);
    this.capacity = Math.min(64 * 1024 * 1024, limits.maxPendingBytes, 4 * limits.maxEventBytes);
  }
  get bytes(): number { return this.#bytes; }
  get calls(): number { return this.#calls; }
  reserve(): Reservation {
    if (this.#calls >= QUEUE_LIMITS.maxCalls) pressure();
    this.#calls++;
    let held = 0, released = false;
    return {
      charge: bytes => {
        if (released || !Number.isSafeInteger(bytes) || bytes < 0) invalid();
        if (bytes > this.capacity - this.#bytes) pressure();
        this.#bytes += bytes; held += bytes;
      },
      release: () => { if (!released) { this.#bytes -= held; this.#calls--; released = true; } },
    };
  }
}

/** Measure escaping and reject lone surrogates before allocating encoded text. */
function stringBytes(value: string): number {
  let bytes = 2;
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n < 0x20) bytes += n === 8 || n === 9 || n === 10 || n === 12 || n === 13 ? 2 : 6;
    else if (n === 34 || n === 92) bytes += 2;
    else if (n < 0x80) bytes++;
    else if (n < 0x800) bytes += 2;
    else if (n >= 0xd800 && n <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
      bytes += 4;
    } else if (n >= 0xdc00 && n <= 0xdfff) invalid();
    else bytes += 3;
  }
  return bytes;
}
interface Snapshot { readonly value: Json; readonly text: string; readonly bytes: number; }
/** Copies only plain data; never invokes toJSON or property getters. */
export function snapshotJson(input: unknown, maxBytes: number, reservation?: Reservation, extraDepth = 0, extraNodes = 0): Snapshot {
  let bytes = 0, nodes = 0;
  const active = new Set<object>();
  const chunks: string[] = [];
  function charge(n: number): void {
    if (n > maxBytes - bytes) invalid();
    reservation?.charge(n); bytes += n;
  }
  function token(text: string): void { charge(Buffer.byteLength(text)); chunks.push(text); }
  function quoted(text: string): void { const n = stringBytes(text); charge(n); chunks.push(JSON.stringify(text)); }
  function walk(value: unknown, depth: number): Json {
    if (++nodes > QUEUE_LIMITS.maxNodes + extraNodes || depth > QUEUE_LIMITS.maxDepth + extraDepth) invalid();
    reservation?.charge(16);
    if (value === null) { token('null'); return null; }
    if (typeof value === 'boolean') { token(String(value)); return value; }
    if (typeof value === 'string') { quoted(value); return value; }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) invalid();
      token(Object.is(value, -0) ? '-0' : JSON.stringify(value)); return value;
    }
    if (typeof value !== 'object' || active.has(value)) invalid();
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) invalid();
    active.add(value);
    const keys = Reflect.ownKeys(value);
    if (keys.length > QUEUE_LIMITS.maxNodes + 1 || keys.some(k => typeof k !== 'string')) invalid();
    let result: Json;
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as unknown;
      if (!Number.isSafeInteger(length) || (length as number) < 0 || (length as number) > QUEUE_LIMITS.maxNodes || keys.length !== (length as number) + 1) invalid();
      const copy: Json[] = []; token('[');
      for (let i = 0; i < (length as number); i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid();
        if (i) token(','); copy.push(walk(descriptor.value, depth + 1));
      }
      token(']'); result = Object.freeze(copy) as unknown as Json;
    } else {
      // Null prototype makes __proto__ an ordinary key in the immutable snapshot.
      const copy = Object.create(null) as Record<string, Json>;
      token('{'); let first = true;
      for (const key of (keys as string[]).sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid();
        if (!first) token(','); first = false; quoted(key); token(':');
        copy[key] = walk(descriptor.value, depth + 1);
      }
      token('}'); result = Object.freeze(copy);
    }
    active.delete(value); return result;
  }
  const value = walk(input, 0);
  return { value, text: chunks.join(''), bytes };
}
function record(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
}
function fields(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid();
}
export function boundedString(value: unknown, max = 512): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\0') && stringBytes(value) >= 2 && Buffer.byteLength(value) <= max;
}
export function validateScope(value: unknown): asserts value is Scope {
  record(value); fields(value, ['projectId'], ['sessionId', 'branch', 'environment']);
  for (const item of Object.values(value)) if (!boundedString(item)) invalid();
}
function commandShape(value: unknown): asserts value is MemoryCommand {
  record(value); fields(value, ['version', 'scope', 'source', 'kind', 'payload'], ['expectedRevision']);
  if (value.version !== 1) throw new MemoryError('UNSUPPORTED_VERSION', 'Unsupported memory command version.');
  validateScope(value.scope); record(value.source);
  fields(value.source, ['producerId', 'eventId', 'sessionId', 'turnId', 'sourceVersion']);
  for (const [key, item] of Object.entries(value.source)) if (!boundedString(item, key === 'sourceVersion' ? 256 : 512)) invalid();
  if (!['capture', 'correct', 'forget', 'resolve', 'maintenance', 'delivery'].includes(value.kind as string)) invalid();
  if (Object.hasOwn(value, 'expectedRevision') && !boundedString(value.expectedRevision)) invalid();
}
export interface CommandSnapshot { readonly command: MemoryCommand; readonly text: string; readonly bytes: number; readonly payloadHash: string; readonly identity: StableIdentity; readonly identityDigest: string; readonly operationId: string; }
export function snapshotCommand(input: unknown, maxBytes: number, reservation?: Reservation): CommandSnapshot {
  const snapshot = snapshotJson(input, maxBytes, reservation); commandShape(snapshot.value);
  const command = snapshot.value;
  const identity: StableIdentity = Object.freeze({ version: 1, projectId: command.scope.projectId, producerId: command.source.producerId, eventId: command.source.eventId });
  const key = snapshotJson(identity, 4096).text;
  const identityDigest = digest(key);
  return { command, text: snapshot.text, bytes: snapshot.bytes, payloadHash: digest(snapshot.text), identity, identityDigest, operationId: digest('insrc-project-memory-operation-v1\0' + key) };
}
export function visibleScope(stored: Scope, requested: Scope): boolean {
  return stored.projectId === requested.projectId && (['sessionId', 'branch', 'environment'] as const).every(key => stored[key] === undefined || stored[key] === requested[key]);
}
export function encodeFrame(body: EventBody | SegmentHeader, maxEventBytes: number): Buffer {
  const max = body.recordType === 'segment' ? QUEUE_LIMITS.headerBytes : maxEventBytes + QUEUE_LIMITS.frameOverhead;
  const encoded = snapshotJson(body, max, undefined, 2, 64);
  const text = snapshotJson({ bytes: encoded.bytes, checksum: digest(encoded.text), frame: encoded.value }, max - 1, undefined, 3, 80).text + '\n';
  return Buffer.from(text);
}
export function decodeFrame(line: Uint8Array, maxEventBytes: number): { body: EventBody | SegmentHeader; checksum: string } {
  if (line.byteLength < 1 || line.byteLength > maxEventBytes + QUEUE_LIMITS.frameOverhead || line[line.byteLength - 1] !== 10) invalid();
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(line.subarray(0, -1));
    const parsed: unknown = JSON.parse(text);
    const decoded = snapshotJson(parsed, line.byteLength, undefined, 3, 80);
    if (decoded.text !== text) invalid();
    record(parsed); fields(parsed, ['bytes', 'checksum', 'frame']);
    if (!Number.isSafeInteger(parsed.bytes) || typeof parsed.checksum !== 'string' || !DIGEST.test(parsed.checksum)) invalid();
    const body = parsed.frame; record(body);
    const canonical = snapshotJson(body, line.byteLength, undefined, 2, 64);
    if (canonical.bytes !== parsed.bytes || digest(canonical.text) !== parsed.checksum) invalid();
    if (body.formatVersion !== 1) throw new MemoryError('UNSUPPORTED_VERSION', 'Unsupported queue frame version.');
    if (typeof body.queueId !== 'string' || !UUID.test(body.queueId)) invalid();
    if (body.recordType === 'segment') {
      fields(body, ['formatVersion', 'recordType', 'queueId', 'segmentId', 'firstSequence']);
      if (typeof body.segmentId !== 'string' || !/^[0-9]{20}$/.test(body.segmentId) || !decimal(body.segmentId.replace(/^0+(?=\d)/, '')) || !decimal(body.firstSequence) || line.byteLength > QUEUE_LIMITS.headerBytes) invalid();
    } else {
      fields(body, ['formatVersion', 'recordType', 'queueId', 'sequence', 'operationId', 'command', 'payloadHash', 'admittedAtMs', 'scopeEpoch']);
      if (body.recordType !== 'event' || !decimal(body.sequence) || !boundedString(body.scopeEpoch, 256) || !Number.isSafeInteger(body.admittedAtMs) || (body.admittedAtMs as number) < 0) invalid();
      const command = snapshotCommand(body.command, maxEventBytes);
      if (body.operationId !== command.operationId || body.payloadHash !== command.payloadHash) invalid();
    }
    // Return our immutable data copy, never the mutable parser object.
    return { body: (decoded.value as Record<string, Json>).frame as unknown as EventBody | SegmentHeader, checksum: parsed.checksum };
  } catch (error) {
    if (error instanceof MemoryError) throw error;
    invalid();
  }
}
