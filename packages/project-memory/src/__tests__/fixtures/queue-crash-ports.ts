import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MemoryCommand } from '../../types.js';
import type { ReceiptVerifier, TerminalProof } from '../../queue/types.js';
import { digest, snapshotCommand, snapshotJson } from '../../queue/codec.js';
export const crashLimits = { maxEventBytes: 512, segmentBytes: 512, maxPendingBytes: 65536, modelTimeoutMs: 1 };
export const crashPolicy = { async bind(projectId: string) { return { projectId, root: '/project', scopeEpoch: 'epoch' }; }, async admit(_binding: unknown, value: unknown) { return value as never; } };
export const crashCommand = (eventId: string): MemoryCommand => ({ version: 1, scope: { projectId: 'p', sessionId: 's' }, source: { producerId: 'crash-test', eventId, sessionId: 'source', turnId: 't', sourceVersion: 'v1' }, kind: 'capture', payload: { text: 'test evidence' } });
/** Test fake only; no S3/Lance commit-atomicity claim. */
export function crashVerifier(root: string): ReceiptVerifier {
  const read = async (): Promise<TerminalProof[]> => {
    try { return JSON.parse(await readFile(join(root, 'test-receipts.json'), 'utf8')) as TerminalProof[]; }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return []; throw error; }
  };
  return {
    async byIdentity(identity) { const proof = (await read()).find(p => p.identityDigest === digest(snapshotJson(identity, 16_384).text)); return proof ? { status: 'found', proof } : { status: 'absent' }; },
    async byOperation(operationId) { const proof = (await read()).find(p => p.operationId === operationId); return proof ? { status: 'found', proof } : { status: 'absent' }; },
    async confirmRetirement(ref) { const proof = (await read()).find(p => p.operationId === ref.operationId); return !!proof && proof.queueTerminal && proof.generation === ref.generation && proof.identityDigest === ref.identityDigest && proof.payloadHash === ref.payloadHash && digest(snapshotJson(proof.scope, 16_384).text) === ref.scopeDigest && digest(proof.scopeEpoch) === ref.scopeEpochDigest; },
  };
}
export async function writeCrashReceipt(root: string): Promise<void> {
  const command = crashCommand('baseline'), snapshot = snapshotCommand(command, 512);
  const proof: TerminalProof = { operationId: snapshot.operationId, identityDigest: snapshot.identityDigest, payloadHash: snapshot.payloadHash, scope: command.scope, scopeEpoch: 'epoch', generation: 'g1', receipt: { operationId: snapshot.operationId, eventId: 'baseline', state: 'committed', generation: 'g1' }, queueTerminal: true };
  const file = await open(join(root, 'test-receipts.json'), 'wx', 0o600);
  try { await file.writeFile(JSON.stringify([proof])); await file.sync(); } finally { await file.close(); }
  const dir = await open(root, 'r'); try { await dir.sync(); } finally { await dir.close(); }
}
export interface CrashScenario { name: string; mode: 'bootstrap' | 'append' | 'retire' | 'repair' | 'reply'; phase: 'before' | 'after'; operation: string; path: string; occurrence: number; short?: boolean; }
