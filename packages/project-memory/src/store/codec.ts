import { MemoryError } from '../errors.js';
import type { Json, MemoryFailureCode, Scope } from '../types.js';
import { boundedString, decimal, digest, snapshotJson, validateScope } from '../queue/codec.js';
import type { Reservation } from '../queue/codec.js';
import { record, shape } from '../queue/shape.js';
import { embeddingProfile, embeddingVector, requireProfile, validateProfile } from './embedding-profile.js';
import type { EmbeddingProfile, EncodedRow, PayloadByKind, RowEnvelope, RowKind, StoreRow } from './types.js';

export const STORE_LIMITS = Object.freeze({ maxRows: 4096, maxBytes: 64 * 1024 * 1024, maxCalls: 64, maxLeases: 16, leaseMs: 30_000, maxReferences: 16_384 });
export const ROOT_ROW_ID = 'control:root';
export const ROOT_PROJECT = '__memory_store__';
export const ROOT_EPOCH = 'root';
export const ROOT_NAMESPACE = digest('insrc-project-memory-root-v1');
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const KINDS: readonly RowKind[] = ['current', 'revision', 'source', 'evidence', 'receipt', 'tombstone', 'control'];
const FAILURES: Record<MemoryFailureCode, true> = {
  INVALID_REQUEST: true, UNBOUND_PROJECT: true, POLICY_DENIED: true, BACKPRESSURE: true, NOT_READY: true,
  UNSUPPORTED_VERSION: true, OWNERSHIP_CONFLICT: true, REVISION_CONFLICT: true, STORE_UNAVAILABLE: true,
  CONTEXT_OVERFLOW: true, DEADLINE_EXCEEDED: true,
};
function invalid(): never { throw new MemoryError('INVALID_REQUEST', 'Invalid or oversized memory store data.'); }
function object(value: unknown, keys: readonly string[]): Record<string, unknown> { shape(invalid, value, keys); return value; }
function text(value: unknown): asserts value is string { if (typeof value !== 'string' || value.length === 0) invalid(); }
function id(value: unknown): asserts value is string { if (!boundedString(value)) invalid(); }
function hash(value: unknown): asserts value is string { if (typeof value !== 'string' || !HASH.test(value)) invalid(); }
function uuid(value: unknown): void { if (typeof value !== 'string' || !UUID.test(value)) invalid(); }
function time(value: unknown): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 0) invalid(); }
function nullable(value: unknown, check: (item: unknown) => void): void { if (value !== null) check(value); }
function one(value: unknown, choices: readonly string[]): void { if (typeof value !== 'string' || !choices.includes(value)) invalid(); }
function counter(value: unknown): void { if (!decimal(value)) invalid(); }
function list(value: unknown, check: (item: unknown) => void): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > STORE_LIMITS.maxReferences) invalid();
  for (const item of value) check(item);
}
function ids(value: unknown): void { list(value, id); if (new Set(value).size !== value.length) invalid(); }
function validity(value: Record<string, unknown>): void {
  nullable(value.validFrom, time); nullable(value.validUntil, time);
  if (value.validFrom !== null && value.validUntil !== null && (value.validFrom as number) >= (value.validUntil as number)) invalid();
}
function processing(value: unknown): void {
  const p = object(value, ['processor', 'normalizer', 'prompt', 'schema']);
  id(p.processor); nullable(p.normalizer, id); nullable(p.prompt, id); if (p.schema !== 1) invalid();
}
function origin(value: unknown): void { one(value, ['user', 'host-policy', 'artifact', 'assistant', 'tool', 'document']); }
function current(value: unknown): Record<string, unknown> {
  const p = object(value, ['schemaVersion', 'memoryId', 'kind', 'assertion', 'text', 'scope', 'authority', 'status', 'revisionId', 'createdAt', 'updatedAt', 'validFrom', 'validUntil', 'sourceIds', 'relatedMemoryIds', 'supersedesMemoryId']);
  if (p.schemaVersion !== 1) throw new MemoryError('UNSUPPORTED_VERSION', 'Unsupported memory row schema.');
  id(p.memoryId); id(p.revisionId); text(p.text); validateScope(p.scope);
  one(p.kind, ['directive', 'fact', 'decision', 'progress', 'lesson']);
  one(p.status, ['candidate', 'active', 'conflicted', 'superseded', 'expired', 'deleted']);
  time(p.createdAt); time(p.updatedAt); if ((p.createdAt as number) > (p.updatedAt as number)) invalid();
  validity(p); ids(p.sourceIds); ids(p.relatedMemoryIds); nullable(p.supersedesMemoryId, id);
  const a = object(p.assertion, ['subject', 'category', 'predicate', 'value', 'polarity', 'conditions']);
  id(a.subject); id(a.category); id(a.predicate); one(a.polarity, ['positive', 'negative']); list(a.conditions, () => {});
  const authority = object(p.authority, ['origin', 'sourceIds', 'policyVersion']); origin(authority.origin); ids(authority.sourceIds); id(authority.policyVersion);
  return p;
}
export function validateSelector(value: unknown): void {
  shape(invalid, value, ['kind'], ['memoryId', 'sourceId', 'subjectKeyHash', 'sessionId', 'producerId']);
  switch (value.kind) {
    case 'memory': object(value, ['kind', 'memoryId']); id(value.memoryId); break;
    case 'source': object(value, ['kind', 'sourceId']); id(value.sourceId); break;
    case 'subject': object(value, ['kind', 'subjectKeyHash']); hash(value.subjectKeyHash); break;
    case 'session': object(value, ['kind', 'sessionId']); id(value.sessionId); break;
    case 'conversation': object(value, ['kind', 'producerId', 'sessionId']); id(value.producerId); id(value.sessionId); break;
    case 'project': object(value, ['kind']); break;
    default: invalid();
  }
}

/** Syntax/duplicated-field validation only; reference and transition guards are separate. */
function payload(kind: RowKind, value: unknown): void {
  record(invalid, value);
  if (!Object.hasOwn(value, 'schemaVersion')) invalid();
  if (value.schemaVersion !== 1) throw new MemoryError('UNSUPPORTED_VERSION', 'Unsupported memory row schema.');
  switch (kind) {
    case 'current': current(value); break;
    case 'revision': {
      const p = object(value, ['schemaVersion', 'revisionId', 'memoryId', 'predecessorRevisionId', 'mutationReason', 'sourceEvent', 'processingVersion', 'committedGeneration', 'createdAt', 'snapshot']);
      id(p.revisionId); id(p.memoryId); nullable(p.predecessorRevisionId, id); counter(p.committedGeneration); time(p.createdAt); processing(p.processingVersion);
      const reason = object(p.mutationReason, ['code', 'explanation']); one(reason.code, ['create', 'evidence-added', 'correct', 'conflict', 'resolve', 'supersede', 'expire', 'forget']); text(reason.explanation);
      const event = object(p.sourceEvent, ['operationId', 'identityDigest', 'payloadHash']); hash(event.operationId); hash(event.identityDigest); hash(event.payloadHash);
      const snapshot = current(p.snapshot); if (snapshot.memoryId !== p.memoryId || snapshot.revisionId !== p.revisionId || snapshot.updatedAt !== p.createdAt) invalid();
      break;
    }
    case 'source': {
      const p = object(value, ['schemaVersion', 'sourceId', 'identity', 'operationId', 'contentHash', 'attribution', 'span', 'location', 'occurredAt', 'admittedAt', 'validFrom', 'validUntil']);
      id(p.sourceId); hash(p.operationId); hash(p.contentHash); nullable(p.occurredAt, time); time(p.admittedAt); validity(p);
      const identity = object(p.identity, ['producerId', 'eventId', 'sessionId', 'turnId', 'sourceVersion']); for (const v of Object.values(identity)) id(v);
      if (!boundedString(identity.sourceVersion, 256)) invalid();
      const attribution = object(p.attribution, ['origin', 'policyVersion']); origin(attribution.origin); id(attribution.policyVersion);
      const span = object(p.span, ['unit', 'start', 'end']); if (span.unit !== 'utf8-byte') invalid(); time(span.start); time(span.end); if (span.start >= span.end) invalid();
      shape(invalid, p.location, ['kind'], ['text', 'reference']);
      if (p.location.kind === 'admitted-excerpt') { object(p.location, ['kind', 'text']); text(p.location.text); if (Buffer.byteLength(p.location.text) !== span.end - span.start) invalid(); }
      else if (p.location.kind === 'durable-reference') { object(p.location, ['kind', 'reference']); text(p.location.reference); }
      else invalid();
      break;
    }
    case 'evidence': {
      const p = object(value, ['schemaVersion', 'evidenceId', 'memoryId', 'revisionId', 'sourceId', 'sourceContentHash', 'relation', 'createdByOperationId']);
      for (const k of ['evidenceId', 'memoryId', 'revisionId', 'sourceId']) id(p[k]); hash(p.sourceContentHash); hash(p.createdByOperationId); one(p.relation, ['supports', 'contradicts']); break;
    }
    case 'receipt': {
      const p = object(value, ['schemaVersion', 'operationId', 'eventId', 'identityDigest', 'payloadHash', 'scope', 'scopeEpoch', 'state', 'generation', 'queueTerminal', 'affectedRevisions', 'sourceIds', 'tombstoneIds', 'rejectedByTombstoneIds', 'processingVersion', 'errorCode', 'committedAt']);
      hash(p.operationId); id(p.eventId); hash(p.identityDigest); hash(p.payloadHash); validateScope(p.scope); id(p.scopeEpoch); counter(p.generation); time(p.committedAt); processing(p.processingVersion);
      one(p.state, ['committed', 'failed', 'quarantined', 'cleanup-pending']); if (p.queueTerminal !== true) invalid();
      list(p.affectedRevisions, r => { const item = object(r, ['memoryId', 'previousRevisionId', 'revisionId']); id(item.memoryId); nullable(item.previousRevisionId, id); id(item.revisionId); });
      const revisions = p.affectedRevisions as Record<string, unknown>[];
      if (new Set(revisions.map(r => r.memoryId)).size !== revisions.length) invalid();
      ids(p.sourceIds); ids(p.tombstoneIds); ids(p.rejectedByTombstoneIds);
      nullable(p.errorCode, error => { if (typeof error !== 'string' || !Object.hasOwn(FAILURES, error)) invalid(); });
      const failed = p.state === 'failed' || p.state === 'quarantined';
      if (failed ? p.errorCode === null || revisions.length || (p.sourceIds as unknown[]).length || (p.tombstoneIds as unknown[]).length : p.errorCode !== null || (p.rejectedByTombstoneIds as unknown[]).length) invalid();
      if (p.state === 'cleanup-pending' && !(p.tombstoneIds as unknown[]).length) invalid();
      break;
    }
    case 'tombstone': {
      const p = object(value, ['schemaVersion', 'tombstoneId', 'selector', 'namespaceKey', 'scopeEpoch', 'invalidFromGeneration', 'queueId', 'cutoffSequence', 'mode', 'createdByOperationId', 'createdAt']);
      id(p.tombstoneId); validateSelector(p.selector); hash(p.namespaceKey); id(p.scopeEpoch); counter(p.invalidFromGeneration); uuid(p.queueId); counter(p.cutoffSequence); hash(p.createdByOperationId); time(p.createdAt); if (p.mode !== 'closed-lifecycle') invalid(); break;
    }
    case 'control': {
      if (value.kind === 'root') {
        const p = object(value, ['schemaVersion', 'kind', 'storeId', 'generation', 'embeddingModel', 'embeddingDimension', 'normalizationVersion', 'queueId', 'createdAt']);
        uuid(p.storeId); counter(p.generation); nullable(p.queueId, uuid); time(p.createdAt);
        validateProfile({ model: p.embeddingModel, dimension: p.embeddingDimension, normalizationVersion: p.normalizationVersion });
        if (p.generation !== '0' && p.queueId === null) invalid();
      } else if (value.kind === 'namespace') {
        const p = object(value, ['schemaVersion', 'kind', 'namespaceKey', 'scope', 'scopeEpoch', 'createdAt']);
        hash(p.namespaceKey); validateScope(p.scope); id(p.scopeEpoch); time(p.createdAt); if (p.namespaceKey !== namespaceKey(p.scope, p.scopeEpoch as string)) invalid();
      } else invalid();
      break;
    }
  }
}
export function namespaceKey(scope: Scope, epoch: string): string {
  validateScope(scope); id(epoch);
  return digest('insrc-memory-namespace-v1\0' + snapshotJson({ scope, epoch }, 16_384).text);
}
export function physicalId(kind: RowKind, namespace: string, key: string): string {
  one(kind, KINDS); hash(namespace); id(key);
  return kind + ':' + digest(snapshotJson({ namespace, key }, 4096).text);
}
export function logicalId(kind: 'memory' | 'revision' | 'source' | 'evidence' | 'tombstone', namespace: string, key: Json): string {
  hash(namespace); return kind + ':' + digest(snapshotJson({ namespace, key }, STORE_LIMITS.maxBytes).text);
}
function columns(kind: RowKind, p: Record<string, unknown>): Pick<RowEnvelope, 'entityId' | 'revisionId' | 'sourceId' | 'operationId' | 'payloadHash' | 'identityDigest' | 'status' | 'validFrom' | 'validUntil'> {
  const event = kind === 'revision' ? p.sourceEvent as Record<string, string> : undefined;
  const v = (kind === 'revision' ? p.snapshot : p) as Record<string, unknown>;
  return {
    entityId: ['current', 'revision', 'evidence'].includes(kind) ? p.memoryId as string : null,
    revisionId: ['current', 'revision', 'evidence'].includes(kind) ? p.revisionId as string : null,
    sourceId: ['source', 'evidence'].includes(kind) ? p.sourceId as string : null,
    operationId: event?.operationId ?? (['source', 'receipt'].includes(kind) ? p.operationId as string : ['evidence', 'tombstone'].includes(kind) ? p.createdByOperationId as string : null),
    payloadHash: event?.payloadHash ?? (kind === 'receipt' ? p.payloadHash as string : null),
    identityDigest: event?.identityDigest ?? (kind === 'receipt' ? p.identityDigest as string : null),
    status: kind === 'current' || kind === 'revision' ? v.status as string : kind === 'receipt' ? p.state as string : null,
    validFrom: ['current', 'revision', 'source'].includes(kind) ? v.validFrom as number | null : null,
    validUntil: ['current', 'revision', 'source'].includes(kind) ? v.validUntil as number | null : null,
  };
}
function keyFor(kind: RowKind, p: Record<string, unknown>): string {
  return (kind === 'current' ? p.memoryId : kind === 'revision' ? p.revisionId : kind === 'source' ? p.sourceId : kind === 'evidence' ? p.evidenceId : kind === 'receipt' ? p.operationId : kind === 'tombstone' ? p.tombstoneId : 'namespace') as string;
}
function payloadScope(kind: RowKind, p: Record<string, unknown>): unknown {
  return kind === 'revision' ? (p.snapshot as Record<string, unknown>).scope : kind === 'current' || kind === 'receipt' || (kind === 'control' && p.kind === 'namespace') ? p.scope : undefined;
}
export function makeRow<K extends RowKind>(kind: K, scope: Scope, epoch: string, value: PayloadByKind[K], profile: EmbeddingProfile, vector: readonly number[] | null = null, generation: string | null = null): StoreRow {
  validateScope(scope); validateProfile(profile); id(epoch);
  const p = snapshotJson(value, STORE_LIMITS.maxBytes).value;
  payload(kind, p); const data = p as Record<string, unknown>;
  const root = kind === 'control' && data.kind === 'root';
  const namespace = root ? ROOT_NAMESPACE : namespaceKey(scope, epoch);
  const derivedGeneration = kind === 'receipt' || root ? data.generation : kind === 'revision' ? data.committedGeneration : kind === 'tombstone' ? data.invalidFromGeneration : generation;
  return validateRow({ rowId: root ? ROOT_ROW_ID : physicalId(kind, namespace, keyFor(kind, data)), rowKind: kind,
    projectId: root ? ROOT_PROJECT : scope.projectId, namespaceKey: namespace, scopeEpoch: root ? ROOT_EPOCH : epoch,
    sessionId: root ? null : scope.sessionId ?? null, branch: root ? null : scope.branch ?? null, environment: root ? null : scope.environment ?? null,
    ...columns(kind, data), generation: derivedGeneration, embedding: vector, payload: p }, profile);
}
const ROW_FIELDS = ['rowId', 'rowKind', 'projectId', 'namespaceKey', 'scopeEpoch', 'sessionId', 'branch', 'environment', 'entityId', 'revisionId', 'sourceId', 'operationId', 'payloadHash', 'identityDigest', 'generation', 'status', 'validFrom', 'validUntil', 'embedding', 'payload'] as const;
export function validateRow(input: unknown, profile: EmbeddingProfile, maxBytes: number = STORE_LIMITS.maxBytes, reservation?: Reservation): StoreRow {
  validateProfile(profile);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > STORE_LIMITS.maxBytes) invalid();
  const value = snapshotJson(input, maxBytes, reservation).value;
  const r = object(value, ROW_FIELDS);
  if (r.rowKind === 'delivery') throw new MemoryError('NOT_READY', 'Memory delivery storage is not implemented.');
  one(r.rowKind, KINDS);
  const kind = r.rowKind as RowKind; payload(kind, r.payload); const p = r.payload as Record<string, unknown>;
  const root = kind === 'control' && p.kind === 'root';
  for (const key of ['rowId', 'projectId', 'scopeEpoch']) id(r[key]); hash(r.namespaceKey);
  for (const key of ['sessionId', 'branch', 'environment', 'entityId', 'revisionId', 'sourceId', 'status']) nullable(r[key], id);
  for (const key of ['operationId', 'payloadHash', 'identityDigest']) nullable(r[key], hash);
  nullable(r.generation, counter); validity(r);
  const scope: Scope = { projectId: r.projectId as string, ...(r.sessionId === null ? {} : { sessionId: r.sessionId as string }), ...(r.branch === null ? {} : { branch: r.branch as string }), ...(r.environment === null ? {} : { environment: r.environment as string }) };
  if (root) {
    if (r.rowId !== ROOT_ROW_ID || r.projectId !== ROOT_PROJECT || r.namespaceKey !== ROOT_NAMESPACE || r.scopeEpoch !== ROOT_EPOCH || r.sessionId !== null || r.branch !== null || r.environment !== null) invalid();
    requireProfile({ model: p.embeddingModel, dimension: p.embeddingDimension, normalizationVersion: p.normalizationVersion }, profile);
  } else if (r.namespaceKey !== namespaceKey(scope, r.scopeEpoch as string) || r.rowId !== physicalId(kind, r.namespaceKey as string, keyFor(kind, p))) invalid();
  const embeddedScope = payloadScope(kind, p);
  if (embeddedScope !== undefined && snapshotJson(embeddedScope, 16_384).text !== snapshotJson(scope, 16_384).text) invalid();
  if ((kind === 'receipt' || kind === 'tombstone' || (kind === 'control' && !root)) && p.scopeEpoch !== r.scopeEpoch) invalid();
  if ((kind === 'tombstone' || (kind === 'control' && !root)) && p.namespaceKey !== r.namespaceKey) invalid();
  for (const [key, expected] of Object.entries(columns(kind, p))) if (r[key] !== expected) invalid();
  const expectedGeneration = kind === 'receipt' || root ? p.generation : kind === 'revision' ? p.committedGeneration : kind === 'tombstone' ? p.invalidFromGeneration : r.generation;
  if (r.generation !== expectedGeneration) invalid();
  if (r.embedding !== null && ['receipt', 'control', 'tombstone', 'evidence'].includes(kind)) invalid();
  const embedding = r.embedding === null ? null : embeddingVector(r.embedding, profile);
  return Object.freeze({ ...r, embedding }) as unknown as StoreRow;
}
export function encodeRow(row: StoreRow, profile: EmbeddingProfile): EncodedRow {
  const checked = validateRow(row, profile);
  return Object.freeze({ ...checked, payload: snapshotJson(checked.payload, STORE_LIMITS.maxBytes).text });
}
export function decodeRow(input: unknown, profile: EmbeddingProfile, maxBytes: number = STORE_LIMITS.maxBytes, reservation?: Reservation): StoreRow {
  const raw = snapshotJson(input, maxBytes, reservation).value;
  const r = object(raw, ROW_FIELDS); if (typeof r.payload !== 'string') invalid();
  let parsed: unknown; try { parsed = JSON.parse(r.payload); } catch { invalid(); }
  if (snapshotJson(parsed, maxBytes, reservation).text !== r.payload) invalid();
  return validateRow({ ...r, payload: parsed }, profile, maxBytes, reservation);
}
/** Reserve the complete canonical effect batch before any native mutation. */
export function snapshotRows(input: unknown, profile: EmbeddingProfile, maxEventBytes: number, reservation?: Reservation): { readonly rows: readonly StoreRow[]; readonly bytes: number } {
  if (!Number.isSafeInteger(maxEventBytes) || maxEventBytes < 1 || maxEventBytes > 16 * 1024 * 1024) invalid();
  const limit = Math.min(STORE_LIMITS.maxBytes, 8 * maxEventBytes);
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > STORE_LIMITS.maxRows || Reflect.ownKeys(input).length !== input.length + 1) invalid();
  const rows: StoreRow[] = [], seen = new Set<string>(); let bytes = 2;
  for (let i = 0; i < input.length; i++) {
    const entry = Object.getOwnPropertyDescriptor(input, String(i));
    if (!entry || !entry.enumerable || !('value' in entry)) invalid();
    const row = validateRow(entry.value, profile, limit, reservation);
    const size = snapshotJson(row, limit).bytes + (i ? 1 : 0);
    if (size > limit - bytes || seen.has(row.rowId)) invalid();
    rows.push(row); seen.add(row.rowId); bytes += size;
  }
  if (bytes > limit) invalid();
  return Object.freeze({ rows: Object.freeze(rows), bytes });
}
/** Prepare the row/profile portion of a CommitPlan before writer admission.
 * Other plan fields (frame identity, revisions and disposition) belong to the
 * causal guards. Never infer a missing vector profile from the row dimension. */
export function snapshotPlanRows(input: unknown, profile: EmbeddingProfile, maxEventBytes: number, reservation?: Reservation) {
  validateProfile(profile); record(invalid, input);
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) invalid();
  const rows = Object.getOwnPropertyDescriptor(input, 'rows');
  const metadata = Object.getOwnPropertyDescriptor(input, 'embeddingProfile');
  if (!rows || !rows.enumerable || !('value' in rows)) invalid();
  if (metadata) {
    if (!metadata.enumerable || !('value' in metadata)) invalid();
    requireProfile(metadata.value, profile);
  }
  const prepared = snapshotRows(rows.value, profile, maxEventBytes, reservation);
  if (!metadata && prepared.rows.some(row => row.embedding !== null)) invalid();
  return prepared;
}
/** Native SDK adapters call explicitly; imports of the public package stay pure. */
export async function arrowSchema(profile: EmbeddingProfile) {
  validateProfile(profile);
  const dimension = profile.dimension;
  const a = await import('apache-arrow');
  const nonNull = ['rowId', 'rowKind', 'projectId', 'namespaceKey', 'scopeEpoch', 'payload'];
  const nullableText = ['sessionId', 'branch', 'environment', 'entityId', 'revisionId', 'sourceId', 'operationId', 'payloadHash', 'identityDigest', 'generation', 'status'];
  return new a.Schema([
    ...nonNull.map(name => new a.Field(name, new a.Utf8(), false)),
    ...nullableText.map(name => new a.Field(name, new a.Utf8(), true)),
    new a.Field('validFrom', new a.TimestampMillisecond(), true), new a.Field('validUntil', new a.TimestampMillisecond(), true),
    new a.Field('embedding', new a.FixedSizeList(dimension, new a.Field('item', new a.Float32(), false)), true),
  ]);
}
export function rootRow(storeId: string, profile: EmbeddingProfile, createdAt: number): StoreRow {
  const checked = embeddingProfile(profile.model, profile.dimension); requireProfile(profile, checked);
  return makeRow('control', { projectId: ROOT_PROJECT }, ROOT_EPOCH, { schemaVersion: 1, kind: 'root', storeId, generation: '0', embeddingModel: profile.model, embeddingDimension: profile.dimension, normalizationVersion: profile.normalizationVersion, queueId: null, createdAt }, profile);
}
