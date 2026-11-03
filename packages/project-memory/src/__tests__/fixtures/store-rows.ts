import { digest } from '../../queue/codec.js';
import { logicalId, makeRow, namespaceKey, rootRow } from '../../store/codec.js';
import { embeddingProfile } from '../../store/embedding-profile.js';
import type { CurrentPayload, StoreRow } from '../../store/types.js';

export const profile = embeddingProfile('test-embedding-v1', 2);
export const scope = { projectId: 'project', branch: 'main' };
export const epoch = 'epoch-1';
export const ns = namespaceKey(scope, epoch);
export const queueId = '12345678-1234-4234-8234-123456789abc';
export const storeId = 'abcdefab-1234-4234-8234-123456789abc';
export const operationId = digest('operation');
export const identityDigest = digest('identity');
export const payloadHash = digest('payload');
export const memoryId = logicalId('memory', ns, 'rule');
export const revisionId = logicalId('revision', ns, 'rule-1');
export const sourceId = logicalId('source', ns, 'event-span');
export const tombstoneId = logicalId('tombstone', ns, 'forget-other');
export const processingVersion = { processor: 'memory-v1', normalizer: 'normalizer-v1', prompt: 'prompt-v1', schema: 1 as const };
export function currentPayload(): CurrentPayload {
  return { schemaVersion: 1, memoryId, kind: 'directive', assertion: { subject: 'project', category: 'tests', predicate: 'preserve', value: -0, polarity: 'positive', conditions: [{ environment: 'all' }] },
    text: 'Keep evidence 😀.', scope, authority: { origin: 'user', sourceIds: [sourceId], policyVersion: 'policy-v1' }, status: 'active', revisionId,
    createdAt: 100, updatedAt: 100, validFrom: null, validUntil: null, sourceIds: [sourceId], relatedMemoryIds: [], supersedesMemoryId: null };
}
/** Individual valid row examples, not a claimed single-event commit plan. */
export function storeRows(): StoreRow[] {
  const current = currentPayload();
  return [
    rootRow(storeId, profile, 99),
    makeRow('control', scope, epoch, { schemaVersion: 1, kind: 'namespace', namespaceKey: ns, scope, scopeEpoch: epoch, createdAt: 100 }, profile),
    makeRow('current', scope, epoch, current, profile, [1, 0], '1'),
    makeRow('revision', scope, epoch, { schemaVersion: 1, revisionId, memoryId, predecessorRevisionId: null, mutationReason: { code: 'create', explanation: 'Explicit source.' }, sourceEvent: { operationId, identityDigest, payloadHash }, processingVersion, committedGeneration: '1', createdAt: 100, snapshot: current }, profile),
    makeRow('source', scope, epoch, { schemaVersion: 1, sourceId, identity: { producerId: 'codex', eventId: 'event-1', sessionId: 'session-1', turnId: 'turn-1', sourceVersion: '1' }, operationId, contentHash: digest(current.text), attribution: { origin: 'user', policyVersion: 'policy-v1' }, span: { unit: 'utf8-byte', start: 0, end: Buffer.byteLength(current.text) }, location: { kind: 'admitted-excerpt', text: current.text }, occurredAt: 90, admittedAt: 100, validFrom: null, validUntil: null }, profile),
    makeRow('evidence', scope, epoch, { schemaVersion: 1, evidenceId: logicalId('evidence', ns, 'revision-source'), memoryId, revisionId, sourceId, sourceContentHash: digest(current.text), relation: 'supports', createdByOperationId: operationId }, profile),
    makeRow('receipt', scope, epoch, { schemaVersion: 1, operationId, eventId: 'event-1', identityDigest, payloadHash, scope, scopeEpoch: epoch, state: 'committed', generation: '1', queueTerminal: true, affectedRevisions: [{ memoryId, previousRevisionId: null, revisionId }], sourceIds: [sourceId], tombstoneIds: [], rejectedByTombstoneIds: [], processingVersion, errorCode: null, committedAt: 100 }, profile),
    makeRow('tombstone', scope, epoch, { schemaVersion: 1, tombstoneId, selector: { kind: 'memory', memoryId: logicalId('memory', ns, 'old-erased') }, namespaceKey: ns, scopeEpoch: epoch, invalidFromGeneration: '1', queueId, cutoffSequence: '2', mode: 'closed-lifecycle', createdByOperationId: operationId, createdAt: 100 }, profile),
  ];
}
