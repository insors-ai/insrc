/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** Bundled at build time with the shared Node-only capability client; no storage imports. */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { captureStopTarget } from '../shared/daemon-process-client.js';
import type { StopTarget } from '../shared/daemon-process-client.js';

const parent = Number(process.argv[2]), deadline = Number(process.argv[3]);
const logPath = process.argv[4], executable = process.argv[5];
if (!Number.isSafeInteger(parent) || parent <= 0 || process.ppid !== parent || !Number.isSafeInteger(deadline) || !logPath || !executable) process.exit(2);
let stage = 'watchdog capture', finished = false, checking = false;
let target: StopTarget | undefined;
const cancellation = new AbortController();
function diagnostic(reason: string): void {
 try { mkdirSync(dirname(logPath!), { recursive: true }); appendFileSync(logPath!, JSON.stringify({ time: new Date().toISOString(), module: 'shutdown-watchdog', pid: parent, deadline, stage, reason }) + '\n'); } catch { /* fs unavailable */ }
}
function finish(code = 0): void {
 if (finished) return;
 finished = true; cancellation.abort();
 void (async () => { try { await target?.handle.close(); } finally { process.exit(code); } })();
}
/** IPC is advisory after capability capture: transport loss cannot disarm the deadline. */
function send(message: object): Promise<boolean> {
 return new Promise(resolve => {
  if (!process.connected || !process.send) { resolve(false); return; }
  try { process.send(message, error => { resolve(!error); }); }
  catch { resolve(false); }
 });
}
async function fail(reason: string): Promise<void> {
 if (finished) return;
 diagnostic(reason); await send({ type: 'failed', reason }); finish(1);
}
process.on('disconnect', () => { if (process.ppid !== parent) finish(); });
process.on('message', (message: unknown) => {
 if (typeof message !== 'object' || message === null) return;
 const value = message as { type?: string | undefined; stage?: string | undefined };
 if (value.type === 'disarm') finish();
 else if (value.type === 'stage' && typeof value.stage === 'string') stage = value.stage.slice(0, 1000);
});
void (async () => {
 try {
  target = await captureStopTarget(parent, { executable, signal: cancellation.signal, readyTimeoutMs: 1000, requestTimeoutMs: 1000 });
  if (!target || finished || process.ppid !== parent) { finish(); return; }
  if (!(await send({ type: 'ready', pid: process.pid }))) stage = 'capability captured; parent IPC unavailable';
  const timer = setInterval(() => {
   if (finished || checking) return;
   if (process.ppid !== parent) { clearInterval(timer); finish(); return; }
   if (Date.now() < deadline) return;
   checking = true;
   void (async () => {
    if (await target!.handle.hasExited() || process.ppid !== parent) { finish(); return; }
    diagnostic('shutdown deadline exceeded; terminating retained parent capability');
    if (process.ppid !== parent) { finish(); return; }
    await target!.handle.terminate(); finish();
   })().catch(error => { void fail(error instanceof Error ? error.message : String(error)); });
  }, 20);
 } catch (error) { await fail('broker capture failed: ' + (error instanceof Error ? error.message : String(error))); }
})();
