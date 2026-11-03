/** V2 wire contracts. Raw saved configuration and credentials stay daemon-internal. */
import type { ConnectionConfig, Driver, DriverFamily } from './db-driver.js';

export type ConnectionScope = 'saved' | 'temporary';
export interface SessionResume { readonly sessionHandle: string; readonly capability: string; readonly daemonEpoch: string }
export interface OpenConnectionSessionResult extends SessionResume { readonly heartbeatMs: 30000; readonly leaseMs: 90000 }
export type ConnectionSessionAudience = 'workbench-ui' | 'mcp-unverified';
export interface SessionDataAttach extends SessionResume { readonly repoRoot: string }
export interface SessionOpen { readonly repoRoot: string }
export interface SessionDelegate { readonly repoRoot: string; readonly audience: ConnectionSessionAudience }
export const CONNECTION_SESSION_METHODS = [
 'db.connections.v2.session.open', 'db.connections.v2.session.resume', 'db.connections.v2.session.attach',
 'db.connections.v2.session.delegate', 'db.connections.v2.session.heartbeat', 'db.connections.v2.session.end',
] as const;
export type ConnectionSessionMethod = typeof CONNECTION_SESSION_METHODS[number];
export interface ConnectionKey { readonly repoRoot: string; readonly scope: ConnectionScope; readonly id: string }
export type CredentialPatch = { readonly action: 'keep' } | { readonly action: 'replace'; readonly value: string } | { readonly action: 'clear' };
export interface DraftTestRequest {
 readonly requestId: string; readonly draftRevision: number; readonly key: ConnectionKey;
 readonly expectedRevision?: string | undefined; readonly publicPatch: Readonly<Record<string, unknown>>;
 readonly credentials: Readonly<Record<string, CredentialPatch>>;
}
export interface DraftTestResult {
 readonly requestId: string; readonly draftRevision: number; readonly repoRoot: string; readonly daemonEpoch: string;
 readonly status: 'reachable' | 'failed' | 'timeout' | 'canceled'; readonly tookMs: number;
 readonly safeMessage?: string | undefined;
}
export interface TestCancellation { readonly requestId: string }
export interface SafeConnection {
 readonly key: ConnectionKey; readonly revision: string; readonly kind: string; readonly family: DriverFamily;
 readonly label?: string | undefined; readonly publicConfig: Readonly<Record<string, unknown>>;
 readonly declaredFamily?: DriverFamily | undefined; readonly registeredFamily?: DriverFamily | undefined;
 readonly effectiveFamily: DriverFamily; readonly compatibilityWarning?: string | undefined; readonly readOnly?: boolean | undefined;
 readonly credentialPresence: Readonly<Record<string, boolean>>;
 readonly hasUrl?: boolean | undefined; readonly hasPath?: boolean | undefined; readonly ephemeral?: true | undefined;
}
export interface DriverDescriptor {
 readonly kind: string; readonly family: DriverFamily;
 readonly publicInputSchema: Readonly<Record<string, unknown>>; readonly secretSlots: readonly string[];
}
export interface ManagementCapabilities {
 readonly version: 2; readonly daemonEpoch: string; readonly features: readonly string[]; readonly receiptRetentionDays: 30;
}
export interface OperationTicket {
 readonly operationId: string; readonly lookupRoot: string; readonly scope: ConnectionScope;
 readonly connectionId: string; readonly mode: 'create' | 'update' | 'remove';
 readonly issuedAt: string; readonly expiresAt: string; readonly signature: string;
}
export interface MutationRequest {
 readonly ticket: OperationTicket; readonly operationId: string; readonly key: ConnectionKey;
 readonly mode: OperationTicket['mode']; readonly expectedRevision?: string | undefined;
 readonly publicPatch?: Readonly<Record<string, unknown>> | undefined;
 readonly credentials?: Readonly<Record<string, CredentialPatch>> | undefined;
}
export type ManagementErrorCode = 'invalid-input' | 'duplicate-id' | 'conflict' | 'not-found' | 'busy'
 | 'registry-unreadable' | 'secret-unavailable' | 'recovery-required' | 'session-expired' | 'upgrade-required'
 | 'operation-mismatch' | 'reconciliation-required' | 'resource-limit' | 'unsupported-temporary';
export interface CommittedOutcome {
 readonly operationId: string; readonly revision: string; readonly registration: 'persisted' | 'session-added' | 'removed';
 readonly activation: 'active' | 'pending' | 'failed' | 'not-applicable'; readonly credentialCleanup: 'complete' | 'pending';
}
export type MutationOutcome = { readonly status: 'committed'; readonly value: CommittedOutcome }
 | { readonly status: 'rejected'; readonly code: ManagementErrorCode; readonly message: string };
export interface OperationStatusRequest { readonly ticket: OperationTicket }
/** sc6 projections only; these fields never extend persisted sc2 receipts. */
export interface RemovalState {
 readonly key: ConnectionKey; readonly operationId: string;
 readonly state: 'confirming' | 'removing' | 'busy' | 'conflict' | 'unknown' | 'removed-cleanup-pending' | 'removed';
 readonly safeMessage?: string | undefined;
 readonly credentialCleanup?: 'complete' | 'pending' | undefined;
 readonly resourceCleanup?: 'complete' | 'pending' | undefined;
}
export type RemovalStateRequest = OperationStatusRequest;
export type RemovalCleanupRetry = RemovalStateRequest;
export type OperationStatus = { readonly status: 'committed'; readonly value: CommittedOutcome }
 | { readonly status: 'pending' | 'not-seen' | 'reconciliation-required' };
export interface ActivationRetry { readonly key: ConnectionKey; readonly committedRevision: string }
export interface CommittedReceipt {
 readonly ticket: OperationTicket; readonly requestMac: string; readonly outcome: CommittedOutcome; readonly cleanupRefs: readonly string[];
}
export interface ManagementEnvelope {
 readonly version: 2; readonly registryId: string; readonly generation: string;
 readonly revisions: Readonly<Record<string, string>>; readonly receipts: Readonly<Record<string, CommittedReceipt>>;
}
export interface PreparationRecord {
 readonly operationId: string; readonly registryId: string; readonly expectedGeneration: string;
 readonly ownedStagedRefs: readonly string[]; readonly phase: 'prepared' | 'commit-uncertain' | 'cleanup-pending';
}
export interface ConnectionAccessContext {
 readonly lookupRoot: string; readonly managementRepoRoot?: string | undefined;
 readonly daemonEpoch: string; readonly sessionHandle?: string | undefined;
}
/** This context is provided by server transport, never deserialized from a draft. */
export interface ManagementRequestContext { readonly connectionIdentity: string; readonly access: ConnectionAccessContext }
export interface ConnectionLease { readonly key: ConnectionKey; readonly revision: string; retainWork?(work: Promise<unknown>): void; release(): Promise<void> }
export interface ConnectionResolver {
 list(context: ConnectionAccessContext): Promise<readonly SafeConnection[]>;
 lease(context: ConnectionAccessContext, id: string): Promise<ConnectionLease>;
 withConnection<T>(context: ConnectionAccessContext, id: string, use: (driver: Driver) => Promise<T>): Promise<T>;
}
export interface LeaseState { readonly active: number; readonly revision: string; readonly barrier: 'none' | 'update' | 'remove' }
export interface EffectiveDraft {
 readonly config: ConnectionConfig; readonly expectedRevision?: string | undefined;
 readonly credentialActions: Readonly<Record<string, CredentialPatch>>;
}
export interface FileExecutionIdentity {
 readonly lookupRoot: string; readonly ownerId: string; readonly connectionId: string; readonly revision: string;
 readonly sourceIdentity: string; readonly converterOptionsDigest: string;
}
export interface FileExecutionPolicy {
 readonly identity: FileExecutionIdentity; readonly persistence: 'saved-cache' | 'memory-only';
 readonly memoryBudgetBytes: number; readonly allowSpill: false;
}
export interface FileExecutionResource { close(): Promise<void> }
export interface FileExecutionFactory { open(policy: FileExecutionPolicy): Promise<FileExecutionResource> }
export interface ConvertedColumn {
 readonly name: string; readonly logicalType: string; readonly physicalType: string;
 readonly nullable: boolean; readonly normalization: string;
}
export interface ConvertedTarget {
 readonly targetId: string; readonly sourceIdentity: string; readonly worksheetName?: string | undefined;
 readonly worksheetSlug?: string | undefined; readonly columns: readonly ConvertedColumn[];
}
export interface ConvertedBatch {
 readonly targetId: string; readonly schemaVersion: string;
 readonly rows: readonly Readonly<Record<string, unknown>>[]; readonly byteSize: number;
}
export interface MemoryRowSource {
 targets(): Promise<readonly ConvertedTarget[]>;
 describe(target?: string | undefined): Promise<readonly ConvertedTarget[]>;
 batches(target?: string | undefined, signal?: AbortSignal | undefined): AsyncIterable<ConvertedBatch>;
 close(): Promise<void>;
}
