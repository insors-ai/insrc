import { once } from 'node:events';
import { createConnection } from 'node:net';
/** Private test socket client; bootstrap capabilities never enter settings or environment. */
export async function sessionRpcClient(path: string) {
 const socket = createConnection(path); await once(socket, 'connect'); let sequence = 0, buffer = '';
 const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
 socket.on('data', chunk => {
  buffer += chunk.toString();
  for (;;) {
   const end = buffer.indexOf('\n'); if (end < 0) break;
   const reply = JSON.parse(buffer.slice(0, end)) as { id: number; result?: unknown; error?: string }; buffer = buffer.slice(end + 1);
   const call = pending.get(reply.id); pending.delete(reply.id); if (reply.error) call?.reject(new Error(reply.error)); else call?.resolve(reply.result);
  }
 });
 socket.on('error', () => {}); socket.on('close', () => { for (const call of pending.values()) call.reject(new Error('test socket closed')); pending.clear(); });
 return {
  call<T = unknown>(method: string, params: unknown = {}): Promise<T> {
   return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve: value => resolve(value as T), reject }); socket.write(JSON.stringify({ id, method, params, client: { label: 'same-forged-label', pid: 11 } }) + '\n'); });
  },
  async close() { if (socket.destroyed) return; const closed = once(socket, 'close'); socket.destroy(); await closed; },
 };
}
