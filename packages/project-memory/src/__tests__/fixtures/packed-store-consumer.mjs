/** External test harness: only installed tarball modules, no backend sources. */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { MemoryFactory } from '@insrc/project-memory';
const root = dirname(fileURLToPath(import.meta.resolve('@insrc/project-memory')));
const privateModule = path => import(pathToFileURL(join(root, path)).href);
const { acquireOwnership } = await privateModule('ownership.js');
const { OwnedLanceStore } = await privateModule('store/lance-store.js');
const { FileQueue } = await privateModule('queue/file-queue.js');
const { embeddingProfile } = await privateModule('store/embedding-profile.js');
const { makeRow, logicalId, namespaceKey } = await privateModule('store/codec.js');
const { admittedPayload, sourceOccurrenceId, evidenceId, canonical } = await privateModule('store/plan.js');
const { snapshotCommand } = await privateModule('queue/codec.js');
let modelCalls = 0;
const options = {
  dataDirectory: process.argv[2],
  models: { embeddingModel: 'packed-store-v1', embeddingDimension: 2, async complete() { modelCalls++; return null; }, async embed() { modelCalls++; return [1, 0]; } },
  policy: { async bind(projectId) { return { projectId, root: '/host', scopeEpoch: 'packed-epoch' }; }, async admit(_binding, event) {
    return { ...event, payload: { ...event.payload, policyAttestation: { version: 1, origin: 'host-policy', policyVersion: 'packed-v1', occurrenceTimeVerified: false } } };
  } }, logger: { write() {} }, limits: { maxEventBytes: 32768, segmentBytes: 32768, maxPendingBytes: 2097152, modelTimeoutMs: 1000 },
};
const scope = { projectId: 'packed-project', branch: 'main' }, command = { version: 1, scope, source: { producerId: 'trusted-fixture', eventId: 'commit', sessionId: 'source-session', turnId: 'turn', sourceVersion: '1' }, kind: 'capture', payload: { schemaVersion: 1, input: {}, source: { text: 'Keep exact Unicode: é😀', reference: null, occurredAt: null } } };
const publicService = await MemoryFactory.open(options), accepted = await publicService.submit(command); await publicService.close();
const profile = embeddingProfile(options.models.embeddingModel, 2), owner = await acquireOwnership(options), store = await OwnedLanceStore.open(owner, profile, { now: () => 100 }, options.limits, options.policy);
const queue = new FileQueue(owner, owner.directory, options.limits, {}, store.receiptVerifier()); await queue.start();
let committed;
try {
  const frames = []; for await (const frame of queue.replay()) frames.push(frame); assert.equal(frames.length, 1);
  const frame = frames[0], payload = admittedPayload(frame), ns = namespaceKey(scope, frame.scopeEpoch);
  const memoryId = logicalId('memory', ns, 'packed-rule'), revisionId = logicalId('revision', ns, 'packed-r1'), sourceId = sourceOccurrenceId(ns, frame, payload.admitted.contentHash, 0, Buffer.byteLength(payload.source.text));
  const current = { schemaVersion: 1, memoryId, kind: 'directive', assertion: { subject: 'tests', category: 'project', predicate: 'preserve', value: 'Unicode', polarity: 'positive', conditions: [] }, text: payload.source.text, scope,
    authority: { origin: payload.admitted.origin, sourceIds: [sourceId], policyVersion: payload.admitted.policyVersion }, status: 'active', revisionId, createdAt: 100, updatedAt: 100, validFrom: null, validUntil: null, sourceIds: [sourceId], relatedMemoryIds: [], supersedesMemoryId: null };
  const processingVersion = { processor: 'packed-test-v1', normalizer: 'deterministic-v1', prompt: 'packed-fixture-v1', schema: 1 };
  const plan = { operationId: frame.operationId, scope, scopeEpoch: frame.scopeEpoch, commandHash: frame.payloadHash, frame, expectedGeneration: '0', expectedRevisions: { [memoryId]: null }, embeddingProfile: profile, processingVersion, disposition: { state: 'committed', errorCode: null, rejectedByTombstoneIds: [] }, rows: [
    makeRow('source', scope, frame.scopeEpoch, { schemaVersion: 1, sourceId, identity: frame.command.source, operationId: frame.operationId, contentHash: payload.admitted.contentHash, attribution: { origin: payload.admitted.origin, policyVersion: payload.admitted.policyVersion }, span: { unit: 'utf8-byte', start: 0, end: Buffer.byteLength(payload.source.text) }, location: { kind: 'admitted-excerpt', text: payload.source.text }, occurredAt: null, admittedAt: frame.admittedAtMs, validFrom: null, validUntil: null }, profile),
    makeRow('current', scope, frame.scopeEpoch, current, profile, [1, 0], '1'),
    makeRow('revision', scope, frame.scopeEpoch, { schemaVersion: 1, revisionId, memoryId, predecessorRevisionId: null, mutationReason: { code: 'create', explanation: 'External installed package qualification.' }, sourceEvent: { operationId: frame.operationId, identityDigest: snapshotCommand(frame.command, 32768).identityDigest, payloadHash: frame.payloadHash }, processingVersion, committedGeneration: '1', createdAt: 100, snapshot: current }, profile),
    makeRow('evidence', scope, frame.scopeEpoch, { schemaVersion: 1, evidenceId: evidenceId(ns, revisionId, sourceId, 'supports'), memoryId, revisionId, sourceId, sourceContentHash: payload.admitted.contentHash, relation: 'supports', createdByOperationId: frame.operationId }, profile),
  ] };
  committed = await store.commit(plan); assert.equal(committed.state, 'committed');
  assert.equal(canonical(await store.commit(plan)), canonical(committed));
  assert.equal((await store.current(scope, await store.snapshot(scope)))[0].text, payload.source.text);
  assert.equal((await store.receiptVerifier().byOperation(accepted.operationId, scope)).proof.generation, '1');
  await queue.markResolved(frame.operationId, '1'); await queue.recycleResolvedSegments();
} finally { await queue.close(); await store.close(); await owner.close(); }
const cold = await MemoryFactory.open(options);
assert.equal(canonical(await cold.operation({ scope, operationId: accepted.operationId })), canonical(committed));
assert.equal(canonical(await cold.submit(command)), canonical(committed)); await cold.close();
await assert.rejects(import('@insrc/project-memory/store/codec'), error => error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
assert.equal(modelCalls, 0);
