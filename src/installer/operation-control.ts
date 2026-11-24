import { chmodSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { InstallerError, MAX_CONTROL_BYTES } from './contracts.js';
import type { InstallationLocation, ManagerEvent, ManagerRequest } from './contracts.js';
import { inspectController, readPrivateControlRecord } from './controller-store.js';
import type { ControllerStore } from './controller-store.js';
import { assertLocalControlRoot, assertToken } from './location.js';
import { canonicalJson } from './release-descriptor.js';
import { parseInstaller, parseManagerRequest } from './schemas.js';
import { controlBinding } from './native.js';

const IO_MS = 3_000;
interface Discovery {
  protocolVersion: 1; installationId: string; operationId: string;
  ownerNonce: string; endpoint: string;
}
const unavailable = (): InstallerError => new InstallerError('escalation-unavailable', 'The matching operation owner is unavailable or uncertain; inspect and explicitly reconcile before recovery');
function endpoint(location: InstallationLocation, nonce: string): string {
  const suffix = Buffer.from(nonce.slice(0, 14), 'hex').toString('base64url');
  return location.daemonEndpoint.kind === 'unix' ? join(location.home, `c${suffix}`) : `${location.daemonEndpoint.address}-control-${nonce.slice(0, 24)}`;
}
function discovery(location: InstallationLocation, operationId: string): Discovery {
  assertToken(operationId); assertLocalControlRoot(location.home, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
  const value = readPrivateControlRecord(join(location.home, 'install/operations', operationId, 'control.json')) as Discovery;
  if (!value || Object.keys(value).sort().join(',') !== 'endpoint,installationId,operationId,ownerNonce,protocolVersion'
    || value.protocolVersion !== 1 || value.installationId !== location.installationId || value.operationId !== operationId
    || typeof value.ownerNonce !== 'string' || !/^[a-f0-9]{64}$/.test(value.ownerNonce) || value.endpoint !== endpoint(location, value.ownerNonce)) throw unavailable();
  return value;
}
function immediate(input: unknown, location: InstallationLocation): ManagerRequest {
  const request = parseManagerRequest(input);
  if (request.installationId !== location.installationId || request.action !== 'stop' || request.shutdownMode !== 'immediate') throw unavailable();
  return request;
}

/** A single bounded UTF-8 frame; connection loss is uncertainty, never exit evidence. */
function readFrame(socket: Socket, receive: (value: unknown) => void): void {
  let raw = '', bytes = 0, received = false;
  socket.setEncoding('utf8'); socket.setTimeout(IO_MS, () => socket.destroy());
  socket.on('error', () => {});
  socket.on('data', chunk => {
    if (received) { socket.destroy(); return; }
    bytes += Buffer.byteLength(chunk); if (bytes > MAX_CONTROL_BYTES) { socket.destroy(); return; }
    raw += chunk;
    const end = raw.indexOf('\n'); if (end < 0) return;
    received = true;
    try { if (raw.slice(end + 1).trim()) throw unavailable(); receive(JSON.parse(raw.slice(0, end)) as unknown); }
    catch { socket.destroy(); }
  });
}

/** Only the native-lock owner publishes discovery. Its private record is a
 * same-user capability: POSIX private modes / the inherited Windows user DACL
 * protect a fresh 256-bit owner nonce. No caller-supplied endpoint or PID is used. */
export async function openOperationControl(location: InstallationLocation, store: ControllerStore, operationId: string,
  ownerNonce: string, handle: (request: ManagerRequest) => Promise<ManagerEvent>): Promise<{ close(): Promise<void> }> {
  store.assertHeld();
  if (!/^[a-f0-9]{64}$/.test(ownerNonce)) throw unavailable();
  const record: Discovery = { protocolVersion: 1, installationId: location.installationId, operationId, ownerNonce, endpoint: endpoint(location, ownerNonce) };
  const sockets = new Set<Socket>(); let closing = false;
  const server = createServer(socket => {
    if (closing || sockets.size >= 32) { socket.destroy(); return; }
    const deadline = setTimeout(() => socket.destroy(), IO_MS);
    sockets.add(socket); socket.once('close', () => { clearTimeout(deadline); sockets.delete(socket); });
    readFrame(socket, input => {
      void (async () => {
        const message = input as { owner?: unknown; request?: unknown };
        store.assertHeld();
        if (closing || !message || canonicalJson(message.owner) !== canonicalJson(record)
          || canonicalJson(store.readOperationData(operationId, 'control')) !== canonicalJson(record)) throw unavailable();
        const request = immediate(message.request, location);
        if (request.operationId !== operationId) throw unavailable();
        const event = await handle(request);
        const reply = JSON.stringify({ ownerNonce, operationId, event }) + '\n';
        if (Buffer.byteLength(reply) > MAX_CONTROL_BYTES) throw unavailable();
        socket.end(reply);
      })().catch(() => { if (!socket.destroyed) socket.end(JSON.stringify({ error: 'escalation-unavailable' }) + '\n'); });
    });
  });
  server.on('error', () => {});
  const close = async (): Promise<void> => {
    if (closing) return; closing = true;
    // Stop new admission. Existing replies may flush; each connection has its
    // own bounded I/O deadline. This does not release the controller lease.
    await new Promise<void>(resolve => server.close(() => resolve()));
  };
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(record.endpoint, () => { server.off('error', reject); resolve(); }); });
    if (location.daemonEndpoint.kind === 'unix') chmodSync(record.endpoint, 0o600);
    store.assertHeld(); store.writeOperationData(operationId, 'control', record, true);
    return { close };
  } catch (error) { for (const socket of sockets) socket.destroy(); await close(); throw error; }
}

/** Forward before lock admission. Never acquires a lease or writes a snapshot,
 * and never treats a missing endpoint, timeout or free lock as recovery proof. */
export async function forwardImmediate(location: InstallationLocation, input: unknown): Promise<ManagerEvent> {
  const request = immediate(input, location);
  let owner: Discovery;
  try {
    const inspected = inspectController(location);
    if (inspected.kind !== 'present' || inspected.snapshot.operation?.phase !== 'quiescing' || inspected.snapshot.operation.operationId !== request.operationId) throw unavailable();
    owner = discovery(location, request.operationId);
  } catch { throw unavailable(); }
  return new Promise((resolve, reject) => {
    const socket = createConnection(owner.endpoint); let settled = false;
    const finish = (event?: ManagerEvent): void => {
      if (settled) return; settled = true; clearTimeout(deadline); socket.destroy();
      if (event) resolve(event); else reject(unavailable());
    };
    const deadline = setTimeout(() => finish(), IO_MS);
    socket.once('error', () => finish()); socket.once('close', () => finish());
    readFrame(socket, raw => {
      try {
        const reply = raw as { ownerNonce?: unknown; operationId?: unknown; event?: unknown };
        if (!reply || reply.ownerNonce !== owner.ownerNonce || reply.operationId !== request.operationId || canonicalJson(discovery(location, request.operationId)) !== canonicalJson(owner)) throw unavailable();
        const event = parseInstaller('managerEvent', reply.event);
        if (event.operationId !== request.operationId) throw unavailable();
        finish(event);
      } catch { finish(); }
    });
    socket.once('connect', () => socket.write(JSON.stringify({ owner, request }) + '\n'));
  });
}
