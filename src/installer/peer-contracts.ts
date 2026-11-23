/** Required ports, implemented by their owning stories. No app/runtime imports. */
import type { DependencyDecision, DependencyReport, Delivery, InstallationLocation, LocalEndpoint, MigrationContext, ReleaseManifest } from './contracts.js';
import type { PreparedCandidate, PreparationLease } from './bundle.js';
export interface DaemonIdentity { instanceId: string; installationId: string; releaseId: string; protocolVersion: 1; state: 'ready' | 'draining' | 'migration-blocked' }
export interface ShutdownRequest { operationId: string; expectedInstanceId: string; mode: 'graceful' | 'immediate'; completionEndpoint: string; completionNonce: string }
export interface ShutdownAccepted { operationId: string; instanceId: string; accepted: true; mode: 'graceful' | 'immediate' }
export interface ShutdownCompletion { operationId: string; instanceId: string; completionNonce: string; resourceOwnershipReleased: true }
export interface MigrationExitReceiptIdentity { installationId: string; operationId: string; candidateReleaseId: string; candidateInventorySha256: string; sessionId: string; childInstanceId: string; completionNonce: string }
export interface MigrationExitReceipt extends MigrationExitReceiptIdentity { schemaVersion: 1; purpose: 'migration'; exitCode: number | null; signal: string | null }
/** Internal manager admission, not a change to OperationRecord's wire contract. */
export interface LaunchAdmission extends MigrationExitReceiptIdentity {
  schemaVersion: 1; purpose: 'migration' | 'activation'; ownerNonce: string; controllerRevision: number; receiptPath: string;
}
export interface ReadyEvidence { identity: DaemonIdentity; endpoint: LocalEndpoint; sessionId: string; completionNonce: string; candidateInventorySha256: string }
export type DaemonObservation = { state: 'present'; identity: DaemonIdentity; endpoint: LocalEndpoint }
  | { state: 'absent'; resourceOwnershipReleased: true; evidence: { kind: 'never-started' } | { kind: 'observed-exit'; identity: DaemonIdentity } } | { state: 'uncertain' };
export interface DeliveryPort {
  resolve(delivery: Delivery): Promise<PreparedReleaseOffer>;
  prepare(store: PreparationLease, offer: PreparedReleaseOffer): Promise<PreparedCandidate>;
  open(location: InstallationLocation, releaseId: string): Promise<PreparedCandidate>;
  verify(candidate: PreparedCandidate, location: InstallationLocation): Promise<void>;
}
export interface PreparedReleaseOffer { manifest: ReleaseManifest; descriptorSha256: string }
export interface DependencyPort {
  inspect(location: InstallationLocation): Promise<DependencyReport>;
  decide(location: InstallationLocation, decision: DependencyDecision): Promise<DependencyReport>;
}
export interface LifecyclePort {
  observe(location: InstallationLocation): Promise<DaemonObservation>;
  shutdown(location: InstallationLocation, request: ShutdownRequest): Promise<ShutdownAccepted>;
  waitShutdownCompletion(location: InstallationLocation, request: ShutdownRequest): Promise<ShutdownCompletion>;
  reconcileShutdown(location: InstallationLocation, request: ShutdownRequest): Promise<ShutdownCompletion | undefined>;
  launchMigration(candidate: PreparedCandidate, admission: LaunchAdmission, assertLiveOwner: () => void): Promise<void>;
  readMigrationExitReceipt(expected: MigrationExitReceiptIdentity): Promise<MigrationExitReceipt>;
  migrationOwnership(expected: MigrationExitReceiptIdentity): Promise<'released' | 'held' | 'unknown'>;
  activate(candidate: PreparedCandidate, admission: LaunchAdmission, assertLiveOwner: () => void): Promise<ReadyEvidence>;
  reconcileActivation(candidate: PreparedCandidate, admission: LaunchAdmission): Promise<ReadyEvidence | undefined>;
}
export interface MigrationEvidence { installationId: string; operationId: string; candidateReleaseId: string; candidateInventorySha256: string; sessionId: string; validated: boolean; hooks: Array<{ id: string; version: string; passed: boolean }> }
export interface MigrationPort {
  waitForJournal(candidate: PreparedCandidate, admission: LaunchAdmission): Promise<MigrationEvidence>;
  reconcileJournal(candidate: PreparedCandidate, admission: LaunchAdmission): Promise<MigrationEvidence>;
  allowRetry(candidate: PreparedCandidate, admission: LaunchAdmission): Promise<boolean>;
  verifyInstalled(candidate: PreparedCandidate, context: MigrationContext): Promise<boolean>;
}
export interface ManagerPeers { bundle?: DeliveryPort | undefined; dev?: DeliveryPort | undefined; dependencies?: DependencyPort | undefined; lifecycle?: LifecyclePort | undefined; migrations?: MigrationPort | undefined }
