/** S4 trust boundary. These decoders do not open stores or infer process exit. */
import { posix, win32 } from 'node:path';
import { InstallerError, MAX_CONTROL_BYTES } from './contracts.js';
import type { InstallationLocation } from './contracts.js';
import { assertRelativeFile, assertToken } from './location.js';
import { parseInstaller } from './schemas.js';
import type { DaemonIdentity, LaunchAdmission, MigrationExitReceipt, MigrationExitReceiptIdentity, ReadyEvidence, ShutdownAccepted, ShutdownCompletion, ShutdownRequest } from './peer-contracts.js';

function invalid(): never { throw new InstallerError('lifecycle-evidence-invalid', 'Lifecycle evidence has an invalid shape or does not match the expected session'); }
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid();
  let bytes: string | undefined;
  try { bytes = JSON.stringify(input); } catch { invalid(); }
  if (!bytes || Buffer.byteLength(bytes) > MAX_CONTROL_BYTES || Object.keys(input).sort().join(',') !== [...keys].sort().join(',')) invalid();
  return input as Record<string, unknown>;
}
function token(value: unknown): string {
  if (typeof value !== 'string') invalid();
  // A controller token may become a filename on any supported platform.
  assertToken(value); assertRelativeFile(value); return value;
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) invalid();
  return value;
}
function mode(value: unknown): ShutdownRequest['mode'] {
  if (value !== 'graceful' && value !== 'immediate') invalid(); return value;
}
function match(actual: object, expected: object): void {
  for (const key of Object.keys(expected)) if (Reflect.get(actual, key) !== Reflect.get(expected, key)) invalid();
}

export function parseDaemonIdentity(input: unknown, expected: Pick<DaemonIdentity, 'installationId'> & Partial<Pick<DaemonIdentity, 'releaseId' | 'instanceId'>>): DaemonIdentity {
  const v = record(input, ['instanceId', 'installationId', 'releaseId', 'protocolVersion', 'state']);
  if (v['protocolVersion'] !== 1 || (v['state'] !== 'ready' && v['state'] !== 'draining' && v['state'] !== 'migration-blocked')) invalid();
  const value: DaemonIdentity = { instanceId: token(v['instanceId']), installationId: token(v['installationId']), releaseId: token(v['releaseId']), protocolVersion: 1, state: v['state'] as DaemonIdentity['state'] };
  if (value.installationId !== expected.installationId || (expected.releaseId !== undefined && value.releaseId !== expected.releaseId)
    || (expected.instanceId !== undefined && value.instanceId !== expected.instanceId)) invalid();
  return Object.freeze(value);
}

/** Completion endpoints use the existing manager's short per-request namespace. */
export function assertShutdownEndpoint(location: InstallationLocation, address: string, nonce: string): void {
  parseInstaller('location', location); digest(nonce);
  if (location.daemonEndpoint.kind === 'named-pipe') {
    if (address !== `${location.daemonEndpoint.address}-${nonce.slice(0, 16)}`) invalid();
  } else if (posix.dirname(address) !== location.home || !/^s[A-Za-z0-9_-]{10}$/.test(posix.basename(address))
    || posix.join(location.home, posix.basename(address)) !== address || Buffer.byteLength(address) > (process.platform === 'darwin' ? 103 : 107)) invalid();
}

export function parseShutdownRequest(input: unknown, location: InstallationLocation, identity: DaemonIdentity, active?: ShutdownRequest): ShutdownRequest {
  const v = record(input, ['operationId', 'expectedInstanceId', 'mode', 'completionEndpoint', 'completionNonce']);
  if (typeof v['completionEndpoint'] !== 'string') invalid();
  const value: ShutdownRequest = { operationId: token(v['operationId']), expectedInstanceId: token(v['expectedInstanceId']), mode: mode(v['mode']), completionEndpoint: v['completionEndpoint'], completionNonce: digest(v['completionNonce']) };
  if (identity.installationId !== location.installationId || value.expectedInstanceId !== identity.instanceId) invalid();
  assertShutdownEndpoint(location, value.completionEndpoint, value.completionNonce);
  if (active) {
    match(value, { operationId: active.operationId, expectedInstanceId: active.expectedInstanceId, completionEndpoint: active.completionEndpoint, completionNonce: active.completionNonce });
    if (active.mode === 'immediate' && value.mode !== 'immediate') invalid();
  }
  return Object.freeze(value);
}

export function parseShutdownAccepted(input: unknown, expected: ShutdownRequest): ShutdownAccepted {
  const v = record(input, ['operationId', 'instanceId', 'accepted', 'mode']);
  if (v['accepted'] !== true) invalid();
  const value: ShutdownAccepted = { operationId: token(v['operationId']), instanceId: token(v['instanceId']), accepted: true, mode: mode(v['mode']) };
  match(value, { operationId: expected.operationId, instanceId: expected.expectedInstanceId, mode: expected.mode }); return Object.freeze(value);
}

export function parseShutdownCompletion(input: unknown, expected: ShutdownRequest): ShutdownCompletion {
  const v = record(input, ['operationId', 'instanceId', 'completionNonce', 'resourceOwnershipReleased']);
  if (v['resourceOwnershipReleased'] !== true) invalid();
  const value: ShutdownCompletion = { operationId: token(v['operationId']), instanceId: token(v['instanceId']), completionNonce: digest(v['completionNonce']), resourceOwnershipReleased: true };
  match(value, { operationId: expected.operationId, instanceId: expected.expectedInstanceId, completionNonce: expected.completionNonce }); return Object.freeze(value);
}

const identityKeys = ['installationId', 'operationId', 'candidateReleaseId', 'candidateInventorySha256', 'sessionId', 'childInstanceId', 'completionNonce'] as const;
function receiptIdentity(v: Record<string, unknown>): MigrationExitReceiptIdentity {
  return { installationId: token(v['installationId']), operationId: token(v['operationId']), candidateReleaseId: token(v['candidateReleaseId']), candidateInventorySha256: digest(v['candidateInventorySha256']), sessionId: token(v['sessionId']), childInstanceId: token(v['childInstanceId']), completionNonce: digest(v['completionNonce']) };
}
export function migrationReceiptPath(location: InstallationLocation, identity: MigrationExitReceiptIdentity): string {
  parseInstaller('location', location);
  const value = receiptIdentity(identity as unknown as Record<string, unknown>);
  if (value.installationId !== location.installationId) invalid();
  const path = location.daemonEndpoint.kind === 'named-pipe' ? win32 : posix;
  return path.join(location.home, 'install', 'receipts', value.operationId, `${value.sessionId}.json`);
}

export function parseLaunchAdmission(input: unknown, location: InstallationLocation, expected: LaunchAdmission): LaunchAdmission {
  const v = record(input, [...identityKeys, 'schemaVersion', 'purpose', 'ownerNonce', 'controllerRevision', 'receiptPath']);
  if (v['schemaVersion'] !== 1 || (v['purpose'] !== 'migration' && v['purpose'] !== 'activation')
    || !Number.isSafeInteger(v['controllerRevision']) || (v['controllerRevision'] as number) < 1 || typeof v['receiptPath'] !== 'string') invalid();
  const identity = receiptIdentity(v);
  const value: LaunchAdmission = { ...identity, schemaVersion: 1, purpose: v['purpose'], ownerNonce: digest(v['ownerNonce']), controllerRevision: v['controllerRevision'] as number, receiptPath: v['receiptPath'] };
  if (value.receiptPath !== migrationReceiptPath(location, identity)) invalid();
  match(value, { ...receiptIdentity(expected as unknown as Record<string, unknown>), schemaVersion: expected.schemaVersion, purpose: expected.purpose,
    ownerNonce: expected.ownerNonce, controllerRevision: expected.controllerRevision, receiptPath: expected.receiptPath });
  return Object.freeze(value);
}

export function parseMigrationExitReceipt(input: unknown, expected: MigrationExitReceiptIdentity): MigrationExitReceipt {
  const v = record(input, [...identityKeys, 'schemaVersion', 'purpose', 'exitCode', 'signal']);
  if (v['schemaVersion'] !== 1 || v['purpose'] !== 'migration'
    || (v['exitCode'] !== null && (!Number.isInteger(v['exitCode']) || (v['exitCode'] as number) < 0 || (v['exitCode'] as number) > 0xffffffff))
    || (v['signal'] !== null && (typeof v['signal'] !== 'string' || !/^SIG[A-Z0-9]{1,24}$/.test(v['signal'])))
    || (v['exitCode'] === null) === (v['signal'] === null)) invalid();
  const value: MigrationExitReceipt = { ...receiptIdentity(v), schemaVersion: 1, purpose: 'migration', exitCode: v['exitCode'] as number | null, signal: v['signal'] as string | null };
  match(value, receiptIdentity(expected as unknown as Record<string, unknown>)); return Object.freeze(value);
}

export function parseReadyEvidence(input: unknown, location: InstallationLocation, admission: LaunchAdmission): ReadyEvidence {
  parseLaunchAdmission(admission, location, admission);
  if (admission.purpose !== 'activation') invalid();
  const v = record(input, ['identity', 'endpoint', 'sessionId', 'completionNonce', 'candidateInventorySha256']);
  const endpoint = parseInstaller('endpoint', v['endpoint']);
  if (endpoint.kind !== location.daemonEndpoint.kind || endpoint.address !== location.daemonEndpoint.address || endpoint.installationId !== location.installationId) invalid();
  const value: ReadyEvidence = { identity: parseDaemonIdentity(v['identity'], { installationId: location.installationId, releaseId: admission.candidateReleaseId, instanceId: admission.childInstanceId }), endpoint: Object.freeze({ ...endpoint }), sessionId: token(v['sessionId']), completionNonce: digest(v['completionNonce']), candidateInventorySha256: digest(v['candidateInventorySha256']) };
  if (value.identity.state !== 'ready') invalid();
  match(value, { sessionId: admission.sessionId, completionNonce: admission.completionNonce, candidateInventorySha256: admission.candidateInventorySha256 }); return Object.freeze(value);
}
