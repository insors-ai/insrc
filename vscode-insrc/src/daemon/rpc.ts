/**
 * JSON-RPC client over Unix domain socket.
 *
 * Connects to the insrc daemon at ~/.insrc/daemon.sock and provides
 * a typed call() method for all daemon RPC methods.
 */

import * as net from 'node:net';
import * as path from 'node:path';
import * as os from 'node:os';

const SOCKET_PATH = path.join(os.homedir(), '.insrc', 'daemon.sock');
const DEFAULT_TIMEOUT = 30_000;

export interface RpcClient {
  /** Call a daemon RPC method. Throws on timeout or connection error. */
  call<T = unknown>(method: string, params?: unknown): Promise<T>;
  /** Check if the socket is connected. */
  isConnected(): boolean;
  /** Disconnect from the daemon. */
  disconnect(): void;
}

/**
 * Create a JSON-RPC client connected to the daemon socket.
 * Each call() opens a new connection, sends the request, reads the response,
 * and closes. This avoids managing persistent connection state.
 */
export function createRpcClient(socketPath: string = SOCKET_PATH): RpcClient {
  let connected = false;

  return {
    async call<T = unknown>(method: string, params: unknown = {}): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const socket = net.createConnection(socketPath);
        let data = '';
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error(`RPC timeout: ${method} (${DEFAULT_TIMEOUT}ms)`));
        }, DEFAULT_TIMEOUT);

        socket.on('connect', () => {
          connected = true;
          const request = JSON.stringify({ method, params }) + '\n';
          socket.write(request);
        });

        socket.on('data', (chunk) => {
          data += chunk.toString();
          // Look for complete JSON response (newline-delimited)
          const newlineIdx = data.indexOf('\n');
          if (newlineIdx >= 0) {
            clearTimeout(timer);
            const responseStr = data.slice(0, newlineIdx);
            socket.destroy();
            try {
              const response = JSON.parse(responseStr) as { result?: T; error?: string };
              if (response.error) {
                reject(new Error(`RPC error: ${response.error}`));
              } else {
                resolve(response.result as T);
              }
            } catch (err) {
              reject(new Error(`RPC parse error: ${String(err)}`));
            }
          }
        });

        socket.on('error', (err) => {
          clearTimeout(timer);
          connected = false;
          reject(new Error(`RPC connection error: ${err.message}`));
        });

        socket.on('close', () => {
          connected = false;
        });
      });
    },

    isConnected(): boolean {
      return connected;
    },

    disconnect(): void {
      connected = false;
    },
  };
}

/**
 * Try to connect to the daemon socket. Returns true if connection succeeds.
 */
export async function tryConnect(socketPath: string = SOCKET_PATH): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection(socketPath);
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 2000);

    socket.on('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export { SOCKET_PATH };
