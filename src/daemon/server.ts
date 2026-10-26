import { connectionExecutionErrorCode, currentStepContext } from '../shared/step-context.js';
import { createServer, type Server, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { TrustedRpcContext } from './request-context.js';
import { RequestLifetime } from './request-context.js';
import { rmSync } from 'node:fs';
import type { AttachedClient, IpcRequest, IpcResponse, IpcStreamMessage } from '../shared/types.js';
import { PATHS } from '../shared/paths.js';
import { getLogger } from '../shared/logger.js';
import { LmdbStoreLocksLostError, recordStoreFailureIfLockError } from '../db/graph/store.js';
import type { FrameEnvelope, ReplyEnvelope, LocalRequestEnvelope } from './threads/channel.js';

const log = getLogger('ipc');

/** Max accepted length for a self-reported client label (defence against a
 *  misbehaving/hostile client injecting an oversized string into the registry). */
const MAX_LABEL_LEN = 64;

/** Per-connection registry entry (Story s4). Mutable in place as the connection
 *  identifies itself; snapshotted into an AttachedClient by attachedClients(). */
interface ConnInfo {
  readonly id:          number;
  readonly connectedAt: number;
  readonly controller: AbortController;
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
export type RpcHandler = (params: unknown, context?: TrustedRpcContext | undefined) => Promise<unknown>;

/** Streaming handler — writes multiple messages, resolves when done. */
export type StreamHandler = (
  params: unknown,
  send: (msg: IpcStreamMessage) => void,
  signal: AbortSignal,
  context?: TrustedRpcContext | undefined,
) => Promise<void>;

export type RpcHandlers = Record<string, RpcHandler>;
export type StreamHandlers = Record<string, StreamHandler>;

/** Writes one reply or stream frame of a forwarded request to its socket, in today's wire shape. */
export type DeliverEnvelope = (envelope: ReplyEnvelope | FrameEnvelope) => void;
/**
 * Hands one parsed request to whatever serves it (Epic 86197ac6, Story s2):
 * directDispatch in this thread, or the router. Returns the function the server
 * calls when the request's socket closes: a stream request is aborted; a unary
 * request runs on and its late reply is dropped.
 */
export type ForwardRequest = (request: LocalRequestEnvelope, deliver: DeliverEnvelope) => () => void;

/**
 * The in-thread forward: today's dispatch rules over a pair of handler tables.
 * An unknown method is answered 'unknown method: X'; a stream request for a
 * method with only a unary handler gets that handler's one reply; a handler's
 * error is reduced by failureMessage; a stream handler that throws after its
 * request was cancelled sends nothing more.
 */
export function directDispatch(handlers: RpcHandlers, streamHandlers: StreamHandlers = {}): ForwardRequest {
  return (request, deliver) => {
    const { requestId, method } = request;
		const privateReply = !!request.trustedContext?.connectionSession || request.trustedContext?.connectionExecution?.mode === 'session-memory';
    const streamHandler = request.stream ? streamHandlers[method] : undefined;
    if (streamHandler === undefined) {
      const lifetime = request.lifetime;
      const finish = (reply: ReplyEnvelope): void => {
        try { deliver(reply); } finally { lifetime?.complete(); }
      };
      const handler = handlers[method];
      if (!handler) {
				finish({ kind: 'reply', requestId, error: privateReply ? 'unsupported-temporary' : `unknown method: ${method}` });
        return () => {};
      }
      let running: Promise<unknown>;
      const context = request.trustedContext ? Object.freeze({ ...request.trustedContext, ...(lifetime ? { signal: lifetime.signal, registerDrain: lifetime.registerDrain, assertRequestActive: lifetime.assertActive } : {}) }) : undefined;
      try { running = Promise.resolve(handler(request.params, context)); } catch (err) { running = Promise.reject(err); }
      void running.then(
				result => finish({ kind: 'reply', requestId, result: privateReply ? privateFailureResult(result) : result }),
				err => finish({ kind: 'reply', requestId, error: failureMessage(err, method, request.trustedContext) }),
      ).catch(() => { /* Delivery failure cannot strand internal completion. */ });
      return () => lifetime?.abort();
    }
    const lifetime = request.lifetime;
    const abortController = new AbortController();
    const signals = [abortController.signal, lifetime?.signal, request.trustedContext?.connectionSignal,
      request.trustedContext?.connectionSession?.signal, request.trustedContext?.connectionExecution?.lifetime.signal,
      request.trustedContext?.signal].filter((signal): signal is AbortSignal => signal !== undefined);
    const signal = AbortSignal.any(signals);
    const context = request.trustedContext ? Object.freeze({ ...request.trustedContext, signal,
      ...(lifetime ? { registerDrain: lifetime.registerDrain, assertRequestActive: lifetime.assertActive } : {}) }) : undefined;
    let terminal = false;
    const send = (msg: IpcStreamMessage): void => {
      if (terminal || signal.aborted) return;
      if (msg.stream === 'done' || msg.stream === 'error') terminal = true;
			const frame = !privateReply ? msg : msg.stream === 'progress' ? { id: msg.id, stream: 'progress', data: { kind: 'info', message: 'Temporary analysis is running.' } } : msg.stream === 'error' ? { id: msg.id, stream: 'error', data: { error: 'unsupported-temporary', recoverable: false } } : msg.stream === 'done' ? { id: msg.id, stream: 'done', data: {} } : { ...msg, data: privateFailureResult(msg.data) };
			try { deliver({ kind: 'frame', requestId, frame }); }
      catch (error) { abortController.abort(); lifetime?.abort(); throw error; }
    };
    let running: Promise<void>;
    try { running = Promise.resolve(streamHandler(request.params, send, signal, context)); } catch (err) { running = Promise.reject(err); }
    void running.catch(err => {
      if (!signal.aborted && !terminal) {
				send({ id: 0, stream: 'error', data: { error: failureMessage(err, method, request.trustedContext), recoverable: !(request.trustedContext?.connectionSession || request.trustedContext?.connectionExecution?.mode === 'session-memory') } });
      }
    }).finally(() => lifetime?.complete()).catch(() => { /* Delivery failure must still complete the admitted lifetime. */ });
    return () => { abortController.abort(); lifetime?.abort(); };
  };
}

/** Only failure envelopes are projected. Successful owner-authorized results
 * stay on the workbench data channel; unverified channels are refused earlier.
 * Inspect discriminators as data descriptors, never source/error accessors. */
function privateFailureResult(value: unknown): unknown {
	const failure = { code: 'unsupported-temporary', message: 'Temporary connection operation failed.' };
	try {
		if (value !== null && typeof value === 'object') {
			if (Object.getOwnPropertyDescriptor(value, 'ok')?.value === false) return { ok: false, error: failure };
			if (Object.getOwnPropertyDescriptor(value, 'success')?.value === false) return { output: failure.message, format: 'text', success: false, error: failure.message };
		}
		return value;
	} catch { return { ok: false, error: failure }; }
}

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
export function failureMessage(err: unknown, method: string, context?: TrustedRpcContext): string {
	if (context?.connectionSession || context?.connectionExecution?.mode === 'session-memory' || currentStepContext()?.connectionExecution?.mode === 'session-memory') return connectionExecutionErrorCode(err) ?? 'unsupported-temporary';
  if (recordStoreFailureIfLockError(err, `request ${method}`)) {
    const named = err instanceof LmdbStoreLocksLostError ? err : new LmdbStoreLocksLostError(`request ${method}`, err);
    return `${named.name}: ${named.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export class IpcServer {
  private server: Server | null = null;
  private readonly pendingWrites = new Set<Promise<boolean>>();
  private writeFailed = false;

  private writeLine(socket: Socket, line: string, onFailure?: () => void): void {
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
      if (!ok) {
        this.writeFailed = true;
        try { onFailure?.(); } catch { /* Cancellation failure cannot strand write completion. */ }
      }
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
  private requestSeq = 0;
  private readonly daemonEpoch = randomUUID();
  private readonly now: () => number;
  /** In-flight requests per open connection: requestId -> the cancel function forward() returned. */
  private readonly inflight = new Map<Socket, Map<string, () => void>>();
  private registryListener: ((clients: AttachedClient[]) => void) | undefined;
  private connectionCloseListener: ((context: TrustedRpcContext) => void) | undefined;

  constructor(private readonly forward: ForwardRequest, now: () => number = Date.now, private readonly socketPath = PATHS.sockFile) {
    this.now = now;
  }

  /**
   * Called with attachedClients() whenever the registry changes: on connect,
   * on close, and after each message updates it, before the request is
   * forwarded (so a debug-status caller sees its own lastMethod).
   */
  onRegistryChange(listener: (clients: AttachedClient[]) => void): void {
    this.registryListener = listener;
  }

  onConnectionClose(listener: (context: TrustedRpcContext) => void): void { this.connectionCloseListener = listener; }

  private connectionContext(conn: ConnInfo): TrustedRpcContext {
    return Object.freeze({ connectionIdentity: `${this.daemonEpoch}:${conn.id}`, daemonEpoch: this.daemonEpoch, connectionSignal: conn.controller.signal });
  }

  private registryChanged(): void {
    this.registryListener?.(this.attachedClients());
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
    const conn: ConnInfo = { id: ++this.connSeq, connectedAt: this.now(), label: 'unknown', controller: new AbortController() };
    this.conns.set(socket, conn);
    this.inflight.set(socket, new Map());
    socket.on('close', () => {
      this.conns.delete(socket);
      // Cancel what is still running for this socket: streams abort, unary replies are dropped.
      const running = this.inflight.get(socket);
      this.inflight.delete(socket);
      conn.controller.abort();
      try { this.connectionCloseListener?.(this.connectionContext(conn)); } catch { /* No private context in diagnostics. */ }
      for (const cancel of running?.values() ?? []) cancel();
      this.registryChanged();
    });
    this.registryChanged();

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

  /** Serve one line; the promise settles when the request ends (its reply, its stream's done/error frame, or its socket's close). */
  private handleMessage(raw: string, socket: Socket): Promise<void> {
    let request: IpcRequest;
    try {
      request = JSON.parse(raw) as IpcRequest;
    } catch {
      this.send(socket, { id: -1, error: 'invalid JSON' });
      return Promise.resolve();
    }

    // Update the connection registry from the (validated) client identity +
    // the method just invoked (Story s4). Untrusted wire input is validated
    // before it touches the registry; a bad envelope leaves the connection
    // 'unknown'/pid undefined.
    const conn = this.conns.get(socket);
    if (conn === undefined) return Promise.resolve();
    const client = validClient(request.client);
    if (conn !== undefined) {
      if (typeof request.method === 'string') conn.lastMethod = request.method;
      if (client !== undefined) { conn.label = client.label; conn.pid = client.pid; }
    }
    this.registryChanged();

    const running = this.inflight.get(socket);
    const requestId = String(++this.requestSeq);
    const lifetime = new RequestLifetime();
    let ended = false;
    let settle!: () => void;
    const settled = new Promise<void>(resolve => { settle = resolve; });
    let cancel: () => void = () => {};
    const end = (): void => { ended = true; settle(); };
    // A terminal frame ends delivery; socket cancellation remains live through actual cleanup.
    void Promise.all([lifetime.completed, lifetime.drained]).then(() => { running?.delete(requestId); settle(); });
    const deliver: DeliverEnvelope = (envelope) => {
      // The socket closed: the reply or frame is dropped, as a write to a closed socket was.
      if (ended || !this.inflight.has(socket)) return;
      if (envelope.kind === 'reply') {
        end();
        this.send(socket, envelope.error !== undefined ? { id: request.id, error: envelope.error } : { id: request.id, result: envelope.result });
        return;
      }
      // Always override the frame's id with the request's id so the client can correlate.
      const frame = { ...(envelope.frame as IpcStreamMessage), id: request.id };
      if (frame.stream === 'done' || frame.stream === 'error') end();
      try {
        this.writeLine(socket, JSON.stringify(frame) + '\n', () => { lifetime.abort(); cancel(); });
      } catch {
        // Serialization or delivery failure cancels work without releasing its drains.
        lifetime.abort(); cancel();
      }
    };
    try { cancel = this.forward({
      kind: 'request', requestId, method: request.method, params: request.params, stream: request.stream === true,
      ...(client !== undefined ? { session: client } : {}),
      trustedContext: this.connectionContext(conn),
      ...(lifetime ? { lifetime } : {}),
    }, deliver); }
    catch (error) {
			try { deliver({ kind: 'reply', requestId, error: failureMessage(error, request.method, this.connectionContext(conn)) }); }
      finally { lifetime?.complete(); }
    }
    // Remember it until it ends or its socket closes (unless it was answered already).
    if (running !== undefined && this.inflight.has(socket)) running.set(requestId, () => { lifetime.abort(); cancel(); settle(); });
    else if (!ended) settle();
    return settled;
  }

  private send(socket: Socket, response: IpcResponse): void {
    try {
      this.writeLine(socket, JSON.stringify(response) + '\n');
    } catch { /* socket already closed */ }
  }
}
