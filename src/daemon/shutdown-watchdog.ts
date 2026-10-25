/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PATHS } from '../shared/paths.js';

export interface ShutdownWatchdog {
 readonly pid: number;
 stage(value: string): void;
 disarm(): void;
}
export interface WatchdogOptions {
 readonly timeoutMs: number;
 readonly logPath?: string | undefined;
 readonly readyTimeoutMs?: number | undefined;
 readonly helperPath?: string | undefined;
 readonly brokerPath?: string | undefined;
 readonly nodePath?: string | undefined;
 readonly onFailure?: ((error: Error) => void) | undefined;
}
/** Readiness means the independent helper has bound the original parent kernel capability. */
export function armShutdownWatchdog(options: WatchdogOptions): Promise<ShutdownWatchdog> {
 const helper = options.helperPath ?? fileURLToPath(new URL(`../bin/insrc-shutdown-watchdog.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url));
 const broker = options.brokerPath ?? fileURLToPath(new URL('../../out/bin/insrc-process-broker', import.meta.url));
 const bound = options.readyTimeoutMs ?? 2000;
 if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 0x7fff_ffff || !Number.isInteger(bound) || bound <= 0 || bound > 0x7fff_ffff) return Promise.reject(new Error('invalid watchdog duration/readiness bound'));
 return new Promise((resolve, reject) => {
  const child = fork(helper, [String(process.pid), String(options.timeoutMs), options.logPath ?? PATHS.daemonLog, broker], { execPath: options.nodePath ?? process.execPath, execArgv: helper.endsWith('.ts') ? ['--import', 'tsx/esm'] : [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  let settled = false, disposed = false;
  const fail = (reason: string): void => {
   if (disposed) return; disposed = true; clearTimeout(timer); child.kill('SIGKILL');
   const error = new Error(reason);
   if (settled) options.onFailure?.(error);
   else { settled = true; reject(error); }
  };
  const timer = setTimeout(() => fail('shutdown watchdog readiness timed out'), bound);
  child.once('error', error => fail('shutdown watchdog spawn failed: ' + error.message));
  child.once('exit', (code, signal) => fail(`shutdown watchdog exited ${settled ? 'after' : 'before'} readiness (${code ?? signal})`));
  child.on('message', (message: unknown) => {
   if (typeof message !== 'object' || message === null) { fail('invalid shutdown watchdog readiness'); return; }
   const value = message as { type?: string | undefined; reason?: string | undefined; pid?: number | undefined };
   if (value.type === 'failed') { fail(value.reason ?? 'shutdown watchdog failed'); return; }
   if (settled || value.type !== 'ready' || value.pid !== child.pid) { fail('invalid shutdown watchdog readiness'); return; }
   settled = true; clearTimeout(timer); child.unref(); child.channel?.unref();
   const send = (data: object): void => { if (child.connected) child.send(data, () => {}); };
   resolve({ pid: child.pid!, stage: stage => send({ type: 'stage', stage }), disarm: () => { disposed = true; send({ type: 'disarm' }); } });
  });
 });
}
