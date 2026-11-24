/** Private preparation protocol. This module has no process or controller authority. */
import { Ajv } from 'ajv';
import { InstallerError } from './contracts.js';
import { devHashSchema, devNonceSchema, devObjectSchema, devPreparationSchema, devTokenSchema, parseDevPreparation, parseDevRecord } from './dev.js';
import type { DevPreparationRecord } from './dev.js';

export interface DevPreparationResult {
  schemaVersion: 1; installationId: string; operationId: string; attemptId: string; workerNonce: string;
  sourceSha256: string; coordinatorRunId: string; outcome: 'prepared' | 'failed' | 'cancelled';
  cleanupSha256: string; inputFingerprint: string; outputFingerprint?: string | undefined; inventorySha256?: string | undefined;
}
export interface DevWorkerCancel { schemaVersion: 1; operationId: string; attemptId: string; workerNonce: string; kind: 'cancel' }
export interface DevWorkerLaunch { schemaVersion: 1; kind: 'prepare'; checkpoint: DevPreparationRecord }
const ajv = new Ajv({ strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const identity = { schemaVersion: { const: 1 }, operationId: devTokenSchema, attemptId: devTokenSchema, workerNonce: devNonceSchema };
const resultValidator = ajv.compile<DevPreparationResult>(devObjectSchema({ ...identity, installationId: devTokenSchema,
  sourceSha256: devHashSchema, coordinatorRunId: devTokenSchema, outcome: { enum: ['prepared', 'failed', 'cancelled'] },
  cleanupSha256: devHashSchema, inputFingerprint: devHashSchema, outputFingerprint: devHashSchema, inventorySha256: devHashSchema },
  [...Object.keys(identity), 'installationId', 'sourceSha256', 'coordinatorRunId', 'outcome', 'cleanupSha256', 'inputFingerprint']));
const cancelValidator = ajv.compile<DevWorkerCancel>(devObjectSchema({ ...identity, kind: { const: 'cancel' } }));
const launchValidator = ajv.compile<DevWorkerLaunch>(devObjectSchema({ schemaVersion: { const: 1 }, kind: { const: 'prepare' }, checkpoint: devPreparationSchema }));

function assertAttempt(value: Pick<DevWorkerCancel, 'operationId' | 'attemptId' | 'workerNonce'>, expected: DevPreparationRecord): void {
  if (value.operationId !== expected.operationId || value.attemptId !== expected.attemptId || value.workerNonce !== expected.workerNonce) {
    throw new InstallerError('identity-mismatch', 'Worker message belongs to another preparation attempt');
  }
}
export function parseDevWorkerCancel(input: unknown, expected: DevPreparationRecord): DevWorkerCancel {
  const value = parseDevRecord(cancelValidator, input); assertAttempt(value, parseDevPreparation(expected)); return value;
}
export function parseDevWorkerLaunch(input: unknown): DevWorkerLaunch {
  const value = parseDevRecord(launchValidator, input); value.checkpoint = parseDevPreparation(value.checkpoint);
  if (value.checkpoint.stage !== 'accepted') throw new InstallerError('schema-invalid', 'Only an accepted attempt can launch a preparation worker');
  return value;
}
export function parseDevPreparationResult(input: unknown, expected: DevPreparationRecord): DevPreparationResult {
  const value = parseDevRecord(resultValidator, input), checkpoint = parseDevPreparation(expected);
  assertAttempt(value, checkpoint);
  if (value.installationId !== checkpoint.installationId || value.sourceSha256 !== checkpoint.sourceOffer.sourceSha256
    || !checkpoint.coordinatorRunId || value.coordinatorRunId !== checkpoint.coordinatorRunId) throw new InstallerError('identity-mismatch', 'Worker result source or coordinator identity differs');
  if (value.outcome === 'prepared' && (!value.outputFingerprint || !value.inventorySha256)) throw new InstallerError('schema-invalid', 'Prepared result requires output and inventory fingerprints');
  return value;
}
