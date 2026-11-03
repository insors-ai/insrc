/** Strict temporary management decoding; mutation publication stays daemon memory only. */
import type { ConnectionKey, MutationRequest, OperationTicket, RemovalState, OperationStatus } from '../../shared/connection-management.js';
import { parseConnectionKey, parseMutationRequest, parseOperationTicket, parseSessionOpen, parseRemovalStateRequest, ManagementInputError } from '../../shared/connection-management-wire.js';
import { projectRemovalState } from '../../shared/connection-removal.js';
import type { TemporaryConnectionOverlay } from './session-entries.js';
import type { SessionOperationLedger } from './session-ledger.js';
import type { TrustedConnectionSession } from '../request-context.js';
import { canonicalRequestJson } from './management-tickets.js';
import { ManagementServiceError } from './management.js';
/** Supplied only by the existing trusted session owner, never decoded from caller JSON. */
export interface TemporaryRemovalOwner {
 readonly binding: TrustedConnectionSession;
 readonly overlay: TemporaryConnectionOverlay;
 readonly ledger: SessionOperationLedger;
 readonly assertRequest: () => void;
}
function assertRemovalOwner(owner: TemporaryRemovalOwner): void {
 owner.binding.assertActive();owner.assertRequest();
 if(owner.binding.signal.aborted)throw new ManagementServiceError('session-expired');
 if(owner.binding.audience!=='workbench-ui')throw new ManagementServiceError('upgrade-required');
}
function removalStatus(owner: TemporaryRemovalOwner, value: OperationTicket): {ticket: OperationTicket; status: OperationStatus} {
 assertRemovalOwner(owner);
 const ticket=Object.freeze(structuredClone(parseRemovalStateRequest({ticket:value}).ticket));
 if(ticket.scope!=='temporary'||ticket.lookupRoot!==owner.binding.access.lookupRoot)throw new ManagementServiceError('operation-mismatch');
 const status=owner.ledger.status(ticket);assertRemovalOwner(owner);return{ticket,status};
}
export function temporaryRemovalState(owner: TemporaryRemovalOwner, value: OperationTicket): RemovalState {
 const {ticket,status}=removalStatus(owner,value);
 const phase=status.status==='committed'&&owner.overlay.removalCleanupPending(status.value.revision)?'pending':'complete';
 assertRemovalOwner(owner);return projectRemovalState(ticket,status,phase);
}
export async function retryTemporaryRemovalCleanup(owner: TemporaryRemovalOwner, value: OperationTicket): Promise<RemovalState> {
 const {ticket,status}=removalStatus(owner,value);
 if(status.status!=='committed')return projectRemovalState(ticket,status);
 // The revision comes from this owner's verified receipt, never from a cleanup selector on the wire.
 // Validate the removal phases before touching any cleanup handle.
 projectRemovalState(ticket,status,'pending');
 try{await owner.overlay.retryRemovalCleanup(status.value.revision);}catch{assertRemovalOwner(owner);}
 assertRemovalOwner(owner);return temporaryRemovalState(owner,ticket);
}
export const TEMPORARY_MANAGEMENT_METHODS: ReadonlySet<string> = new Set(['db.connections.v2.list', 'db.connections.v2.ticket', 'db.connections.v2.mutate', 'db.connections.v2.status', 'db.connections.v2.read', 'db.connections.v2.activate', 'db.connections.v2.removalState', 'db.connections.v2.retryRemovalCleanup']);
export type TemporaryManagementCommand =
	| { readonly method: 'db.connections.v2.list'; readonly root: string }
 | { readonly method: 'db.connections.v2.activate'; readonly root: string; readonly key: ConnectionKey; readonly revision: string }
 | { readonly method: 'db.connections.v2.ticket'; readonly root: string; readonly key: ConnectionKey; readonly mode: 'create' | 'update' | 'remove' }
 | { readonly method: 'db.connections.v2.read'; readonly root: string; readonly key: ConnectionKey }
 | { readonly method: 'db.connections.v2.removalState'; readonly root: string; readonly ticket: OperationTicket }
 | { readonly method: 'db.connections.v2.retryRemovalCleanup'; readonly root: string; readonly ticket: OperationTicket }
 | { readonly method: 'db.connections.v2.status'; readonly root: string; readonly ticket: OperationTicket }
 | { readonly method: 'db.connections.v2.mutate'; readonly root: string; readonly request: MutationRequest };
export function parseTemporaryManagement(method: string, value: unknown): TemporaryManagementCommand {
 const params = JSON.parse(canonicalRequestJson(value)) as unknown;
 if (params === null || typeof params !== 'object' || Array.isArray(params)) throw new ManagementInputError();
 const p = params as Record<string, unknown>;
 const exact = (fields: readonly string[]) => { if (Object.keys(p).length !== fields.length || fields.some(key => !Object.hasOwn(p, key))) throw new ManagementInputError(); };
	if (method === 'db.connections.v2.list') return { method, root: parseSessionOpen(params).repoRoot };
 if (method === 'db.connections.v2.mutate') {
  const request = parseMutationRequest(params);
  if (request.key.scope !== 'temporary') throw new ManagementServiceError('upgrade-required');
  return { method, root: request.key.repoRoot, request };
 }
 if (method === 'db.connections.v2.removalState' || method === 'db.connections.v2.retryRemovalCleanup') {
  const {ticket}=parseRemovalStateRequest(params);
  if(ticket.scope!=='temporary')throw new ManagementServiceError('upgrade-required');
  return {method,root:ticket.lookupRoot,ticket};
 }
 if (method === 'db.connections.v2.status') {
  exact(['ticket']); const ticket = parseOperationTicket(p['ticket']);
  if (ticket.scope !== 'temporary') throw new ManagementServiceError('upgrade-required');
  return { method, root: ticket.lookupRoot, ticket };
 }
 if (method === 'db.connections.v2.activate') {
  exact(['key', 'committedRevision']); const key = parseConnectionKey(p['key']);
  if (key.scope !== 'temporary') throw new ManagementServiceError('upgrade-required');
  if (typeof p['committedRevision'] !== 'string' || !p['committedRevision'] || p['committedRevision'].length > 16384) throw new ManagementInputError();
  return { method, root: key.repoRoot, key, revision: p['committedRevision'] };
 }
 if (method === 'db.connections.v2.ticket' || method === 'db.connections.v2.read') {
  exact(method.endsWith('ticket') ? ['key', 'mode'] : ['key']); const key = parseConnectionKey(p['key']);
  if (key.scope !== 'temporary') throw new ManagementServiceError('upgrade-required');
  if (method === 'db.connections.v2.read') return { method, root: key.repoRoot, key };
  if (p['mode'] !== 'create' && p['mode'] !== 'update' && p['mode'] !== 'remove') throw new ManagementInputError();
  return { method, root: key.repoRoot, key, mode: p['mode'] };
 }
 throw new ManagementServiceError('upgrade-required');
}
