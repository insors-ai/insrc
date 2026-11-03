import { decodeFrame, digest, encodeFrame, snapshotCommand } from '../../queue/codec.js';
import type { QueueFrame } from '../../queue/types.js';
import type { Json, MemoryCommand, Scope } from '../../types.js';
import { logicalId, makeRow, namespaceKey, rootRow } from '../../store/codec.js';
import { evidenceId, sourceOccurrenceId } from '../../store/plan.js';
import type { CommitPlan, CurrentPayload, Lifecycle, MutationReason, RootPayload, StoreRow } from '../../store/types.js';
import { currentPayload, epoch, processingVersion, profile, queueId, scope, storeId } from './store-rows.js';

export function admittedFrame(eventId = 'event-1', kind: MemoryCommand['kind'] = 'capture', actualScope: Scope = scope, text = 'Test 😀 directive.', input: Json = {}): QueueFrame {
  const source = { text, reference: 'fixture://source', occurredAt: 80 };
  const raw = { version: 1 as const, scope: actualScope, source: { producerId: 'codex', eventId, sessionId: 'registered-session', turnId: 'turn', sourceVersion: '1' }, kind, payload: { schemaVersion: 1, input, source } };
  const command = { ...raw, payload: { ...raw.payload, admitted: { version: 1, origin: 'user', policyVersion: 'policy-v1', requestHash: snapshotCommand(raw, 32768).payloadHash, contentHash: digest(text), occurredAt: 80 } } };
  const snapshot = snapshotCommand(command, 32768);
  const body = { formatVersion: 1 as const, recordType: 'event' as const, sequence: eventId === 'event-1' ? '1' : '2', operationId: snapshot.operationId, command: snapshot.command, payloadHash: snapshot.payloadHash, queueId, admittedAtMs: 90, scopeEpoch: epoch };
  const decoded = decodeFrame(encodeFrame(body, 32768), 32768);
  return { ...body, checksum: decoded.checksum };
}
export function reframe(frame: QueueFrame, command: MemoryCommand): QueueFrame {
  const snapshot = snapshotCommand(command, 32768);
  const { checksum: _checksum, ...body } = frame;
  const next = { ...body, command: snapshot.command, payloadHash: snapshot.payloadHash, operationId: snapshot.operationId };
  return { ...next, checksum: decodeFrame(encodeFrame(next, 32768), 32768).checksum };
}
export function planFixture(opts: { previous?: CurrentPayload; memoryKey?: string; reason?: MutationReason; status?: Lifecycle; kind?: MemoryCommand['kind']; generation?: string; scope?: Scope; text?: string; now?: number; eventId?: string; input?: Json } = {}) {
  const actualScope = opts.scope ?? scope, namespace = namespaceKey(actualScope, epoch);
  const generation = opts.generation ?? (opts.previous ? '1' : '0'), next = String(BigInt(generation) + 1n), now = opts.now ?? (opts.previous ? 200 : 100);
  const frame = admittedFrame(opts.eventId ?? (opts.previous ? 'event-2' : 'event-1'), opts.kind ?? 'capture', actualScope, opts.text, opts.input);
  const payload = frame.command.payload as { source: { text: string } };
  const contentHash = digest(payload.source.text), end = Buffer.byteLength(payload.source.text);
  const sourceId = sourceOccurrenceId(namespace, frame, contentHash, 0, end);
  const memoryId = opts.previous?.memoryId ?? logicalId('memory', namespace, opts.memoryKey ?? 'test-rule');
  const revisionId = logicalId('revision', namespace, [memoryId, frame.operationId]);
  const current: CurrentPayload = { ...currentPayload(), memoryId, revisionId, text: payload.source.text, scope: actualScope, status: opts.status ?? 'active', createdAt: opts.previous?.createdAt ?? now, updatedAt: now,
    authority: { origin: 'user', sourceIds: [sourceId], policyVersion: 'policy-v1' }, sourceIds: [sourceId] };
  const command = snapshotCommand(frame.command, 32768);
  const rows: StoreRow[] = [
    makeRow('source', actualScope, epoch, { schemaVersion: 1, sourceId, identity: frame.command.source, operationId: frame.operationId, contentHash, attribution: { origin: 'user', policyVersion: 'policy-v1' }, span: { unit: 'utf8-byte', start: 0, end }, location: { kind: 'admitted-excerpt', text: payload.source.text }, occurredAt: 80, admittedAt: 90, validFrom: null, validUntil: null }, profile),
    makeRow('current', actualScope, epoch, current, profile, [1, 0], next),
    makeRow('revision', actualScope, epoch, { schemaVersion: 1, revisionId, memoryId, predecessorRevisionId: opts.previous?.revisionId ?? null, mutationReason: { code: opts.reason ?? 'create', explanation: 'Test admitted source.' }, sourceEvent: { operationId: frame.operationId, identityDigest: command.identityDigest, payloadHash: frame.payloadHash }, processingVersion, committedGeneration: next, createdAt: now, snapshot: current }, profile),
    makeRow('evidence', actualScope, epoch, { schemaVersion: 1, evidenceId: evidenceId(namespace, revisionId, sourceId, 'supports'), memoryId, revisionId, sourceId, sourceContentHash: contentHash, relation: 'supports', createdByOperationId: frame.operationId }, profile),
  ];
  const plan: CommitPlan = { operationId: frame.operationId, scope: actualScope, scopeEpoch: epoch, commandHash: frame.payloadHash, frame, expectedGeneration: generation, expectedRevisions: { [memoryId]: opts.previous?.revisionId ?? null }, processingVersion,
    disposition: { state: 'committed', errorCode: null, rejectedByTombstoneIds: [] }, embeddingProfile: profile, rows };
  const root = { ...(rootRow(storeId, profile, 50).payload as RootPayload), generation, queueId: generation === '0' ? null : queueId };
  return { plan, rows, root, current, now, namespace };
}
