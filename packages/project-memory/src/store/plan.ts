import { TextDecoder } from 'node:util';
import { MemoryError } from '../errors.js';
import type { Scope } from '../types.js';
import { boundedString, decimal, decodeFrame, digest, encodeFrame, snapshotCommand, snapshotJson, validateScope } from '../queue/codec.js';
import type { Reservation } from '../queue/codec.js';
import { shape } from '../queue/shape.js';
import { QUEUE_LIMITS } from '../queue/types.js';
import type { EventBody, QueueFrame } from '../queue/types.js';
import { logicalId, namespaceKey, snapshotPlanRows, STORE_LIMITS } from './codec.js';
import type { CommitPlan, EmbeddingProfile, Origin, ProcessingVersion, SourcePayload } from './types.js';

export function invalidPlan(): never { throw new MemoryError('INVALID_REQUEST', 'Invalid memory commit plan.'); }
export const canonical = (value: unknown): string => snapshotJson(value, STORE_LIMITS.maxBytes).text;
const HASH = /^[a-f0-9]{64}$/;
export function domainId(kind: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || !new RegExp('^' + kind + ':[a-f0-9]{64}$').test(value)) invalidPlan();
}
export function processingVersion(value: unknown): asserts value is ProcessingVersion {
  shape(invalidPlan, value, ['processor', 'normalizer', 'prompt', 'schema']);
  if (value.schema !== 1 || !boundedString(value.processor) || ![value.normalizer, value.prompt].every(v => v === null || boundedString(v))) invalidPlan();
}
/** Revalidate the unchanged S2 frame, including its independently recomputed checksum. */
export function snapshotAdmittedFrame(input: unknown, maxEventBytes: number, reservation?: Reservation): QueueFrame {
  const copy = snapshotJson(input, maxEventBytes + QUEUE_LIMITS.frameOverhead, reservation, 2, 64).value;
  shape(invalidPlan, copy, ['formatVersion', 'recordType', 'sequence', 'operationId', 'command', 'checksum', 'payloadHash', 'queueId', 'admittedAtMs', 'scopeEpoch']);
  const { checksum, ...body } = copy;
  const decoded = decodeFrame(encodeFrame(body as unknown as EventBody, maxEventBytes), maxEventBytes);
  if (decoded.body.recordType !== 'event' || checksum !== decoded.checksum) invalidPlan();
  return Object.freeze({ ...decoded.body, checksum: decoded.checksum });
}
const prepared = new WeakSet<object>();
export interface PreparedPlan { readonly plan: CommitPlan; readonly bytes: number; readonly identityDigest: string; }
/** Each bounded substructure is copied separately; a legal deep S2 payload does not
 * lose depth/node capacity merely because a plan adds an envelope around it. */
export function snapshotPlan(input: unknown, profile: EmbeddingProfile, maxEventBytes: number, reservation?: Reservation): PreparedPlan {
  if (!Number.isSafeInteger(maxEventBytes) || maxEventBytes < 1 || maxEventBytes > QUEUE_LIMITS.maxEventBytes) invalidPlan();
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) invalidPlan();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const required = ['operationId', 'scope', 'scopeEpoch', 'commandHash', 'frame', 'expectedGeneration', 'expectedRevisions', 'disposition', 'processingVersion', 'rows'];
  const allowed = [...required, 'embeddingProfile'];
  if (Reflect.ownKeys(input).some(k => typeof k !== 'string' || !allowed.includes(k)) || required.some(k => !descriptors[k])) invalidPlan();
  const header: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !('value' in descriptor)) invalidPlan();
    if (key !== 'rows' && key !== 'frame') header[key] = descriptor.value;
  }
  const limit = Math.min(STORE_LIMITS.maxBytes, maxEventBytes * 8);
  const copied = snapshotJson(header, limit, reservation), h = copied.value;
  shape(invalidPlan, h, required.filter(k => k !== 'rows' && k !== 'frame'), ['embeddingProfile']);
  if (typeof h.operationId !== 'string' || !HASH.test(h.operationId) || typeof h.commandHash !== 'string' || !HASH.test(h.commandHash) || !boundedString(h.scopeEpoch, 256) || !decimal(h.expectedGeneration)) invalidPlan();
  validateScope(h.scope); processingVersion(h.processingVersion);
  shape(invalidPlan, h.disposition, ['state', 'errorCode', 'rejectedByTombstoneIds']);
  const disposition = h.disposition;
  if (!['committed', 'failed', 'quarantined', 'cleanup-pending'].includes(disposition.state as string)) invalidPlan();
  const failures = ['INVALID_REQUEST', 'UNBOUND_PROJECT', 'POLICY_DENIED', 'BACKPRESSURE', 'NOT_READY', 'UNSUPPORTED_VERSION', 'OWNERSHIP_CONFLICT', 'REVISION_CONFLICT', 'STORE_UNAVAILABLE', 'CONTEXT_OVERFLOW', 'DEADLINE_EXCEEDED'];
  const failed = disposition.state === 'failed' || disposition.state === 'quarantined';
  if (failed ? !failures.includes(disposition.errorCode as string) : disposition.errorCode !== null) invalidPlan();
  if (!Array.isArray(disposition.rejectedByTombstoneIds) || disposition.rejectedByTombstoneIds.length > STORE_LIMITS.maxReferences || new Set(disposition.rejectedByTombstoneIds).size !== disposition.rejectedByTombstoneIds.length) invalidPlan();
  for (const id of disposition.rejectedByTombstoneIds) domainId('tombstone', id);
  if (disposition.rejectedByTombstoneIds.length && (disposition.state !== 'failed' || disposition.errorCode !== 'POLICY_DENIED')) invalidPlan();
  if (!h.expectedRevisions || typeof h.expectedRevisions !== 'object' || Array.isArray(h.expectedRevisions)) invalidPlan();
  for (const [id, revision] of Object.entries(h.expectedRevisions)) { domainId('memory', id); if (revision !== null) domainId('revision', revision); }
  const frame = snapshotAdmittedFrame(descriptors['frame']!.value, maxEventBytes, reservation);
  const command = snapshotCommand(frame.command, maxEventBytes);
  if (h.operationId !== frame.operationId || h.commandHash !== frame.payloadHash || h.scopeEpoch !== frame.scopeEpoch || canonical(h.scope) !== canonical(frame.command.scope)) invalidPlan();
  const rows = snapshotPlanRows(input, profile, maxEventBytes, reservation);
  // Leave room for generated root, receipt and at most one namespace per effect.
  const namespaces = new Set(rows.rows.map(row => row.namespaceKey));
  if (rows.rows.length + namespaces.size + 2 > STORE_LIMITS.maxRows) invalidPlan();
  for (const row of rows.rows) if (row.rowKind === 'control' || row.rowKind === 'receipt') invalidPlan();
  if (failed && rows.rows.length) invalidPlan();
  if (!failed && frame.command.kind === 'forget' && !rows.rows.some(r => r.rowKind === 'tombstone')) invalidPlan();
  if (disposition.state === 'cleanup-pending' && (frame.command.kind !== 'forget' && frame.command.kind !== 'maintenance' || !rows.rows.some(r => r.rowKind === 'tombstone'))) invalidPlan();
  const bytes = copied.bytes + rows.bytes + snapshotJson(frame, maxEventBytes + QUEUE_LIMITS.frameOverhead, undefined, 2, 64).bytes;
  if (bytes > limit) invalidPlan();
  const result = Object.freeze({ plan: Object.freeze({ ...h, frame, rows: rows.rows }) as unknown as CommitPlan, bytes, identityDigest: command.identityDigest });
  prepared.add(result); return result;
}
export function requirePrepared(value: PreparedPlan): void { if (!prepared.has(value)) invalidPlan(); }
/** Protection can terminalize an admitted frame without retaining/re-copying its
 * speculative domain rows. Only verified store-side barrier IDs enter this path. */
export function blockedPlan(original: PreparedPlan, generation: string, ids: readonly string[]): PreparedPlan {
  requirePrepared(original);
  if (!decimal(generation) || !ids.length || ids.length > STORE_LIMITS.maxReferences || new Set(ids).size !== ids.length) invalidPlan();
  for (const id of ids) domainId('tombstone', id);
  const plan: CommitPlan = Object.freeze({ ...original.plan, expectedGeneration: generation, expectedRevisions: Object.freeze({}), rows: Object.freeze([]),
    disposition: Object.freeze({ state: 'failed', errorCode: 'POLICY_DENIED', rejectedByTombstoneIds: Object.freeze([...ids].sort()) }) });
  const result = Object.freeze({ ...original, plan }); prepared.add(result); return result;
}
export function rowScope(row: { projectId: string; sessionId: string | null; branch: string | null; environment: string | null }): Scope {
  return { projectId: row.projectId, ...(row.sessionId === null ? {} : { sessionId: row.sessionId }), ...(row.branch === null ? {} : { branch: row.branch }), ...(row.environment === null ? {} : { environment: row.environment }) };
}
export function scopeWithin(scope: Scope, authority: Scope): boolean {
  validateScope(scope); validateScope(authority);
  return scope.projectId === authority.projectId && (['sessionId', 'branch', 'environment'] as const).every(k => authority[k] === undefined || scope[k] === authority[k]);
}
/** Only qualified internal hashes enter native predicate text, never raw caller SQL. */
export function exactScopePredicate(scope: Scope, epoch: string): string { return "namespaceKey = '" + namespaceKey(scope, epoch) + "'"; }
export function rowIdPredicate(id: string): string {
  if (id !== 'control:root' && !/^(current|revision|source|evidence|receipt|tombstone|control):[a-f0-9]{64}$/.test(id)) invalidPlan();
  return "rowId = '" + id + "'";
}
export interface AdmittedSource {
  readonly text: string; readonly reference: string | null; readonly occurredAt: number | null;
}
export interface AdmittedPayload {
  readonly source: AdmittedSource | null;
  readonly admitted: { readonly origin: Origin; readonly policyVersion: string; readonly contentHash: string | null; readonly occurredAt: number | null };
}
/** Strict final-envelope decoder. Admission transforms that create it are task 11. */
export function admittedPayload(frame: QueueFrame): AdmittedPayload {
  const p = frame.command.payload;
  shape(invalidPlan, p, ['schemaVersion', 'input', 'source', 'admitted']);
  if (p.schemaVersion !== 1) throw new MemoryError('UNSUPPORTED_VERSION', 'Unsupported admitted memory payload.');
  shape(invalidPlan, p.admitted, ['version', 'origin', 'policyVersion', 'requestHash', 'contentHash', 'occurredAt']);
  const a = p.admitted;
  if (a.version !== 1 || !['user', 'host-policy', 'artifact', 'assistant', 'tool', 'document'].includes(a.origin as string) || !boundedString(a.policyVersion) || typeof a.requestHash !== 'string' || !HASH.test(a.requestHash)) invalidPlan();
  const time = (v: unknown) => v === null || Number.isSafeInteger(v) && (v as number) >= 0;
  if (!time(a.occurredAt)) invalidPlan();
  if (p.source !== null) {
    shape(invalidPlan, p.source, ['text', 'reference', 'occurredAt']);
    if (typeof p.source.text !== 'string' || !p.source.text.length || !(p.source.reference === null || typeof p.source.reference === 'string' && p.source.reference.length) || !time(p.source.occurredAt)) invalidPlan();
    if (digest(p.source.text) !== a.contentHash || p.source.occurredAt !== a.occurredAt) invalidPlan();
  } else if (a.contentHash !== null || a.occurredAt !== null) invalidPlan();
  if (['capture', 'correct', 'resolve'].includes(frame.command.kind) && p.source === null) invalidPlan();
  return p as unknown as AdmittedPayload;
}
export function sourceOccurrenceId(namespace: string, frame: QueueFrame, hash: string, start: number, end: number): string {
  return logicalId('source', namespace, [frame.operationId, frame.command.source.sourceVersion, hash, start, end]);
}
export function evidenceId(namespace: string, revisionId: string, sourceId: string, relation: string): string {
  return logicalId('evidence', namespace, [revisionId, sourceId, relation]);
}
export function subjectKeyHash(subject: string, category: string): string { return digest(canonical(['subject-category-v1', subject, category])); }
export function validateSource(source: SourcePayload, namespace: string, frame: QueueFrame, admitted: AdmittedPayload): void {
  const text = admitted.source?.text; if (text === undefined) invalidPlan();
  if (canonical(source.identity) !== canonical(frame.command.source) || source.operationId !== frame.operationId || source.contentHash !== admitted.admitted.contentHash || canonical(source.attribution) !== canonical({ origin: admitted.admitted.origin, policyVersion: admitted.admitted.policyVersion }) || source.occurredAt !== admitted.admitted.occurredAt || source.admittedAt !== frame.admittedAtMs) invalidPlan();
  const bytes = Buffer.from(text, 'utf8'), { start, end } = source.span;
  if (end > bytes.length || source.sourceId !== sourceOccurrenceId(namespace, frame, source.contentHash, start, end)) invalidPlan();
  let excerpt: string;
  try { excerpt = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(start, end)); } catch { invalidPlan(); }
  if (source.location.kind === 'admitted-excerpt' ? source.location.text !== excerpt : admitted.source?.reference === null || source.location.reference !== admitted.source?.reference) invalidPlan();
}
