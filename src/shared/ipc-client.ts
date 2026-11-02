import { onUtf8Data } from './utf8-stream.js';
import { createConnection, type Socket } from 'node:net';
import type { IpcRequest, IpcResponse, IpcStreamMessage, DaemonStatus, DaemonUpdateResult, DaemonUpdateOutcome } from './types.js';
import { PATHS } from './paths.js';

// The single thin socket-client boundary shared by the CLI/TUI and the VS Code
// extension (Story E20260921ad0d45c9:S001, sc1 SharedIpcClient). This module owns
// exactly ONE daemon socket-client code path — the `rpc` fn moved here from
// src/cli/client.ts (which now re-exports it) — so no consumer mirrors the IPC
// contract, and no daemon internals / indexer / storage code enters the graph.
// Its only imports are node:net + the shared types + the shared paths (k5).

// The daemon IPC request/reply types + the real `DaemonStatus` are re-exported
// so downstream consumers import ONE client + ONE set of types (no parallel copies).
export type { IpcRequest, IpcResponse, DaemonStatus } from './types.js';

/** The daemon Unix-socket path (`~/.insrc/daemon.sock`). */
export const sockFilePath: string = PATHS.sockFile;

/**
 * The daemon's coarse reachability, DERIVED from a `daemon.status` call outcome.
 * The wire `DaemonStatus` carries no `running` field, so reachability is inferred:
 * a resolved status ⇒ 'running'; the "daemon is not running" throw ⇒ 'stopped';
 * any other failure ⇒ 'errored'.
 */
export type DaemonReachability = 'running' | 'stopped' | 'errored';

/**
 * The message `rpc` rejects with when the daemon socket is absent/refused
 * (ENOENT / ECONNREFUSED). Reachability classification keys off this prefix.
 */
const DAEMON_DOWN_PREFIX = 'daemon is not running';

let _nextId = 1;

/**
 * Send one JSON-RPC request to the daemon and return the result.
 * Throws if the daemon is not running or returns an error.
 *
 * `connect` is an injectable seam (defaults to the real Unix-socket
 * connection) so the request-write behaviour — including the Story-s4 client
 * identity envelope — can be unit-tested with a fake socket.
 *
 * Moved verbatim from src/cli/client.ts (which now re-exports it) so the CLI/TUI
 * and the extension share exactly one socket-client path.
 */
export async function rpc<T = unknown>(
  method: string,
  params: unknown = {},
  connect: () => Socket = () => createConnection(PATHS.sockFile),
  opts?: { readonly timeoutMs?: number | undefined; readonly closeAware?: boolean | undefined },
): Promise<T> {
  return new Promise<T>((resolveReply, rejectReply) => {
    const socket = connect();
    let   buffer = '';

    // Opt-in deadline (Story s3). Without `timeoutMs` (or `closeAware`) nothing below changes the
    // request: no timer, no extra listeners, no destroy. With `timeoutMs` the request also
    // rejects on the deadline and on the socket ending or closing before a reply, and the
    // socket is destroyed and the timer cleared on every outcome. `closeAware` (Story s10) is
    // the same end and close handling with NO timer: a long call, such as an approval that waits
    // on a person, is never cut short, but a daemon that goes away is not waited for either.
    const timeoutMs = opts?.timeoutMs;
    const watched = timeoutMs !== undefined || opts?.closeAware === true;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const settle = (fn: () => void): void => {
      if (!watched) { fn(); return; }
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      socket.destroy();
      fn();
    };
    const resolve = (v: T): void => settle(() => resolveReply(v));
    const reject = (e: Error): void => settle(() => rejectReply(e));

    if (watched) {
      if (timeoutMs !== undefined) timer = setTimeout(() => reject(new Error(`daemon did not reply within ${timeoutMs} ms (timeout)`)), timeoutMs);
      const closed = (): void => reject(new Error('daemon closed the connection before replying (closed)'));
      socket.on('end', closed);
      socket.on('close', closed);
    }

    socket.on('connect', () => {
      // Self-identify to the daemon's attached-client registry (Story s4).
      const req: IpcRequest = { id: _nextId++, method, params, client: { label: 'cli', pid: process.pid } };
      socket.write(JSON.stringify(req) + '\n');
    });

    onUtf8Data(socket, (decodedChunk, chunkBytes) => {
      buffer += decodedChunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const res = JSON.parse(line) as IpcResponse;
          socket.end();
          if (res.error) reject(new Error(res.error));
          else           resolve(res.result as T);
        } catch {
          socket.end();
          reject(new Error('invalid response from daemon'));
        }
      }
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        reject(new Error('daemon is not running — start it with: insrc daemon start'));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * The thin daemon client the extension (and any shared consumer) uses. Every
 * method reaches the daemon only through `rpc` over the local socket — there is
 * no cloud path and no daemon-internal code here (k2/k5).
 */
export interface IpcClient {
  /** One JSON-RPC round-trip to the daemon; rejects on daemon error / unreachable socket. */
  rpc<T = unknown>(method: string, params?: unknown): Promise<T>;
  /** The daemon's real status snapshot (via `daemon.status`); rejects when the daemon is down. */
  status(): Promise<DaemonStatus>;
  /** Coarse reachability, derived from a `daemon.status` outcome. Never throws. */
  reachability(): Promise<DaemonReachability>;
  /**
   * Ask the daemon to update AND restart itself (Story S001 / sc1). Resolves with
   * a launch acknowledgement ({ launched:true }); the daemon then restarts, so
   * the caller's socket drops and it must reconnect. The terminal result is read
   * back via {@link updateOutcome} after reconnect. Rejects (result.error) when an
   * update is already in progress or the daemon root/helper cannot be resolved.
   */
  update(): Promise<DaemonUpdateResult>;
  /** The last persisted daemon self-update outcome, or null when none exists. */
  updateOutcome(): Promise<DaemonUpdateOutcome | null>;
  /**
   * Open a stream method on the daemon and deliver every frame it pushes to `onFrame`.
   * Optional: a client that cannot stream (a test double) omits it, and only the modules
   * that subscribe (the approval prompts) check for it. `onClose` runs once when the stream
   * ends, with the error if it ended abnormally (the daemon went away).
   */
  stream?(method: string, params: unknown, onFrame: (frame: IpcStreamMessage) => void, onClose?: (err?: Error) => void): IpcStreamHandle;
}

/** An open stream. close() destroys the socket; the daemon's server then aborts the stream handler. */
export interface IpcStreamHandle { close(): void }

/**
 * Open a daemon stream: one request with `stream: true`, then newline-delimited frames until the
 * socket closes. Unlike `rpc` it does not end after the first line. Modelled on
 * src/mcp/daemon-stream.ts; `connect` is the same injectable seam.
 */
export function openStream(
  method:  string,
  params:  unknown,
  onFrame: (frame: IpcStreamMessage) => void,
  onClose?: (err?: Error) => void,
  connect: () => Socket = () => createConnection(PATHS.sockFile),
): IpcStreamHandle {
  const socket = connect();
  let buffer = '';
  let closed = false;
  const finish = (err?: Error): void => {
    if (closed) return;
    closed = true;
    socket.destroy();
    onClose?.(err);
  };

  socket.on('connect', () => {
    const req: IpcRequest = { id: _nextId++, method, params, stream: true, client: { label: 'cli', pid: process.pid } };
    socket.write(JSON.stringify(req) + '\n');
  });
  onUtf8Data(socket, (decodedChunk, chunkBytes) => {
    buffer += decodedChunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try { onFrame(JSON.parse(line) as IpcStreamMessage); } catch { /* a frame that is not JSON is dropped */ }
    }
  });
  socket.on('error', (err: NodeJS.ErrnoException) => {
    finish(err.code === 'ENOENT' || err.code === 'ECONNREFUSED' ? new Error('daemon is not running — start it with: insrc daemon start') : err);
  });
  socket.on('close', () => finish(closed ? undefined : new Error('daemon closed the stream')));
  return { close: () => { if (closed) return; closed = true; socket.destroy(); onClose?.(); } };
}

/**
 * Build an {@link IpcClient} over the shared `rpc`. `connect` is the same
 * injectable socket seam `rpc` takes, so the client is unit-testable with a
 * fake socket (no live daemon required).
 */
export function createIpcClient(connect?: () => Socket): IpcClient {
  const call = <T>(method: string, params?: unknown): Promise<T> =>
    connect === undefined ? rpc<T>(method, params) : rpc<T>(method, params, connect);

  return {
    rpc: call,
    status: () => call<DaemonStatus>('daemon.status'),
    reachability: async () => {
      try {
        await call<DaemonStatus>('daemon.status');
        return 'running';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return message.startsWith(DAEMON_DOWN_PREFIX) ? 'stopped' : 'errored';
      }
    },
    update: () => call<DaemonUpdateResult>('daemon.update'),
    updateOutcome: () => call<DaemonUpdateOutcome | null>('daemon.updateOutcome'),
    stream: (method, params, onFrame, onClose) => openStream(method, params, onFrame, onClose, connect),
  };
}

/** A connection-scoped client for protocols whose authority outlives one reply.
 * Cancellation closes this connection; callers must not share it across owners.
 */
export function createPersistentIpcClient(connect: () => Socket = () => createConnection(PATHS.sockFile)) {
 const socket = connect();
 let sequence = 0, buffer = '', closed = false;
 const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; detach(): void }>();
 const close = (error = new Error('daemon connection closed')): void => {
  if (closed) return;
  closed = true;
  for (const waiter of pending.values()) { waiter.detach(); waiter.reject(error); }
  pending.clear(); socket.destroy();
 };
 onUtf8Data(socket, chunk => {
  buffer += chunk;
  if (Buffer.byteLength(buffer) > 16 * 1024 * 1024) { close(new Error('daemon response exceeds limit')); return; }
  let newline: number;
  while ((newline = buffer.indexOf('\n')) >= 0) {
   const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
   if (!line.trim()) continue;
   let reply: { id?: number; error?: string; result?: unknown; stream?: string; data?: unknown };
   try { reply = JSON.parse(line); } catch { close(new Error('Invalid daemon response')); return; }
   const waiter = reply.id === undefined ? undefined : pending.get(reply.id);
   if (!waiter || reply.stream && !['done','error'].includes(reply.stream)) continue;
   pending.delete(reply.id!); waiter.detach();
   if (reply.error || reply.stream === 'error') waiter.reject(new Error(reply.error ?? JSON.stringify(reply.data)));
   else waiter.resolve(reply.stream === 'done' ? reply.data : reply.result);
  }
 });
 socket.on('error', error => close(error)); socket.on('close', () => close());
 return {
  get closed(): boolean { return closed; },
  close: () => close(),
  call<T>(method: string, params: unknown, opts: { signal?: AbortSignal | undefined; stream?: boolean | undefined } = {}): Promise<T> {
   if (closed) return Promise.reject(new Error('daemon connection closed; explicit review resume required'));
   if (opts.signal?.aborted) { close(new Error('Review request cancelled')); return Promise.reject(new Error('Review request cancelled')); }
   return new Promise<T>((resolve, reject) => {
    const id = ++sequence, abort = () => close(new Error('Review request cancelled'));
    opts.signal?.addEventListener('abort', abort, { once: true });
    pending.set(id, { resolve: value => resolve(value as T), reject, detach: () => opts.signal?.removeEventListener('abort', abort) });
    const request = { id, method, params, ...(opts.stream ? { stream: true } : {}), client: { label: 'mcp-review', pid: process.pid } };
    socket.write(JSON.stringify(request) + '\n', error => { if (error) close(error); });
   });
  },
 };
}
