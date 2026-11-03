/** Test-only direct owner/queue/store composition. Production host remains t13. */
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireOwnership } from '../../ownership.js';
import { FileQueue } from '../../queue/file-queue.js';
import { QueueAdmission } from '../../queue/admission.js';
import { digest, snapshotCommand } from '../../queue/codec.js';
import type { QueueFrame } from '../../queue/types.js';
import type { Json, MemoryCommand, MemoryLimits, Scope } from '../../types.js';
import { MemoryError } from '../../errors.js';
import { OwnedLanceStore } from '../../store/lance-store.js';
import type { StoreOpenHooks } from '../../store/lance-store.js';
import { logicalId, makeRow, namespaceKey } from '../../store/codec.js';
import { admittedPayload, evidenceId, sourceOccurrenceId } from '../../store/plan.js';
import type { CommitPlan, ForgetSelector, StoreRow } from '../../store/types.js';
import { options } from './options.js';
import { currentPayload, epoch, processingVersion, profile, scope } from './store-rows.js';
import { decodedNative, openNative } from './store-native.js';

export const integrationLimits = { maxEventBytes: 32768, segmentBytes: 32768, maxPendingBytes: 2 * 1024 * 1024, modelTimeoutMs: 1000 };
export function finalCommand(eventId: string, values: { scope?: Scope; producerId?: string; sessionId?: string; kind?: MemoryCommand['kind']; input?: Json; text?: string } = {}): MemoryCommand {
  const kind = values.kind ?? 'capture', source = kind === 'forget' ? null : { text: values.text ?? 'Keep tests deterministic.', reference: null, occurredAt: null };
  const raw: MemoryCommand = { version: 1, scope: values.scope ?? scope, source: { producerId: values.producerId ?? 'codex', eventId, sessionId: values.sessionId ?? 'source-session', turnId: 'turn', sourceVersion: '1' }, kind,
    payload: { schemaVersion: 1, input: values.input ?? {}, source } };
  return { ...raw, payload: { ...(raw.payload as Record<string, Json>), admitted: { version: 1, origin: 'user', policyVersion: 'test-policy-v1', requestHash: snapshotCommand(raw, integrationLimits.maxEventBytes).payloadHash, contentHash: source === null ? null : digest(source.text), occurredAt: null } } };
}
export function framePlan(frame: QueueFrame, generation: string, now: number, key = 'rule'): CommitPlan {
  const admitted = admittedPayload(frame), source = admitted.source; if (!source) throw Error('Capture fixture requires source.');
  const actualScope = frame.command.scope, ns = namespaceKey(actualScope, frame.scopeEpoch), next = String(BigInt(generation) + 1n);
  const memoryId = logicalId('memory', ns, key), revisionId = logicalId('revision', ns, [memoryId, frame.operationId]);
  const sourceId = sourceOccurrenceId(ns, frame, admitted.admitted.contentHash!, 0, Buffer.byteLength(source.text));
  const current = { ...currentPayload(), memoryId, revisionId, scope: actualScope, text: source.text, createdAt: now, updatedAt: now, sourceIds: [sourceId], authority: { origin: admitted.admitted.origin, policyVersion: admitted.admitted.policyVersion, sourceIds: [sourceId] } };
  const rows: StoreRow[] = [
    makeRow('source', actualScope, frame.scopeEpoch, { schemaVersion: 1, sourceId, identity: frame.command.source, operationId: frame.operationId, contentHash: admitted.admitted.contentHash!, attribution: { origin: admitted.admitted.origin, policyVersion: admitted.admitted.policyVersion }, span: { unit: 'utf8-byte', start: 0, end: Buffer.byteLength(source.text) }, location: { kind: 'admitted-excerpt', text: source.text }, occurredAt: admitted.admitted.occurredAt, admittedAt: frame.admittedAtMs, validFrom: null, validUntil: null }, profile),
    makeRow('current', actualScope, frame.scopeEpoch, current, profile, [1, 0], next),
    makeRow('revision', actualScope, frame.scopeEpoch, { schemaVersion: 1, revisionId, memoryId, predecessorRevisionId: null, mutationReason: { code: 'create', explanation: 'Deterministic fixture.' }, sourceEvent: { operationId: frame.operationId, identityDigest: snapshotCommand(frame.command, integrationLimits.maxEventBytes).identityDigest, payloadHash: frame.payloadHash }, processingVersion, committedGeneration: next, createdAt: now, snapshot: current }, profile),
    makeRow('evidence', actualScope, frame.scopeEpoch, { schemaVersion: 1, evidenceId: evidenceId(ns, revisionId, sourceId, 'supports'), memoryId, revisionId, sourceId, sourceContentHash: admitted.admitted.contentHash!, relation: 'supports', createdByOperationId: frame.operationId }, profile),
  ];
  return { operationId: frame.operationId, scope: actualScope, scopeEpoch: frame.scopeEpoch, commandHash: frame.payloadHash, frame, expectedGeneration: generation, expectedRevisions: { [memoryId]: null }, processingVersion, rows, embeddingProfile: profile, disposition: { state: 'committed', errorCode: null, rejectedByTombstoneIds: [] } };
}
export function forgetPlan(frame: QueueFrame, generation: string, now: number, selector: ForgetSelector): CommitPlan {
  const scope = frame.command.scope, ns = namespaceKey(scope, frame.scopeEpoch), next = String(BigInt(generation) + 1n);
  const marker = makeRow('tombstone', scope, frame.scopeEpoch, { schemaVersion: 1, tombstoneId: logicalId('tombstone', ns, [selector as unknown as Json, frame.operationId]), selector, namespaceKey: ns, scopeEpoch: frame.scopeEpoch, invalidFromGeneration: next, queueId: frame.queueId, cutoffSequence: frame.sequence, mode: 'closed-lifecycle', createdByOperationId: frame.operationId, createdAt: now }, profile);
  return { operationId: frame.operationId, scope, scopeEpoch: frame.scopeEpoch, commandHash: frame.payloadHash, frame, expectedGeneration: generation, expectedRevisions: {}, processingVersion, rows: [marker], disposition: { state: 'cleanup-pending', errorCode: null, rejectedByTombstoneIds: [] } };
}
export async function integrationFixture(hooks: StoreOpenHooks = {}, directory?: string, limits: MemoryLimits = integrationLimits) {
  const root = await realpath(directory ?? await mkdtemp(join(tmpdir(), 'memory-integration-'))), owner = await acquireOwnership(options(root));
  let now = 100;
  const epochs = new Map([[scope.projectId, epoch], ['other-project', epoch]]);
  const registered = new Set(['codex/source-session', 'claude/source-session']);
  const policy = {
    async bind(projectId: string) { const current = epochs.get(projectId); if (!current) throw new MemoryError('UNBOUND_PROJECT', 'fixture'); return { projectId, root: '/host/project', scopeEpoch: current }; },
    async admit(_binding: unknown, event: Json) {
      // Trusted fixture already constructs final admitted envelopes. Task 11 tests
      // actual raw-producer transforms; this registry models host authority only.
      const command = event as unknown as MemoryCommand;
      if (!registered.has(command.source.producerId + '/' + command.source.sessionId)) throw new MemoryError('POLICY_DENIED', 'Unregistered source lifecycle.');
      return event;
    },
  };
  let store = await OwnedLanceStore.open(owner, profile, { ...hooks, now: () => now }, limits, policy);
  let queue = new FileQueue(owner, root, limits, {}, store.receiptVerifier()); await queue.start();
  let admission = new QueueAdmission(queue, policy);
  async function appendWithReceipt(command: MemoryCommand) {
    const receipt = await admission.append(command);
    for await (const frame of queue.replay()) if (frame.operationId === receipt.operationId) return { frame, receipt };
    throw Error('Expected retained pending frame.');
  }
  async function append(command: MemoryCommand) { return (await appendWithReceipt(command)).frame; }
  return {
    root, owner, get store() { return store; }, get queue() { return queue; }, get admission() { return admission; }, get now() { return now; },
    clock(value: number) { now = value; }, register(producer: string, session: string) { registered.add(producer + '/' + session); }, epoch(project: string, value: string) { epochs.set(project, value); }, append, appendWithReceipt,
    async rows() { const db = await openNative(root); try { return (await db.table.query().toArray()).map(row => decodedNative(row)); } finally { db.close(); } },
    async reopen() { await queue.close(); await store.close(); const start = performance.now(); store = await OwnedLanceStore.open(owner, profile, { ...hooks, now: () => now }, limits, policy); const storeOpenMs = performance.now() - start; queue = new FileQueue(owner, root, limits, {}, store.receiptVerifier()); await queue.start(); admission = new QueueAdmission(queue, policy); return { storeOpenMs }; },
    async close() { await queue.close(); await store.close(); await owner.close(); await rm(root, { recursive: true, force: true }); },
  };
}
