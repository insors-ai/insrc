import { createServer, type Server, type Socket } from 'node:net';
import { rmSync } from 'node:fs';
import type { IpcRequest, IpcResponse, IpcStreamMessage } from '../shared/types.js';
import { PATHS } from '../shared/paths.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('ipc');

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
export class IpcServer {
  private readonly handlers: RpcHandlers;
  private readonly streamHandlers: StreamHandlers;
  private server: Server | null = null;

  constructor(handlers: RpcHandlers, streamHandlers: StreamHandlers = {}) {
    this.handlers = handlers;
    this.streamHandlers = streamHandlers;
  }

  async listen(): Promise<void> {
    // Remove stale socket file if present
    try { rmSync(PATHS.sockFile); } catch { /* ignore */ }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket: Socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', reject);

      this.server.listen(PATHS.sockFile, () => {
        log.info(`listening on ${PATHS.sockFile}`);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) { resolve(); return; }
      this.server.close(() => resolve());
    });
    try { rmSync(PATHS.sockFile); } catch { /* ignore */ }
  }

  private handleConnection(socket: Socket): void {
    let buffer = '';

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
      const msg = err instanceof Error ? err.message : String(err);
      this.send(socket, { id: request.id, error: msg });
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
          const msg = err instanceof Error ? err.message : String(err);
          this.send(socket, { id: request.id, error: msg });
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
        socket.write(JSON.stringify(out) + '\n');
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
        const msg = err instanceof Error ? err.message : String(err);
        sendStream({ id: request.id, stream: 'error', data: { error: msg, recoverable: true } });
      }
    } finally {
      socket.removeListener('close', onClose);
      socket.removeListener('error', onError);
    }
  }

  private send(socket: Socket, response: IpcResponse): void {
    try {
      socket.write(JSON.stringify(response) + '\n');
    } catch { /* socket already closed */ }
  }
}
