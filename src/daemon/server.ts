import { createServer, type Server, type Socket } from 'node:net';
import { rmSync } from 'node:fs';
import type { AttachedClient, IpcRequest, IpcResponse, IpcStreamMessage } from '../shared/types.js';
import { PATHS } from '../shared/paths.js';
import { getLogger } from '../shared/logger.js';
import { LmdbStoreLocksLostError, recordStoreFailureIfLockError } from '../db/graph/store.js';

const log = getLogger('ipc');

/** Max accepted length for a self-reported client label (defence against a
 *  misbehaving/hostile client injecting an oversized string into the registry). */
const MAX_LABEL_LEN = 64;

/** Per-connection registry entry (Story s4). Mutable in place as the connection
 *  identifies itself; snapshotted into an AttachedClient by attachedClients(). */
interface ConnInfo {
  readonly id:          number;
  readonly connectedAt: number;
  label:                string;
  pid?:                 number;
  lastMethod?:          string;
}

/** Validate a self-reported IpcRequest.client envelope — untrusted wire input.
 *  Returns the well-formed {label,pid} or undefined if either field is bad. */
function validClient(client: IpcRequest['client']): { label: string; pid: number } | undefined {
  if (client === undefined || client === null) return undefined;
  const { label, pid } = client;
  if (typeof label !== 'string' || label.length === 0 || label.length > MAX_LABEL_LEN) return undefined;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return undefined;
  return { label, pid };
}

// ---------------------------------------------------------------------------
// Handler types
// ---------------------------------------------------------------------------

/** Standard request → response handler (existing). */
export type RpcHandler = (params: unknown) => Promise<unknown>;

/** Streaming handler — writes multiple messages, resolves when done. */
export type StreamHandler = (
  params: unknown,
  send: (msg: IpcStreamMessage) => void,
  signal: AbortSignal,
) => Promise<void>;

export type RpcHandlers = Record<string, RpcHandler>;
export type StreamHandlers = Record<string, StreamHandler>;

// ---------------------------------------------------------------------------
// IPC Server
// ---------------------------------------------------------------------------

/**
 * Unix socket JSON-RPC server.
 * Protocol: newline-delimited JSON.
 *
 * Standard mode: each request gets exactly one response.
 * Stream mode:   request with `"stream": true` gets multiple IpcStreamMessages
 *                until the handler resolves (stream:done) or throws (stream:error).
 *                Socket stays open for the duration.
 */
/**
 * Reduce a handler's error to the message sent to the client. Reads have no
 * wrapper in the store layer, so a read that fails because the store lost its
 * locks surfaces here as the library's raw error: it is recorded in the
 * store's health before it is reduced to text, and the client is answered
 * with the named error, whose message states the true cause.
 */
export function failureMessage(err: unknown, method: string): string {
  if (recordStoreFailureIfLockError(err, `request ${method}`)) {
    const named = err instanceof LmdbStoreLocksLostError ? err : new LmdbStoreLocksLostError(`request ${method}`, err);
    return `${named.name}: ${named.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export class IpcServer {
  private readonly handlers: RpcHandlers;
  private readonly streamHandlers: StreamHandlers;
  private server: Server | null = null;
  private readonly pendingWrites = new Set<Promise<boolean>>();
  private writeFailed = false;

  private writeLine(socket: Socket, line: string): void {
    let complete!: (ok: boolean) => void;
    const pending = new Promise<boolean>(resolve => { complete = resolve; });
    this.pendingWrites.add(pending);
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      socket.removeListener('close', failed);
      socket.removeListener('error', failed);
      this.pendingWrites.delete(pending);
      if (!ok) this.writeFailed = true;
      complete(ok);
    };
    const failed = (): void => finish(false);
    socket.once('close', failed);
    socket.once('error', failed);
    try { socket.write(line, error => finish(!error)); } catch { finish(false); }
  }

  async flushPendingWrites(timeoutMs = 1000): Promise<boolean> {
    const bounded = Math.max(0, Math.min(1000, timeoutMs));
    const deadline = Date.now() + bounded;
    while (this.pendingWrites.size > 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), remaining); });
      const flushed = await Promise.race([Promise.all([...this.pendingWrites]).then(results => results.every(Boolean)), expired]);
      if (timer) clearTimeout(timer);
      if (!flushed) return false;
    }
    return !this.writeFailed;
  }

  disconnectClients(): void {
    for (const socket of this.conns.keys()) socket.end();
  }

  /** In-memory registry of currently-attached socket connections (Story s4).
   *  Keyed by the live Socket; rebuilt purely from connect/message/close events,
   *  never persisted. Read out (read-only) by attachedClients() for the
   *  `daemon.debug-status` IPC. */
  private readonly conns = new Map<Socket, ConnInfo>();
  private connSeq = 0;
  private readonly now: () => number;

  constructor(handlers: RpcHandlers, streamHandlers: StreamHandlers = {}, now: () => number = Date.now, private readonly socketPath = PATHS.sockFile) {
    this.handlers = handlers;
    this.streamHandlers = streamHandlers;
    this.now = now;
  }

  /** Snapshot of the attached-client registry, sorted by connectedAt (Story s4).
   *  READ-ONLY observation — it never closes or mutates a connection (k5). */
  attachedClients(): AttachedClient[] {
    return [...this.conns.values()]
      .sort((a, b) => a.connectedAt - b.connectedAt)
      .map(c => ({
        id: c.id,
        label: c.label,
        connectedAt: c.connectedAt,
        ...(c.pid !== undefined ? { pid: c.pid } : {}),
        ...(c.lastMethod !== undefined ? { lastMethod: c.lastMethod } : {}),
      }));
  }

  async listen(): Promise<void> {
    // Remove stale socket file if present
    try { rmSync(this.socketPath); } catch { /* ignore */ }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket: Socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', reject);

      this.server.listen(this.socketPath, () => {
        log.info(`listening on ${this.socketPath}`);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) { resolve(); return; }
      this.server.close(() => resolve());
    });
    try { rmSync(this.socketPath); } catch { /* ignore */ }
  }

  private handleConnection(socket: Socket): void {
    let buffer = '';

    // Register the connection (Story s4) — 'unknown' until a message identifies it.
    this.conns.set(socket, { id: ++this.connSeq, connectedAt: this.now(), label: 'unknown' });
    socket.on('close', () => { this.conns.delete(socket); });

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        void this.handleMessage(trimmed, socket);
      }
    });

    socket.on('error', () => { /* client disconnected abruptly */ });
  }

  private async handleMessage(raw: string, socket: Socket): Promise<void> {
    let request: IpcRequest;
    try {
      request = JSON.parse(raw) as IpcRequest;
    } catch {
      this.send(socket, { id: -1, error: 'invalid JSON' });
      return;
    }

    // Update the connection registry from the (validated) client identity +
    // the method just invoked (Story s4). Untrusted wire input is validated
    // before it touches the registry; a bad envelope leaves the connection
    // 'unknown'/pid undefined.
    const conn = this.conns.get(socket);
    if (conn !== undefined) {
      if (typeof request.method === 'string') conn.lastMethod = request.method;
      const id = validClient(request.client);
      if (id !== undefined) { conn.label = id.label; conn.pid = id.pid; }
    }

    // Check for streaming request
    if (request.stream) {
      await this.handleStreamMessage(request, socket);
      return;
    }

    // Standard request → response
    const handler = this.handlers[request.method];
    if (!handler) {
      this.send(socket, { id: request.id, error: `unknown method: ${request.method}` });
      return;
    }

    try {
      const result = await handler(request.params);
      this.send(socket, { id: request.id, result });
    } catch (err) {
      this.send(socket, { id: request.id, error: failureMessage(err, request.method) });
    }
  }

  private async handleStreamMessage(request: IpcRequest, socket: Socket): Promise<void> {
    const handler = this.streamHandlers[request.method];
    if (!handler) {
      // Fall back to standard handler if no stream handler registered
      const stdHandler = this.handlers[request.method];
      if (stdHandler) {
        try {
          const result = await stdHandler(request.params);
          this.send(socket, { id: request.id, result });
        } catch (err) {
          this.send(socket, { id: request.id, error: failureMessage(err, request.method) });
        }
        return;
      }
      this.send(socket, { id: request.id, error: `unknown method: ${request.method}` });
      return;
    }

    // Set up abort controller for this streaming request
    const abortController = new AbortController();

    // Abort on socket close/error
    const onClose = (): void => { abortController.abort(); };
    const onError = (): void => { abortController.abort(); };
    socket.on('close', onClose);
    socket.on('error', onError);

    // Stream send function — writes IpcStreamMessage to socket
    // Always override msg.id with the request's id so the client can correlate
    const sendStream = (msg: IpcStreamMessage): void => {
      try {
        const out = { ...msg, id: request.id };
        this.writeLine(socket, JSON.stringify(out) + '\n');
      } catch {
        // Socket broken — abort the handler
        abortController.abort();
      }
    };

    try {
      await handler(request.params, sendStream, abortController.signal);
    } catch (err) {
      // Handler threw — send error stream message if socket is still writable
      if (!abortController.signal.aborted) {
        const msg = failureMessage(err, request.method);
        sendStream({ id: request.id, stream: 'error', data: { error: msg, recoverable: true } });
      }
    } finally {
      socket.removeListener('close', onClose);
      socket.removeListener('error', onError);
    }
  }

  private send(socket: Socket, response: IpcResponse): void {
    try {
      this.writeLine(socket, JSON.stringify(response) + '\n');
    } catch { /* socket already closed */ }
  }
}
