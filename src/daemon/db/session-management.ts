/** Strict temporary management decoding; mutation publication stays daemon memory only. */
import type { ConnectionKey, MutationRequest, OperationTicket } from '../../shared/connection-management.js';
import { parseConnectionKey, parseMutationRequest, parseOperationTicket, ManagementInputError } from '../../shared/connection-management-wire.js';
import { canonicalRequestJson } from './management-tickets.js';
import { ManagementServiceError } from './management.js';
export const TEMPORARY_MANAGEMENT_METHODS: ReadonlySet<string> = new Set(['db.connections.v2.ticket', 'db.connections.v2.mutate', 'db.connections.v2.status', 'db.connections.v2.read']);
export type TemporaryManagementCommand =
 | { readonly method: 'db.connections.v2.ticket'; readonly root: string; readonly key: ConnectionKey; readonly mode: 'create' | 'update' }
 | { readonly method: 'db.connections.v2.read'; readonly root: string; readonly key: ConnectionKey }
 | { readonly method: 'db.connections.v2.status'; readonly root: string; readonly ticket: OperationTicket }
 | { readonly method: 'db.connections.v2.mutate'; readonly root: string; readonly request: MutationRequest };
export function parseTemporaryManagement(method: string, value: unknown): TemporaryManagementCommand {
 const params = JSON.parse(canonicalRequestJson(value)) as unknown;
 if (params === null || typeof params !== 'object' || Array.isArray(params)) throw new ManagementInputError();
 const p = params as Record<string, unknown>;
 const exact = (fields: readonly string[]) => { if (Object.keys(p).length !== fields.length || fields.some(key => !Object.hasOwn(p, key))) throw new ManagementInputError(); };
 if (method === 'db.connections.v2.mutate') {
  const request = parseMutationRequest(params);
  if (request.key.scope !== 'temporary' || request.mode === 'remove') throw new ManagementServiceError('upgrade-required');
  return { method, root: request.key.repoRoot, request };
 }
 if (method === 'db.connections.v2.status') {
  exact(['ticket']); const ticket = parseOperationTicket(p['ticket']);
  if (ticket.scope !== 'temporary') throw new ManagementServiceError('upgrade-required');
  return { method, root: ticket.lookupRoot, ticket };
 }
 if (method === 'db.connections.v2.ticket' || method === 'db.connections.v2.read') {
  exact(method.endsWith('ticket') ? ['key', 'mode'] : ['key']); const key = parseConnectionKey(p['key']);
  if (key.scope !== 'temporary') throw new ManagementServiceError('upgrade-required');
  if (method === 'db.connections.v2.read') return { method, root: key.repoRoot, key };
  if (p['mode'] !== 'create' && p['mode'] !== 'update') throw new ManagementInputError();
  return { method, root: key.repoRoot, key, mode: p['mode'] };
 }
 throw new ManagementServiceError('upgrade-required');
}
