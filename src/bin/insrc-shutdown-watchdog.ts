/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** Independent of daemon/native storage imports: this process must survive a blocked parent. */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { TextDecoder } from 'node:util';

const parent = Number(process.argv[2]), deadline = Number(process.argv[3]);
const logPath = process.argv[4], executable = process.argv[5];
if (!Number.isSafeInteger(parent) || parent <= 0 || process.ppid !== parent || !Number.isSafeInteger(deadline) || !logPath || !executable || !process.send) process.exit(2);
let stage = 'watchdog capture', ready = false, finished = false, buffer = '', requestId = 0;
let pending: { id: number; resolve: (value: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
const broker = spawn(executable, [String(parent)], { stdio: ['pipe', 'pipe', 'ignore'] });
function diagnostic(reason: string): void {
 try { mkdirSync(dirname(logPath!), { recursive: true }); appendFileSync(logPath!, JSON.stringify({ time: new Date().toISOString(), module: 'shutdown-watchdog', pid: parent, deadline, stage, reason }) + '\n'); } catch { /* fs unavailable */ }
}
function finish(code = 0): void {
 if (finished) return; finished = true;
 if (pending) { clearTimeout(pending.timer); pending.reject(new Error('watchdog finished')); pending = undefined; }
 broker.stdin.end();
 // Only our broker child is killed here; the daemon is addressed solely by its kernel capability.
 const timer = setTimeout(() => { broker.kill('SIGKILL'); process.exit(code); }, 100);
 broker.once('exit', () => { clearTimeout(timer); process.exit(code); });
}
function fail(reason: string): void { diagnostic(reason); if (process.connected) process.send?.({ type: 'failed', reason }); finish(1); }
function request(operation: 'STATE' | 'TERM'): Promise<string> {
 if (pending) return Promise.reject(new Error('overlapping broker request'));
 return new Promise((resolve, reject) => {
  const id = ++requestId;
  const timer = setTimeout(() => { pending = undefined; reject(new Error('broker request timeout')); }, 1000);
  pending = { id, resolve, reject, timer }; broker.stdin.write(`${id} ${operation}\n`);
 });
}
function line(value: string): void {
 if (!ready) {
  const match = /^READY 1 ([1-9]\d*) ([0-9a-f]+) ([0-9a-f]+)$/.exec(value);
  if (!match || Number(match[1]) !== parent || match[2]!.length % 2 || match[3]!.length % 2) { fail('broker refused readiness: ' + value); return; }
  try {
   const decoder = new TextDecoder('utf-8', { fatal: true });
   const marker = decoder.decode(Buffer.from(match[2]!, 'hex')), command = decoder.decode(Buffer.from(match[3]!, 'hex'));
   if (!/^(linux|darwin):[^\s\0]+$/.test(marker) || command.includes('\0') || !/\/daemon\/index\.(js|ts)$/.test(command) || process.ppid !== parent) throw new Error('invalid parent capability');
  } catch { fail('unverifiable broker parent identity'); return; }
  ready = true; process.send?.({ type: 'ready', pid: process.pid }); return;
 }
 const reply = /^([1-9]\d*) (ALIVE|EXITED|SENT)$/.exec(value);
 if (!pending || !reply || Number(reply[1]) !== pending.id) { fail('invalid broker reply'); return; }
 const p = pending; pending = undefined; clearTimeout(p.timer); p.resolve(reply[2]!);
}
broker.stdout.setEncoding('utf8');
broker.stdout.on('data', (chunk: string) => {
 buffer += chunk;
 if (buffer.length > 256 * 1024) { fail('oversized broker output'); return; }
 let end: number; while (!finished && (end = buffer.indexOf('\n')) >= 0) { const value = buffer.slice(0, end); buffer = buffer.slice(end + 1); line(value); }
});
broker.on('error', error => fail('broker spawn failed: ' + error.message));
broker.on('exit', () => { if (!finished) fail('broker exited unexpectedly'); });
process.on('disconnect', () => finish());
process.on('message', (message: unknown) => {
 if (typeof message !== 'object' || message === null) return;
 const value = message as { type?: string; stage?: string };
 if (value.type === 'disarm') finish();
 else if (value.type === 'stage' && typeof value.stage === 'string') stage = value.stage.slice(0, 1000);
});
let checking = false;
setInterval(() => {
 if (finished || checking) return;
 if (process.ppid !== parent) { finish(); return; }
 if (!ready || Date.now() < deadline) return;
 checking = true;
 void (async () => {
  if (process.ppid !== parent) { finish(); return; }
  const state = await request('STATE');
  if (state === 'EXITED' || process.ppid !== parent) { finish(); return; }
  if (state !== 'ALIVE') throw new Error('invalid state response');
  diagnostic('shutdown deadline exceeded; terminating retained parent capability');
  if (process.ppid !== parent) { finish(); return; }
  const result = await request('TERM');
  if (result !== 'SENT' && result !== 'EXITED') throw new Error('invalid termination response');
  finish();
 })().catch(error => fail(error instanceof Error ? error.message : String(error)));
}, 20);
