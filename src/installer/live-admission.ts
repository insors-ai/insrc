/** S4-only, single-session launch rendezvous. The manager's assertion stays local. */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { InstallerError, MAX_CONTROL_BYTES } from './contracts.js';
import type { InstallationLocation } from './contracts.js';
import { DaemonDataLease } from './daemon-data-lease.js';
import { parseLaunchAdmission } from './lifecycle-evidence.js';
import { assertPrivateLifecycleRoot } from './lifecycle-root.js';
import type { LaunchAdmission } from './peer-contracts.js';

const IO_MS = 3_000;
const barriers = ['spawn', 'lease', 'stores'] as const;
export type LaunchBarrier = typeof barriers[number];
/** Private capability passed over the wrapper/child channel, never logs/argv. */
export interface LiveAdmissionReference {
  protocolVersion: 1; installationId: string; sessionId: string; endpoint: string; capability: string;
}
export interface LiveAdmissionOwner { reference: LiveAdmissionReference; close(): Promise<void> }
const unavailable = (): InstallerError => new InstallerError('admission-unavailable', 'The exact live launch admission is unavailable or uncertain; do not open stores or retry the session automatically');
function endpoint(location: InstallationLocation, capability: string): string {
  const suffix = Buffer.from(capability.slice(0, 14), 'hex').toString('base64url');
  const address = location.daemonEndpoint.kind === 'unix' ? join(location.home, `a${suffix}`) : `${location.daemonEndpoint.address}-admission-${capability.slice(0, 24)}`;
  if (location.daemonEndpoint.kind === 'unix' && Buffer.byteLength(address) > (process.platform === 'darwin' ? 103 : 107)) throw unavailable();
  return address;
}
function shape(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== keys.length || !keys.every(k => Object.hasOwn(input, k))) throw unavailable();
  return input as Record<string, unknown>;
}
function secret(input: unknown): input is string { return typeof input === 'string' && /^[a-f0-9]{64}$/.test(input); }
function sameSecret(left: unknown, right: string): boolean {
  return secret(left) && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
function reference(input: unknown, location: InstallationLocation, admission: LaunchAdmission): LiveAdmissionReference {
  const value = shape(input, ['protocolVersion', 'installationId', 'sessionId', 'endpoint', 'capability']);
  if (value['protocolVersion'] !== 1 || value['installationId'] !== location.installationId || value['sessionId'] !== admission.sessionId
    || !secret(value['capability']) || value['endpoint'] !== endpoint(location, value['capability'])) throw unavailable();
  return Object.freeze({ protocolVersion: 1, installationId: location.installationId, sessionId: admission.sessionId, endpoint: value['endpoint'] as string, capability: value['capability'] });
}
/** One bounded frame and one absolute I/O deadline, including slow senders. */
function receive(socket: Socket, onFrame: (value: unknown) => void, fail: () => void): void {
  let raw = '', bytes = 0, received = false;
  const timer = setTimeout(fail, IO_MS);
  socket.once('close', () => { clearTimeout(timer); fail(); }); socket.on('error', fail);
  socket.setEncoding('utf8');
  socket.on('data', chunk => {
    if (received) { fail(); return; }
    bytes += Buffer.byteLength(chunk); if (bytes > MAX_CONTROL_BYTES) { fail(); return; }
    raw += chunk;
    const end = raw.indexOf('\n'); if (end < 0) return;
    received = true;
    try { if (raw.slice(end + 1).trim()) throw unavailable(); onFrame(JSON.parse(raw.slice(0, end)) as unknown); }
    catch { fail(); }
  });
}

export async function openLiveAdmission(location: InstallationLocation, input: LaunchAdmission, assertLiveOwner: () => void,
  signal?: AbortSignal): Promise<LiveAdmissionOwner> {
  const selected = structuredClone(location), admission = parseLaunchAdmission(input, selected, input);
  assertPrivateLifecycleRoot(selected); assertLiveOwner();
  if (signal?.aborted) throw unavailable();
  const capability = randomBytes(32).toString('hex');
  const ref = reference({ protocolVersion: 1, installationId: selected.installationId, sessionId: admission.sessionId, endpoint: endpoint(selected, capability), capability }, selected, admission);
  const sockets = new Set<Socket>(); let closing = false, nextBarrier = 0, closePromise: Promise<void> | undefined;
  const server = createServer(socket => {
    if (closing || signal?.aborted || sockets.size >= 32) { socket.destroy(); return; }
    sockets.add(socket); socket.once('close', () => sockets.delete(socket));
    receive(socket, raw => {
      const message = shape(raw, ['protocolVersion', 'capability', 'admission', 'barrier', 'challenge']);
      if (closing || signal?.aborted || message['protocolVersion'] !== 1 || !sameSecret(message['capability'], capability)
        || !secret(message['challenge']) || nextBarrier >= barriers.length || message['barrier'] !== barriers[nextBarrier]) throw unavailable();
      parseLaunchAdmission(message['admission'], selected, admission);
      assertPrivateLifecycleRoot(selected);
      // Synchronous, fresh callback owns all controller/phase/revision checks.
      // Commit this one-use grant before sending it; failed delivery is uncertain.
      assertLiveOwner(); if (signal?.aborted) throw unavailable();
      nextBarrier++;
      socket.end(JSON.stringify({ protocolVersion: 1, granted: true, barrier: message['barrier'], sessionId: admission.sessionId, challenge: message['challenge'] }) + '\n');
    }, () => socket.destroy());
  });
  server.on('error', () => {});
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closing = true; signal?.removeEventListener('abort', aborted);
    for (const socket of sockets) socket.destroy();
    closePromise = new Promise<void>(resolve => server.close(() => resolve())); return closePromise;
  };
  const aborted = (): void => { void close(); };
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(ref.endpoint, () => { server.off('error', reject); resolve(); }); });
    // If cancellation happened during listen, the check below closes this now
    // bound server. Never cache a not-listening close before listen completes.
    signal?.addEventListener('abort', aborted, { once: true });
    if (selected.daemonEndpoint.kind === 'unix') chmodSync(ref.endpoint, 0o600);
    assertPrivateLifecycleRoot(selected); assertLiveOwner();
    if (closing || signal?.aborted) throw unavailable();
    return { reference: ref, close };
  } catch (error) { await close(); throw error; }
}

async function requestGrant(location: InstallationLocation, input: LaunchAdmission, wireReference: LiveAdmissionReference,
  barrier: LaunchBarrier, signal?: AbortSignal): Promise<void> {
  const selected = structuredClone(location), admission = parseLaunchAdmission(input, selected, input);
  assertPrivateLifecycleRoot(selected);
  const ref = reference(wireReference, selected, admission);
  if (!barriers.includes(barrier) || signal?.aborted) throw unavailable();
  const challenge = randomBytes(32).toString('hex');
  const frame = JSON.stringify({ protocolVersion: 1, capability: ref.capability, admission, barrier, challenge }) + '\n';
  if (Buffer.byteLength(frame) > MAX_CONTROL_BYTES) throw unavailable();
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const socket = createConnection(ref.endpoint);
    const finish = (ok = false): void => {
      if (settled) return; settled = true; signal?.removeEventListener('abort', aborted); socket.destroy();
      if (ok) resolve(); else reject(unavailable());
    };
    const aborted = (): void => finish();
    signal?.addEventListener('abort', aborted, { once: true });
    receive(socket, raw => {
      const value = shape(raw, ['protocolVersion', 'granted', 'barrier', 'sessionId', 'challenge']);
      if (signal?.aborted || value['protocolVersion'] !== 1 || value['granted'] !== true || value['barrier'] !== barrier
        || value['sessionId'] !== admission.sessionId || !sameSecret(value['challenge'], challenge)) throw unavailable();
      finish(true);
    }, () => finish());
    socket.once('connect', () => { if (signal?.aborted) finish(); else socket.write(frame); });
  });
}

export async function authorizeLiveAdmission(location: InstallationLocation, admission: LaunchAdmission, ref: LiveAdmissionReference,
  barrier: 'spawn' | 'lease', signal?: AbortSignal): Promise<void> {
  if (barrier !== 'spawn' && barrier !== 'lease') throw unavailable();
  await requestGrant(location, admission, ref, barrier, signal);
}
/** A store grant also requires this process's actual retained native lease. */
export async function authorizeStoreAdmission(location: InstallationLocation, admission: LaunchAdmission, ref: LiveAdmissionReference,
  lease: DaemonDataLease, signal?: AbortSignal): Promise<void> {
  if (!(lease instanceof DaemonDataLease)) throw unavailable();
  lease.assertHeldFor(location);
  await requestGrant(location, admission, ref, 'stores', signal);
  lease.assertHeldFor(location);
}
