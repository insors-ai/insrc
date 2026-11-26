import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posix } from 'node:path';
import { resolveInstallationLocation } from '../location.js';
import { assertShutdownEndpoint, migrationReceiptPath, parseDaemonIdentity, parseLaunchAdmission, parseMigrationExitReceipt, parseReadyEvidence, parseShutdownAccepted, parseShutdownCompletion, parseShutdownRequest } from '../lifecycle-evidence.js';
import type { DaemonIdentity, LaunchAdmission, MigrationExitReceipt, ShutdownRequest } from '../peer-contracts.js';

const location = resolveInstallationLocation('fixture', { home: '/private/fixture', os: 'darwin' });
const identity: DaemonIdentity = { installationId: 'fixture', releaseId: 'release', instanceId: 'child', protocolVersion: 1, state: 'ready' };
const request: ShutdownRequest = { operationId: 'operation', expectedInstanceId: 'child', mode: 'graceful', completionNonce: 'a'.repeat(64), completionEndpoint: posix.join(location.home, 's0123456789') };
const admission: LaunchAdmission = { schemaVersion: 1, purpose: 'migration', installationId: 'fixture', operationId: 'operation', candidateReleaseId: 'release', candidateInventorySha256: 'b'.repeat(64), sessionId: 'session', childInstanceId: 'child', completionNonce: 'a'.repeat(64), ownerNonce: 'c'.repeat(64), controllerRevision: 2, receiptPath: '/private/fixture/install/receipts/operation/session.json' };
const receipt: MigrationExitReceipt = { schemaVersion: 1, purpose: 'migration', installationId: admission.installationId, operationId: admission.operationId, candidateReleaseId: admission.candidateReleaseId, candidateInventorySha256: admission.candidateInventorySha256, sessionId: admission.sessionId, childInstanceId: admission.childInstanceId, completionNonce: admission.completionNonce, exitCode: 0, signal: null };

test('lifecycle decoding rejects wrong and stale identities while allowing exact duplicate and immediate requests', () => {
  assert.deepEqual(parseDaemonIdentity(identity, { installationId: 'fixture', releaseId: 'release', instanceId: 'child' }), identity);
  for (const change of [{ instanceId: 'old' }, { installationId: 'other' }, { releaseId: 'old' }, { protocolVersion: 2 }, { state: ['ready'] }, { extra: true }]) {
    assert.throws(() => parseDaemonIdentity({ ...identity, ...change }, identity));
  }
  const accepted = parseShutdownRequest(request, location, identity);
  assert.deepEqual(parseShutdownRequest(request, location, identity, accepted), request);
  const immediate = parseShutdownRequest({ ...request, mode: 'immediate' }, location, identity, accepted);
  assert.equal(immediate.mode, 'immediate');
  assert.throws(() => parseShutdownRequest(request, location, identity, immediate));
  for (const change of [{ expectedInstanceId: 'old' }, { operationId: 'other' }, { completionNonce: 'd'.repeat(64) }, { completionEndpoint: '/private/elsewhere/s0123456789' }, { mode: 'kill' }, { pid: 1 }]) {
    assert.throws(() => parseShutdownRequest({ ...request, ...change }, location, identity, accepted));
  }
  const input = { ...request };
  const copied = parseShutdownRequest(input, location, identity); input.completionNonce = 'd'.repeat(64);
  assert.equal(copied.completionNonce, request.completionNonce); assert.equal(Object.isFrozen(copied), true);
});

test('shutdown acknowledgement is distinct from exact operation instance and nonce completion', () => {
  const ack = { operationId: 'operation', instanceId: 'child', accepted: true, mode: 'graceful' };
  assert.deepEqual(parseShutdownAccepted(ack, request), ack);
  assert.throws(() => parseShutdownCompletion(ack, request));
  const completion = { operationId: 'operation', instanceId: 'child', completionNonce: request.completionNonce, resourceOwnershipReleased: true };
  assert.deepEqual(parseShutdownCompletion(completion, request), completion);
  for (const change of [{ operationId: 'old' }, { instanceId: 'old' }, { completionNonce: '0'.repeat(64) }, { resourceOwnershipReleased: false }, { pid: 123 }]) {
    assert.throws(() => parseShutdownCompletion({ ...completion, ...change }, request));
  }
  assert.throws(() => parseShutdownAccepted({ ...ack, mode: 'immediate' }, request));
  assert.throws(() => parseShutdownAccepted({ ...ack, accepted: 1 }, request));
});

test('admission and migration receipt decoding reject altered identity purpose digest path and exit shape', () => {
  assert.deepEqual(parseLaunchAdmission(admission, location, admission), admission);
  assert.deepEqual(parseMigrationExitReceipt(receipt, receipt), receipt);
  for (const key of ['installationId', 'operationId', 'candidateReleaseId', 'sessionId', 'childInstanceId'] as const) {
    assert.throws(() => parseMigrationExitReceipt({ ...receipt, [key]: 'other' }, receipt));
    assert.throws(() => parseLaunchAdmission({ ...admission, [key]: 'other' }, location, admission));
  }
  for (const change of [{ schemaVersion: 2 }, { purpose: 'activation' }, { candidateInventorySha256: 'd'.repeat(64) }, { completionNonce: 'd'.repeat(64) }, { extra: true }, { exitCode: 0, signal: 'SIGTERM' }, { exitCode: null, signal: null }, { exitCode: -1 }, { exitCode: 0.5 }, { exitCode: null, signal: 'not-a-signal' }]) {
    assert.throws(() => parseMigrationExitReceipt({ ...receipt, ...change }, receipt));
  }
  for (const change of [{ purpose: 'activation' }, { controllerRevision: 1 }, { ownerNonce: 'd'.repeat(64) }, { controllerRevision: 1.5 }, { controllerRevision: 0 }, { receiptPath: '/private/fixture/install/receipts/operation/../session.json' }, { receiptPath: '/private/elsewhere/session.json' }, { extra: true }]) {
    assert.throws(() => parseLaunchAdmission({ ...admission, ...change }, location, admission));
  }
  assert.throws(() => migrationReceiptPath(location, { ...receipt, sessionId: '../escape' }));
  assert.throws(() => migrationReceiptPath(location, { ...receipt, operationId: 'CON' }));
  assert.throws(() => parseMigrationExitReceipt('x'.repeat(70_000), receipt));
  assert.deepEqual(parseMigrationExitReceipt({ ...receipt, exitCode: null, signal: 'SIGTERM' }, receipt).signal, 'SIGTERM');
  // Exit decoding is identity evidence only, never hook-test success.
  assert.equal(parseMigrationExitReceipt({ ...receipt, exitCode: 1 }, receipt).exitCode, 1);
});

test('platform endpoint and receipt paths bind Unix and Windows installation identities', () => {
  assertShutdownEndpoint(location, request.completionEndpoint, request.completionNonce);
  for (const endpoint of ['/private/fixture/daemon.sock', '/private/fixture/../fixture/s0123456789', '/private/fixture/sub/s0123456789', '/private/fixture/sbad']) {
    assert.throws(() => assertShutdownEndpoint(location, endpoint, request.completionNonce));
  }
  const windows = resolveInstallationLocation('fixture', { os: 'win32', home: 'C:\\Insrc Test', userSid: 'S-1-5-21-123' });
  const expected = windows.daemonEndpoint.address + '-' + request.completionNonce.slice(0, 16);
  assertShutdownEndpoint(windows, expected, request.completionNonce);
  assert.throws(() => assertShutdownEndpoint(windows, expected + '-foreign', request.completionNonce));
  assert.throws(() => assertShutdownEndpoint(windows, '\\\\other\\pipe\\test', request.completionNonce));
  assert.equal(migrationReceiptPath(windows, receipt), 'C:\\Insrc Test\\install\\receipts\\operation\\session.json');
  const winAdmission = { ...admission, receiptPath: migrationReceiptPath(windows, receipt) };
  assert.deepEqual(parseLaunchAdmission(winAdmission, windows, winAdmission), winAdmission);
  assert.throws(() => parseLaunchAdmission({ ...winAdmission, receiptPath: 'C:\\outside\\session.json' }, windows, winAdmission));
});

test('ready evidence binds selected release endpoint session nonce inventory and ready state', () => {
  const activation: LaunchAdmission = { ...admission, purpose: 'activation' };
  const proof = { identity, endpoint: location.daemonEndpoint, sessionId: admission.sessionId, completionNonce: admission.completionNonce, candidateInventorySha256: admission.candidateInventorySha256 };
  const value = parseReadyEvidence(proof, location, activation);
  assert.deepEqual(value, proof); assert.equal(Object.isFrozen(value.identity), true); assert.equal(Object.isFrozen(value.endpoint), true);
  assert.throws(() => parseReadyEvidence(proof, location, admission));
  assert.throws(() => parseReadyEvidence(proof, location, { ...activation, installationId: 'other' }));
  for (const change of [{ identity: { ...identity, state: 'draining' } }, { identity: { ...identity, releaseId: 'other' } }, { endpoint: { ...location.daemonEndpoint, installationId: 'other' } }, { sessionId: 'old' }, { completionNonce: 'd'.repeat(64) }, { candidateInventorySha256: 'd'.repeat(64) }, { pid: 1 }]) {
    assert.throws(() => parseReadyEvidence({ ...proof, ...change }, location, activation));
  }
});
