import { MemoryError } from '../errors.js';
import type { Scope } from '../types.js';
import { boundedString, decimal, digest, snapshotJson, validateScope, visibleScope } from '../queue/codec.js';
import { shape } from '../queue/shape.js';
import type { ReceiptLookup, ReceiptVerifier, RetirementReference, StableIdentity, TerminalProof } from '../queue/types.js';
import { validateRow } from './codec.js';
import { canonical } from './plan.js';
import { receiptView } from './writer.js';
import type { EmbeddingProfile, ReceiptPayload, RootPayload } from './types.js';

/** Native access stays behind the owner; callbacks are read-only and queue-free. */
export interface ReceiptAccess {
  read<T>(run: () => Promise<T>): Promise<T>;
  identity(hash: string): Promise<unknown | null>;
  operation(hash: string): Promise<unknown | null>;
  root(): Promise<RootPayload>;
}
function unavailable(): never { throw new MemoryError('STORE_UNAVAILABLE', 'Authoritative memory receipt is unavailable.'); }
function hash(value: unknown): asserts value is string { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) unavailable(); }
function identity(input: unknown): StableIdentity {
  const value = snapshotJson(input, 16_384).value;
  shape(unavailable, value, ['version', 'projectId', 'producerId', 'eventId']);
  if (value.version !== 1 || ![value.projectId, value.producerId, value.eventId].every(v => boundedString(v))) unavailable();
  return value as unknown as StableIdentity;
}
function proof(p: ReceiptPayload): TerminalProof {
  return Object.freeze({ operationId: p.operationId, identityDigest: p.identityDigest, payloadHash: p.payloadHash, scope: p.scope, scopeEpoch: p.scopeEpoch, generation: p.generation, receipt: receiptView(p), queueTerminal: true });
}
export function receiptVerifier(access: ReceiptAccess, profile: EmbeddingProfile): ReceiptVerifier {
  const decoded = async (raw: unknown | null): Promise<ReceiptPayload | null> => {
    const root = await access.root();
    if (raw === null) return null;
    const row = validateRow(raw, profile);
    if (row.rowKind !== 'receipt' || !decimal(root.generation) || root.queueId === null || BigInt(row.payload.generation) > BigInt(root.generation)) unavailable();
    return row.payload;
  };
  return Object.freeze({
    async byIdentity(input: StableIdentity): Promise<ReceiptLookup> {
      try {
        const key = identity(input), text = canonical(key), expected = digest('insrc-project-memory-operation-v1\0' + text), identityDigest = digest(text);
        return await access.read(async () => {
          const p = await decoded(await access.identity(identityDigest));
          if (p === null) return { status: 'absent' };
          if (p.operationId !== expected || p.identityDigest !== identityDigest || p.eventId !== key.eventId || p.scope.projectId !== key.projectId) unavailable();
          return { status: 'found', proof: proof(p) };
        });
      } catch { return { status: 'unavailable' }; }
    },
    async byOperation(operationId: string, requestedScope: Scope): Promise<ReceiptLookup> {
      try {
        hash(operationId); const scope = snapshotJson(requestedScope, 16_384).value; validateScope(scope);
        return await access.read(async () => {
          const p = await decoded(await access.operation(operationId));
          if (p === null) return { status: 'absent' };
          if (p.operationId !== operationId) unavailable();
          if (!visibleScope(p.scope, scope)) return { status: 'absent' };
          return { status: 'found', proof: proof(p) };
        });
      } catch { return { status: 'unavailable' }; }
    },
    async confirmRetirement(input: RetirementReference): Promise<boolean> {
      try {
        const reference = snapshotJson(input, 4096).value;
        shape(unavailable, reference, ['operationId', 'generation', 'identityDigest', 'payloadHash', 'scopeDigest', 'scopeEpochDigest']);
        for (const key of ['operationId', 'identityDigest', 'payloadHash', 'scopeDigest', 'scopeEpochDigest']) hash(reference[key]);
        if (!decimal(reference.generation)) unavailable();
        return await access.read(async () => {
          const p = await decoded(await access.operation(reference.operationId as string));
          if (p === null) return false;
          if (p.operationId !== reference.operationId) unavailable();
          return p.queueTerminal === true && p.generation === reference.generation && p.identityDigest === reference.identityDigest && p.payloadHash === reference.payloadHash && digest(canonical(p.scope)) === reference.scopeDigest && digest(p.scopeEpoch) === reference.scopeEpochDigest;
        });
      } catch { unavailable(); }
    },
  });
}
