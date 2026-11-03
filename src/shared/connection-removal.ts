/** Pure sc6 presentation. Authentication, ticket issuance and cleanup stay in daemon owners. */
import type { ConnectionKey, ManagementErrorCode, OperationStatus, OperationTicket, RemovalState } from './connection-management.js';
import { ManagementInputError, parseConnectionKey, parseRemovalStateRequest } from './connection-management-wire.js';

export interface RemovalSelection { readonly key: ConnectionKey; readonly expectedRevision: string }
export interface RemovalConfirmation extends RemovalSelection {
 readonly action: 'Delete' | 'Discard';
 readonly message: string;
}

/** Capture the selected generation before asking the user; no operation exists yet. */
export function removalConfirmation(key: ConnectionKey, expectedRevision: string): RemovalConfirmation {
 parseConnectionKey(key);
 if (!expectedRevision || expectedRevision.length > 16384 || /[\u0000-\u001f]/.test(expectedRevision)) throw new ManagementInputError();
 return Object.freeze({key:Object.freeze({...key}),expectedRevision,
  action:key.scope === 'saved' ? 'Delete' : 'Discard',
  message:key.scope === 'saved'
   ? 'Delete this saved registration and its obsolete application-owned credentials. Source files, databases, tables and remote data will be preserved.'
   : 'Discard this temporary registration and release its application-owned resources. Source files, databases, tables and remote data will be preserved.'});
}

/** Cancellation produces no command; confirmation returns only the captured selection. */
export function removalDecision(confirmation: RemovalConfirmation, decision: 'confirm' | 'cancel'): RemovalSelection | undefined {
 return decision === 'confirm' ? {key:{...confirmation.key},expectedRevision:confirmation.expectedRevision} : undefined;
}

function stateFor(ticket: OperationTicket, state: RemovalState['state'], safeMessage: string): RemovalState {
 parseRemovalStateRequest({ticket});
 return {key:{repoRoot:ticket.lookupRoot,scope:ticket.scope,id:ticket.connectionId},operationId:ticket.operationId,state,safeMessage};
}

export function removalInProgress(ticket: OperationTicket): RemovalState {
 return stateFor(ticket,'removing','Removing the connection registration.');
}

/** Only verified operation status is input here. An absent row is never evidence of removal. */
export function projectRemovalState(ticket: OperationTicket, status: OperationStatus, resourceCleanup: 'complete' | 'pending' = 'pending'): RemovalState {
 const unknown=stateFor(ticket,'unknown','The removal outcome is unknown. Reconcile using the same operation.');
 if (status.status !== 'committed') return unknown;
 const outcome=status.value;
 if (outcome.operationId !== ticket.operationId || outcome.registration !== 'removed' || outcome.activation !== 'not-applicable') throw new ManagementInputError('operation-mismatch');
 const pending=outcome.credentialCleanup !== 'complete' || resourceCleanup !== 'complete';
 return {...unknown,state:pending ? 'removed-cleanup-pending' : 'removed',
  safeMessage:pending ? 'The registration was removed. Application-owned cleanup is pending.' : 'The registration was removed. Source data was preserved.',
  credentialCleanup:outcome.credentialCleanup,resourceCleanup};
}

/** Never expose an SDK/transport exception or infer success from not-found. */
export function projectRemovalRejection(ticket: OperationTicket, code: ManagementErrorCode): RemovalState {
 if (code === 'busy') return stateFor(ticket,'busy','The connection is currently in use. Retry after the current work finishes.');
 if (code === 'conflict') return stateFor(ticket,'conflict','The connection revision changed. Refresh before confirming removal again.');
 return stateFor(ticket,'unknown','The removal outcome is unknown. Reconcile using the same operation.');
}
