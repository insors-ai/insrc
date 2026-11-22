/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** Explicit --import prelude, so historical daemon entrypoints need no new startup implementation. */
import { Socket } from 'node:net';
import { isMainThread } from 'node:worker_threads';

// Worker threads inherit execArgv and fork() creates its own Node IPC channel.
// The barrier belongs solely to the native monitor's direct daemon child.
if (isMainThread && typeof process.send !== 'function') {
const token = process.env['INSRC_SOURCE_ACTOR_TOKEN'];
if (process.platform !== 'linux' || !token || !/^[a-f0-9]{64}$/.test(token)
 || process.pid !== Number(process.env['INSRC_SOURCE_ACTOR_ROOT_PID'])
 || process.ppid !== Number(process.env['INSRC_SOURCE_ACTOR_MONITOR_PID'])) throw new Error('Source startup requires an inherited Linux actor grant');
const channel = new Socket({ fd: 3, readable: true, writable: true });
let granted = false, committed = false, buffer = '';
await new Promise<void>((resolve, reject) => {
 const deadline = setTimeout(() => { channel.destroy(new Error('Source startup grant timed out')); }, 60_000);
 const fail = (error: Error) => {
  clearTimeout(deadline);
  if (!granted) reject(error);
  else if (!committed) process.kill(process.pid, 'SIGKILL');
 };
 channel.on('error', fail);
 channel.on('close', () => fail(new Error('Source startup owner closed the inherited channel')));
 channel.on('data', (bytes: Buffer) => {
  buffer += bytes.toString('utf8');
  if (buffer.length > 1024) { channel.destroy(new Error('Invalid source startup frame')); return; }
  for (;;) {
   const end = buffer.indexOf('\n'); if (end < 0) return;
   const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
   if (line === `GRANT ${token}` && !granted) {
    granted = true; clearTimeout(deadline); channel.unref(); resolve();
   } else if (line === `COMMIT ${token}` && granted && !committed) {
    committed = true; channel.destroy();
   } else { channel.destroy(new Error('Invalid or repeated source startup grant')); return; }
  }
 });
 channel.write(`WAITING ${token}\n`);
});
}
