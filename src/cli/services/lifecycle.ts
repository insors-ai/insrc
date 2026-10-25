/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon process-lifecycle waits, mirroring `scripts/daemon-ctl.sh`'s
 * pid+socket polling. Kept dependency-free so both the daemon service
 * and the maintenance service can share them without an import cycle.
 *
 * "Stopped" requires the retained original process to have exited. "Ready" = pid file + socket present and
 * the pid is alive (covers ONNX cold-boot, which can take ~30 s+).
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';

import { PATHS } from '../../shared/paths.js';
import { captureStopTarget } from '../../shared/daemon-process-client.js';
import type { StopTarget } from '../../shared/daemon-process-client.js';
import { acquireRunFileGuard, removeOwnedRunFile, runFileIdentity, sameRunFile } from '../../shared/daemon-run-files.js';
import type { RunFileIdentity } from '../../shared/daemon-run-files.js';
import { readProcessIdentity } from '../../shared/daemon-process.js';

/** The managed daemon's pid from PATHS.pidFile — undefined if absent/non-numeric.
 *  Exported so the debug service (Story s3) excludes the managed daemon from the
 *  orphan scan/kill using the SAME read rather than duplicating pidfile parsing. */
export function pidFromFile(): number | undefined {
	if (!existsSync(PATHS.pidFile)) return undefined;
	try {
		const pid = Number(readFileSync(PATHS.pidFile, 'utf8').trim());
		return Number.isInteger(pid) && pid > 0 ? pid : undefined;
	} catch { return undefined; }
}

function pidAlive(pid: number): boolean {
	return readProcessIdentity(pid) !== undefined;
}

/** True when the daemon pid file references a live process. */
export function isRunning(): boolean {
	const pid = pidFromFile();
	return pid !== undefined && pidAlive(pid);
}

export interface CapturedDaemon {
 readonly target: StopTarget | undefined;
 readonly pidFile: RunFileIdentity | undefined;
 readonly socketFile: RunFileIdentity | undefined;
}
const capturedTargets = new WeakMap<StopTarget, CapturedDaemon>();
function matches(path: string, expected: RunFileIdentity | undefined): void {
 const current = runFileIdentity(path);
 if (current && (!expected || !sameRunFile(current, expected))) throw new Error(`run-file ownership conflict: replacement at ${path}; restart withheld`);
}
/** Capture before RPC under the same guard used by publishers; never reacquire a PID later. */
export async function captureDaemon(): Promise<CapturedDaemon> {
 mkdirSync(PATHS.insrc, { recursive: true });
 const guard = acquireRunFileGuard(PATHS.daemonRunGuard);
 let target: StopTarget | undefined;
 try {
  const pidFile = runFileIdentity(PATHS.pidFile), socketFile = runFileIdentity(PATHS.sockFile);
  const pid = pidFromFile();
  if (pidFile && pid === undefined) throw new Error('run-file ownership conflict: invalid PID file; restart withheld');
  if (!pidFile && socketFile) throw new Error('run-file ownership conflict: socket has no PID owner; restart withheld');
  if (pid !== undefined) target = await captureStopTarget(pid);
  matches(PATHS.pidFile, pidFile); matches(PATHS.sockFile, socketFile);
  const captured = { target, pidFile, socketFile };
  if (target) capturedTargets.set(target, captured);
  return captured;
 } catch (error) { await target?.handle.close(); throw error; }
 finally {
  try { guard.release(); } catch (error) { await target?.handle.close(); throw error; }
 }
}
/** Only after positive kernel-handle exit; no orphan guard is reclaimed. */
export function cleanupStoppedDaemon(captured: CapturedDaemon): void {
 const guard = acquireRunFileGuard(PATHS.daemonRunGuard);
 try {
  matches(PATHS.pidFile, captured.pidFile); matches(PATHS.sockFile, captured.socketFile);
  removeOwnedRunFile(PATHS.pidFile, captured.pidFile, guard);
  removeOwnedRunFile(PATHS.sockFile, captured.socketFile, guard);
 } finally { guard.release(); }
}
/** Poll the retained capability. Missing paths never stand in for process exit. */
export async function waitForStop(timeoutMs = 30_000, target?: StopTarget): Promise<boolean> {
 const captured = target ? capturedTargets.get(target) : await captureDaemon();
 const ownsHandle = target === undefined;
 const observed = target ?? captured?.target;
 try {
  if (!observed) { if (captured) cleanupStoppedDaemon(captured); return true; }
  const deadline = Date.now() + timeoutMs;
  do {
   if (await observed.handle.hasExited()) {
    // A foreign target carries no authority over current paths. Only absence
    // is safe without the original publication evidence.
    cleanupStoppedDaemon(captured ?? { target: observed, pidFile: undefined, socketFile: undefined });
    return true;
   }
   if (Date.now() >= deadline) return false;
   await sleep(Math.min(100, Math.max(0, deadline - Date.now())));
  } while (true);
 } finally { if (ownsHandle) await captured?.target?.handle.close(); }
}

/** Wait until the daemon accepted startup (pid file + socket present
 *  and pid alive). Returns the pid, or undefined on timeout. */
export async function waitForReady(timeoutMs = 60_000): Promise<number | undefined> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const pid = pidFromFile();
		if (pid !== undefined && existsSync(PATHS.sockFile) && pidAlive(pid)) return pid;
		await sleep(500);
	}
	return undefined;
}

function sleep(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}
