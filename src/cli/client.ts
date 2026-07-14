import { createConnection } from 'node:net';
import type { IpcRequest, IpcResponse } from '../shared/types.js';
import { PATHS } from '../shared/paths.js';

let _nextId = 1;

/**
 * Send one JSON-RPC request to the daemon and return the result.
 * Throws if the daemon is not running or returns an error.
 */
export async function rpc<T = unknown>(method: string, params: unknown = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const socket = createConnection(PATHS.sockFile);
    let   buffer = '';

    socket.on('connect', () => {
      const req: IpcRequest = { id: _nextId++, method, params };
      socket.write(JSON.stringify(req) + '\n');
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
