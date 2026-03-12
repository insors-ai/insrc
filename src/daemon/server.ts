import { createServer, type Server, type Socket } from 'node:net';
import { rmSync } from 'node:fs';
import type { IpcRequest, IpcResponse } from '../shared/types.js';
import { PATHS } from '../shared/paths.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('ipc');

export type RpcHandlers = Record<
  string,
  (params: unknown) => Promise<unknown>
>;

/**
 * Unix socket JSON-RPC server.
 * Protocol: newline-delimited JSON.
 * Each request gets exactly one response.
 */
export class IpcServer {
  private readonly handlers: RpcHandlers;
  private server: Server | null = null;

  constructor(handlers: RpcHandlers) {
    this.handlers = handlers;
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

  private send(socket: Socket, response: IpcResponse): void {
    try {
      socket.write(JSON.stringify(response) + '\n');
    } catch { /* socket already closed */ }
  }
}
