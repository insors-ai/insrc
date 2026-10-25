/** Private inherited control pipe. It carries data delegation only, never caller arguments. */
import { Socket } from 'node:net';
import type { Readable } from 'node:stream';
import { parseSessionAttach, CONNECTION_SESSION_MAX_BYTES } from '../shared/connection-management-wire.js';
import type { SessionDataAttach } from '../shared/connection-management.js';
export const SESSION_BOOTSTRAP_FLAG = '--connection-session-pipe';
let required = false;
let current: { readonly token: Readonly<SessionDataAttach>; readonly controller: AbortController } | undefined;
export class SessionBootstrapError extends Error {
 readonly code = 'session-expired';
 constructor() { super('Connection session is unavailable.'); this.name = 'SessionBootstrapError'; }
}
function lost(): void { current?.controller.abort(); current = undefined; }
/** The parent keeps this pipe open for token refresh. EOF never falls back to saved execution. */
export function installPrivateSessionPipe(pipe: Readable): void {
 required = true; lost(); let buffer = ''; pipe.setEncoding('utf8');
 pipe.on('data', (chunk: string) => {
  buffer += chunk;
  if (Buffer.byteLength(buffer) > CONNECTION_SESSION_MAX_BYTES) { lost(); buffer = ''; pipe.destroy(); return; }
  for (;;) {
   const end = buffer.indexOf('\n'); if (end < 0) return;
   const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); lost();
   try { const token = parseSessionAttach(JSON.parse(line)); current = { token: Object.freeze({ ...token }), controller: new AbortController() }; }
   catch { /* Fixed refusal until a valid refresh; no token-bearing diagnostics. */ }
  }
 });
 pipe.on('error', lost); pipe.once('end', lost); pipe.once('close', lost);
}
/** The fixed flag marks required attachment, not authority; a missing pipe remains a refusal. */
export function initializePrivateSessionPipe(fd = 3): void {
 required = true;
 try { const pipe = new Socket({ fd, readable: true, writable: false }); pipe.unref(); installPrivateSessionPipe(pipe); }
 catch { lost(); }
}
export function privateSessionBootstrap(): { readonly token: Readonly<SessionDataAttach>; readonly signal: AbortSignal } | undefined {
 if (!required) return undefined;
 if (!current || current.controller.signal.aborted) throw new SessionBootstrapError();
 return Object.freeze({ token: current.token, signal: current.controller.signal });
}
