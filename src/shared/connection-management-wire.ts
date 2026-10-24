/** Structural wire validation only. Signature, registry rights and driver fields are daemon gates. */
import type { ConnectionKey, CredentialPatch, MutationRequest, OperationTicket } from './connection-management.js';

export class ManagementInputError extends Error {
 readonly code: 'invalid-input' | 'operation-mismatch';
 constructor(code: 'invalid-input' | 'operation-mismatch' = 'invalid-input') {
  super(code === 'invalid-input' ? 'Invalid connection request.' : 'Operation target does not match its ticket.');
  this.name = 'ManagementInputError'; this.code = code;
 }
}
function object(value: unknown): Record<string, unknown> {
 if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new ManagementInputError();
 return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
 if (required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) throw new ManagementInputError();
}
function text(value: unknown): asserts value is string {
 if (typeof value !== 'string' || value.length === 0 || value.length > 16384 || /[\u0000-\u001f]/.test(value)) throw new ManagementInputError();
}
function scope(value: unknown): void { if (value !== 'saved' && value !== 'temporary') throw new ManagementInputError(); }
function mode(value: unknown): void { if (typeof value !== 'string' || !['create','update','remove'].includes(value)) throw new ManagementInputError(); }
export function parseConnectionKey(value: unknown): ConnectionKey {
 const o = object(value); keys(o, ['repoRoot','scope','id']); text(o['repoRoot']); text(o['id']); scope(o['scope']);
 return value as ConnectionKey;
}
export function parseOperationTicket(value: unknown): OperationTicket {
 const o = object(value); keys(o, ['operationId','lookupRoot','scope','connectionId','mode','issuedAt','expiresAt','signature']);
 for (const k of ['operationId','lookupRoot','connectionId','issuedAt','expiresAt','signature']) text(o[k]);
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(o['operationId'] as string)) throw new ManagementInputError();
 scope(o['scope']); mode(o['mode']);
 for (const k of ['issuedAt','expiresAt']) {
  const stamp = o[k] as string;
  if (!Number.isFinite(Date.parse(stamp)) || new Date(stamp).toISOString() !== stamp) throw new ManagementInputError();
 }
 if (Date.parse(o['expiresAt'] as string) <= Date.parse(o['issuedAt'] as string)) throw new ManagementInputError();
 return value as OperationTicket;
}
export function parseCredentialPatch(value: unknown): CredentialPatch {
 const o = object(value);
 if (o['action'] === 'replace') { keys(o, ['action','value']); if (typeof o['value'] !== 'string') throw new ManagementInputError(); }
 else { keys(o, ['action']); if (o['action'] !== 'keep' && o['action'] !== 'clear') throw new ManagementInputError(); }
 return value as CredentialPatch;
}
export function assertTicketTarget(ticket: OperationTicket, key: ConnectionKey, requestMode: OperationTicket['mode'], operationId: string): void {
 if (ticket.operationId !== operationId || ticket.lookupRoot !== key.repoRoot || ticket.scope !== key.scope || ticket.connectionId !== key.id || ticket.mode !== requestMode) throw new ManagementInputError('operation-mismatch');
}
export function parseMutationRequest(value: unknown): MutationRequest {
 const o = object(value); keys(o, ['ticket','operationId','key','mode'], ['expectedRevision','publicPatch','credentials']);
 const ticket = parseOperationTicket(o['ticket']); const key = parseConnectionKey(o['key']); text(o['operationId']); mode(o['mode']);
 if (o['mode'] !== 'create') text(o['expectedRevision']);
 else if (Object.hasOwn(o,'expectedRevision')) throw new ManagementInputError();
 if (o['publicPatch'] !== undefined) object(o['publicPatch']);
 if (o['credentials'] !== undefined) for (const patch of Object.values(object(o['credentials']))) parseCredentialPatch(patch);
 if (o['mode'] === 'remove' && (o['publicPatch'] !== undefined || o['credentials'] !== undefined)) throw new ManagementInputError();
 assertTicketTarget(ticket, key, o['mode'] as OperationTicket['mode'], o['operationId']);
 return value as MutationRequest;
}
