import { shape } from './shape.js';
import { MemoryError } from '../errors.js';
import type { Scope } from '../types.js';
import { boundedString, snapshotJson, validateScope } from './codec.js';
import type { ReceiptLookup, TerminalProof } from './types.js';

export class ReceiptUnavailableError extends MemoryError {
  constructor() { super('STORE_UNAVAILABLE', 'Authoritative receipt verification is unavailable.', true); }
}
const unavailable = (): never => { throw new ReceiptUnavailableError(); };
/** The port is an external trust boundary even though its TypeScript is precise. */
export async function readReceipt(run: () => Promise<ReceiptLookup>): Promise<ReceiptLookup> {
  let value: unknown;
  try { value = snapshotJson(await run(), 32_768).value; }
  catch { throw new ReceiptUnavailableError(); }
  try { return validateReceipt(value); }
  catch (error) {
    if (error instanceof ReceiptUnavailableError || (error instanceof MemoryError && error.code === 'NOT_READY')) throw error;
    throw new ReceiptUnavailableError();
  }
}
function validateReceipt(value: unknown): ReceiptLookup {
  shape(unavailable, value, ['status'], ['proof']);
  if (value.status === 'absent' || value.status === 'unavailable') {
    if (Object.hasOwn(value, 'proof')) throw new ReceiptUnavailableError();
    if (value.status === 'unavailable') throw new ReceiptUnavailableError();
    return { status: 'absent' };
  }
  if (value.status !== 'found') throw new ReceiptUnavailableError();
  const proof = value.proof;
  shape(unavailable, proof, ['operationId', 'identityDigest', 'payloadHash', 'scope', 'scopeEpoch', 'generation', 'receipt', 'queueTerminal']);
  try { validateScope(proof.scope); } catch { throw new ReceiptUnavailableError(); }
  if (!['operationId', 'identityDigest', 'payloadHash'].every(k => typeof proof[k] === 'string' && /^[a-f0-9]{64}$/.test(proof[k] as string)) || !boundedString(proof.scopeEpoch, 256) || !boundedString(proof.generation, 128)) throw new ReceiptUnavailableError();
  if (proof.queueTerminal !== true) throw new MemoryError('NOT_READY', 'Operation does not have a verified terminal disposition.');
  shape(unavailable, proof.receipt, ['operationId', 'eventId', 'state'], ['generation', 'errorCode']);
  if (proof.receipt.operationId !== proof.operationId || proof.receipt.generation !== proof.generation || !boundedString(proof.receipt.eventId) || (Object.hasOwn(proof.receipt, 'errorCode') && !boundedString(proof.receipt.errorCode, 128))) throw new ReceiptUnavailableError();
  if (!['committed', 'failed', 'quarantined', 'cleanup-pending'].includes(proof.receipt.state as string)) throw new MemoryError('NOT_READY', 'Operation does not have a verified terminal disposition.');
  return { status: 'found', proof: proof as unknown as TerminalProof };
}
export interface ExpectedProof { readonly operationId: string; readonly identityDigest: string; readonly payloadHash: string; readonly scope: Scope; readonly scopeEpoch: string; readonly eventId: string; }
export function matchProof(proof: TerminalProof, expected: ExpectedProof, generation?: string): void {
  if (proof.operationId !== expected.operationId || proof.identityDigest !== expected.identityDigest || proof.payloadHash !== expected.payloadHash || proof.scopeEpoch !== expected.scopeEpoch || proof.receipt.eventId !== expected.eventId || snapshotJson(proof.scope, 16_384).text !== snapshotJson(expected.scope, 16_384).text || (generation !== undefined && proof.generation !== generation)) throw new MemoryError('REVISION_CONFLICT', 'Receipt does not match the accepted operation.');
}
