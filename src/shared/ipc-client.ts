import { createConnection, type Socket } from 'node:net';
import type { IpcRequest, IpcResponse, DaemonStatus, DaemonUpdateResult, DaemonUpdateOutcome } from './types.js';
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
 * The connection to the daemon was lost after a request was written and before
 * its reply arrived (the daemon exited, restarted or dropped the socket). The
 * request may or may not have been carried out, so callers must not treat this
 * as a refusal; `cause` is the socket error when there was one.
 */
export class DaemonDisconnectedError extends Error {
  readonly code = 'disconnected';
  readonly method: string;
  constructor(method: string, cause?: unknown) {
    super(`the daemon closed the connection before answering ${method}`, cause !== undefined ? { cause } : undefined);
    this.name = 'DaemonDisconnectedError';
    this.method = method;
  }
}

/**
 * Send one JSON-RPC request to the daemon and return the result.
 * Throws if the daemon is not running or returns an error, and
 * DaemonDisconnectedError if the connection is lost after the request was
 * written and before a reply. The promise settles exactly once.
 *
 * `connect` is an injectable seam (defaults to the real Unix-socket
 * connection) so the request-write behaviour — including the Story-s4 client
 * identity envelope — can be unit-tested with a fake socket.
 *
 * Moved verbatim from src/cli/client.ts (which now re-exports it) so the CLI/TUI
 * and the extension share exactly one socket-client path.
 */
export async function rpc<T = unknown>(method: string, params: unknown = {}, connect: () => Socket = () => createConnection(PATHS.sockFile)): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const socket = connect();
    let   buffer = '';
    let   sent = false;
    let   settled = false;
    const settle = (fn: () => void): void => { if (!settled) { settled = true; fn(); } };

    socket.on('connect', () => {
      // Self-identify to the daemon's attached-client registry (Story s4).
      const req: IpcRequest = { id: _nextId++, method, params, client: { label: 'cli', pid: process.pid } };
      socket.write(JSON.stringify(req) + '\n');
      sent = true;
    });

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const res = JSON.parse(line) as IpcResponse;
          socket.end();
          if (res.error) settle(() => reject(new Error(res.error)));
          else           settle(() => resolve(res.result as T));
        } catch {
          socket.end();
          settle(() => reject(new Error('invalid response from daemon')));
        }
      }
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      if (sent) settle(() => reject(new DaemonDisconnectedError(method, err)));
      else if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        settle(() => reject(new Error('daemon is not running — start it with: insrc daemon start')));
      } else {
        settle(() => reject(err));
      }
    });

    // A connection that ends or closes with no reply would otherwise leave the promise pending forever.
    const lost = (): void => settle(() => reject(sent ? new DaemonDisconnectedError(method) : new Error(`the daemon closed the connection before ${method} was sent`)));
    socket.on('end', lost);
    socket.on('close', lost);
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
  };
}
