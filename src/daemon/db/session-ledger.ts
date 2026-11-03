/** Session-private tickets and safe receipt truth. No keychain or durable receipt ports. */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ConnectionKey, OperationTicket, MutationRequest, MutationOutcome, CommittedOutcome, OperationStatus } from '../../shared/connection-management.js';
import { parseConnectionKey, parseMutationRequest, parseOperationTicket } from '../../shared/connection-management-wire.js';
import { canonicalRequestJson } from './management-tickets.js';
import { ManagementServiceError, managementRejection } from './management.js';
export const MAX_SESSION_OPERATION_RECORDS = 16384;
interface LedgerPorts {
 readonly key: Buffer; readonly daemonEpoch: string; readonly sessionHandle: string;
 readonly now: () => number; readonly deadline: () => number; readonly assertActive: () => void;
 readonly wallNow?: (() => number) | undefined;
}
interface Issued { readonly expires: number; requestMac?: string | undefined }
interface Receipt { readonly requestMac: string; readonly outcome: CommittedOutcome }
type Commit = (publish: () => { readonly revision: string }) => MutationOutcome;
const fail = (code: 'busy' | 'invalid-input' | 'operation-mismatch' | 'reconciliation-required' | 'session-expired') => new ManagementServiceError(code);
export class SessionOperationLedger {
 readonly #ports: LedgerPorts;
 readonly #wallBase: number;
 readonly #monoBase: number;
 readonly #issued = new Map<string, Issued>();
 readonly #receipts = new Map<string, Receipt>();
 readonly #inflight = new Map<string, { readonly mac: string; readonly promise: Promise<MutationOutcome> }>();
 #closed = false;
 constructor(ports: LedgerPorts) {
  this.#ports = Object.freeze({ ...ports }); this.#monoBase = ports.now(); this.#wallBase = (ports.wallNow ?? Date.now)();
  if (ports.key.length !== 32 || !Number.isFinite(this.#wallBase)) throw fail('invalid-input');
 }
 #active(): void { if (this.#closed) throw fail('session-expired'); this.#ports.assertActive(); }
 #now(): number { return this.#wallBase + this.#ports.now() - this.#monoBase; }
 #mac(domain: 'ticket' | 'request', value: unknown): string {
  return createHmac('sha256', this.#ports.key).update(`connection-session-v2:${domain}\0`).update(canonicalRequestJson({ daemonEpoch: this.#ports.daemonEpoch, sessionHandle: this.#ports.sessionHandle, value })).digest('base64url');
 }
 #same(a: string, b: string): boolean { const x = Buffer.from(a, 'base64url'), y = Buffer.from(b, 'base64url'); return x.length === y.length && timingSafeEqual(x, y); }
 issue(value: ConnectionKey, mode: OperationTicket['mode']): OperationTicket {
  this.#active(); const key = parseConnectionKey(JSON.parse(canonicalRequestJson(value)));
  if (key.scope !== 'temporary' || !['create', 'update', 'remove'].includes(mode)) throw fail('operation-mismatch');
  const now = this.#now();
  if (this.#issued.size + this.#receipts.size >= MAX_SESSION_OPERATION_RECORDS) {
   for (const [id, issued] of this.#issued) if (issued.expires <= now && !this.#inflight.has(id)) this.#issued.delete(id);
   if (this.#issued.size + this.#receipts.size >= MAX_SESSION_OPERATION_RECORDS) throw fail('busy');
  }
  const expires = Math.min(now + 90000, this.#wallBase + this.#ports.deadline() - this.#monoBase);
  this.#active(); if (expires <= this.#now()) throw fail('session-expired');
  const unsigned = { operationId: randomUUID(), lookupRoot: key.repoRoot, scope: 'temporary' as const, connectionId: key.id, mode, issuedAt: new Date(now).toISOString(), expiresAt: new Date(expires).toISOString() };
  const ticket = Object.freeze({ ...unsigned, signature: this.#mac('ticket', unsigned) });
  this.#issued.set(ticket.operationId, { expires }); return ticket;
 }
 inspect(value: unknown): { readonly ticket: OperationTicket; readonly expired: boolean } {
  this.#active(); const ticket = parseOperationTicket(JSON.parse(canonicalRequestJson(value)));
  if (ticket.scope !== 'temporary') throw fail('operation-mismatch');
  const { signature, ...unsigned } = ticket;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature) || Buffer.from(signature, 'base64url').toString('base64url') !== signature || !this.#same(signature, this.#mac('ticket', unsigned))) throw fail('invalid-input');
  const issued = Date.parse(ticket.issuedAt), expires = Date.parse(ticket.expiresAt), now = this.#now();
  if (issued > now || expires <= issued || expires - issued > 90000) throw fail('invalid-input');
  return { ticket: Object.freeze(ticket), expired: expires <= now };
 }
 status(value: unknown): OperationStatus {
  const { ticket, expired } = this.inspect(value), receipt = this.#receipts.get(ticket.operationId);
  if (receipt) return { status: 'committed', value: { ...receipt.outcome } };
  if (expired) return { status: 'reconciliation-required' };
  return { status: this.#inflight.has(ticket.operationId) ? 'pending' : 'not-seen' };
 }
 async mutate(value: unknown, apply: (request: MutationRequest, commit: Commit) => Promise<MutationOutcome>, assertRequest: () => void): Promise<MutationOutcome> {
  try {
   this.#active(); assertRequest();
   const request = parseMutationRequest(JSON.parse(canonicalRequestJson(value))), { expired } = this.inspect(request.ticket);
   if (request.key.scope !== 'temporary') throw fail('operation-mismatch');
   const mac = this.#mac('request', request), receipt = this.#receipts.get(request.operationId);
   const pending = this.#inflight.get(request.operationId);
   if (pending) { if (!this.#same(mac, pending.mac)) throw fail('operation-mismatch'); const result = await pending.promise; this.#active(); assertRequest(); return structuredClone(result); }
   if (receipt) { if (!this.#same(mac, receipt.requestMac)) throw fail('operation-mismatch'); return { status: 'committed', value: { ...receipt.outcome } }; }
   if (expired) throw fail('reconciliation-required');
   const issued = this.#issued.get(request.operationId);
   if (!issued) throw fail('reconciliation-required');
   if (issued.requestMac && !this.#same(mac, issued.requestMac)) throw fail('operation-mismatch');
   if (this.#receipts.size >= MAX_SESSION_OPERATION_RECORDS) throw fail('busy');
   issued.requestMac = mac;
   let committed = false;
   const commit: Commit = publish => {
    this.#active(); assertRequest(); if (this.inspect(request.ticket).expired) throw fail('reconciliation-required');
    if (committed || this.#receipts.has(request.operationId)) throw fail('operation-mismatch');
    if (this.#receipts.size >= MAX_SESSION_OPERATION_RECORDS) throw fail('busy');
    const entry = publish();
    const outcome: CommittedOutcome = Object.freeze({ operationId: request.operationId, revision: entry.revision,
     registration: request.mode === 'remove' ? 'removed' : 'session-added',
     activation: request.mode === 'remove' ? 'not-applicable' : 'pending',credentialCleanup:'complete' });
    this.#receipts.set(request.operationId, { requestMac: mac, outcome }); this.#issued.delete(request.operationId); committed = true;
    return { status: 'committed', value: { ...outcome } };
   };
   // Defer apply until the in-flight identity is installed, including synchronous preparations.
   const truth = (fallback: MutationOutcome): MutationOutcome => {
    const receipt=this.#receipts.get(request.operationId);
    return receipt ? {status:'committed',value:{...receipt.outcome}} : fallback;
   };
   const promise = Promise.resolve().then(() => apply(request, commit)).then(result=>truth(result),error=>truth(managementRejection(error)));
   this.#inflight.set(request.operationId, { mac, promise });
   try { const result = await promise; this.#active(); assertRequest(); return structuredClone(result); }
   finally { if (this.#inflight.get(request.operationId)?.promise === promise) this.#inflight.delete(request.operationId); }
  } catch (error) { return managementRejection(error); }
 }
 outcome(revision: string): CommittedOutcome {
  this.#active();
  for (const receipt of this.#receipts.values()) if (receipt.outcome.revision === revision) return { ...receipt.outcome };
  throw fail('operation-mismatch');
 }
 cleanup(operationId: string, revision: string, phase: 'complete' | 'pending'): void {
  this.#active(); const receipt = this.#receipts.get(operationId);
  if (!receipt || receipt.outcome.revision !== revision || (receipt.outcome.registration === 'removed' && phase !== 'complete')) throw fail('operation-mismatch');
  this.#receipts.set(operationId, { requestMac: receipt.requestMac, outcome: Object.freeze({ ...receipt.outcome, credentialCleanup: phase }) });
 }
 /** Activation follows commit; changing its phase never erases committed registration truth. */
 activation(operationId: string, revision: string, phase: 'active' | 'failed'): void {
  this.#active(); const receipt = this.#receipts.get(operationId);
  if (!receipt || receipt.outcome.revision !== revision || receipt.outcome.registration === 'removed') throw fail('operation-mismatch');
  this.#receipts.set(operationId, { requestMac: receipt.requestMac, outcome: Object.freeze({ ...receipt.outcome, activation: phase }) });
 }
 close(): void { this.#closed = true; this.#ports.key.fill(0); this.#issued.clear(); this.#receipts.clear(); this.#inflight.clear(); }
}
